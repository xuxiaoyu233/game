import type {
  ActiveBuff,
  ActivityDefinition,
  CurrentActivity,
  MaterialAmount,
  SkillDefinition,
  SkillLoopActionResult,
  SkillLoopAdvanceResult,
  SkillLoopCommand,
  SkillLoopDefinition,
  SkillLoopErrorCode,
  SkillLoopId,
  SkillLoopState,
  SkillLoopSummary,
} from './types';
import {
  getEffectiveCycleMs,
  getLevelFromXp,
  getOfflineCapMs,
  getSkillLevel,
  getXpPerCycle,
} from './rates';
import {
  MASTERY_POOL_SHARE_PERMILLE,
  getMasteryCoefficientPermille,
  getMasteryPoolLimit,
  resolveMasteryPoolSpend,
} from './mastery';
import { validateSkillLoopDefinition } from './validation';

const MAXIMUM = Number.MAX_SAFE_INTEGER;

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function getSkill(definition: SkillLoopDefinition, skillId: SkillLoopId): SkillDefinition {
  const skill = definition.skills.find((candidate) => candidate.id === skillId);
  if (skill === undefined) throw new Error(`Unknown skill: ${skillId}`);
  return skill;
}

function getActivity(
  definition: SkillLoopDefinition,
  activityId: string,
): ActivityDefinition | undefined {
  return definition.activities.find((candidate) => candidate.id === activityId);
}

function getSkillXp(state: SkillLoopState, skillId: string): number {
  return state.skillXp[skillId] ?? 0;
}

function getHighestLevel(skill: SkillDefinition): number {
  return skill.levels.at(-1)?.level ?? 1;
}

function getXpCeiling(skill: SkillDefinition): number {
  return skill.levels.at(-1)?.xpRequired ?? 0;
}

function getRequiredMaterials(
  activity: ActivityDefinition,
  definition: SkillLoopDefinition,
): readonly MaterialAmount[] {
  if (activity.kind === 'gather') return [];
  const recipe = definition.recipes.find((candidate) => candidate.id === activity.recipeId);
  if (recipe === undefined) throw new Error(`Missing recipe: ${activity.recipeId}`);
  return recipe.inputs;
}

function getOutputs(
  activity: ActivityDefinition,
  definition: SkillLoopDefinition,
): readonly MaterialAmount[] {
  if (activity.kind === 'gather') return activity.outputs;
  const recipe = definition.recipes.find((candidate) => candidate.id === activity.recipeId);
  if (recipe === undefined) throw new Error(`Missing recipe: ${activity.recipeId}`);
  return recipe.outputs;
}

function canAfford(
  inventory: Readonly<Record<string, number>>,
  materials: readonly MaterialAmount[],
): boolean {
  return materials.every((material) => (inventory[material.itemId] ?? 0) >= material.amount);
}

function getActiveBuff(state: SkillLoopState): ActiveBuff | null {
  return state.buffs?.[0] ?? null;
}

function tickBuffs(
  buffs: readonly ActiveBuff[] | undefined,
  elapsedMs: number,
): readonly ActiveBuff[] | undefined {
  if (buffs === undefined) return undefined;
  return buffs.flatMap((buff) => {
    const remainingMs = buff.remainingMs - elapsedMs;
    return remainingMs > 0 ? [{ ...buff, remainingMs }] : [];
  });
}

function makeActivityState(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activity: ActivityDefinition,
  status: CurrentActivity['status'] = 'running',
  buffActive = true,
): CurrentActivity {
  return {
    activityId: activity.id,
    status,
    progressMs: 0,
    // Duration comes from the shared rate layer so displayed rates always match real cycles.
    cycleDurationMs: getEffectiveCycleMs(state, definition, activity, buffActive),
    stopReason: null,
  };
}

function reject(state: SkillLoopState, error: SkillLoopErrorCode): SkillLoopActionResult {
  return { ok: false, state, error };
}

function accept(state: SkillLoopState): SkillLoopActionResult {
  return { ok: true, state };
}

