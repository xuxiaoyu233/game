import type {
  ActivityDefinition,
  ActivityRate,
  ActivityOutputRate,
  ActiveBuff,
  MaterialAmount,
  OfflinePlan,
  SkillDefinition,
  SkillLoopDefinition,
  SkillLoopId,
  SkillLoopState,
  SkillLoopSummary,
  ToolDefinition,
} from './types';
import {
  MASTERY_CHECKPOINT_SPEED_PERMILLE,
  MASTERY_CHECKPOINT_XP_PERMILLE,
  getMasteryCheckpointIndex,
  getMasteryCoefficientPermille,
  getMasteryPoolLimit,
} from './mastery';

/**
 * Read-only projections over the same rules the engine runs: effective cycle duration, hourly
 * throughput, time-to-next-level and offline planning. Everything here is derived from state plus
 * versioned content; nothing is stored, and the engine calls the very same duration formula, so a
 * displayed rate can never drift from what actually happens.
 */

const PERMILLE = 1_000;
const HOUR_MS = 3_600_000;

/** Seconds in an hour / milliseconds, used to convert per-cycle output into per-hour output. */
const CYCLES_PER_HOUR = HOUR_MS;

/**
 * Hard ceiling for the offline settlement window. Level bonuses can never push the window past
 * one day, no matter how many skills contribute; fuel still extends beyond the capped window.
 */
export const OFFLINE_WINDOW_CAP_MS = 24 * HOUR_MS;

function findSkill(definition: SkillLoopDefinition, skillId: string): SkillDefinition | undefined {
  return definition.skills.find((candidate) => candidate.id === skillId);
}

function findTool(definition: SkillLoopDefinition, skillId: string): ToolDefinition | undefined {
  return definition.tools.find((candidate) => candidate.skillId === skillId);
}

function findActivity(
  definition: SkillLoopDefinition,
  activityId: string,
): ActivityDefinition | undefined {
  return definition.activities.find((candidate) => candidate.id === activityId);
}

/** The one level rule: highest threshold whose XP requirement is met, capped by content depth. */
export function getLevelFromXp(skill: SkillDefinition, xp: number): number {
  let level = 1;
  for (const threshold of skill.levels) {
    if (xp < threshold.xpRequired) break;
    level = threshold.level;
  }
  return Math.min(level, skill.levels.at(-1)?.level ?? 1);
}

export function getSkillLevel(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  skillId: string,
): number {
  const skill = findSkill(definition, skillId);
  if (skill === undefined) return 1;
  return getLevelFromXp(skill, state.skillXp[skillId] ?? 0);
}

/** Sum of every levelled global speed effect currently in force (agility and future support skills). */
export function getGlobalSpeedMultiplier(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
): number {
  let bonus = PERMILLE;
  for (const skill of definition.skills) {
    const level = getLevelFromXp(skill, state.skillXp[skill.id] ?? 0);
    const effect = skill.levels.find((threshold) => threshold.level === level)?.effect;
    if (effect?.globalSpeedBonusPermille !== undefined)
      bonus += effect.globalSpeedBonusPermille - PERMILLE;
  }
  return bonus;
}

/**
 * Sum of every levelled global XP effect currently in force (herbalism and future support
 * skills). Like the speed multiplier it takes each skill's current level value and adds across
 * skills; content restates values on later levels to keep them in force.
 */
export function getGlobalXpMultiplier(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
): number {
  let bonus = PERMILLE;
  for (const skill of definition.skills) {
    const level = getLevelFromXp(skill, state.skillXp[skill.id] ?? 0);
    const effect = skill.levels.find((threshold) => threshold.level === level)?.effect;
    if (effect?.globalXpBonusPermille !== undefined)
      bonus += effect.globalXpBonusPermille - PERMILLE;
  }
  return bonus;
}

/** Sum of every levelled offline cap bonus currently in force (farming and future support skills). */
export function getOfflineCapBonusMs(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
): number {
  let bonus = 0;
  for (const skill of definition.skills) {
    const level = getLevelFromXp(skill, state.skillXp[skill.id] ?? 0);
    const effect = skill.levels.find((threshold) => threshold.level === level)?.effect;
    if (effect?.offlineCapBonusMs !== undefined) bonus += effect.offlineCapBonusMs;
  }
  return bonus;
}

/**
 * The offline window this save can settle without fuel: the content base cap plus the levelled
 * bonus, clamped at 24h. The engine, the offline plan and the return receipt all call this one
 * function, so a displayed window can never disagree with the settled one.
 */
export function getOfflineCapMs(state: SkillLoopState, definition: SkillLoopDefinition): number {
  const extended = definition.maxOfflineMs + getOfflineCapBonusMs(state, definition);
  return Math.min(extended, OFFLINE_WINDOW_CAP_MS);
}

