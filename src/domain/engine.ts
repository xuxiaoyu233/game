import type {
  ActionResult,
  GameCommand,
  GameDefinition,
  GameErrorCode,
  GameState,
  GameSummary,
  TaskDefinition,
  TimeAdvanceResult,
  ToolDefinition,
  UpgradeDefinition,
} from './types';
import { validateGameDefinition } from './validation';

const NUMERIC_MAXIMUM = Number.MAX_SAFE_INTEGER;

function isSafeAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= NUMERIC_MAXIMUM;
}

function canAddAmount(value: number, amount: number): boolean {
  const sum = value + amount;
  return isSafeAmount(amount) && isSafeAmount(sum) && (amount === 0 || sum > value);
}

function displayAmount(value: number): number {
  return isSafeAmount(value) ? value : NUMERIC_MAXIMUM;
}

function validateTime(now: number): void {
  if (!Number.isFinite(now) || now < 0)
    throw new RangeError('Game time must be finite and nonnegative');
}

function getToolCount(state: GameState, toolId: string): number {
  return Object.hasOwn(state.toolCounts, toolId) ? (state.toolCounts[toolId] ?? 0) : 0;
}

function isTaskClaimed(state: GameState, taskId: string | undefined): boolean {
  return taskId === undefined || state.claimedTaskIds.includes(taskId);
}

function isUpgradeUnlocked(state: GameState, upgrade: UpgradeDefinition): boolean {
  return (
    isTaskClaimed(state, upgrade.unlockedByTaskId) &&
    (upgrade.requiredTool === undefined ||
      getToolCount(state, upgrade.requiredTool.toolId) >= upgrade.requiredTool.count)
  );
}

function isTaskReady(state: GameState, task: TaskDefinition): boolean {
  return (
    !state.claimedTaskIds.includes(task.id) &&
    isTaskClaimed(state, task.previousTaskId) &&
    state.totalGathered >= task.totalGathered &&
    getToolCount(state, task.requiredTool.toolId) >= task.requiredTool.count
  );
}

function hasEventChoice(state: GameState, eventId: string): boolean {
  return Object.hasOwn(state.eventChoices, eventId);
}

function getToolPrice(state: GameState, tool: ToolDefinition): number {
  return Math.ceil(tool.baseCost * tool.costGrowth ** getToolCount(state, tool.id));
}

function getClickYield(state: GameState, definition: GameDefinition): number {
  let yieldAmount = definition.initialClickYield;
  for (const upgrade of definition.upgrades) {
    if (
      state.purchasedUpgradeIds.includes(upgrade.id) &&
      upgrade.effect.kind === 'click-multiplier'
    ) {
      yieldAmount *= upgrade.effect.multiplier;
    }
  }
  return yieldAmount;
}

function getProductionRate(state: GameState, definition: GameDefinition): number {
  let productionRate = 0;
  for (const tool of definition.tools) {
    const count = getToolCount(state, tool.id);
    if (count === 0) continue;
    let toolRate = tool.productionRate * count;
    for (const upgrade of definition.upgrades) {
      if (
        state.purchasedUpgradeIds.includes(upgrade.id) &&
        upgrade.effect.kind === 'tool-multiplier' &&
        upgrade.effect.toolId === tool.id
      ) {
        toolRate *= upgrade.effect.multiplier;
      }
    }
    productionRate += toolRate;
  }
  for (const event of definition.events) {
    if (!hasEventChoice(state, event.id)) continue;
    const option = event.options.find((candidate) => candidate.id === state.eventChoices[event.id]);
    if (option?.effect.kind === 'production-multiplier') productionRate *= option.effect.multiplier;
  }
  return productionRate;
}

function reject(state: GameState, error: GameErrorCode): ActionResult {
  return { ok: false, state, error };
}

function accept(state: GameState, definition: GameDefinition): ActionResult {
  const clickYield = getClickYield(state, definition);
  if (
    !isSafeAmount(state.balance) ||
    !isSafeAmount(state.totalGathered) ||
    !isSafeAmount(clickYield) ||
    clickYield === 0 ||
    !isSafeAmount(getProductionRate(state, definition))
  ) {
    return reject(state, 'NUMERIC_LIMIT');
  }
  return { ok: true, state };
}

/** G01. The caller supplies time; rule code never reads a system clock. */
export function createNewGame(definition: GameDefinition, now: number): GameState {
  validateGameDefinition(definition);
  validateTime(now);
  return {
    schemaVersion: 1,
    contentVersion: definition.contentVersion,
    worldId: definition.worldId,
    balance: 0,
    totalGathered: 0,
    toolCounts: Object.fromEntries(definition.tools.map((tool) => [tool.id, 0])),
    purchasedUpgradeIds: [],
    claimedTaskIds: [],
    eventChoices: {},
    lastSimulatedAt: now,
  };
}

/** G02. A capped gap is consumed once, including the uncredited portion. */
export function advanceTime(
  state: GameState,
  definition: GameDefinition,
  now: number,
): TimeAdvanceResult {
  validateTime(now);
  validateTime(state.lastSimulatedAt);
  const elapsedMs = Math.max(0, now - state.lastSimulatedAt);
  const creditedMs = Math.min(elapsedMs, definition.maxOfflineMs);
  if (elapsedMs === 0) return { state, productionGained: 0, elapsedMs, creditedMs };
  const productionRate = getProductionRate(state, definition);
  const productionGained = productionRate * (creditedMs / 1_000);
  if (
    !isSafeAmount(productionRate) ||
    !isSafeAmount(productionGained) ||
    (productionRate > 0 && creditedMs > 0 && productionGained === 0) ||
    !canAddAmount(state.balance, productionGained) ||
    !canAddAmount(state.totalGathered, productionGained)
  ) {
    return { state, productionGained: 0, elapsedMs, creditedMs: 0, error: 'NUMERIC_LIMIT' };
  }
  return {
    state: {
      ...state,
      balance: state.balance + productionGained,
      totalGathered: state.totalGathered + productionGained,
      lastSimulatedAt: now,
    },
    productionGained,
    elapsedMs,
    creditedMs,
  };
}

