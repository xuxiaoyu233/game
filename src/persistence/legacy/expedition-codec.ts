import {
  advanceExpedition,
  getApplicablePreparationId,
  getRunMaxHp,
  getRandomEventId,
  isContractAvailable,
  isWorldVariantAvailable,
} from '../../domain/legacy/expedition/engine';
import { migrateVersion2Save } from '../../domain/legacy/expedition/migrate-v2';
import type { ExpeditionDefinition as Version2Definition } from '../../domain/legacy/expedition/v2-types';
import type {
  BattleReport,
  BuildingId,
  ExpeditionDefinition,
  Profile,
  Resources,
  RewardLine,
  RunState,
  SaveBundle,
  Settlement,
  SnowRunState,
  DifficultyModifierId,
  WorldDefinition,
  WorldVariantId,
} from '../../domain/legacy/expedition/types';
import type { GameDefinition } from '../../domain/legacy/types';
import { SaveValidationError, validateSaveState } from './save-codec';
import { validateVersion2Save } from './expedition-v2-codec';
import { createOutpost, validateOutpostState } from '../../domain/legacy/outpost/engine';
import {
  OUTPOST_FACILITY_IDS,
  OUTPOST_JOB_IDS,
  OUTPOST_PROFESSION_IDS,
} from '../../domain/legacy/outpost/engine';
import type {
  OutpostRecipeId,
  OutpostResourceId,
  OutpostState,
} from '../../domain/legacy/outpost/types';

const OUTPOST_RESOURCE_IDS: readonly OutpostResourceId[] = [
  'reclaimed-alloy',
  'charge-cell',
  'biofiber',
  'structural-panel',
  'barrier-kit',
  'medical-kit',
  'anchor-shard',
  'echo-record',
  'anchor-frame',
];
const OUTPOST_RECIPE_IDS: readonly OutpostRecipeId[] = [
  'refine-structural-panel',
  'assemble-barrier-kit',
  'prepare-medical-kit',
  'assemble-anchor-frame',
];

const BUILDING_IDS: readonly BuildingId[] = [
  'shelter',
  'lumber-camp',
  'quarry',
  'wall',
  'tower',
  'monument',
];

function invalid(message: string): never {
  throw new SaveValidationError('INVALID_STATE', `存档校验失败：${message}`);
}
function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid(`${field} 必须是对象。`);
  return value as Record<string, unknown>;
}
function hasSchemaVersion(value: Record<string, unknown>, expected: number): boolean {
  return value.schemaVersion === expected;
}
function number(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  )
    invalid(`${field} 必须是安全范围内的有限非负数。`);
  return value;
}
function integer(value: unknown, field: string): number {
  const parsed = number(value, field);
  if (!Number.isSafeInteger(parsed)) invalid(`${field} 必须是安全整数。`);
  return parsed;
}
function signedNumber(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    Math.abs(value) > Number.MAX_SAFE_INTEGER
  )
    invalid(`${field} 必须是安全范围内的有限数值。`);
  return value;
}
function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') invalid(`${field} 必须是布尔值。`);
  return value;
}
function oneOf<T extends string>(value: unknown, options: readonly T[], field: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) invalid(`${field} 含未知值。`);
  return value as T;
}
function uniqueIds<T extends string>(value: unknown, options: readonly T[], field: string): T[] {
  if (!Array.isArray(value)) invalid(`${field} 必须是列表。`);
  const result: T[] = [];
  for (const valueId of value) {
    const id = oneOf(valueId, options, field);
    if (result.includes(id)) invalid(`${field} 含重复 ID。`);
    result.push(id);
  }
  return result;
}

function outpostState(value: unknown, definition: ExpeditionDefinition): OutpostState {
  if (definition.outpost === undefined) invalid('当前内容不支持驻地经济状态。');
  const parsed = record(value, 'outpost');
  const resourceRecord = (candidate: unknown, field: string): Record<OutpostResourceId, number> => {
    const selected = record(candidate, field);
    if (Object.keys(selected).length !== OUTPOST_RESOURCE_IDS.length)
      invalid(`${field} 的物资种类不完整或包含未知物资。`);
    const result = {} as Record<OutpostResourceId, number>;
    for (const id of OUTPOST_RESOURCE_IDS) result[id] = number(selected[id], `${field}.${id}`);
    return result;
  };
  const assignmentsRaw = record(parsed.jobAssignments, 'outpost.jobAssignments');
  const targetsRaw = record(parsed.jobTargets, 'outpost.jobTargets');
  const facilitiesRaw = record(parsed.facilities, 'outpost.facilities');
  const experienceRaw = record(parsed.professionExperience, 'outpost.professionExperience');
  const producedRaw = record(parsed.producedByJob, 'outpost.producedByJob');
  const craftedRaw = record(parsed.craftedByRecipe, 'outpost.craftedByRecipe');
  const reviewedProductionRaw = record(
    parsed.reviewedProductionByJob,
    'outpost.reviewedProductionByJob',
  );
  const reviewedCraftedRaw = record(
    parsed.reviewedCraftedByRecipe,
    'outpost.reviewedCraftedByRecipe',
  );
  if (
    Object.keys(assignmentsRaw).length !== OUTPOST_JOB_IDS.length ||
    Object.keys(targetsRaw).length !== OUTPOST_JOB_IDS.length ||
    Object.keys(facilitiesRaw).length !== OUTPOST_FACILITY_IDS.length ||
    Object.keys(experienceRaw).length !== OUTPOST_PROFESSION_IDS.length ||
    Object.keys(producedRaw).length !== OUTPOST_JOB_IDS.length ||
    Object.keys(craftedRaw).length !== OUTPOST_RECIPE_IDS.length ||
    Object.keys(reviewedProductionRaw).length !== OUTPOST_JOB_IDS.length ||
    Object.keys(reviewedCraftedRaw).length !== OUTPOST_RECIPE_IDS.length
  )
    invalid('驻地人员、经验或生产统计结构无效。');
  const jobAssignments = Object.fromEntries(
    OUTPOST_JOB_IDS.map((id) => [id, integer(assignmentsRaw[id], `outpost.jobAssignments.${id}`)]),
  ) as OutpostState['jobAssignments'];
  const jobTargets = Object.fromEntries(
    OUTPOST_JOB_IDS.map((id) => {
      const target = targetsRaw[id];
      return [id, target === null ? null : integer(target, `outpost.jobTargets.${id}`)];
    }),
  ) as OutpostState['jobTargets'];
  const facilities = Object.fromEntries(
    OUTPOST_FACILITY_IDS.map((id) => [id, integer(facilitiesRaw[id], `outpost.facilities.${id}`)]),
  ) as OutpostState['facilities'];
  const professionExperience = Object.fromEntries(
    OUTPOST_PROFESSION_IDS.map((id) => [
      id,
      number(experienceRaw[id], `outpost.professionExperience.${id}`),
    ]),
  ) as OutpostState['professionExperience'];
  const producedByJob = Object.fromEntries(
    OUTPOST_JOB_IDS.map((id) => [id, number(producedRaw[id], `outpost.producedByJob.${id}`)]),
  ) as OutpostState['producedByJob'];
  const craftedByRecipe = Object.fromEntries(
    OUTPOST_RECIPE_IDS.map((id) => [id, integer(craftedRaw[id], `outpost.craftedByRecipe.${id}`)]),
  ) as OutpostState['craftedByRecipe'];
  const reviewedProductionByJob = Object.fromEntries(
    OUTPOST_JOB_IDS.map((id) => [
      id,
      number(reviewedProductionRaw[id], `outpost.reviewedProductionByJob.${id}`),
    ]),
  ) as OutpostState['reviewedProductionByJob'];
  const reviewedCraftedByRecipe = Object.fromEntries(
    OUTPOST_RECIPE_IDS.map((id) => [
      id,
      integer(reviewedCraftedRaw[id], `outpost.reviewedCraftedByRecipe.${id}`),
    ]),
  ) as OutpostState['reviewedCraftedByRecipe'];
  const activeRecipeId =
    parsed.activeRecipeId === null
      ? null
      : oneOf(parsed.activeRecipeId, OUTPOST_RECIPE_IDS, 'outpost.activeRecipeId');
  const remainingBatches =
    parsed.remainingBatches === null
      ? null
      : integer(parsed.remainingBatches, 'outpost.remainingBatches');
  const reservedOutput =
    parsed.reservedOutput === null
      ? null
      : oneOf(parsed.reservedOutput, OUTPOST_RESOURCE_IDS, 'outpost.reservedOutput');
  const pausedReason =
    parsed.pausedReason === null
      ? null
      : oneOf(
          parsed.pausedReason,
          ['ingredients', 'storage', 'target-reached', 'workers'] as const,
          'outpost.pausedReason',
        );
  const selected: OutpostState = {
    resources: resourceRecord(parsed.resources, 'outpost.resources'),
    jobAssignments,
    jobTargets,
    facilities,
    reviewedProductionByJob,
    reviewedCraftedByRecipe,
    activeRecipeId,
    remainingBatches,
    recipeProgressMs: number(parsed.recipeProgressMs, 'outpost.recipeProgressMs'),
    reservedInputs: resourceRecord(parsed.reservedInputs, 'outpost.reservedInputs'),
    reservedOutput,
    professionExperience,
    producedByJob,
    craftedByRecipe,
    pausedReason,
  };
  try {
    validateOutpostState(selected, definition.outpost);
  } catch (error) {
    invalid(error instanceof Error ? error.message : '驻地状态无效。');
  }
  return selected;
}

function migrateSchema9OutpostAutomationFields(
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (
    value.schemaVersion !== 9 ||
    value.contentVersion !== '14.0.0' ||
    !Object.hasOwn(value, 'outpost')
  )
    return value;
  const parsedOutpost = record(value.outpost, 'outpost');
  const producedByJob = record(parsedOutpost.producedByJob, 'outpost.producedByJob');
  const craftedByRecipe = record(parsedOutpost.craftedByRecipe, 'outpost.craftedByRecipe');
  const jobTargets = Object.hasOwn(parsedOutpost, 'jobTargets')
    ? parsedOutpost.jobTargets
    : Object.fromEntries(OUTPOST_JOB_IDS.map((id) => [id, null]));
  const reviewedProductionByJob = Object.hasOwn(parsedOutpost, 'reviewedProductionByJob')
    ? parsedOutpost.reviewedProductionByJob
    : producedByJob;
  const reviewedCraftedByRecipe = Object.hasOwn(parsedOutpost, 'reviewedCraftedByRecipe')
    ? parsedOutpost.reviewedCraftedByRecipe
    : craftedByRecipe;
  const facilities = Object.hasOwn(parsedOutpost, 'facilities')
    ? parsedOutpost.facilities
    : { 'production-hangar': 0 };
  return {
    ...value,
    outpost: {
      ...parsedOutpost,
      jobTargets,
      reviewedProductionByJob,
      reviewedCraftedByRecipe,
      facilities,
    },
  };
}
function resources(value: unknown, field: string): Resources {
  const parsed = record(value, field);
  if (
    Object.keys(parsed).length !== 2 ||
    !Object.hasOwn(parsed, 'wood') ||
    !Object.hasOwn(parsed, 'stone')
  )
    invalid(`${field} 必须完整记录 wood/stone，不能含未知资源。`);
  return {
    wood: number(parsed.wood, `${field}.wood`),
    stone: number(parsed.stone, `${field}.stone`),
  };
}
function world(value: unknown, definition: ExpeditionDefinition): WorldDefinition {
  const selected = definition.worlds.find((candidate) => candidate.id === value);
  if (selected === undefined) invalid('未知副本 ID。');
  return selected;
}
function equals(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(1, left, right) * Number.EPSILON * 8;
}

