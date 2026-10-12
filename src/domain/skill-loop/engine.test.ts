import { describe, expect, it } from 'vitest';
import { createSkillPrototypeV1Definition } from '../../content/skill-prototype-v1';
import { decodeSkillLoopSave, encodeSkillLoopSave } from '../../persistence/skill-loop-codec';
import { advanceSkillLoop, applySkillLoopCommand, createNewSkillLoop } from './engine';
import { validateSkillLoopDefinition } from './validation';
import type { SkillLoopDefinition, SkillLoopState } from './types';

const START = 1_000;

function setup() {
  const definition = createSkillPrototypeV1Definition();
  validateSkillLoopDefinition(definition);
  return { definition, state: createNewSkillLoop(definition, START) };
}

function completeFirstTier(): SkillLoopState {
  const { definition, state: initial } = setup();
  const mining = applySkillLoopCommand(initial, definition, {
    kind: 'start-activity',
    activityId: 'mine-common-ore',
  });
  if (!mining.ok) throw new Error(`Could not start mining: ${mining.error}`);
  let state = advanceSkillLoop(mining.state, definition, START + 32_000).state;
  const smelting = applySkillLoopCommand(state, definition, {
    kind: 'switch-activity',
    activityId: 'smelt-common-ingot',
  });
  if (!smelting.ok) throw new Error(`Could not start smelting: ${smelting.error}`);
  state = advanceSkillLoop(smelting.state, definition, START + 44_000).state;
  const forging = applySkillLoopCommand(state, definition, {
    kind: 'switch-activity',
    activityId: 'forge-common-tool-blank',
  });
  if (!forging.ok) throw new Error(`Could not start forging: ${forging.error}`);
  state = advanceSkillLoop(forging.state, definition, START + 54_000).state;
  const upgraded = applySkillLoopCommand(state, definition, {
    kind: 'buy-tool-upgrade',
    upgradeId: 'mining-tool-ii',
  });
  if (!upgraded.ok) throw new Error(`Could not buy Tool II: ${upgraded.error}`);
  return upgraded.state;
}

