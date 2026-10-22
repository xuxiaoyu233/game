import type { SkillLoopDefinition } from '../domain/skill-loop/types';
import { createSkillPrototypeV2Definition } from './skill-prototype-v2';

/**
 * Content 3.0.0 extends the shipped two-tier mining/metalworking slice with five more
 * skills and the first repeatable consumer: woodcutting, fishing, firemaking, cooking and
 * crafting feed cross-skill material flow (logs -> charcoal -> cooked fish; logs -> handles
 * -> per-skill tools). Cooked fish is a timed activity-speed buff; charcoal extends the
 * offline settlement cap from stock. All of it is data plus the two minimal rule hooks
 * (`consume` command, `offlineFuel`); no second engine or state source.
 */
export function createSkillPrototypeV3Definition(): SkillLoopDefinition {
  const secondTier = createSkillPrototypeV2Definition();
  return {
    ...secondTier,
    schemaVersion: 3,
    contentVersion: '3.0.0',
    skills: [
      ...secondTier.skills,
      {
        id: 'woodcutting',
        levels: [
          { level: 1, xpRequired: 0 },
          { level: 2, xpRequired: 12 },
        ],
      },
      {
        id: 'fishing',
        levels: [
          { level: 1, xpRequired: 0 },
          { level: 2, xpRequired: 14 },
        ],
      },
      {
        id: 'firemaking',
        levels: [
          { level: 1, xpRequired: 0 },
          { level: 2, xpRequired: 18 },
        ],
      },
      {
        id: 'cooking',
        levels: [
          { level: 1, xpRequired: 0 },
          { level: 2, xpRequired: 20 },
        ],
      },
      {
        id: 'crafting',
        levels: [
          { level: 1, xpRequired: 0 },
          { level: 2, xpRequired: 24 },
        ],
      },
    ],
    itemCategories: [...secondTier.itemCategories, { id: 'fuel' }, { id: 'consumable' }],
    items: [
      ...secondTier.items,
      { id: 'wood-log', categoryId: 'raw-material' },
      { id: 'hardwood', categoryId: 'raw-material' },
      { id: 'wood-charcoal', categoryId: 'fuel' },
      { id: 'raw-fish', categoryId: 'raw-material' },
      {
        id: 'cooked-fish',
        categoryId: 'consumable',
        consumable: { speedMultiplierPermille: 1_150, durationMs: 30 * 60 * 1_000 },
      },
      { id: 'wood-handle', categoryId: 'tool-component' },
      { id: 'reinforced-handle', categoryId: 'tool-component' },
    ],
    activities: [
      ...secondTier.activities,
      {
        id: 'chop-wood-log',
        skillId: 'woodcutting',
        kind: 'gather',
        requiredLevel: 1,
        durationMs: 7_000,
        xpPerCycle: 3,
        outputs: [{ itemId: 'wood-log', amount: 1 }],
      },
      {
        id: 'chop-hardwood',
        skillId: 'woodcutting',
        kind: 'gather',
        requiredLevel: 2,
        durationMs: 11_000,
        xpPerCycle: 6,
        outputs: [{ itemId: 'hardwood', amount: 1 }],
      },
      {
        id: 'catch-raw-fish',
        skillId: 'fishing',
        kind: 'gather',
        requiredLevel: 1,
        durationMs: 9_000,
        xpPerCycle: 3,
        outputs: [{ itemId: 'raw-fish', amount: 1 }],
      },
      {
        id: 'catch-raw-fish-deep',
        skillId: 'fishing',
        kind: 'gather',
        requiredLevel: 2,
        durationMs: 14_000,
        xpPerCycle: 6,
        outputs: [{ itemId: 'raw-fish', amount: 2 }],
      },
      {
        id: 'burn-charcoal',
        skillId: 'firemaking',
        kind: 'craft',
        requiredLevel: 1,
        durationMs: 8_000,
        xpPerCycle: 4,
        recipeId: 'recipe-charcoal',
      },
      {
        id: 'burn-charcoal-hardwood',
        skillId: 'firemaking',
        kind: 'craft',
        requiredLevel: 2,
        durationMs: 12_000,
        xpPerCycle: 8,
        recipeId: 'recipe-charcoal-hardwood',
      },
      {
        id: 'cook-raw-fish',
        skillId: 'cooking',
        kind: 'craft',
        requiredLevel: 1,
        durationMs: 10_000,
        xpPerCycle: 6,
        recipeId: 'recipe-cooked-fish',
      },
      {
        id: 'cook-fish-feast',
        skillId: 'cooking',
        kind: 'craft',
        requiredLevel: 2,
        durationMs: 16_000,
        xpPerCycle: 10,
        recipeId: 'recipe-fish-feast',
      },
      {
        id: 'craft-wood-handle',
        skillId: 'crafting',
        kind: 'craft',
        requiredLevel: 1,
        durationMs: 5_000,
        xpPerCycle: 4,
        recipeId: 'recipe-wood-handle',
      },
      {
        id: 'craft-reinforced-handle',
        skillId: 'crafting',
        kind: 'craft',
        requiredLevel: 2,
        durationMs: 12_000,
        xpPerCycle: 10,
        recipeId: 'recipe-reinforced-handle',
      },
    ],
    recipes: [
      ...secondTier.recipes,
      {
        id: 'recipe-charcoal',
        inputs: [{ itemId: 'wood-log', amount: 2 }],
        outputs: [{ itemId: 'wood-charcoal', amount: 1 }],
      },
      {
        id: 'recipe-charcoal-hardwood',
        inputs: [{ itemId: 'hardwood', amount: 1 }],
        outputs: [{ itemId: 'wood-charcoal', amount: 2 }],
      },
      {
        id: 'recipe-cooked-fish',
        inputs: [
          { itemId: 'raw-fish', amount: 1 },
          { itemId: 'wood-charcoal', amount: 1 },
        ],
        outputs: [{ itemId: 'cooked-fish', amount: 1 }],
      },
      {
        id: 'recipe-fish-feast',
        inputs: [
          { itemId: 'raw-fish', amount: 2 },
          { itemId: 'wood-charcoal', amount: 2 },
        ],
        outputs: [{ itemId: 'cooked-fish', amount: 2 }],
      },
      {
        id: 'recipe-wood-handle',
        inputs: [{ itemId: 'wood-log', amount: 2 }],
        outputs: [{ itemId: 'wood-handle', amount: 1 }],
      },
      {
        id: 'recipe-reinforced-handle',
        inputs: [
          { itemId: 'hardwood', amount: 2 },
          { itemId: 'common-ingot', amount: 1 },
        ],
        outputs: [{ itemId: 'reinforced-handle', amount: 1 }],
      },
    ],
    tools: [
      ...secondTier.tools,
      {
        id: 'woodcutting-tool',
        skillId: 'woodcutting',
        levels: [
          { level: 1, durationMultiplierPermille: 1_000 },
          { level: 2, durationMultiplierPermille: 800 },
          { level: 3, durationMultiplierPermille: 650 },
        ],
      },
      {
        id: 'fishing-tool',
        skillId: 'fishing',
        levels: [
          { level: 1, durationMultiplierPermille: 1_000 },
          { level: 2, durationMultiplierPermille: 820 },
          { level: 3, durationMultiplierPermille: 680 },
        ],
      },
    ],
    toolUpgrades: [
      ...secondTier.toolUpgrades,
      {
        id: 'woodcutting-tool-ii',
        toolId: 'woodcutting-tool',
        sourceLevel: 1,
        targetLevel: 2,
        requiredItemId: 'wood-handle',
        requiredAmount: 1,
      },
      {
        id: 'woodcutting-tool-iii',
        toolId: 'woodcutting-tool',
        sourceLevel: 2,
        targetLevel: 3,
        requiredItemId: 'reinforced-handle',
        requiredAmount: 1,
      },
      {
        id: 'fishing-tool-ii',
        toolId: 'fishing-tool',
        sourceLevel: 1,
        targetLevel: 2,
        requiredItemId: 'wood-handle',
        requiredAmount: 1,
      },
      {
        id: 'fishing-tool-iii',
        toolId: 'fishing-tool',
        sourceLevel: 2,
        targetLevel: 3,
        requiredItemId: 'reinforced-handle',
        requiredAmount: 1,
      },
    ],
    initialInventory: {
      ...secondTier.initialInventory,
      'wood-log': 0,
      hardwood: 0,
      'wood-charcoal': 0,
      'raw-fish': 0,
      'cooked-fish': 0,
      'wood-handle': 0,
      'reinforced-handle': 0,
    },
    initialSkillXp: {
      ...secondTier.initialSkillXp,
      woodcutting: 0,
      fishing: 0,
      firemaking: 0,
      cooking: 0,
      crafting: 0,
    },
    initialToolLevels: {
      ...secondTier.initialToolLevels,
      'woodcutting-tool': 1,
      'fishing-tool': 1,
    },
    offlineFuel: {
      itemId: 'wood-charcoal',
      extensionMs: 60 * 60 * 1_000,
      maxExtensionMs: 8 * 60 * 60 * 1_000,
    },
  };
}
