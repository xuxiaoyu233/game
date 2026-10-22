import type { SkillLoopDefinition } from '../domain/skill-loop/types';
import { createSkillPrototypeV1Definition } from './skill-prototype-v1';

/** P2 content extends the frozen, shipped P1 IDs with the second production tier. */
export function createSkillPrototypeV2Definition(): SkillLoopDefinition {
  const firstTier = createSkillPrototypeV1Definition();
  return {
    ...firstTier,
    schemaVersion: 2,
    contentVersion: '2.0.0',
    skills: [
      {
        id: 'mining',
        levels: [
          { level: 1, xpRequired: 0 },
          { level: 2, xpRequired: 16 },
          { level: 3, xpRequired: 44 },
        ],
      },
      {
        id: 'metalworking',
        levels: [
          { level: 1, xpRequired: 0 },
          { level: 2, xpRequired: 10 },
          { level: 3, xpRequired: 30 },
          { level: 4, xpRequired: 70 },
        ],
      },
    ],
    items: [
      ...firstTier.items,
      { id: 'advanced-ore', categoryId: 'raw-material' },
      { id: 'advanced-ingot', categoryId: 'processed-material' },
      { id: 'composite-tool-blank', categoryId: 'tool-component' },
    ],
    activities: [
      ...firstTier.activities,
      {
        id: 'mine-advanced-ore',
        skillId: 'mining',
        kind: 'gather',
        requiredLevel: 3,
        durationMs: 12_000,
        xpPerCycle: 4,
        outputs: [{ itemId: 'advanced-ore', amount: 1 }],
      },
      {
        id: 'smelt-advanced-ingot',
        skillId: 'metalworking',
        kind: 'craft',
        requiredLevel: 3,
        durationMs: 9_000,
        xpPerCycle: 10,
        recipeId: 'recipe-advanced-ingot',
      },
      {
        id: 'forge-composite-tool-blank',
        skillId: 'metalworking',
        kind: 'craft',
        requiredLevel: 4,
        durationMs: 14_000,
        xpPerCycle: 14,
        recipeId: 'recipe-composite-tool-blank',
      },
    ],
    recipes: [
      ...firstTier.recipes,
      {
        id: 'recipe-advanced-ingot',
        inputs: [{ itemId: 'advanced-ore', amount: 2 }],
        outputs: [{ itemId: 'advanced-ingot', amount: 1 }],
      },
      {
        id: 'recipe-composite-tool-blank',
        inputs: [
          { itemId: 'common-ingot', amount: 2 },
          { itemId: 'advanced-ingot', amount: 1 },
        ],
        outputs: [{ itemId: 'composite-tool-blank', amount: 1 }],
      },
    ],
    tools: [
      {
        id: 'mining-tool',
        skillId: 'mining',
        levels: [
          { level: 1, durationMultiplierPermille: 1_000 },
          { level: 2, durationMultiplierPermille: 800 },
          { level: 3, durationMultiplierPermille: 650 },
        ],
      },
    ],
    toolUpgrades: [
      ...firstTier.toolUpgrades,
      {
        id: 'mining-tool-iii',
        toolId: 'mining-tool',
        sourceLevel: 2,
        targetLevel: 3,
        requiredItemId: 'composite-tool-blank',
        requiredAmount: 1,
      },
    ],
    initialInventory: {
      ...firstTier.initialInventory,
      'advanced-ore': 0,
      'advanced-ingot': 0,
      'composite-tool-blank': 0,
    },
  };
}
