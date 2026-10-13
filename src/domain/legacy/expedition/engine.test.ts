import { describe, expect, it } from 'vitest';
import { EXPEDITION_DEFINITION } from '../../../content/expedition';
import {
  advanceExpedition,
  applyExpeditionCommand,
  createExpedition,
  createResourceLedger,
  getExpeditionSummary,
  isWorldVariantAvailable,
  getRunMaxHp,
} from './engine';
import type {
  ExpeditionCommand,
  ExpeditionDefinition,
  DifficultyModifierId,
  ResearchNodeId,
  RunState,
  SaveBundle,
} from './types';
import { validateExpeditionDefinition } from './validation';
import {
  advanceAfterResolvingEvents,
  commandAfterResolvingEvents,
  resolvePendingEvents,
} from '../../../../tests/support/expedition-test-events';

const DEFINITION = EXPEDITION_DEFINITION;

function act(state: SaveBundle, command: ExpeditionCommand, definition = DEFINITION): SaveBundle {
  return commandAfterResolvingEvents(state, definition, command);
}

function enter(definition = DEFINITION): SaveBundle {
  return act(
    createExpedition(definition, 0),
    { kind: 'enter-world', worldId: 'forest' },
    definition,
  );
}

function enterSnow(
  definition = DEFINITION,
  preparationId: ResearchNodeId | null = null,
): SaveBundle {
  const state = createExpedition(definition, 0);
  return act(
    {
      ...state,
      profile: {
        ...state.profile,
        researchNodeIds: preparationId === null ? [] : [preparationId],
        equippedPreparationId: preparationId,
        clearedWorldIds: ['forest', 'ruins'],
        discoveredClueIds: ['forest-signal', 'ruins-record', 'door-coordinate'],
        dialogueChoices: { 'keeper-revelation': 'follow-coordinate' },
      },
    },
    { kind: 'enter-world', worldId: 'snow-observatory' },
    definition,
  );
}

function withRun(state: SaveBundle, changes: Partial<RunState>): SaveBundle {
  if (!state.activeRun) throw new Error('Test requires an active run');
  return {
    ...state,
    activeRun: {
      ...state.activeRun,
      ...changes,
      ...(changes.resources ? { resourceLedger: createResourceLedger(changes.resources) } : {}),
    },
  };
}

function ready(state: SaveBundle, definition = DEFINITION): SaveBundle {
  return advanceAfterResolvingEvents(state, definition, state.lastSimulatedAt + 86_400_000);
}

function healthyTwoWaveRun(): SaveBundle {
  let state = withRun(enter(), {
    resources: { wood: 100, stone: 100 },
    buildings: { shelter: 1, 'lumber-camp': 0, quarry: 0, wall: 4, tower: 0, monument: 0 },
  });
  state = act(ready(state), { kind: 'fight-wave' });
  state = act(ready(state), { kind: 'fight-wave' });
  return state;
}

describe('expedition preparation boundaries', () => {
  it('stops offline production at exactly the first wave and cannot gather while waiting', () => {
    const state = ready(enter());
    expect(state.activeRun?.phase).toBe('awaiting-wave');
    expect(state.activeRun?.elapsedInStageMs).toBe(180_000);
    expect(state.activeRun?.clearedWaves).toBe(0);
    expect(state.activeRun?.hp).toBe(100);
    expect(state.activeRun?.resources.wood).toBeCloseTo(33.2);
    expect(state.activeRun?.resources.stone).toBeCloseTo(21.1);
    expect(getExpeditionSummary(state, DEFINITION).production).toEqual({ wood: 0, stone: 0 });
    const refused = applyExpeditionCommand(state, DEFINITION, { kind: 'gather', resource: 'wood' });
    expect(refused).toEqual({ ok: false, state, error: 'WRONG_PHASE' });
    expect(refused.state).toBe(state);
    const later = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 500_000_000);
    expect(later.activeRun).toBe(state.activeRun);
    expect(advanceExpedition(later, DEFINITION, later.lastSimulatedAt)).toBe(later);
  });

  it('starts the next preparation at confirmation time without reusing the old offline gap', () => {
    const awaiting = ready(enter());
    const muchLater = advanceExpedition(
      awaiting,
      DEFINITION,
      awaiting.lastSimulatedAt + 50_000_000,
    );
    const fought = act(muchLater, { kind: 'fight-wave' });
    expect(fought.activeRun?.phase).toBe('preparing');
    expect(fought.activeRun?.elapsedInStageMs).toBe(0);
    expect(fought.activeRun?.clearedWaves).toBe(1);
    expect(advanceExpedition(fought, DEFINITION, fought.lastSimulatedAt)).toBe(fought);
    const oneSecond = advanceExpedition(
      resolvePendingEvents(fought, DEFINITION),
      DEFINITION,
      fought.lastSimulatedAt + 1000,
    );
    expect(oneSecond.activeRun?.resources.wood).toBeCloseTo(
      (fought.activeRun?.resources.wood ?? 0) + 0.14,
    );
    expect(oneSecond.activeRun?.elapsedInStageMs).toBe(1000);
  });

  it('never rolls back the clock and rejects invalid injected times', () => {
    const state = advanceExpedition(enter(), DEFINITION, 1000);
    expect(advanceExpedition(state, DEFINITION, 500)).toBe(state);
    for (const now of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => advanceExpedition(state, DEFINITION, now)).toThrow(RangeError);
      expect(() => createExpedition(DEFINITION, now)).toThrow(RangeError);
    }
  });

  it('keeps fractional gains, enforces shared manual cooldown and caps resources', () => {
    const wood = act(enter(), { kind: 'gather', resource: 'wood' });
    expect(wood.activeRun?.resources.wood).toBe(9.5);
    expect(
      applyExpeditionCommand(wood, DEFINITION, { kind: 'gather', resource: 'stone' }),
    ).toMatchObject({ ok: false, error: 'COOLDOWN' });
    const stillCooling = advanceExpedition(wood, DEFINITION, 1_500);
    expect(
      applyExpeditionCommand(stillCooling, DEFINITION, { kind: 'gather', resource: 'stone' }),
    ).toMatchObject({ ok: false, error: 'COOLDOWN' });
    const afterCooldown = advanceExpedition(wood, DEFINITION, 10_000);
    expect(
      act(afterCooldown, { kind: 'gather', resource: 'stone' }).activeRun?.resources.stone,
    ).toBeCloseTo(6.45);
    const almostFull = withRun(enter(), { resources: { wood: 119.9, stone: 99.9 } });
    expect(ready(almostFull).activeRun?.resources).toEqual({ wood: 120, stone: 100 });
    expect(act(almostFull, { kind: 'gather', resource: 'wood' }).activeRun?.resources.wood).toBe(
      120,
    );
  });

  it('does not add early-battle pressure when the remaining time earns zero points', () => {
    let state = withRun(enter(), {
      resources: { wood: 40, stone: 40 },
      buildings: { shelter: 1, 'lumber-camp': 0, quarry: 0, wall: 0, tower: 0, monument: 0 },
    });
    state = advanceExpedition(state, DEFINITION, 150_000);
    expect(getExpeditionSummary(state, DEFINITION)).toMatchObject({
      earlyBonus: 0,
      earlyWaveStrength: 20,
    });
    const result = applyExpeditionCommand(state, DEFINITION, { kind: 'fight-early' });
    expect(result).toMatchObject({
      ok: true,
      state: { activeRun: { lastBattle: { strength: 20 } } },
    });
  });

  it('persists a 20-second workforce transition and removes worker output and defense until completion', () => {
    const state = withRun(enter(), {
      resources: { wood: 40, stone: 40 },
      buildings: { shelter: 1, 'lumber-camp': 0, quarry: 0, wall: 0, tower: 0, monument: 0 },
    });
    const switched = applyExpeditionCommand(state, DEFINITION, {
      kind: 'set-workers',
      presetId: 'guard',
    });
    expect(switched).toMatchObject({
      ok: true,
      state: {
        activeRun: { workerPresetId: 'balanced', workerTransition: { remainingMs: 20_000 } },
      },
    });
    if (!switched.ok) throw new Error('Expected transition start');
    expect(getExpeditionSummary(switched.state, DEFINITION)).toMatchObject({
      production: { wood: 0.08, stone: 0.04 },
      defense: 13,
      canFightEarly: false,
      workerTransitionRemainingMs: 20_000,
    });
    expect(
      applyExpeditionCommand(switched.state, DEFINITION, {
        kind: 'set-workers',
        presetId: 'logging',
      }),
    ).toMatchObject({ ok: false, error: 'WORKER_UNAVAILABLE' });

    const halfway = advanceExpedition(switched.state, DEFINITION, 10_000);
    expect(halfway.activeRun?.workerTransition?.remainingMs).toBe(10_000);
    const completed = advanceExpedition(halfway, DEFINITION, 20_000);
    expect(completed.activeRun).toMatchObject({ workerPresetId: 'guard', workerTransition: null });
    expect(getExpeditionSummary(completed, DEFINITION)).toMatchObject({
      production: { wood: 0.08, stone: 0.04 },
      defense: 25,
      canFightEarly: true,
    });
  });

  it('keeps random incident selection stable by seed and selects at most one per run', () => {
    const makeRun = (seed: number): SaveBundle => {
      const state = createExpedition(DEFINITION, 0);
      const result = applyExpeditionCommand(state, DEFINITION, {
        kind: 'enter-world',
        worldId: 'forest',
        seed,
      });
      if (!result.ok) throw new Error(result.error);
      return result.state;
    };
    const first = makeRun(0);
    const sameSeed = makeRun(0);
    const otherSeed = makeRun(1);
    expect(first.activeRun?.randomEventId).toBe('forest-fallen-cache');
    expect(sameSeed.activeRun?.randomEventId).toBe(first.activeRun?.randomEventId);
    expect(otherSeed.activeRun?.randomEventId).toBe('forest-signal-flare');
    expect(first.activeRun?.randomEventsEnabled).toBe(true);
  });

  it('pauses simulation and gameplay actions until a pending incident is resolved', () => {
    let state = enter();
    state = advanceExpedition(state, DEFINITION, 180_000);
    state = act(state, { kind: 'fight-wave' });
    const pendingEvent = getExpeditionSummary(state, DEFINITION).pendingEvents.find(
      (event) => event.randomPool === 'incident',
    );
    if (!pendingEvent) throw new Error('Expected a pending random incident');
    const beforeResources = state.activeRun?.resources;
    expect(
      applyExpeditionCommand(state, DEFINITION, { kind: 'set-workers', presetId: 'guard' }),
    ).toMatchObject({ ok: false, error: 'EVENT_REQUIRED' });

    const paused = advanceExpedition(state, DEFINITION, 360_000);
    expect(paused.lastSimulatedAt).toBe(360_000);
    expect(paused.activeRun?.resources).toEqual(beforeResources);
    expect(paused.activeRun?.elapsedInStageMs).toBe(0);

    const fallback = pendingEvent.options.find(
      (option) => option.cost.wood === 0 && option.cost.stone === 0,
    );
    if (!fallback) throw new Error('Expected a no-cost event fallback');
    const chosen = applyExpeditionCommand(paused, DEFINITION, {
      kind: 'choose-event',
      eventId: pendingEvent.id,
      optionId: fallback.id,
    });
    if (!chosen.ok) throw new Error(chosen.error);
    const resumed = advanceExpedition(chosen.state, DEFINITION, 420_000);
    expect(resumed.activeRun?.elapsedInStageMs).toBe(60_000);
    expect(resumed.activeRun?.resources).not.toEqual(beforeResources);
  });
});

