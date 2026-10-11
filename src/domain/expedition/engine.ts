import type {
  BuildingDefinition,
  BuildingId,
  ExpeditionActionResult,
  ExpeditionCommand,
  ExpeditionDefinition,
  ExpeditionErrorCode,
  ExpeditionProjectDefinition,
  ExpeditionSummary,
  ObjectiveCondition,
  ObjectiveProgress,
  Profile,
  ResearchNodeDefinition,
  ResearchNodeId,
  Resources,
  ResourceLedger,
  RewardLine,
  RunState,
  SaveBundle,
  SnowObservatoryModeDefinition,
  SnowRunState,
  StoryClueDefinition,
  WorldDefinition,
  WorldVariantDefinition,
} from './types';
import { advanceOutpost, applyOutpostCommand, createOutpost } from '../outpost/engine';
import { validateExpeditionDefinition } from './validation';

const BUILDING_IDS: readonly BuildingId[] = [
  'shelter',
  'lumber-camp',
  'quarry',
  'wall',
  'tower',
  'monument',
];
const ZERO_RESOURCES: Resources = { wood: 0, stone: 0 };
const RESEARCH_NODES = (definition: ExpeditionDefinition): readonly ResearchNodeDefinition[] =>
  definition.researchNodes ?? [];
const WORLD_VARIANTS = (definition: ExpeditionDefinition): readonly WorldVariantDefinition[] =>
  definition.worldVariants ?? [];

function isSafeAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

function assertAmount(value: number): number {
  if (!isSafeAmount(value)) throw new RangeError('Expedition numeric limit exceeded');
  return value;
}

function validateTime(now: number): void {
  if (!isSafeAmount(now))
    throw new RangeError('Expedition time must be finite, nonnegative and safe');
}

function getWorld(run: RunState, definition: ExpeditionDefinition): WorldDefinition {
  const world = definition.worlds.find((candidate) => candidate.id === run.worldId);
  if (!world) throw new Error(`Unknown active world: ${run.worldId}`);
  return world;
}

function getSnowMode(world: WorldDefinition): SnowObservatoryModeDefinition | null {
  return world.mode?.kind === 'snow-observatory' ? world.mode : null;
}

function getAnchorCityMode(world: WorldDefinition) {
  return world.mode?.kind === 'anchor-city' ? world.mode : null;
}

function getModifierDefinitions(definition: ExpeditionDefinition) {
  return definition.difficultyModifiers ?? [];
}

function getRunModifiers(run: RunState, definition: ExpeditionDefinition) {
  return run.difficultyModifierIds.flatMap((id) => {
    const modifier = getModifierDefinitions(definition).find((item) => item.id === id);
    return modifier ? [modifier] : [];
  });
}

function getModifierMultiplier(
  run: RunState,
  definition: ExpeditionDefinition,
  effectKind:
    | 'starting-resource-multiplier'
    | 'stage-duration-multiplier'
    | 'wave-strength-multiplier'
    | 'snow-fuel-burn-multiplier',
): number {
  return getRunModifiers(run, definition).reduce(
    (multiplier, modifier) =>
      multiplier *
      modifier.effects.reduce(
        (effectMultiplier, effect) =>
          effect.kind === effectKind ? effectMultiplier * effect.multiplier : effectMultiplier,
        1,
      ),
    1,
  );
}

function getDifficultyScore(run: RunState, definition: ExpeditionDefinition): number {
  return getRunModifiers(run, definition).reduce(
    (total, modifier) => total + modifier.difficulty,
    0,
  );
}

function getDifficultyReward(run: RunState, definition: ExpeditionDefinition): number {
  const score = getDifficultyScore(run, definition);
  const tier = definition.difficultyRewardTiers?.find(
    (item) =>
      score >= item.minimumDifficulty &&
      (item.maximumDifficulty === null || score <= item.maximumDifficulty),
  );
  return tier?.points ?? 0;
}

function getStageDuration(
  run: RunState,
  durationMs: number,
  definition: ExpeditionDefinition,
): number {
  return Math.max(
    1,
    Math.floor(durationMs * getModifierMultiplier(run, definition, 'stage-duration-multiplier')),
  );
}

function getModeKind(world: WorldDefinition): 'wave-survival' | 'snow-observatory' | 'anchor-city' {
  return world.mode?.kind ?? 'wave-survival';
}

function isPlayable(run: RunState): boolean {
  return (
    run.phase === 'preparing' ||
    run.phase === 'awaiting-wave' ||
    run.phase === 'awaiting-environment'
  );
}

function isWorldAvailable(profile: Profile, world: WorldDefinition): boolean {
  return (
    (world.unlockAfterWorld === null || profile.clearedWorldIds.includes(world.unlockAfterWorld)) &&
    (world.unlockAfterDialogueId === null ||
      Object.hasOwn(profile.dialogueChoices, world.unlockAfterDialogueId))
  );
}

function isResearchRootAvailable(profile: Profile, definition: ExpeditionDefinition): boolean {
  return (definition.researchRoot?.requiredClueIds ?? []).every((clueId) =>
    profile.discoveredClueIds.includes(clueId),
  );
}

function isResearchNodeAvailable(
  profile: Profile,
  node: ResearchNodeDefinition,
  definition: ExpeditionDefinition,
): boolean {
  return (
    isResearchRootAvailable(profile, definition) &&
    node.requiredClueIds.every((clueId) => profile.discoveredClueIds.includes(clueId)) &&
    node.requiredResearchNodeIds.every((nodeId) => profile.researchNodeIds.includes(nodeId))
  );
}

export function isWorldVariantAvailable(
  profile: Profile,
  variant: WorldVariantDefinition,
  definition: ExpeditionDefinition,
): boolean {
  const choice = variant.requiredDialogueChoice;
  const world = definition.worlds.find((candidate) => candidate.id === variant.worldId);
  const contract = definition.contracts.find((candidate) => candidate.id === variant.contractId);
  if (!world || !contract) return false;
  const choiceAvailable =
    choice === undefined ||
    choice === null ||
    profile.dialogueChoices[choice.dialogueId] === choice.optionId ||
    (contract.unlockAfterDialogueChoice?.dialogueId === choice.dialogueId &&
      contract.unlockAfterDialogueChoice.optionId === choice.optionId &&
      isContractAvailable(profile, contract));
  return (
    profile.clearedWorldIds.includes(variant.worldId) &&
    isWorldAvailable(profile, world) &&
    isContractAvailable(profile, contract) &&
    choiceAvailable
  );
}

function getSelectedVariant(
  profile: Profile,
  worldId: string,
  definition: ExpeditionDefinition,
): WorldVariantDefinition | undefined {
  const selectedId = profile.selectedVariantIds[worldId];
  if (selectedId === undefined) return undefined;
  const variant = WORLD_VARIANTS(definition).find(
    (candidate) => candidate.id === selectedId && candidate.worldId === worldId,
  );
  return variant && isWorldVariantAvailable(profile, variant, definition) ? variant : undefined;
}

function getResearchNode(
  id: ResearchNodeId,
  definition: ExpeditionDefinition,
): ResearchNodeDefinition | undefined {
  return RESEARCH_NODES(definition).find((node) => node.id === id);
}

function isResearchNodeApplicableToWorld(node: ResearchNodeDefinition, worldId: string): boolean {
  return node.appliesToWorldIds === undefined || node.appliesToWorldIds.includes(worldId);
}

export function getApplicablePreparationId(
  profile: Profile,
  worldId: string,
  definition: ExpeditionDefinition,
): ResearchNodeId | null {
  const preparationId = profile.equippedPreparationId;
  if (preparationId === null || !profile.researchNodeIds.includes(preparationId)) return null;
  const node = getResearchNode(preparationId, definition);
  return node && isResearchNodeApplicableToWorld(node, worldId) ? node.id : null;
}

function getPreparationEffect(run: RunState, definition: ExpeditionDefinition) {
  if (run.preparationId === null) return undefined;
  const node = getResearchNode(run.preparationId, definition);
  return node && isResearchNodeApplicableToWorld(node, run.worldId) ? node.effect : undefined;
}

function subtractDiscount(cost: Resources, discount: Resources): Resources {
  return {
    wood: Math.max(0, cost.wood - discount.wood),
    stone: Math.max(0, cost.stone - discount.stone),
  };
}

export function isContractAvailable(
  profile: Profile,
  contract: ExpeditionDefinition['contracts'][number],
): boolean {
  const choice = contract.unlockAfterDialogueChoice;
  const routeRecovered =
    contract.unlockAfterAnyCompletedObjectiveIds?.some((objectiveId) =>
      profile.completedObjectiveIds.includes(objectiveId),
    ) ?? false;
  return (
    contract.unlockAfterCompletedObjectiveIds.every((objectiveId) =>
      profile.completedObjectiveIds.includes(objectiveId),
    ) &&
    (choice === undefined ||
      choice === null ||
      profile.dialogueChoices[choice.dialogueId] === choice.optionId ||
      routeRecovered)
  );
}

function getContract(run: RunState, definition: ExpeditionDefinition) {
  const contract = definition.contracts.find((candidate) => candidate.id === run.contractId);
  if (!contract || contract.worldId !== run.worldId)
    throw new Error(`Unknown active contract: ${run.contractId}`);
  return contract;
}

function conditionMet(
  run: RunState,
  condition: ObjectiveCondition,
  clearedWaves = run.clearedWaves,
): boolean {
  switch (condition.kind) {
    case 'building-count':
      return run.buildings[condition.buildingId] >= condition.count;
    case 'cleared-waves':
      return clearedWaves >= condition.count;
    case 'environment-node-count':
      return (run.snowState?.nodesResolved ?? 0) >= condition.count;
    case 'generator-integrity':
      return (run.snowState?.generatorIntegrity ?? 0) >= condition.minimum;
    case 'completed-project':
      return run.completedProjectIds.includes(condition.projectId);
  }
}

function objectiveMet(
  run: RunState,
  objectiveId: string,
  definition: ExpeditionDefinition,
  clearedWaves = run.clearedWaves,
): boolean {
  const objective = definition.objectives.find((candidate) => candidate.id === objectiveId);
  if (!objective) throw new Error(`Unknown objective: ${objectiveId}`);
  return objective.conditions.every((condition) => conditionMet(run, condition, clearedWaves));
}

function getCompletedObjectiveIds(
  run: RunState,
  definition: ExpeditionDefinition,
): readonly string[] {
  const contract = getContract(run, definition);
  return [...contract.primaryObjectiveIds, ...contract.optionalObjectiveIds].filter((id) =>
    objectiveMet(run, id, definition),
  );
}

