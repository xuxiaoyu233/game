import { describe, expect, it } from 'vitest';
import { getSkillLoopSummary } from './engine';
import { getPrototypeCompletion } from './progress';
import type { SkillLoopDefinition, SkillLoopState } from './types';

const definition: SkillLoopDefinition = {
  profileId: 'skill-prototype-v1',
  schemaVersion: 3,
  contentVersion: 'test-only',
  maxOfflineMs: 8 * 3_600_000,
  skills: [
    {
      id: 'alpha',
      levels: [
        { level: 1, xpRequired: 0 },
        { level: 2, xpRequired: 100 },
        { level: 3, xpRequired: 300 },
      ],
    },
  ],
  itemCategories: [],
  items: [],
  activities: [],
  recipes: [],
  tools: [
    {
      id: 'alpha-tool',
      skillId: 'alpha',
      levels: [
        { level: 1, durationMultiplierPermille: 1_000 },
        { level: 2, durationMultiplierPermille: 800 },
      ],
    },
  ],
  toolUpgrades: [],
  initialInventory: {},
  initialSkillXp: {},
  initialToolLevels: {},
};

function stateAt(skillXp: number, toolLevel: number): SkillLoopState {
  return {
    schemaVersion: 3,
    profileId: 'skill-prototype-v1',
    contentVersion: 'test-only',
    inventory: {},
    skillXp: { alpha: skillXp },
    toolLevels: { 'alpha-tool': toolLevel },
    currentActivity: null,
    lastSimulatedAt: 0,
    returnReport: null,
    buffs: [],
  };
}

describe('getPrototypeCompletion', () => {
  it('starts at zero with no XP and baseline tools', () => {
    expect(getPrototypeCompletion(stateAt(0, 1), definition).percent).toBe(0);
  });

  it('reaches 100 only when skills are capped and tools are maxed', () => {
    expect(getPrototypeCompletion(stateAt(300, 2), definition).percent).toBe(100);
    expect(getPrototypeCompletion(stateAt(300, 1), definition).percent).toBe(50);
    expect(getPrototypeCompletion(stateAt(150, 2), definition).percent).toBe(75);
  });

  it('agrees with the summary completion flag at both ends', () => {
    for (const candidate of [stateAt(0, 1), stateAt(300, 2), stateAt(300, 1)]) {
      const summary = getSkillLoopSummary(candidate, definition);
      const completion = getPrototypeCompletion(candidate, definition);
      expect(completion.percent >= 100).toBe(summary.prototypeComplete);
    }
  });
});