function upgradeSchemaSixFields(value: Record<string, unknown>): Record<string, unknown> {
  const oldProfile = record(value.profile, 'profile');
  const oldRun = value.activeRun === null ? null : record(value.activeRun, 'activeRun');
  const oldBattle =
    oldRun?.lastBattle === null || oldRun?.lastBattle === undefined
      ? null
      : record(oldRun.lastBattle, 'activeRun.lastBattle');
  const oldSettlement =
    value.lastSettlement === null || value.lastSettlement === undefined
      ? null
      : record(value.lastSettlement, 'lastSettlement');
  return {
    ...value,
    schemaVersion: 7,
    profile: {
      ...oldProfile,
      researchNodeIds: oldProfile.researchNodeIds ?? [],
      equippedPreparationId: oldProfile.equippedPreparationId ?? null,
      selectedVariantIds: oldProfile.selectedVariantIds ?? {},
      selectedDifficultyModifierIds: oldProfile.selectedDifficultyModifierIds ?? {},
    },
    activeRun:
      oldRun === null
        ? null
        : {
            ...oldRun,
            variantId: oldRun.variantId ?? null,
            preparationId: oldRun.preparationId ?? null,
            braceUsed: oldRun.braceUsed ?? false,
            braceArmed: oldRun.braceArmed ?? false,
            investigationDiscountUsed: oldRun.investigationDiscountUsed ?? false,
            difficultyModifierIds: oldRun.difficultyModifierIds ?? [],
            randomEventSeed: oldRun.randomEventSeed ?? oldRun.sequence ?? 0,
            randomEventId: oldRun.randomEventId ?? null,
            randomEventsEnabled: oldRun.randomEventsEnabled ?? false,
            workerTransition: oldRun.workerTransition ?? null,
            snowState: oldRun.snowState ?? null,
            lastBattle:
              oldBattle === null
                ? null
                : { ...oldBattle, braceReduction: oldBattle.braceReduction ?? 0 },
          },
    lastSettlement:
      oldSettlement === null
        ? null
        : {
            ...oldSettlement,
            difficultyModifierIds: oldSettlement.difficultyModifierIds ?? [],
            difficultyScore: oldSettlement.difficultyScore ?? 0,
          },
  };
}

function snowRunState(
  value: unknown,
  selectedWorld: WorldDefinition,
  phase: RunState['phase'],
  clearedWaves: number,
  elapsedInStageMs: number,
  stageDurationMs = selectedWorld.mode?.kind === 'snow-observatory'
    ? selectedWorld.mode.stageDurationMs
    : 0,
): SnowRunState | null {
  const mode = selectedWorld.mode;
  if (mode?.kind !== 'snow-observatory') {
    if (value !== null) invalid('生存副本不能携带环境状态。');
    return null;
  }
  if (value === null) invalid('雪站副本缺少环境状态。');
  const parsed = record(value, 'activeRun.snowState');
  const fuel = number(parsed.fuel, 'snowState.fuel');
  const fuelFromWood = number(parsed.fuelFromWood, 'snowState.fuelFromWood');
  const fuelConsumed = number(parsed.fuelConsumed, 'snowState.fuelConsumed');
  const temperature = signedNumber(parsed.temperature, 'snowState.temperature');
  const generatorIntegrity = number(parsed.generatorIntegrity, 'snowState.generatorIntegrity');
  const heaterOn = boolean(parsed.heaterOn, 'snowState.heaterOn');
  const nodesResolved = integer(parsed.nodesResolved, 'snowState.nodesResolved');
  const pendingReason =
    parsed.pendingReason === null
      ? null
      : oneOf(
          parsed.pendingReason,
          ['checkpoint', 'low-temperature', 'fuel-depleted'] as const,
          'snowState.pendingReason',
        );
  const fuelBalance = mode.initialFuel + fuelFromWood - fuelConsumed;
  // Runtime ticks burn fuel in small intervals. Allow only accumulated IEEE-754
  // rounding error in this derived ledger; a material balance change still fails.
  const fuelBalanceTolerance =
    Math.max(1, mode.initialFuel, fuelFromWood, fuelConsumed) * Number.EPSILON * 256;
  if (
    Math.abs(fuel - fuelBalance) > fuelBalanceTolerance ||
    fuel > mode.fuelCapacity ||
    fuelConsumed > mode.initialFuel + fuelFromWood + Number.EPSILON * 8 ||
    temperature < mode.dangerTemperature ||
    temperature > mode.temperatureCap ||
    generatorIntegrity < mode.initialGeneratorIntegrity ||
    generatorIntegrity > mode.generatorIntegrityCapacity ||
    nodesResolved > mode.nodeCount ||
    (heaterOn && fuel === 0) ||
    clearedWaves !== 0 ||
    phase === 'failed'
  )
    invalid('雪站燃料、温度、发电机或节点账目无效。');
  if (
    (phase === 'preparing' &&
      (pendingReason !== null ||
        nodesResolved >= mode.nodeCount ||
        elapsedInStageMs >= stageDurationMs)) ||
    (phase === 'awaiting-environment' &&
      (pendingReason === null ||
        nodesResolved > mode.nodeCount ||
        elapsedInStageMs > stageDurationMs)) ||
    (phase === 'completed' &&
      (pendingReason !== null ||
        nodesResolved !== mode.nodeCount ||
        elapsedInStageMs !== 0 ||
        generatorIntegrity < mode.requiredGeneratorIntegrity)) ||
    (phase !== 'preparing' && phase !== 'awaiting-environment' && phase !== 'completed')
  )
    invalid('雪站阶段、节点与环境停点不一致。');
  if (
    (pendingReason === 'checkpoint' && elapsedInStageMs !== stageDurationMs) ||
    (pendingReason === 'low-temperature' && (temperature > mode.dangerTemperature || heaterOn)) ||
    (pendingReason === 'fuel-depleted' && fuel !== 0)
  )
    invalid('雪站危险停点与环境状态不一致。');
  return {
    fuel,
    fuelFromWood,
    fuelConsumed,
    temperature,
    generatorIntegrity,
    heaterOn,
    nodesResolved,
    pendingReason,
  };
}

function upgradeSchemaFour(value: Record<string, unknown>): Record<string, unknown> {
  const oldRun = value.activeRun === null ? null : record(value.activeRun, 'activeRun');
  return upgradeSchemaSixFields({
    ...value,
    activeRun:
      oldRun === null
        ? null
        : {
            ...oldRun,
            securedRewards: [],
            securedObjectiveIds: [],
            securedClueIds: [],
          },
  });
}