function getObjectiveProgress(
  run: RunState,
  definition: ExpeditionDefinition,
): readonly ObjectiveProgress[] {
  const contract = getContract(run, definition);
  return [
    ...contract.primaryObjectiveIds.map((objectiveId) => ({ objectiveId, mandatory: true })),
    ...contract.optionalObjectiveIds.map((objectiveId) => ({ objectiveId, mandatory: false })),
  ].map(({ objectiveId, mandatory }) => {
    const objective = definition.objectives.find((candidate) => candidate.id === objectiveId);
    if (!objective) throw new Error(`Unknown objective: ${objectiveId}`);
    return {
      objectiveId,
      mandatory,
      completed: objectiveMet(run, objectiveId, definition),
      rewardPoints: objective.rewardPoints,
    };
  });
}

function getUnlockedProjectIds(run: RunState, definition: ExpeditionDefinition): readonly string[] {
  const contract = getContract(run, definition);
  const objectiveIds = [...contract.primaryObjectiveIds, ...contract.optionalObjectiveIds];
  return definition.projects
    .filter(
      (project) =>
        run.phase === 'preparing' &&
        project.worldId === run.worldId &&
        (project.minimumAnchorStability === undefined ||
          (run.anchorCityState?.stability ?? 0) >= project.minimumAnchorStability) &&
        project.afterClearedWaves <= run.clearedWaves &&
        objectiveIds.includes(project.objectiveId) &&
        run.activeProject === null &&
        !run.completedProjectIds.includes(project.id) &&
        run.eventChoices[project.requiredEventChoice.eventId] ===
          project.requiredEventChoice.optionId,
    )
    .map((project) => project.id);
}

function getPendingEvents(run: RunState, definition: ExpeditionDefinition) {
  const contract = getContract(run, definition);
  const objectiveIds = [...contract.primaryObjectiveIds, ...contract.optionalObjectiveIds];
  const variant =
    run.variantId === null
      ? undefined
      : WORLD_VARIANTS(definition).find((candidate) => candidate.id === run.variantId);
  return definition.events
    .filter(
      (event) =>
        event.worldId === run.worldId &&
        (variant === undefined ||
          event.groupId === undefined ||
          event.groupId === null ||
          event.groupId === variant?.eventGroupId) &&
        (event.randomPool !== 'incident' || event.id === run.randomEventId) &&
        (event.minimumAnchorStability === undefined ||
          (run.anchorCityState?.stability ?? 0) >= event.minimumAnchorStability) &&
        (event.afterEnvironmentNodes === undefined
          ? event.afterClearedWaves <= run.clearedWaves
          : (run.snowState?.nodesResolved ?? 0) >= event.afterEnvironmentNodes &&
            run.phase === 'awaiting-environment') &&
        (event.requiresObjectiveId === null || objectiveIds.includes(event.requiresObjectiveId)) &&
        !Object.hasOwn(run.eventChoices, event.id),
    )
    .map((event) => ({
      ...event,
      options: event.options.filter(
        (option) =>
          option.requiresObjectiveId === null || objectiveIds.includes(option.requiresObjectiveId),
      ),
    }));
}

export function getRandomEventId(
  world: WorldDefinition,
  contractId: string,
  variant: WorldVariantDefinition | undefined,
  seed: number,
  definition: ExpeditionDefinition,
): string | null {
  const contract = definition.contracts.find((item) => item.id === contractId);
  if (!contract) return null;
  const objectiveIds = [...contract.primaryObjectiveIds, ...contract.optionalObjectiveIds];
  const candidates = definition.events.filter(
    (event) =>
      event.randomPool === 'incident' &&
      event.worldId === world.id &&
      (variant === undefined ||
        event.groupId === undefined ||
        event.groupId === null ||
        event.groupId === variant.eventGroupId) &&
      (event.minimumAnchorStability === undefined ||
        event.minimumAnchorStability <=
          (world.mode?.kind === 'anchor-city' ? world.mode.initialStability : 0)) &&
      (event.requiresObjectiveId === null || objectiveIds.includes(event.requiresObjectiveId)),
  );
  if (candidates.length === 0) return null;
  return candidates[seed % candidates.length]?.id ?? null;
}

function getAssignedProject(
  run: RunState,
  definition: ExpeditionDefinition,
): ExpeditionProjectDefinition | null {
  if (run.activeProject === null) return null;
  const project = definition.projects.find(
    (candidate) => candidate.id === run.activeProject?.projectId,
  );
  if (!project || project.worldId !== run.worldId)
    throw new Error('Unknown active expedition project');
  return project;
}

function getAvailableWorkers(
  run: RunState,
  definition: ExpeditionDefinition,
): { wood: number; stone: number; guard: number } {
  if (run.workerTransition !== null) return { wood: 0, stone: 0, guard: 0 };
  const preset = definition.workforce.presets.find((item) => item.id === run.workerPresetId);
  if (!preset) throw new Error('Unknown workforce preset');
  const available = { wood: preset.wood, stone: preset.stone, guard: preset.guard };
  const project = getAssignedProject(run, definition);
  if (project && run.activeProject) {
    const role = run.activeProject.workerRole;
    available[role] -= project.workerCount;
    if (available[role] < 0) throw new Error('Project worker assignment exceeds its preset');
  }
  return available;
}

function hasUnresolvedBlockingEvent(run: RunState, definition: ExpeditionDefinition): boolean {
  if (!definition.contracts.some((contract) => contract.id === run.contractId)) return false;
  return getPendingEvents(run, definition).length > 0;
}

function meetsClueConditions(run: RunState, clue: StoryClueDefinition): boolean {
  return (
    clue.worldId === run.worldId &&
    (clue.requiresContractId === undefined ||
      clue.requiresContractId === null ||
      clue.requiresContractId === run.contractId) &&
    run.clearedWaves >= clue.minClearedWaves &&
    (clue.requiresBuilding === null || run.buildings[clue.requiresBuilding] >= 1) &&
    (clue.requiresBeacon === null || run.beaconChoice === clue.requiresBeacon) &&
    (clue.requiresProjectId === null || run.completedProjectIds.includes(clue.requiresProjectId))
  );
}

function getReturnClues(run: RunState, definition: ExpeditionDefinition): readonly string[] {
  return definition.story.clues
    .filter((clue) => clue.source === 'return' && meetsClueConditions(run, clue))
    .map((clue) => clue.id);
}

function getStartingResources(
  profile: Profile,
  world: WorldDefinition,
  definition: ExpeditionDefinition,
  variant?: WorldVariantDefinition,
  modifierIds: readonly string[] = [],
): Resources {
  let resources = { ...world.initialResources };
  if (variant) resources = addCapped(resources, variant.initialResourceBonus, world.resourceCaps);
  for (const dialogue of definition.story.dialogues) {
    const chosenId = profile.dialogueChoices[dialogue.id];
    const option = dialogue.options.find((candidate) => candidate.id === chosenId);
    if (option) resources = addCapped(resources, option.nextRunBonus, world.resourceCaps);
  }
  const resourceMultiplier = modifierIds.reduce((multiplier, id) => {
    const modifier = getModifierDefinitions(definition).find((item) => item.id === id);
    return (
      multiplier *
      (modifier?.effects.find((effect) => effect.kind === 'starting-resource-multiplier')
        ?.multiplier ?? 1)
    );
  }, 1);
  resources = {
    wood: Math.floor(resources.wood * resourceMultiplier),
    stone: Math.floor(resources.stone * resourceMultiplier),
  };
  return resources;
}

function getInvestigationCost(
  run: RunState,
  clue: StoryClueDefinition,
  definition: ExpeditionDefinition,
): Resources {
  const effect = getPreparationEffect(run, definition);
  return effect?.kind === 'investigation-cost-discount' && !run.investigationDiscountUsed
    ? subtractDiscount(clue.cost, effect.amount)
    : clue.cost;
}

function getBuildingCost(
  run: RunState | null,
  building: BuildingDefinition,
  definition: ExpeditionDefinition,
): Resources {
  const count = run?.buildings[building.id] ?? 0;
  const cost = {
    wood: Math.ceil(building.cost.wood * building.priceGrowth ** count),
    stone: Math.ceil(building.cost.stone * building.priceGrowth ** count),
  };
  const effect = run ? getPreparationEffect(run, definition) : undefined;
  return effect?.kind === 'production-building-discount' &&
    run !== null &&
    run.buildings['lumber-camp'] === 0 &&
    run.buildings.quarry === 0 &&
    (building.id === 'lumber-camp' || building.id === 'quarry')
    ? subtractDiscount(cost, effect.amount)
    : cost;
}

function getProduction(
  run: RunState,
  world: WorldDefinition,
  profile: Profile,
  definition: ExpeditionDefinition,
): Resources {
  const sources = getProductionSources(run, world, profile, definition);
  return {
    wood: assertAmount(sources.reduce((sum, source) => sum + source.production.wood, 0)),
    stone: assertAmount(sources.reduce((sum, source) => sum + source.production.stone, 0)),
  };
}

function getProductionOverInterval(
  run: RunState,
  world: WorldDefinition,
  profile: Profile,
  definition: ExpeditionDefinition,
  elapsedMs: number,
): Resources {
  const transition = run.workerTransition;
  if (transition === null || elapsedMs <= transition.remainingMs) {
    const production = getProduction(run, world, profile, definition);
    return {
      wood: production.wood * (elapsedMs / 1000),
      stone: production.stone * (elapsedMs / 1000),
    };
  }
  const transitionProduction = getProduction(run, world, profile, definition);
  const transitionResources = {
    wood: transitionProduction.wood * (transition.remainingMs / 1000),
    stone: transitionProduction.stone * (transition.remainingMs / 1000),
  };
  const switchedRun: RunState = {
    ...run,
    workerPresetId: transition.targetPresetId,
    workerTransition: null,
  };
  const switchedProduction = getProduction(switchedRun, world, profile, definition);
  const productiveMs = elapsedMs - transition.remainingMs;
  return {
    wood: transitionResources.wood + switchedProduction.wood * (productiveMs / 1000),
    stone: transitionResources.stone + switchedProduction.stone * (productiveMs / 1000),
  };
}

function advanceWorkerTransition(run: RunState, elapsedMs: number): RunState {
  const transition = run.workerTransition;
  if (transition === null || elapsedMs <= 0) return run;
  const remainingMs = Math.max(0, transition.remainingMs - elapsedMs);
  return remainingMs === 0
    ? { ...run, workerPresetId: transition.targetPresetId, workerTransition: null }
    : { ...run, workerTransition: { ...transition, remainingMs } };
}