function updateMaterials(
  inventory: Readonly<Record<string, number>>,
  inputs: readonly MaterialAmount[],
  outputs: readonly MaterialAmount[],
): Readonly<Record<string, number>> | null {
  const next = { ...inventory };
  for (const input of inputs) {
    if ((next[input.itemId] ?? 0) < input.amount) return null;
    next[input.itemId] = (next[input.itemId] ?? 0) - input.amount;
  }
  for (const output of outputs) {
    const previous = next[output.itemId] ?? 0;
    const produced = previous + output.amount;
    if (!Number.isSafeInteger(produced) || produced < previous || produced > MAXIMUM) return null;
    next[output.itemId] = produced;
  }
  return next;
}

function completedCycle(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activity: ActivityDefinition,
  buffActive: boolean,
): { readonly state: SkillLoopState; readonly error?: 'NUMERIC_LIMIT' } {
  const recipeInputs = getRequiredMaterials(activity, definition);
  if (!canAfford(state.inventory, recipeInputs)) {
    return {
      state: {
        ...state,
        currentActivity: {
          ...makeActivityState(state, definition, activity, 'stopped', buffActive),
          stopReason: 'insufficient-materials',
        },
      },
    };
  }
  const inventory = updateMaterials(
    state.inventory,
    recipeInputs,
    getOutputs(activity, definition),
  );
  if (inventory === null) return { state, error: 'NUMERIC_LIMIT' };

  const skill = getSkill(definition, activity.skillId);
  const xpBefore = getSkillXp(state, skill.id);
  const xpLimit = getXpCeiling(skill);
  // XP comes from the shared rate layer (buff x levelled global bonus x mastery checkpoint), so
  // the displayed XP per cycle and the paid XP can never drift apart.
  const xpGain = getXpPerCycle(state, definition, activity);
  const xpTotal = xpBefore + xpGain;
  if (!Number.isSafeInteger(xpTotal) || xpTotal > MAXIMUM) return { state, error: 'NUMERIC_LIMIT' };
  const xpAfter = Math.min(xpLimit, xpTotal);
  // Mastery accrues on schema 4 states only (see accrueMastery); the pool share and the activity
  // total clamp at their caps, so the checkpoint derivation always reads a consistent pool.
  const withMastery = accrueMastery(state, definition, activity);
  const nextState: SkillLoopState = {
    ...withMastery,
    inventory,
    skillXp: { ...state.skillXp, [skill.id]: xpAfter },
  };
  const stopReason = canAfford(inventory, recipeInputs) ? null : 'insufficient-materials';
  if (stopReason !== null) {
    return {
      state: {
        ...nextState,
        currentActivity: {
          ...makeActivityState(nextState, definition, activity, 'stopped', buffActive),
          stopReason,
        },
      },
    };
  }
  return {
    state: {
      ...nextState,
      currentActivity: makeActivityState(nextState, definition, activity, 'running', buffActive),
    },
  };
}

/**
 * Mastery accrual for one completed cycle (schema 4 only; earlier schemas return the state
 * unchanged). The cycle's mastery XP uses the coefficient at the activity's current mastery level
 * and clamps at the owning skill's XP ceiling (mastery reuses that curve); 25% of the gain
 * (floored) flows into the owning skill's pool, clamped at the pool limit.
 */
function accrueMastery(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activity: ActivityDefinition,
): SkillLoopState {
  if (state.masteryXp === undefined || state.masteryPool === undefined) return state;
  const skill = getSkill(definition, activity.skillId);
  const masteryCap = getXpCeiling(skill);
  const masteryBefore = state.masteryXp[activity.id] ?? 0;
  if (masteryBefore >= masteryCap) return state;
  const masteryLevel = getLevelFromXp(skill, masteryBefore);
  const coefficient = getMasteryCoefficientPermille(masteryLevel);
  const gain = Math.max(1, Math.round((activity.xpPerCycle * coefficient) / 1_000));
  const masteryAfter = Math.min(masteryCap, masteryBefore + gain);
  const poolLimit = getMasteryPoolLimit(
    definition.activities.filter((entry) => entry.skillId === skill.id).length,
  );
  const poolBefore = state.masteryPool[skill.id] ?? 0;
  const poolGain = Math.floor(
    ((masteryAfter - masteryBefore) * MASTERY_POOL_SHARE_PERMILLE) / 1_000,
  );
  const poolAfter = Math.min(poolLimit, poolBefore + poolGain);
  if (masteryAfter === masteryBefore && poolAfter === poolBefore) return state;
  return {
    ...state,
    masteryXp: { ...state.masteryXp, [activity.id]: masteryAfter },
    masteryPool: { ...state.masteryPool, [skill.id]: poolAfter },
  };
}

