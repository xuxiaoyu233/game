import { describe, expect, it } from 'vitest';
import { createSkillPrototypeV2Definition } from '../../content/skill-prototype-v2';
import { advanceSkillLoop, applySkillLoopCommand, createNewSkillLoop } from './engine';
import type { SkillLoopCommand, SkillLoopDefinition, SkillLoopState } from './types';

const START = 1_000;

interface RouteState {
  readonly now: number;
  readonly switches: number;
  readonly state: SkillLoopState;
}

function command(
  state: SkillLoopState,
  definition: SkillLoopDefinition,
  value: SkillLoopCommand,
): SkillLoopState {
  const result = applySkillLoopCommand(state, definition, value);
  if (!result.ok) throw new Error(`Unexpected command rejection: ${value.kind}/${result.error}`);
  return result.state;
}

function runActivity(
  route: RouteState,
  definition: SkillLoopDefinition,
  activityId: string,
  cycles: number,
): RouteState {
  const activity = definition.activities.find((entry) => entry.id === activityId);
  if (activity === undefined) throw new Error(`Missing test activity: ${activityId}`);
  let state = route.state;
  const current = state.currentActivity;
  if (current?.activityId !== activityId || current.status !== 'running') {
    state = command(state, definition, {
      kind: current === null ? 'start-activity' : 'switch-activity',
      activityId,
    });
  }
  const tool = definition.tools.find((entry) => entry.skillId === activity.skillId);
  const toolLevel = tool?.levels.find((entry) => entry.level === state.toolLevels[tool.id]);
  const multiplier = toolLevel?.durationMultiplierPermille ?? 1_000;
  const duration = Math.ceil((activity.durationMs * multiplier) / 1_000);
  const now = route.now + duration * cycles;
  const advanced = advanceSkillLoop(state, definition, now);
  if (advanced.error !== undefined) throw new Error(`Unexpected advance error: ${advanced.error}`);
  expect(advanced.completedCycles).toBe(cycles);
  return {
    now,
    switches: route.switches + (current === null ? 0 : 1),
    state: advanced.state,
  };
}

function buyUpgrade(
  route: RouteState,
  definition: SkillLoopDefinition,
  upgradeId: string,
): RouteState {
  return {
    now: route.now,
    switches: route.switches,
    state: command(route.state, definition, { kind: 'buy-tool-upgrade', upgradeId }),
  };
}

function completeToolIIIRoute(skillFirst: boolean): RouteState {
  const definition = createSkillPrototypeV2Definition();
  let route: RouteState = {
    now: START,
    switches: 0,
    state: createNewSkillLoop(definition, START),
  };

  if (skillFirst) {
    route = runActivity(route, definition, 'mine-common-ore', 8);
    route = runActivity(route, definition, 'mine-rich-common-ore', 7);
  } else {
    route = runActivity(route, definition, 'mine-common-ore', 4);
    route = runActivity(route, definition, 'smelt-common-ingot', 2);
    route = runActivity(route, definition, 'forge-common-tool-blank', 1);
    route = buyUpgrade(route, definition, 'mining-tool-ii');
    route = runActivity(route, definition, 'mine-common-ore', 4);
    route = runActivity(route, definition, 'mine-rich-common-ore', 7);
  }

  if (skillFirst) {
    route = runActivity(route, definition, 'smelt-common-ingot', 2);
    route = runActivity(route, definition, 'forge-common-tool-blank', 1);
    route = buyUpgrade(route, definition, 'mining-tool-ii');
  }

  route = runActivity(route, definition, 'mine-advanced-ore', 2);
  route = runActivity(route, definition, 'smelt-common-ingot', 9);
  route = runActivity(route, definition, 'smelt-advanced-ingot', 1);
  route = runActivity(route, definition, 'forge-composite-tool-blank', 1);
  return buyUpgrade(route, definition, 'mining-tool-iii');
}

describe('skill-loop P2 progression', () => {
  it.each([
    { name: 'tool-first', skillFirst: false, expectedDuration: 231_800, expectedSwitches: 8 },
    { name: 'skill-first', skillFirst: true, expectedDuration: 252_200, expectedSwitches: 7 },
  ])(
    'reaches the same complete endpoint from zero via $name',
    ({ skillFirst, expectedDuration, expectedSwitches }) => {
      const definition = createSkillPrototypeV2Definition();
      const route = completeToolIIIRoute(skillFirst);
      expect(route.now - START).toBe(expectedDuration);
      expect(route.switches).toBe(expectedSwitches);
      expect(route.state.inventory).toEqual({
        'common-ore': 0,
        'common-ingot': 7,
        'common-tool-blank': 0,
        'advanced-ore': 0,
        'advanced-ingot': 0,
        'composite-tool-blank': 0,
      });
      expect(route.state.skillXp).toEqual({ mining: 44, metalworking: 70 });
      expect(route.state.toolLevels).toEqual({ 'mining-tool': 3 });

      const stopped = advanceSkillLoop(route.state, definition, route.now + 14_000);
      expect(stopped.state.currentActivity).toMatchObject({
        status: 'stopped',
        stopReason: 'insufficient-materials',
      });
      expect(stopped.state.inventory).toEqual(route.state.inventory);
    },
  );

  it('keeps producing materials without XP after the highest implemented thresholds', () => {
    const definition = createSkillPrototypeV2Definition();
    const atEndpoint = completeToolIIIRoute(true).state;
    let state = command(atEndpoint, definition, {
      kind: 'switch-activity',
      activityId: 'mine-advanced-ore',
    });
    state = advanceSkillLoop(state, definition, atEndpoint.lastSimulatedAt + 15_600).state;
    expect(state.inventory['advanced-ore']).toBe(2);
    expect(state.skillXp.mining).toBe(44);

    state = command(state, definition, {
      kind: 'switch-activity',
      activityId: 'forge-common-tool-blank',
    });
    state = advanceSkillLoop(state, definition, state.lastSimulatedAt + 30_000).state;
    expect(state.inventory['common-tool-blank']).toBe(3);
    expect(state.skillXp.metalworking).toBe(70);
  });
});
