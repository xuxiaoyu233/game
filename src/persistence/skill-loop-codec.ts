import type {
  ActiveBuff,
  ActivityDefinition,
  CurrentActivity,
  SkillLoopDefinition,
  SkillLoopReturnReport,
  SkillLoopState,
  ToolDefinition,
} from '../domain/skill-loop/types';
import {
  MASTERY_CHECKPOINT_SPEED_PERMILLE,
  getMasteryPoolLimit,
} from '../domain/skill-loop/mastery';

export type SkillSaveErrorCode = 'INVALID_JSON' | 'INVALID_STATE' | 'UNSUPPORTED_VERSION';

export class SkillSaveValidationError extends Error {
  constructor(
    readonly code: SkillSaveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SkillSaveValidationError';
  }
}

export type SkillLoopSaveMigration = (source: unknown, definition: SkillLoopDefinition) => unknown;

function invalid(message: string): never {
  throw new SkillSaveValidationError('INVALID_STATE', `技能原型存档校验失败：${message}`);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    invalid(`${field} 必须是对象。`);
  return value as Record<string, unknown>;
}

function safeInteger(value: unknown, field: string, minimum = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    invalid(`${field} 必须是安全范围内的整数。`);
  }
  return value;
}

function signedSafeInteger(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    invalid(`${field} 必须是安全范围内的整数。`);
  return value;
}

/**
 * Names the drift instead of only saying the key set mismatched. A save that cannot load is worth
 * diagnosing in one look: how many keys were expected, how many arrived, and which IDs differ.
 */
function describeDrift(
  source: Record<string, unknown>,
  expectedIds: ReadonlySet<string>,
  field: string,
): string {
  const actual = Object.keys(source);
  const missing = [...expectedIds].filter((id) => !Object.hasOwn(source, id));
  const unexpected = actual.filter((id) => !expectedIds.has(id));
  const list = (ids: readonly string[]): string =>
    ids.length > 5 ? `${ids.slice(0, 5).join('、')} 等 ${ids.length} 项` : ids.join('、');
  const parts = [`期望 ${expectedIds.size} 键，实际 ${actual.length} 键`];
  if (missing.length > 0) parts.push(`缺失：${list(missing)}`);
  if (unexpected.length > 0) parts.push(`多余：${list(unexpected)}`);
  return `${field} 未完整匹配当前内容（${parts.join('；')}）。`;
}

function exactRecord(
  value: unknown,
  expectedIds: ReadonlySet<string>,
  field: string,
): Record<string, number> {
  const source = record(value, field);
  if (Object.keys(source).length !== expectedIds.size)
    invalid(describeDrift(source, expectedIds, field));
  const result: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const [id, raw] of Object.entries(source)) {
    if (!expectedIds.has(id)) invalid(`${field} 含未知 ID：${id}。`);
    result[id] = safeInteger(raw, `${field}.${id}`);
  }
  for (const id of expectedIds) {
    if (!Object.hasOwn(result, id)) invalid(`${field} 缺少 ID：${id}。`);
  }
  return result;
}

function exactDeltaRecord(
  value: unknown,
  expectedIds: ReadonlySet<string>,
  field: string,
): Record<string, number> {
  const source = record(value, field);
  if (Object.keys(source).length !== expectedIds.size)
    invalid(describeDrift(source, expectedIds, field));
  const result: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const [id, raw] of Object.entries(source)) {
    if (!expectedIds.has(id)) invalid(`${field} 含未知 ID：${id}。`);
    result[id] = signedSafeInteger(raw, `${field}.${id}`);
  }
  for (const id of expectedIds) {
    if (!Object.hasOwn(result, id)) invalid(`${field} 缺少 ID：${id}。`);
  }
  return result;
}

function getActivity(definition: SkillLoopDefinition, id: string): ActivityDefinition | undefined {
  return definition.activities.find((candidate) => candidate.id === id);
}

function getTool(definition: SkillLoopDefinition, skillId: string): ToolDefinition | undefined {
  return definition.tools.find((candidate) => candidate.skillId === skillId);
}

function hasMaterials(
  inventory: Readonly<Record<string, number>>,
  inputs: readonly { readonly itemId: string; readonly amount: number }[],
): boolean {
  return inputs.every((input) => (inventory[input.itemId] ?? 0) >= input.amount);
}

