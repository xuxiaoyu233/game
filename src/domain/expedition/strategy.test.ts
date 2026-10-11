import { describe, expect, it } from 'vitest';
import { EXPEDITION_DEFINITION } from '../../content/expedition';
import { BASE_GAME_DEFINITION } from '../../content/base-game';
import { decodeExpeditionSave, encodeExpeditionSave } from '../../persistence/expedition-codec';
import {
  applyExpeditionCommand,
  createExpedition,
  createResourceLedger,
  getExpeditionSummary,
} from './engine';
import type { ExpeditionCommand, SaveBundle } from './types';
import {
  advanceAfterResolvingEvents,
  commandAfterResolvingEvents,
} from '../../../tests/support/expedition-test-events';

const DEFINITION = EXPEDITION_DEFINITION;
const advanceExpedition = advanceAfterResolvingEvents;
function act(
  state: SaveBundle,
  command: ExpeditionCommand,
  definition: typeof DEFINITION = DEFINITION,
): SaveBundle {
  let current = state;
  if (current.activeRun?.workerTransition !== null && current.activeRun !== null) {
    current = advanceExpedition(
      current,
      definition,
      current.lastSimulatedAt + current.activeRun.workerTransition.remainingMs,
    );
  }
  return commandAfterResolvingEvents(current, definition, command);
}
function enter(definition: typeof DEFINITION = DEFINITION, contractId?: string): SaveBundle {
  const command: ExpeditionCommand =
    contractId === undefined
      ? { kind: 'enter-world', worldId: 'forest' }
      : { kind: 'enter-world', worldId: 'forest', contractId };
  return act(createExpedition(definition, 0), command, definition);
}
function prepareCore(definition: typeof DEFINITION = DEFINITION): SaveBundle {
  return act(
    advanceExpedition(enter(definition), definition, 120_000),
    {
      kind: 'build',
      buildingId: 'shelter',
    },
    definition,
  );
}
function reload(state: SaveBundle, definition: typeof DEFINITION = DEFINITION): SaveBundle {
  return decodeExpeditionSave(encodeExpeditionSave(state), definition, BASE_GAME_DEFINITION);
}
function returnable(definition: typeof DEFINITION = DEFINITION): SaveBundle {
  let state = act(prepareCore(definition), { kind: 'set-workers', presetId: 'guard' }, definition);
  state = act(state, { kind: 'fight-early' }, definition);
  state = act(
    advanceExpedition(state, definition, state.lastSimulatedAt + 120_000),
    { kind: 'fight-early' },
    definition,
  );
  return state;
}

describe('initiative risk and settlement', () => {
  it('requires a core, gives up remaining production, and pays the previewed risk only on return', () => {
    const fresh = enter();
    expect(applyExpeditionCommand(fresh, DEFINITION, { kind: 'fight-early' })).toMatchObject({
      ok: false,
      error: 'TASK_NOT_READY',
      state: fresh,
    });
    let state = act(prepareCore(), { kind: 'set-workers', presetId: 'guard' });
    state = advanceExpedition(
      state,
      DEFINITION,
      state.lastSimulatedAt + (DEFINITION.workerTransitionMs ?? 0),
    );
    const preview = getExpeditionSummary(state, DEFINITION);
    const resources = state.activeRun!.resources;
    expect(preview).toMatchObject({
      earlyBonus: 1,
      earlyWaveStrength: 21,
      earlyPredictedDamage: 0,
    });
    state = act(state, { kind: 'fight-early' });
    expect(state.activeRun).toMatchObject({
      resources,
      clearedWaves: 1,
      elapsedInStageMs: 0,
      initiativePoints: 1,
    });
    expect(state.profile.points).toBe(0);
    expect(reload(state)).toEqual(state);
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 120_000);
    state = act(state, { kind: 'fight-early' });
    expect(state.activeRun?.initiativePoints).toBe(3);
    const returned = act(state, { kind: 'return' });
    expect(returned.profile.points).toBe(23);
    expect(returned.lastSettlement?.rewards).toContainEqual({ id: 'initiative', points: 3 });
    expect(reload(returned)).toEqual(returned);
    expect(applyExpeditionCommand(returned, DEFINITION, { kind: 'return' }).ok).toBe(false);
  });

  it('keeps the early bonuses provisional and loses all of them if the optional third wave fails', () => {
    let state = act(prepareCore(), { kind: 'fight-early' });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 120_000);
    state = act(state, { kind: 'fight-early' });
    expect(getExpeditionSummary(state, DEFINITION).rewardTotal).toBe(23);
    state = act(state, { kind: 'fight-early' });
    expect(state.activeRun?.phase).toBe('failed');
    expect(getExpeditionSummary(state, DEFINITION).rewardTotal).toBe(0);
    expect(reload(state)).toEqual(state);
    const returned = act(state, { kind: 'return' });
    expect(returned.lastSettlement).toMatchObject({ outcome: 'failed', points: 0, rewards: [] });
  });

  it('does not offer an initiative reward after the preparation boundary', () => {
    const waiting = advanceExpedition(prepareCore(), DEFINITION, 180_000);
    expect(getExpeditionSummary(waiting, DEFINITION)).toMatchObject({
      canFightEarly: false,
      earlyBonus: 0,
    });
    expect(applyExpeditionCommand(waiting, DEFINITION, { kind: 'fight-early' })).toMatchObject({
      ok: false,
      error: 'WRONG_PHASE',
    });
    expect(act(waiting, { kind: 'fight-wave' }).activeRun?.initiativePoints).toBe(0);
  });
});