function getToolMultiplier(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  skillId: string,
): number {
  const tool = findTool(definition, skillId);
  if (tool === undefined) return PERMILLE;
  const level = tool.levels.find((candidate) => candidate.level === state.toolLevels[tool.id]);
  return level?.durationMultiplierPermille ?? PERMILLE;
}

function getActiveBuff(state: SkillLoopState): ActiveBuff | null {
  return state.buffs?.[0] ?? null;
}

/* ===================== Mastery projections (content 8.0.0, schema 4) =====================
   Mastery is per activity, the pool is per skill, and every number below is derived from state
   plus the shared curve: a save never stores a mastery level, a checkpoint flag or a pool
   percentage. Schema 3 states (frozen migration sources) simply have no mastery fields, and
   every projection degrades to a neutral multiplier there. */

function hasMasteryState(state: SkillLoopState): boolean {
  return state.masteryXp !== undefined && state.masteryPool !== undefined;
}

/** Mastery level of one activity: the owning skill's XP curve read with the activity's mastery XP. */
export function getMasteryLevel(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activityId: SkillLoopId,
): number {
  if (!hasMasteryState(state)) return 1;
  const activity = findActivity(definition, activityId);
  const skill = activity === undefined ? undefined : findSkill(definition, activity.skillId);
  if (activity === undefined || skill === undefined) return 1;
  return getLevelFromXp(skill, state.masteryXp?.[activityId] ?? 0);
}

export interface MasteryPoolProjection {
  readonly skillId: SkillLoopId;
  readonly xp: number;
  readonly limit: number;
  /** Floor of xp/limit in permille, clamped at 1000. */
  readonly fillPermille: number;
  /** Highest checkpoint tier in force, or -1 when none is. */
  readonly checkpointIndex: number;
  /** Duration multiplier of the engaged tier (tool convention: below 1000 shortens). */
  readonly speedMultiplierPermille: number;
  /** XP multiplier of the engaged tier (consumable convention: above 1000 grants more). */
  readonly xpMultiplierPermille: number;
}

/** Pool fill and engaged checkpoint tier for one skill; null on schema 3 states. */
export function getMasteryPool(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  skillId: SkillLoopId,
): MasteryPoolProjection | null {
  if (!hasMasteryState(state)) return null;
  const skill = findSkill(definition, skillId);
  if (skill === undefined) return null;
  const activityCount = definition.activities.filter(
    (activity) => activity.skillId === skillId,
  ).length;
  const limit = getMasteryPoolLimit(activityCount);
  const xp = state.masteryPool?.[skillId] ?? 0;
  const fillPermille = limit > 0 ? Math.min(1_000, Math.floor((xp / limit) * 1_000)) : 0;
  const checkpointIndex = getMasteryCheckpointIndex(fillPermille);
  const speedMultiplierPermille =
    checkpointIndex >= 0
      ? (MASTERY_CHECKPOINT_SPEED_PERMILLE[checkpointIndex] ?? PERMILLE)
      : PERMILLE;
  const xpMultiplierPermille =
    checkpointIndex >= 0 ? (MASTERY_CHECKPOINT_XP_PERMILLE[checkpointIndex] ?? PERMILLE) : PERMILLE;
  return {
    skillId,
    xp,
    limit,
    fillPermille,
    checkpointIndex,
    speedMultiplierPermille,
    xpMultiplierPermille,
  };
}

/** Duration multiplier from the owning skill's engaged mastery checkpoint (tool convention). */
export function getMasterySpeedMultiplier(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activity: ActivityDefinition,
): number {
  if (!hasMasteryState(state)) return PERMILLE;
  return getMasteryPool(state, definition, activity.skillId)?.speedMultiplierPermille ?? PERMILLE;
}

/** XP multiplier from the owning skill's engaged mastery checkpoint (consumable convention). */
export function getMasteryXpMultiplier(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activity: ActivityDefinition,
): number {
  if (!hasMasteryState(state)) return PERMILLE;
  return getMasteryPool(state, definition, activity.skillId)?.xpMultiplierPermille ?? PERMILLE;
}

export interface MasteryProgress {
  readonly activityId: SkillLoopId;
  readonly skillId: SkillLoopId;
  readonly level: number;
  readonly xp: number;
  readonly xpForNextLevel: number | null;
  readonly xpCeiling: number;
  readonly atCap: boolean;
  /** Mastery XP the next completed cycle would earn at the current mastery level. */
  readonly xpPerCycle: number;
}