function getSkillLevel(xp: number, definition: SkillLoopDefinition, skillId: string): number {
  const skill = definition.skills.find((candidate) => candidate.id === skillId);
  if (skill === undefined) return 0;
  return skill.levels.reduce(
    (level, threshold) => (xp >= threshold.xpRequired ? threshold.level : level),
    1,
  );
}

/**
 * Whether a captured cycle duration is reproducible from the current content. Exported so the
 * migration can tell "this cycle was captured under older numbers" apart from a corrupt value:
 * a numeric retune (never a schema change on its own) otherwise turns every running activity in
 * an old save into a save the codec refuses.
 */
export function validCycleDuration(
  durationMs: number,
  activity: ActivityDefinition,
  definition: SkillLoopDefinition,
): boolean {
  const tool = getTool(definition, activity.skillId);
  const buffMultipliers = new Set<number>([1_000]);
  for (const item of definition.items) {
    const speed = item.consumable?.speedMultiplierPermille;
    if (speed !== undefined) buffMultipliers.add(speed);
  }
  const toolMultipliers =
    tool === undefined ? [1_000] : tool.levels.map((level) => level.durationMultiplierPermille);
  // The global bonus depends on each skill's current level, so enumerate the reachable sums.
  let globalMultipliers = new Set<number>([1_000]);
  for (const skill of definition.skills) {
    const additions = new Set<number>([0]);
    for (const threshold of skill.levels) {
      const bonus = threshold.effect?.globalSpeedBonusPermille;
      if (bonus !== undefined) additions.add(bonus - 1_000);
    }
    const next = new Set<number>();
    for (const base of globalMultipliers) {
      for (const addition of additions) next.add(base + addition);
    }
    globalMultipliers = next;
  }
  // Schema 4 adds mastery checkpoint tiers for the owning skill; any tier can be in force.
  const masteryMultipliers = new Set<number>([1_000]);
  if (definition.schemaVersion === 4) {
    for (const multiplier of MASTERY_CHECKPOINT_SPEED_PERMILLE) masteryMultipliers.add(multiplier);
  }
  return [...toolMultipliers].some((toolMultiplier) =>
    [...buffMultipliers].some((buffMultiplier) =>
      [...globalMultipliers].some((globalMultiplier) =>
        [...masteryMultipliers].some(
          (masteryMultiplier) =>
            durationMs ===
            Math.ceil(
              (activity.durationMs *
                toolMultiplier *
                buffMultiplier *
                globalMultiplier *
                masteryMultiplier) /
                1_000_000_000_000,
            ),
        ),
      ),
    ),
  );
}

function validateCurrentActivity(
  value: unknown,
  stateParts: Pick<SkillLoopState, 'inventory' | 'skillXp' | 'toolLevels'>,
  definition: SkillLoopDefinition,
): CurrentActivity | null {
  if (value === null) return null;
  const source = record(value, 'currentActivity');
  if (typeof source.activityId !== 'string') invalid('currentActivity.activityId 必须是字符串。');
  const activity = getActivity(definition, source.activityId);
  if (activity === undefined) invalid(`currentActivity 含未知活动：${source.activityId}。`);
  if (
    getSkillLevel(stateParts.skillXp[activity.skillId] ?? 0, definition, activity.skillId) <
    activity.requiredLevel
  ) {
    invalid(`currentActivity 对应的活动尚未解锁：${activity.id}。`);
  }
  if (source.status !== 'running' && source.status !== 'paused' && source.status !== 'stopped')
    invalid('currentActivity.status 无效。');
  const progressMs = safeInteger(source.progressMs, 'currentActivity.progressMs');
  const cycleDurationMs = safeInteger(source.cycleDurationMs, 'currentActivity.cycleDurationMs', 1);
  if (progressMs >= cycleDurationMs || !validCycleDuration(cycleDurationMs, activity, definition))
    invalid('currentActivity 的周期进度或生效时长无效。');
  const stopReason = source.stopReason;
  if (stopReason !== null && stopReason !== 'insufficient-materials') {
    invalid('currentActivity.stopReason 无效。');
  }
  if (source.status === 'stopped' && stopReason === null) invalid('已停止活动必须记录原因。');
  if (source.status !== 'stopped' && stopReason !== null)
    invalid('运行或暂停的活动不能带停止原因。');
  if (source.status === 'stopped' && progressMs !== 0) invalid('已停止活动不能保留半周期进度。');
  if (activity.kind === 'craft') {
    const recipe = definition.recipes.find((candidate) => candidate.id === activity.recipeId);
    if (recipe === undefined) invalid(`currentActivity 对应的配方不存在：${activity.id}。`);
    const affordable = hasMaterials(stateParts.inventory, recipe.inputs);
    if (source.status === 'stopped' && affordable) {
      invalid('已停止的制作活动没有材料不足依据。');
    }
    if (source.status !== 'stopped' && !affordable) {
      invalid('运行或暂停中的制作活动缺少完整材料。');
    }
  } else if (source.status === 'stopped') {
    invalid('采集活动不能因材料不足而停止。');
  }
  return {
    activityId: activity.id,
    status: source.status,
    progressMs,
    cycleDurationMs,
    stopReason,
  };
}