export function createNewSkillLoop(definition: SkillLoopDefinition, now: number): SkillLoopState {
  validateSkillLoopDefinition(definition);
  if (!validTime(now)) throw new RangeError('Game time must be a nonnegative safe integer');
  return {
    schemaVersion: definition.schemaVersion,
    profileId: definition.profileId,
    contentVersion: definition.contentVersion,
    inventory: { ...definition.initialInventory },
    skillXp: { ...definition.initialSkillXp },
    toolLevels: { ...definition.initialToolLevels },
    currentActivity: null,
    lastSimulatedAt: now,
    returnReport: null,
    ...(definition.schemaVersion >= 3 ? { buffs: [] } : {}),
    ...(definition.schemaVersion >= 4
      ? {
          masteryXp: Object.fromEntries(definition.activities.map((activity) => [activity.id, 0])),
          masteryPool: Object.fromEntries(definition.skills.map((skill) => [skill.id, 0])),
        }
      : {}),
  };
}

/** The same pure time rule handles online ticks, commands, startup, and offline recovery. */
export function advanceSkillLoop(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  now: number,
): SkillLoopAdvanceResult {
  if (!validTime(now) || !validTime(state.lastSimulatedAt))
    throw new RangeError('Game time must be a nonnegative safe integer');
  const elapsedMs = Math.max(0, now - state.lastSimulatedAt);
  if (elapsedMs === 0) return { state, completedCycles: 0, elapsedMs, creditedMs: 0 };
  let candidate: SkillLoopState = { ...state, lastSimulatedAt: now };
  // Offline fuel extends the settlement window only for time beyond the offline cap (base cap plus
  // the levelled bonus), and only from stock; each unit is spent once, so a longer absence never
  // pays twice. The cap itself is derived in the shared rate layer.
  const fuel = definition.offlineFuel;
  const offlineCapMs = getOfflineCapMs(state, definition);
  let creditedMs = Math.min(elapsedMs, offlineCapMs);
  if (elapsedMs > offlineCapMs && fuel !== undefined) {
    const owned = candidate.inventory[fuel.itemId] ?? 0;
    const maxUnits = Math.floor(fuel.maxExtensionMs / fuel.extensionMs);
    const neededUnits = Math.ceil((elapsedMs - offlineCapMs) / fuel.extensionMs);
    const used = Math.min(owned, maxUnits, neededUnits);
    if (used > 0) {
      creditedMs = Math.min(elapsedMs, offlineCapMs + used * fuel.extensionMs);
      candidate = {
        ...candidate,
        inventory: { ...candidate.inventory, [fuel.itemId]: owned - used },
      };
    }
  }
  const buffsAtStart = state.buffs;
  const buffRemainingAtStart = getActiveBuff(state)?.remainingMs ?? 0;
  const tickedBuffs = tickBuffs(buffsAtStart, creditedMs);
  let remainingMs = creditedMs;
  let completedCycles = 0;
  let buffConsumedMs = 0;
  while (remainingMs > 0) {
    const current = candidate.currentActivity;
    if (current === null || current.status !== 'running') break;
    const activity = getActivity(definition, current.activityId);
    if (activity === undefined) throw new Error(`Missing activity: ${current.activityId}`);
    if (!canAfford(candidate.inventory, getRequiredMaterials(activity, definition))) {
      candidate = {
        ...candidate,
        currentActivity: {
          ...current,
          status: 'stopped',
          progressMs: 0,
          stopReason: 'insufficient-materials',
        },
      };
      break;
    }
    const untilCycle = current.cycleDurationMs - current.progressMs;
    const stepMs = Math.min(remainingMs, untilCycle);
    remainingMs -= stepMs;
    buffConsumedMs += stepMs;
    const progressMs = current.progressMs + stepMs;
    if (progressMs < current.cycleDurationMs) {
      candidate = { ...candidate, currentActivity: { ...current, progressMs } };
      break;
    }
    // A cycle keeps the duration captured when it started; the buff only shapes the next one.
    const completion = completedCycle(
      candidate,
      definition,
      activity,
      buffRemainingAtStart - buffConsumedMs > 0,
    );
    if (completion.error !== undefined)
      return { state, completedCycles: 0, elapsedMs, creditedMs: 0, error: completion.error };
    candidate = completion.state;
    completedCycles += 1;
  }
  if (tickedBuffs !== undefined) candidate = { ...candidate, buffs: tickedBuffs };
  return { state: candidate, completedCycles, elapsedMs, creditedMs };
}