/** Per-activity mastery readout for the activity list; null on schema 3 states. */
export function getMasteryProgress(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activityId: SkillLoopId,
): MasteryProgress | null {
  if (!hasMasteryState(state)) return null;
  const activity = findActivity(definition, activityId);
  const skill = activity === undefined ? undefined : findSkill(definition, activity.skillId);
  if (activity === undefined || skill === undefined) return null;
  const xp = state.masteryXp?.[activityId] ?? 0;
  const level = getLevelFromXp(skill, xp);
  const ceiling = skill.levels.at(-1)?.xpRequired ?? 0;
  const nextThreshold =
    skill.levels.find((threshold) => threshold.level === level + 1)?.xpRequired ?? null;
  return {
    activityId,
    skillId: skill.id,
    level,
    xp,
    xpForNextLevel: nextThreshold,
    xpCeiling: ceiling,
    atCap: xp >= ceiling,
    xpPerCycle: Math.max(
      1,
      Math.round((activity.xpPerCycle * getMasteryCoefficientPermille(level)) / PERMILLE),
    ),
  };
}

/**
 * Effective duration of one cycle: base duration scaled by tool, consumable buff, levelled
 * global bonuses and the owning skill's engaged mastery checkpoint, rounded up to whole
 * milliseconds. `buffActive` mirrors the engine's rule that a cycle keeps the duration captured
 * when it started.
 */
export function getEffectiveCycleMs(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activity: ActivityDefinition,
  buffActive = true,
): number {
  const toolMultiplier = getToolMultiplier(state, definition, activity.skillId);
  const buffMultiplier = buffActive
    ? (getActiveBuff(state)?.speedMultiplierPermille ?? PERMILLE)
    : PERMILLE;
  const globalMultiplier = getGlobalSpeedMultiplier(state, definition);
  const masteryMultiplier = getMasterySpeedMultiplier(state, definition, activity);
  const scaled =
    (activity.durationMs * toolMultiplier * buffMultiplier * globalMultiplier * masteryMultiplier) /
    (PERMILLE * PERMILLE * PERMILLE * PERMILLE);
  if (!Number.isSafeInteger(Math.ceil(scaled)) || scaled <= 0)
    throw new RangeError(`Activity duration exceeds numeric limits: ${activity.id}`);
  return Math.ceil(scaled);
}

/**
 * XP granted by one completed cycle under the consumable buff, the levelled global XP bonus and
 * the owning skill's engaged mastery checkpoint. The engine calls this same function, so the
 * displayed XP can never drift from what a cycle actually pays; the global bonus is content 7.0.0
 * and the mastery checkpoint is content 8.0.0.
 */
export function getXpPerCycle(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activity: ActivityDefinition,
): number {
  const buff = getActiveBuff(state)?.xpMultiplierPermille ?? PERMILLE;
  const global = getGlobalXpMultiplier(state, definition);
  const mastery = getMasteryXpMultiplier(state, definition, activity);
  return Math.max(
    1,
    Math.round((activity.xpPerCycle * buff * global * mastery) / (PERMILLE * PERMILLE * PERMILLE)),
  );
}

export function getActivityInputs(
  activity: ActivityDefinition,
  definition: SkillLoopDefinition,
): readonly MaterialAmount[] {
  if (activity.kind === 'gather') return [];
  return definition.recipes.find((recipe) => recipe.id === activity.recipeId)?.inputs ?? [];
}

export function getActivityOutputs(
  activity: ActivityDefinition,
  definition: SkillLoopDefinition,
): readonly MaterialAmount[] {
  if (activity.kind === 'gather') return activity.outputs;
  return definition.recipes.find((recipe) => recipe.id === activity.recipeId)?.outputs ?? [];
}

/** Whole cycles a craft activity can still afford from current stock. Gather activities are unbounded. */
export function getAffordableCycles(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activity: ActivityDefinition,
): number {
  const inputs = getActivityInputs(activity, definition);
  if (inputs.length === 0) return Number.MAX_SAFE_INTEGER;
  let limit = Number.MAX_SAFE_INTEGER;
  for (const input of inputs) {
    const available = state.inventory[input.itemId] ?? 0;
    const cycles = Math.floor(available / input.amount);
    if (cycles < limit) limit = cycles;
  }
  return Math.max(0, limit);
}

/**
 * Hourly projection for one activity at the current state. `null` when the activity is unknown.
 * Per-hour figures may be fractional; they describe a rate, not a stored quantity.
 */
export function getActivityRate(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activityId: string,
): ActivityRate | null {
  const activity = findActivity(definition, activityId);
  if (activity === undefined) return null;
  const cycleDurationMs = getEffectiveCycleMs(state, definition, activity);
  const cyclesPerHour = CYCLES_PER_HOUR / cycleDurationMs;
  const perHour = (materials: readonly MaterialAmount[]): readonly ActivityOutputRate[] =>
    materials.map((material) => ({
      itemId: material.itemId,
      amountPerHour: material.amount * cyclesPerHour,
    }));
  return {
    activityId: activity.id,
    skillId: activity.skillId,
    cycleDurationMs,
    cyclesPerHour,
    outputsPerHour: perHour(getActivityOutputs(activity, definition)),
    inputsPerHour: perHour(getActivityInputs(activity, definition)),
    xpPerHour: getXpPerCycle(state, definition, activity) * cyclesPerHour,
  };
}

