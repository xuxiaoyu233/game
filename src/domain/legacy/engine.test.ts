import { describe, expect, it } from 'vitest';
import { BASE_GAME_DEFINITION } from '../../content/legacy/base-game';
import { advanceTime, applyCommand, createNewGame, getGameSummary } from './engine';
import type { GameCommand, GameDefinition, GameState } from './types';
import { validateGameDefinition } from './validation';

const START_TIME = 1_000;
const ONE_HOUR_MS = 60 * 60 * 1_000;

function game(patch: Partial<GameState> = {}): GameState {
  return { ...createNewGame(BASE_GAME_DEFINITION, START_TIME), ...patch };
}

function execute(
  state: GameState,
  command: GameCommand,
  definition = BASE_GAME_DEFINITION,
): GameState {
  const result = applyCommand(state, definition, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`Unexpected rejection: ${result.error}`);
  return result.state;
}

describe('independent rule capabilities', () => {
  it('starts a zero-resource game with all configured tools and explicit time', () => {
    const state = game();
    expect(state).toMatchObject({ balance: 0, totalGathered: 0, lastSimulatedAt: START_TIME });
    expect(state.toolCounts).toEqual({ extractor: 0, processor: 0, drone: 0 });
    expect(getGameSummary(state, BASE_GAME_DEFINITION)).toMatchObject({
      productionRate: 0,
      clickYield: 1,
      availableToolIds: ['extractor'],
      readyTaskIds: [],
      pendingEventIds: [],
      isCompleted: false,
    });
  });

  it('keeps commands immutable and does not advance time during collecting or buying', () => {
    const state = Object.freeze(game({ balance: 20, totalGathered: 20 }));
    Object.freeze(state.toolCounts);
    Object.freeze(state.claimedTaskIds);
    const collected = execute(state, { kind: 'collect' });
    expect(collected.balance).toBe(21);
    expect(collected.totalGathered).toBe(21);
    expect(collected.lastSimulatedAt).toBe(START_TIME);
    const bought = execute(state, { kind: 'buy-tool', toolId: 'extractor' });
    expect(bought.balance).toBe(0);
    expect(bought.totalGathered).toBe(20);
    expect(bought.toolCounts.extractor).toBe(1);
    expect(state.balance).toBe(20);
    expect(state.toolCounts.extractor).toBe(0);
  });

  it('uses the same rate for displayed production and a ten-minute settlement', () => {
    const state = game({
      toolCounts: { extractor: 2, processor: 1, drone: 0 },
      claimedTaskIds: ['foothold'],
    });
    expect(getGameSummary(state, BASE_GAME_DEFINITION).productionRate).toBe(4);
    const advanced = advanceTime(state, BASE_GAME_DEFINITION, START_TIME + 600_000);
    expect(advanced.productionGained).toBe(2_400);
    expect(advanced.state.balance).toBe(2_400);
    expect(advanced.state.totalGathered).toBe(2_400);
    expect(advanced.state.claimedTaskIds).toEqual(['foothold']);
  });

  it('settles production before the caller buys a tool without crediting the new tool retroactively', () => {
    const state = game({ balance: 23, toolCounts: { extractor: 1, processor: 0, drone: 0 } });
    const advanced = advanceTime(state, BASE_GAME_DEFINITION, START_TIME + 2_000);
    const bought = execute(advanced.state, { kind: 'buy-tool', toolId: 'extractor' });
    expect(advanced.productionGained).toBe(1);
    expect(bought.balance).toBe(0);
    expect(bought.toolCounts.extractor).toBe(2);
    expect(getGameSummary(bought, BASE_GAME_DEFINITION).productionRate).toBe(1);
  });

  it('retains fractional production and uses rounded-up prices', () => {
    const state = game({ toolCounts: { extractor: 1, processor: 0, drone: 0 } });
    const result = advanceTime(state, BASE_GAME_DEFINITION, START_TIME + 500);
    expect(result.state.balance).toBe(0.25);
    expect(result.state.totalGathered).toBe(0.25);
    expect(getGameSummary(state, BASE_GAME_DEFINITION).toolPrices.extractor).toBe(24);
  });

  it.each([
    [{ kind: 'buy-tool', toolId: 'extractor' }, 'INSUFFICIENT_MATERIALS'],
    [{ kind: 'buy-tool', toolId: 'processor' }, 'LOCKED'],
    [{ kind: 'buy-upgrade', upgradeId: 'extractor-gears' }, 'LOCKED'],
    [{ kind: 'claim-task', taskId: 'foothold' }, 'TASK_NOT_READY'],
    [{ kind: 'choose-event', eventId: 'supply-cache', optionId: 'repair' }, 'EVENT_NOT_PENDING'],
    [{ kind: 'buy-tool', toolId: 'missing' }, 'UNKNOWN_ID'],
    [{ kind: 'choose-event', eventId: 'supply-cache', optionId: 'missing' }, 'UNKNOWN_ID'],
  ] as const)('rejects %j atomically with %s', (command, error) => {
    const state = game();
    expect(applyCommand(state, BASE_GAME_DEFINITION, command)).toEqual({ ok: false, state, error });
    expect(applyCommand(state, BASE_GAME_DEFINITION, command).state).toBe(state);
  });

  it('requires claimed prerequisites and gives each stage reward once without counting it as gathered', () => {
    let state = game({
      balance: 100,
      totalGathered: 3_000,
      toolCounts: { extractor: 1, processor: 1, drone: 1 },
    });
    expect(getGameSummary(state, BASE_GAME_DEFINITION).readyTaskIds).toEqual(['foothold']);
    expect(
      applyCommand(state, BASE_GAME_DEFINITION, { kind: 'claim-task', taskId: 'automation' }),
    ).toMatchObject({
      ok: false,
      error: 'TASK_NOT_READY',
    });
    for (const [taskId, expectedBalance] of [
      ['foothold', 130],
      ['automation', 250],
      ['settlement', 750],
    ] as const) {
      state = execute(state, { kind: 'claim-task', taskId });
      expect(state.balance).toBe(expectedBalance);
      expect(state.totalGathered).toBe(3_000);
      const repeated = applyCommand(state, BASE_GAME_DEFINITION, { kind: 'claim-task', taskId });
      expect(repeated).toEqual({ ok: false, state, error: 'ALREADY_CLAIMED' });
    }
    expect(getGameSummary(state, BASE_GAME_DEFINITION).isCompleted).toBe(true);
    expect(getGameSummary(state, BASE_GAME_DEFINITION).pendingEventIds).toEqual(['supply-cache']);
  });

  it('buys one-time upgrades only when their tool or stage prerequisite is satisfied', () => {
    let state = game({
      balance: 1_000,
      totalGathered: 1_000,
      toolCounts: { extractor: 3, processor: 2, drone: 0 },
      claimedTaskIds: ['foothold'],
    });
    state = execute(state, { kind: 'buy-upgrade', upgradeId: 'hand-grip' });
    state = execute(state, { kind: 'buy-upgrade', upgradeId: 'extractor-gears' });
    state = execute(state, { kind: 'buy-upgrade', upgradeId: 'assembly-line' });
    expect(state.balance).toBe(220);
    expect(getGameSummary(state, BASE_GAME_DEFINITION)).toMatchObject({
      clickYield: 2,
      productionRate: 12,
    });
    expect(execute(state, { kind: 'collect' }).totalGathered).toBe(1_002);
    expect(
      applyCommand(state, BASE_GAME_DEFINITION, { kind: 'buy-upgrade', upgradeId: 'hand-grip' }),
    ).toEqual({
      ok: false,
      state,
      error: 'ALREADY_PURCHASED',
    });
  });

  it('grants event materials without adding gathered resources and prevents a second choice', () => {
    const state = game({
      balance: 50,
      totalGathered: 500,
      claimedTaskIds: ['foothold', 'automation'],
    });
    const chosen = execute(state, {
      kind: 'choose-event',
      eventId: 'supply-cache',
      optionId: 'salvage',
    });
    expect(chosen.balance).toBe(250);
    expect(chosen.totalGathered).toBe(500);
    expect(getGameSummary(chosen, BASE_GAME_DEFINITION).pendingEventIds).toEqual([]);
    expect(
      applyCommand(chosen, BASE_GAME_DEFINITION, {
        kind: 'choose-event',
        eventId: 'supply-cache',
        optionId: 'repair',
      }),
    ).toEqual({
      ok: false,
      state: chosen,
      error: 'EVENT_NOT_PENDING',
    });
  });

  it('derives a chosen event multiplier once across repeated queries and JSON restoration', () => {
    const state = game({
      toolCounts: { extractor: 2, processor: 1, drone: 0 },
      claimedTaskIds: ['foothold', 'automation'],
    });
    const chosen = execute(state, {
      kind: 'choose-event',
      eventId: 'supply-cache',
      optionId: 'repair',
    });
    const restored = JSON.parse(JSON.stringify(chosen)) as GameState;
    expect(getGameSummary(chosen, BASE_GAME_DEFINITION).productionRate).toBeCloseTo(4.4);
    expect(getGameSummary(restored, BASE_GAME_DEFINITION).productionRate).toBeCloseTo(4.4);
    expect(
      advanceTime(restored, BASE_GAME_DEFINITION, START_TIME + 10_000).productionGained,
    ).toBeCloseTo(44);
  });

  it('keeps presentation metadata out of the mechanical result', () => {
    const alternatePresentation = {
      ...BASE_GAME_DEFINITION,
      theme: { title: '花园', accent: '#44aa66' },
    };
    const state = game({ balance: 50 });
    expect(
      applyCommand(state, alternatePresentation, { kind: 'buy-tool', toolId: 'extractor' }),
    ).toEqual(applyCommand(state, BASE_GAME_DEFINITION, { kind: 'buy-tool', toolId: 'extractor' }));
    expect(getGameSummary(state, alternatePresentation)).toEqual(
      getGameSummary(state, BASE_GAME_DEFINITION),
    );
  });
});