function unlocked(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activity: ActivityDefinition,
): boolean {
  return getSkillLevel(state, definition, activity.skillId) >= activity.requiredLevel;
}

function startActivity(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activityId: string,
  switching: boolean,
): SkillLoopActionResult {
  const activity = getActivity(definition, activityId);
  if (activity === undefined) return reject(state, 'UNKNOWN_ACTIVITY');
  if (!unlocked(state, definition, activity)) return reject(state, 'LOCKED');
  const current = state.currentActivity;
  if (!switching && current !== null) {
    if (current.activityId === activity.id && current.status === 'running') return accept(state);
    return reject(state, 'ACTIVITY_ALREADY_RUNNING');
  }
  if (!canAfford(state.inventory, getRequiredMaterials(activity, definition)))
    return reject(state, 'INSUFFICIENT_RESOURCES');
  return accept({
    ...state,
    currentActivity: makeActivityState(state, definition, activity),
  });
}

function canPurchaseUpgrade(
  state: SkillLoopState,
  upgradeId: string,
  definition: SkillLoopDefinition,
): boolean {
  const upgrade = definition.toolUpgrades.find((candidate) => candidate.id === upgradeId);
  if (upgrade === undefined) return false;
  return (
    (state.toolLevels[upgrade.toolId] ?? 0) === upgrade.sourceLevel &&
    (state.inventory[upgrade.requiredItemId] ?? 0) >= upgrade.requiredAmount
  );
}

