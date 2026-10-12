import { describe, expect, it } from 'vitest';
import { createSkillPrototypeV2Definition } from './skill-prototype-v2';
import { validateSkillLoopDefinition } from '../domain/skill-loop/validation';
import {
  SKILL_PROTOTYPE_V1_THEME,
  validateSkillPrototypeV1Theme,
} from '../themes/skill-prototype-v1';

describe('skill prototype P2 content', () => {
  it('has complete themes and an acyclic, reachable two-tier production chain', () => {
    const definition = createSkillPrototypeV2Definition();
    validateSkillLoopDefinition(definition);
    validateSkillPrototypeV1Theme(definition, SKILL_PROTOTYPE_V1_THEME);

    expect(definition.contentVersion).toBe('2.0.0');
    expect(definition.skills.map((skill) => skill.levels.at(-1)?.xpRequired)).toEqual([44, 70]);
    expect(definition.items.map((item) => item.id)).toEqual([
      'common-ore',
      'common-ingot',
      'common-tool-blank',
      'advanced-ore',
      'advanced-ingot',
      'composite-tool-blank',
    ]);
    expect(definition.toolUpgrades.map((upgrade) => upgrade.id)).toEqual([
      'mining-tool-ii',
      'mining-tool-iii',
    ]);
  });
});