function getProductionSources(
  run: RunState,
  world: WorldDefinition,
  profile: Profile,
  definition: ExpeditionDefinition,
): ExpeditionSummary['productionSources'] {
  let wood = 0;
  let stone = 0;
  for (const building of world.buildings) {
    wood += run.buildings[building.id] * building.production.wood;
    stone += run.buildings[building.id] * building.production.stone;
  }
  const multiplier = profile.perkIds.includes('harvest-training')
    ? definition.harvestMultiplier
    : 1;
  const stance = definition.stances.find((item) => item.id === run.stanceId);
  const workers = getAvailableWorkers(run, definition);
  if (!stance) throw new Error('Unknown camp strategy');
  const factor = multiplier * stance.productionMultiplier;
  const scaled = (production: Resources): Resources => ({
    wood: assertAmount(production.wood * factor),
    stone: assertAmount(production.stone * factor),
  });
  return [
    { id: 'natural', production: scaled(world.baseProduction) },
    {
      id: 'workers',
      production: scaled({
        wood: workers.wood * definition.workforce.woodRate,
        stone: workers.stone * definition.workforce.stoneRate,
      }),
    },
    { id: 'buildings', production: scaled({ wood, stone }) },
  ];
}

function getDefense(
  run: RunState,
  world: WorldDefinition,
  definition: ExpeditionDefinition,
): number {
  let defense =
    definition.baseDefense + (run.beaconChoice === 'restore' ? definition.beaconDefense : 0);
  for (const building of world.buildings) defense += run.buildings[building.id] * building.defense;
  const stance = definition.stances.find((item) => item.id === run.stanceId);
  const workers = getAvailableWorkers(run, definition);
  if (!stance) throw new Error('Unknown camp strategy');
  return assertAmount(
    Math.floor(
      (defense + workers.guard * definition.workforce.guardDefense) * stance.defenseMultiplier,
    ),
  );
}

function getEarlyBattle(run: RunState, world: WorldDefinition, definition: ExpeditionDefinition) {
  const preparationMs = world.preparationMs;
  if (preparationMs === undefined || getSnowMode(world) !== null)
    return { remaining: 0, bonus: 0, strength: 0 };
  const stageDuration = getStageDuration(run, preparationMs[run.clearedWaves] ?? 0, definition);
  const remaining =
    run.phase === 'preparing' ? Math.max(0, stageDuration - run.elapsedInStageMs) : 0;
  const ratio = remaining / stageDuration;
  const baseStrength = getNextStrength(run, world, definition);
  const bonus = Math.floor(ratio * definition.earlyBattle.maxPointsPerWave);
  return {
    remaining,
    bonus,
    strength:
      remaining > 0 && bonus > 0
        ? Math.ceil(baseStrength * (1 + ratio * definition.earlyBattle.pressureMultiplier))
        : baseStrength,
  };
}

function getNextStrength(
  run: RunState,
  world: WorldDefinition,
  definition: ExpeditionDefinition,
): number {
  const strength = world.waveStrengths?.[run.clearedWaves] ?? 0;
  return assertAmount(
    strength *
      (run.clearedWaves === 2 && run.boostedFinal ? definition.finalWaveMultiplier : 1) *
      getModifierMultiplier(run, definition, 'wave-strength-multiplier'),
  );
}

function getBraceReduction(run: RunState, definition: ExpeditionDefinition): number {
  const effect = getPreparationEffect(run, definition);
  return effect?.kind === 'brace-next-wave' && run.braceArmed ? effect.damageReduction : 0;
}

function canReturn(run: RunState, definition: ExpeditionDefinition): boolean {
  if (hasUnresolvedBlockingEvent(run, definition)) return false;
  const world = getWorld(run, definition);
  if (getSnowMode(world) !== null) {
    return (
      (run.phase === 'awaiting-environment' || run.phase === 'completed') &&
      getContract(run, definition).primaryObjectiveIds.every((id) =>
        objectiveMet(run, id, definition),
      )
    );
  }
  return (
    run.phase === 'failed' ||
    getContract(run, definition).primaryObjectiveIds.every((id) =>
      objectiveMet(run, id, definition),
    )
  );
}

function getEarnedRewards(
  run: RunState,
  definition: ExpeditionDefinition,
  includeDifficultyReward = true,
): readonly RewardLine[] {
  if (!canReturn(run, definition)) return [];
  const rewards: RewardLine[] = [{ id: 'base', points: definition.rewards.base }];
  if (run.buildings.monument >= 1)
    rewards.push({ id: 'monument', points: definition.rewards.monument });
  if (run.beaconChoice === 'restore')
    rewards.push({ id: 'beacon', points: definition.rewards.beacon });
  if (run.clearedWaves >= 3) {
    rewards.push({ id: 'final-wave', points: definition.rewards.finalWave });
    if (run.boostedFinal)
      rewards.push({ id: 'boosted-final', points: definition.rewards.boostedFinal });
  }
  if (run.initiativePoints > 0) rewards.push({ id: 'initiative', points: run.initiativePoints });
  const difficultyReward = includeDifficultyReward ? getDifficultyReward(run, definition) : 0;
  if (difficultyReward > 0) rewards.push({ id: 'difficulty', points: difficultyReward });
  for (const objectiveId of getCompletedObjectiveIds(run, definition)) {
    const objective = definition.objectives.find((candidate) => candidate.id === objectiveId);
    if (objective && objective.rewardPoints > 0)
      rewards.push({ id: `objective:${objective.id}`, points: objective.rewardPoints });
  }
  return rewards;
}

function getRewards(run: RunState, definition: ExpeditionDefinition): readonly RewardLine[] {
  if (run.phase === 'failed') return run.securedRewards;
  const securedIds = new Set(run.securedRewards.map((reward) => reward.id));
  return [
    ...run.securedRewards,
    ...getEarnedRewards(run, definition).filter((reward) => !securedIds.has(reward.id)),
  ];
}

function getNextWaveRewardTotal(run: RunState, definition: ExpeditionDefinition): number {
  if (run.clearedWaves !== 2 || getSnowMode(getWorld(run, definition)) !== null) return 0;
  const contract = getContract(run, definition);
  const completedObjectives = new Set(getCompletedObjectiveIds(run, definition));
  const nextWave = run.clearedWaves + 1;
  const objectiveRewards = [
    ...contract.primaryObjectiveIds,
    ...contract.optionalObjectiveIds,
  ].reduce((total, objectiveId) => {
    const objective = definition.objectives.find((candidate) => candidate.id === objectiveId);
    if (
      objective === undefined ||
      completedObjectives.has(objectiveId) ||
      !objectiveMet(run, objectiveId, definition, nextWave)
    )
      return total;
    return total + objective.rewardPoints;
  }, 0);
  return (
    definition.rewards.finalWave +
    (run.boostedFinal ? definition.rewards.boostedFinal : 0) +
    objectiveRewards
  );
}

function canSecureRewards(run: RunState, definition: ExpeditionDefinition): boolean {
  const world = getWorld(run, definition);
  const snowMode = getSnowMode(world);
  const hasRemainingChallenge =
    snowMode === null
      ? run.clearedWaves < 3
      : run.snowState !== null && run.snowState.nodesResolved < snowMode.nodeCount;
  return (
    isPlayable(run) &&
    canReturn(run, definition) &&
    hasRemainingChallenge &&
    run.securedObjectiveIds.length === 0 &&
    !hasUnresolvedBlockingEvent(run, definition) &&
    getEarnedRewards(run, definition).length > 0
  );
}

function getSecureClueIds(run: RunState, definition: ExpeditionDefinition): readonly string[] {
  const objectiveClueIds = getCompletedObjectiveIds(run, definition).flatMap((objectiveId) => {
    const objective = definition.objectives.find((candidate) => candidate.id === objectiveId);
    return objective?.clueId === null || objective?.clueId === undefined ? [] : [objective.clueId];
  });
  return [
    ...new Set([...getReturnClues(run, definition), ...run.recoveredClueIds, ...objectiveClueIds]),
  ];
}

function canRepair(run: RunState, profile: Profile): boolean {
  return (
    isPlayable(run) &&
    profile.perkIds.includes('field-repair') &&
    !run.repairUsed &&
    run.hp > 0 &&
    run.hp < run.maxHp
  );
}

function canAfford(resources: Resources, cost: Resources): boolean {
  return resources.wood >= cost.wood && resources.stone >= cost.stone;
}

function spend(resources: Resources, cost: Resources): Resources {
  return { wood: resources.wood - cost.wood, stone: resources.stone - cost.stone };
}

function addCapped(resources: Resources, gain: Resources, caps: Resources): Resources {
  assertAmount(gain.wood);
  assertAmount(gain.stone);
  return {
    wood: resources.wood + Math.min(caps.wood - resources.wood, gain.wood),
    stone: resources.stone + Math.min(caps.stone - resources.stone, gain.stone),
  };
}

export function createResourceLedger(opening: Resources, sinceUpgrade = false): ResourceLedger {
  return {
    opening: { ...opening },
    produced: ZERO_RESOURCES,
    collected: ZERO_RESOURCES,
    found: ZERO_RESOURCES,
    spent: ZERO_RESOURCES,
    sinceUpgrade,
  };
}

function changeResources(
  run: RunState,
  resources: Resources,
  category: 'produced' | 'collected' | 'found' | 'spent',
): RunState {
  const previous = run.resourceLedger[category];
  const sign = category === 'spent' ? -1 : 1;
  const totals = {
    wood: assertAmount(previous.wood + sign * (resources.wood - run.resources.wood)),
    stone: assertAmount(previous.stone + sign * (resources.stone - run.resources.stone)),
  };
  return { ...run, resources, resourceLedger: { ...run.resourceLedger, [category]: totals } };
}

function success(state: SaveBundle): ExpeditionActionResult {
  return { ok: true, state };
}

function reject(state: SaveBundle, error: ExpeditionErrorCode): ExpeditionActionResult {
  return { ok: false, state, error };
}

export function getRunMaxHp(
  profile: Pick<Profile, 'perkIds'>,
  definition: Pick<ExpeditionDefinition, 'baseHp' | 'hpMultiplier'>,
): number {
  return assertAmount(
    profile.perkIds.includes('reinforced-core')
      ? Math.round(definition.baseHp * definition.hpMultiplier)
      : definition.baseHp,
  );
}