describe('difficulty clauses and bonus settlement', () => {
  it('supports every clause combination, applies the snapshots, and assigns the correct reward tier', () => {
    const combinations: readonly (readonly DifficultyModifierId[])[] = [
      [],
      ['supply-shortage'],
      ['compressed-preparation'],
      ['intensified-threat'],
      ['supply-shortage', 'compressed-preparation'],
      ['supply-shortage', 'intensified-threat'],
      ['compressed-preparation', 'intensified-threat'],
      ['supply-shortage', 'compressed-preparation', 'intensified-threat'],
    ];
    for (const modifierIds of combinations) {
      let state = createExpedition(DEFINITION, 0);
      if (modifierIds.length > 0) {
        const selected = applyExpeditionCommand(state, DEFINITION, {
          kind: 'select-difficulty-modifiers',
          worldId: 'forest',
          modifierIds,
        });
        if (!selected.ok) throw new Error(selected.error);
        state = selected.state;
      }
      const entered = applyExpeditionCommand(state, DEFINITION, {
        kind: 'enter-world',
        worldId: 'forest',
        seed: 7,
      });
      if (!entered.ok || entered.state.activeRun === null) throw new Error('Expected a new run');
      const score = modifierIds.reduce(
        (total, id) =>
          total + (DEFINITION.difficultyModifiers?.find((item) => item.id === id)?.difficulty ?? 0),
        0,
      );
      const expectedReward = score === 0 ? 0 : score <= 2 ? 4 : score <= 4 ? 8 : 12;
      const summary = getExpeditionSummary(entered.state, DEFINITION);
      expect(summary.difficultyModifierIds).toEqual(modifierIds);
      expect(summary.difficultyScore).toBe(score);
      expect(summary.difficultyReward).toBe(expectedReward);
      expect(entered.state.activeRun.resources).toEqual(
        modifierIds.includes('supply-shortage') ? { wood: 6, stone: 3 } : { wood: 8, stone: 4 },
      );
      expect(summary.stageRemainingMs).toBe(
        modifierIds.includes('compressed-preparation') ? 144_000 : 180_000,
      );
      expect(summary.nextWaveStrength).toBeCloseTo(
        modifierIds.includes('intensified-threat') ? 23 : 20,
      );
    }
  });

  it('pays the difficulty tier exactly once after successful base-contract settlement', () => {
    let state = createExpedition(DEFINITION, 0);
    const selected = applyExpeditionCommand(state, DEFINITION, {
      kind: 'select-difficulty-modifiers',
      worldId: 'forest',
      modifierIds: ['supply-shortage'],
    });
    if (!selected.ok) throw new Error(selected.error);
    const entered = applyExpeditionCommand(selected.state, DEFINITION, {
      kind: 'enter-world',
      worldId: 'forest',
      seed: 0,
    });
    if (!entered.ok) throw new Error('Could not enter the modified run');
    state = withRun(entered.state, {
      resources: { wood: 100, stone: 100 },
      buildings: { shelter: 1, 'lumber-camp': 0, quarry: 0, wall: 0, tower: 0, monument: 0 },
      clearedWaves: 2,
    });
    const eventId = state.activeRun?.randomEventId;
    if (!eventId) throw new Error('Expected a selected incident');
    const event = DEFINITION.events.find((candidate) => candidate.id === eventId);
    const option = event?.options.find((candidate) => candidate.id === 'trade-stone-for-timber');
    if (!option) throw new Error('Expected an incident option');
    const resolved = applyExpeditionCommand(state, DEFINITION, {
      kind: 'choose-event',
      eventId,
      optionId: option.id,
    });
    if (!resolved.ok) throw new Error(resolved.error);
    const returned = applyExpeditionCommand(resolved.state, DEFINITION, { kind: 'return' });
    if (!returned.ok) throw new Error(returned.error);
    expect(returned.state.lastSettlement).toMatchObject({
      outcome: 'success',
      points: 24,
      difficultyModifierIds: ['supply-shortage'],
      difficultyScore: 1,
    });
    expect(returned.state.lastSettlement?.rewards).toContainEqual({ id: 'difficulty', points: 4 });
    expect(returned.state.profile.points).toBe(24);
  });
});

