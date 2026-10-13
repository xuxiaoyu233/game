import type { ExpeditionDefinition, Resources } from './types';
import { validateOutpostDefinition } from '../outpost/validation';

const BUILDING_IDS = ['shelter', 'lumber-camp', 'quarry', 'wall', 'tower', 'monument'] as const;
const PERK_IDS = ['harvest-training', 'reinforced-core', 'field-repair'] as const;
const STABLE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

function requireAmount(value: number, label: string, positive = false): void {
  if (
    !Number.isFinite(value) ||
    value > Number.MAX_SAFE_INTEGER ||
    value < 0 ||
    (positive && value === 0)
  ) {
    throw new RangeError(
      `${label} must be a finite safe ${positive ? 'positive' : 'nonnegative'} amount`,
    );
  }
}

function requireSignedFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)
    throw new RangeError(`${label} must be a finite safe number`);
}

function requireInteger(value: number, label: string, positive = false): void {
  requireAmount(value, label, positive);
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be an integer`);
}

function requireResources(resources: Resources, label: string, positive = false): void {
  if (
    Object.keys(resources).length !== 2 ||
    !Object.hasOwn(resources, 'wood') ||
    !Object.hasOwn(resources, 'stone')
  ) {
    throw new Error(`${label} must contain exactly wood and stone`);
  }
  requireAmount(resources.wood, `${label}.wood`, positive);
  requireAmount(resources.stone, `${label}.stone`, positive);
}

export function validateExpeditionDefinition(definition: ExpeditionDefinition): void {
  if (!/^\d+\.\d+\.\d+$/.test(definition.contentVersion))
    throw new Error('Invalid content version');
  if (definition.worlds.length === 0) throw new Error('At least one world is required');
  const contentIds = new Set<string>();
  const registerContentId = (id: string, label: string): void => {
    if (!STABLE_ID.test(id) || contentIds.has(id))
      throw new Error(`Invalid or duplicate stable content ID: ${label}/${id}`);
    contentIds.add(id);
  };
  requireInteger(definition.workforce.size, 'workforce.size', true);
  requireAmount(definition.workforce.woodRate, 'workforce.woodRate');
  requireAmount(definition.workforce.stoneRate, 'workforce.stoneRate');
  requireAmount(definition.workforce.guardDefense, 'workforce.guardDefense');
  const workerIds = new Set<string>();
  for (const preset of definition.workforce.presets) {
    if (!['balanced', 'logging', 'mining', 'guard'].includes(preset.id) || workerIds.has(preset.id))
      throw new Error('Invalid workforce preset');
    workerIds.add(preset.id);
    if (preset.contentId !== undefined) registerContentId(preset.contentId, 'worker preset');
    for (const count of [preset.wood, preset.stone, preset.guard])
      requireInteger(count, 'worker count');
    if (preset.wood + preset.stone + preset.guard !== definition.workforce.size)
      throw new Error('Workforce allocation must conserve people');
  }
  if (workerIds.size !== 4) throw new Error('Missing workforce presets');
  const stanceIds = new Set<string>();
  for (const stance of definition.stances) {
    if (!['balanced', 'industry', 'fortified'].includes(stance.id) || stanceIds.has(stance.id))
      throw new Error('Invalid strategy');
    stanceIds.add(stance.id);
    if (stance.contentId !== undefined) registerContentId(stance.contentId, 'stance');
    requireAmount(stance.productionMultiplier, 'stance.productionMultiplier', true);
    requireAmount(stance.defenseMultiplier, 'stance.defenseMultiplier', true);
  }
  if (stanceIds.size !== 3) throw new Error('Missing strategies');
  requireInteger(definition.earlyBattle.maxPointsPerWave, 'earlyBattle.maxPointsPerWave', true);
  requireAmount(definition.earlyBattle.pressureMultiplier, 'earlyBattle.pressureMultiplier');
  requireAmount(definition.workerTransitionMs ?? 0, 'workerTransitionMs');
  requireAmount(definition.gatherCooldownMs, 'gatherCooldownMs', true);
  requireAmount(definition.gatherYield, 'gatherYield', true);
  requireAmount(definition.harvestMultiplier, 'harvestMultiplier', true);
  requireAmount(definition.hpMultiplier, 'hpMultiplier', true);
  requireAmount(definition.repairHp, 'repairHp', true);
  requireAmount(definition.finalWaveMultiplier, 'finalWaveMultiplier', true);
  if (
    definition.harvestMultiplier < 1 ||
    definition.hpMultiplier < 1 ||
    definition.finalWaveMultiplier < 1
  ) {
    throw new Error('Permanent and challenge multipliers must be at least one');
  }
  requireAmount(
    definition.gatherYield * definition.harvestMultiplier,
    'upgraded gather yield',
    true,
  );
  requireAmount(definition.baseHp, 'baseHp', true);
  requireAmount(Math.round(definition.baseHp * definition.hpMultiplier), 'upgraded maxHp', true);
  requireAmount(definition.baseDefense, 'baseDefense');
  requireResources(definition.beaconRestoreCost, 'beaconRestoreCost');
  requireResources(definition.beaconSalvageReward, 'beaconSalvageReward');
  requireAmount(definition.beaconDefense, 'beaconDefense');
  for (const [id, points] of Object.entries(definition.rewards))
    requireInteger(points, `rewards.${id}`);
  requireInteger(
    Object.values(definition.rewards).reduce((sum, points) => sum + points, 0) +
      definition.earlyBattle.maxPointsPerWave * 3,
    'total rewards',
  );

  const worldIds = new Set<string>();
  for (const world of definition.worlds) {
    if (!STABLE_ID.test(world.id) || worldIds.has(world.id))
      throw new Error(`Invalid or duplicate world ID: ${world.id}`);
    worldIds.add(world.id);
    registerContentId(world.id, 'world');
    requireResources(world.initialResources, `${world.id}.initialResources`);
    requireResources(world.resourceCaps, `${world.id}.resourceCaps`, true);
    requireResources(world.baseProduction, `${world.id}.baseProduction`);
    if (world.resourceDefinitions !== undefined) {
      const slots = new Set<string>();
      for (const resource of world.resourceDefinitions) {
        if (slots.has(resource.slot))
          throw new Error(`Duplicate resource slot in ${world.id}: ${resource.slot}`);
        slots.add(resource.slot);
        registerContentId(resource.id, `${world.id}.resource`);
      }
      if (slots.size !== 2 || !slots.has('wood') || !slots.has('stone'))
        throw new Error(`World resource mapping must bind both engine slots: ${world.id}`);
    }
    if (
      world.initialResources.wood > world.resourceCaps.wood ||
      world.initialResources.stone > world.resourceCaps.stone
    ) {
      throw new Error(`Initial resources exceed caps in ${world.id}`);
    }
    const mode = world.mode ?? { kind: 'wave-survival' as const };
    let maxDurationMs: number;
    if (mode.kind === 'wave-survival' || mode.kind === 'anchor-city') {
      if (
        world.waveStrengths === undefined ||
        world.preparationMs === undefined ||
        world.waveStrengths.length !== 3 ||
        world.preparationMs.length !== 3
      )
        throw new Error('Wave-survival worlds require a fixed three-wave schedule');
      for (const strength of world.waveStrengths) {
        requireAmount(strength, `${world.id}.waveStrength`, true);
        requireAmount(
          Math.ceil(
            strength *
              definition.finalWaveMultiplier *
              (1 + definition.earlyBattle.pressureMultiplier),
          ),
          `${world.id}.boostedStrength`,
          true,
        );
      }
      for (const duration of world.preparationMs)
        requireAmount(duration, `${world.id}.preparationMs`, true);
      if (mode.kind === 'anchor-city') {
        requireAmount(mode.initialStability, `${world.id}.initialStability`, true);
        requireAmount(mode.stabilityCapacity, `${world.id}.stabilityCapacity`, true);
        requireAmount(mode.stabilityLossPerWave, `${world.id}.stabilityLossPerWave`);
        requireAmount(mode.earlyPressureLoss, `${world.id}.earlyPressureLoss`);
        if (mode.initialStability > mode.stabilityCapacity)
          throw new Error(`Anchor stability exceeds capacity in ${world.id}`);
      }
      maxDurationMs = Math.max(...world.preparationMs);
    } else {
      if (world.waveStrengths !== undefined || world.preparationMs !== undefined)
        throw new Error('Snow observatory worlds cannot declare wave schedules');
      requireInteger(mode.stageDurationMs, `${world.id}.stageDurationMs`, true);
      requireInteger(mode.nodeCount, `${world.id}.nodeCount`, true);
      requireAmount(mode.initialFuel, `${world.id}.initialFuel`, true);
      requireAmount(mode.fuelCapacity, `${world.id}.fuelCapacity`, true);
      requireAmount(mode.fuelBurnPerSecond, `${world.id}.fuelBurnPerSecond`, true);
      requireAmount(mode.heatingPerSecond, `${world.id}.heatingPerSecond`, true);
      requireAmount(mode.coolingPerSecond, `${world.id}.coolingPerSecond`, true);
      requireSignedFinite(mode.initialTemperature, `${world.id}.initialTemperature`);
      requireSignedFinite(mode.dangerTemperature, `${world.id}.dangerTemperature`);
      requireSignedFinite(mode.temperatureCap, `${world.id}.temperatureCap`);
      requireAmount(mode.initialGeneratorIntegrity, `${world.id}.initialGeneratorIntegrity`);
      requireAmount(
        mode.generatorIntegrityCapacity,
        `${world.id}.generatorIntegrityCapacity`,
        true,
      );
      requireAmount(
        mode.requiredGeneratorIntegrity,
        `${world.id}.requiredGeneratorIntegrity`,
        true,
      );
      requireResources(mode.repairCost, `${world.id}.repairCost`);
      requireAmount(mode.repairIntegrity, `${world.id}.repairIntegrity`, true);
      requireResources(mode.stokeCost, `${world.id}.stokeCost`);
      requireAmount(mode.stokeFuel, `${world.id}.stokeFuel`, true);
      if (
        mode.initialFuel > mode.fuelCapacity ||
        mode.initialTemperature <= mode.dangerTemperature ||
        mode.temperatureCap <= mode.dangerTemperature ||
        mode.initialGeneratorIntegrity > mode.generatorIntegrityCapacity ||
        mode.requiredGeneratorIntegrity > mode.generatorIntegrityCapacity ||
        mode.initialGeneratorIntegrity >= mode.requiredGeneratorIntegrity
      )
        throw new Error(`Invalid snow-observatory starting conditions: ${world.id}`);
      maxDurationMs = mode.stageDurationMs;
    }
    const buildingIds = new Set<string>();
    let maxDefense =
      definition.baseDefense +
      definition.beaconDefense +
      definition.workforce.size * definition.workforce.guardDefense;
    let maxWood =
      world.baseProduction.wood + definition.workforce.size * definition.workforce.woodRate;
    let maxStone =
      world.baseProduction.stone + definition.workforce.size * definition.workforce.stoneRate;
    for (const building of world.buildings) {
      if (!BUILDING_IDS.includes(building.id) || buildingIds.has(building.id))
        throw new Error(`Invalid or duplicate building ID: ${building.id}`);
      buildingIds.add(building.id);
      if (building.contentId !== undefined)
        registerContentId(building.contentId, `${world.id}.building`);
      requireResources(building.cost, `${building.id}.cost`);
      requireResources(building.production, `${building.id}.production`);
      requireAmount(building.priceGrowth, `${building.id}.priceGrowth`, true);
      if (building.priceGrowth < 1) throw new Error('Building price growth must be at least one');
      requireInteger(building.maxCount, `${building.id}.maxCount`, true);
      requireInteger(building.unlockAfterWave, `${building.id}.unlockAfterWave`);
      if (building.unlockAfterWave > 2)
        throw new Error('Buildings must unlock before the final wave');
      requireAmount(building.defense, `${building.id}.defense`);
      if (building.stabilityBonus !== undefined)
        requireAmount(building.stabilityBonus, `${building.id}.stabilityBonus`);
      requireAmount(
        Math.ceil(building.cost.wood * building.priceGrowth ** (building.maxCount - 1)),
        `${building.id}.maxWoodCost`,
      );
      requireAmount(
        Math.ceil(building.cost.stone * building.priceGrowth ** (building.maxCount - 1)),
        `${building.id}.maxStoneCost`,
      );
      maxDefense += building.defense * building.maxCount;
      maxWood += building.production.wood * building.maxCount;
      maxStone += building.production.stone * building.maxCount;
    }
    if (mode.kind === 'wave-survival' && buildingIds.size !== BUILDING_IDS.length)
      throw new Error(`Missing buildings in ${world.id}`);
    const maxProductionMultiplier = Math.max(
      ...definition.stances.map((stance) => stance.productionMultiplier),
    );
    requireAmount(
      maxDefense * Math.max(...definition.stances.map((stance) => stance.defenseMultiplier)),
      `${world.id}.maxDefense`,
    );
    const maxDurationSeconds = maxDurationMs / 1000;
    requireAmount(
      maxWood * definition.harvestMultiplier * maxProductionMultiplier * maxDurationSeconds,
      `${world.id}.maxWoodProduction`,
    );
    requireAmount(
      maxStone * definition.harvestMultiplier * maxProductionMultiplier * maxDurationSeconds,
      `${world.id}.maxStoneProduction`,
    );
  }
  if (
    !definition.worlds.some(
      (world) => world.unlockAfterWorld === null && world.unlockAfterDialogueId === null,
    )
  )
    throw new Error('A starting world is required');
  for (const world of definition.worlds) {
    const visited = new Set<string>([world.id]);
    let prerequisite = world.unlockAfterWorld;
    while (prerequisite !== null) {
      if (!worldIds.has(prerequisite))
        throw new Error(`Unknown world prerequisite: ${prerequisite}`);
      if (visited.has(prerequisite)) throw new Error('World prerequisites contain a cycle');
      visited.add(prerequisite);
      prerequisite =
        definition.worlds.find((candidate) => candidate.id === prerequisite)?.unlockAfterWorld ??
        null;
    }
  }

  const objectiveIds = new Set<string>();
  for (const objective of definition.objectives) {
    if (!STABLE_ID.test(objective.id) || objectiveIds.has(objective.id))
      throw new Error(`Invalid or duplicate objective ID: ${objective.id}`);
    objectiveIds.add(objective.id);
    registerContentId(objective.id, 'objective');
    if (!worldIds.has(objective.worldId) || objective.conditions.length === 0)
      throw new Error(
        `Objective requires a known world and at least one condition: ${objective.id}`,
      );
    requireInteger(objective.rewardPoints, `${objective.id}.rewardPoints`);
    const world = definition.worlds.find((candidate) => candidate.id === objective.worldId);
    if (!world) throw new Error(`Unknown objective world: ${objective.id}`);
    for (const condition of objective.conditions) {
      switch (condition.kind) {
        case 'building-count': {
          const building = world.buildings.find(
            (candidate) => candidate.id === condition.buildingId,
          );
          if (!building) throw new Error(`Unknown objective building: ${objective.id}`);
          requireInteger(condition.count, `${objective.id}.buildingCount`, true);
          if (condition.count > building.maxCount)
            throw new Error(`Objective exceeds the building count: ${objective.id}`);
          break;
        }
        case 'cleared-waves': {
          const waveStrengths = world.waveStrengths;
          if (world.mode?.kind === 'snow-observatory' || waveStrengths === undefined)
            throw new Error(`Wave objectives require a wave-survival world: ${objective.id}`);
          requireInteger(condition.count, `${objective.id}.clearedWaves`, true);
          if (condition.count > waveStrengths.length)
            throw new Error(`Objective exceeds the wave count: ${objective.id}`);
          break;
        }
        case 'environment-node-count': {
          const mode = world.mode;
          if (mode?.kind !== 'snow-observatory')
            throw new Error(`Environment nodes require a snow-observatory world: ${objective.id}`);
          requireInteger(condition.count, `${objective.id}.environmentNodeCount`, true);
          if (condition.count > mode.nodeCount)
            throw new Error(`Objective exceeds the environment node count: ${objective.id}`);
          break;
        }
        case 'generator-integrity': {
          const mode = world.mode;
          if (mode?.kind !== 'snow-observatory')
            throw new Error(
              `Generator integrity requires a snow-observatory world: ${objective.id}`,
            );
          requireAmount(condition.minimum, `${objective.id}.generatorIntegrity`, true);
          if (condition.minimum > mode.generatorIntegrityCapacity)
            throw new Error(`Objective exceeds generator integrity capacity: ${objective.id}`);
          break;
        }
        case 'completed-project':
          if (
            !definition.projects.some(
              (project) =>
                project.id === condition.projectId && project.worldId === objective.worldId,
            )
          )
            throw new Error(`Unknown objective project: ${objective.id}`);
          break;
        default: {
          const exhaustive: never = condition;
          throw new Error(`Unknown objective condition: ${String(exhaustive)}`);
        }
      }
    }
    if (objective.clueId !== null) {
      const clue = definition.story.clues.find((candidate) => candidate.id === objective.clueId);
      if (!clue || clue.worldId !== objective.worldId)
        throw new Error(`Objective clue must belong to its world: ${objective.id}`);
    }
  }

  const contractIds = new Set<string>();
  for (const world of definition.worlds) {
    const contracts = definition.contracts.filter((contract) => contract.worldId === world.id);
    if (contracts.length === 0 || contracts.filter((contract) => contract.isDefault).length !== 1)
      throw new Error(`Each world requires exactly one default contract: ${world.id}`);
  }
  for (const contract of definition.contracts) {
    if (!STABLE_ID.test(contract.id) || contractIds.has(contract.id))
      throw new Error(`Invalid or duplicate contract ID: ${contract.id}`);
    contractIds.add(contract.id);
    registerContentId(contract.id, 'contract');
    if (!worldIds.has(contract.worldId) || contract.primaryObjectiveIds.length === 0)
      throw new Error(`Contract requires a known world and a primary objective: ${contract.id}`);
    const assignedObjectives = [...contract.primaryObjectiveIds, ...contract.optionalObjectiveIds];
    if (
      new Set(assignedObjectives).size !== assignedObjectives.length ||
      assignedObjectives.some((id) => {
        const objective = definition.objectives.find((candidate) => candidate.id === id);
        return objective === undefined || objective.worldId !== contract.worldId;
      })
    )
      throw new Error(`Contract objectives must be unique and belong to its world: ${contract.id}`);
    if (
      new Set(contract.unlockAfterCompletedObjectiveIds).size !==
        contract.unlockAfterCompletedObjectiveIds.length ||
      contract.unlockAfterCompletedObjectiveIds.some((id) => {
        const objective = definition.objectives.find((candidate) => candidate.id === id);
        return objective === undefined || objective.worldId !== contract.worldId;
      })
    )
      throw new Error(
        `Contract unlocks must reference unique objectives in its world: ${contract.id}`,
      );
    const anyCompletedObjectiveIds = contract.unlockAfterAnyCompletedObjectiveIds ?? [];
    if (
      new Set(anyCompletedObjectiveIds).size !== anyCompletedObjectiveIds.length ||
      anyCompletedObjectiveIds.some((id) => {
        const objective = definition.objectives.find((candidate) => candidate.id === id);
        return objective === undefined || objective.worldId !== contract.worldId;
      })
    )
      throw new Error(
        `Alternative contract unlocks must reference unique objectives in its world: ${contract.id}`,
      );
    const dialogueChoice = contract.unlockAfterDialogueChoice;
    if (dialogueChoice !== undefined && dialogueChoice !== null) {
      const dialogue = definition.story.dialogues.find(
        (candidate) => candidate.id === dialogueChoice.dialogueId,
      );
      if (!dialogue || !dialogue.options.some((option) => option.id === dialogueChoice.optionId))
        throw new Error(`Contract unlocks must reference a known dialogue choice: ${contract.id}`);
    }
  }

  const eventIds = new Set<string>();
  const storyThreads = new Map(
    (definition.story.storyThreads ?? []).map((thread) => [thread.id, thread]),
  );
  for (const event of definition.events) {
    if (!STABLE_ID.test(event.id) || eventIds.has(event.id))
      throw new Error(`Invalid or duplicate event ID: ${event.id}`);
    eventIds.add(event.id);
    registerContentId(event.id, 'event');
    const storyThread =
      event.storyThreadId === undefined ? undefined : storyThreads.get(event.storyThreadId);
    if (
      ((definition.story.storyThreads?.length ?? 0) > 0 && event.storyThreadId === undefined) ||
      (event.storyThreadId !== undefined &&
        (storyThread === undefined || storyThread.worldId !== event.worldId))
    )
      throw new Error(`Event must reference an approved story thread in its world: ${event.id}`);
    if (
      event.requiresObjectiveId !== null &&
      storyThread !== undefined &&
      !storyThread.objectiveIds.includes(event.requiresObjectiveId)
    )
      throw new Error(`Event prerequisite is outside its story thread: ${event.id}`);
    if (!worldIds.has(event.worldId) || event.afterClearedWaves > 2)
      throw new Error(`Invalid event trigger: ${event.id}`);
    requireInteger(event.afterClearedWaves, `${event.id}.afterClearedWaves`);
    if (event.options.length < 2)
      throw new Error(`Events require at least two options: ${event.id}`);
    const optionIds = new Set<string>();
    const world = definition.worlds.find((candidate) => candidate.id === event.worldId);
    if (!world) throw new Error(`Unknown event world: ${event.id}`);
    if (event.minimumAnchorStability !== undefined) {
      if (world.mode?.kind !== 'anchor-city')
        throw new Error(`Anchor stability trigger requires an anchor-city world: ${event.id}`);
      requireAmount(event.minimumAnchorStability, `${event.id}.minimumAnchorStability`);
      if (event.minimumAnchorStability > world.mode.stabilityCapacity)
        throw new Error(`Anchor stability trigger exceeds capacity: ${event.id}`);
    }
    if (
      (event.randomPool !== undefined && event.randomPool !== 'incident') ||
      (event.afterEnvironmentNodes !== undefined &&
        (world.mode?.kind !== 'snow-observatory' ||
          !Number.isSafeInteger(event.afterEnvironmentNodes) ||
          event.afterEnvironmentNodes < 1 ||
          event.afterEnvironmentNodes > world.mode.nodeCount))
    )
      throw new Error(`Invalid environment or random event trigger: ${event.id}`);
    if (event.requiresObjectiveId !== null) {
      const objective = definition.objectives.find(
        (candidate) => candidate.id === event.requiresObjectiveId,
      );
      if (
        !objective ||
        objective.worldId !== event.worldId ||
        !definition.contracts.some(
          (contract) =>
            contract.worldId === event.worldId &&
            [...contract.primaryObjectiveIds, ...contract.optionalObjectiveIds].includes(
              event.requiresObjectiveId ?? '',
            ),
        )
      )
        throw new Error(
          `Event prerequisite must be offered by a contract in its world: ${event.id}`,
        );
    }
    for (const option of event.options) {
      if (!STABLE_ID.test(option.id) || optionIds.has(option.id))
        throw new Error(`Invalid or duplicate event option: ${event.id}`);
      optionIds.add(option.id);
      registerContentId(option.id, 'event option');
      if (
        option.requiresObjectiveId !== null &&
        storyThread !== undefined &&
        !storyThread.objectiveIds.includes(option.requiresObjectiveId)
      )
        throw new Error(`Event option is outside its story thread: ${event.id}/${option.id}`);
      if (option.requiresObjectiveId !== null) {
        const objective = definition.objectives.find(
          (candidate) => candidate.id === option.requiresObjectiveId,
        );
        if (
          !objective ||
          objective.worldId !== event.worldId ||
          !definition.contracts.some(
            (contract) =>
              contract.worldId === event.worldId &&
              [...contract.primaryObjectiveIds, ...contract.optionalObjectiveIds].includes(
                option.requiresObjectiveId ?? '',
              ),
          )
        )
          throw new Error(`Event option prerequisite must be offered by a contract: ${event.id}`);
      }
      requireResources(option.cost, `${event.id}.${option.id}.cost`);
      if (option.resourceReward !== undefined)
        requireResources(option.resourceReward, `${event.id}.${option.id}.resourceReward`);
      if (option.anchorStabilityDelta !== undefined) {
        if (world.mode?.kind !== 'anchor-city')
          throw new Error(`Anchor stability option requires an anchor-city world: ${event.id}`);
        requireSignedFinite(
          option.anchorStabilityDelta,
          `${event.id}.${option.id}.anchorStabilityDelta`,
        );
      }
      if (
        option.cost.wood > world.resourceCaps.wood ||
        option.cost.stone > world.resourceCaps.stone
      )
        throw new Error(`Event cost exceeds resource caps: ${event.id}`);
      if (new Set(option.unlockProjectIds).size !== option.unlockProjectIds.length)
        throw new Error(`Duplicate event project grant: ${event.id}`);
      for (const projectId of option.unlockProjectIds) {
        if (
          !definition.projects.some(
            (project) =>
              project.id === projectId &&
              project.worldId === event.worldId &&
              project.requiredEventChoice.eventId === event.id &&
              project.requiredEventChoice.optionId === option.id,
          )
        )
          throw new Error(`Event grants an unrelated project: ${event.id}`);
      }
    }
    if (
      event.randomPool === 'incident' &&
      !event.options.some(
        (option) =>
          option.cost.wood === 0 &&
          option.cost.stone === 0 &&
          option.resourceReward === undefined &&
          option.unlockProjectIds.length === 0,
      )
    )
      throw new Error(`Random incidents require a no-cost fallback option: ${event.id}`);
  }

  const projectIds = new Set<string>();
  for (const project of definition.projects) {
    if (!STABLE_ID.test(project.id) || projectIds.has(project.id))
      throw new Error(`Invalid or duplicate project ID: ${project.id}`);
    projectIds.add(project.id);
    registerContentId(project.id, 'project');
    const objective = definition.objectives.find(
      (candidate) => candidate.id === project.objectiveId,
    );
    const event = definition.events.find(
      (candidate) => candidate.id === project.requiredEventChoice.eventId,
    );
    const option = event?.options.find(
      (candidate) => candidate.id === project.requiredEventChoice.optionId,
    );
    const world = definition.worlds.find((candidate) => candidate.id === project.worldId);
    if (
      !worldIds.has(project.worldId) ||
      project.afterClearedWaves > 2 ||
      !objective ||
      objective.worldId !== project.worldId ||
      !objective.conditions.some(
        (condition) => condition.kind === 'completed-project' && condition.projectId === project.id,
      ) ||
      objective.clueId === null ||
      !event ||
      event.worldId !== project.worldId ||
      project.afterClearedWaves < event.afterClearedWaves ||
      !option?.unlockProjectIds.includes(project.id)
    )
      throw new Error(`Project links to an invalid event or objective: ${project.id}`);
    if (event.storyThreadId !== undefined) {
      const thread = storyThreads.get(event.storyThreadId);
      if (
        thread === undefined ||
        thread.worldId !== project.worldId ||
        !thread.objectiveIds.includes(project.objectiveId) ||
        !thread.clueIds.includes(objective.clueId)
      )
        throw new Error(`Project outcome is outside its event story thread: ${project.id}`);
    }
    requireInteger(project.afterClearedWaves, `${project.id}.afterClearedWaves`);
    requireAmount(project.durationMs, `${project.id}.durationMs`, true);
    requireInteger(project.workerCount, `${project.id}.workerCount`, true);
    if (project.workerCount > definition.workforce.size)
      throw new Error(`Project requires too many workers: ${project.id}`);
    requireResources(project.cost, `${project.id}.cost`);
    if (project.minimumAnchorStability !== undefined) {
      if (world?.mode?.kind !== 'anchor-city')
        throw new Error(`Anchor-gated project requires an anchor-city world: ${project.id}`);
      requireAmount(project.minimumAnchorStability, `${project.id}.minimumAnchorStability`);
      if (project.minimumAnchorStability > world.mode.stabilityCapacity)
        throw new Error(`Project stability threshold exceeds capacity: ${project.id}`);
    }
    if (
      !world ||
      project.cost.wood > world.resourceCaps.wood ||
      project.cost.stone > world.resourceCaps.stone
    )
      throw new Error(`Project cost exceeds resource caps: ${project.id}`);
  }

  const perkIds = new Set<string>();
  for (const perk of definition.perks) {
    if (!PERK_IDS.includes(perk.id) || perkIds.has(perk.id))
      throw new Error(`Invalid or duplicate perk ID: ${perk.id}`);
    perkIds.add(perk.id);
    if (perk.contentId !== undefined) registerContentId(perk.contentId, 'perk');
    requireInteger(perk.cost, `${perk.id}.cost`, true);
  }
  if (perkIds.size !== PERK_IDS.length) throw new Error('Missing permanent perks');

  const clueIds = new Set<string>();
  for (const clue of definition.story.clues) {
    if (!STABLE_ID.test(clue.id) || clueIds.has(clue.id))
      throw new Error(`Invalid or duplicate clue ID: ${clue.id}`);
    clueIds.add(clue.id);
    registerContentId(clue.id, 'clue');
    if (!['return', 'investigate', 'project', 'dialogue'].includes(clue.source))
      throw new Error(`Invalid clue source: ${clue.id}`);
    requireInteger(clue.minClearedWaves, `${clue.id}.minClearedWaves`);
    if (clue.minClearedWaves > 3)
      throw new Error('Clues require between zero and three cleared waves');
    if (clue.requiresBuilding !== null && !BUILDING_IDS.includes(clue.requiresBuilding))
      throw new Error(`Unknown clue building: ${clue.id}`);
    if (clue.requiresBeacon !== null && clue.requiresBeacon !== 'restore')
      throw new Error(`Unknown beacon requirement: ${clue.id}`);
    requireResources(clue.cost, `${clue.id}.cost`);
    if (clue.source === 'dialogue') {
      if (
        clue.worldId !== null ||
        clue.minClearedWaves !== 0 ||
        clue.requiresBuilding !== null ||
        clue.requiresBeacon !== null ||
        clue.requiresProjectId !== null ||
        clue.cost.wood !== 0 ||
        clue.cost.stone !== 0
      ) {
        throw new Error('Dialogue clues cannot impose expedition conditions or costs');
      }
    } else {
      if (clue.worldId === null || !worldIds.has(clue.worldId))
        throw new Error(`Unknown clue world: ${clue.id}`);
      if (
        clue.source === 'project' &&
        (clue.requiresProjectId === null || clue.cost.wood !== 0 || clue.cost.stone !== 0)
      )
        throw new Error('Project clues require a project and cannot charge a second cost');
      if (clue.source !== 'project' && clue.requiresProjectId !== null)
        throw new Error('Only project clues can require a project');
      if (clue.source === 'return' && (clue.cost.wood !== 0 || clue.cost.stone !== 0))
        throw new Error('Automatic return clues cannot charge resources');
      if (clue.source === 'investigate' && clue.minClearedWaves === 3)
        throw new Error('Investigation must be possible before the final wave');
      if (clue.requiresContractId !== undefined && clue.requiresContractId !== null) {
        const contract = definition.contracts.find(
          (candidate) => candidate.id === clue.requiresContractId,
        );
        if (
          !contract ||
          contract.worldId !== clue.worldId ||
          ![...contract.primaryObjectiveIds, ...contract.optionalObjectiveIds].some(
            (objectiveId) =>
              definition.objectives.find((objective) => objective.id === objectiveId)?.clueId ===
              clue.id,
          )
        )
          throw new Error(`Story clue contract requirement is not a source: ${clue.id}`);
      }
      const world = definition.worlds.find((candidate) => candidate.id === clue.worldId);
      if (
        world &&
        (clue.cost.wood > world.resourceCaps.wood || clue.cost.stone > world.resourceCaps.stone)
      )
        throw new Error(`Clue costs exceed resource caps: ${clue.id}`);
      if (
        clue.source === 'project' &&
        !definition.projects.some(
          (project) => project.id === clue.requiresProjectId && project.worldId === clue.worldId,
        )
      )
        throw new Error(`Project clue refers to an unknown project: ${clue.id}`);
    }
  }
  const dialogueIds = new Set<string>();
  const grantedIds = new Set<string>();
  for (const dialogue of definition.story.dialogues) {
    if (!STABLE_ID.test(dialogue.id) || dialogueIds.has(dialogue.id) || clueIds.has(dialogue.id))
      throw new Error(`Invalid or duplicate dialogue ID: ${dialogue.id}`);
    dialogueIds.add(dialogue.id);
    registerContentId(dialogue.id, 'dialogue');
    if (new Set(dialogue.requiredClueIds).size !== dialogue.requiredClueIds.length)
      throw new Error(`Duplicate dialogue prerequisites: ${dialogue.id}`);
    for (const id of dialogue.requiredClueIds)
      if (!clueIds.has(id)) throw new Error(`Unknown dialogue prerequisite: ${id}`);
    if (dialogue.options.length === 0) throw new Error(`Dialogue requires options: ${dialogue.id}`);
    const optionIds = new Set<string>();
    for (const option of dialogue.options) {
      if (!STABLE_ID.test(option.id) || optionIds.has(option.id))
        throw new Error(`Invalid or duplicate dialogue option: ${option.id}`);
      optionIds.add(option.id);
      registerContentId(option.id, 'dialogue option');
      const clue = definition.story.clues.find((candidate) => candidate.id === option.grantsClueId);
      if (!clue || clue.source !== 'dialogue')
        throw new Error(`Dialogue must grant a declared dialogue clue: ${option.id}`);
      grantedIds.add(clue.id);
      requireResources(option.nextRunBonus, `${option.id}.nextRunBonus`);
    }
  }
  for (const world of definition.worlds) {
    if (world.unlockAfterDialogueId !== null && !dialogueIds.has(world.unlockAfterDialogueId))
      throw new Error(`Unknown world dialogue prerequisite: ${world.id}`);
  }
  for (const clue of definition.story.clues) {
    if (clue.source === 'dialogue' && !grantedIds.has(clue.id))
      throw new Error(`Dialogue clue has no source: ${clue.id}`);
    if (
      clue.source === 'project' &&
      !definition.objectives.some(
        (objective) =>
          objective.clueId === clue.id &&
          objective.conditions.some(
            (condition) =>
              condition.kind === 'completed-project' &&
              condition.projectId === clue.requiresProjectId,
          ),
      )
    )
      throw new Error(`Project clue must be awarded by a matching objective: ${clue.id}`);
  }

  const storyThreadIds = new Set<string>();
  for (const thread of definition.story.storyThreads ?? []) {
    if (!STABLE_ID.test(thread.id) || storyThreadIds.has(thread.id))
      throw new Error(`Invalid or duplicate story thread ID: ${thread.id}`);
    storyThreadIds.add(thread.id);
    registerContentId(thread.id, 'story thread');
    if (
      !worldIds.has(thread.worldId) ||
      thread.objectiveIds.length === 0 ||
      thread.clueIds.length === 0
    )
      throw new Error(`Story thread requires a world, objective, and clue: ${thread.id}`);
    if (
      new Set(thread.objectiveIds).size !== thread.objectiveIds.length ||
      thread.objectiveIds.some(
        (id) =>
          !definition.objectives.some(
            (objective) => objective.id === id && objective.worldId === thread.worldId,
          ),
      ) ||
      new Set(thread.clueIds).size !== thread.clueIds.length ||
      thread.clueIds.some(
        (id) =>
          !definition.story.clues.some((clue) => clue.id === id && clue.worldId === thread.worldId),
      )
    )
      throw new Error(`Story thread references unknown content in another world: ${thread.id}`);
  }

  // Prove that prerequisite chains can progress from an initial world, including dialogue gates.
  const reachableWorlds = new Set<string>();
  const reachableClues = new Set<string>();
  const reachableDialogues = new Set<string>();
  let progressed = true;
  while (progressed) {
    const previousSize = reachableWorlds.size + reachableClues.size + reachableDialogues.size;
    for (const world of definition.worlds) {
      if (
        (world.unlockAfterWorld === null || reachableWorlds.has(world.unlockAfterWorld)) &&
        (world.unlockAfterDialogueId === null ||
          reachableDialogues.has(world.unlockAfterDialogueId))
      )
        reachableWorlds.add(world.id);
    }
    for (const clue of definition.story.clues) {
      if (clue.source !== 'dialogue' && clue.worldId !== null && reachableWorlds.has(clue.worldId))
        reachableClues.add(clue.id);
    }
    for (const dialogue of definition.story.dialogues) {
      if (dialogue.requiredClueIds.every((id) => reachableClues.has(id))) {
        reachableDialogues.add(dialogue.id);
        for (const option of dialogue.options) reachableClues.add(option.grantsClueId);
      }
    }
    progressed =
      previousSize !== reachableWorlds.size + reachableClues.size + reachableDialogues.size;
  }
  if (
    reachableWorlds.size !== worldIds.size ||
    reachableClues.size !== clueIds.size ||
    reachableDialogues.size !== dialogueIds.size
  )
    throw new Error('Story prerequisites contain an unreachable chain or cycle');
  for (const contract of definition.contracts) {
    const choice = contract.unlockAfterDialogueChoice;
    if (choice && !reachableDialogues.has(choice.dialogueId))
      throw new Error(`Contract depends on an unreachable dialogue: ${contract.id}`);
  }

  const root = definition.researchRoot;
  if (root !== undefined && root !== null) {
    if (!STABLE_ID.test(root.id)) throw new Error('Invalid research root ID');
    if (
      new Set(root.requiredClueIds).size !== root.requiredClueIds.length ||
      root.requiredClueIds.some((id) => !clueIds.has(id) || !reachableClues.has(id))
    )
      throw new Error('Research root must have reachable, unique clue prerequisites');
  }
  const researchNodes = definition.researchNodes ?? [];
  const researchNodeIds = new Set<string>();
  for (const node of researchNodes) {
    if (!STABLE_ID.test(node.id) || researchNodeIds.has(node.id))
      throw new Error(`Invalid or duplicate research node ID: ${node.id}`);
    researchNodeIds.add(node.id);
    if (node.contentId !== undefined) registerContentId(node.contentId, 'research');
    if (!['production', 'defense', 'investigation'].includes(node.category))
      throw new Error(`Invalid research category: ${node.id}`);
    requireInteger(node.cost, `${node.id}.cost`, true);
    if (
      node.appliesToWorldIds !== undefined &&
      (node.appliesToWorldIds.length === 0 ||
        new Set(node.appliesToWorldIds).size !== node.appliesToWorldIds.length ||
        node.appliesToWorldIds.some((worldId) => !worldIds.has(worldId)))
    )
      throw new Error(`Research node has invalid applicable worlds: ${node.id}`);
    if (
      new Set(node.requiredClueIds).size !== node.requiredClueIds.length ||
      node.requiredClueIds.some((id) => !clueIds.has(id) || !reachableClues.has(id))
    )
      throw new Error(`Research node requires reachable, unique clues: ${node.id}`);
    if (new Set(node.requiredResearchNodeIds).size !== node.requiredResearchNodeIds.length)
      throw new Error(`Research node has duplicate prerequisites: ${node.id}`);
    for (const prerequisite of node.requiredResearchNodeIds) {
      if (!researchNodes.some((candidate) => candidate.id === prerequisite))
        throw new Error(`Unknown research prerequisite ${prerequisite}: ${node.id}`);
    }
    switch (node.effect.kind) {
      case 'production-building-discount':
      case 'investigation-cost-discount':
        requireResources(node.effect.amount, `${node.id}.effect.amount`);
        if (node.effect.amount.wood === 0 && node.effect.amount.stone === 0)
          throw new Error(`Research effect must change a decision: ${node.id}`);
        break;
      case 'brace-next-wave':
        requireInteger(node.effect.damageReduction, `${node.id}.effect.damageReduction`, true);
        break;
      default: {
        const exhaustive: never = node.effect;
        throw new Error(`Unknown research effect: ${String(exhaustive)}`);
      }
    }
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visitResearchNode = (id: string): void => {
    if (visiting.has(id)) throw new Error('Research prerequisites contain a cycle');
    if (visited.has(id)) return;
    visiting.add(id);
    const node = researchNodes.find((candidate) => candidate.id === id);
    if (!node) throw new Error(`Unknown research node: ${id}`);
    for (const prerequisite of node.requiredResearchNodeIds) visitResearchNode(prerequisite);
    visiting.delete(id);
    visited.add(id);
  };
  for (const node of researchNodes) visitResearchNode(node.id);

  const variants = definition.worldVariants ?? [];
  const variantIds = new Set<string>();
  const variantCounts = new Map<string, number>();
  for (const variant of variants) {
    if (!STABLE_ID.test(variant.id) || variantIds.has(variant.id))
      throw new Error(`Invalid or duplicate world variant ID: ${variant.id}`);
    variantIds.add(variant.id);
    variantCounts.set(variant.worldId, (variantCounts.get(variant.worldId) ?? 0) + 1);
    const world = definition.worlds.find((candidate) => candidate.id === variant.worldId);
    const contract = definition.contracts.find((candidate) => candidate.id === variant.contractId);
    if (!world || !contract || contract.worldId !== variant.worldId)
      throw new Error(`World variant must reference its world's contract: ${variant.id}`);
    requireResources(variant.initialResourceBonus, `${variant.id}.initialResourceBonus`);
    if (
      variant.initialResourceBonus.wood > world.resourceCaps.wood ||
      variant.initialResourceBonus.stone > world.resourceCaps.stone
    )
      throw new Error(`World variant resource bonus exceeds caps: ${variant.id}`);
    if (
      variant.eventGroupId !== null &&
      !definition.events.some(
        (event) => event.worldId === variant.worldId && event.groupId === variant.eventGroupId,
      )
    )
      throw new Error(`World variant references an unknown event group: ${variant.id}`);
    const choice = variant.requiredDialogueChoice;
    if (choice !== undefined && choice !== null) {
      const dialogue = definition.story.dialogues.find(
        (candidate) => candidate.id === choice.dialogueId,
      );
      if (!dialogue?.options.some((option) => option.id === choice.optionId))
        throw new Error(`World variant references an unknown dialogue choice: ${variant.id}`);
    }
  }
  if (variants.length > 0) {
    for (const world of definition.worlds) {
      if (variantCounts.get(world.id) !== 2)
        throw new Error(`Each world requires two named variants: ${world.id}`);
    }
  }
  if (definition.events.some((event) => event.randomPool === 'incident')) {
    for (const contract of definition.contracts) {
      const contractObjectiveIds = [
        ...contract.primaryObjectiveIds,
        ...contract.optionalObjectiveIds,
      ];
      const contractVariants = variants.filter((variant) => variant.contractId === contract.id);
      for (const project of definition.projects.filter((item) =>
        contractObjectiveIds.includes(item.objectiveId),
      )) {
        const event = definition.events.find(
          (candidate) => candidate.id === project.requiredEventChoice.eventId,
        );
        const option = event?.options.find(
          (candidate) => candidate.id === project.requiredEventChoice.optionId,
        );
        if (!event || !option || event.worldId !== contract.worldId)
          throw new Error(
            `Contract project is missing its event path: ${contract.id}/${project.id}`,
          );
        for (const variant of contractVariants) {
          const groupIsReachable =
            event.groupId === undefined ||
            event.groupId === null ||
            event.groupId === variant.eventGroupId;
          const eventObjectiveIsReachable =
            event.requiresObjectiveId === null ||
            contractObjectiveIds.includes(event.requiresObjectiveId);
          const optionIsReachable =
            option.requiresObjectiveId === null ||
            contractObjectiveIds.includes(option.requiresObjectiveId);
          if (!groupIsReachable || !eventObjectiveIsReachable || !optionIsReachable)
            throw new Error(
              `Contract project event is unreachable for variant: ${contract.id}/${variant.id}/${project.id}`,
            );
        }
      }
    }
  }
  const modifierIds = new Set<string>();
  for (const modifier of definition.difficultyModifiers ?? []) {
    if (!STABLE_ID.test(modifier.id) || modifierIds.has(modifier.id))
      throw new Error(`Invalid or duplicate difficulty modifier ID: ${modifier.id}`);
    modifierIds.add(modifier.id);
    registerContentId(modifier.id, 'difficulty modifier');
    if ((definition.story.storyThreads?.length ?? 0) > 0) {
      const thread =
        modifier.storyThreadId === undefined ? undefined : storyThreads.get(modifier.storyThreadId);
      const world =
        thread === undefined
          ? undefined
          : definition.worlds.find((candidate) => candidate.id === thread.worldId);
      if (
        thread === undefined ||
        world === undefined ||
        !modifier.appliesToModes.includes(world.mode?.kind ?? 'wave-survival')
      )
        throw new Error(
          `Difficulty modifier must reference a fitting story thread: ${modifier.id}`,
        );
    }
    requireInteger(modifier.difficulty, `${modifier.id}.difficulty`, true);
    if (
      modifier.appliesToModes.length === 0 ||
      new Set(modifier.appliesToModes).size !== modifier.appliesToModes.length ||
      modifier.appliesToModes.some(
        (mode) => !['wave-survival', 'snow-observatory', 'anchor-city'].includes(mode),
      )
    )
      throw new Error(`Invalid difficulty modifier applicability: ${modifier.id}`);
    if (modifier.effects.length === 0)
      throw new Error(`Difficulty modifier has no effect: ${modifier.id}`);
    for (const effect of modifier.effects) {
      requireAmount(effect.multiplier, `${modifier.id}.${effect.kind}`, true);
      if (effect.multiplier === 1)
        throw new Error(`Difficulty effect must change its rule: ${modifier.id}/${effect.kind}`);
    }
  }
  const rewardTiers = definition.difficultyRewardTiers ?? [];
  let previousMaximum = 0;
  for (const tier of rewardTiers) {
    requireInteger(tier.minimumDifficulty, 'difficultyReward.minimumDifficulty', true);
    if (tier.maximumDifficulty !== null)
      requireInteger(tier.maximumDifficulty, 'difficultyReward.maximumDifficulty', true);
    requireInteger(tier.points, 'difficultyReward.points');
    if (
      tier.minimumDifficulty <= previousMaximum ||
      (tier.maximumDifficulty !== null && tier.maximumDifficulty < tier.minimumDifficulty)
    )
      throw new Error('Difficulty reward tiers must be ordered and non-overlapping');
    previousMaximum = tier.maximumDifficulty ?? Number.MAX_SAFE_INTEGER;
  }
  if (definition.outpost !== undefined)
    validateOutpostDefinition(definition.outpost, definition, registerContentId);
}