function validateReturnReport(
  value: unknown,
  definition: SkillLoopDefinition,
): SkillLoopReturnReport | null {
  if (value === null) return null;
  const source = record(value, 'returnReport');
  const elapsedMs = safeInteger(source.elapsedMs, 'returnReport.elapsedMs', 1);
  const settlementWindowMs = safeInteger(
    source.settlementWindowMs,
    'returnReport.settlementWindowMs',
    1,
  );
  if (settlementWindowMs > elapsedMs) invalid('returnReport.settlementWindowMs 不能超过离开时长。');
  if (typeof source.offlineCapReached !== 'boolean')
    invalid('returnReport.offlineCapReached 必须是布尔值。');
  const activityId = source.activityId;
  if (
    activityId !== null &&
    (typeof activityId !== 'string' || getActivity(definition, activityId) === undefined)
  )
    invalid('returnReport.activityId 必须为空或当前已知活动 ID。');
  const reason = source.reason;
  if (
    reason !== 'continuing' &&
    reason !== 'insufficient-materials' &&
    reason !== 'paused' &&
    reason !== 'no-activity'
  ) {
    invalid('returnReport.reason 无效。');
  }
  const validActivities = new Set(definition.activities.map((activity) => activity.id));
  if (!Array.isArray(source.unlockedActivityIds))
    invalid('returnReport.unlockedActivityIds 必须是数组。');
  const unlockedActivityIds = source.unlockedActivityIds.map((id, index) => {
    if (typeof id !== 'string' || !validActivities.has(id))
      invalid(`returnReport.unlockedActivityIds[${index}] 含未知活动 ID。`);
    return id;
  });
  if (new Set(unlockedActivityIds).size !== unlockedActivityIds.length)
    invalid('returnReport.unlockedActivityIds 不能重复。');
  return {
    elapsedMs,
    settlementWindowMs,
    offlineCapReached: source.offlineCapReached,
    activityId,
    reason,
    inventoryDelta: exactDeltaRecord(
      source.inventoryDelta,
      new Set(definition.items.map((item) => item.id)),
      'returnReport.inventoryDelta',
    ),
    skillXpDelta: exactDeltaRecord(
      source.skillXpDelta,
      new Set(definition.skills.map((skill) => skill.id)),
      'returnReport.skillXpDelta',
    ),
    unlockedActivityIds,
  };
}

function validateBuffs(value: unknown, definition: SkillLoopDefinition): ActiveBuff[] {
  if (!Array.isArray(value)) invalid('buffs 必须是数组。');
  if (value.length > 1) invalid('同时只能有一个消耗品增益生效。');
  return value.map((entry, index) => {
    const source = record(entry, `buffs[${index}]`);
    if (typeof source.sourceItemId !== 'string')
      invalid(`buffs[${index}].sourceItemId 必须是字符串。`);
    const item = definition.items.find((candidate) => candidate.id === source.sourceItemId);
    if (item?.consumable === undefined)
      invalid(`buffs[${index}] 引用了不可食用的物品：${String(source.sourceItemId)}。`);
    const effect = item.consumable;
    if (source.speedMultiplierPermille !== effect.speedMultiplierPermille)
      invalid(`buffs[${index}] 的加速倍率与物品定义不一致。`);
    if (source.xpMultiplierPermille !== effect.xpMultiplierPermille)
      invalid(`buffs[${index}] 的经验倍率与物品定义不一致。`);
    const remainingMs = safeInteger(source.remainingMs, `buffs[${index}].remainingMs`, 1);
    return {
      sourceItemId: item.id,
      ...(effect.speedMultiplierPermille !== undefined
        ? { speedMultiplierPermille: effect.speedMultiplierPermille }
        : {}),
      ...(effect.xpMultiplierPermille !== undefined
        ? { xpMultiplierPermille: effect.xpMultiplierPermille }
        : {}),
      remainingMs,
    };
  });
}