describe('secure return and optional escalation', () => {
  it('banks completed rewards and evidence before an optional wave, then keeps only the banked result on failure', () => {
    const unready = prepareCore();
    expect(applyExpeditionCommand(unready, DEFINITION, { kind: 'secure-rewards' })).toMatchObject({
      ok: false,
      error: 'TASK_NOT_READY',
      state: unready,
    });

    const ready = returnable();
    const secured = act(ready, { kind: 'secure-rewards' });
    const securedPoints = secured.activeRun!.securedRewards.reduce(
      (sum, reward) => sum + reward.points,
      0,
    );
    expect(secured.activeRun?.securedObjectiveIds).toContain('forest-secure-camp');
    expect(secured.activeRun?.securedClueIds).toContain('forest-signal');
    expect(getExpeditionSummary(secured, DEFINITION)).toMatchObject({
      canSecureRewards: false,
      securedRewardTotal: securedPoints,
      atRiskRewardTotal: 0,
      nextWaveRewardTotal: DEFINITION.rewards.finalWave,
    });
    expect(reload(secured)).toEqual(secured);
    expect(applyExpeditionCommand(secured, DEFINITION, { kind: 'secure-rewards' })).toMatchObject({
      ok: false,
      error: 'TASK_NOT_READY',
      state: secured,
    });

    const failed = act(secured, { kind: 'fight-early' });
    expect(failed.activeRun?.phase).toBe('failed');
    expect(getExpeditionSummary(failed, DEFINITION)).toMatchObject({
      rewardTotal: securedPoints,
      atRiskRewardTotal: 0,
    });
    const returned = act(failed, { kind: 'return' });
    expect(returned.lastSettlement).toMatchObject({
      outcome: 'secured',
      points: securedPoints,
      completedObjectiveIds: ['forest-secure-camp'],
    });
    expect(returned.profile.clearedWorldIds).toContain('forest');
    expect(returned.profile.discoveredClueIds).toContain('forest-signal');
    expect(returned.profile.completedObjectiveIds).toContain('forest-secure-camp');
    expect(reload(returned)).toEqual(returned);
  });

  it('keeps the banked bundle when the player chooses to withdraw instead of fighting again', () => {
    const secured = act(returnable(), { kind: 'secure-rewards' });
    const result = act(secured, { kind: 'abandon' });

    expect(result.lastSettlement).toMatchObject({
      outcome: 'secured',
      points: getExpeditionSummary(secured, DEFINITION).securedRewardTotal,
      rewards: secured.activeRun?.securedRewards,
      completedObjectiveIds: ['forest-secure-camp'],
    });
    expect(result.profile.discoveredClueIds).toContain('forest-signal');
    expect(reload(result)).toEqual(result);
  });

  it('combines secured and new rewards once after a successful optional wave', () => {
    const easyDefinition: typeof DEFINITION = {
      ...DEFINITION,
      worlds: DEFINITION.worlds.map((world) => {
        if (world.id !== 'forest') return world;
        if (world.mode?.kind === 'snow-observatory' || world.waveStrengths === undefined)
          return world;
        return {
          ...world,
          waveStrengths: [world.waveStrengths[0], world.waveStrengths[1], 1] as const,
        };
      }),
    };
    let state = act(returnable(easyDefinition), { kind: 'secure-rewards' }, easyDefinition);
    const securedTotal = getExpeditionSummary(state, easyDefinition).securedRewardTotal;
    state = advanceExpedition(state, easyDefinition, state.lastSimulatedAt + 240_000);
    state = act(state, { kind: 'fight-wave' }, easyDefinition);
    const returned = act(state, { kind: 'return' }, easyDefinition);
    expect(returned.lastSettlement?.outcome).toBe('success');
    expect(returned.lastSettlement?.points).toBeGreaterThan(securedTotal);
    expect(returned.lastSettlement?.rewards.filter((reward) => reward.id === 'base')).toHaveLength(
      1,
    );
    expect(reload(returned, easyDefinition)).toEqual(returned);
  });
});