describe('skill-loop P1 rules', () => {
  it('validates the frozen finite first-tier content snapshot', () => {
    const { definition } = setup();
    expect(definition.activities.map((activity) => activity.id)).toEqual([
      'mine-common-ore',
      'mine-rich-common-ore',
      'smelt-common-ingot',
      'forge-common-tool-blank',
    ]);
  });

  it('rejects a tool level without an upgrade route', () => {
    const { definition } = setup();
    const unreachableTool: SkillLoopDefinition = {
      ...definition,
      tools: [
        {
          ...definition.tools[0]!,
          levels: [...definition.tools[0]!.levels, { level: 3, durationMultiplierPermille: 600 }],
        },
      ],
    };
    expect(() => validateSkillLoopDefinition(unreachableTool)).toThrow(
      'Tool level has no upgrade route',
    );
  });

  it('reaches Mining Tool II from a true zero-material save', () => {
    const state = completeFirstTier();
    expect(state.inventory).toEqual({
      'common-ore': 0,
      'common-ingot': 0,
      'common-tool-blank': 0,
    });
    expect(state.toolLevels['mining-tool']).toBe(2);
    expect(state.skillXp.mining).toBe(8);
    expect(state.skillXp.metalworking).toBe(10);
  });

  it('keeps the valid activity and all materials when a switch lacks inputs', () => {
    const { definition, state: initial } = setup();
    const started = applySkillLoopCommand(initial, definition, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    if (!started.ok) throw new Error('Initial mining should be available');
    const rejected = applySkillLoopCommand(started.state, definition, {
      kind: 'switch-activity',
      activityId: 'forge-common-tool-blank',
    });
    expect(rejected).toEqual({ ok: false, state: started.state, error: 'LOCKED' });
    expect(rejected.state.currentActivity?.activityId).toBe('mine-common-ore');
    expect(rejected.state.inventory).toEqual(initial.inventory);
  });

  it('does not award half a cycle when a craft is short of materials', () => {
    const { definition, state } = setup();
    const oneOre = { ...state, inventory: { ...state.inventory, 'common-ore': 1 } };
    const rejected = applySkillLoopCommand(oneOre, definition, {
      kind: 'start-activity',
      activityId: 'smelt-common-ingot',
    });
    expect(rejected).toEqual({ ok: false, state: oneOre, error: 'INSUFFICIENT_RESOURCES' });
    expect(rejected.state.skillXp.metalworking).toBe(0);
    expect(rejected.state.inventory['common-ore']).toBe(1);
  });

  it('applies Tool II only to the next complete mining cycle', () => {
    const { definition } = setup();
    let state = createNewSkillLoop(definition, START);
    state = { ...state, inventory: { ...state.inventory, 'common-tool-blank': 1 } };
    const started = applySkillLoopCommand(state, definition, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    if (!started.ok) throw new Error('Initial mining should be available');
    state = advanceSkillLoop(started.state, definition, START + 3_000).state;
    const upgraded = applySkillLoopCommand(state, definition, {
      kind: 'buy-tool-upgrade',
      upgradeId: 'mining-tool-ii',
    });
    if (!upgraded.ok) throw new Error('Tool II should be affordable');
    expect(upgraded.state.currentActivity?.cycleDurationMs).toBe(8_000);
    state = advanceSkillLoop(upgraded.state, definition, START + 8_000).state;
    expect(state.inventory['common-ore']).toBe(1);
    expect(state.currentActivity?.cycleDurationMs).toBe(6_400);
    state = advanceSkillLoop(state, definition, START + 14_400).state;
    expect(state.inventory['common-ore']).toBe(2);
  });

  it('uses Tool II when the upgrade lands exactly at a cycle boundary', () => {
    const { definition } = setup();
    let state = createNewSkillLoop(definition, START);
    state = { ...state, inventory: { ...state.inventory, 'common-tool-blank': 1 } };
    const started = applySkillLoopCommand(state, definition, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    if (!started.ok) throw new Error('Initial mining should be available');
    state = advanceSkillLoop(started.state, definition, START + 8_000).state;
    expect(state.currentActivity?.progressMs).toBe(0);
    expect(state.currentActivity?.cycleDurationMs).toBe(8_000);
    const upgraded = applySkillLoopCommand(state, definition, {
      kind: 'buy-tool-upgrade',
      upgradeId: 'mining-tool-ii',
    });
    if (!upgraded.ok) throw new Error('Tool II should be affordable');
    expect(upgraded.state.inventory['common-ore']).toBe(1);
    expect(upgraded.state.currentActivity?.cycleDurationMs).toBe(6_400);
  });

  it('preserves paused progress while discarding the offline interval', () => {
    const { definition, state: initial } = setup();
    const started = applySkillLoopCommand(initial, definition, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    if (!started.ok) throw new Error('Initial mining should be available');
    const partial = advanceSkillLoop(started.state, definition, START + 3_000).state;
    const paused = applySkillLoopCommand(partial, definition, { kind: 'pause-activity' });
    if (!paused.ok) throw new Error('Running activity should pause');
    const offline = advanceSkillLoop(
      paused.state,
      definition,
      START + 3_000 + 7 * 60 * 60 * 1_000,
    ).state;
    const resumed = applySkillLoopCommand(offline, definition, { kind: 'resume-activity' });
    if (!resumed.ok) throw new Error('Paused activity should resume');
    const completed = advanceSkillLoop(
      resumed.state,
      definition,
      START + 3_000 + 7 * 60 * 60 * 1_000 + 5_000,
    ).state;
    expect(completed.inventory['common-ore']).toBe(1);
    expect(completed.skillXp.mining).toBe(2);
  });

  it('matches a long online advance with equivalent short advances', () => {
    const { definition, state: initial } = setup();
    const started = applySkillLoopCommand(initial, definition, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    if (!started.ok) throw new Error('Initial mining should be available');
    const long = advanceSkillLoop(started.state, definition, START + 3 * 60 * 60 * 1_000).state;
    let short = started.state;
    for (let step = 1; step <= 21_600; step += 1)
      short = advanceSkillLoop(short, definition, START + step * 500).state;
    expect(long.inventory).toEqual(short.inventory);
    expect(long.skillXp).toEqual(short.skillXp);
    expect(long.currentActivity).toEqual(short.currentActivity);
    expect(long.lastSimulatedAt).toBe(short.lastSimulatedAt);
  });

  it('credits one offline gap only up to the configured limit', () => {
    const { definition, state: initial } = setup();
    const started = applySkillLoopCommand(initial, definition, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    if (!started.ok) throw new Error('Initial mining should be available');
    const offline = advanceSkillLoop(started.state, definition, START + 12 * 60 * 60 * 1_000);
    expect(offline.creditedMs).toBe(8 * 60 * 60 * 1_000);
    expect(offline.state.inventory['common-ore']).toBe(3_600);
    const immediateRetry = advanceSkillLoop(
      offline.state,
      definition,
      offline.state.lastSimulatedAt + 1_000,
    );
    expect(immediateRetry.state.inventory['common-ore']).toBe(3_600);
  });

  it('rejects legacy and wrong-version saves without silently migrating them', () => {
    const { definition } = setup();
    const legacy = JSON.stringify({ schemaVersion: 9, contentVersion: '14.0.0', worldId: 'old' });
    expect(() => decodeSkillLoopSave(legacy, definition)).toThrow('profile 或格式版本不兼容');
    const current = completeFirstTier();
    expect(() =>
      decodeSkillLoopSave(encodeSkillLoopSave(current), {
        ...definition,
        contentVersion: '1.0.1',
      }),
    ).toThrow('机械内容版本不兼容');
  });

  it('round-trips the active cycle and rejects impossible running craft state', () => {
    const { definition, state: initial } = setup();
    const started = applySkillLoopCommand(initial, definition, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    if (!started.ok) throw new Error('Initial mining should be available');
    const partial = advanceSkillLoop(started.state, definition, START + 3_000).state;
    expect(decodeSkillLoopSave(encodeSkillLoopSave(partial), definition)).toEqual(partial);
    const impossible = {
      ...partial,
      skillXp: { ...partial.skillXp, metalworking: 10 },
      currentActivity: {
        activityId: 'forge-common-tool-blank',
        status: 'running',
        progressMs: 0,
        cycleDurationMs: 10_000,
        stopReason: null,
      },
    };
    expect(() => decodeSkillLoopSave(JSON.stringify(impossible), definition)).toThrow(
      '缺少完整材料',
    );
  });

  it('rejects locked activity snapshots and stop reasons that cannot arise from rules', () => {
    const { definition, state } = setup();
    const lockedActivity = {
      ...state,
      currentActivity: {
        activityId: 'mine-rich-common-ore',
        status: 'running',
        progressMs: 0,
        cycleDurationMs: 10_000,
        stopReason: null,
      },
    };
    expect(() => decodeSkillLoopSave(JSON.stringify(lockedActivity), definition)).toThrow(
      '尚未解锁',
    );

    const pausedCraftWithoutInputs = {
      ...state,
      skillXp: { ...state.skillXp, metalworking: 10 },
      currentActivity: {
        activityId: 'forge-common-tool-blank',
        status: 'paused',
        progressMs: 0,
        cycleDurationMs: 10_000,
        stopReason: null,
      },
    };
    expect(() => decodeSkillLoopSave(JSON.stringify(pausedCraftWithoutInputs), definition)).toThrow(
      '运行或暂停中的制作活动缺少完整材料',
    );

    const impossibleGatherStop = {
      ...state,
      currentActivity: {
        activityId: 'mine-common-ore',
        status: 'stopped',
        progressMs: 0,
        cycleDurationMs: 8_000,
        stopReason: 'insufficient-materials',
      },
    };
    expect(() => decodeSkillLoopSave(JSON.stringify(impossibleGatherStop), definition)).toThrow(
      '采集活动不能因材料不足而停止',
    );
  });
});
