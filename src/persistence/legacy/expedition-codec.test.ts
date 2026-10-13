import { describe, expect, it } from 'vitest';
import { BASE_GAME_DEFINITION } from '../../content/legacy/base-game';
import { EXPEDITION_DEFINITION } from '../../content/legacy/expedition';
import {
  advanceAfterResolvingEvents,
  commandAfterResolvingEvents,
} from '../../../tests/support/expedition-test-events';
import { createExpedition, createResourceLedger } from '../../domain/legacy/expedition/engine';
import type { ExpeditionCommand, SaveBundle } from '../../domain/legacy/expedition/types';
import {
  decodeExpeditionSave,
  encodeExpeditionSave,
  validateExpeditionSave,
} from './expedition-codec';

const definition = EXPEDITION_DEFINITION;
const advanceExpedition = advanceAfterResolvingEvents;
function command(state: SaveBundle, value: ExpeditionCommand): SaveBundle {
  return commandAfterResolvingEvents(state, definition, value);
}
function entered(): SaveBundle {
  return command(createExpedition(definition, 0), { kind: 'enter-world', worldId: 'forest' });
}
function enteredSnow(): SaveBundle {
  const state = createExpedition(definition, 0);
  return command(
    {
      ...state,
      profile: {
        ...state.profile,
        points: 40,
        totalPoints: 40,
        clearedWorldIds: ['forest', 'ruins'],
        settledThrough: 2,
        nextRunSequence: 3,
        discoveredClueIds: ['forest-signal', 'route-source', 'ruins-record', 'door-coordinate'],
        dialogueChoices: {
          'keeper-debrief': 'trace-source',
          'keeper-revelation': 'follow-coordinate',
        },
        completedObjectiveIds: ['forest-secure-camp', 'ruins-secure-record'],
      },
      lastSettlement: {
        sequence: 2,
        worldId: 'ruins',
        contractId: 'ruins-recover-record',
        outcome: 'success',
        clearedWaves: 2,
        rewards: [{ id: 'base', points: 20 }],
        points: 20,
        completedObjectiveIds: ['ruins-secure-record'],
        difficultyModifierIds: [],
        difficultyScore: 0,
      },
    },
    { kind: 'enter-world', worldId: 'snow-observatory' },
  );
}
function returnable(waves = 2, restore = false): SaveBundle {
  let state = entered();
  const run = state.activeRun!;
  state = {
    ...state,
    activeRun: {
      ...run,
      resources: { wood: 120, stone: 100 },
      resourceLedger: createResourceLedger({ wood: 120, stone: 100 }),
    },
  };
  state = command(state, { kind: 'build', buildingId: 'shelter' });
  for (let count = 0; count < 3; count += 1)
    state = command(state, { kind: 'build', buildingId: 'wall' });
  for (let wave = 0; wave < waves; wave += 1) {
    state = advanceExpedition(state, definition, state.lastSimulatedAt + 1_000_000);
    state = command(state, { kind: 'fight-wave' });
    if (restore && wave === 0)
      state = command(state, { kind: 'choose-beacon', optionId: 'restore' });
  }
  return state;
}

function runWithInFlightRiverSurvey(wallCount = 4): SaveBundle {
  let state = command(createExpedition(definition, 0), {
    kind: 'enter-world',
    worldId: 'forest',
    contractId: 'forest-survey-contract',
  });
  const run = state.activeRun!;
  state = {
    ...state,
    activeRun: {
      ...run,
      resources: { wood: 120, stone: 100 },
      resourceLedger: createResourceLedger({ wood: 120, stone: 100 }),
    },
  };
  state = command(state, { kind: 'build', buildingId: 'shelter' });
  for (let wall = 0; wall < wallCount; wall += 1)
    state = command(state, { kind: 'build', buildingId: 'wall' });
  state = command(advanceExpedition(state, definition, 180_000), { kind: 'fight-wave' });
  state = command(state, {
    kind: 'choose-event',
    eventId: 'river-bridge',
    optionId: 'repair-crossing',
  });
  return command(state, {
    kind: 'start-project',
    projectId: 'river-survey',
    workerRole: 'guard',
  });
}