describe('player choices and returning to the hub', () => {
  it('unlocks the chosen ruins route first and the alternate route only after a successful return', () => {
    const initial = createExpedition(DEFINITION, 0);
    const followRoute: SaveBundle = {
      ...initial,
      profile: {
        ...initial.profile,
        dialogueChoices: { 'keeper-river-review': 'follow-river-coordinate' },
      },
    };
    let available = getExpeditionSummary(followRoute, DEFINITION).availableContractIds;
    expect(available).toContain('ruins-observatory-contract');
    expect(available).not.toContain('ruins-relief-contract');

    const followedAndReturned: SaveBundle = {
      ...followRoute,
      profile: {
        ...followRoute.profile,
        completedObjectiveIds: ['ruins-secure-record', 'ruins-build-observatory'],
      },
    };
    available = getExpeditionSummary(followedAndReturned, DEFINITION).availableContractIds;
    expect(available).toContain('ruins-observatory-contract');
    expect(available).toContain('ruins-relief-contract');

    const protectRoute: SaveBundle = {
      ...initial,
      profile: {
        ...initial.profile,
        dialogueChoices: { 'keeper-river-review': 'protect-evacuation-route' },
      },
    };
    available = getExpeditionSummary(protectRoute, DEFINITION).availableContractIds;
    expect(available).toContain('ruins-relief-contract');
    expect(available).not.toContain('ruins-observatory-contract');

    const protectedAndReturned: SaveBundle = {
      ...protectRoute,
      profile: {
        ...protectRoute.profile,
        completedObjectiveIds: ['ruins-secure-record', 'ruins-restore-supply-line'],
      },
    };
    available = getExpeditionSummary(protectedAndReturned, DEFINITION).availableContractIds;
    expect(available).toContain('ruins-observatory-contract');
    expect(available).toContain('ruins-relief-contract');
  });

  it('unlocks a distinct defense contract only after the first successful signal return', () => {
    const fresh = createExpedition(DEFINITION, 0);
    expect(
      applyExpeditionCommand(fresh, DEFINITION, {
        kind: 'enter-world',
        worldId: 'forest',
        contractId: 'forest-perimeter-contract',
      }),
    ).toMatchObject({ ok: false, error: 'LOCKED', state: fresh });

    const returned = act(healthyTwoWaveRun(), { kind: 'return' });
    expect(returned.profile.completedObjectiveIds).toContain('forest-secure-camp');
    const nextRun = act(returned, {
      kind: 'enter-world',
      worldId: 'forest',
      contractId: 'forest-perimeter-contract',
    });
    expect(nextRun.activeRun?.contractId).toBe('forest-perimeter-contract');
    expect(getExpeditionSummary(nextRun, DEFINITION).objectives).toContainEqual(
      expect.objectContaining({ objectiveId: 'forest-build-perimeter', mandatory: true }),
    );
  });

  it('offers the contract-specific relay project as an alternative to river surveying', () => {
    const returned = act(healthyTwoWaveRun(), { kind: 'return' });
    let state = act(returned, {
      kind: 'enter-world',
      worldId: 'forest',
      contractId: 'forest-perimeter-contract',
    });
    state = withRun(state, {
      resources: { wood: 100, stone: 100 },
      clearedWaves: 1,
      buildings: { shelter: 1, 'lumber-camp': 0, quarry: 0, wall: 0, tower: 0, monument: 0 },
    });

    expect(getExpeditionSummary(state, DEFINITION).pendingEvents[0]?.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'repair-crossing' }),
        expect.objectContaining({ id: 'reinforce-marker' }),
      ]),
    );
    state = act(state, {
      kind: 'choose-event',
      eventId: 'river-bridge',
      optionId: 'reinforce-marker',
    });
    expect(getExpeditionSummary(state, DEFINITION).availableProjectIds).toEqual([
      'relay-inspection',
    ]);
    expect(
      applyExpeditionCommand(state, DEFINITION, {
        kind: 'choose-event',
        eventId: 'river-bridge',
        optionId: 'repair-crossing',
      }),
    ).toMatchObject({ ok: false, error: 'ALREADY_CHOSEN', state });
    state = act(state, {
      kind: 'start-project',
      projectId: 'relay-inspection',
      workerRole: 'stone',
    });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 60_000);
    expect(state.activeRun?.completedProjectIds).toContain('relay-inspection');
    expect(state.activeRun?.activeProject).toBeNull();
  });

  it('requires the perimeter before a watch-contract return and settles its objective once', () => {
    const returned = act(healthyTwoWaveRun(), { kind: 'return' });
    let state = act(returned, {
      kind: 'enter-world',
      worldId: 'forest',
      contractId: 'forest-perimeter-contract',
    });
    state = withRun(state, { resources: { wood: 100, stone: 100 } });
    state = ready(state);
    state = act(state, { kind: 'build', buildingId: 'shelter' });
    state = act(state, { kind: 'build', buildingId: 'wall' });
    state = act(state, { kind: 'build', buildingId: 'wall' });
    state = act(state, { kind: 'fight-wave' });
    state = act(state, {
      kind: 'choose-event',
      eventId: 'river-bridge',
      optionId: 'take-detour',
    });
    state = act(ready(state), { kind: 'fight-wave' });

    expect(getExpeditionSummary(state, DEFINITION).canReturn).toBe(true);
    expect(getExpeditionSummary(state, DEFINITION).rewardPreview).toContainEqual({
      id: 'objective:forest-build-perimeter',
      points: 8,
    });
    const settled = act(state, { kind: 'return' });
    expect(settled.profile.discoveredClueIds).toContain('forest-perimeter-record');
    expect(settled.profile.points).toBe(48);
    expect(settled.lastSettlement?.points).toBe(28);
    expect(settled.lastSettlement?.completedObjectiveIds).toContain('forest-build-perimeter');
  });

  it('supports a complete economy-and-defense path using earned resources', () => {
    let state = ready(enter());
    state = act(state, { kind: 'build', buildingId: 'shelter' });
    state = act(state, { kind: 'fight-wave' });
    state = act(state, { kind: 'choose-beacon', optionId: 'salvage' });
    state = act(state, { kind: 'build', buildingId: 'quarry' });
    state = ready(state);
    state = act(state, { kind: 'build', buildingId: 'tower' });
    state = act(state, { kind: 'fight-wave' });
    expect(getExpeditionSummary(state, DEFINITION).canReturn).toBe(true);
    for (let count = 0; count < 5; count += 1) {
      state = act(state, { kind: 'gather', resource: 'wood' });
      state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 10_000);
    }
    state = ready(state);
    state = act(state, { kind: 'build', buildingId: 'tower' });
    state = act(state, { kind: 'build', buildingId: 'wall' });
    state = act(state, { kind: 'fight-wave' });
    expect(state.activeRun?.phase).toBe('completed');
    expect(state.activeRun?.hp).toBe(22);
    expect(state.profile.points).toBe(0);
    const returned = act(state, { kind: 'return' });
    expect(returned.activeRun).toBeNull();
    expect(returned.profile.points).toBe(30);
    expect(returned.profile.totalPoints).toBe(30);
    expect(returned.lastSettlement?.outcome).toBe('success');
    expect(returned.profile.clearedWorldIds).toEqual(['forest']);
    expect(getExpeditionSummary(returned, DEFINITION).availableWorldIds).toEqual(['forest']);
    expect(applyExpeditionCommand(returned, DEFINITION, { kind: 'return' })).toMatchObject({
      ok: false,
      error: 'WRONG_PHASE',
      state: returned,
    });
    const briefed = act(returned, {
      kind: 'choose-dialogue',
      dialogueId: 'keeper-debrief',
      optionId: 'trace-source',
    });
    expect(getExpeditionSummary(briefed, DEFINITION).availableWorldIds).toEqual([
      'forest',
      'ruins',
    ]);
    expect(act(briefed, { kind: 'enter-world', worldId: 'ruins' }).activeRun?.sequence).toBe(2);
  });

  it('allows base return after two waves but requires a shelter', () => {
    const state = healthyTwoWaveRun();
    expect(getExpeditionSummary(state, DEFINITION).rewardPreview).toEqual([
      { id: 'base', points: 20 },
    ]);
    const returned = act(state, { kind: 'return' });
    expect(returned.profile.points).toBe(20);
    const noShelter = withRun(state, { buildings: { ...state.activeRun!.buildings, shelter: 0 } });
    expect(getExpeditionSummary(noShelter, DEFINITION).canReturn).toBe(false);
    const result = applyExpeditionCommand(noShelter, DEFINITION, { kind: 'return' });
    expect(result).toEqual({ ok: false, state: noShelter, error: 'TASK_NOT_READY' });
    expect(result.state).toBe(noShelter);
  });

  it('makes beacon options mutually exclusive and charges restoration atomically', () => {
    let state = resolvePendingEvents(act(ready(enter()), { kind: 'fight-wave' }), DEFINITION);
    expect(getExpeditionSummary(state, DEFINITION).beaconPending).toBe(true);
    const lackingStone = withRun(state, { resources: { wood: 100, stone: 1 } });
    const refused = applyExpeditionCommand(lackingStone, DEFINITION, {
      kind: 'choose-beacon',
      optionId: 'restore',
    });
    expect(refused).toEqual({ ok: false, state: lackingStone, error: 'INSUFFICIENT_RESOURCES' });
    expect(refused.state).toBe(lackingStone);
    state = withRun(state, { resources: { wood: 50, stone: 40 } });
    const restored = act(state, { kind: 'choose-beacon', optionId: 'restore' });
    expect(restored.activeRun?.resources).toEqual({ wood: 30, stone: 25 });
    expect(getExpeditionSummary(restored, DEFINITION).defense).toBe(19);
    expect(
      applyExpeditionCommand(restored, DEFINITION, { kind: 'choose-beacon', optionId: 'salvage' }),
    ).toMatchObject({ ok: false, error: 'ALREADY_CHOSEN' });
    const salvaged = act(state, { kind: 'choose-beacon', optionId: 'salvage' });
    expect(salvaged.activeRun?.resources).toEqual({ wood: 68, stone: 52 });
    expect(getExpeditionSummary(salvaged, DEFINITION).defense).toBe(11);
  });

  it('grants the enhanced final-wave reward only after survival, with all bonuses itemized', () => {
    let state = healthyTwoWaveRun();
    state = act(state, { kind: 'choose-beacon', optionId: 'restore' });
    state = act(state, { kind: 'build', buildingId: 'monument' });
    state = act(state, { kind: 'set-final-boost', enabled: true });
    expect(getExpeditionSummary(state, DEFINITION).nextWaveStrength).toBe(137.5);
    expect(getExpeditionSummary(state, DEFINITION).rewardTotal).toBe(30);
    state = act(ready(state), { kind: 'fight-wave' });
    expect(state.activeRun?.lastBattle).toMatchObject({
      strength: 137.5,
      defense: 67,
      damage: 71,
      survived: true,
    });
    expect(getExpeditionSummary(state, DEFINITION).rewardPreview).toEqual([
      { id: 'base', points: 20 },
      { id: 'monument', points: 5 },
      { id: 'beacon', points: 5 },
      { id: 'final-wave', points: 10 },
      { id: 'boosted-final', points: 5 },
    ]);
    const returned = act(state, { kind: 'return' });
    expect(returned.profile.points).toBe(45);
    expect(returned.profile.settledThrough).toBe(1);
    expect(returned.lastSettlement?.points).toBe(45);
  });

  it('loses all run rewards on death or abandonment and never repeats settlement', () => {
    let state = healthyTwoWaveRun();
    state = withRun(state, { hp: 1 });
    state = act(state, { kind: 'set-final-boost', enabled: true });
    state = act(ready(state), { kind: 'fight-wave' });
    expect(state.activeRun).toMatchObject({
      phase: 'failed',
      hp: 0,
      clearedWaves: 2,
      elapsedInStageMs: 0,
    });
    expect(getExpeditionSummary(state, DEFINITION).rewardTotal).toBe(0);
    expect(applyExpeditionCommand(state, DEFINITION, { kind: 'repair' })).toMatchObject({
      ok: false,
      error: 'WRONG_PHASE',
    });
    const failed = act(state, { kind: 'return' });
    expect(failed.lastSettlement).toMatchObject({ outcome: 'failed', points: 0, rewards: [] });
    expect(failed.profile.clearedWorldIds).toEqual([]);
    const abandoned = act(healthyTwoWaveRun(), { kind: 'abandon' });
    expect(abandoned.lastSettlement).toMatchObject({ outcome: 'abandoned', points: 0 });
    expect(abandoned.profile.points).toBe(0);
    const oldSequence = { ...healthyTwoWaveRun(), profile: { ...failed.profile } };
    expect(applyExpeditionCommand(oldSequence, DEFINITION, { kind: 'return' })).toMatchObject({
      ok: false,
      error: 'ALREADY_CHOSEN',
    });
  });

  it('rejects locked, unaffordable and max-count building commands without partial changes', () => {
    const state = enter();
    for (const [command, error] of [
      [{ kind: 'enter-world', worldId: 'ruins' }, 'WRONG_PHASE'],
      [{ kind: 'build', buildingId: 'tower' }, 'LOCKED'],
      [{ kind: 'build', buildingId: 'shelter' }, 'INSUFFICIENT_RESOURCES'],
      [{ kind: 'fight-wave' }, 'WRONG_PHASE'],
    ] as const) {
      const result = applyExpeditionCommand(state, DEFINITION, command);
      expect(result).toEqual({ ok: false, state, error });
      expect(result.state).toBe(state);
    }
    const built = act(ready(state), { kind: 'build', buildingId: 'shelter' });
    expect(
      applyExpeditionCommand(built, DEFINITION, { kind: 'build', buildingId: 'shelter' }),
    ).toMatchObject({ ok: false, error: 'MAX_COUNT' });
    expect(
      applyExpeditionCommand(createExpedition(DEFINITION, 0), DEFINITION, {
        kind: 'enter-world',
        worldId: 'ruins',
      }),
    ).toMatchObject({ ok: false, error: 'LOCKED' });
  });

  it('makes growth prices visible and leaves previous snapshots untouched', () => {
    const original = withRun(enter(), { resources: { wood: 120, stone: 100 } });
    Object.freeze(original.activeRun?.resources);
    Object.freeze(original.activeRun?.buildings);
    Object.freeze(original.activeRun);
    Object.freeze(original.profile);
    Object.freeze(original);
    const next = act(original, { kind: 'build', buildingId: 'lumber-camp' });
    expect(getExpeditionSummary(next, DEFINITION).buildingCosts['lumber-camp']).toEqual({
      wood: 20,
      stone: 8,
    });
    expect(getExpeditionSummary(next, DEFINITION).production.wood).toBeCloseTo(0.39);
    expect(original.activeRun?.buildings['lumber-camp']).toBe(0);
    expect(original.activeRun?.resources).toEqual({ wood: 120, stone: 100 });
  });
});