export function applySkillLoopCommand(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  command: SkillLoopCommand,
): SkillLoopActionResult {
  switch (command.kind) {
    case 'tick':
      return accept(state);
    case 'start-activity':
      return startActivity(state, definition, command.activityId, false);
    case 'switch-activity':
      return startActivity(state, definition, command.activityId, true);
    case 'pause-activity': {
      const current = state.currentActivity;
      if (current === null || current.status !== 'running')
        return reject(state, 'NO_ACTIVITY_TO_PAUSE');
      return accept({
        ...state,
        currentActivity: { ...current, status: 'paused', stopReason: null },
      });
    }
    case 'resume-activity': {
      const current = state.currentActivity;
      if (current === null || current.status === 'running')
        return reject(state, 'NO_ACTIVITY_TO_RESUME');
      const activity = getActivity(definition, current.activityId);
      if (activity === undefined) return reject(state, 'UNKNOWN_ACTIVITY');
      if (!canAfford(state.inventory, getRequiredMaterials(activity, definition)))
        return reject(state, 'INSUFFICIENT_RESOURCES');
      const resumed =
        current.stopReason === 'insufficient-materials'
          ? makeActivityState(state, definition, activity)
          : { ...current, status: 'running' as const, stopReason: null };
      return accept({ ...state, currentActivity: resumed });
    }
    case 'buy-tool-upgrade': {
      const upgrade = definition.toolUpgrades.find(
        (candidate) => candidate.id === command.upgradeId,
      );
      if (upgrade === undefined) return reject(state, 'UNKNOWN_UPGRADE');
      const currentLevel = state.toolLevels[upgrade.toolId] ?? 0;
      if (currentLevel >= upgrade.targetLevel) return reject(state, 'ALREADY_PURCHASED');
      if (currentLevel !== upgrade.sourceLevel) return reject(state, 'LOCKED');
      if ((state.inventory[upgrade.requiredItemId] ?? 0) < upgrade.requiredAmount)
        return reject(state, 'INSUFFICIENT_RESOURCES');
      const inventory = { ...state.inventory };
      inventory[upgrade.requiredItemId] =
        (inventory[upgrade.requiredItemId] ?? 0) - upgrade.requiredAmount;
      const toolLevels = { ...state.toolLevels, [upgrade.toolId]: upgrade.targetLevel };
      let currentActivity = state.currentActivity;
      if (currentActivity !== null && currentActivity.progressMs === 0) {
        const activity = getActivity(definition, currentActivity.activityId);
        const tool = definition.tools.find((candidate) => candidate.id === upgrade.toolId);
        if (activity !== undefined && tool?.skillId === activity.skillId) {
          const updatedState = { ...state, inventory, toolLevels };
          const updatedCycle = makeActivityState(
            updatedState,
            definition,
            activity,
            currentActivity.status,
          );
          currentActivity = {
            ...currentActivity,
            cycleDurationMs: updatedCycle.cycleDurationMs,
          };
        }
      }
      return accept({
        ...state,
        inventory,
        toolLevels,
        currentActivity,
      });
    }
    case 'consume': {
      const item = definition.items.find((entry) => entry.id === command.itemId);
      if (item === undefined) return reject(state, 'UNKNOWN_ITEM');
      const effect = item.consumable;
      if (effect === undefined) return reject(state, 'NOT_CONSUMABLE');
      const owned = state.inventory[item.id] ?? 0;
      if (owned < 1) return reject(state, 'INSUFFICIENT_RESOURCES');
      // A single consumable buff slot: consuming refreshes the effect instead of stacking.
      return accept({
        ...state,
        inventory: { ...state.inventory, [item.id]: owned - 1 },
        buffs: [
          {
            sourceItemId: item.id,
            ...(effect.speedMultiplierPermille !== undefined
              ? { speedMultiplierPermille: effect.speedMultiplierPermille }
              : {}),
            ...(effect.xpMultiplierPermille !== undefined
              ? { xpMultiplierPermille: effect.xpMultiplierPermille }
              : {}),
            remainingMs: effect.durationMs,
          },
        ],
      });
    }
    case 'purchase': {
      const offers = definition.shopOffers ?? [];
      const offer = offers.find((entry) => entry.id === command.offerId);
      if (offer === undefined) return reject(state, 'UNKNOWN_OFFER');
      const coins = state.inventory['coin'] ?? 0;
      if (coins < offer.coinCost) return reject(state, 'INSUFFICIENT_RESOURCES');
      const inventory = updateMaterials(
        state.inventory,
        [{ itemId: 'coin', amount: offer.coinCost }],
        [{ itemId: offer.itemId, amount: offer.amount }],
      );
      if (inventory === null) return reject(state, 'NUMERIC_LIMIT');
      return accept({ ...state, inventory });
    }
    case 'sell': {
      const offers = definition.sellOffers ?? [];
      const offer = offers.find((entry) => entry.id === command.offerId);
      if (offer === undefined) return reject(state, 'UNKNOWN_SELL_OFFER');
      // Selling is repeatable: the same offer can be taken as often as stock allows, and the
      // deduction plus the coin payout commit together or not at all.
      if ((state.inventory[offer.itemId] ?? 0) < offer.amount)
        return reject(state, 'INSUFFICIENT_RESOURCES');
      const inventory = updateMaterials(
        state.inventory,
        [{ itemId: offer.itemId, amount: offer.amount }],
        [{ itemId: 'coin', amount: offer.coinValue }],
      );
      if (inventory === null) return reject(state, 'NUMERIC_LIMIT');
      return accept({ ...state, inventory });
    }
    case 'spend-mastery-pool': {
      const activity = definition.activities.find((entry) => entry.id === command.activityId);
      // An unknown activity also covers "activity outside this skill": the pool is looked up
      // through the activity's own skill, so a foreign activity cannot be addressed at all.
      if (activity === undefined) return reject(state, 'UNKNOWN_ACTIVITY');
      const skill = getSkill(definition, activity.skillId);
      const poolXp = state.masteryPool?.[skill.id] ?? 0;
      const activityMasteryXp = state.masteryXp?.[activity.id] ?? 0;
      const resolved = resolveMasteryPoolSpend({
        poolXp,
        requested: command.amount,
        activityMasteryXp,
        masteryCap: getXpCeiling(skill),
      });
      if (!resolved.ok) {
        // An illegal amount is a validation failure of the request, not a numeric overflow.
        return reject(
          state,
          resolved.reason === 'cap-exceeded'
            ? 'MASTERY_POOL_CAP_EXCEEDED'
            : resolved.reason === 'insufficient-pool'
              ? 'INSUFFICIENT_MASTERY_POOL'
              : 'INVALID_MASTERY_AMOUNT',
        );
      }
      // One atomic commit: the pool deduction and the activity's mastery gain land together.
      return accept({
        ...state,
        masteryXp: {
          ...(state.masteryXp ?? {}),
          [activity.id]: activityMasteryXp + resolved.amount,
        },
        masteryPool: { ...(state.masteryPool ?? {}), [skill.id]: poolXp - resolved.amount },
      });
    }
    case 'acknowledge-return-report':
      return state.returnReport === null ? accept(state) : accept({ ...state, returnReport: null });
  }
}