function profile(value: unknown, definition: ExpeditionDefinition): Profile {
  const parsed = record(value, 'profile');
  const points = integer(parsed.points, 'profile.points');
  const totalPoints = integer(parsed.totalPoints, 'profile.totalPoints');
  const perkIds = uniqueIds(
    parsed.perkIds,
    definition.perks.map((perk) => perk.id),
    'profile.perkIds',
  );
  const researchNodeIds = uniqueIds(
    parsed.researchNodeIds,
    (definition.researchNodes ?? []).map((node) => node.id),
    'profile.researchNodeIds',
  );
  const equippedPreparationId =
    parsed.equippedPreparationId === null
      ? null
      : oneOf(
          parsed.equippedPreparationId,
          (definition.researchNodes ?? []).map((node) => node.id),
          'profile.equippedPreparationId',
        );
  if (equippedPreparationId !== null && !researchNodeIds.includes(equippedPreparationId))
    invalid('装备中的准备能力尚未研究。');
  const clearedWorldIds = uniqueIds(
    parsed.clearedWorldIds,
    definition.worlds.map((candidate) => candidate.id),
    'profile.clearedWorldIds',
  );
  const selectedVariantValues = record(parsed.selectedVariantIds, 'profile.selectedVariantIds');
  const selectedVariantIds = Object.create(null) as Record<string, WorldVariantId>;
  for (const [worldId, variantId] of Object.entries(selectedVariantValues)) {
    const variant = (definition.worldVariants ?? []).find(
      (candidate) => candidate.id === variantId && candidate.worldId === worldId,
    );
    if (!variant || !clearedWorldIds.includes(worldId)) invalid('已选返场方案无效。');
    selectedVariantIds[worldId] = variant.id;
  }
  const selectedModifierValues = record(
    parsed.selectedDifficultyModifierIds,
    'profile.selectedDifficultyModifierIds',
  );
  const selectedDifficultyModifierIds = Object.create(null) as Record<
    string,
    Profile['selectedDifficultyModifierIds'][string]
  >;
  for (const [worldId, rawModifierIds] of Object.entries(selectedModifierValues)) {
    const selectedWorld = definition.worlds.find((candidate) => candidate.id === worldId);
    const rawDialogues = record(parsed.dialogueChoices, 'profile.dialogueChoices');
    if (
      !selectedWorld ||
      (selectedWorld.unlockAfterWorld !== null &&
        !clearedWorldIds.includes(selectedWorld.unlockAfterWorld)) ||
      (selectedWorld.unlockAfterDialogueId !== null &&
        !Object.hasOwn(rawDialogues, selectedWorld.unlockAfterDialogueId))
    )
      invalid('难度条款选择引用未知或尚未开放的世界。');
    const modifierIds = uniqueIds(
      rawModifierIds,
      (definition.difficultyModifiers ?? []).map((modifier) => modifier.id),
      `profile.selectedDifficultyModifierIds.${worldId}`,
    );
    if (
      modifierIds.some((id) => {
        const modifier = definition.difficultyModifiers?.find((candidate) => candidate.id === id);
        return !modifier?.appliesToModes.includes(selectedWorld.mode?.kind ?? 'wave-survival');
      })
    )
      invalid('难度条款不适用于所选世界。');
    selectedDifficultyModifierIds[worldId] = modifierIds;
  }
  const nextRunSequence = integer(parsed.nextRunSequence, 'profile.nextRunSequence');
  const settledThrough = integer(parsed.settledThrough, 'profile.settledThrough');
  const completedObjectiveIds = uniqueIds(
    parsed.completedObjectiveIds,
    definition.objectives.map((objective) => objective.id),
    'profile.completedObjectiveIds',
  );
  const discoveredClueIds = uniqueIds(
    parsed.discoveredClueIds,
    definition.story.clues.map((clue) => clue.id),
    'profile.discoveredClueIds',
  );
  const choicesValue = record(parsed.dialogueChoices, 'profile.dialogueChoices');
  const dialogueChoices = Object.create(null) as Record<string, string>;
  for (const [id, optionId] of Object.entries(choicesValue)) {
    const dialogue = definition.story.dialogues.find((candidate) => candidate.id === id);
    if (dialogue === undefined) invalid('主空间对话含未知 ID。');
    const option = dialogue.options.find((candidate) => candidate.id === optionId);
    if (option === undefined) invalid('主空间对话含未知选项。');
    if (
      !dialogue.requiredClueIds.every((clueId) => discoveredClueIds.includes(clueId)) ||
      !discoveredClueIds.includes(option.grantsClueId)
    )
      invalid('主空间对话缺少前置线索或对应选择线索。');
    dialogueChoices[id] = option.id;
  }
  const parsedProfile: Profile = {
    points,
    totalPoints,
    perkIds,
    researchNodeIds,
    equippedPreparationId,
    selectedVariantIds,
    clearedWorldIds,
    nextRunSequence,
    settledThrough,
    discoveredClueIds,
    dialogueChoices,
    completedObjectiveIds,
    selectedDifficultyModifierIds,
  };
  const root = definition.researchRoot;
  for (const nodeId of researchNodeIds) {
    const node = definition.researchNodes?.find((candidate) => candidate.id === nodeId);
    if (
      !node ||
      (root !== undefined &&
        root !== null &&
        !root.requiredClueIds.every((clueId) => discoveredClueIds.includes(clueId))) ||
      !node.requiredClueIds.every((clueId) => discoveredClueIds.includes(clueId)) ||
      !node.requiredResearchNodeIds.every((requiredId) => researchNodeIds.includes(requiredId))
    )
      invalid('已研究节点缺少证据或研究前置。');
  }
  for (const variantId of Object.values(selectedVariantIds)) {
    const variant = definition.worldVariants?.find((candidate) => candidate.id === variantId);
    if (!variant || !isWorldVariantAvailable(parsedProfile, variant, definition))
      invalid('已选返场方案缺少对应的契约或故事前置。');
  }
  for (const objectiveId of completedObjectiveIds) {
    const objective = definition.objectives.find((candidate) => candidate.id === objectiveId);
    if (!objective || !clearedWorldIds.includes(objective.worldId))
      invalid('永久目标记录缺少对应成功回归。');
  }
  for (const id of discoveredClueIds) {
    const clue = definition.story.clues.find((candidate) => candidate.id === id);
    if (clue === undefined) invalid('未知永久线索。');
    if (clue.source === 'dialogue') {
      if (
        !definition.story.dialogues.some((dialogue) =>
          dialogue.options.some(
            (option) => option.grantsClueId === id && dialogueChoices[dialogue.id] === option.id,
          ),
        )
      )
        invalid('对话线索缺少实际选择记录。');
    } else {
      if (clue.worldId === null || !clearedWorldIds.includes(clue.worldId))
        invalid('永久副本线索缺少对应成功回归记录。');
      if (clue.requiresContractId !== undefined && clue.requiresContractId !== null) {
        const contract = definition.contracts.find(
          (candidate) => candidate.id === clue.requiresContractId,
        );
        const clueObjectiveId = contract
          ? [...contract.primaryObjectiveIds, ...contract.optionalObjectiveIds].find(
              (objectiveId) =>
                definition.objectives.find((objective) => objective.id === objectiveId)?.clueId ===
                clue.id,
            )
          : undefined;
        if (
          !contract ||
          clueObjectiveId === undefined ||
          !completedObjectiveIds.includes(clueObjectiveId) ||
          !isContractAvailable(
            {
              points,
              totalPoints,
              perkIds,
              researchNodeIds,
              equippedPreparationId,
              selectedVariantIds,
              clearedWorldIds,
              nextRunSequence,
              settledThrough,
              discoveredClueIds,
              dialogueChoices,
              completedObjectiveIds,
              selectedDifficultyModifierIds,
            },
            contract,
          )
        )
          invalid('契约线索缺少对应的分支选择或成功目标。');
      }
      if (
        clue.source === 'project' &&
        !completedObjectiveIds.some(
          (objectiveId) =>
            definition.objectives.find((objective) => objective.id === objectiveId)?.clueId ===
            clue.id,
        )
      )
        invalid('项目线索缺少已完成的永久目标记录。');
    }
  }
  const spent =
    definition.perks.reduce((sum, perk) => sum + (perkIds.includes(perk.id) ? perk.cost : 0), 0) +
    (definition.researchNodes ?? []).reduce(
      (sum, node) => sum + (researchNodeIds.includes(node.id) ? node.cost : 0),
      0,
    );
  if (!Number.isSafeInteger(points + spent) || points + spent !== totalPoints)
    invalid('永久积分余额与累计所得、已兑换奖励不一致。');
  if (nextRunSequence < 1) invalid('下一次副本序号必须为正整数。');
  if (settledThrough === 0 && (totalPoints !== 0 || clearedWorldIds.length !== 0))
    invalid('尚无结算记录时不能拥有永久积分或通关记录。');
  const maximumContractReward = Math.max(
    0,
    ...definition.contracts.map((contract) =>
      [...contract.primaryObjectiveIds, ...contract.optionalObjectiveIds].reduce(
        (sum, id) =>
          sum + (definition.objectives.find((objective) => objective.id === id)?.rewardPoints ?? 0),
        0,
      ),
    ),
  );
  const maximumAward =
    Object.values(definition.rewards).reduce((sum, reward) => sum + reward, 0) +
    definition.earlyBattle.maxPointsPerWave * 3 +
    Math.max(0, ...(definition.difficultyRewardTiers ?? []).map((tier) => tier.points)) +
    maximumContractReward;
  if (totalPoints > Math.min(Number.MAX_SAFE_INTEGER, settledThrough * maximumAward))
    invalid('累计永久积分超过已结算副本的奖励上限。');
  for (const id of clearedWorldIds) {
    const selectedWorld = world(id, definition);
    const prerequisite = selectedWorld.unlockAfterWorld;
    if (prerequisite !== null && !clearedWorldIds.includes(prerequisite))
      invalid('通关记录缺少前置副本。');
    if (
      selectedWorld.unlockAfterDialogueId !== null &&
      !Object.hasOwn(dialogueChoices, selectedWorld.unlockAfterDialogueId)
    )
      invalid('通关记录缺少前置主空间对话。');
  }
  return {
    points,
    totalPoints,
    perkIds,
    researchNodeIds,
    equippedPreparationId,
    selectedVariantIds,
    clearedWorldIds,
    nextRunSequence,
    settledThrough,
    discoveredClueIds,
    dialogueChoices,
    completedObjectiveIds,
    selectedDifficultyModifierIds,
  };
}

function battle(
  value: unknown,
  run: Omit<RunState, 'lastBattle'>,
  selectedWorld: WorldDefinition,
  definition: ExpeditionDefinition,
): BattleReport {
  const parsed = record(value, 'lastBattle');
  const wave = integer(parsed.wave, 'lastBattle.wave');
  const strength = number(parsed.strength, 'lastBattle.strength');
  const defense = number(parsed.defense, 'lastBattle.defense');
  const braceReduction = number(parsed.braceReduction, 'lastBattle.braceReduction');
  const damage = integer(parsed.damage, 'lastBattle.damage');
  const hpAfter = number(parsed.hpAfter, 'lastBattle.hpAfter');
  const survived = boolean(parsed.survived, 'lastBattle.survived');
  const preparationRemainingMs = number(
    parsed.preparationRemainingMs,
    'lastBattle.preparationRemainingMs',
  );
  const initiativePoints = integer(parsed.initiativePoints, 'lastBattle.initiativePoints');
  const stanceId = oneOf(
    parsed.stanceId,
    ['balanced', 'industry', 'fortified'] as const,
    'lastBattle.stanceId',
  );
  const waveStrengths = selectedWorld.waveStrengths;
  const preparationMs = selectedWorld.preparationMs;
  if (waveStrengths === undefined || preparationMs === undefined) invalid('雪站不能记录怪潮战报。');
  if (wave < 1 || wave > 3) invalid('战报波次越界。');
  const modifierDefinitions = run.difficultyModifierIds.flatMap((id) => {
    const modifier = definition.difficultyModifiers?.find((candidate) => candidate.id === id);
    return modifier ? [modifier] : [];
  });
  const stageMultiplier = modifierDefinitions.reduce(
    (multiplier, modifier) =>
      multiplier *
      modifier.effects.reduce(
        (value, effect) =>
          effect.kind === 'stage-duration-multiplier' ? value * effect.multiplier : value,
        1,
      ),
    1,
  );
  const threatMultiplier = modifierDefinitions.reduce(
    (multiplier, modifier) =>
      multiplier *
      modifier.effects.reduce(
        (value, effect) =>
          effect.kind === 'wave-strength-multiplier' ? value * effect.multiplier : value,
        1,
      ),
    1,
  );
  const baseStrength =
    (waveStrengths[wave - 1] ?? 0) *
    (wave === 3 && run.boostedFinal ? definition.finalWaveMultiplier : 1) *
    threatMultiplier;
  const duration = Math.floor((preparationMs[wave - 1] ?? 0) * stageMultiplier);
  if (preparationRemainingMs > duration || stanceId !== run.stanceId)
    invalid('提前迎战时间或路线不一致。');
  const ratio = preparationRemainingMs / duration;
  const expectedBonus = Math.floor(ratio * definition.earlyBattle.maxPointsPerWave);
  const expectedStrength =
    preparationRemainingMs > 0 && expectedBonus > 0
      ? Math.ceil(baseStrength * (1 + ratio * definition.earlyBattle.pressureMultiplier))
      : baseStrength;
  const earnedBonus = survived ? expectedBonus : 0;
  if (initiativePoints !== earnedBonus || run.initiativePoints < initiativePoints)
    invalid('提前迎战奖励不符合战报。');
  const stance = definition.stances.find((item) => item.id === stanceId);
  if (!stance) invalid('未知建设路线。');
  const maxDefense = Math.floor(
    (definition.baseDefense +
      selectedWorld.buildings.reduce(
        (sum, building) => sum + building.defense * run.buildings[building.id],
        0,
      ) +
      (run.beaconChoice === 'restore' ? definition.beaconDefense : 0) +
      definition.workforce.size * definition.workforce.guardDefense) *
      stance.defenseMultiplier,
  );
  const permittedBraceReduction =
    definition.researchNodes?.find((node) => node.id === run.preparationId)?.effect.kind ===
    'brace-next-wave'
      ? (
          definition.researchNodes.find((node) => node.id === run.preparationId)?.effect as {
            readonly kind: 'brace-next-wave';
            readonly damageReduction: number;
          }
        ).damageReduction
      : 0;
  if (
    !equals(strength, expectedStrength) ||
    defense < Math.floor(definition.baseDefense * stance.defenseMultiplier) ||
    (braceReduction !== 0 && braceReduction !== permittedBraceReduction) ||
    (braceReduction > 0 && !run.braceUsed) ||
    (run.braceArmed && braceReduction > 0) ||
    defense > maxDefense + braceReduction ||
    damage !== Math.max(0, Math.ceil(strength - defense))
  )
    invalid('战报强度、防御或伤害关系无效。');
  if (hpAfter > run.maxHp || survived !== hpAfter > 0 || (survived && hpAfter + damage > run.maxHp))
    invalid('战报生命或生死关系无效。');
  if (run.clearedWaves !== (survived ? wave : wave - 1)) invalid('已通过怪潮与战报不一致。');
  if (!survived && run.phase !== 'failed') invalid('死亡战报必须对应失败副本。');
  if (survived && run.phase === 'failed') invalid('失败副本不能保留存活战报。');
  if (
    !equals(run.hp, hpAfter) &&
    !(
      (run.phase === 'preparing' || run.phase === 'awaiting-wave') &&
      run.repairUsed &&
      equals(run.hp, Math.min(run.maxHp, hpAfter + definition.repairHp))
    )
  )
    invalid('当前生命与最近战报、修复记录不一致。');
  return {
    wave,
    strength,
    defense,
    braceReduction,
    damage,
    hpAfter,
    survived,
    preparationRemainingMs,
    initiativePoints,
    stanceId,
  };
}