describe('permanent progress and numeric safety', () => {
  it('buys each perk once in the hub without reducing lifetime earnings', () => {
    const initial = createExpedition(DEFINITION, 0);
    const funded = { ...initial, profile: { ...initial.profile, points: 110, totalPoints: 110 } };
    let state = act(funded, { kind: 'buy-perk', perkId: 'harvest-training' });
    expect(state.profile).toMatchObject({ points: 80, totalPoints: 110 });
    expect(
      applyExpeditionCommand(state, DEFINITION, { kind: 'buy-perk', perkId: 'harvest-training' }),
    ).toMatchObject({ ok: false, error: 'ALREADY_PURCHASED' });
    state = act(state, { kind: 'buy-perk', perkId: 'reinforced-core' });
    state = act(state, { kind: 'buy-perk', perkId: 'field-repair' });
    expect(state.profile.points).toBe(0);
    state = act(state, { kind: 'enter-world', worldId: 'forest' });
    expect(state.activeRun?.maxHp).toBe(115);
    expect(getRunMaxHp(state.profile, DEFINITION)).toBe(115);
    const gathered = act(state, { kind: 'gather', resource: 'wood' });
    expect(gathered.activeRun?.resources.wood).toBeCloseTo(9.65);
    const produced = advanceExpedition(state, DEFINITION, 10_000);
    expect(produced.activeRun?.resources.wood).toBeCloseTo(9.54);
    expect(produced.activeRun?.resources.stone).toBeCloseTo(5.045);
    expect(
      applyExpeditionCommand(state, DEFINITION, { kind: 'buy-perk', perkId: 'field-repair' }),
    ).toMatchObject({ ok: false, error: 'WRONG_PHASE' });
    expect(applyExpeditionCommand(state, DEFINITION, { kind: 'repair' })).toMatchObject({
      ok: false,
      error: 'TASK_NOT_READY',
    });
    const injured = withRun(state, { hp: 110 });
    const repaired = act(injured, { kind: 'repair' });
    expect(repaired.activeRun).toMatchObject({ hp: 115, repairUsed: true });
    expect(repaired.activeRun?.resources).toEqual(injured.activeRun?.resources);
    expect(applyExpeditionCommand(repaired, DEFINITION, { kind: 'repair' })).toMatchObject({
      ok: false,
      error: 'ALREADY_CHOSEN',
    });
    expect(act(repaired, { kind: 'abandon' }).profile.perkIds).toHaveLength(3);
  });

  it('rejects unsafe sequence, cooldown and points arithmetic atomically', () => {
    const hub = createExpedition(DEFINITION, 0);
    const exhausted = {
      ...hub,
      profile: { ...hub.profile, nextRunSequence: Number.MAX_SAFE_INTEGER },
    };
    expect(
      applyExpeditionCommand(exhausted, DEFINITION, { kind: 'enter-world', worldId: 'forest' }),
    ).toMatchObject({ ok: false, error: 'NUMERIC_LIMIT', state: exhausted });
    const late = { ...enter(), lastSimulatedAt: Number.MAX_SAFE_INTEGER };
    expect(
      applyExpeditionCommand(late, DEFINITION, { kind: 'gather', resource: 'wood' }),
    ).toMatchObject({ ok: false, error: 'NUMERIC_LIMIT', state: late });
    const earned = healthyTwoWaveRun();
    const rich = {
      ...earned,
      profile: {
        ...earned.profile,
        points: Number.MAX_SAFE_INTEGER,
        totalPoints: Number.MAX_SAFE_INTEGER,
      },
    };
    const result = applyExpeditionCommand(rich, DEFINITION, { kind: 'return' });
    expect(result).toEqual({ ok: false, error: 'NUMERIC_LIMIT', state: rich });
    expect(result.state).toBe(rich);
  });

  it('changes the world resource balance and danger through content, without theme inputs', () => {
    const hub = createExpedition(DEFINITION, 0);
    const unlocked = {
      ...hub,
      profile: {
        ...hub.profile,
        clearedWorldIds: ['forest'],
        discoveredClueIds: ['forest-signal', 'route-source'],
        dialogueChoices: { 'keeper-debrief': 'trace-source' },
      },
    };
    const forest = act(unlocked, { kind: 'enter-world', worldId: 'forest' });
    const ruins = act(unlocked, { kind: 'enter-world', worldId: 'ruins' });
    expect(ruins.activeRun?.resources).toEqual({ wood: 5, stone: 14 });
    expect(getExpeditionSummary(ruins, DEFINITION).production.stone).toBeGreaterThan(
      getExpeditionSummary(forest, DEFINITION).production.stone,
    );
    expect(getExpeditionSummary(ruins, DEFINITION).predictedDamage).toBeGreaterThan(
      getExpeditionSummary(forest, DEFINITION).predictedDamage,
    );
    expect(getExpeditionSummary(ruins, DEFINITION).stageRemainingMs).toBe(150_000);
    expect(JSON.stringify(ruins)).not.toMatch(/避难|森林|废墟|woodName|themeId/);
  });
});