export function createExpedition(definition: ExpeditionDefinition, now: number): SaveBundle {
  validateExpeditionDefinition(definition);
  validateTime(now);
  return {
    schemaVersion: definition.outpost === undefined ? 8 : 9,
    contentVersion: definition.contentVersion,
    profile: {
      points: 0,
      totalPoints: 0,
      perkIds: [],
      researchNodeIds: [],
      equippedPreparationId: null,
      selectedVariantIds: {},
      clearedWorldIds: [],
      nextRunSequence: 1,
      settledThrough: 0,
      discoveredClueIds: [],
      dialogueChoices: {},
      completedObjectiveIds: [],
      selectedDifficultyModifierIds: {},
    },
    activeRun: null,
    lastSettlement: null,
    legacyArchive: null,
    outpost: definition.outpost === undefined ? null : createOutpost(definition.outpost),
    lastSimulatedAt: now,
  };
}

function advanceSnowExpedition(
  state: SaveBundle,
  run: RunState,
  world: WorldDefinition,
  mode: SnowObservatoryModeDefinition,
  now: number,
  definition: ExpeditionDefinition,
): SaveBundle {
  const snow = run.snowState;
  if (snow === null) throw new Error('Snow mode run is missing its environment state');
  const stageDuration = getStageDuration(run, mode.stageDurationMs, definition);
  const fuelBurnPerSecond =
    mode.fuelBurnPerSecond * getModifierMultiplier(run, definition, 'snow-fuel-burn-multiplier');
  const stageRemainingMs = Math.max(0, stageDuration - run.elapsedInStageMs);
  let elapsedMs = Math.min(now - state.lastSimulatedAt, stageRemainingMs);
  let fuel = snow.fuel;
  let fuelConsumed = snow.fuelConsumed;
  let temperature = snow.temperature;
  let heaterOn = snow.heaterOn;
  let pendingReason: SnowRunState['pendingReason'] = null;

  if (heaterOn && fuel <= 0) {
    elapsedMs = 0;
    heaterOn = false;
    pendingReason = 'fuel-depleted';
  } else if (heaterOn && fuel > 0 && fuelBurnPerSecond > 0) {
    const fuelAvailableMs = (fuel / fuelBurnPerSecond) * 1000;
    if (fuelAvailableMs <= elapsedMs) {
      elapsedMs = fuelAvailableMs;
      fuelConsumed += fuel;
      fuel = 0;
      temperature = Math.min(
        mode.temperatureCap,
        temperature + mode.heatingPerSecond * (elapsedMs / 1000),
      );
      heaterOn = false;
      pendingReason = 'fuel-depleted';
    } else {
      const burned = fuelBurnPerSecond * (elapsedMs / 1000);
      fuel = Math.max(0, fuel - burned);
      fuelConsumed += burned;
      temperature = Math.min(
        mode.temperatureCap,
        temperature + mode.heatingPerSecond * (elapsedMs / 1000),
      );
    }
  } else {
    heaterOn = false;
    if (temperature <= mode.dangerTemperature) {
      elapsedMs = 0;
      pendingReason = 'low-temperature';
    } else if (mode.coolingPerSecond > 0) {
      const timeToDangerMs =
        ((temperature - mode.dangerTemperature) / mode.coolingPerSecond) * 1000;
      if (timeToDangerMs <= elapsedMs) {
        elapsedMs = timeToDangerMs;
        temperature = mode.dangerTemperature;
        pendingReason = 'low-temperature';
      } else {
        temperature = Math.max(
          mode.dangerTemperature,
          temperature - mode.coolingPerSecond * (elapsedMs / 1000),
        );
      }
    }
  }

  if (pendingReason === null && elapsedMs >= stageRemainingMs) pendingReason = 'checkpoint';
  const nodesResolved =
    pendingReason === 'checkpoint'
      ? Math.min(mode.nodeCount, snow.nodesResolved + 1)
      : snow.nodesResolved;
  const production = getProductionOverInterval(run, world, state.profile, definition, elapsedMs);
  const resources = addCapped(run.resources, production, world.resourceCaps);
  const updatedRun = changeResources(run, resources, 'produced');
  return {
    ...state,
    lastSimulatedAt: now,
    activeRun: {
      ...advanceWorkerTransition(updatedRun, elapsedMs),
      phase: pendingReason === null ? 'preparing' : 'awaiting-environment',
      elapsedInStageMs: run.elapsedInStageMs + elapsedMs,
      snowState: {
        ...snow,
        fuel,
        fuelConsumed,
        temperature,
        heaterOn,
        nodesResolved,
        pendingReason,
      },
    },
  };
}

/** The preparation boundary also limits production, including across background or offline gaps. */
function advanceExpeditionRules(
  state: SaveBundle,
  definition: ExpeditionDefinition,
  now: number,
): SaveBundle {
  validateTime(now);
  if (now <= state.lastSimulatedAt) return state;
  const run = state.activeRun;
  if (!run) return { ...state, lastSimulatedAt: now };
  if (hasUnresolvedBlockingEvent(run, definition)) return { ...state, lastSimulatedAt: now };
  if (run.phase !== 'preparing') {
    const transitionedRun = advanceWorkerTransition(run, now - state.lastSimulatedAt);
    return { ...state, activeRun: transitionedRun, lastSimulatedAt: now };
  }
  const world = getWorld(run, definition);
  const snowMode = getSnowMode(world);
  if (snowMode !== null) return advanceSnowExpedition(state, run, world, snowMode, now, definition);
  const preparationMs = world.preparationMs;
  if (preparationMs === undefined) throw new Error('Wave-survival world has no wave schedule');
  const baseDuration = preparationMs[run.clearedWaves];
  if (baseDuration === undefined) throw new Error('Invalid preparation stage');
  const duration = getStageDuration(run, baseDuration, definition);
  const elapsed = Math.min(now - state.lastSimulatedAt, duration - run.elapsedInStageMs);
  const transitionElapsed =
    run.workerTransition === null ? 0 : Math.min(elapsed, run.workerTransition.remainingMs);
  let nextRun = advanceWorkerTransition(run, transitionElapsed);
  if (transitionElapsed > 0) {
    const transitionProduction = getProductionOverInterval(
      run,
      world,
      state.profile,
      definition,
      transitionElapsed,
    );
    nextRun = changeResources(
      nextRun,
      addCapped(nextRun.resources, transitionProduction, world.resourceCaps),
      'produced',
    );
  }
  let remainingElapsed = elapsed - transitionElapsed;
  const project = getAssignedProject(run, definition);
  if (project && run.activeProject) {
    const projectWorkMs = Math.min(project.durationMs - run.activeProject.elapsedMs, elapsed);
    if (projectWorkMs > 0) {
      const production = getProduction(nextRun, world, state.profile, definition);
      const resources = addCapped(
        nextRun.resources,
        {
          wood: production.wood * (projectWorkMs / 1000),
          stone: production.stone * (projectWorkMs / 1000),
        },
        world.resourceCaps,
      );
      nextRun = changeResources(nextRun, resources, 'produced');
      remainingElapsed -= projectWorkMs;
      const projectElapsedMs = run.activeProject.elapsedMs + projectWorkMs;
      if (projectElapsedMs >= project.durationMs) {
        const objective = definition.objectives.find(
          (candidate) => candidate.id === project.objectiveId,
        );
        const clueId = objective?.clueId;
        const recoveredClueIds =
          clueId !== null &&
          clueId !== undefined &&
          !state.profile.discoveredClueIds.includes(clueId) &&
          !nextRun.recoveredClueIds.includes(clueId)
            ? [...nextRun.recoveredClueIds, clueId]
            : nextRun.recoveredClueIds;
        nextRun = {
          ...nextRun,
          activeProject: null,
          completedProjectIds: [...nextRun.completedProjectIds, project.id],
          recoveredClueIds,
        };
      } else {
        nextRun = {
          ...nextRun,
          activeProject: { ...run.activeProject, elapsedMs: projectElapsedMs },
        };
      }
    }
  }
  if (remainingElapsed > 0) {
    const production = getProduction(nextRun, world, state.profile, definition);
    const resources = addCapped(
      nextRun.resources,
      {
        wood: production.wood * (remainingElapsed / 1000),
        stone: production.stone * (remainingElapsed / 1000),
      },
      world.resourceCaps,
    );
    nextRun = changeResources(nextRun, resources, 'produced');
  }
  const elapsedInStageMs = run.elapsedInStageMs + elapsed;
  return {
    ...state,
    lastSimulatedAt: now,
    activeRun: {
      ...nextRun,
      elapsedInStageMs,
      phase: elapsedInStageMs >= duration ? 'awaiting-wave' : 'preparing',
    },
  };
}

export function advanceExpedition(
  state: SaveBundle,
  definition: ExpeditionDefinition,
  now: number,
): SaveBundle {
  if (definition.outpost === undefined || state.outpost === null || now <= state.lastSimulatedAt)
    return advanceExpeditionRules(state, definition, now);
  const outpost = advanceOutpost(state.outpost, definition.outpost, state.lastSimulatedAt, now);
  const advanced = advanceExpeditionRules(state, definition, now);
  return { ...advanced, outpost };
}

function settle(
  state: SaveBundle,
  definition: ExpeditionDefinition,
  abandoned: boolean,
): ExpeditionActionResult {
  const run = state.activeRun;
  if (!run) return reject(state, 'WRONG_PHASE');
  if (run.sequence <= state.profile.settledThrough) return reject(state, 'ALREADY_CHOSEN');
  if (!abandoned && !canReturn(run, definition)) return reject(state, 'TASK_NOT_READY');
  const hasSecuredReturn = run.securedObjectiveIds.length > 0;
  const outcome =
    !abandoned && run.phase !== 'failed'
      ? 'success'
      : hasSecuredReturn
        ? 'secured'
        : run.phase === 'failed'
          ? 'failed'
          : 'abandoned';
  const rewards =
    outcome === 'success'
      ? getRewards(run, definition)
      : outcome === 'secured'
        ? run.securedRewards
        : [];
  const completedObjectiveIds =
    outcome === 'success'
      ? getCompletedObjectiveIds(run, definition)
      : outcome === 'secured'
        ? run.securedObjectiveIds
        : [];
  const objectiveClueIds = completedObjectiveIds.flatMap((objectiveId) => {
    const objective = definition.objectives.find((candidate) => candidate.id === objectiveId);
    return objective?.clueId === null || objective?.clueId === undefined ? [] : [objective.clueId];
  });
  const points = rewards.reduce((sum, reward) => sum + reward.points, 0);
  const balance = state.profile.points + points;
  const total = state.profile.totalPoints + points;
  if (
    !isSafeAmount(balance) ||
    !isSafeAmount(total) ||
    !Number.isSafeInteger(balance) ||
    !Number.isSafeInteger(total)
  ) {
    return reject(state, 'NUMERIC_LIMIT');
  }
  return success({
    ...state,
    activeRun: null,
    profile: {
      ...state.profile,
      points: balance,
      totalPoints: total,
      settledThrough: run.sequence,
      discoveredClueIds:
        outcome === 'success' || outcome === 'secured'
          ? [
              ...new Set([
                ...state.profile.discoveredClueIds,
                ...(outcome === 'success' ? getReturnClues(run, definition) : run.securedClueIds),
                ...(outcome === 'success' ? run.recoveredClueIds : []),
                ...objectiveClueIds,
              ]),
            ]
          : state.profile.discoveredClueIds,
      completedObjectiveIds:
        outcome === 'success' || outcome === 'secured'
          ? [...new Set([...state.profile.completedObjectiveIds, ...completedObjectiveIds])]
          : state.profile.completedObjectiveIds,
      clearedWorldIds:
        (outcome === 'success' || outcome === 'secured') &&
        !state.profile.clearedWorldIds.includes(run.worldId)
          ? [...state.profile.clearedWorldIds, run.worldId]
          : state.profile.clearedWorldIds,
    },
    lastSettlement: {
      sequence: run.sequence,
      worldId: run.worldId,
      contractId: run.contractId,
      outcome,
      clearedWaves: run.clearedWaves,
      rewards,
      points,
      completedObjectiveIds,
      difficultyModifierIds: run.difficultyModifierIds,
      difficultyScore: getDifficultyScore(run, definition),
    },
  });
}