function decode(value: unknown): SaveBundle {
  const parsed = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  return validateExpeditionSave(parsed, definition, BASE_GAME_DEFINITION);
}

describe('expedition save codec', () => {
  it.each([
    ['failed', false],
    ['completed', true],
  ] as const)('round trips a frozen in-flight project after a %s battle', (_outcome, survives) => {
    let state = runWithInFlightRiverSurvey(survives ? 4 : 0);
    state = command(state, { kind: 'fight-early' });
    state = command(state, { kind: 'fight-early' });
    if (survives) expect(state.activeRun?.phase).toBe('completed');
    else expect(state.activeRun?.phase).toBe('failed');
    expect(state.activeRun?.activeProject).toMatchObject({
      projectId: 'river-survey',
      elapsedMs: 0,
    });
    expect(
      decodeExpeditionSave(encodeExpeditionSave(state), definition, BASE_GAME_DEFINITION),
    ).toEqual(state);
  });

  it('rejects legacy schema-1 imports without changing their source bytes', () => {
    const legacy = JSON.stringify({ schemaVersion: 1, contentVersion: '1.0.0', balance: 37 });
    expect(() => decodeExpeditionSave(legacy, definition, BASE_GAME_DEFINITION)).toThrow(
      '不迁移旧版存档',
    );
    expect(legacy).toBe('{"schemaVersion":1,"contentVersion":"1.0.0","balance":37}');
  });

  it('round trips domain-produced preparing, waiting, combat, completed, settled and perk states', () => {
    const states = [
      createExpedition(definition, 0),
      entered(),
      advanceExpedition(entered(), definition, 1_000_000),
      returnable(2),
      returnable(3, true),
    ];
    const settled = command(returnable(3, true), { kind: 'return' });
    states.push(settled, command(settled, { kind: 'buy-perk', perkId: 'reinforced-core' }));
    for (const state of states)
      expect(
        decodeExpeditionSave(encodeExpeditionSave(state), definition, BASE_GAME_DEFINITION),
      ).toEqual(state);
  });

  it('round trips a seeded incident choice and an in-flight workforce transition', () => {
    const seeded = command(createExpedition(definition, 0), {
      kind: 'enter-world',
      worldId: 'forest',
      seed: 1,
    });
    expect(seeded.activeRun?.randomEventId).toBe('forest-signal-flare');
    expect(
      decodeExpeditionSave(encodeExpeditionSave(seeded), definition, BASE_GAME_DEFINITION),
    ).toEqual(seeded);

    const transition = command(seeded, { kind: 'set-workers', presetId: 'guard' });
    expect(
      decodeExpeditionSave(encodeExpeditionSave(transition), definition, BASE_GAME_DEFINITION),
    ).toEqual(transition);
    const halfway = advanceExpedition(transition, definition, 10_000);
    expect(halfway.activeRun?.workerTransition?.remainingMs).toBe(10_000);
    expect(
      decodeExpeditionSave(encodeExpeditionSave(halfway), definition, BASE_GAME_DEFINITION),
    ).toEqual(halfway);
  });

  it('rejects schema-6 legacy progress rather than applying v0.7 rules to a new world', () => {
    const legacy = JSON.stringify({ schemaVersion: 6, contentVersion: '11.0.0' });
    expect(() => decodeExpeditionSave(legacy, definition, BASE_GAME_DEFINITION)).toThrow(
      '不迁移旧版存档',
    );
    expect(legacy).toBe('{"schemaVersion":6,"contentVersion":"11.0.0"}');
  });

  it('rejects the shipped v0.7.1 schema-7 save with a version-specific recovery message', () => {
    const oldSave = JSON.stringify({ schemaVersion: 7, contentVersion: '12.0.0' });
    expect(() => decodeExpeditionSave(oldSave, definition, BASE_GAME_DEFINITION)).toThrow(
      '请使用旧版 v0.7.1 打开',
    );
    expect(oldSave).toBe('{"schemaVersion":7,"contentVersion":"12.0.0"}');
  });

  it('round trips death and abandoned settlement without meta reward', () => {
    let state = entered();
    for (let wave = 0; wave < 3; wave += 1) {
      state = advanceExpedition(state, definition, state.lastSimulatedAt + 1_000_000);
      state = command(state, { kind: 'fight-wave' });
      if (state.activeRun?.phase === 'failed') break;
    }
    expect(state.activeRun?.phase).toBe('failed');
    expect(decode(state)).toEqual(state);
    expect(decode(command(state, { kind: 'return' })).lastSettlement?.points).toBe(0);
    expect(decode(command(entered(), { kind: 'abandon' })).lastSettlement?.points).toBe(0);
  });

  it('round trips snow environments and rejects a tampered fuel ledger', () => {
    let state = enteredSnow();
    expect(decode(encodeExpeditionSave(state))).toEqual(state);

    let frequentlyTicked = enteredSnow();
    for (let tick = 0; tick < 120; tick += 1)
      frequentlyTicked = advanceExpedition(
        frequentlyTicked,
        definition,
        frequentlyTicked.lastSimulatedAt + 1_000,
      );
    expect(frequentlyTicked.activeRun?.phase).toBe('awaiting-environment');
    frequentlyTicked = command(frequentlyTicked, { kind: 'repair-generator' });
    expect(decode(encodeExpeditionSave(frequentlyTicked))).toEqual(frequentlyTicked);

    state = advanceExpedition(state, definition, 12 * 60 * 60 * 1000);
    expect(state.activeRun?.phase).toBe('awaiting-environment');
    expect(decode(encodeExpeditionSave(state))).toEqual(state);

    const tampered = JSON.parse(encodeExpeditionSave(state)) as {
      activeRun: { snowState: { fuel: number } };
    };
    tampered.activeRun.snowState.fuel += 1;
    expect(() => decode(tampered)).toThrow(/燃料/);

    state = command(state, { kind: 'repair-generator' });
    state = command(state, { kind: 'continue-snow', heaterOn: true });
    expect(decode(encodeExpeditionSave(state))).toEqual(state);
    for (let node = 1; node < 3; node += 1) {
      state = advanceExpedition(state, definition, state.lastSimulatedAt + 120_000);
      state = command(state, { kind: 'continue-snow', heaterOn: true });
    }
    state = advanceExpedition(state, definition, state.lastSimulatedAt + 120_000);
    expect(state.activeRun?.snowState?.nodesResolved).toBe(3);
    expect(decode(encodeExpeditionSave(state))).toEqual(state);
    state = command(state, { kind: 'secure-rewards' });
    expect(decode(encodeExpeditionSave(state))).toEqual(state);
    state = command(state, { kind: 'stoke-furnace' });
    state = command(state, { kind: 'continue-snow', heaterOn: true });
    state = advanceExpedition(state, definition, state.lastSimulatedAt + 80_000);
    expect(state.activeRun?.snowState?.pendingReason).toBe('checkpoint');
    state = command(state, { kind: 'continue-snow', heaterOn: true });
    expect(state.activeRun?.phase).toBe('completed');
    expect(state.activeRun?.snowState?.nodesResolved).toBe(4);
    expect(decode(encodeExpeditionSave(state))).toEqual(state);
    state = command(state, { kind: 'return' });
    expect(decode(encodeExpeditionSave(state))).toEqual(state);
  });

  it('round trips investigated clues, permanent dialogue and the unlocked next world', () => {
    const investigated = command(returnable(2, true), {
      kind: 'investigate',
      clueId: 'forest-inscription',
    });
    const settled = command(investigated, { kind: 'return' });
    const chosen = command(settled, {
      kind: 'choose-dialogue',
      dialogueId: 'keeper-debrief',
      optionId: 'trace-source',
    });
    const nextWorld = command(chosen, { kind: 'enter-world', worldId: 'ruins' });
    for (const state of [investigated, settled, chosen, nextWorld])
      expect(
        decodeExpeditionSave(encodeExpeditionSave(state), definition, BASE_GAME_DEFINITION),
      ).toEqual(state);
    expect(settled.profile.discoveredClueIds).toEqual(['forest-signal', 'forest-inscription']);
    expect(nextWorld.activeRun?.resources).toEqual({ wood: 5, stone: 14 });
  });

  it('retains temporary investigation in a failed run but never archives it after death or abandonment', () => {
    let state = entered();
    state = {
      ...state,
      activeRun: {
        ...state.activeRun!,
        resources: { wood: 120, stone: 100 },
        resourceLedger: createResourceLedger({ wood: 120, stone: 100 }),
      },
    };
    state = command(advanceExpedition(state, definition, 1_000_000), { kind: 'fight-wave' });
    state = command(state, { kind: 'choose-beacon', optionId: 'restore' });
    state = command(state, { kind: 'investigate', clueId: 'forest-inscription' });
    const abandoned = command(state, { kind: 'abandon' });
    for (let wave = 1; wave < 3; wave += 1)
      state = command(advanceExpedition(state, definition, state.lastSimulatedAt + 1_000_000), {
        kind: 'fight-wave',
      });
    expect(state.activeRun?.phase).toBe('failed');
    expect(decode(state).activeRun?.recoveredClueIds).toEqual(['forest-inscription']);
    expect(decode(command(state, { kind: 'return' })).profile.discoveredClueIds).toEqual([]);
    expect(decode(abandoned).profile.discoveredClueIds).toEqual([]);
  });

  it('rejects unknown, duplicate, unearned and inconsistent permanent story records', () => {
    const initial = createExpedition(definition, 0);
    for (const patch of [
      { discoveredClueIds: ['foreign'] },
      { discoveredClueIds: ['forest-signal', 'forest-signal'] },
      { discoveredClueIds: ['forest-signal'] },
      { discoveredClueIds: ['forest-inscription'] },
      { discoveredClueIds: ['route-source'] },
      { dialogueChoices: { foreign: 'trace-source' } },
      { dialogueChoices: { 'keeper-debrief': 'trace-source' } },
    ])
      expect(() => decode({ ...initial, profile: { ...initial.profile, ...patch } })).toThrow();
    const settled = command(returnable(), { kind: 'return' });
    for (const patch of [
      { dialogueChoices: { 'keeper-debrief': 'foreign' } },
      { dialogueChoices: { 'keeper-debrief': 'trace-source' } },
      {
        dialogueChoices: { 'keeper-revelation': 'follow-coordinate' },
        discoveredClueIds: ['forest-signal', 'door-coordinate'],
      },
      {
        dialogueChoices: { 'keeper-debrief': 'trace-source' },
        discoveredClueIds: ['route-source'],
      },
      {
        dialogueChoices: { 'keeper-debrief': 'trace-source' },
        discoveredClueIds: ['forest-signal', 'route-source', 'route-rescue'],
      },
    ])
      expect(() => decode({ ...settled, profile: { ...settled.profile, ...patch } })).toThrow();
  });

  it('rejects recovered clues from other sources, worlds or unmet investigation conditions', () => {
    const state = returnable(2, true);
    for (const recoveredClueIds of [
      ['foreign'],
      ['forest-inscription', 'forest-inscription'],
      ['forest-signal'],
      ['route-source'],
      ['ruins-script'],
    ])
      expect(() =>
        decode({ ...state, activeRun: { ...state.activeRun, recoveredClueIds } }),
      ).toThrow();
    const noBeacon = returnable();
    expect(() =>
      decode({
        ...noBeacon,
        activeRun: { ...noBeacon.activeRun, recoveredClueIds: ['forest-inscription'] },
      }),
    ).toThrow();
    const investigated = command(state, { kind: 'investigate', clueId: 'forest-inscription' });
    const hub = command(investigated, { kind: 'return' });
    const replay = command(hub, { kind: 'enter-world', worldId: 'forest' });
    expect(() =>
      decode({
        ...replay,
        activeRun: { ...replay.activeRun, recoveredClueIds: ['forest-inscription'] },
      }),
    ).toThrow();
  });

  it('rejects an unlocked-world run or clearance when its required hub dialogue is missing', () => {
    const settled = command(returnable(), { kind: 'return' });
    const chosen = command(settled, {
      kind: 'choose-dialogue',
      dialogueId: 'keeper-debrief',
      optionId: 'trace-source',
    });
    const nextWorld = command(chosen, { kind: 'enter-world', worldId: 'ruins' });
    expect(() => decode({ ...nextWorld, profile: settled.profile })).toThrow();
    expect(() =>
      decode({ ...settled, profile: { ...settled.profile, clearedWorldIds: ['forest', 'ruins'] } }),
    ).toThrow();
  });

  it.each([
    { points: 0.5, totalPoints: 0.5 },
    { points: Infinity },
    { totalPoints: NaN },
    { points: -1 },
    { points: 1, totalPoints: 0 },
    { perkIds: ['foreign'] },
    { perkIds: ['harvest-training', 'harvest-training'] },
    { clearedWorldIds: ['ruins'] },
    { nextRunSequence: 0 },
    { nextRunSequence: 2 },
    { settledThrough: 1 },
  ])('rejects invalid profile: %j', (patch) => {
    const state = createExpedition(definition, 0);
    expect(() => decode({ ...state, profile: { ...state.profile, ...patch } })).toThrow();
  });

  it.each([
    { sequence: 0 },
    { worldId: 'foreign' },
    { worldId: 'ruins' },
    { resources: { wood: 121, stone: 0 } },
    { resources: { wood: 0, stone: 0, coins: 1 } },
    { hp: 101 },
    { hp: 0 },
    { maxHp: 999 },
    { clearedWaves: 1 },
    { clearedWaves: 3 },
    { phase: 'awaiting-wave' },
    { phase: 'completed' },
    { elapsedInStageMs: 180_000 },
    { gatherAvailableAt: 100_000 },
    { repairUsed: true },
    { boostedFinal: true },
    { beaconChoice: 'restore' },
    { beaconChoice: 'foreign' },
  ])('rejects invalid temporary state: %j', (patch) => {
    const state = entered();
    expect(() => decode({ ...state, activeRun: { ...state.activeRun, ...patch } })).toThrow();
  });

  it('rejects fractional, excessive, missing and unknown building counts', () => {
    const state = entered();
    for (const buildings of [
      { ...state.activeRun!.buildings, wall: 0.5 },
      { ...state.activeRun!.buildings, wall: 5 },
      { ...state.activeRun!.buildings, tower: 1 },
      { shelter: 0 },
      { ...state.activeRun!.buildings, castle: 1 },
    ])
      expect(() => decode({ ...state, activeRun: { ...state.activeRun, buildings } })).toThrow();
  });

  it('rejects forged combat and duplicate or mismatched settlement rewards', () => {
    const fought = returnable();
    expect(() =>
      decode({
        ...fought,
        activeRun: {
          ...fought.activeRun,
          lastBattle: { ...fought.activeRun!.lastBattle, damage: 0 },
        },
      }),
    ).toThrow();
    const settled = command(fought, { kind: 'return' });
    for (const patch of [
      { sequence: 99 },
      { points: 0.5 },
      { points: 21 },
      { rewards: [] },
      {
        rewards: [
          { id: 'base', points: 20 },
          { id: 'base', points: 20 },
        ],
      },
      { rewards: [{ id: 'base', points: 20.5 }] },
      { rewards: [{ id: 'foreign', points: 20 }] },
      { outcome: 'failed' },
      { clearedWaves: 0 },
    ])
      expect(() =>
        decode({ ...settled, lastSettlement: { ...settled.lastSettlement, ...patch } }),
      ).toThrow();
  });

  it('rejects unknown versions and damaged legacy archives while ignoring runtime metadata', () => {
    const state = createExpedition(definition, 0);
    expect(() => decode({ ...state, schemaVersion: 99 })).toThrow('不支持');
    expect(() => decode({ ...state, contentVersion: 'future' })).toThrow('不支持');
    expect(() => decode({ ...state, legacyArchive: { schemaVersion: 99 } })).toThrow();
    expect(decode({ ...state, revision: 999_999 })).toEqual(state);
  });
});
