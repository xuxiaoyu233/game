import { describe, expect, it } from 'vitest';
import { BASE_GAME_DEFINITION } from '../../../content/base-game';
import { EXPEDITION_V14_DEFINITION } from '../../../content/expedition-v14';
import {
  decodeExpeditionSave,
  encodeExpeditionSave,
} from '../../../persistence/legacy/expedition-codec';
import {
  advanceExpedition,
  applyExpeditionCommand,
  createExpedition,
  createResourceLedger,
  getExpeditionSummary,
} from './engine';
import type { ExpeditionCommand, SaveBundle } from './types';

const DEFINITION = EXPEDITION_V14_DEFINITION;
const WORLD_ID = 'world-unlisted-city';

function act(state: SaveBundle, command: ExpeditionCommand): SaveBundle {
  const result = applyExpeditionCommand(state, DEFINITION, command);
  if (!result.ok) throw new Error(`Unexpected v14 command rejection: ${result.error}`);
  return result.state;
}

describe('active v14 expedition baseline', () => {
  it('applies the selected difficulty snapshot and settles its reward exactly once', () => {
    const baseline = act(createExpedition(DEFINITION, 0), {
      kind: 'enter-world',
      worldId: WORLD_ID,
      seed: 0,
    });
    let selected = act(createExpedition(DEFINITION, 0), {
      kind: 'select-difficulty-modifiers',
      worldId: WORLD_ID,
      modifierIds: ['frozen-appropriation', 'early-tide', 'exposed-anchor'],
    });
    selected = act(selected, { kind: 'enter-world', worldId: WORLD_ID, seed: 0 });

    const baselineSummary = getExpeditionSummary(baseline, DEFINITION);
    const modifiedSummary = getExpeditionSummary(selected, DEFINITION);
    expect(modifiedSummary).toMatchObject({ difficultyScore: 5, difficultyReward: 12 });
    expect(modifiedSummary.stageRemainingMs).toBe(baselineSummary.stageRemainingMs * 0.8);
    expect(modifiedSummary.nextWaveStrength).toBeCloseTo(baselineSummary.nextWaveStrength * 1.15);
    expect(selected.activeRun?.resources).toEqual({ wood: 6, stone: 3 });

    const run = selected.activeRun;
    if (run === null) throw new Error('Expected an active v14 run');
    const readyToReturn: SaveBundle = {
      ...selected,
      activeRun: {
        ...run,
        phase: 'awaiting-wave',
        buildings: { ...run.buildings, shelter: 1 },
        clearedWaves: 2,
      },
    };
    const withFixedEvent = act(readyToReturn, {
      kind: 'choose-event',
      eventId: 'event-anchor-tower-failure',
      optionId: 'option-repair-main-anchor',
    });
    const returned = act(withFixedEvent, { kind: 'return' });
    expect(returned.lastSettlement?.rewards.filter((reward) => reward.id === 'difficulty')).toEqual(
      [{ id: 'difficulty', points: 12 }],
    );
    expect(returned.profile.points).toBe(24);
    expect(applyExpeditionCommand(returned, DEFINITION, { kind: 'return' })).toMatchObject({
      ok: false,
      state: returned,
    });
  });

  it('keeps early-battle forecasts exact and the selected random event visible after saving', () => {
    let state = act(createExpedition(DEFINITION, 0), {
      kind: 'enter-world',
      worldId: WORLD_ID,
      seed: 0,
    });
    const firstRun = state.activeRun;
    if (firstRun === null) throw new Error('Expected an active v14 run');
    const settlementResources = { wood: 100, stone: 100 };
    state = {
      ...state,
      activeRun: {
        ...firstRun,
        phase: 'awaiting-wave',
        resources: settlementResources,
        resourceLedger: createResourceLedger(settlementResources),
        buildings: { ...firstRun.buildings, shelter: 1 },
        clearedWaves: 2,
      },
    };
    state = act(state, {
      kind: 'choose-event',
      eventId: 'event-anchor-tower-failure',
      optionId: 'option-repair-main-anchor',
    });
    state = act(state, { kind: 'return' });
    state = act(state, {
      kind: 'enter-world',
      worldId: WORLD_ID,
      contractId: 'contract-audit-missing-district',
      seed: 0,
    });

    const auditRun = state.activeRun;
    if (auditRun === null) throw new Error('Expected an active v14 audit run');
    const resources = { wood: 100, stone: 100 };
    state = {
      ...state,
      activeRun: {
        ...auditRun,
        resources,
        resourceLedger: createResourceLedger(resources),
        buildings: { ...auditRun.buildings, shelter: 1 },
      },
    };
    state = advanceExpedition(state, DEFINITION, 72_000);
    const preview = getExpeditionSummary(state, DEFINITION);
    expect(preview.canFightEarly).toBe(true);
    state = act(state, { kind: 'fight-early' });
    expect(state.activeRun?.lastBattle?.damage).toBe(preview.earlyPredictedDamage);
    expect(state.activeRun?.anchorCityState?.stability).toBe(78);

    const pendingId = state.activeRun?.randomEventId;
    if (pendingId === null || pendingId === undefined)
      throw new Error('Expected the seeded v14 incident to remain on the active run');
    expect(pendingId).toBe('event-unlit-house-call');
    const restored = decodeExpeditionSave(
      encodeExpeditionSave(state),
      DEFINITION,
      BASE_GAME_DEFINITION,
    );
    const pending = getExpeditionSummary(restored, DEFINITION).pendingEvents;
    expect(pending.map((event) => event.id)).toContain(pendingId);
    const pendingEvent = pending.find((event) => event.id === pendingId);
    const fixedChoice = pendingEvent?.options.find((option) => option.id === 'option-salvage-cell');
    if (fixedChoice === undefined)
      throw new Error('Expected the fixed fallback for the selected v14 incident');

    const beforeWood = restored.activeRun?.resources.wood ?? 0;
    const resolved = act(restored, {
      kind: 'choose-event',
      eventId: pendingId,
      optionId: fixedChoice.id,
    });
    expect(resolved.activeRun?.resources.wood).toBe(beforeWood + 6);
    expect(resolved.activeRun?.eventChoices[pendingId]).toBe(fixedChoice.id);
    expect(
      getExpeditionSummary(resolved, DEFINITION).pendingEvents.map((event) => event.id),
    ).not.toContain(pendingId);
  });

  it('spends a crafted barrier kit to restore anchor stability and preserves the result in saves', () => {
    let state = act(createExpedition(DEFINITION, 0), {
      kind: 'enter-world',
      worldId: WORLD_ID,
      seed: 0,
    });
    const run = state.activeRun;
    const outpost = state.outpost;
    if (run === null || outpost === null) throw new Error('Expected an active v14 run and outpost');
    state = {
      ...state,
      activeRun: {
        ...run,
        anchorCityState: { stability: 56 },
      },
      outpost: {
        ...outpost,
        resources: { ...outpost.resources, 'barrier-kit': 1 },
      },
    };

    const reinforced = act(state, { kind: 'reinforce-anchor' });
    expect(reinforced.activeRun?.anchorCityState?.stability).toBe(74);
    expect(reinforced.outpost?.resources['barrier-kit']).toBe(0);
    const restored = decodeExpeditionSave(
      encodeExpeditionSave(reinforced),
      DEFINITION,
      BASE_GAME_DEFINITION,
    );
    expect(restored.activeRun?.anchorCityState?.stability).toBe(74);
    expect(restored.outpost?.resources['barrier-kit']).toBe(0);
  });

  it('does not consume a barrier kit when the anchor is full or the outpost lacks one', () => {
    let state = act(createExpedition(DEFINITION, 0), {
      kind: 'enter-world',
      worldId: WORLD_ID,
      seed: 0,
    });
    const run = state.activeRun;
    const outpost = state.outpost;
    if (run === null || outpost === null) throw new Error('Expected an active v14 run and outpost');
    state = {
      ...state,
      activeRun: { ...run, anchorCityState: { stability: 100 } },
      outpost: { ...outpost, resources: { ...outpost.resources, 'barrier-kit': 1 } },
    };
    expect(applyExpeditionCommand(state, DEFINITION, { kind: 'reinforce-anchor' })).toMatchObject({
      ok: false,
      error: 'ANCHOR_STABLE',
      state,
    });

    state = {
      ...state,
      activeRun: { ...run, anchorCityState: { stability: 56 } },
      outpost: {
        ...outpost,
        resources: { ...outpost.resources, 'barrier-kit': 0 },
      },
    };
    expect(applyExpeditionCommand(state, DEFINITION, { kind: 'reinforce-anchor' })).toMatchObject({
      ok: false,
      error: 'OUTPOST_RESOURCES',
      state,
    });
  });
});