function skillSummary(
  state: SkillLoopState,
  skill: SkillDefinition,
): SkillLoopSummary['skills'][string] {
  const xp = getSkillXp(state, skill.id);
  let level = 1;
  let xpForNextLevel: number | null = null;
  for (const threshold of skill.levels) {
    if (xp < threshold.xpRequired) {
      xpForNextLevel = threshold.xpRequired;
      break;
    }
    level = threshold.level;
  }
  const maximumLevel = getHighestLevel(skill);
  const xpCeiling = getXpCeiling(skill);
  return {
    level: Math.min(level, maximumLevel),
    xp,
    xpForNextLevel,
    xpCeiling,
    maximumLevel,
    atPrototypeCap: level >= maximumLevel,
  };
}

export function getSkillLoopSummary(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
): SkillLoopSummary {
  const skills = Object.fromEntries(
    definition.skills.map((skill) => [skill.id, skillSummary(state, skill)]),
  );
  const lockedActivities = definition.activities
    .filter((activity) => !unlocked(state, definition, activity))
    .map((activity) => ({
      skillId: activity.skillId,
      activityId: activity.id,
      level: activity.requiredLevel,
    }));
  const minimumNextLevels = new Map<string, number>();
  for (const candidate of lockedActivities) {
    const previous = minimumNextLevels.get(candidate.skillId);
    if (previous === undefined || candidate.level < previous)
      minimumNextLevels.set(candidate.skillId, candidate.level);
  }
  const nextUnlocks = lockedActivities.filter(
    (candidate) => minimumNextLevels.get(candidate.skillId) === candidate.level,
  );
  const availableToolUpgradeIds = definition.toolUpgrades
    .filter((upgrade) => canPurchaseUpgrade(state, upgrade.id, definition))
    .map((upgrade) => upgrade.id);
  const prototypeComplete =
    definition.skills.every((skill) => skillSummary(state, skill).atPrototypeCap) &&
    definition.tools.every(
      (tool) => (state.toolLevels[tool.id] ?? 0) === (tool.levels.at(-1)?.level ?? 1),
    );
  return {
    skills,
    availableActivityIds: definition.activities
      .filter((activity) => unlocked(state, definition, activity))
      .map((activity) => activity.id),
    nextUnlocks,
    availableToolUpgradeIds,
    prototypeComplete,
  };
}
