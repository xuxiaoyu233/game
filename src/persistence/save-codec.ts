import type { GameDefinition, GameState } from '../domain/types';

export type SaveErrorCode = 'INVALID_JSON' | 'INVALID_STATE' | 'UNSUPPORTED_VERSION';

export class SaveValidationError extends Error {
  constructor(
    readonly code: SaveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SaveValidationError';
  }
}

function invalid(message: string): never {
  throw new SaveValidationError('INVALID_STATE', `存档校验失败：${message}`);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    invalid(`${field} 必须是对象。`);
  }
  return value as Record<string, unknown>;
}

function nonnegativeNumber(value: unknown, field: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > Number.MAX_SAFE_INTEGER
  ) {
    invalid(`${field} 必须是安全范围内的有限非负数。`);
  }
  return value;
}

function idList(value: unknown, known: ReadonlySet<string>, field: string): string[] {
  if (!Array.isArray(value)) invalid(`${field} 必须是列表。`);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== 'string' || !known.has(id)) invalid(`${field} 含未知 ID。`);
    if (seen.has(id)) invalid(`${field} 含重复 ID：${id}。`);
    seen.add(id);
    result.push(id);
  }
  return result;
}

/** No implicit migrations: a different content version must never earn historical production under new rules. */
export function decodeSave(contents: string, definition: GameDefinition): GameState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents) as unknown;
  } catch {
    throw new SaveValidationError('INVALID_JSON', '存档不是有效 JSON，原存档未被覆盖。');
  }
  return validateSaveState(parsed, definition);
}

export function validateSaveState(value: unknown, definition: GameDefinition): GameState {
  const state = record(value, '存档');
  if (state.schemaVersion !== 1) {
    throw new SaveValidationError('UNSUPPORTED_VERSION', '不支持此存档格式版本，原存档未被覆盖。');
  }
  if (state.contentVersion !== definition.contentVersion || state.worldId !== definition.worldId) {
    throw new SaveValidationError(
      'UNSUPPORTED_VERSION',
      '存档内容版本或世界与当前游戏不兼容，尚未提供迁移。',
    );
  }
  const balance = nonnegativeNumber(state.balance, 'balance');
  const totalGathered = nonnegativeNumber(state.totalGathered, 'totalGathered');
  const lastSimulatedAt = nonnegativeNumber(state.lastSimulatedAt, 'lastSimulatedAt');
  const toolIds = new Set(definition.tools.map((tool) => tool.id));
  const toolCountsValue = record(state.toolCounts, 'toolCounts');
  if (Object.keys(toolCountsValue).length !== toolIds.size)
    invalid('toolCounts 必须完整记录当前世界的工具。');
  const toolCounts: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const [id, value] of Object.entries(toolCountsValue)) {
    if (!toolIds.has(id)) invalid(`未知工具 ID：${id}。`);
    const count = nonnegativeNumber(value, `toolCounts.${id}`);
    if (!Number.isSafeInteger(count)) invalid(`工具数量必须是安全整数：${id}。`);
    toolCounts[id] = count;
  }
  const purchasedUpgradeIds = idList(
    state.purchasedUpgradeIds,
    new Set(definition.upgrades.map((upgrade) => upgrade.id)),
    'purchasedUpgradeIds',
  );
  const claimedTaskIds = idList(
    state.claimedTaskIds,
    new Set(definition.tasks.map((task) => task.id)),
    'claimedTaskIds',
  );
  const purchased = new Set(purchasedUpgradeIds);
  const claimed = new Set(claimedTaskIds);
  const eventChoicesValue = record(state.eventChoices, 'eventChoices');
  const eventChoices: Record<string, string> = Object.create(null) as Record<string, string>;
  let grantedMaterials = 0;
  for (const task of definition.tasks) {
    if (!claimed.has(task.id)) continue;
    if (task.previousTaskId !== undefined && !claimed.has(task.previousTaskId))
      invalid(`任务 ${task.id} 缺少前置领取记录。`);
    if (
      totalGathered < task.totalGathered ||
      (toolCounts[task.requiredTool.toolId] ?? 0) < task.requiredTool.count
    ) {
      invalid(`任务 ${task.id} 的领取记录与进度不一致。`);
    }
    grantedMaterials += task.reward;
  }
  for (const tool of definition.tools) {
    if (
      (toolCounts[tool.id] ?? 0) > 0 &&
      tool.unlockedByTaskId !== undefined &&
      !claimed.has(tool.unlockedByTaskId)
    ) {
      invalid(`工具 ${tool.id} 尚未解锁。`);
    }
  }
  for (const upgrade of definition.upgrades) {
    if (!purchased.has(upgrade.id)) continue;
    if (upgrade.unlockedByTaskId !== undefined && !claimed.has(upgrade.unlockedByTaskId))
      invalid(`升级 ${upgrade.id} 尚未解锁。`);
    if (
      upgrade.requiredTool !== undefined &&
      (toolCounts[upgrade.requiredTool.toolId] ?? 0) < upgrade.requiredTool.count
    ) {
      invalid(`升级 ${upgrade.id} 缺少所需工具。`);
    }
  }
  for (const [eventId, optionId] of Object.entries(eventChoicesValue)) {
    const event = definition.events.find((candidate) => candidate.id === eventId);
    if (event === undefined || typeof optionId !== 'string') invalid(`未知事件记录：${eventId}。`);
    const option = event.options.find((candidate) => candidate.id === optionId);
    if (option === undefined) invalid(`事件 ${eventId} 含未知选项。`);
    if (!claimed.has(event.triggeredByTaskId)) invalid(`事件 ${eventId} 缺少触发任务。`);
    eventChoices[eventId] = optionId;
    if (option.effect.kind === 'resource-grant') grantedMaterials += option.effect.amount;
  }
  // Rewards may exceed gathered materials, but unexplained resources indicate a broken state.
  const earnedMaterials = totalGathered + grantedMaterials;
  if (balance > earnedMaterials + Math.max(1, earnedMaterials) * Number.EPSILON * 8)
    invalid('余额超过累计采集与已领取奖励之和。');
  return {
    schemaVersion: 1,
    contentVersion: definition.contentVersion,
    worldId: definition.worldId,
    balance,
    totalGathered,
    toolCounts,
    purchasedUpgradeIds,
    claimedTaskIds,
    eventChoices,
    lastSimulatedAt,
  };
}

export function encodeSave(state: GameState): string {
  return JSON.stringify(state, null, 2);
}