function collectUntil(state: SaveBundle, wood: number, stone: number): SaveBundle {
  let current = state;
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const resources = current.activeRun?.resources;
    if (!resources) throw new Error('Collection requires a run');
    if (resources.wood >= wood && resources.stone >= stone) return current;
    current = act(current, { kind: 'gather', resource: resources.wood < wood ? 'wood' : 'stone' });
    current = advanceExpedition(current, DEFINITION, current.lastSimulatedAt + 10_000);
  }
  throw new Error('Resource target could not be earned within preparation');
}

function buildFirstDefense(state: SaveBundle): SaveBundle {
  let current = collectUntil(state, 32, 16);
  current = act(current, { kind: 'build', buildingId: 'shelter' });
  current = act(current, { kind: 'build', buildingId: 'wall' });
  return act(ready(current), { kind: 'fight-wave' });
}

describe('cross-world story progress', () => {
  it('earns the main story and secret branch through actual collection, choices and successful returns', () => {
    let state = buildFirstDefense(enter());
    state = collectUntil(state, 20, 15);
    state = act(state, { kind: 'choose-beacon', optionId: 'restore' });
    state = collectUntil(state, 6, 8);
    state = act(state, { kind: 'investigate', clueId: 'forest-inscription' });
    expect(state.activeRun?.recoveredClueIds).toEqual(['forest-inscription']);
    expect(state.profile.discoveredClueIds).toEqual([]);
    expect(getExpeditionSummary(state, DEFINITION).pendingDialogueIds).toEqual([]);
    state = act(ready(state), { kind: 'fight-wave' });
    state = act(state, { kind: 'return' });
    expect(state.profile.discoveredClueIds).toEqual(['forest-signal', 'forest-inscription']);
    expect(getExpeditionSummary(state, DEFINITION).pendingDialogueIds).toEqual(['keeper-debrief']);
    expect(
      applyExpeditionCommand(state, DEFINITION, { kind: 'enter-world', worldId: 'ruins' }),
    ).toMatchObject({ ok: false, error: 'LOCKED' });
    state = act(state, {
      kind: 'choose-dialogue',
      dialogueId: 'keeper-debrief',
      optionId: 'trace-source',
    });
    expect(state.profile.discoveredClueIds).toContain('route-source');
    state = act(state, { kind: 'enter-world', worldId: 'ruins' });
    expect(state.activeRun?.resources).toEqual({ wood: 5, stone: 14 });
    state = buildFirstDefense(state);
    state = collectUntil(state, 8, 25);
    state = act(state, { kind: 'investigate', clueId: 'ruins-script' });
    state = act(ready(state), { kind: 'fight-wave' });
    state = act(state, { kind: 'return' });
    expect(state.profile.clearedWorldIds).toEqual(['forest', 'ruins']);
    expect(state.profile.discoveredClueIds).toEqual([
      'forest-signal',
      'forest-inscription',
      'route-source',
      'ruins-record',
      'ruins-script',
    ]);
    expect(getExpeditionSummary(state, DEFINITION).pendingDialogueIds).toEqual([
      'keeper-revelation',
      'keeper-sideproof',
    ]);
    state = act(state, {
      kind: 'choose-dialogue',
      dialogueId: 'keeper-revelation',
      optionId: 'follow-coordinate',
    });
    state = act(state, {
      kind: 'choose-dialogue',
      dialogueId: 'keeper-sideproof',
      optionId: 'cross-check',
    });
    expect(state.profile.discoveredClueIds).toEqual(
      expect.arrayContaining(['door-coordinate', 'time-loop-proof']),
    );
    expect(state.profile.dialogueChoices).toEqual({
      'keeper-debrief': 'trace-source',
      'keeper-revelation': 'follow-coordinate',
      'keeper-sideproof': 'cross-check',
    });
    expect(getExpeditionSummary(state, DEFINITION).pendingDialogueIds).toEqual([]);
    state = act(state, { kind: 'enter-world', worldId: 'forest' });
    expect(state.activeRun?.resources).toEqual({ wood: 8, stone: 14 });
    expect(state.activeRun?.recoveredClueIds).toEqual([]);
    const unavailable = withRun(state, { clearedWaves: 1, beaconChoice: 'restore' });
    expect(
      applyExpeditionCommand(resolvePendingEvents(unavailable, DEFINITION), DEFINITION, {
        kind: 'investigate',
        clueId: 'forest-inscription',
      }),
    ).toMatchObject({ ok: false, error: 'ALREADY_CHOSEN' });
  });

  it('discards recovered clues on failure or abandonment and never unlocks dialogue from a temporary clue', () => {
    let state = withRun(healthyTwoWaveRun(), {
      beaconChoice: 'restore',
      resources: { wood: 6, stone: 8 },
    });
    state = act(state, { kind: 'investigate', clueId: 'forest-inscription' });
    expect(state.activeRun?.resources).toEqual({ wood: 0, stone: 0 });
    expect(state.profile.discoveredClueIds).toEqual([]);
    expect(act(state, { kind: 'abandon' }).profile.discoveredClueIds).toEqual([]);
    state = withRun(state, { hp: 1 });
    state = act(ready(state), { kind: 'fight-wave' });
    expect(state.activeRun?.phase).toBe('failed');
    expect(state.activeRun?.recoveredClueIds).toEqual(['forest-inscription']);
    const returned = act(state, { kind: 'return' });
    expect(returned.profile.discoveredClueIds).toEqual([]);
    expect(getExpeditionSummary(returned, DEFINITION).pendingDialogueIds).toEqual([]);
  });

  it('validates investigation prerequisites and cost without partial payment', () => {
    let state = healthyTwoWaveRun();
    expect(getExpeditionSummary(state, DEFINITION).availableClueIds).toEqual([]);
    expect(
      applyExpeditionCommand(state, DEFINITION, {
        kind: 'investigate',
        clueId: 'forest-inscription',
      }),
    ).toMatchObject({ ok: false, error: 'LOCKED' });
    state = withRun(state, { beaconChoice: 'restore', resources: { wood: 6, stone: 7 } });
    expect(getExpeditionSummary(state, DEFINITION).availableClueIds).toEqual([
      'forest-inscription',
    ]);
    const refused = applyExpeditionCommand(state, DEFINITION, {
      kind: 'investigate',
      clueId: 'forest-inscription',
    });
    expect(refused).toEqual({ ok: false, error: 'INSUFFICIENT_RESOURCES', state });
    expect(refused.state).toBe(state);
    expect(
      applyExpeditionCommand(state, DEFINITION, { kind: 'investigate', clueId: 'ruins-script' }),
    ).toMatchObject({ ok: false, error: 'LOCKED' });
    expect(
      applyExpeditionCommand(state, DEFINITION, { kind: 'investigate', clueId: 'forest-signal' }),
    ).toMatchObject({ ok: false, error: 'LOCKED' });
    state = withRun(state, { resources: { wood: 6, stone: 8 } });
    state = act(state, { kind: 'investigate', clueId: 'forest-inscription' });
    expect(
      applyExpeditionCommand(state, DEFINITION, {
        kind: 'investigate',
        clueId: 'forest-inscription',
      }),
    ).toMatchObject({ ok: false, error: 'ALREADY_CHOSEN' });
  });

  it('keeps dialogue choices permanent and the selected branch changes future starting resources', () => {
    const initial = createExpedition(DEFINITION, 0);
    const locked = applyExpeditionCommand(initial, DEFINITION, {
      kind: 'choose-dialogue',
      dialogueId: 'keeper-debrief',
      optionId: 'help-stranded',
    });
    expect(locked).toEqual({ ok: false, state: initial, error: 'LOCKED' });
    const returned = act(healthyTwoWaveRun(), { kind: 'return' });
    expect(
      applyExpeditionCommand(returned, DEFINITION, {
        kind: 'choose-dialogue',
        dialogueId: 'keeper-debrief',
        optionId: 'unknown',
      }),
    ).toMatchObject({ ok: false, error: 'UNKNOWN_ID' });
    const chosen = act(returned, {
      kind: 'choose-dialogue',
      dialogueId: 'keeper-debrief',
      optionId: 'help-stranded',
    });
    expect(chosen.profile.discoveredClueIds).toEqual(['forest-signal', 'route-rescue']);
    const repeated = applyExpeditionCommand(chosen, DEFINITION, {
      kind: 'choose-dialogue',
      dialogueId: 'keeper-debrief',
      optionId: 'trace-source',
    });
    expect(repeated).toEqual({ ok: false, state: chosen, error: 'ALREADY_CHOSEN' });
    let active = act(chosen, { kind: 'enter-world', worldId: 'ruins' });
    expect(active.activeRun?.resources).toEqual({ wood: 13, stone: 8 });
    expect(
      applyExpeditionCommand(active, DEFINITION, {
        kind: 'choose-dialogue',
        dialogueId: 'keeper-debrief',
        optionId: 'help-stranded',
      }),
    ).toMatchObject({ ok: false, error: 'WRONG_PHASE' });
    active = act(active, { kind: 'abandon' });
    expect(act(active, { kind: 'enter-world', worldId: 'ruins' }).activeRun?.resources).toEqual({
      wood: 13,
      stone: 8,
    });
  });
});

