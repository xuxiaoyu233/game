import type {
  ActivityDefinition,
  ItemCategoryDefinition,
  ItemDefinition,
  MaterialAmount,
  RecipeDefinition,
  ShopOffer,
  SkillDefinition,
  SkillLoopDefinition,
  SkillLoopId,
  ToolDefinition,
  ToolUpgradeDefinition,
} from '../domain/skill-loop/types';
import profileData from './data-v5/profile.json';
import skillsData from './data-v5/skills.json';
import itemsData from './data-v5/items.json';
import activitiesData from './data-v5/activities.json';
import recipesData from './data-v5/recipes.json';
import toolsData from './data-v5/tools.json';
import toolUpgradesData from './data-v5/tool-upgrades.json';

/**
 * Frozen content 5.0.0: the JSON snapshot under data-v5/ is the migration source for saves
 * written before the T1→T2 slice (content 6.0.0). It is a copy of data/ taken before that
 * slice, so it must never drift when data/ is edited. Assembly mirrors load-prototype-content
 * so both definitions share one shape; initial records are derived the same way.
 */
function shopOffers(
  raw: readonly { id: string; itemId: string; amount: number; coinCost: number }[],
): readonly ShopOffer[] {
  return raw.map((offer) => {
    const gated = offer as { requiredLevel?: number };
    return {
      id: offer.id,
      itemId: offer.itemId,
      amount: offer.amount,
      coinCost: offer.coinCost,
      ...(typeof gated.requiredLevel === 'number' ? { requiredLevel: gated.requiredLevel } : {}),
    };
  });
}

export function createSkillPrototypeV5Definition(): SkillLoopDefinition {
  const skills: readonly SkillDefinition[] = skillsData.map((skill) => ({
    id: skill.id,
    levels: skill.levels.map((level) => ({
      level: level.level,
      xpRequired: level.xpRequired,
      ...(level.effect !== undefined
        ? { effect: { globalSpeedBonusPermille: level.effect.globalSpeedBonusPermille } }
        : {}),
    })),
  }));
  const itemCategories: readonly ItemCategoryDefinition[] = [
    ...new Set(itemsData.map((item) => item.categoryId)),
  ].map((categoryId) => ({ id: categoryId }));
  const items: readonly ItemDefinition[] = itemsData.map((item) => ({
    id: item.id,
    categoryId: item.categoryId,
    ...(item.consumable !== undefined ? { consumable: item.consumable } : {}),
  }));
  const materials = (entries: readonly { itemId: string; amount: number }[]): MaterialAmount[] =>
    entries.map((entry) => ({ itemId: entry.itemId, amount: entry.amount }));
  const recipes: readonly RecipeDefinition[] = recipesData.map((recipe) => ({
    id: recipe.id,
    inputs: materials(recipe.inputs),
    outputs: materials(recipe.outputs),
  }));
  const activities: readonly ActivityDefinition[] = activitiesData.map((activity) => {
    if (activity.kind === 'gather')
      return {
        id: activity.id,
        skillId: activity.skillId,
        kind: 'gather',
        requiredLevel: activity.requiredLevel,
        durationMs: activity.durationMs,
        xpPerCycle: activity.xpPerCycle,
        outputs: materials(activity.outputs ?? []),
      };
    if (activity.kind !== 'craft' || activity.recipeId === undefined)
      throw new Error(`Content activity has an unknown kind or missing recipe: ${activity.id}`);
    return {
      id: activity.id,
      skillId: activity.skillId,
      kind: 'craft',
      requiredLevel: activity.requiredLevel,
      durationMs: activity.durationMs,
      xpPerCycle: activity.xpPerCycle,
      recipeId: activity.recipeId,
    };
  });
  const tools: readonly ToolDefinition[] = toolsData.map((tool) => ({
    id: tool.id,
    skillId: tool.skillId,
    levels: tool.levels.map((level) => ({
      level: level.level,
      durationMultiplierPermille: level.durationMultiplierPermille,
    })),
  }));
  const toolUpgrades: readonly ToolUpgradeDefinition[] = toolUpgradesData.map((upgrade) => ({
    id: upgrade.id,
    toolId: upgrade.toolId,
    sourceLevel: upgrade.sourceLevel,
    targetLevel: upgrade.targetLevel,
    requiredItemId: upgrade.requiredItemId,
    requiredAmount: upgrade.requiredAmount,
  }));

  const initialInventory = Object.fromEntries(items.map((item) => [item.id, 0])) as Record<
    SkillLoopId,
    number
  >;
  const initialSkillXp = Object.fromEntries(skills.map((skill) => [skill.id, 0])) as Record<
    SkillLoopId,
    number
  >;
  const initialToolLevels = Object.fromEntries(tools.map((tool) => [tool.id, 1])) as Record<
    SkillLoopId,
    number
  >;

  return {
    profileId: 'skill-prototype-v1',
    schemaVersion: 3,
    contentVersion: profileData.contentVersion,
    maxOfflineMs: profileData.maxOfflineMs,
    skills,
    itemCategories,
    items,
    activities,
    recipes,
    tools,
    toolUpgrades,
    initialInventory,
    initialSkillXp,
    initialToolLevels,
    ...(profileData.offlineFuel !== undefined ? { offlineFuel: profileData.offlineFuel } : {}),
    ...(profileData.shopOffers !== undefined
      ? { shopOffers: shopOffers(profileData.shopOffers) }
      : {}),
  };
}