/** Which record keys were zero-filled when a same-version save was topped up. */
export interface SaveRepairReport {
  readonly addedIds: readonly string[];
}

/**
 * A version label is a manual fact, not proof that a save's records match the current content:
 * editing IDs without bumping the version (or an interrupted write) leaves records that only miss
 * keys. Missing keys are safe to zero-fill, exactly like `extendSameSchema` does across versions.
 * Unexpected keys are deliberately NOT repaired here: they mean content lost or renamed IDs, so the
 * caller must refuse and report them rather than drop data silently.
 */
export function repairSameVersionRecords(
  source: unknown,
  definition: SkillLoopDefinition,
): { readonly candidate: unknown; readonly report: SaveRepairReport } | null {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) return null;
  const raw = source as Record<string, unknown>;
  const zeroRecord = (ids: readonly string[]): Record<string, number> =>
    Object.fromEntries(ids.map((id) => [id, 0]));
  const targets: readonly {
    readonly field: string;
    readonly value: unknown;
    readonly defaults: Record<string, number>;
  }[] = [
    { field: 'inventory', value: raw['inventory'], defaults: { ...definition.initialInventory } },
    { field: 'skillXp', value: raw['skillXp'], defaults: { ...definition.initialSkillXp } },
    {
      field: 'toolLevels',
      value: raw['toolLevels'],
      defaults: { ...definition.initialToolLevels },
    },
    ...(definition.schemaVersion === 4
      ? [
          {
            field: 'masteryXp',
            value: raw['masteryXp'],
            defaults: zeroRecord(definition.activities.map((activity) => activity.id)),
          },
          {
            field: 'masteryPool',
            value: raw['masteryPool'],
            defaults: zeroRecord(definition.skills.map((skill) => skill.id)),
          },
        ]
      : []),
  ];
  const candidate: Record<string, unknown> = { ...raw };
  const addedIds: string[] = [];
  for (const target of targets) {
    const value = target.value;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const known = value as Record<string, number>;
    const expected = Object.keys(target.defaults);
    if (Object.keys(known).some((id) => !expected.includes(id))) return null;
    const missing = expected.filter((id) => !Object.hasOwn(known, id));
    if (missing.length > 0) {
      addedIds.push(...missing);
      candidate[target.field] = { ...target.defaults, ...known };
    }
  }
  if (addedIds.length === 0) return null;
  return { candidate, report: { addedIds } };
}

export function decodeSkillLoopSave(
  contents: string,
  definition: SkillLoopDefinition,
  migrateSave?: SkillLoopSaveMigration,
): SkillLoopState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch {
    throw new SkillSaveValidationError('INVALID_JSON', '存档不是有效 JSON，原存档未被覆盖。');
  }
  const source = record(parsed, '存档');
  if (
    source.schemaVersion !== definition.schemaVersion ||
    source.contentVersion !== definition.contentVersion
  ) {
    return validateSkillLoopSave(
      migrateSave === undefined ? parsed : migrateSave(parsed, definition),
      definition,
    );
  }
  const repaired = repairSameVersionRecords(parsed, definition);
  if (repaired !== null) {
    console.warn(
      `存档与当前内容的键集不一致，已零值补齐：${repaired.report.addedIds.join('、')}。`,
    );
    return validateSkillLoopSave(repaired.candidate, definition);
  }
  return validateSkillLoopSave(parsed, definition);
}