describe('expedition content validation', () => {
  it('accepts the shipped content and rejects unreachable or unsafe definitions', () => {
    expect(() => validateExpeditionDefinition(DEFINITION)).not.toThrow();
    const forest = DEFINITION.worlds[0]!;
    const invalidDefinitions: ExpeditionDefinition[] = [
      { ...DEFINITION, gatherCooldownMs: 0 },
      { ...DEFINITION, repairHp: Infinity },
      { ...DEFINITION, worlds: [{ ...forest, id: '显示名称' }] },
      { ...DEFINITION, worlds: [forest, { ...forest }] },
      { ...DEFINITION, worlds: [{ ...forest, unlockAfterWorld: 'missing' }] },
      {
        ...DEFINITION,
        worlds: [
          forest,
          { ...forest, id: 'cycle-a', unlockAfterWorld: 'cycle-b' },
          { ...forest, id: 'cycle-b', unlockAfterWorld: 'cycle-a' },
        ],
      },
      { ...DEFINITION, worlds: [{ ...forest, initialResources: { wood: 121, stone: 4 } }] },
      { ...DEFINITION, worlds: [{ ...forest, buildings: forest.buildings.slice(1) }] },
      {
        ...DEFINITION,
        worlds: [
          {
            ...forest,
            buildings: forest.buildings.map((building) =>
              building.id === 'wall'
                ? { ...building, priceGrowth: Number.MAX_SAFE_INTEGER }
                : building,
            ),
          },
        ],
      },
      { ...DEFINITION, perks: DEFINITION.perks.slice(1) },
      {
        ...DEFINITION,
        researchNodes: (DEFINITION.researchNodes ?? []).map((node, index) =>
          index === 0 ? { ...node, appliesToWorldIds: ['missing-world'] } : node,
        ),
      },
      {
        ...DEFINITION,
        contracts: DEFINITION.contracts.map((contract) =>
          contract.id === 'ruins-observatory-contract'
            ? {
                ...contract,
                unlockAfterDialogueChoice: {
                  dialogueId: 'missing-dialogue',
                  optionId: 'follow-river-coordinate',
                },
              }
            : contract,
        ),
      },
      {
        ...DEFINITION,
        contracts: DEFINITION.contracts.map((contract) =>
          contract.id === 'ruins-observatory-contract'
            ? { ...contract, unlockAfterAnyCompletedObjectiveIds: ['forest-secure-camp'] }
            : contract,
        ),
      },
    ];
    for (const definition of invalidDefinitions)
      expect(() => validateExpeditionDefinition(definition)).toThrow();
  });
});