function activeRun(
  value: unknown,
  selectedProfile: Profile,
  definition: ExpeditionDefinition,
  lastSimulatedAt: number,
): RunState {
  const parsed = record(value, 'activeRun');
  const selectedWorld = world(parsed.worldId, definition);
  if (
    (selectedWorld.unlockAfterWorld !== null &&
      !selectedProfile.clearedWorldIds.includes(selectedWorld.unlockAfterWorld)) ||
    (selectedWorld.unlockAfterDialogueId !== null &&
      !Object.hasOwn(selectedProfile.dialogueChoices, selectedWorld.unlockAfterDialogueId))
  )
    invalid('当前副本尚未解锁。');
  const contractId = oneOf(
    parsed.contractId,
    definition.contracts
      .filter((candidate) => candidate.worldId === selectedWorld.id)
      .map((candidate) => candidate.id),
    'activeRun.contractId',
  );
  const selectedContract = definition.contracts.find((candidate) => candidate.id === contractId);
  if (!selectedContract) invalid('当前契约不存在。');
  if (!isContractAvailable(selectedProfile, selectedContract)) invalid('当前契约尚未解锁。');
  const variantId =
    parsed.variantId === null
      ? null
      : oneOf(
          parsed.variantId,
          (definition.worldVariants ?? []).map((variant) => variant.id),
          'activeRun.variantId',
        );
  const variant =
    variantId === null
      ? undefined
      : (definition.worldVariants ?? []).find((candidate) => candidate.id === variantId);
  if (
    (selectedProfile.selectedVariantIds[selectedWorld.id] !== undefined &&
      selectedProfile.selectedVariantIds[selectedWorld.id] !== variantId) ||
    (variantId !== null &&
      (!variant ||
        variant.worldId !== selectedWorld.id ||
        variant.contractId !== contractId ||
        selectedProfile.selectedVariantIds[selectedWorld.id] !== variantId))
  )
    invalid('当前返场方案与世界、契约或主空间选择不一致。');
  const difficultyModifierIds = uniqueIds<DifficultyModifierId>(
    parsed.difficultyModifierIds,
    (definition.difficultyModifiers ?? []).map((modifier) => modifier.id),
    'activeRun.difficultyModifierIds',
  );
  const selectedModeKind = selectedWorld.mode?.kind ?? 'wave-survival';
  const activeModifiers = difficultyModifierIds.map((id) => {
    const modifier = definition.difficultyModifiers?.find((candidate) => candidate.id === id);
    if (!modifier || !modifier.appliesToModes.includes(selectedModeKind))
      invalid('本局难度条款不适用于当前世界。');
    return modifier;
  });
  const stageDurationMultiplier = activeModifiers.reduce(
    (multiplier, modifier) =>
      multiplier *
      modifier.effects.reduce(
        (effectMultiplier, effect) =>
          effect.kind === 'stage-duration-multiplier'
            ? effectMultiplier * effect.multiplier
            : effectMultiplier,
        1,
      ),
    1,
  );
  const effectiveStageDuration = (durationMs: number): number =>
    Math.max(1, Math.floor(durationMs * stageDurationMultiplier));
  const preparationId =
    parsed.preparationId === null
      ? null
      : oneOf(
          parsed.preparationId,
          (definition.researchNodes ?? []).map((node) => node.id),
          'activeRun.preparationId',
        );
  if (preparationId !== getApplicablePreparationId(selectedProfile, selectedWorld.id, definition))
    invalid('本局准备快照与主空间装备不一致。');
  const sequence = integer(parsed.sequence, 'activeRun.sequence');
  if (
    sequence !== selectedProfile.settledThrough + 1 ||
    selectedProfile.nextRunSequence !== sequence + 1
  )
    invalid('活跃副本序号与永久结算序号不一致。');
  const randomEventSeed = integer(parsed.randomEventSeed, 'activeRun.randomEventSeed');
  const randomEventsEnabled = boolean(parsed.randomEventsEnabled, 'activeRun.randomEventsEnabled');
  if (!Object.hasOwn(parsed, 'randomEventId')) invalid('缺少随机事件选择快照。');
  const randomEventId =
    parsed.randomEventId === null
      ? null
      : oneOf(
          parsed.randomEventId,
          definition.events
            .filter((event) => event.randomPool === 'incident')
            .map((event) => event.id),
          'activeRun.randomEventId',
        );
  const expectedRandomEventId = getRandomEventId(
    selectedWorld,
    contractId,
    variant,
    randomEventSeed,
    definition,
  );
  if (
    (randomEventsEnabled && randomEventId !== expectedRandomEventId) ||
    (!randomEventsEnabled && randomEventId !== null)
  )
    invalid('随机事件记录与副本种子不一致。');
  const phase = oneOf(
    parsed.phase,
    ['preparing', 'awaiting-wave', 'awaiting-environment', 'completed', 'failed'] as const,
    'activeRun.phase',
  );
  const runResources = resources(parsed.resources, 'activeRun.resources');
  const workerPresetId = oneOf(
    parsed.workerPresetId,
    definition.workforce.presets.map((item) => item.id),
    'workerPresetId',
  );
  if (!Object.hasOwn(parsed, 'workerTransition')) invalid('缺少人员转岗快照。');
  const workerTransition =
    parsed.workerTransition === null
      ? null
      : (() => {
          const transitionValue = record(parsed.workerTransition, 'activeRun.workerTransition');
          const targetPresetId = oneOf(
            transitionValue.targetPresetId,
            definition.workforce.presets.map((item) => item.id),
            'activeRun.workerTransition.targetPresetId',
          );
          const remainingMs = number(
            transitionValue.remainingMs,
            'activeRun.workerTransition.remainingMs',
          );
          if (
            definition.workerTransitionMs === undefined ||
            remainingMs <= 0 ||
            remainingMs > definition.workerTransitionMs ||
            targetPresetId === workerPresetId ||
            (phase !== 'preparing' && phase !== 'awaiting-wave' && phase !== 'awaiting-environment')
          )
            invalid('人员转岗倒计时无效。');
          return { targetPresetId, remainingMs };
        })();
  const stanceId = oneOf(
    parsed.stanceId,
    definition.stances.map((item) => item.id),
    'stanceId',
  );
  const stanceChosen = boolean(parsed.stanceChosen, 'stanceChosen');
  const initiativePoints = integer(parsed.initiativePoints, 'initiativePoints');
  const ledgerValue = record(parsed.resourceLedger, 'resourceLedger');
  const resourceLedger = {
    opening: resources(ledgerValue.opening, 'ledger.opening'),
    produced: resources(ledgerValue.produced, 'ledger.produced'),
    collected: resources(ledgerValue.collected, 'ledger.collected'),
    found: resources(ledgerValue.found, 'ledger.found'),
    spent: resources(ledgerValue.spent, 'ledger.spent'),
    sinceUpgrade: boolean(ledgerValue.sinceUpgrade, 'ledger.sinceUpgrade'),
  };
  for (const resource of ['wood', 'stone'] as const) {
    const earned =
      resourceLedger.opening[resource] +
      resourceLedger.produced[resource] +
      resourceLedger.collected[resource] +
      resourceLedger.found[resource];
    if (
      !Number.isFinite(earned) ||
      earned > Number.MAX_SAFE_INTEGER ||
      Math.abs(earned - resourceLedger.spent[resource] - runResources[resource]) >
        Math.max(1, earned) * 1e-9
    )
      invalid('库存与物资收支账目不一致。');
  }
  if (
    runResources.wood > selectedWorld.resourceCaps.wood ||
    runResources.stone > selectedWorld.resourceCaps.stone
  )
    invalid('副本资源超过仓储上限。');
  const buildingsValue = record(parsed.buildings, 'activeRun.buildings');
  if (Object.keys(buildingsValue).length !== BUILDING_IDS.length)
    invalid('建筑记录必须完整且不能包含未知 ID。');
  const buildings = Object.create(null) as Record<BuildingId, number>;
  const clearedWaves = integer(parsed.clearedWaves, 'activeRun.clearedWaves');
  if (clearedWaves > 3) invalid('已通过怪潮数量越界。');
  if (initiativePoints > clearedWaves * definition.earlyBattle.maxPointsPerWave)
    invalid('提前奖励超过已获胜波次上限。');
  if (
    (!stanceChosen && (stanceId !== 'balanced' || clearedWaves > 0 || phase === 'failed')) ||
    (phase !== 'preparing' && !stanceChosen && stanceId !== 'balanced')
  )
    invalid('建设路线锁定状态无效。');
  for (const id of BUILDING_IDS) {
    if (!Object.hasOwn(buildingsValue, id)) invalid('建筑记录缺少稳定 ID。');
    const countValue = buildingsValue[id];
    const building = selectedWorld.buildings.find((candidate) => candidate.id === id);
    const count = integer(countValue, `buildings.${id}`);
    if (
      (building === undefined && count !== 0) ||
      (building !== undefined &&
        (count > building.maxCount || (count > 0 && clearedWaves < building.unlockAfterWave)))
    )
      invalid('建筑数量或解锁关系无效。');
    buildings[id] = count;
  }
  const hp = number(parsed.hp, 'activeRun.hp');
  const maxHp = number(parsed.maxHp, 'activeRun.maxHp');
  if (
    maxHp !== getRunMaxHp(selectedProfile, definition) ||
    hp > maxHp ||
    (phase === 'failed' ? hp !== 0 : hp === 0)
  )
    invalid('副本生命上限或生死关系无效。');
  const elapsedInStageMs = number(parsed.elapsedInStageMs, 'activeRun.elapsedInStageMs');
  const gatherAvailableAt = number(parsed.gatherAvailableAt, 'activeRun.gatherAvailableAt');
  if (gatherAvailableAt > lastSimulatedAt + definition.gatherCooldownMs)
    invalid('采集冷却时间超出当前规则。');
  const snowMode = selectedWorld.mode?.kind === 'snow-observatory' ? selectedWorld.mode : null;
  if (snowMode === null) {
    const waveSchedule = selectedWorld.preparationMs;
    if (waveSchedule === undefined || selectedWorld.waveStrengths === undefined)
      invalid('生存副本缺少固定怪潮日程。');
    const stageDuration = waveSchedule[clearedWaves];
    const effectiveDuration =
      stageDuration === undefined ? undefined : effectiveStageDuration(stageDuration);
    if (phase === 'completed' && clearedWaves !== 3) invalid('完成状态必须通过三轮怪潮。');
    if (phase !== 'completed' && clearedWaves === 3) invalid('三轮怪潮完成后的阶段无效。');
    if (phase === 'completed' || phase === 'failed') {
      if (elapsedInStageMs !== 0) invalid('结束状态不能保留准备阶段计时。');
    } else if (
      phase === 'awaiting-environment' ||
      stageDuration === undefined ||
      (phase === 'awaiting-wave'
        ? elapsedInStageMs !== effectiveDuration
        : elapsedInStageMs >= (effectiveDuration ?? 0))
    )
      invalid('准备计时与待处理怪潮阶段不一致。');
  } else if (
    selectedWorld.preparationMs !== undefined ||
    selectedWorld.waveStrengths !== undefined
  ) {
    invalid('雪站不能携带怪潮日程。');
  }
  const snowState = snowRunState(
    parsed.snowState,
    selectedWorld,
    phase,
    clearedWaves,
    elapsedInStageMs,
    snowMode === null ? undefined : effectiveStageDuration(snowMode.stageDurationMs),
  );
  const anchorMode = selectedWorld.mode?.kind === 'anchor-city' ? selectedWorld.mode : null;
  const anchorCityState =
    anchorMode === null
      ? (() => {
          if (parsed.anchorCityState !== null) invalid('非失籍城副本不能携带界锚状态。');
          return null;
        })()
      : (() => {
          const anchorValue = record(parsed.anchorCityState, 'activeRun.anchorCityState');
          const stability = number(anchorValue.stability, 'activeRun.anchorCityState.stability');
          if (stability > anchorMode.stabilityCapacity) invalid('界锚稳定度超过上限。');
          return { stability };
        })();
  const beaconChoice =
    parsed.beaconChoice === null
      ? null
      : oneOf(parsed.beaconChoice, ['salvage', 'restore'] as const, 'activeRun.beaconChoice');
  const boostedFinal = boolean(parsed.boostedFinal, 'activeRun.boostedFinal');
  const repairUsed = boolean(parsed.repairUsed, 'activeRun.repairUsed');
  const braceUsed = boolean(parsed.braceUsed, 'activeRun.braceUsed');
  const braceArmed = boolean(parsed.braceArmed, 'activeRun.braceArmed');
  const investigationDiscountUsed = boolean(
    parsed.investigationDiscountUsed,
    'activeRun.investigationDiscountUsed',
  );
  if (braceArmed && (!braceUsed || phase !== 'awaiting-wave'))
    invalid('防御准备只能在待迎战阶段生效。');
  if (beaconChoice !== null && clearedWaves < 1) invalid('信标事件尚未触发。');
  if (boostedFinal && clearedWaves < 2) invalid('最后一轮强化尚未解锁。');
  if (repairUsed && !selectedProfile.perkIds.includes('field-repair'))
    invalid('没有永久修复奖励，不能拥有修复记录。');
  if (
    snowMode !== null &&
    (phase === 'awaiting-wave' ||
      beaconChoice !== null ||
      boostedFinal ||
      repairUsed ||
      braceUsed ||
      braceArmed ||
      initiativePoints > 0)
  )
    invalid('雪站副本不能携带怪潮、信标或战斗能力记录。');
  const preparationEffect =
    preparationId === null
      ? undefined
      : definition.researchNodes?.find((node) => node.id === preparationId)?.effect;
  if (
    (braceUsed && preparationEffect?.kind !== 'brace-next-wave') ||
    (investigationDiscountUsed && preparationEffect?.kind !== 'investigation-cost-discount')
  )
    invalid('本局准备工具的使用记录无效。');
  const contractObjectiveIds = [
    ...selectedContract.primaryObjectiveIds,
    ...selectedContract.optionalObjectiveIds,
  ];
  const eventValues = record(parsed.eventChoices, 'activeRun.eventChoices');
  const eventChoices = Object.create(null) as Record<string, string>;
  for (const [eventId, optionId] of Object.entries(eventValues)) {
    const event = definition.events.find((candidate) => candidate.id === eventId);
    const option = event?.options.find((candidate) => candidate.id === optionId);
    if (
      !event ||
      !option ||
      event.worldId !== selectedWorld.id ||
      (event.randomPool === 'incident' && (!randomEventsEnabled || event.id !== randomEventId)) ||
      (variantId !== null &&
        event.groupId !== undefined &&
        event.groupId !== null &&
        event.groupId !== variant?.eventGroupId) ||
      event.afterClearedWaves > clearedWaves ||
      (event.afterEnvironmentNodes !== undefined &&
        (snowState === null || snowState.nodesResolved < event.afterEnvironmentNodes)) ||
      (event.requiresObjectiveId !== null &&
        !contractObjectiveIds.includes(event.requiresObjectiveId))
    )
      invalid('事件选择与当前世界或契约不一致。');
    eventChoices[eventId] = option.id;
  }
  const completedProjectIds = uniqueIds(
    parsed.completedProjectIds,
    definition.projects
      .filter((project) => project.worldId === selectedWorld.id)
      .map((project) => project.id),
    'activeRun.completedProjectIds',
  );
  for (const projectId of completedProjectIds) {
    const project = definition.projects.find((candidate) => candidate.id === projectId);
    if (
      !project ||
      project.afterClearedWaves > clearedWaves ||
      !contractObjectiveIds.includes(project.objectiveId) ||
      eventChoices[project.requiredEventChoice.eventId] !== project.requiredEventChoice.optionId
    )
      invalid('已完成项目缺少进度、契约或事件前置事实。');
  }
  const activeProject =
    parsed.activeProject === null
      ? null
      : (() => {
          const projectValue = record(parsed.activeProject, 'activeRun.activeProject');
          const projectId = oneOf(
            projectValue.projectId,
            definition.projects
              .filter((candidate) => candidate.worldId === selectedWorld.id)
              .map((candidate) => candidate.id),
            'activeRun.activeProject.projectId',
          );
          const project = definition.projects.find((candidate) => candidate.id === projectId);
          const workerRole = oneOf(
            projectValue.workerRole,
            ['wood', 'stone', 'guard'] as const,
            'activeRun.activeProject.workerRole',
          );
          const elapsedMs = number(projectValue.elapsedMs, 'activeRun.activeProject.elapsedMs');
          const preset = definition.workforce.presets.find((item) => item.id === workerPresetId);
          if (
            !project ||
            completedProjectIds.includes(projectId) ||
            !contractObjectiveIds.includes(project.objectiveId) ||
            project.afterClearedWaves > clearedWaves ||
            (project.minimumAnchorStability !== undefined &&
              (anchorCityState?.stability ?? 0) < project.minimumAnchorStability) ||
            elapsedMs >= project.durationMs ||
            !preset ||
            preset[workerRole] < project.workerCount ||
            eventChoices[project.requiredEventChoice.eventId] !==
              project.requiredEventChoice.optionId
          )
            invalid('进行中的项目缺少人力、事件或阶段条件。');
          return { projectId, workerRole, elapsedMs };
        })();
  if (workerTransition !== null && activeProject !== null) {
    const targetPreset = definition.workforce.presets.find(
      (preset) => preset.id === workerTransition.targetPresetId,
    );
    const project = definition.projects.find(
      (candidate) => candidate.id === activeProject.projectId,
    );
    if (!targetPreset || !project || targetPreset[activeProject.workerRole] < project.workerCount)
      invalid('转岗目标无法保留进行中项目所需人力。');
  }
  const recoveredClueIds = uniqueIds(
    parsed.recoveredClueIds,
    definition.story.clues.map((clue) => clue.id),
    'activeRun.recoveredClueIds',
  );
  if (investigationDiscountUsed && recoveredClueIds.length === 0)
    invalid('调查准备工具已使用但没有回收任何线索。');
  for (const id of recoveredClueIds) {
    const clue = definition.story.clues.find((candidate) => candidate.id === id);
    if (
      clue === undefined ||
      clue.worldId !== selectedWorld.id ||
      selectedProfile.discoveredClueIds.includes(id) ||
      clearedWaves < clue.minClearedWaves ||
      (clue.requiresBuilding !== null && buildings[clue.requiresBuilding] === 0) ||
      (clue.requiresBeacon !== null && beaconChoice !== clue.requiresBeacon) ||
      (clue.source === 'investigate' && clue.requiresProjectId !== null) ||
      (clue.source === 'project' &&
        (clue.requiresProjectId === null ||
          !completedProjectIds.includes(clue.requiresProjectId))) ||
      (clue.source !== 'investigate' && clue.source !== 'project')
    )
      invalid('本局回收线索来源、条件或永久记录不一致。');
  }
  for (const projectId of completedProjectIds) {
    const project = definition.projects.find((candidate) => candidate.id === projectId);
    const clueId = definition.objectives.find(
      (candidate) => candidate.id === project?.objectiveId,
    )?.clueId;
    if (
      clueId !== null &&
      clueId !== undefined &&
      !selectedProfile.discoveredClueIds.includes(clueId) &&
      !recoveredClueIds.includes(clueId)
    )
      invalid('已完成项目缺少随队线索。');
  }
  const securedObjectiveIds = uniqueIds(
    parsed.securedObjectiveIds,
    contractObjectiveIds,
    'activeRun.securedObjectiveIds',
  );
  const securedClueIds = uniqueIds(
    parsed.securedClueIds,
    definition.story.clues.map((clue) => clue.id),
    'activeRun.securedClueIds',
  );
  if (!Array.isArray(parsed.securedRewards)) invalid('已锁定奖励必须是列表。');
  const securedRewards: RewardLine[] = [];
  const rewardAmounts: Record<string, number> = {
    base: definition.rewards.base,
    monument: definition.rewards.monument,
    beacon: definition.rewards.beacon,
    'final-wave': definition.rewards.finalWave,
    'boosted-final': definition.rewards.boostedFinal,
  };
  for (const line of parsed.securedRewards) {
    const reward = record(line, 'activeRun.securedReward');
    const rawId = reward.id;
    const objectiveId =
      typeof rawId === 'string' && rawId.startsWith('objective:')
        ? rawId.slice('objective:'.length)
        : null;
    const objective =
      objectiveId === null
        ? undefined
        : definition.objectives.find((candidate) => candidate.id === objectiveId);
    const id: RewardLine['id'] =
      objectiveId !== null
        ? `objective:${objectiveId}`
        : oneOf(
            rawId,
            ['base', 'monument', 'beacon', 'final-wave', 'boosted-final', 'initiative'] as const,
            'activeRun.securedReward.id',
          );
    const points = integer(reward.points, 'activeRun.securedReward.points');
    const permitted =
      objectiveId !== null
        ? objective !== undefined &&
          securedObjectiveIds.includes(objectiveId) &&
          objective.rewardPoints > 0 &&
          points === objective.rewardPoints
        : id === 'initiative'
          ? points > 0 && points <= initiativePoints
          : points === rewardAmounts[id] &&
            (id === 'base' ||
              (id === 'monument' && buildings.monument > 0) ||
              (id === 'beacon' && beaconChoice === 'restore') ||
              (id === 'final-wave' && clearedWaves === 3) ||
              (id === 'boosted-final' && clearedWaves === 3 && boostedFinal));
    if (!permitted || securedRewards.some((candidate) => candidate.id === id))
      invalid('已锁定奖励来源、金额或 ID 无效。');
    securedRewards.push({ id, points });
  }
  const hasSecureAnchor = securedObjectiveIds.length > 0;
  if (
    (!hasSecureAnchor && (securedRewards.length > 0 || securedClueIds.length > 0)) ||
    (hasSecureAnchor &&
      (!selectedContract.primaryObjectiveIds.every((id) => securedObjectiveIds.includes(id)) ||
        !securedRewards.some((reward) => reward.id === 'base') ||
        securedRewards.some(
          (reward) => reward.id === 'final-wave' || reward.id === 'boosted-final',
        )))
  )
    invalid('安全返航锚点缺少基础目标或基础奖励。');
  const committedCosts = { wood: 0, stone: 0 };
  for (const [eventId, optionId] of Object.entries(eventChoices)) {
    const cost = definition.events
      .find((candidate) => candidate.id === eventId)
      ?.options.find((candidate) => candidate.id === optionId)?.cost;
    if (cost) {
      committedCosts.wood += cost.wood;
      committedCosts.stone += cost.stone;
    }
  }
  for (const projectId of [
    ...completedProjectIds,
    ...(activeProject ? [activeProject.projectId] : []),
  ]) {
    const projectCost = definition.projects.find((candidate) => candidate.id === projectId)?.cost;
    if (projectCost) {
      committedCosts.wood += projectCost.wood;
      committedCosts.stone += projectCost.stone;
    }
  }
  if (
    committedCosts.wood > resourceLedger.spent.wood ||
    committedCosts.stone > resourceLedger.spent.stone
  )
    invalid('事件与项目花费超过本局累计消耗。');
  const run = {
    sequence,
    worldId: selectedWorld.id,
    contractId,
    variantId,
    preparationId,
    phase,
    snowState,
    anchorCityState,
    resources: runResources,
    buildings,
    hp,
    maxHp,
    clearedWaves,
    elapsedInStageMs,
    gatherAvailableAt,
    beaconChoice,
    boostedFinal,
    repairUsed,
    braceUsed,
    braceArmed,
    investigationDiscountUsed,
    recoveredClueIds,
    workerPresetId,
    stanceId,
    stanceChosen,
    initiativePoints,
    securedRewards,
    securedObjectiveIds,
    securedClueIds,
    resourceLedger,
    eventChoices,
    activeProject,
    completedProjectIds,
    difficultyModifierIds,
    randomEventSeed,
    randomEventId,
    randomEventsEnabled,
    workerTransition,
  };
  const objectiveCompleted = (objectiveId: string): boolean => {
    const objective = definition.objectives.find((candidate) => candidate.id === objectiveId);
    return (
      objective !== undefined &&
      objective.conditions.every((condition) => {
        switch (condition.kind) {
          case 'building-count':
            return buildings[condition.buildingId] >= condition.count;
          case 'cleared-waves':
            return clearedWaves >= condition.count;
          case 'environment-node-count':
            return (snowState?.nodesResolved ?? 0) >= condition.count;
          case 'generator-integrity':
            return (snowState?.generatorIntegrity ?? 0) >= condition.minimum;
          case 'completed-project':
            return completedProjectIds.includes(condition.projectId);
        }
      })
    );
  };
  const hasPendingBlockingEvent = definition.events.some(
    (event) =>
      event.worldId === selectedWorld.id &&
      (event.randomPool !== 'incident' || (randomEventsEnabled && event.id === randomEventId)) &&
      (event.minimumAnchorStability === undefined ||
        (anchorCityState?.stability ?? 0) >= event.minimumAnchorStability) &&
      (variant === undefined ||
        event.groupId === undefined ||
        event.groupId === null ||
        event.groupId === variant?.eventGroupId) &&
      (event.afterEnvironmentNodes === undefined
        ? event.afterClearedWaves <= clearedWaves
        : (snowState?.nodesResolved ?? 0) >= event.afterEnvironmentNodes &&
          phase === 'awaiting-environment') &&
      (event.requiresObjectiveId === null ||
        contractObjectiveIds.includes(event.requiresObjectiveId)) &&
      !Object.hasOwn(eventChoices, event.id),
  );
  const objectiveClues = securedObjectiveIds.flatMap((objectiveId) => {
    const clueId = definition.objectives.find((candidate) => candidate.id === objectiveId)?.clueId;
    return clueId === null || clueId === undefined ? [] : [clueId];
  });
  const returnClues = definition.story.clues
    .filter(
      (clue) =>
        clue.source === 'return' &&
        clue.worldId === selectedWorld.id &&
        (clue.requiresContractId === undefined ||
          clue.requiresContractId === null ||
          clue.requiresContractId === contractId) &&
        clearedWaves >= clue.minClearedWaves &&
        (clue.requiresBuilding === null || buildings[clue.requiresBuilding] > 0) &&
        (clue.requiresBeacon === null || beaconChoice === clue.requiresBeacon) &&
        (clue.requiresProjectId === null || completedProjectIds.includes(clue.requiresProjectId)),
    )
    .map((clue) => clue.id);
  const allowedSecuredClues = new Set([...objectiveClues, ...recoveredClueIds, ...returnClues]);
  if (
    securedObjectiveIds.some((id) => !objectiveCompleted(id)) ||
    (hasSecureAnchor &&
      (!selectedContract.primaryObjectiveIds.every(objectiveCompleted) ||
        hasPendingBlockingEvent)) ||
    securedObjectiveIds.some((id) => {
      const objective = definition.objectives.find((candidate) => candidate.id === id);
      return (
        objective !== undefined &&
        objective.rewardPoints > 0 &&
        !securedRewards.some((reward) => reward.id === `objective:${id}`)
      );
    }) ||
    objectiveClues.some((id) => !securedClueIds.includes(id)) ||
    securedClueIds.some((id) => !allowedSecuredClues.has(id))
  )
    invalid('安全返航锚点记录了尚未完成的目标或线索。');
  const lastBattle =
    parsed.lastBattle === null ? null : battle(parsed.lastBattle, run, selectedWorld, definition);
  if (lastBattle === null && (clearedWaves > 0 || phase === 'failed' || repairUsed || hp !== maxHp))
    invalid('战斗或修复进度缺少战报。');
  return { ...run, lastBattle };
}