describe('time and numeric boundaries', () => {
  it('consumes only eight hours of a twenty-hour gap and never credits the gap twice', () => {
    const state = game({ toolCounts: { extractor: 2, processor: 0, drone: 0 } });
    const now = START_TIME + 20 * ONE_HOUR_MS;
    const result = advanceTime(state, BASE_GAME_DEFINITION, now);
    expect(result.elapsedMs).toBe(20 * ONE_HOUR_MS);
    expect(result.creditedMs).toBe(8 * ONE_HOUR_MS);
    expect(result.productionGained).toBe(28_800);
    expect(result.state.lastSimulatedAt).toBe(now);
    const repeated = advanceTime(result.state, BASE_GAME_DEFINITION, now);
    expect(repeated.productionGained).toBe(0);
    expect(repeated.state).toBe(result.state);
  });

  it('does not roll the settlement point back when the clock moves backwards', () => {
    const state = game({ toolCounts: { extractor: 1, processor: 0, drone: 0 } });
    const backwards = advanceTime(state, BASE_GAME_DEFINITION, START_TIME - 100);
    expect(backwards.state).toBe(state);
    expect(backwards.productionGained).toBe(0);
    expect(
      advanceTime(backwards.state, BASE_GAME_DEFINITION, START_TIME + 1_000).productionGained,
    ).toBe(0.5);
  });

  it.each([NaN, Infinity, -1])('rejects invalid time %s', (now) => {
    expect(() => createNewGame(BASE_GAME_DEFINITION, now)).toThrow(RangeError);
    expect(() => advanceTime(game(), BASE_GAME_DEFINITION, now)).toThrow(RangeError);
  });

  it('rejects overflow without consuming elapsed time or mutating finite amounts', () => {
    const state = game({
      balance: Number.MAX_SAFE_INTEGER,
      totalGathered: Number.MAX_SAFE_INTEGER,
      toolCounts: { extractor: 1, processor: 0, drone: 0 },
    });
    const result = advanceTime(state, BASE_GAME_DEFINITION, START_TIME + 2_000);
    expect(result.state).toBe(state);
    expect(result.error).toBe('NUMERIC_LIMIT');
    expect(result.productionGained).toBe(0);
    expect(result.creditedMs).toBe(0);
    expect(applyCommand(state, BASE_GAME_DEFINITION, { kind: 'collect' })).toEqual({
      ok: false,
      state,
      error: 'NUMERIC_LIMIT',
    });
  });

  it('shows a finite placeholder for astronomical prices and refuses the purchase', () => {
    const state = game({
      balance: Number.MAX_SAFE_INTEGER,
      toolCounts: { extractor: 10_000, processor: 0, drone: 0 },
    });
    expect(getGameSummary(state, BASE_GAME_DEFINITION).toolPrices.extractor).toBe(
      Number.MAX_SAFE_INTEGER,
    );
    expect(
      applyCommand(state, BASE_GAME_DEFINITION, { kind: 'buy-tool', toolId: 'extractor' }),
    ).toEqual({
      ok: false,
      state,
      error: 'NUMERIC_LIMIT',
    });
  });

  it('does not discard a small positive gain when floating-point precision cannot add it', () => {
    const state = game({
      balance: Number.MAX_SAFE_INTEGER,
      totalGathered: Number.MAX_SAFE_INTEGER,
      toolCounts: { extractor: 1, processor: 0, drone: 0 },
    });
    const result = advanceTime(state, BASE_GAME_DEFINITION, START_TIME + 500);
    expect(result.state).toBe(state);
    expect(result.error).toBe('NUMERIC_LIMIT');
    expect(result.state.lastSimulatedAt).toBe(START_TIME);
  });

  it('rejects a production-overflowing upgrade without charging or marking it', () => {
    const definition: GameDefinition = {
      ...BASE_GAME_DEFINITION,
      tools: BASE_GAME_DEFINITION.tools.map((tool) =>
        tool.id === 'extractor' ? { ...tool, productionRate: Number.MAX_SAFE_INTEGER / 4 } : tool,
      ),
    };
    const state = game({ balance: 500, toolCounts: { extractor: 3, processor: 0, drone: 0 } });
    expect(
      applyCommand(state, definition, { kind: 'buy-upgrade', upgradeId: 'extractor-gears' }),
    ).toEqual({
      ok: false,
      state,
      error: 'NUMERIC_LIMIT',
    });
  });
});