describe('research preparation and named return variants', () => {
  it('gates research by permanent evidence, spends the shared points, and snapshots one equipped tool', () => {
    const fresh = createExpedition(DEFINITION, 0);
    expect(
      applyExpeditionCommand(fresh, DEFINITION, {
        kind: 'research-node',
        researchNodeId: 'production-budget',
      }),
    ).toMatchObject({ ok: false, error: 'LOCKED' });

    const returned = act(healthyTwoWaveRun(), { kind: 'return' });
    const researched = act(returned, {
      kind: 'research-node',
      researchNodeId: 'production-budget',
    });
    expect(researched.profile.points).toBe(0);
    expect(researched.profile.researchNodeIds).toEqual(['production-budget']);
    expect(
      applyExpeditionCommand(researched, DEFINITION, {
        kind: 'research-node',
        researchNodeId: 'production-budget',
      }),
    ).toMatchObject({ ok: false, error: 'ALREADY_PURCHASED' });

    const equipped = act(researched, {
      kind: 'equip-preparation',
      researchNodeId: 'production-budget',
    });
    const entered = act(equipped, { kind: 'enter-world', worldId: 'forest' });
    expect(entered.activeRun?.preparationId).toBe('production-budget');
    expect(getExpeditionSummary(entered, DEFINITION).buildingCosts['lumber-camp']).toEqual({
      wood: 10,
      stone: 3,
    });
    expect(
      applyExpeditionCommand(entered, DEFINITION, {
        kind: 'equip-preparation',
        researchNodeId: null,
      }),
    ).toMatchObject({ ok: false, error: 'WRONG_PHASE' });
  });

  it('lets the defense preparation be armed once and records its effective battle reduction', () => {
    let state = act(healthyTwoWaveRun(), { kind: 'return' });
    state = act(state, { kind: 'research-node', researchNodeId: 'battle-bracing' });
    state = act(state, { kind: 'equip-preparation', researchNodeId: 'battle-bracing' });
    state = act(state, { kind: 'enter-world', worldId: 'forest' });
    state = ready(state);
    const ordinaryDamage = getExpeditionSummary(state, DEFINITION).predictedDamage;
    state = act(state, { kind: 'brace' });
    expect(getExpeditionSummary(state, DEFINITION).predictedDamage).toBe(
      Math.max(0, ordinaryDamage - 10),
    );
    state = act(state, { kind: 'fight-wave' });
    expect(state.activeRun?.lastBattle).toMatchObject({ braceReduction: 10, damage: 0 });
    expect(state.activeRun?.braceUsed).toBe(true);
    expect(applyExpeditionCommand(ready(state), DEFINITION, { kind: 'brace' })).toMatchObject({
      ok: false,
      error: 'ALREADY_CHOSEN',
    });
  });

  it('applies the investigation discount to the first successful clue and tracks the spend', () => {
    let state = act(healthyTwoWaveRun(), { kind: 'return' });
    state = act(state, { kind: 'research-node', researchNodeId: 'evidence-ledger' });
    state = act(state, { kind: 'equip-preparation', researchNodeId: 'evidence-ledger' });
    state = act(state, { kind: 'enter-world', worldId: 'forest' });
    state = withRun(state, {
      phase: 'awaiting-wave',
      clearedWaves: 1,
      beaconChoice: 'restore',
      resources: { wood: 20, stone: 20 },
    });
    expect(
      getExpeditionSummary(state, DEFINITION).investigationCosts['forest-inscription'],
    ).toEqual({
      wood: 2,
      stone: 0,
    });
    state = act(state, { kind: 'investigate', clueId: 'forest-inscription' });
    expect(state.activeRun?.resources).toEqual({ wood: 18, stone: 20 });
    expect(state.activeRun?.investigationDiscountUsed).toBe(true);
    expect(state.activeRun?.recoveredClueIds).toContain('forest-inscription');
  });

  it('does not snapshot a forest and ruins preparation into the snow observatory', () => {
    const state = enterSnow(DEFINITION, 'production-budget');
    const snow = DEFINITION.worlds.find((world) => world.id === 'snow-observatory');
    const lumberCamp = snow?.buildings.find((building) => building.id === 'lumber-camp');

    expect(state.activeRun?.preparationId).toBeNull();
    expect(getExpeditionSummary(state, DEFINITION).buildingCosts['lumber-camp']).toEqual(
      lumberCamp?.cost,
    );
  });

  it('unlocks the alternate ruins return variant after completing the other route', () => {
    const observatory = DEFINITION.worldVariants?.find(
      (variant) => variant.id === 'ruins-observatory',
    );
    const relief = DEFINITION.worldVariants?.find((variant) => variant.id === 'ruins-relief-route');
    if (!observatory || !relief) throw new Error('Ruins variants are missing');

    for (const route of [
      {
        choice: 'follow-river-coordinate',
        completedObjective: 'ruins-build-observatory',
        alternate: relief,
      },
      {
        choice: 'protect-evacuation-route',
        completedObjective: 'ruins-restore-supply-line',
        alternate: observatory,
      },
    ] as const) {
      const state = createExpedition(DEFINITION, 0);
      const profile = {
        ...state.profile,
        clearedWorldIds: ['forest', 'ruins'],
        dialogueChoices: {
          'keeper-debrief': 'trace-source',
          'keeper-river-review': route.choice,
        },
        completedObjectiveIds: [
          'forest-secure-camp',
          'ruins-secure-record',
          'forest-river-survey',
          route.completedObjective,
        ],
      };
      expect(isWorldVariantAvailable(profile, route.alternate, DEFINITION)).toBe(true);
      const selected = applyExpeditionCommand({ ...state, profile }, DEFINITION, {
        kind: 'select-world-variant',
        worldVariantId: route.alternate.id,
      });
      expect(selected).toMatchObject({
        ok: true,
        state: { profile: { selectedVariantIds: { ruins: route.alternate.id } } },
      });
    }
  });

  it('persists a cleared-world variant, changes its contract and opening supply, and filters unrelated events', () => {
    const returned = act(healthyTwoWaveRun(), { kind: 'return' });
    expect(getExpeditionSummary(returned, DEFINITION).availableWorldVariantIds).toEqual([
      'forest-river-survey',
      'forest-boundary-watch',
    ]);
    const selected = act(returned, {
      kind: 'select-world-variant',
      worldVariantId: 'forest-boundary-watch',
    });
    expect(selected.profile.selectedVariantIds.forest).toBe('forest-boundary-watch');
    let run = act(selected, { kind: 'enter-world', worldId: 'forest' });
    expect(run.activeRun).toMatchObject({
      variantId: 'forest-boundary-watch',
      contractId: 'forest-perimeter-contract',
    });
    expect(run.activeRun?.resources.wood).toBe(DEFINITION.worlds[0]!.initialResources.wood + 4);
    run = act(ready(run), { kind: 'fight-wave' });
    const pendingEvents = getExpeditionSummary(run, DEFINITION).pendingEvents;
    expect(pendingEvents.map((event) => event.id)).toContain('river-bridge');
    expect(pendingEvents.filter((event) => event.randomPool === 'incident')).toHaveLength(1);
    const abandoned = act(run, { kind: 'abandon' });
    const cleared = act(abandoned, {
      kind: 'select-world-variant',
      worldVariantId: null,
      worldId: 'forest',
    });
    expect(cleared.profile.selectedVariantIds.forest).toBeUndefined();
    expect(
      act(cleared, { kind: 'enter-world', worldId: 'forest' }).activeRun?.variantId,
    ).toBeNull();
  });
});