function settlement(
  value: unknown,
  selectedProfile: Profile,
  definition: ExpeditionDefinition,
): Settlement {
  const parsed = record(value, 'lastSettlement');
  const sequence = integer(parsed.sequence, 'lastSettlement.sequence');
  if (sequence !== selectedProfile.settledThrough || sequence === 0)
    invalid('结算凭据与永久结算序号不一致。');
  const selectedWorld = world(parsed.worldId, definition);
  const contractId = oneOf(
    parsed.contractId,
    definition.contracts
      .filter((candidate) => candidate.worldId === selectedWorld.id)
      .map((candidate) => candidate.id),
    'lastSettlement.contractId',
  );
  const selectedContract = definition.contracts.find((candidate) => candidate.id === contractId);
  if (!selectedContract) invalid('结算契约不存在。');
  if (
    (selectedWorld.unlockAfterWorld !== null &&
      !selectedProfile.clearedWorldIds.includes(selectedWorld.unlockAfterWorld)) ||
    (selectedWorld.unlockAfterDialogueId !== null &&
      !Object.hasOwn(selectedProfile.dialogueChoices, selectedWorld.unlockAfterDialogueId))
  )
    invalid('结算记录的副本缺少解锁条件。');
  const outcome = oneOf(
    parsed.outcome,
    ['success', 'secured', 'failed', 'abandoned'] as const,
    'lastSettlement.outcome',
  );
  const clearedWaves = integer(parsed.clearedWaves, 'lastSettlement.clearedWaves');
  const points = integer(parsed.points, 'lastSettlement.points');
  const completedObjectiveIds = uniqueIds(
    parsed.completedObjectiveIds,
    definition.objectives
      .filter((objective) => objective.worldId === selectedWorld.id)
      .map((objective) => objective.id),
    'lastSettlement.completedObjectiveIds',
  );
  const difficultyModifierIds = uniqueIds<DifficultyModifierId>(
    parsed.difficultyModifierIds,
    (definition.difficultyModifiers ?? []).map((modifier) => modifier.id),
    'lastSettlement.difficultyModifierIds',
  );
  const difficultyScore = integer(parsed.difficultyScore, 'lastSettlement.difficultyScore');
  const difficultyDefinitions = difficultyModifierIds.map((id) => {
    const modifier = definition.difficultyModifiers?.find((candidate) => candidate.id === id);
    if (!modifier || !modifier.appliesToModes.includes(selectedWorld.mode?.kind ?? 'wave-survival'))
      invalid('结算中的难度条款不适用于副本。');
    return modifier;
  });
  const expectedDifficultyScore = difficultyDefinitions.reduce(
    (total, modifier) => total + modifier.difficulty,
    0,
  );
  if (difficultyScore !== expectedDifficultyScore) invalid('结算难度值与所选条款不一致。');
  const expectedDifficultyReward =
    outcome === 'success'
      ? (definition.difficultyRewardTiers?.find(
          (tier) =>
            difficultyScore >= tier.minimumDifficulty &&
            (tier.maximumDifficulty === null || difficultyScore <= tier.maximumDifficulty),
        )?.points ?? 0)
      : 0;
  const contractObjectiveIds = [
    ...selectedContract.primaryObjectiveIds,
    ...selectedContract.optionalObjectiveIds,
  ];
  const isSnowWorld = selectedWorld.mode?.kind === 'snow-observatory';
  if (
    (isSnowWorld
      ? clearedWaves !== 0
      : clearedWaves > 3 ||
        (outcome === 'success' && clearedWaves < 2) ||
        (outcome === 'secured' && (clearedWaves < 2 || clearedWaves >= 3)) ||
        (outcome === 'failed' && clearedWaves === 3)) ||
    completedObjectiveIds.some((id) => !contractObjectiveIds.includes(id)) ||
    ((outcome === 'success' || outcome === 'secured') &&
      !selectedContract.primaryObjectiveIds.every((id) => completedObjectiveIds.includes(id))) ||
    ((outcome === 'failed' || outcome === 'abandoned') && completedObjectiveIds.length > 0) ||
    (outcome === 'secured' && !selectedProfile.clearedWorldIds.includes(selectedWorld.id)) ||
    completedObjectiveIds.some((id) => !selectedProfile.completedObjectiveIds.includes(id))
  )
    invalid('结算结果与怪潮进度不一致。');
  if (!Array.isArray(parsed.rewards)) invalid('结算奖励必须是列表。');
  const rewards: RewardLine[] = [];
  const amounts: Record<string, number> = {
    base: definition.rewards.base,
    monument: definition.rewards.monument,
    beacon: definition.rewards.beacon,
    'final-wave': definition.rewards.finalWave,
    'boosted-final': definition.rewards.boostedFinal,
    difficulty: expectedDifficultyReward,
  };
  for (const line of parsed.rewards) {
    const reward = record(line, 'reward');
    const rawId = reward.id;
    const objectiveId =
      typeof rawId === 'string' && rawId.startsWith('objective:')
        ? rawId.slice('objective:'.length)
        : null;
    const objective =
      objectiveId === null
        ? undefined
        : definition.objectives.find((candidate) => candidate.id === objectiveId);
    const id: RewardLine['id'] =
      objectiveId !== null
        ? `objective:${objectiveId}`
        : oneOf(
            rawId,
            [
              'base',
              'monument',
              'beacon',
              'final-wave',
              'boosted-final',
              'initiative',
              'difficulty',
            ] as const,
            'reward.id',
          );
    const amount = integer(reward.points, 'reward.points');
    if (
      rewards.some((existing) => existing.id === id) ||
      (objectiveId !== null
        ? !objective ||
          !completedObjectiveIds.includes(objectiveId) ||
          !contractObjectiveIds.includes(objectiveId) ||
          amount !== objective.rewardPoints ||
          amount <= 0
        : id === 'initiative'
          ? amount <= 0 || amount > clearedWaves * definition.earlyBattle.maxPointsPerWave
          : id === 'difficulty'
            ? amount !== expectedDifficultyReward || expectedDifficultyReward <= 0
            : amount !== amounts[id])
    )
      invalid('奖励 ID 重复或积分与规则不符。');
    rewards.push({ id, points: amount });
  }
  if (
    points !== rewards.reduce((sum, reward) => sum + reward.points, 0) ||
    points > selectedProfile.totalPoints
  )
    invalid('结算积分明细与总额不一致。');
  const has = (id: RewardLine['id']) => rewards.some((reward) => reward.id === id);
  if (outcome === 'success' || outcome === 'secured') {
    if (
      !has('base') ||
      (outcome === 'success' && has('final-wave') !== (clearedWaves === 3)) ||
      (outcome === 'secured' && (has('final-wave') || has('boosted-final'))) ||
      (has('boosted-final') && !has('final-wave')) ||
      expectedDifficultyReward > 0 !== has('difficulty') ||
      completedObjectiveIds.some((id) => {
        const objective = definition.objectives.find((candidate) => candidate.id === id);
        return (
          objective !== undefined &&
          objective.rewardPoints > 0 !== rewards.some((reward) => reward.id === `objective:${id}`)
        );
      }) ||
      !selectedProfile.clearedWorldIds.includes(selectedWorld.id)
    )
      invalid('成功或安全返航结算奖励、目标或通关记录不一致。');
  } else if (points !== 0 || rewards.length !== 0) invalid('死亡或放弃不能获得本次永久积分。');
  return {
    sequence,
    worldId: selectedWorld.id,
    contractId,
    outcome,
    clearedWaves,
    rewards,
    points,
    completedObjectiveIds,
    difficultyModifierIds,
    difficultyScore,
  };
}