/** G03–G07. Commands use an already settled state and commit all changes together. */
export function applyCommand(
  state: GameState,
  definition: GameDefinition,
  command: GameCommand,
): ActionResult {
  let candidate: GameState;
  switch (command.kind) {
    case 'tick':
      return { ok: true, state };
    case 'collect': {
      const yieldAmount = getClickYield(state, definition);
      if (
        !canAddAmount(state.balance, yieldAmount) ||
        !canAddAmount(state.totalGathered, yieldAmount)
      ) {
        return reject(state, 'NUMERIC_LIMIT');
      }
      candidate = {
        ...state,
        balance: state.balance + yieldAmount,
        totalGathered: state.totalGathered + yieldAmount,
      };
      break;
    }
    case 'buy-tool': {
      const tool = definition.tools.find((entry) => entry.id === command.toolId);
      if (tool === undefined) return reject(state, 'UNKNOWN_ID');
      if (!isTaskClaimed(state, tool.unlockedByTaskId)) return reject(state, 'LOCKED');
      const cost = getToolPrice(state, tool);
      const count = getToolCount(state, tool.id) + 1;
      if (!isSafeAmount(cost) || !Number.isSafeInteger(count))
        return reject(state, 'NUMERIC_LIMIT');
      if (state.balance < cost) return reject(state, 'INSUFFICIENT_MATERIALS');
      candidate = {
        ...state,
        balance: state.balance - cost,
        toolCounts: { ...state.toolCounts, [tool.id]: count },
      };
      break;
    }
    case 'buy-upgrade': {
      const upgrade = definition.upgrades.find((entry) => entry.id === command.upgradeId);
      if (upgrade === undefined) return reject(state, 'UNKNOWN_ID');
      if (state.purchasedUpgradeIds.includes(upgrade.id)) return reject(state, 'ALREADY_PURCHASED');
      if (!isUpgradeUnlocked(state, upgrade)) return reject(state, 'LOCKED');
      if (state.balance < upgrade.cost) return reject(state, 'INSUFFICIENT_MATERIALS');
      if (state.balance - upgrade.cost >= state.balance) return reject(state, 'NUMERIC_LIMIT');
      candidate = {
        ...state,
        balance: state.balance - upgrade.cost,
        purchasedUpgradeIds: [...state.purchasedUpgradeIds, upgrade.id],
      };
      break;
    }
    case 'claim-task': {
      const task = definition.tasks.find((entry) => entry.id === command.taskId);
      if (task === undefined) return reject(state, 'UNKNOWN_ID');
      if (state.claimedTaskIds.includes(task.id)) return reject(state, 'ALREADY_CLAIMED');
      if (!isTaskReady(state, task)) return reject(state, 'TASK_NOT_READY');
      if (!canAddAmount(state.balance, task.reward)) return reject(state, 'NUMERIC_LIMIT');
      candidate = {
        ...state,
        balance: state.balance + task.reward,
        claimedTaskIds: [...state.claimedTaskIds, task.id],
      };
      break;
    }
    case 'choose-event': {
      const event = definition.events.find((entry) => entry.id === command.eventId);
      if (event === undefined) return reject(state, 'UNKNOWN_ID');
      const option = event.options.find((entry) => entry.id === command.optionId);
      if (option === undefined) return reject(state, 'UNKNOWN_ID');
      if (!isTaskClaimed(state, event.triggeredByTaskId) || hasEventChoice(state, event.id)) {
        return reject(state, 'EVENT_NOT_PENDING');
      }
      const grantedAmount = option.effect.kind === 'resource-grant' ? option.effect.amount : 0;
      if (!canAddAmount(state.balance, grantedAmount)) return reject(state, 'NUMERIC_LIMIT');
      candidate = {
        ...state,
        balance: state.balance + grantedAmount,
        eventChoices: { ...state.eventChoices, [event.id]: option.id },
      };
      break;
    }
  }
  const result = accept(candidate, definition);
  // A numeric rejection must preserve the input snapshot, including its markers.
  return result.ok ? result : reject(state, result.error);
}

/** G08. Availability and rates have one source of truth; none are persisted. */
export function getGameSummary(state: GameState, definition: GameDefinition): GameSummary {
  return {
    productionRate: displayAmount(getProductionRate(state, definition)),
    clickYield: displayAmount(getClickYield(state, definition)),
    toolPrices: Object.fromEntries(
      definition.tools.map((tool) => [tool.id, displayAmount(getToolPrice(state, tool))]),
    ),
    availableToolIds: definition.tools
      .filter((tool) => isTaskClaimed(state, tool.unlockedByTaskId))
      .map((tool) => tool.id),
    availableUpgradeIds: definition.upgrades
      .filter(
        (upgrade) =>
          !state.purchasedUpgradeIds.includes(upgrade.id) && isUpgradeUnlocked(state, upgrade),
      )
      .map((upgrade) => upgrade.id),
    readyTaskIds: definition.tasks
      .filter((task) => isTaskReady(state, task))
      .map((task) => task.id),
    pendingEventIds: definition.events
      .filter(
        (event) =>
          isTaskClaimed(state, event.triggeredByTaskId) && !hasEventChoice(state, event.id),
      )
      .map((event) => event.id),
    isCompleted: definition.tasks.every((task) => state.claimedTaskIds.includes(task.id)),
  };
}