describe('snow observatory environmental mode', () => {
  it('stops offline simulation at a confirmation node and never repeats the same gap', () => {
    const started = enterSnow();
    const offlineStop = advanceExpedition(started, DEFINITION, 12 * 60 * 60 * 1000);
    expect(offlineStop.activeRun).toMatchObject({
      phase: 'awaiting-environment',
      elapsedInStageMs: 120_000,
      clearedWaves: 0,
      snowState: { nodesResolved: 1, pendingReason: 'checkpoint', temperature: -6.2 },
    });
    expect(offlineStop.activeRun?.snowState?.fuel).toBeCloseTo(5.6);
    const resourcesAtStop = offlineStop.activeRun?.resources;
    const later = advanceExpedition(offlineStop, DEFINITION, 24 * 60 * 60 * 1000);
    expect(later.activeRun).toEqual(offlineStop.activeRun);
    expect(later.activeRun?.resources).toEqual(resourcesAtStop);
    expect(later.activeRun?.snowState?.fuel).toBeCloseTo(5.6);
    expect(applyExpeditionCommand(later, DEFINITION, { kind: 'fight-wave' })).toMatchObject({
      ok: false,
      error: 'EVENT_REQUIRED',
    });
  });

  it('balances fuel, heat, repair costs, and pauses at a low-temperature hazard', () => {
    let state = advanceExpedition(enterSnow(), DEFINITION, 120_000);
    state = act(state, { kind: 'repair-generator' });
    expect(state.activeRun?.snowState?.generatorIntegrity).toBe(85);
    expect(state.activeRun?.resourceLedger.spent).toEqual({ wood: 10, stone: 8 });
    state = act(state, { kind: 'stoke-furnace' });
    expect(state.activeRun?.snowState?.fuel).toBeCloseTo(11.6);
    expect(state.activeRun?.snowState?.fuelFromWood).toBeCloseTo(6);

    state = withRun(state, {
      snowState: {
        ...state.activeRun!.snowState!,
        temperature: -9.5,
        heaterOn: false,
      },
    });
    state = act(state, { kind: 'continue-snow', heaterOn: false });
    const danger = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 60_000);
    expect(danger.activeRun).toMatchObject({
      phase: 'awaiting-environment',
      elapsedInStageMs: 50_000,
      snowState: {
        nodesResolved: 1,
        pendingReason: 'low-temperature',
        temperature: -10,
        heaterOn: false,
      },
    });
    const resumed = act(danger, { kind: 'continue-snow', heaterOn: true });
    expect(resumed.activeRun).toMatchObject({
      phase: 'preparing',
      elapsedInStageMs: 50_000,
      snowState: { nodesResolved: 1, pendingReason: null, heaterOn: true },
    });
  });

  it('returns after the three primary nodes and anchors the optional fourth record separately', () => {
    let state = enterSnow();
    for (let node = 0; node < 3; node += 1) {
      state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 120_000);
      expect(state.activeRun?.phase).toBe('awaiting-environment');
      if (node === 0) state = act(state, { kind: 'repair-generator' });
      state = act(state, { kind: 'continue-snow', heaterOn: true });
    }
    expect(state.activeRun).toMatchObject({
      phase: 'preparing',
      snowState: { nodesResolved: 3, generatorIntegrity: 85 },
    });
    expect(getExpeditionSummary(state, DEFINITION).canReturn).toBe(false);
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 120_000);
    expect(state.activeRun?.phase).toBe('awaiting-environment');
    expect(getExpeditionSummary(state, DEFINITION).canReturn).toBe(true);
    expect(getExpeditionSummary(state, DEFINITION).canReturn).toBe(true);
    expect(getExpeditionSummary(state, DEFINITION).canSecureRewards).toBe(true);
    state = act(state, { kind: 'secure-rewards' });
    expect(state.activeRun?.securedRewards.map((reward) => reward.points)).toEqual([20]);
    state = act(state, { kind: 'stoke-furnace' });
    state = act(state, { kind: 'continue-snow', heaterOn: true });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 80_000);
    expect(state.activeRun?.snowState?.pendingReason).toBe('checkpoint');
    state = act(state, { kind: 'continue-snow', heaterOn: true });
    expect(state.activeRun).toMatchObject({
      phase: 'completed',
      snowState: { nodesResolved: 4, generatorIntegrity: 85 },
    });
    expect(getExpeditionSummary(state, DEFINITION).canReturn).toBe(true);
    state = act(state, { kind: 'return' });
    expect(state.lastSettlement).toMatchObject({ outcome: 'success', clearedWaves: 0, points: 28 });
    expect(state.profile.discoveredClueIds).toContain('snow-observatory-record');
  });
});
