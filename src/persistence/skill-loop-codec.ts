import type {
  ActivityDefinition,
  CurrentActivity,
  SkillLoopDefinition,
  SkillLoopReturnReport,
  SkillLoopState,
  ToolDefinition,
} from '../domain/skill-loop/types';

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

function exactRecord(
  value: unknown,
  expectedIds: ReadonlySet<string>,
  field: string,
): Record<string, number> {
  const source = record(value, field);
  if (Object.keys(source).length !== expectedIds.size) invalid(`${field} 未完整匹配当前内容。`);
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
  if (Object.keys(source).length !== expectedIds.size) invalid(`${field} 未完整匹配当前内容。`);
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

function validCycleDuration(
  durationMs: number,
  activity: ActivityDefinition,
  definition: SkillLoopDefinition,
): boolean {
  const tool = getTool(definition, activity.skillId);
  if (tool === undefined) return durationMs === activity.durationMs;
  return tool.levels.some(
    (level) =>
      durationMs === Math.ceil((activity.durationMs * level.durationMultiplierPermille) / 1_000),
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
  const candidate =
    (source.schemaVersion === definition.schemaVersion &&
      source.contentVersion === definition.contentVersion) ||
    migrateSave === undefined
      ? parsed
      : migrateSave(parsed, definition);
  return validateSkillLoopSave(candidate, definition);
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
  const lastSimulatedAt = safeInteger(source.lastSimulatedAt, 'lastSimulatedAt');
  const stateParts = { inventory, skillXp, toolLevels };
  const currentActivity = validateCurrentActivity(source.currentActivity, stateParts, definition);
  let returnReport: SkillLoopReturnReport | null = null;
  if (definition.schemaVersion === 2) {
    if (!Object.hasOwn(source, 'returnReport')) invalid('returnReport 字段缺失。');
    returnReport = validateReturnReport(source.returnReport, definition);
  } else if (source.returnReport !== undefined && source.returnReport !== null) {
    invalid('旧 schema 不支持 returnReport。');
  }
  return {
    schemaVersion: definition.schemaVersion,
    profileId: definition.profileId,
    contentVersion: definition.contentVersion,
    ...stateParts,
    currentActivity,
    lastSimulatedAt,
    returnReport,
  };
}

export function encodeSkillLoopSave(state: SkillLoopState): string {
  return JSON.stringify(state, null, 2);
}
