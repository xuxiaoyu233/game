import type { SkillCapBehavior, SkillLoopDefinition } from '../domain/skill-loop/types';

/** P1 content only; the future advanced ore/ingot/composite recipe is kept in the library. */
export function createSkillPrototypeV1Definition(
  capBehavior: SkillCapBehavior,
): SkillLoopDefinition {
  const definition: SkillLoopDefinition = {
    profileId: 'skill-prototype-v1',
    schemaVersion: 1,
    contentVersion: '1.0.0',
    maxOfflineMs: 8 * 60 * 60 * 1_000,
    capBehavior,
    skills: [
      {
        id: 'mining',
        firstTierXpCap: 16,
        levels: [
          { level: 1, xpRequired: 0 },
          { level: 2, xpRequired: 16 },
        ],
      },
      {
        id: 'metalworking',
        firstTierXpCap: 16,
        levels: [
          { level: 1, xpRequired: 0 },
          { level: 2, xpRequired: 10 },
        ],
      },
    ],
    itemCategories: [
      { id: 'raw-material' },
      { id: 'processed-material' },
      { id: 'tool-component' },
    ],
    items: [
      { id: 'common-ore', categoryId: 'raw-material' },
      { id: 'common-ingot', categoryId: 'processed-material' },
      { id: 'common-tool-blank', categoryId: 'tool-component' },
    ],
    activities: [
      {
        id: 'mine-common-ore',
        skillId: 'mining',
        kind: 'gather',
        requiredLevel: 1,
        durationMs: 8_000,
        xpPerCycle: 2,
        outputs: [{ itemId: 'common-ore', amount: 1 }],
      },
      {
        id: 'mine-rich-common-ore',
        skillId: 'mining',
        kind: 'gather',
        requiredLevel: 2,
        durationMs: 10_000,
        xpPerCycle: 4,
        outputs: [{ itemId: 'common-ore', amount: 2 }],
      },
      {
        id: 'smelt-common-ingot',
        skillId: 'metalworking',
        kind: 'craft',
        requiredLevel: 1,
        durationMs: 6_000,
        xpPerCycle: 5,
        recipeId: 'recipe-common-ingot',
      },
      {
        id: 'forge-common-tool-blank',
        skillId: 'metalworking',
        kind: 'craft',
        requiredLevel: 2,
        durationMs: 10_000,
        xpPerCycle: 6,
        recipeId: 'recipe-common-tool-blank',
      },
    ],
    recipes: [
      {
        id: 'recipe-common-ingot',
        inputs: [{ itemId: 'common-ore', amount: 2 }],
        outputs: [{ itemId: 'common-ingot', amount: 1 }],
      },
      {
        id: 'recipe-common-tool-blank',
        inputs: [{ itemId: 'common-ingot', amount: 2 }],
        outputs: [{ itemId: 'common-tool-blank', amount: 1 }],
      },
    ],
    tools: [
      {
        id: 'mining-tool',
        skillId: 'mining',
        levels: [
          { level: 1, durationMultiplierPermille: 1_000 },
          { level: 2, durationMultiplierPermille: 800 },
        ],
      },
    ],
    toolUpgrades: [
      {
        id: 'mining-tool-ii',
        toolId: 'mining-tool',
        sourceLevel: 1,
        targetLevel: 2,
        requiredItemId: 'common-tool-blank',
        requiredAmount: 1,
      },
    ],
    initialInventory: { 'common-ore': 0, 'common-ingot': 0, 'common-tool-blank': 0 },
    initialSkillXp: { mining: 0, metalworking: 0 },
    initialToolLevels: { 'mining-tool': 1 },
  };
  return definition;
}