export function decodeExpeditionSave(
  contents: string,
  definition: ExpeditionDefinition,
  legacyDefinition: GameDefinition,
  previousDefinition?: Version2Definition,
  now?: number,
  previousV3Definition?: ExpeditionDefinition,
  previousV4Definition?: ExpeditionDefinition,
  previousV5Definition?: ExpeditionDefinition,
  previousV6Definition?: ExpeditionDefinition,
  previousV7Definition?: ExpeditionDefinition,
  previousV8Definition?: ExpeditionDefinition,
  previousV9Definition?: ExpeditionDefinition,
  previousV10Definition?: ExpeditionDefinition,
  previousV11Definition?: ExpeditionDefinition,
  previousV13Definition?: ExpeditionDefinition,
): SaveBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch {
    throw new SaveValidationError('INVALID_JSON', '存档不是有效 JSON，原存档未被覆盖。');
  }
  return validateExpeditionSave(
    parsed,
    definition,
    legacyDefinition,
    previousDefinition,
    now,
    previousV3Definition,
    previousV4Definition,
    previousV5Definition,
    previousV6Definition,
    previousV7Definition,
    previousV8Definition,
    previousV9Definition,
    previousV10Definition,
    previousV11Definition,
    previousV13Definition,
  );
}

export function validateExpeditionSave(
  value: unknown,
  definition: ExpeditionDefinition,
  legacyDefinition: GameDefinition,
  previousDefinition?: Version2Definition,
  now?: number,
  previousV3Definition?: ExpeditionDefinition,
  previousV4Definition?: ExpeditionDefinition,
  previousV5Definition?: ExpeditionDefinition,
  previousV6Definition?: ExpeditionDefinition,
  previousV7Definition?: ExpeditionDefinition,
  previousV8Definition?: ExpeditionDefinition,
  previousV9Definition?: ExpeditionDefinition,
  previousV10Definition?: ExpeditionDefinition,
  previousV11Definition?: ExpeditionDefinition,
  previousV13Definition?: ExpeditionDefinition,
): SaveBundle {
  const parsed = migrateSchema9OutpostAutomationFields(record(value, '存档'));
  if (parsed.schemaVersion === 7)
    throw new SaveValidationError(
      'UNSUPPORTED_VERSION',
      '检测到旧版 v0.7.1《失落航标》存档（schema 7 / content 12.0.0）。请使用旧版 v0.7.1 打开；此文件未修改。',
    );
  if (
    parsed.schemaVersion === 8 &&
    parsed.contentVersion === '13.0.0' &&
    definition.contentVersion === '14.0.0'
  ) {
    if (previousV13Definition?.contentVersion !== '13.0.0')
      throw new SaveValidationError(
        'UNSUPPORTED_VERSION',
        '缺少冻结的 v13 规则，旧存档保持不变，不能按新规则补算。',
      );
    const frozen = validateExpeditionSave(
      parsed,
      previousV13Definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
      previousV8Definition,
      previousV9Definition,
      previousV10Definition,
      previousV11Definition,
    );
    const migratedAt = now ?? frozen.lastSimulatedAt;
    const advanced = advanceExpedition(frozen, previousV13Definition, migratedAt);
    if (definition.outpost === undefined) invalid('v14 缺少驻地内容定义。');
    return validateExpeditionSave(
      {
        ...advanced,
        schemaVersion: 9,
        contentVersion: definition.contentVersion,
        outpost: createOutpost(definition.outpost),
      },
      definition,
      legacyDefinition,
      previousDefinition,
      undefined,
    );
  }
  if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion < 8)
    throw new SaveValidationError(
      'UNSUPPORTED_VERSION',
      '此版本从 schema 8 新档开始，不迁移旧版存档；原文件未修改。',
    );
  const expectedSchema = definition.outpost === undefined ? 8 : 9;
  if (parsed.schemaVersion !== 8 && parsed.schemaVersion !== expectedSchema)
    throw new SaveValidationError(
      'UNSUPPORTED_VERSION',
      '不支持此存档格式或内容版本，原存档未被覆盖。',
    );
  if (hasSchemaVersion(parsed, 1)) {
    const legacyArchive = validateSaveState(parsed, legacyDefinition);
    return {
      schemaVersion: 7,
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
      legacyArchive,
      outpost: definition.outpost === undefined ? null : createOutpost(definition.outpost),
      lastSimulatedAt: legacyArchive.lastSimulatedAt,
    };
  }
  if (hasSchemaVersion(parsed, 2) && previousDefinition !== undefined) {
    const old = validateVersion2Save(parsed, previousDefinition, legacyDefinition);
    const migrated = migrateVersion2Save(
      old,
      previousDefinition,
      definition,
      now ?? old.lastSimulatedAt,
    );
    return validateExpeditionSave(
      migrated,
      definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
    );
  }
  if (hasSchemaVersion(parsed, 3)) {
    if (
      previousV3Definition === undefined ||
      parsed.contentVersion !== previousV3Definition.contentVersion ||
      previousV3Definition.contentVersion !== '3.0.0'
    )
      throw new SaveValidationError(
        'UNSUPPORTED_VERSION',
        '缺少冻结的 v3 规则，旧存档保持不变，不能按新规则补算。',
      );
    const oldProfile = record(parsed.profile, 'profile');
    const defaultContract = (worldId: string) => {
      const contract = definition.contracts.find(
        (candidate) => candidate.worldId === worldId && candidate.isDefault,
      );
      if (!contract) invalid(`缺少副本默认契约：${worldId}`);
      return contract;
    };
    const oldSettlement =
      parsed.lastSettlement === null ? null : record(parsed.lastSettlement, 'lastSettlement');
    const settledObjectives =
      oldSettlement !== null && oldSettlement.outcome === 'success'
        ? defaultContract(String(oldSettlement.worldId)).primaryObjectiveIds
        : [];
    const oldRun = parsed.activeRun === null ? null : record(parsed.activeRun, 'activeRun');
    const normalized = upgradeSchemaSixFields({
      ...parsed,
      schemaVersion: 7,
      contentVersion: definition.contentVersion,
      profile: { ...oldProfile, completedObjectiveIds: settledObjectives },
      activeRun:
        oldRun === null
          ? null
          : {
              ...oldRun,
              contractId: defaultContract(String(oldRun.worldId)).id,
              eventChoices: {},
              activeProject: null,
              completedProjectIds: [],
              securedRewards: [],
              securedObjectiveIds: [],
              securedClueIds: [],
            },
      lastSettlement:
        oldSettlement === null
          ? null
          : {
              ...oldSettlement,
              contractId: defaultContract(String(oldSettlement.worldId)).id,
              completedObjectiveIds: settledObjectives,
            },
    });
    const validated = validateExpeditionSave(
      normalized,
      definition,
      legacyDefinition,
      previousDefinition,
      now,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
    );
    const advanced = advanceExpedition(
      validated,
      previousV3Definition,
      now ?? validated.lastSimulatedAt,
    );
    return validateExpeditionSave(
      { ...advanced, contentVersion: definition.contentVersion },
      definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
    );
  }
  if (
    hasSchemaVersion(parsed, 4) &&
    parsed.contentVersion === '4.0.0' &&
    parsed.contentVersion !== definition.contentVersion
  ) {
    if (previousV4Definition === undefined || previousV4Definition.contentVersion !== '4.0.0')
      throw new SaveValidationError(
        'UNSUPPORTED_VERSION',
        '缺少冻结的 v4 规则，旧存档保持不变，不能按新规则补算。',
      );
    const old = validateExpeditionSave(
      upgradeSchemaFour(parsed),
      previousV4Definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
    );
    const advanced = advanceExpedition(old, previousV4Definition, now ?? old.lastSimulatedAt);
    return validateExpeditionSave(
      { ...advanced, contentVersion: definition.contentVersion },
      definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
    );
  }
  if (
    hasSchemaVersion(parsed, 4) &&
    parsed.contentVersion === '5.0.0' &&
    parsed.contentVersion !== definition.contentVersion
  ) {
    if (previousV5Definition === undefined || previousV5Definition.contentVersion !== '5.0.0')
      throw new SaveValidationError(
        'UNSUPPORTED_VERSION',
        '缺少冻结的 v5 规则，旧存档保持不变，不能按新规则补算。',
      );
    const old = validateExpeditionSave(
      upgradeSchemaFour(parsed),
      previousV5Definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
    );
    const advanced = advanceExpedition(old, previousV5Definition, now ?? old.lastSimulatedAt);
    return validateExpeditionSave(
      { ...advanced, contentVersion: definition.contentVersion },
      definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
    );
  }
  if (
    hasSchemaVersion(parsed, 4) &&
    parsed.contentVersion === '6.0.0' &&
    parsed.contentVersion !== definition.contentVersion
  ) {
    if (previousV6Definition === undefined || previousV6Definition.contentVersion !== '6.0.0')
      throw new SaveValidationError(
        'UNSUPPORTED_VERSION',
        '缺少冻结的 v6 规则，旧存档保持不变，不能按新规则补算。',
      );
    const old = validateExpeditionSave(
      upgradeSchemaFour(parsed),
      previousV6Definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
    );
    const advanced = advanceExpedition(old, previousV6Definition, now ?? old.lastSimulatedAt);
    return validateExpeditionSave(
      { ...advanced, contentVersion: definition.contentVersion },
      definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
    );
  }
  if (
    hasSchemaVersion(parsed, 5) &&
    parsed.contentVersion === '7.0.0' &&
    parsed.contentVersion !== definition.contentVersion
  ) {
    if (previousV7Definition === undefined || previousV7Definition.contentVersion !== '7.0.0')
      throw new SaveValidationError(
        'UNSUPPORTED_VERSION',
        '缺少冻结的 v7 规则，旧存档保持不变，不能按新规则补算。',
      );
    const old = validateExpeditionSave(
      upgradeSchemaSixFields(parsed),
      previousV7Definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
    );
    const advanced = advanceExpedition(old, previousV7Definition, now ?? old.lastSimulatedAt);
    return validateExpeditionSave(
      { ...advanced, contentVersion: definition.contentVersion },
      definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
    );
  }
  if (
    hasSchemaVersion(parsed, 6) &&
    parsed.contentVersion === '8.0.0' &&
    parsed.contentVersion !== definition.contentVersion
  ) {
    if (previousV8Definition === undefined || previousV8Definition.contentVersion !== '8.0.0')
      throw new SaveValidationError(
        'UNSUPPORTED_VERSION',
        '缺少冻结的 v8 规则，旧存档保持不变，不能按新规则补算。',
      );
    const old = validateExpeditionSave(
      upgradeSchemaSixFields(parsed),
      previousV8Definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
      previousV8Definition,
    );
    const advanced = advanceExpedition(old, previousV8Definition, now ?? old.lastSimulatedAt);
    return validateExpeditionSave(
      { ...advanced, contentVersion: definition.contentVersion },
      definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
      previousV8Definition,
    );
  }
  if (
    hasSchemaVersion(parsed, 6) &&
    parsed.contentVersion === '9.0.0' &&
    parsed.contentVersion !== definition.contentVersion
  ) {
    if (previousV9Definition === undefined || previousV9Definition.contentVersion !== '9.0.0')
      throw new SaveValidationError(
        'UNSUPPORTED_VERSION',
        '缺少冻结的 v9 规则，旧存档保持不变，不能按新规则补算。',
      );
    const old = validateExpeditionSave(
      upgradeSchemaSixFields(parsed),
      previousV9Definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
      previousV8Definition,
      previousV9Definition,
    );
    const advanced = advanceExpedition(old, previousV9Definition, now ?? old.lastSimulatedAt);
    return validateExpeditionSave(
      { ...advanced, contentVersion: definition.contentVersion },
      definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
      previousV8Definition,
      previousV9Definition,
    );
  }
  if (
    hasSchemaVersion(parsed, 6) &&
    parsed.contentVersion === '10.0.0' &&
    parsed.contentVersion !== definition.contentVersion
  ) {
    if (previousV10Definition === undefined || previousV10Definition.contentVersion !== '10.0.0')
      throw new SaveValidationError(
        'UNSUPPORTED_VERSION',
        '缺少冻结的 v10 规则，旧存档保持不变，不能按新规则补算。',
      );
    const old = validateExpeditionSave(
      upgradeSchemaSixFields(parsed),
      previousV10Definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
      previousV8Definition,
      previousV9Definition,
    );
    const advanced = advanceExpedition(old, previousV10Definition, now ?? old.lastSimulatedAt);
    return validateExpeditionSave(
      { ...advanced, contentVersion: definition.contentVersion },
      definition,
      legacyDefinition,
      previousDefinition,
      undefined,
      previousV3Definition,
      previousV4Definition,
      previousV5Definition,
      previousV6Definition,
      previousV7Definition,
      previousV8Definition,
      previousV9Definition,
    );
  }
  if (
    hasSchemaVersion(parsed, 6) &&
    parsed.contentVersion === '11.0.0' &&
    parsed.contentVersion !== definition.contentVersion
  ) {
    if (previousV11Definition?.contentVersion !== '11.0.0')
      throw new SaveValidationError(
        'UNSUPPORTED_VERSION',
        '缺少冻结的 v11 规则，旧存档保持不变，不能按新规则补算。',
      );
    const old = validateExpeditionSave(
      upgradeSchemaSixFields(parsed),
      previousV11Definition,
      legacyDefinition,
      previousDefinition,
      undefined,
    );
    const advanced = advanceExpedition(old, previousV11Definition, now ?? old.lastSimulatedAt);
    return validateExpeditionSave(
      {
        ...advanced,
        schemaVersion: 7,
        contentVersion: definition.contentVersion,
        profile: { ...advanced.profile, selectedDifficultyModifierIds: {} },
        activeRun:
          advanced.activeRun === null
            ? null
            : {
                ...advanced.activeRun,
                difficultyModifierIds: [],
                randomEventId: null,
                randomEventsEnabled: false,
                workerTransition: null,
              },
      },
      definition,
      legacyDefinition,
      previousDefinition,
    );
  }
  if (
    parsed.schemaVersion !== expectedSchema ||
    parsed.contentVersion !== definition.contentVersion
  )
    throw new SaveValidationError(
      'UNSUPPORTED_VERSION',
      '不支持此存档格式或内容版本，原存档未被覆盖。',
    );
  const selectedProfile = profile(parsed.profile, definition);
  const lastSimulatedAt = number(parsed.lastSimulatedAt, 'lastSimulatedAt');
  const run =
    parsed.activeRun === null
      ? null
      : activeRun(parsed.activeRun, selectedProfile, definition, lastSimulatedAt);
  if (run === null && selectedProfile.nextRunSequence !== selectedProfile.settledThrough + 1)
    invalid('主空间副本序号不一致。');
  const lastSettlement =
    parsed.lastSettlement === null
      ? null
      : settlement(parsed.lastSettlement, selectedProfile, definition);
  if ((selectedProfile.settledThrough === 0) !== (lastSettlement === null))
    invalid('永久结算进度缺少对应结算凭据。');
  const legacyArchive =
    parsed.legacyArchive === null
      ? null
      : validateSaveState(parsed.legacyArchive, legacyDefinition);
  if (legacyArchive !== null && lastSimulatedAt < legacyArchive.lastSimulatedAt)
    invalid('新版结算时间不能早于归档旧进度。');
  const outpost =
    definition.outpost === undefined ? null : outpostState(parsed.outpost, definition);
  return {
    schemaVersion: expectedSchema,
    contentVersion: definition.contentVersion,
    profile: selectedProfile,
    activeRun: run,
    lastSettlement,
    legacyArchive,
    outpost,
    lastSimulatedAt,
  };
}

export function encodeExpeditionSave(state: SaveBundle): string {
  return JSON.stringify(state, null, 2);
}