describe('strategy profiles for the first forest chapter', () => {
  it('compares a 72-second secure rush with its distinct survival and story result', () => {
    let state = advanceExpedition(enter(), DEFINITION, 72_000);
    state = act(state, { kind: 'build', buildingId: 'shelter' });
    state = act(state, { kind: 'set-workers', presetId: 'guard' });
    state = act(state, { kind: 'fight-early' });
    state = act(state, { kind: 'fight-early' });
    state = act(state, { kind: 'secure-rewards' });
    expect(state.activeRun?.hp).toBe(53);
    expect(state.activeRun?.resourceLedger.collected).toEqual({ wood: 0, stone: 0 });
    expect(getExpeditionSummary(state, DEFINITION).securedRewardTotal).toBe(27);

    state = act(state, { kind: 'fight-early' });
    state = act(state, { kind: 'return' });
    expect(state.lastSettlement).toMatchObject({ outcome: 'secured', points: 27 });
    expect(state.lastSimulatedAt).toBe(92_000);
    expect(state.profile.discoveredClueIds).toEqual(['forest-signal']);
  });

  it('compares manual gathering with the faster zero-gather route after worker-change time', () => {
    let state = enter();
    for (let index = 0; index < 10; index += 1) {
      if (index > 0) state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 10_000);
      state = act(state, {
        kind: 'gather',
        resource: index < 7 ? 'wood' : 'stone',
      });
    }
    state = act(state, { kind: 'build', buildingId: 'shelter' });
    state = act(state, { kind: 'set-workers', presetId: 'guard' });
    state = act(state, { kind: 'fight-early' });
    state = act(state, { kind: 'fight-early' });
    expect(state.activeRun?.hp).toBe(53);
    state = act(state, { kind: 'return' });

    expect(state.lastSettlement).toMatchObject({ outcome: 'success', points: 26 });
    expect(state.lastSimulatedAt).toBe(110_000);
  });

  it('measures the harvest perk against two legitimately completed trips', () => {
    let state = createExpedition(DEFINITION, 0);
    for (let trip = 0; trip < 2; trip += 1) {
      state = act(state, { kind: 'enter-world', worldId: 'forest' });
      state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 72_000);
      state = act(state, { kind: 'build', buildingId: 'shelter' });
      state = act(state, { kind: 'set-workers', presetId: 'guard' });
      state = act(state, { kind: 'fight-early' });
      state = act(state, { kind: 'fight-early' });
      state = act(state, { kind: 'return' });
    }
    expect(state.profile.points).toBe(54);
    state = act(state, { kind: 'buy-perk', perkId: 'harvest-training' });
    state = act(state, { kind: 'enter-world', worldId: 'forest' });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 65_000);
    state = act(state, { kind: 'build', buildingId: 'shelter' });
    state = act(state, { kind: 'set-workers', presetId: 'guard' });
    state = act(state, { kind: 'fight-early' });
    state = act(state, { kind: 'fight-early' });
    expect(state.activeRun?.hp).toBe(53);
    state = act(state, { kind: 'return' });

    expect(state.lastSettlement).toMatchObject({ outcome: 'success', points: 27 });
    expect(state.lastSimulatedAt).toBe(269_000);
  });

  it('compares an evidence contract that exchanges three minutes for survey points and a clue', () => {
    let state = act(
      advanceExpedition(enter(DEFINITION, 'forest-survey-contract'), DEFINITION, 120_000),
      { kind: 'build', buildingId: 'shelter' },
    );
    state = act(state, { kind: 'fight-early' });
    state = act(state, {
      kind: 'choose-event',
      eventId: 'river-bridge',
      optionId: 'repair-crossing',
    });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 15_000);
    state = act(state, {
      kind: 'start-project',
      projectId: 'river-survey',
      workerRole: 'guard',
    });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 45_000);
    expect(state.activeRun?.completedProjectIds).toContain('river-survey');
    state = act(state, { kind: 'fight-early' });
    expect(state.activeRun?.hp).toBe(47);
    expect(state.activeRun?.resourceLedger.collected).toEqual({ wood: 0, stone: 0 });
    state = act(state, { kind: 'return' });

    expect(state.lastSettlement).toMatchObject({ outcome: 'success', points: 32 });
    expect(state.lastSimulatedAt).toBe(180_000);
    expect(state.profile.discoveredClueIds).toEqual(['forest-signal', 'forest-river-record']);
    expect(state.profile.completedObjectiveIds).toContain('forest-river-survey');
  });

  it('compares a production-investment route that survives a defended third-wave return', () => {
    let state = enter();
    state = act(state, { kind: 'choose-stance', stanceId: 'industry' });
    state = act(state, { kind: 'set-workers', presetId: 'mining' });
    state = advanceExpedition(state, DEFINITION, 60_000);
    state = act(state, { kind: 'gather', resource: 'wood' });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 1_000);
    state = act(state, { kind: 'build', buildingId: 'shelter' });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 80_000);
    state = act(state, { kind: 'build', buildingId: 'lumber-camp' });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 40_000);
    state = act(state, { kind: 'build', buildingId: 'wall' });
    state = act(state, { kind: 'set-workers', presetId: 'guard' });
    state = act(state, { kind: 'fight-wave' });

    state = act(state, { kind: 'set-workers', presetId: 'logging' });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 30_000);
    state = act(state, { kind: 'choose-beacon', optionId: 'salvage' });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 210_000);
    state = act(state, { kind: 'build', buildingId: 'tower' });
    state = act(state, { kind: 'build', buildingId: 'wall' });
    state = act(state, { kind: 'build', buildingId: 'wall' });
    state = act(state, { kind: 'set-workers', presetId: 'guard' });
    state = act(state, { kind: 'fight-wave' });

    state = act(state, { kind: 'set-workers', presetId: 'mining' });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 125_000);
    state = act(state, { kind: 'build', buildingId: 'monument' });
    state = advanceExpedition(state, DEFINITION, state.lastSimulatedAt + 25_000);
    state = act(state, { kind: 'set-workers', presetId: 'guard' });
    state = act(state, { kind: 'fight-early' });
    expect(state.activeRun?.hp).toBe(41);
    expect(state.activeRun?.resourceLedger.collected).toEqual({ wood: 1.5, stone: 0 });
    state = act(state, { kind: 'return' });

    expect(state.lastSettlement?.outcome).toBe('success');
    expect(state.lastSettlement?.rewards.map((reward) => reward.id)).toEqual([
      'base',
      'monument',
      'final-wave',
      'initiative',
    ]);
    expect(state.profile.discoveredClueIds).toEqual(['forest-signal']);
    expect(state.activeRun).toBeNull();
  });
});

