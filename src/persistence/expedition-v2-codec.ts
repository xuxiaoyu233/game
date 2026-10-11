import { getRunMaxHp } from '../domain/expedition/engine';
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
  WorldDefinition,
} from '../domain/expedition/v2-types';
import type { GameDefinition } from '../domain/types';
import { SaveValidationError, validateSaveState } from './save-codec';

function invalid(message: string): never {
  throw new SaveValidationError('INVALID_STATE', `存档校验失败：${message}`);
}
function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid(`${field} 必须是对象。`);
  return value as Record<string, unknown>;
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

function profile(value: unknown, definition: ExpeditionDefinition): Profile {
  const parsed = record(value, 'profile');
  const points = integer(parsed.points, 'profile.points');
  const totalPoints = integer(parsed.totalPoints, 'profile.totalPoints');
  const perkIds = uniqueIds(
    parsed.perkIds,
    definition.perks.map((perk) => perk.id),
    'profile.perkIds',
  );
  const clearedWorldIds = uniqueIds(
    parsed.clearedWorldIds,
    definition.worlds.map((candidate) => candidate.id),
    'profile.clearedWorldIds',
  );
  const nextRunSequence = integer(parsed.nextRunSequence, 'profile.nextRunSequence');
  const settledThrough = integer(parsed.settledThrough, 'profile.settledThrough');
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
    } else if (clue.worldId === null || !clearedWorldIds.includes(clue.worldId))
      invalid('永久副本线索缺少对应成功回归记录。');
  }
  const spent = definition.perks.reduce(
    (sum, perk) => sum + (perkIds.includes(perk.id) ? perk.cost : 0),
    0,
  );
  if (!Number.isSafeInteger(points + spent) || points + spent !== totalPoints)
    invalid('永久积分余额与累计所得、已兑换奖励不一致。');
  if (nextRunSequence < 1) invalid('下一次副本序号必须为正整数。');
  if (settledThrough === 0 && (totalPoints !== 0 || clearedWorldIds.length !== 0))
    invalid('尚无结算记录时不能拥有永久积分或通关记录。');
  const maximumAward = Object.values(definition.rewards).reduce((sum, reward) => sum + reward, 0);
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
    clearedWorldIds,
    nextRunSequence,
    settledThrough,
    discoveredClueIds,
    dialogueChoices,
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
  const damage = integer(parsed.damage, 'lastBattle.damage');
  const hpAfter = number(parsed.hpAfter, 'lastBattle.hpAfter');
  const survived = boolean(parsed.survived, 'lastBattle.survived');
  if (wave < 1 || wave > 3) invalid('战报波次越界。');
  const waveStrengths = selectedWorld.waveStrengths;
  if (waveStrengths === undefined) invalid('旧版战报不能引用环境模式世界。');
  const expectedStrength =
    (waveStrengths[wave - 1] ?? 0) *
    (wave === 3 && run.boostedFinal ? definition.finalWaveMultiplier : 1);
  const currentDefense =
    definition.baseDefense +
    selectedWorld.buildings.reduce(
      (sum, building) => sum + building.defense * run.buildings[building.id],
      0,
    ) +
    (run.beaconChoice === 'restore' ? definition.beaconDefense : 0);
  if (
    !equals(strength, expectedStrength) ||
    defense < definition.baseDefense ||
    defense > currentDefense ||
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
  return { wave, strength, defense, damage, hpAfter, survived };
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
  const sequence = integer(parsed.sequence, 'activeRun.sequence');
  if (
    sequence !== selectedProfile.settledThrough + 1 ||
    selectedProfile.nextRunSequence !== sequence + 1
  )
    invalid('活跃副本序号与永久结算序号不一致。');
  const phase = oneOf(
    parsed.phase,
    ['preparing', 'awaiting-wave', 'completed', 'failed'] as const,
    'activeRun.phase',
  );
  const runResources = resources(parsed.resources, 'activeRun.resources');
  if (
    runResources.wood > selectedWorld.resourceCaps.wood ||
    runResources.stone > selectedWorld.resourceCaps.stone
  )
    invalid('副本资源超过仓储上限。');
  const buildingsValue = record(parsed.buildings, 'activeRun.buildings');
  if (Object.keys(buildingsValue).length !== selectedWorld.buildings.length)
    invalid('建筑记录必须完整且不能包含未知 ID。');
  const buildings = Object.create(null) as Record<BuildingId, number>;
  const clearedWaves = integer(parsed.clearedWaves, 'activeRun.clearedWaves');
  if (clearedWaves > 3) invalid('已通过怪潮数量越界。');
  for (const [id, countValue] of Object.entries(buildingsValue)) {
    const building = selectedWorld.buildings.find((candidate) => candidate.id === id);
    if (building === undefined) invalid('未知建筑 ID。');
    const count = integer(countValue, `buildings.${id}`);
    if (count > building.maxCount || (count > 0 && clearedWaves < building.unlockAfterWave))
      invalid('建筑数量或解锁关系无效。');
    buildings[building.id] = count;
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
  const preparationMs = selectedWorld.preparationMs;
  if (preparationMs === undefined) invalid('旧版副本不能引用环境模式世界。');
  const stageDuration = preparationMs[clearedWaves];
  if (phase === 'completed' && clearedWaves !== 3) invalid('完成状态必须通过三轮怪潮。');
  if (phase !== 'completed' && clearedWaves === 3) invalid('三轮怪潮完成后的阶段无效。');
  if (phase === 'completed' || phase === 'failed') {
    if (elapsedInStageMs !== 0) invalid('结束状态不能保留准备阶段计时。');
  } else if (
    stageDuration === undefined ||
    (phase === 'awaiting-wave'
      ? elapsedInStageMs !== stageDuration
      : elapsedInStageMs >= stageDuration)
  )
    invalid('准备计时与待处理怪潮阶段不一致。');
  const beaconChoice =
    parsed.beaconChoice === null
      ? null
      : oneOf(parsed.beaconChoice, ['salvage', 'restore'] as const, 'activeRun.beaconChoice');
  const boostedFinal = boolean(parsed.boostedFinal, 'activeRun.boostedFinal');
  const repairUsed = boolean(parsed.repairUsed, 'activeRun.repairUsed');
  if (beaconChoice !== null && clearedWaves < 1) invalid('信标事件尚未触发。');
  if (boostedFinal && clearedWaves < 2) invalid('最后一轮强化尚未解锁。');
  if (repairUsed && !selectedProfile.perkIds.includes('field-repair'))
    invalid('没有永久修复奖励，不能拥有修复记录。');
  const recoveredClueIds = uniqueIds(
    parsed.recoveredClueIds,
    definition.story.clues.map((clue) => clue.id),
    'activeRun.recoveredClueIds',
  );
  for (const id of recoveredClueIds) {
    const clue = definition.story.clues.find((candidate) => candidate.id === id);
    if (
      clue === undefined ||
      clue.source !== 'investigate' ||
      clue.worldId !== selectedWorld.id ||
      selectedProfile.discoveredClueIds.includes(id) ||
      clearedWaves < clue.minClearedWaves ||
      (clue.requiresBuilding !== null && buildings[clue.requiresBuilding] === 0) ||
      (clue.requiresBeacon !== null && beaconChoice !== clue.requiresBeacon)
    )
      invalid('本局回收线索来源、条件或永久记录不一致。');
  }
  const run = {
    sequence,
    worldId: selectedWorld.id,
    phase,
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
    recoveredClueIds,
  };
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
  if (
    (selectedWorld.unlockAfterWorld !== null &&
      !selectedProfile.clearedWorldIds.includes(selectedWorld.unlockAfterWorld)) ||
    (selectedWorld.unlockAfterDialogueId !== null &&
      !Object.hasOwn(selectedProfile.dialogueChoices, selectedWorld.unlockAfterDialogueId))
  )
    invalid('结算记录的副本缺少解锁条件。');
  const outcome = oneOf(
    parsed.outcome,
    ['success', 'failed', 'abandoned'] as const,
    'lastSettlement.outcome',
  );
  const clearedWaves = integer(parsed.clearedWaves, 'lastSettlement.clearedWaves');
  const points = integer(parsed.points, 'lastSettlement.points');
  if (
    clearedWaves > 3 ||
    (outcome === 'success' && clearedWaves < 2) ||
    (outcome === 'failed' && clearedWaves === 3)
  )
    invalid('结算结果与怪潮进度不一致。');
  if (!Array.isArray(parsed.rewards)) invalid('结算奖励必须是列表。');
  const rewards: RewardLine[] = [];
  const amounts = {
    base: definition.rewards.base,
    monument: definition.rewards.monument,
    beacon: definition.rewards.beacon,
    'final-wave': definition.rewards.finalWave,
    'boosted-final': definition.rewards.boostedFinal,
  };
  for (const line of parsed.rewards) {
    const reward = record(line, 'reward');
    const id = oneOf(
      reward.id,
      ['base', 'monument', 'beacon', 'final-wave', 'boosted-final'] as const,
      'reward.id',
    );
    const amount = integer(reward.points, 'reward.points');
    if (rewards.some((existing) => existing.id === id) || amount !== amounts[id])
      invalid('奖励 ID 重复或积分与规则不符。');
    rewards.push({ id, points: amount });
  }
  if (
    points !== rewards.reduce((sum, reward) => sum + reward.points, 0) ||
    points > selectedProfile.totalPoints
  )
    invalid('结算积分明细与总额不一致。');
  const has = (id: RewardLine['id']) => rewards.some((reward) => reward.id === id);
  if (outcome === 'success') {
    if (
      !has('base') ||
      has('final-wave') !== (clearedWaves === 3) ||
      (has('boosted-final') && !has('final-wave')) ||
      !selectedProfile.clearedWorldIds.includes(selectedWorld.id)
    )
      invalid('成功结算奖励或通关记录不一致。');
  } else if (points !== 0 || rewards.length !== 0) invalid('死亡或放弃不能获得本次永久积分。');
  return { sequence, worldId: selectedWorld.id, outcome, clearedWaves, rewards, points };
}

export function decodeVersion2Save(
  contents: string,
  definition: ExpeditionDefinition,
  legacyDefinition: GameDefinition,
): SaveBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch {
    throw new SaveValidationError('INVALID_JSON', '存档不是有效 JSON，原存档未被覆盖。');
  }
  return validateVersion2Save(parsed, definition, legacyDefinition);
}

export function validateVersion2Save(
  value: unknown,
  definition: ExpeditionDefinition,
  legacyDefinition: GameDefinition,
): SaveBundle {
  const parsed = record(value, '存档');
  if (parsed.schemaVersion === 1) {
    const legacyArchive = validateSaveState(parsed, legacyDefinition);
    return {
      schemaVersion: 2,
      contentVersion: definition.contentVersion,
      profile: {
        points: 0,
        totalPoints: 0,
        perkIds: [],
        clearedWorldIds: [],
        nextRunSequence: 1,
        settledThrough: 0,
        discoveredClueIds: [],
        dialogueChoices: {},
      },
      activeRun: null,
      lastSettlement: null,
      legacyArchive,
      outpost: null,
      lastSimulatedAt: legacyArchive.lastSimulatedAt,
    };
  }
  if (parsed.schemaVersion !== 2 || parsed.contentVersion !== definition.contentVersion)
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
  return {
    schemaVersion: 2,
    contentVersion: definition.contentVersion,
    profile: selectedProfile,
    activeRun: run,
    lastSettlement,
    legacyArchive,
    outpost: null,
    lastSimulatedAt,
  };
}

export function encodeVersion2Save(state: SaveBundle): string {
  return JSON.stringify(state, null, 2);
}