/** Commands consume an already advanced state and never read the clock. */
export function applyExpeditionCommand(
  state: SaveBundle,
  definition: ExpeditionDefinition,
  command: ExpeditionCommand,
): ExpeditionActionResult {
  if (
    command.kind === 'set-outpost-workers' ||
    command.kind === 'set-outpost-job-target' ||
    command.kind === 'acknowledge-outpost-report' ||
    command.kind === 'build-outpost-facility' ||
    command.kind === 'start-outpost-recipe' ||
    command.kind === 'stop-outpost-recipe'
  ) {
    if (state.outpost === null || definition.outpost === undefined)
      return reject(state, 'WRONG_PHASE');
    const result = applyOutpostCommand(
      state.outpost,
      definition.outpost,
      command,
      state.profile.discoveredClueIds,
    );
    return result.ok ? success({ ...state, outpost: result.state }) : reject(state, result.error);
  }
  const run = state.activeRun;
  if (
    run &&
    hasUnresolvedBlockingEvent(run, definition) &&
    command.kind !== 'choose-event' &&
    command.kind !== 'abandon' &&
    command.kind !== 'tick'
  )
    return reject(state, 'EVENT_REQUIRED');
  switch (command.kind) {
    case 'tick':
      return success(state);
    case 'enter-world': {
      const world = definition.worlds.find((candidate) => candidate.id === command.worldId);
      if (!world) return reject(state, 'UNKNOWN_ID');
      if (run) return reject(state, 'WRONG_PHASE');
      if (!isWorldAvailable(state.profile, world)) return reject(state, 'LOCKED');
      const variant = getSelectedVariant(state.profile, world.id, definition);
      if (variant && command.contractId !== undefined && command.contractId !== variant.contractId)
        return reject(state, 'LOCKED');
      const contract = variant
        ? definition.contracts.find((candidate) => candidate.id === variant.contractId)
        : command.contractId
          ? definition.contracts.find((candidate) => candidate.id === command.contractId)
          : definition.contracts.find(
              (candidate) => candidate.worldId === world.id && candidate.isDefault,
            );
      if (!contract) return reject(state, command.contractId ? 'UNKNOWN_ID' : 'TASK_NOT_READY');
      if (contract.worldId !== world.id) return reject(state, 'LOCKED');
      if (!isContractAvailable(state.profile, contract)) return reject(state, 'LOCKED');
      const sequence = state.profile.nextRunSequence;
      if (!Number.isSafeInteger(sequence + 1)) return reject(state, 'NUMERIC_LIMIT');
      const randomEventSeed = command.seed ?? sequence;
      if (!Number.isSafeInteger(randomEventSeed) || randomEventSeed < 0)
        return reject(state, 'INVALID_SELECTION');
      const selectedModifierIds = state.profile.selectedDifficultyModifierIds?.[world.id] ?? [];
      const difficultyModifierIds = getModifierDefinitions(definition)
        .filter(
          (modifier) =>
            selectedModifierIds.includes(modifier.id) &&
            modifier.appliesToModes.includes(getModeKind(world)),
        )
        .map((modifier) => modifier.id);
      const startingResources = getStartingResources(
        state.profile,
        world,
        definition,
        variant,
        difficultyModifierIds,
      );
      const maxHp = getRunMaxHp(state.profile, definition);
      const snowMode = getSnowMode(world);
      return success({
        ...state,
        profile: { ...state.profile, nextRunSequence: sequence + 1 },
        activeRun: {
          sequence,
          worldId: world.id,
          contractId: contract.id,
          variantId: variant?.id ?? null,
          preparationId: getApplicablePreparationId(state.profile, world.id, definition),
          phase: 'preparing',
          snowState:
            snowMode === null
              ? null
              : {
                  fuel: snowMode.initialFuel,
                  fuelFromWood: 0,
                  fuelConsumed: 0,
                  temperature: snowMode.initialTemperature,
                  generatorIntegrity: snowMode.initialGeneratorIntegrity,
                  heaterOn: true,
                  nodesResolved: 0,
                  pendingReason: null,
                },
          anchorCityState:
            world.mode?.kind === 'anchor-city' ? { stability: world.mode.initialStability } : null,
          resources: startingResources,
          resourceLedger: createResourceLedger(startingResources),
          eventChoices: {},
          activeProject: null,
          completedProjectIds: [],
          difficultyModifierIds,
          randomEventSeed,
          randomEventId: getRandomEventId(world, contract.id, variant, randomEventSeed, definition),
          randomEventsEnabled: definition.events.some((event) => event.randomPool === 'incident'),
          workerTransition: null,
          workerPresetId: 'balanced',
          stanceId: 'balanced',
          stanceChosen: false,
          initiativePoints: 0,
          securedRewards: [],
          securedObjectiveIds: [],
          securedClueIds: [],
          buildings: { shelter: 0, 'lumber-camp': 0, quarry: 0, wall: 0, tower: 0, monument: 0 },
          hp: maxHp,
          maxHp,
          clearedWaves: 0,
          elapsedInStageMs: 0,
          gatherAvailableAt: state.lastSimulatedAt,
          beaconChoice: null,
          boostedFinal: false,
          repairUsed: false,
          braceUsed: false,
          braceArmed: false,
          investigationDiscountUsed: false,
          lastBattle: null,
          recoveredClueIds: [],
        },
      });
    }
    case 'select-difficulty-modifiers': {
      if (run) return reject(state, 'WRONG_PHASE');
      const world = definition.worlds.find((item) => item.id === command.worldId);
      if (!world) return reject(state, 'UNKNOWN_ID');
      if (!isWorldAvailable(state.profile, world)) return reject(state, 'LOCKED');
      if (new Set(command.modifierIds).size !== command.modifierIds.length)
        return reject(state, 'INVALID_SELECTION');
      const modifiers = getModifierDefinitions(definition);
      if (
        command.modifierIds.some(
          (id) =>
            !modifiers.some(
              (modifier) =>
                modifier.id === id && modifier.appliesToModes.includes(getModeKind(world)),
            ),
        )
      )
        return reject(state, 'INVALID_SELECTION');
      const modifierIds = modifiers
        .filter((modifier) => command.modifierIds.includes(modifier.id))
        .map((modifier) => modifier.id);
      if (
        JSON.stringify(state.profile.selectedDifficultyModifierIds?.[world.id] ?? []) ===
        JSON.stringify(modifierIds)
      )
        return success(state);
      return success({
        ...state,
        profile: {
          ...state.profile,
          selectedDifficultyModifierIds: {
            ...state.profile.selectedDifficultyModifierIds,
            [world.id]: modifierIds,
          },
        },
      });
    }
    case 'research-node': {
      const node = getResearchNode(command.researchNodeId, definition);
      if (!node) return reject(state, 'UNKNOWN_ID');
      if (run) return reject(state, 'WRONG_PHASE');
      if (state.profile.researchNodeIds.includes(node.id))
        return reject(state, 'ALREADY_PURCHASED');
      if (!isResearchNodeAvailable(state.profile, node, definition)) return reject(state, 'LOCKED');
      if (state.profile.points < node.cost) return reject(state, 'INSUFFICIENT_RESOURCES');
      return success({
        ...state,
        profile: {
          ...state.profile,
          points: state.profile.points - node.cost,
          researchNodeIds: [...state.profile.researchNodeIds, node.id],
        },
      });
    }
    case 'equip-preparation': {
      if (run) return reject(state, 'WRONG_PHASE');
      if (
        command.researchNodeId !== null &&
        !state.profile.researchNodeIds.includes(command.researchNodeId)
      )
        return reject(state, 'LOCKED');
      if (command.researchNodeId === state.profile.equippedPreparationId) return success(state);
      return success({
        ...state,
        profile: { ...state.profile, equippedPreparationId: command.researchNodeId },
      });
    }
    case 'select-world-variant': {
      if (run) return reject(state, 'WRONG_PHASE');
      if (command.worldVariantId === null) {
        if (command.worldId === undefined) return reject(state, 'INVALID_SELECTION');
        if (!definition.worlds.some((world) => world.id === command.worldId))
          return reject(state, 'UNKNOWN_ID');
        if (!WORLD_VARIANTS(definition).some((variant) => variant.worldId === command.worldId))
          return reject(state, 'INVALID_SELECTION');
        if (!state.profile.clearedWorldIds.includes(command.worldId))
          return reject(state, 'LOCKED');
        if (state.profile.selectedVariantIds[command.worldId] === undefined) return success(state);
        const selectedVariantIds = { ...state.profile.selectedVariantIds };
        delete selectedVariantIds[command.worldId];
        return success({
          ...state,
          profile: { ...state.profile, selectedVariantIds },
        });
      }
      const variant = WORLD_VARIANTS(definition).find(
        (candidate) => candidate.id === command.worldVariantId,
      );
      if (!variant) return reject(state, 'UNKNOWN_ID');
      if (!isWorldVariantAvailable(state.profile, variant, definition))
        return reject(state, 'LOCKED');
      if (state.profile.selectedVariantIds[variant.worldId] === variant.id) return success(state);
      return success({
        ...state,
        profile: {
          ...state.profile,
          selectedVariantIds: {
            ...state.profile.selectedVariantIds,
            [variant.worldId]: variant.id,
          },
        },
      });
    }
    case 'buy-perk': {
      const perk = definition.perks.find((candidate) => candidate.id === command.perkId);
      if (!perk) return reject(state, 'UNKNOWN_ID');
      if (run) return reject(state, 'WRONG_PHASE');
      if (state.profile.perkIds.includes(perk.id)) return reject(state, 'ALREADY_PURCHASED');
      if (state.profile.points < perk.cost) return reject(state, 'INSUFFICIENT_RESOURCES');
      return success({
        ...state,
        profile: {
          ...state.profile,
          points: state.profile.points - perk.cost,
          perkIds: [...state.profile.perkIds, perk.id],
        },
      });
    }
    case 'secure-rewards': {
      if (!run) return reject(state, 'WRONG_PHASE');
      if (!canSecureRewards(run, definition)) return reject(state, 'TASK_NOT_READY');
      return success({
        ...state,
        activeRun: {
          ...run,
          securedRewards: getEarnedRewards(run, definition, false),
          securedObjectiveIds: getCompletedObjectiveIds(run, definition),
          securedClueIds: getSecureClueIds(run, definition),
        },
      });
    }
    case 'return':
      return settle(state, definition, false);
    case 'abandon':
      return settle(state, definition, true);
    case 'gather': {
      if (command.resource !== 'wood' && command.resource !== 'stone')
        return reject(state, 'UNKNOWN_ID');
      if (!run || run.phase !== 'preparing') return reject(state, 'WRONG_PHASE');
      if (state.lastSimulatedAt < run.gatherAvailableAt) return reject(state, 'COOLDOWN');
      const gatherAvailableAt = state.lastSimulatedAt + definition.gatherCooldownMs;
      if (!isSafeAmount(gatherAvailableAt) || gatherAvailableAt <= state.lastSimulatedAt)
        return reject(state, 'NUMERIC_LIMIT');
      const yieldAmount =
        definition.gatherYield *
        (state.profile.perkIds.includes('harvest-training') ? definition.harvestMultiplier : 1);
      if (!isSafeAmount(yieldAmount)) return reject(state, 'NUMERIC_LIMIT');
      const world = getWorld(run, definition);
      const resources = addCapped(
        run.resources,
        {
          wood: command.resource === 'wood' ? yieldAmount : 0,
          stone: command.resource === 'stone' ? yieldAmount : 0,
        },
        world.resourceCaps,
      );
      return success({
        ...state,
        activeRun: { ...changeResources(run, resources, 'collected'), gatherAvailableAt },
      });
    }
    case 'build': {
      if (!run) return reject(state, 'WRONG_PHASE');
      const world = getWorld(run, definition);
      const building = world.buildings.find((candidate) => candidate.id === command.buildingId);
      if (!building) return reject(state, 'UNKNOWN_ID');
      if (!isPlayable(run)) return reject(state, 'WRONG_PHASE');
      if (run.clearedWaves < building.unlockAfterWave) return reject(state, 'LOCKED');
      const count = run.buildings[building.id];
      if (count >= building.maxCount) return reject(state, 'MAX_COUNT');
      const cost = getBuildingCost(run, building, definition);
      if (!isSafeAmount(cost.wood) || !isSafeAmount(cost.stone))
        return reject(state, 'NUMERIC_LIMIT');
      if (!canAfford(run.resources, cost)) return reject(state, 'INSUFFICIENT_RESOURCES');
      return success({
        ...state,
        activeRun: {
          ...changeResources(run, spend(run.resources, cost), 'spent'),
          buildings: { ...run.buildings, [building.id]: count + 1 },
          anchorCityState:
            run.anchorCityState === null || building.stabilityBonus === undefined
              ? run.anchorCityState
              : {
                  stability: Math.min(
                    getAnchorCityMode(world)?.stabilityCapacity ?? run.anchorCityState.stability,
                    run.anchorCityState.stability + building.stabilityBonus,
                  ),
                },
        },
      });
    }
    case 'set-workers': {
      if (!run || !isPlayable(run)) return reject(state, 'WRONG_PHASE');
      if (run.workerTransition !== null) return reject(state, 'WORKER_UNAVAILABLE');
      const selectedPreset = definition.workforce.presets.find(
        (item) => item.id === command.presetId,
      );
      if (!selectedPreset) return reject(state, 'UNKNOWN_ID');
      if (command.presetId === run.workerPresetId) return success(state);
      const project = getAssignedProject(run, definition);
      if (
        project &&
        run.activeProject &&
        selectedPreset[run.activeProject.workerRole] < project.workerCount
      )
        return reject(state, 'WORKER_UNAVAILABLE');
      const transitionMs = definition.workerTransitionMs ?? 0;
      return success({
        ...state,
        activeRun:
          transitionMs === 0
            ? { ...run, workerPresetId: command.presetId }
            : {
                ...run,
                workerTransition: { targetPresetId: command.presetId, remainingMs: transitionMs },
              },
      });
    }
    case 'choose-stance': {
      if (!run || run.phase !== 'preparing' || run.clearedWaves !== 0)
        return reject(state, 'WRONG_PHASE');
      if (getSnowMode(getWorld(run, definition)) !== null) return reject(state, 'LOCKED');
      if (run.stanceChosen) return reject(state, 'ALREADY_CHOSEN');
      if (!definition.stances.some((item) => item.id === command.stanceId))
        return reject(state, 'UNKNOWN_ID');
      return success({
        ...state,
        activeRun: { ...run, stanceId: command.stanceId, stanceChosen: true },
      });
    }
    case 'fight-wave':
    case 'fight-early': {
      const early = command.kind === 'fight-early';
      if (!run || (early ? run.phase !== 'preparing' : run.phase !== 'awaiting-wave'))
        return reject(state, 'WRONG_PHASE');
      if (run.workerTransition !== null) return reject(state, 'WORKER_UNAVAILABLE');
      if (hasUnresolvedBlockingEvent(run, definition)) return reject(state, 'EVENT_REQUIRED');
      if (early && run.buildings.shelter < 1) return reject(state, 'TASK_NOT_READY');
      const world = getWorld(run, definition);
      if (getSnowMode(world) !== null) return reject(state, 'LOCKED');
      const wave = run.clearedWaves + 1;
      const earlyBattle = getEarlyBattle(run, world, definition);
      const strength = early ? earlyBattle.strength : getNextStrength(run, world, definition);
      const braceReduction = getBraceReduction(run, definition);
      const defense = getDefense(run, world, definition) + braceReduction;
      const damage = Math.max(0, Math.ceil(strength - defense));
      const hpAfter = Math.max(0, run.hp - damage);
      const survived = hpAfter > 0;
      const clearedWaves = run.clearedWaves + (survived ? 1 : 0);
      const anchorMode = getAnchorCityMode(world);
      const anchorStability =
        survived && anchorMode !== null && run.anchorCityState !== null
          ? Math.max(
              0,
              run.anchorCityState.stability -
                anchorMode.stabilityLossPerWave -
                (early ? anchorMode.earlyPressureLoss : 0),
            )
          : run.anchorCityState?.stability;
      return success({
        ...state,
        activeRun: {
          ...run,
          hp: hpAfter,
          stanceChosen: true,
          initiativePoints: run.initiativePoints + (early && survived ? earlyBattle.bonus : 0),
          clearedWaves,
          anchorCityState:
            run.anchorCityState === null || anchorStability === undefined
              ? run.anchorCityState
              : { stability: anchorStability },
          elapsedInStageMs: 0,
          phase: !survived ? 'failed' : clearedWaves === 3 ? 'completed' : 'preparing',
          braceArmed: false,
          lastBattle: {
            wave,
            strength,
            defense,
            braceReduction,
            damage,
            hpAfter,
            survived,
            stanceId: run.stanceId,
            preparationRemainingMs: early ? earlyBattle.remaining : 0,
            initiativePoints: early && survived ? earlyBattle.bonus : 0,
          },
        },
      });
    }
    case 'choose-beacon': {
      if (command.optionId !== 'salvage' && command.optionId !== 'restore')
        return reject(state, 'UNKNOWN_ID');
      if (!run || !isPlayable(run)) return reject(state, 'WRONG_PHASE');
      if (getSnowMode(getWorld(run, definition)) !== null || run.anchorCityState !== null)
        return reject(state, 'LOCKED');
      if (run.clearedWaves < 1) return reject(state, 'LOCKED');
      if (run.beaconChoice !== null) return reject(state, 'ALREADY_CHOSEN');
      const world = getWorld(run, definition);
      if (command.optionId === 'restore' && !canAfford(run.resources, definition.beaconRestoreCost))
        return reject(state, 'INSUFFICIENT_RESOURCES');
      const resources =
        command.optionId === 'restore'
          ? spend(run.resources, definition.beaconRestoreCost)
          : addCapped(run.resources, definition.beaconSalvageReward, world.resourceCaps);
      return success({
        ...state,
        activeRun: {
          ...changeResources(run, resources, command.optionId === 'restore' ? 'spent' : 'found'),
          beaconChoice: command.optionId,
        },
      });
    }
    case 'choose-event': {
      const event = definition.events.find((candidate) => candidate.id === command.eventId);
      if (!event) return reject(state, 'UNKNOWN_ID');
      if (!run || !isPlayable(run) || event.worldId !== run.worldId)
        return reject(state, 'WRONG_PHASE');
      if (event.afterClearedWaves > run.clearedWaves) return reject(state, 'LOCKED');
      const pendingEvent = getPendingEvents(run, definition).find(
        (candidate) => candidate.id === event.id,
      );
      if (!pendingEvent) return reject(state, 'ALREADY_CHOSEN');
      const option = event.options.find((candidate) => candidate.id === command.optionId);
      if (!option) return reject(state, 'UNKNOWN_ID');
      const contract = getContract(run, definition);
      if (
        option.requiresObjectiveId !== null &&
        ![...contract.primaryObjectiveIds, ...contract.optionalObjectiveIds].includes(
          option.requiresObjectiveId,
        )
      )
        return reject(state, 'LOCKED');
      if (!canAfford(run.resources, option.cost)) return reject(state, 'INSUFFICIENT_RESOURCES');
      const paidRun = changeResources(run, spend(run.resources, option.cost), 'spent');
      const resources = addCapped(
        paidRun.resources,
        option.resourceReward ?? ZERO_RESOURCES,
        getWorld(run, definition).resourceCaps,
      );
      const rewardedRun = changeResources(paidRun, resources, 'found');
      return success({
        ...state,
        activeRun: {
          ...rewardedRun,
          anchorCityState:
            rewardedRun.anchorCityState === null || option.anchorStabilityDelta === undefined
              ? rewardedRun.anchorCityState
              : {
                  stability: Math.max(
                    0,
                    Math.min(
                      getAnchorCityMode(getWorld(run, definition))?.stabilityCapacity ??
                        rewardedRun.anchorCityState.stability,
                      rewardedRun.anchorCityState.stability + option.anchorStabilityDelta,
                    ),
                  ),
                },
          eventChoices: { ...run.eventChoices, [event.id]: option.id },
        },
      });
    }
    case 'start-project': {
      const project = definition.projects.find((candidate) => candidate.id === command.projectId);
      if (!project) return reject(state, 'UNKNOWN_ID');
      if (!run || run.phase !== 'preparing' || project.worldId !== run.worldId)
        return reject(state, 'WRONG_PHASE');
      if (run.activeProject !== null) return reject(state, 'PROJECT_ACTIVE');
      if (run.completedProjectIds.includes(project.id)) return reject(state, 'ALREADY_COMPLETED');
      if (!getUnlockedProjectIds(run, definition).includes(project.id))
        return reject(state, 'EVENT_REQUIRED');
      if (
        command.workerRole !== 'wood' &&
        command.workerRole !== 'stone' &&
        command.workerRole !== 'guard'
      )
        return reject(state, 'UNKNOWN_ID');
      const preset = definition.workforce.presets.find((item) => item.id === run.workerPresetId);
      if (!preset || preset[command.workerRole] < project.workerCount)
        return reject(state, 'WORKER_UNAVAILABLE');
      if (!canAfford(run.resources, project.cost)) return reject(state, 'INSUFFICIENT_RESOURCES');
      const activeRun = changeResources(run, spend(run.resources, project.cost), 'spent');
      return success({
        ...state,
        activeRun: {
          ...activeRun,
          activeProject: { projectId: project.id, workerRole: command.workerRole, elapsedMs: 0 },
        },
      });
    }
    case 'set-final-boost': {
      if (!run || !isPlayable(run) || run.clearedWaves !== 2) return reject(state, 'WRONG_PHASE');
      if (getSnowMode(getWorld(run, definition)) !== null) return reject(state, 'LOCKED');
      return success({ ...state, activeRun: { ...run, boostedFinal: command.enabled } });
    }
    case 'repair': {
      if (!run || !isPlayable(run)) return reject(state, 'WRONG_PHASE');
      if (getSnowMode(getWorld(run, definition)) !== null) return reject(state, 'LOCKED');
      if (!state.profile.perkIds.includes('field-repair')) return reject(state, 'LOCKED');
      if (run.repairUsed) return reject(state, 'ALREADY_CHOSEN');
      if (!canRepair(run, state.profile)) return reject(state, 'TASK_NOT_READY');
      return success({
        ...state,
        activeRun: {
          ...run,
          hp: run.hp + Math.min(definition.repairHp, run.maxHp - run.hp),
          repairUsed: true,
        },
      });
    }
    case 'brace': {
      if (!run || run.phase !== 'awaiting-wave') return reject(state, 'WRONG_PHASE');
      if (getSnowMode(getWorld(run, definition)) !== null) return reject(state, 'LOCKED');
      const effect = getPreparationEffect(run, definition);
      if (effect?.kind !== 'brace-next-wave') return reject(state, 'LOCKED');
      if (run.braceUsed) return reject(state, 'ALREADY_CHOSEN');
      if (hasUnresolvedBlockingEvent(run, definition)) return reject(state, 'EVENT_REQUIRED');
      return success({
        ...state,
        activeRun: { ...run, braceUsed: true, braceArmed: true },
      });
    }
    case 'stoke-furnace': {
      if (!run || run.phase !== 'awaiting-environment' || run.snowState === null)
        return reject(state, 'WRONG_PHASE');
      const mode = getSnowMode(getWorld(run, definition));
      if (mode === null) return reject(state, 'LOCKED');
      const fuelGain = Math.min(mode.stokeFuel, mode.fuelCapacity - run.snowState.fuel);
      if (fuelGain <= 0) return reject(state, 'MAX_COUNT');
      if (!canAfford(run.resources, mode.stokeCost)) return reject(state, 'INSUFFICIENT_RESOURCES');
      return success({
        ...state,
        activeRun: {
          ...changeResources(run, spend(run.resources, mode.stokeCost), 'spent'),
          snowState: {
            ...run.snowState,
            fuel: run.snowState.fuel + fuelGain,
            fuelFromWood: run.snowState.fuelFromWood + fuelGain,
          },
        },
      });
    }
    case 'repair-generator': {
      if (!run || run.phase !== 'awaiting-environment' || run.snowState === null)
        return reject(state, 'WRONG_PHASE');
      const mode = getSnowMode(getWorld(run, definition));
      if (mode === null) return reject(state, 'LOCKED');
      if (run.snowState.generatorIntegrity >= mode.requiredGeneratorIntegrity)
        return reject(state, 'MAX_COUNT');
      if (!canAfford(run.resources, mode.repairCost))
        return reject(state, 'INSUFFICIENT_RESOURCES');
      return success({
        ...state,
        activeRun: {
          ...changeResources(run, spend(run.resources, mode.repairCost), 'spent'),
          snowState: {
            ...run.snowState,
            generatorIntegrity: Math.min(
              mode.generatorIntegrityCapacity,
              run.snowState.generatorIntegrity + mode.repairIntegrity,
            ),
          },
        },
      });
    }
    case 'continue-snow': {
      if (!run || run.phase !== 'awaiting-environment' || run.snowState === null)
        return reject(state, 'WRONG_PHASE');
      const mode = getSnowMode(getWorld(run, definition));
      if (mode === null) return reject(state, 'LOCKED');
      if (hasUnresolvedBlockingEvent(run, definition)) return reject(state, 'EVENT_REQUIRED');
      if (command.heaterOn && run.snowState.fuel <= 0)
        return reject(state, 'INSUFFICIENT_RESOURCES');
      if (
        run.snowState.temperature <= mode.dangerTemperature &&
        (!command.heaterOn || run.snowState.fuel <= 0)
      )
        return reject(state, 'TASK_NOT_READY');
      const resolvedCheckpoint =
        run.snowState.pendingReason === 'checkpoint' ||
        run.elapsedInStageMs >= getStageDuration(run, mode.stageDurationMs, definition);
      const nodesResolved = run.snowState.nodesResolved;
      if (
        nodesResolved >= mode.nodeCount &&
        run.snowState.generatorIntegrity < mode.requiredGeneratorIntegrity
      )
        return reject(state, 'TASK_NOT_READY');
      return success({
        ...state,
        activeRun: {
          ...run,
          phase: nodesResolved >= mode.nodeCount ? 'completed' : 'preparing',
          elapsedInStageMs: resolvedCheckpoint ? 0 : run.elapsedInStageMs,
          snowState: {
            ...run.snowState,
            heaterOn: command.heaterOn,
            nodesResolved,
            pendingReason: null,
          },
        },
      });
    }
    case 'investigate': {
      const clue = definition.story.clues.find((candidate) => candidate.id === command.clueId);
      if (!clue) return reject(state, 'UNKNOWN_ID');
      if (!run || !isPlayable(run)) return reject(state, 'WRONG_PHASE');
      if (clue.source !== 'investigate' || !meetsClueConditions(run, clue))
        return reject(state, 'LOCKED');
      if (
        state.profile.discoveredClueIds.includes(clue.id) ||
        run.recoveredClueIds.includes(clue.id)
      )
        return reject(state, 'ALREADY_CHOSEN');
      const cost = getInvestigationCost(run, clue, definition);
      if (!canAfford(run.resources, cost)) return reject(state, 'INSUFFICIENT_RESOURCES');
      return success({
        ...state,
        activeRun: {
          ...run,
          ...changeResources(run, spend(run.resources, cost), 'spent'),
          recoveredClueIds: [...run.recoveredClueIds, clue.id],
          investigationDiscountUsed:
            getPreparationEffect(run, definition)?.kind === 'investigation-cost-discount'
              ? true
              : run.investigationDiscountUsed,
        },
      });
    }
    case 'choose-dialogue': {
      const dialogue = definition.story.dialogues.find(
        (candidate) => candidate.id === command.dialogueId,
      );
      const option = dialogue?.options.find((candidate) => candidate.id === command.optionId);
      if (!dialogue || !option) return reject(state, 'UNKNOWN_ID');
      if (run) return reject(state, 'WRONG_PHASE');
      if (Object.hasOwn(state.profile.dialogueChoices, dialogue.id))
        return reject(state, 'ALREADY_CHOSEN');
      if (!dialogue.requiredClueIds.every((id) => state.profile.discoveredClueIds.includes(id)))
        return reject(state, 'LOCKED');
      return success({
        ...state,
        profile: {
          ...state.profile,
          dialogueChoices: { ...state.profile.dialogueChoices, [dialogue.id]: option.id },
          discoveredClueIds: state.profile.discoveredClueIds.includes(option.grantsClueId)
            ? state.profile.discoveredClueIds
            : [...state.profile.discoveredClueIds, option.grantsClueId],
        },
      });
    }
  }
}