describe('automatic camp decisions', () => {
  it('collects without clicks and trades production against defense while conserving four people', () => {
    const original = enter();
    const loggingShift = act(original, { kind: 'set-workers', presetId: 'logging' });
    const guardShift = act(original, { kind: 'set-workers', presetId: 'guard' });
    expect(loggingShift.activeRun?.workerTransition?.remainingMs).toBe(20_000);
    expect(getExpeditionSummary(loggingShift, DEFINITION)).toMatchObject({
      production: { wood: 0.08, stone: 0.04 },
      defense: 5,
    });
    const logging = advanceExpedition(loggingShift, DEFINITION, 20_000);
    const guard = advanceExpedition(guardShift, DEFINITION, 20_000);
    expect(getExpeditionSummary(logging, DEFINITION)).toMatchObject({
      production: { wood: 0.26, stone: 0.095 },
      defense: 5,
    });
    expect(getExpeditionSummary(guard, DEFINITION)).toMatchObject({
      production: { wood: 0.08, stone: 0.04 },
      defense: 17,
    });
    expect(advanceExpedition(logging, DEFINITION, 60_000).activeRun?.resources.wood).toBeCloseTo(
      20,
    );
    expect(original.activeRun?.workerPresetId).toBe('balanced');
    for (const preset of DEFINITION.workforce.presets)
      expect(preset.wood + preset.stone + preset.guard).toBe(4);
  });

  it('commits a once-per-run route, preventing a free production-to-defense switch before a battle', () => {
    const original = enter();
    const industry = act(original, { kind: 'choose-stance', stanceId: 'industry' });
    const fortified = act(original, { kind: 'choose-stance', stanceId: 'fortified' });
    expect(getExpeditionSummary(industry, DEFINITION).production.wood).toBeCloseTo(0.189);
    expect(getExpeditionSummary(fortified, DEFINITION).production.wood).toBeCloseTo(0.112);
    expect(getExpeditionSummary(industry, DEFINITION).defense).toBe(9);
    expect(getExpeditionSummary(fortified, DEFINITION).defense).toBe(13);
    expect(
      applyExpeditionCommand(industry, DEFINITION, {
        kind: 'choose-stance',
        stanceId: 'fortified',
      }),
    ).toMatchObject({ ok: false, state: industry });
    const fought = act(prepareCore(), { kind: 'fight-early' });
    expect(fought.activeRun?.stanceChosen).toBe(true);
    expect(
      applyExpeditionCommand(fought, DEFINITION, { kind: 'choose-stance', stanceId: 'industry' })
        .ok,
    ).toBe(false);
    expect(reload(industry)).toEqual(industry);
  });

  it('records actual admitted resources, payment and salvage without counting overflow as income', () => {
    const started = enter();
    const startingRun = started.activeRun;
    if (startingRun === null) throw new Error('Expected an active run');
    let state: SaveBundle = {
      ...started,
      activeRun: {
        ...startingRun,
        resources: { wood: 119, stone: 40 },
        resourceLedger: createResourceLedger({ wood: 119, stone: 40 }),
      },
    };
    state = act(state, { kind: 'gather', resource: 'wood' });
    expect(state.activeRun?.resources.wood).toBe(120);
    expect(state.activeRun?.resourceLedger.collected.wood).toBe(1);
    expect(
      applyExpeditionCommand(state, DEFINITION, { kind: 'gather', resource: 'stone' }),
    ).toMatchObject({ ok: false, error: 'COOLDOWN' });
    const capped = state.activeRun!;
    expect(
      capped.resourceLedger.opening.wood +
        capped.resourceLedger.produced.wood +
        capped.resourceLedger.collected.wood,
    ).toBeCloseTo(120);
    state = advanceExpedition(state, DEFINITION, 10_000);
    const onceMore = act(state, { kind: 'gather', resource: 'wood' });
    expect(onceMore.activeRun?.resourceLedger.collected.wood).toBe(
      capped.resourceLedger.collected.wood,
    );
    state = act(onceMore, { kind: 'build', buildingId: 'shelter' });
    expect(state.activeRun?.resourceLedger.spent).toEqual({ wood: 18, stone: 8 });
    state = act(state, { kind: 'fight-early' });
    const before = state.activeRun!.resources;
    state = act(state, { kind: 'choose-beacon', optionId: 'salvage' });
    expect(state.activeRun!.resourceLedger.found.wood).toBeCloseTo(
      state.activeRun!.resources.wood - before.wood,
    );
    expect(reload(state)).toEqual(state);
  });
});
