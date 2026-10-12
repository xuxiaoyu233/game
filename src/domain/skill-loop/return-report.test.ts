import { describe, expect, it } from 'vitest';
import { createSkillPrototypeV2Definition } from '../../content/skill-prototype-v2';
import { advanceSkillLoop, applySkillLoopCommand, createNewSkillLoop } from './engine';
import { captureSkillLoopReturnReport } from './return-report';

const START = 1_000;

describe('skill-loop return report', () => {
  it('summarizes a long gather, caps its settlement window, and never changes production rules', () => {
    const definition = createSkillPrototypeV2Definition();
    const created = createNewSkillLoop(definition, START);
    const started = applySkillLoopCommand(created, definition, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    if (!started.ok) throw new Error('Initial mining should be available');

    const oneStep = advanceSkillLoop(
      started.state,
      definition,
      START + definition.maxOfflineMs + 60 * 60 * 1_000,
    ).state;
    const withinCap = [
      START + 2 * 60 * 60 * 1_000,
      START + 4 * 60 * 60 * 1_000,
      START + 6 * 60 * 60 * 1_000,
      START + definition.maxOfflineMs,
    ].reduce((state, now) => advanceSkillLoop(state, definition, now).state, started.state);

    expect(withinCap.inventory).toEqual(oneStep.inventory);
    expect(withinCap.skillXp).toEqual(oneStep.skillXp);
    expect(oneStep.lastSimulatedAt - started.state.lastSimulatedAt).toBe(
      definition.maxOfflineMs + 60 * 60 * 1_000,
    );
    expect(withinCap.lastSimulatedAt - started.state.lastSimulatedAt).toBe(definition.maxOfflineMs);
    expect(oneStep.inventory['common-ore']).toBe(3_600);
    expect(oneStep.skillXp.mining).toBe(44);

    const returned = captureSkillLoopReturnReport(started.state, oneStep, definition);
    expect(returned.returnReport).toMatchObject({
      elapsedMs: definition.maxOfflineMs + 60 * 60 * 1_000,
      settlementWindowMs: definition.maxOfflineMs,
      offlineCapReached: true,
      activityId: 'mine-common-ore',
      reason: 'continuing',
      inventoryDelta: { 'common-ore': 3_600 },
      skillXpDelta: { mining: 44 },
      unlockedActivityIds: ['mine-rich-common-ore', 'mine-advanced-ore'],
    });
    expect(returned.inventory).toEqual(oneStep.inventory);
    expect(returned.skillXp).toEqual(oneStep.skillXp);
    expect(returned.lastSimulatedAt).toBe(oneStep.lastSimulatedAt);
  });

  it('reports prepared production and the material stop without switching activities', () => {
    const definition = createSkillPrototypeV2Definition();
    const created = createNewSkillLoop(definition, START);
    const prepared = {
      ...created,
      inventory: { ...created.inventory, 'common-ore': 4 },
    };
    const started = applySkillLoopCommand(prepared, definition, {
      kind: 'start-activity',
      activityId: 'smelt-common-ingot',
    });
    if (!started.ok) throw new Error('Prepared smelting should start');
    const advanced = advanceSkillLoop(started.state, definition, START + 60 * 60 * 1_000).state;
    const returned = captureSkillLoopReturnReport(started.state, advanced, definition);

    expect(advanced.currentActivity).toMatchObject({
      activityId: 'smelt-common-ingot',
      status: 'stopped',
      stopReason: 'insufficient-materials',
    });
    expect(returned.returnReport).toMatchObject({
      reason: 'insufficient-materials',
      activityId: 'smelt-common-ingot',
      inventoryDelta: { 'common-ore': -4, 'common-ingot': 2 },
      skillXpDelta: { metalworking: 10 },
    });
    expect(advanced.currentActivity?.activityId).toBe('smelt-common-ingot');
  });

  it('accumulates later settlements into an unconfirmed report without re-awarding them', () => {
    const definition = createSkillPrototypeV2Definition();
    const created = createNewSkillLoop(definition, START);
    const started = applySkillLoopCommand(created, definition, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    if (!started.ok) throw new Error('Initial mining should be available');
    const firstAdvanced = advanceSkillLoop(started.state, definition, START + 8_000).state;
    const firstReturn = captureSkillLoopReturnReport(started.state, firstAdvanced, definition);
    const secondAdvanced = advanceSkillLoop(firstReturn, definition, START + 16_000).state;
    const secondReturn = captureSkillLoopReturnReport(firstReturn, secondAdvanced, definition);

    expect(secondReturn.inventory['common-ore']).toBe(2);
    expect(secondReturn.skillXp.mining).toBe(4);
    expect(secondReturn.returnReport).toMatchObject({
      elapsedMs: 16_000,
      settlementWindowMs: 16_000,
      inventoryDelta: { 'common-ore': 2 },
      skillXpDelta: { mining: 4 },
    });
  });

  it('preserves a paused activity and creates no empty reward summary', () => {
    const definition = createSkillPrototypeV2Definition();
    const created = createNewSkillLoop(definition, START);
    const started = applySkillLoopCommand(created, definition, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    if (!started.ok) throw new Error('Initial mining should be available');
    const paused = applySkillLoopCommand(started.state, definition, { kind: 'pause-activity' });
    if (!paused.ok) throw new Error('Mining should pause');
    const advanced = advanceSkillLoop(paused.state, definition, START + 60 * 60 * 1_000).state;
    const returned = captureSkillLoopReturnReport(paused.state, advanced, definition);

    expect(returned.currentActivity).toMatchObject({ status: 'paused', progressMs: 0 });
    expect(returned.inventory).toEqual(paused.state.inventory);
    expect(returned.skillXp).toEqual(paused.state.skillXp);
    expect(returned.returnReport).toBeNull();
  });

  it('acknowledgement clears only the report and repeated confirmation is idempotent', () => {
    const definition = createSkillPrototypeV2Definition();
    const created = createNewSkillLoop(definition, START);
    const state = {
      ...created,
      inventory: { ...created.inventory, 'common-ore': 5 },
      returnReport: {
        elapsedMs: 1_000,
        settlementWindowMs: 1_000,
        offlineCapReached: false,
        activityId: null,
        reason: 'no-activity' as const,
        inventoryDelta: Object.fromEntries(definition.items.map((item) => [item.id, 0])),
        skillXpDelta: Object.fromEntries(definition.skills.map((skill) => [skill.id, 0])),
        unlockedActivityIds: [],
      },
    };

    const first = applySkillLoopCommand(state, definition, { kind: 'acknowledge-return-report' });
    if (!first.ok) throw new Error('Report acknowledgement should be accepted');
    const repeated = applySkillLoopCommand(first.state, definition, {
      kind: 'acknowledge-return-report',
    });
    if (!repeated.ok) throw new Error('Repeated report acknowledgement should be accepted');

    expect(first.state.returnReport).toBeNull();
    expect(repeated.state).toBe(first.state);
    expect(first.state.inventory).toEqual(state.inventory);
    expect(first.state.skillXp).toEqual(state.skillXp);
  });
});