/**
 * Time until the next level if the given activity keeps running. `null` when the skill is already
 * at its content ceiling (or the inputs cannot sustain a single cycle).
 */
export function getSkillEtaMs(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  summary: SkillLoopSummary,
  activityId: string,
): number | null {
  const activity = findActivity(definition, activityId);
  if (activity === undefined) return null;
  const progress = summary.skills[activity.skillId];
  if (progress === undefined || progress.xpForNextLevel === null) return null;
  const remainingXp = progress.xpForNextLevel - progress.xp;
  if (remainingXp <= 0) return null;
  const xpPerCycle = getXpPerCycle(state, definition, activity);
  if (xpPerCycle <= 0) return null;
  const cycles = Math.ceil(remainingXp / xpPerCycle);
  // A craft activity also needs stock to sustain those cycles.
  const affordable = getAffordableCycles(state, definition, activity);
  if (affordable < cycles) return null;
  return cycles * getEffectiveCycleMs(state, definition, activity);
}

/**
 * What the current activity would yield during an absence: the offline window (base cap plus the
 * levelled bonus), the window reachable with the charcoal actually in stock, and the projection
 * for that window.
 */
export function getOfflinePlan(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
): OfflinePlan {
  const fuel = definition.offlineFuel;
  const owned = fuel === undefined ? 0 : (state.inventory[fuel.itemId] ?? 0);
  const spendable =
    fuel === undefined ? 0 : Math.min(owned, Math.floor(fuel.maxExtensionMs / fuel.extensionMs));
  const extensionMs = fuel === undefined ? 0 : spendable * fuel.extensionMs;
  // The level bonus is part of the base window, so fuel still extends beyond it exactly as before.
  const baseWindowMs = getOfflineCapMs(state, definition);
  const offlineCapBonusMs = getOfflineCapBonusMs(state, definition);
  const maxWindowMs = baseWindowMs + extensionMs;

  const current = state.currentActivity;
  const activity =
    current === null || current.status !== 'running'
      ? undefined
      : findActivity(definition, current.activityId);
  if (activity === undefined) {
    return {
      fuelItemId: fuel?.itemId ?? null,
      fuelExtensionMs: fuel?.extensionMs ?? 0,
      fuelMaxExtensionMs: fuel?.maxExtensionMs ?? 0,
      fuelUnitsOwned: owned,
      fuelUnitsSpendable: spendable,
      baseWindowMs,
      maxWindowMs,
      offlineCapBonusMs,
      projectedCycles: 0,
      projectedOutputs: [],
      projectedXp: 0,
    };
  }

  const cycleDurationMs = getEffectiveCycleMs(state, definition, activity);
  const byTime = Math.floor(maxWindowMs / cycleDurationMs);
  const cycles = Math.min(byTime, getAffordableCycles(state, definition, activity));
  const projectedOutputs = getActivityOutputs(activity, definition).map((material) => ({
    itemId: material.itemId,
    amount: material.amount * cycles,
  }));
  const progress = state.skillXp[activity.skillId] ?? 0;
  const ceiling = findSkill(definition, activity.skillId)?.levels.at(-1)?.xpRequired ?? 0;
  const rawXp = cycles * getXpPerCycle(state, definition, activity);
  return {
    fuelItemId: fuel?.itemId ?? null,
    fuelExtensionMs: fuel?.extensionMs ?? 0,
    fuelMaxExtensionMs: fuel?.maxExtensionMs ?? 0,
    fuelUnitsOwned: owned,
    fuelUnitsSpendable: spendable,
    baseWindowMs,
    maxWindowMs,
    offlineCapBonusMs,
    projectedCycles: cycles === Number.MAX_SAFE_INTEGER ? 0 : cycles,
    projectedOutputs,
    projectedXp: Math.max(0, Math.min(rawXp, ceiling - progress)),
  };
}

/** The most advanced unlocked activity of a skill; used for per-skill rate summaries. */
export function getBestActivityForSkill(
  definition: SkillLoopDefinition,
  summary: SkillLoopSummary,
  skillId: SkillLoopId,
): ActivityDefinition | undefined {
  const available = definition.activities.filter(
    (activity) =>
      activity.skillId === skillId && summary.availableActivityIds.includes(activity.id),
  );
  return available.at(-1) ?? definition.activities.find((activity) => activity.skillId === skillId);
}