export function getExpeditionSummary(
  state: SaveBundle,
  definition: ExpeditionDefinition,
): ExpeditionSummary {
  const run = state.activeRun;
  const world = run ? getWorld(run, definition) : definition.worlds[0];
  const buildingCosts = Object.fromEntries(
    BUILDING_IDS.map((id) => {
      const building = world?.buildings.find((candidate) => candidate.id === id);
      const cost = building ? getBuildingCost(run, building, definition) : ZERO_RESOURCES;
      return [
        id,
        {
          wood: isSafeAmount(cost.wood) ? cost.wood : Number.MAX_SAFE_INTEGER,
          stone: isSafeAmount(cost.stone) ? cost.stone : Number.MAX_SAFE_INTEGER,
        },
      ];
    }),
  ) as Record<BuildingId, Resources>;
  const rewards = run ? getRewards(run, definition) : [];
  const playable = run !== null && isPlayable(run);
  const defense =
    run && world ? getDefense(run, world, definition) + getBraceReduction(run, definition) : 0;
  const preparationEffect = run ? getPreparationEffect(run, definition) : undefined;
  const braceDamageReduction =
    preparationEffect?.kind === 'brace-next-wave' ? preparationEffect.damageReduction : 0;
  const nextWaveStrength = playable && world ? getNextStrength(run, world, definition) : 0;
  const earlyBattle =
    playable && world
      ? getEarlyBattle(run, world, definition)
      : { remaining: 0, bonus: 0, strength: 0 };
  const currentProduction =
    run && world && run.phase === 'preparing'
      ? getProduction(run, world, state.profile, definition)
      : ZERO_RESOURCES;
  const earlyYieldForgone = {
    wood: Math.min(
      Math.max(0, (world?.resourceCaps.wood ?? 0) - (run?.resources.wood ?? 0)),
      currentProduction.wood * (earlyBattle.remaining / 1000),
    ),
    stone: Math.min(
      Math.max(0, (world?.resourceCaps.stone ?? 0) - (run?.resources.stone ?? 0)),
      currentProduction.stone * (earlyBattle.remaining / 1000),
    ),
  };
  const rewardTotal = rewards.reduce((sum, reward) => sum + reward.points, 0);
  const securedRewardTotal =
    run?.securedRewards.reduce((sum, reward) => sum + reward.points, 0) ?? 0;
  const nextWaveRewardTotal = run ? getNextWaveRewardTotal(run, definition) : 0;
  const snowMode = world ? getSnowMode(world) : null;
  const snowEnvironment =
    run !== null && world !== undefined && snowMode !== null && run.snowState !== null
      ? (() => {
          const snow = run.snowState;
          const stageElapsedMs =
            run.phase === 'awaiting-environment' && snow.pendingReason === 'checkpoint'
              ? 0
              : run.elapsedInStageMs;
          const stageRemainingMs = Math.max(
            0,
            getStageDuration(run, snowMode.stageDurationMs, definition) - stageElapsedMs,
          );
          const fuelBurnPerSecond =
            snowMode.fuelBurnPerSecond *
            getModifierMultiplier(run, definition, 'snow-fuel-burn-multiplier');
          const timeToFuelDepletionMs =
            snow.heaterOn && fuelBurnPerSecond > 0
              ? (snow.fuel / fuelBurnPerSecond) * 1000
              : Number.POSITIVE_INFINITY;
          const timeToDangerMs =
            !snow.heaterOn && snowMode.coolingPerSecond > 0
              ? Math.max(
                  0,
                  ((snow.temperature - snowMode.dangerTemperature) / snowMode.coolingPerSecond) *
                    1000,
                )
              : Number.POSITIVE_INFINITY;
          const projectedStageMs = Math.min(
            stageRemainingMs,
            timeToFuelDepletionMs,
            timeToDangerMs,
          );
          const projectedSeconds = projectedStageMs / 1000;
          const heatedSeconds = snow.heaterOn
            ? Math.min(projectedSeconds, snow.fuel / fuelBurnPerSecond)
            : 0;
          const unheatedSeconds = projectedSeconds - heatedSeconds;
          const projectedTemperature = Math.min(
            snowMode.temperatureCap,
            snow.temperature +
              snowMode.heatingPerSecond * heatedSeconds -
              snowMode.coolingPerSecond * unheatedSeconds,
          );
          return {
            fuel: snow.fuel,
            fuelCapacity: snowMode.fuelCapacity,
            temperature: snow.temperature,
            dangerTemperature: snowMode.dangerTemperature,
            generatorIntegrity: snow.generatorIntegrity,
            requiredGeneratorIntegrity: snowMode.requiredGeneratorIntegrity,
            heaterOn: snow.heaterOn,
            nodesResolved: snow.nodesResolved,
            nodeCount: snowMode.nodeCount,
            pendingReason: snow.pendingReason,
            projectedTemperature,
            projectedFuel: Math.max(
              0,
              snow.fuel - (snow.heaterOn ? fuelBurnPerSecond * projectedSeconds : 0),
            ),
            projectedStageMs,
            canStoke:
              run.phase === 'awaiting-environment' &&
              snow.fuel < snowMode.fuelCapacity &&
              canAfford(run.resources, snowMode.stokeCost),
            canRepairGenerator:
              run.phase === 'awaiting-environment' &&
              snow.generatorIntegrity < snowMode.requiredGeneratorIntegrity &&
              canAfford(run.resources, snowMode.repairCost),
            canContinue:
              run.phase === 'awaiting-environment' &&
              !hasUnresolvedBlockingEvent(run, definition) &&
              (snow.nodesResolved < snowMode.nodeCount ||
                snow.generatorIntegrity >= snowMode.requiredGeneratorIntegrity),
          };
        })()
      : null;
  return {
    canFightEarly:
      run !== null &&
      run.workerTransition === null &&
      run.phase === 'preparing' &&
      run.buildings.shelter >= 1 &&
      !hasUnresolvedBlockingEvent(run, definition),
    canFightWave:
      run !== null &&
      run.workerTransition === null &&
      run.phase === 'awaiting-wave' &&
      !hasUnresolvedBlockingEvent(run, definition),
    earlyBonus: earlyBattle.bonus,
    earlyWaveStrength: earlyBattle.strength,
    earlyPredictedDamage: playable ? Math.max(0, Math.ceil(earlyBattle.strength - defense)) : 0,
    earlyYieldForgone,
    canChooseStance:
      run !== null && run.phase === 'preparing' && run.clearedWaves === 0 && !run.stanceChosen,
    productionSources:
      run && world && run.phase === 'preparing'
        ? getProductionSources(run, world, state.profile, definition)
        : [],
    availableWorldIds: definition.worlds
      .filter((candidate) => isWorldAvailable(state.profile, candidate))
      .map((candidate) => candidate.id),
    production:
      run && world && run.phase === 'preparing'
        ? getProduction(run, world, state.profile, definition)
        : ZERO_RESOURCES,
    defense,
    nextWaveStrength,
    predictedDamage: playable ? Math.max(0, Math.ceil(nextWaveStrength - defense)) : 0,
    stageRemainingMs:
      run && world && run.phase === 'preparing'
        ? Math.max(
            0,
            getStageDuration(
              run,
              snowMode?.stageDurationMs ?? world.preparationMs?.[run.clearedWaves] ?? 0,
              definition,
            ) - run.elapsedInStageMs,
          )
        : 0,
    buildingCosts,
    availableBuildingIds:
      playable && world
        ? world.buildings
            .filter(
              (building) =>
                run.clearedWaves >= building.unlockAfterWave &&
                run.buildings[building.id] < building.maxCount,
            )
            .map((building) => building.id)
        : [],
    canReturn: run !== null && canReturn(run, definition),
    canSecureRewards: run !== null && canSecureRewards(run, definition),
    rewardPreview: rewards,
    rewardTotal,
    securedRewardTotal,
    atRiskRewardTotal: Math.max(0, rewardTotal - securedRewardTotal),
    nextWaveRewardTotal,
    beaconPending:
      playable &&
      run.anchorCityState === null &&
      snowMode === null &&
      run.clearedWaves >= 1 &&
      run.beaconChoice === null,
    canRepair: run !== null && canRepair(run, state.profile),
    canBrace:
      run !== null &&
      run.phase === 'awaiting-wave' &&
      preparationEffect?.kind === 'brace-next-wave' &&
      !run.braceUsed &&
      !hasUnresolvedBlockingEvent(run, definition),
    braceDamageReduction,
    availableClueIds: playable
      ? definition.story.clues
          .filter(
            (clue) =>
              clue.source === 'investigate' &&
              meetsClueConditions(run, clue) &&
              !state.profile.discoveredClueIds.includes(clue.id) &&
              !run.recoveredClueIds.includes(clue.id),
          )
          .map((clue) => clue.id)
      : [],
    availableResearchNodeIds:
      run === null
        ? RESEARCH_NODES(definition)
            .filter(
              (node) =>
                !state.profile.researchNodeIds.includes(node.id) &&
                isResearchNodeAvailable(state.profile, node, definition),
            )
            .map((node) => node.id)
        : [],
    availableWorldVariantIds:
      run === null
        ? WORLD_VARIANTS(definition)
            .filter((variant) => isWorldVariantAvailable(state.profile, variant, definition))
            .map((variant) => variant.id)
        : [],
    investigationCosts:
      run && playable
        ? Object.fromEntries(
            definition.story.clues
              .filter(
                (clue) =>
                  clue.source === 'investigate' &&
                  meetsClueConditions(run, clue) &&
                  !state.profile.discoveredClueIds.includes(clue.id) &&
                  !run.recoveredClueIds.includes(clue.id),
              )
              .map((clue) => [clue.id, getInvestigationCost(run, clue, definition)]),
          )
        : {},
    pendingDialogueIds:
      run === null
        ? definition.story.dialogues
            .filter(
              (dialogue) =>
                !Object.hasOwn(state.profile.dialogueChoices, dialogue.id) &&
                dialogue.requiredClueIds.every((id) =>
                  state.profile.discoveredClueIds.includes(id),
                ),
            )
            .map((dialogue) => dialogue.id)
        : [],
    availableContractIds: definition.contracts
      .filter((contract) => isContractAvailable(state.profile, contract))
      .map((contract) => contract.id),
    activeContractId: run?.contractId ?? null,
    objectives: run ? getObjectiveProgress(run, definition) : [],
    pendingEvents: run ? getPendingEvents(run, definition) : [],
    availableProjectIds: run && playable ? getUnlockedProjectIds(run, definition) : [],
    activeProject: run?.activeProject ?? null,
    completedProjectIds: run?.completedProjectIds ?? [],
    difficultyModifierIds:
      run?.difficultyModifierIds ??
      (world ? (state.profile.selectedDifficultyModifierIds?.[world.id] ?? []) : []),
    difficultyScore: run
      ? getDifficultyScore(run, definition)
      : world
        ? (state.profile.selectedDifficultyModifierIds?.[world.id] ?? []).reduce(
            (total, id) =>
              total +
              (getModifierDefinitions(definition).find((item) => item.id === id)?.difficulty ?? 0),
            0,
          )
        : 0,
    difficultyReward: run
      ? getDifficultyReward(run, definition)
      : (() => {
          const score = world
            ? (state.profile.selectedDifficultyModifierIds?.[world.id] ?? []).reduce(
                (total, id) =>
                  total +
                  (getModifierDefinitions(definition).find((item) => item.id === id)?.difficulty ??
                    0),
                0,
              )
            : 0;
          return (
            definition.difficultyRewardTiers?.find(
              (tier) =>
                score >= tier.minimumDifficulty &&
                (tier.maximumDifficulty === null || score <= tier.maximumDifficulty),
            )?.points ?? 0
          );
        })(),
    workerTransitionRemainingMs: run?.workerTransition?.remainingMs ?? 0,
    workerTransitionTargetPresetId: run?.workerTransition?.targetPresetId ?? null,
    snowEnvironment,
    anchorStability:
      run?.anchorCityState !== null && run?.anchorCityState !== undefined && world !== undefined
        ? (() => {
            const mode = getAnchorCityMode(world);
            if (mode === null) return null;
            return {
              current: run.anchorCityState.stability,
              capacity: mode.stabilityCapacity,
              nextWaveLoss: mode.stabilityLossPerWave,
              earlyPressureLoss: mode.earlyPressureLoss,
              optionalRouteThreshold: 65,
            };
          })()
        : null,
  };
}