describe('content validation', () => {
  it('accepts the base content', () => {
    expect(() => validateGameDefinition(BASE_GAME_DEFINITION)).not.toThrow();
  });

  it('rejects unknown references, duplicate identifiers and nonfinite numbers', () => {
    const unknownReference = {
      ...BASE_GAME_DEFINITION,
      tools: [
        { id: 'tool', baseCost: 1, costGrowth: 1, productionRate: 1, unlockedByTaskId: 'missing' },
      ],
    };
    const duplicateIds = {
      ...BASE_GAME_DEFINITION,
      tools: [...BASE_GAME_DEFINITION.tools, ...BASE_GAME_DEFINITION.tools],
    };
    expect(() => validateGameDefinition(unknownReference)).toThrow(/unknown task/);
    expect(() => validateGameDefinition(duplicateIds)).toThrow(/duplicates/);
    expect(() =>
      validateGameDefinition({ ...BASE_GAME_DEFINITION, initialClickYield: Infinity }),
    ).toThrow(/finite/);
    expect(() => validateGameDefinition({ ...BASE_GAME_DEFINITION, worldId: '中文主题' })).toThrow(
      /identifier/,
    );
  });

  it('rejects task chains and task/tool unlock cycles that make progress impossible', () => {
    const taskCycle: GameDefinition = {
      ...BASE_GAME_DEFINITION,
      tasks: BASE_GAME_DEFINITION.tasks.map((task) =>
        task.id === 'foothold' ? { ...task, previousTaskId: 'settlement' } : task,
      ),
    };
    const unlockCycle: GameDefinition = {
      ...BASE_GAME_DEFINITION,
      tools: BASE_GAME_DEFINITION.tools.map((tool) =>
        tool.id === 'extractor' ? { ...tool, unlockedByTaskId: 'foothold' } : tool,
      ),
    };
    expect(() => validateGameDefinition(taskCycle)).toThrow(/cycle/);
    expect(() => validateGameDefinition(unlockCycle)).toThrow(/cycle/);
  });
});