export function validateSkillLoopSave(
  value: unknown,
  definition: SkillLoopDefinition,
): SkillLoopState {
  const source = record(value, '存档');
  if (
    source.schemaVersion !== definition.schemaVersion ||
    source.profileId !== definition.profileId
  ) {
    throw new SkillSaveValidationError(
      'UNSUPPORTED_VERSION',
      '存档 profile 或格式版本不兼容，原存档未被覆盖。',
    );
  }
  if (source.contentVersion !== definition.contentVersion) {
    throw new SkillSaveValidationError(
      'UNSUPPORTED_VERSION',
      '存档机械内容版本不兼容；目前没有静默迁移。',
    );
  }
  const inventory = exactRecord(
    source.inventory,
    new Set(definition.items.map((item) => item.id)),
    'inventory',
  );
  const skillXp = exactRecord(
    source.skillXp,
    new Set(definition.skills.map((skill) => skill.id)),
    'skillXp',
  );
  const toolLevels = exactRecord(
    source.toolLevels,
    new Set(definition.tools.map((tool) => tool.id)),
    'toolLevels',
  );
  for (const skill of definition.skills) {
    const xp = skillXp[skill.id] ?? 0;
    const xpCeiling = skill.levels.at(-1)?.xpRequired ?? 0;
    if (xp > xpCeiling) invalid(`技能经验超过当前原型上限：${skill.id}。`);
  }
  for (const tool of definition.tools) {
    const level = toolLevels[tool.id] ?? 0;
    if (level < 1 || level > tool.levels.length) invalid(`工具等级无效：${tool.id}。`);
  }
  // Mastery state exists on schema 4 only, and old saves carrying it are refused outright: an
  // unexplained field means the record was written by something this codec cannot interpret.
  let mastery:
    | { readonly masteryXp: Record<string, number>; readonly masteryPool: Record<string, number> }
    | undefined;
  if (definition.schemaVersion === 4) {
    if (!Object.hasOwn(source, 'masteryXp')) invalid('masteryXp 字段缺失。');
    if (!Object.hasOwn(source, 'masteryPool')) invalid('masteryPool 字段缺失。');
    const masteryXp = exactRecord(
      source.masteryXp,
      new Set(definition.activities.map((activity) => activity.id)),
      'masteryXp',
    );
    const masteryPool = exactRecord(
      source.masteryPool,
      new Set(definition.skills.map((skill) => skill.id)),
      'masteryPool',
    );
    for (const activity of definition.activities) {
      const skill = definition.skills.find((candidate) => candidate.id === activity.skillId);
      const ceiling = skill?.levels.at(-1)?.xpRequired ?? 0;
      if ((masteryXp[activity.id] ?? 0) > ceiling)
        invalid(`masteryXp 超过所属技能的经验上限：${activity.id}。`);
    }
    for (const skill of definition.skills) {
      const activityCount = definition.activities.filter(
        (activity) => activity.skillId === skill.id,
      ).length;
      if ((masteryPool[skill.id] ?? 0) > getMasteryPoolLimit(activityCount))
        invalid(`masteryPool 超过该技能的池上限：${skill.id}。`);
    }
    mastery = { masteryXp, masteryPool };
  } else if (source.masteryXp !== undefined && source.masteryXp !== null) {
    invalid('旧 schema 不支持 masteryXp。');
  } else if (source.masteryPool !== undefined && source.masteryPool !== null) {
    invalid('旧 schema 不支持 masteryPool。');
  }
  const lastSimulatedAt = safeInteger(source.lastSimulatedAt, 'lastSimulatedAt');
  const stateParts = { inventory, skillXp, toolLevels };
  const currentActivity = validateCurrentActivity(source.currentActivity, stateParts, definition);
  let returnReport: SkillLoopReturnReport | null = null;
  if (definition.schemaVersion >= 2) {
    if (!Object.hasOwn(source, 'returnReport')) invalid('returnReport 字段缺失。');
    returnReport = validateReturnReport(source.returnReport, definition);
  } else if (source.returnReport !== undefined && source.returnReport !== null) {
    invalid('旧 schema 不支持 returnReport。');
  }
  let buffs: ActiveBuff[] | undefined;
  if (definition.schemaVersion >= 3) {
    if (!Object.hasOwn(source, 'buffs')) invalid('buffs 字段缺失。');
    buffs = validateBuffs(source.buffs, definition);
  } else if (source.buffs !== undefined && source.buffs !== null) {
    invalid('旧 schema 不支持 buffs。');
  }
  return {
    schemaVersion: definition.schemaVersion,
    profileId: definition.profileId,
    contentVersion: definition.contentVersion,
    ...stateParts,
    currentActivity,
    lastSimulatedAt,
    returnReport,
    ...(buffs !== undefined ? { buffs } : {}),
    ...(mastery !== undefined ? mastery : {}),
  };
}

export function encodeSkillLoopSave(state: SkillLoopState): string {
  return JSON.stringify(state, null, 2);
}
