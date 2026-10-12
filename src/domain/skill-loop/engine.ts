import type {
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
  ToolDefinition,
} from './types';
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

function getTool(definition: SkillLoopDefinition, skillId: string): ToolDefinition | undefined {
  return definition.tools.find((candidate) => candidate.skillId === skillId);
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

export function getSkillLevel(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  skillId: string,
): number {
  const skill = getSkill(definition, skillId);
  const xp = getSkillXp(state, skillId);
  let level = 1;
  for (const threshold of skill.levels) {
    if (xp < threshold.xpRequired) break;
    level = threshold.level;
  }
  return Math.min(level, getHighestLevel(skill));
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

function makeActivityState(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  activity: ActivityDefinition,
  status: CurrentActivity['status'] = 'running',
): CurrentActivity {
  const tool = getTool(definition, activity.skillId);
  const toolLevel = tool?.levels.find((level) => level.level === state.toolLevels[tool.id]);
  const multiplier = toolLevel?.durationMultiplierPermille ?? 1_000;
  const scaledDuration = activity.durationMs * multiplier;
  const exactDuration = scaledDuration / 1_000;
  if (
    !Number.isSafeInteger(scaledDuration) ||
    !Number.isSafeInteger(Math.ceil(exactDuration)) ||
    exactDuration <= 0
  )
    throw new RangeError(`Activity duration exceeds numeric limits: ${activity.id}`);
  return {
    activityId: activity.id,
    status,
    progressMs: 0,
    cycleDurationMs: Math.ceil(exactDuration),
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
): { readonly state: SkillLoopState; readonly error?: 'NUMERIC_LIMIT' } {
  const recipeInputs = getRequiredMaterials(activity, definition);
  if (!canAfford(state.inventory, recipeInputs)) {
    return {
      state: {
        ...state,
        currentActivity: {
          ...makeActivityState(state, definition, activity, 'stopped'),
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
  const xpTotal = xpBefore + activity.xpPerCycle;
  if (!Number.isSafeInteger(xpTotal) || xpTotal > MAXIMUM) return { state, error: 'NUMERIC_LIMIT' };
  const xpAfter = Math.min(xpLimit, xpTotal);
  const nextState: SkillLoopState = {
    ...state,
    inventory,
    skillXp: { ...state.skillXp, [skill.id]: xpAfter },
  };
  const stopReason = canAfford(inventory, recipeInputs) ? null : 'insufficient-materials';
  if (stopReason !== null) {
    return {
      state: {
        ...nextState,
        currentActivity: {
          ...makeActivityState(nextState, definition, activity, 'stopped'),
          stopReason,
        },
      },
    };
  }
  return {
    state: {
      ...nextState,
      currentActivity: makeActivityState(nextState, definition, activity),
    },
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
  const creditedMs = Math.min(elapsedMs, definition.maxOfflineMs);
  let candidate: SkillLoopState = { ...state, lastSimulatedAt: now };
  let remainingMs = creditedMs;
  let completedCycles = 0;
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
    const progressMs = current.progressMs + stepMs;
    if (progressMs < current.cycleDurationMs) {
      candidate = { ...candidate, currentActivity: { ...current, progressMs } };
      break;
    }
    const completion = completedCycle(candidate, definition, activity);
    if (completion.error !== undefined)
      return { state, completedCycles: 0, elapsedMs, creditedMs: 0, error: completion.error };
    candidate = completion.state;
    completedCycles += 1;
  }
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
