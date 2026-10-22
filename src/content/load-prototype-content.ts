import type {
  ActivityDefinition,
  ItemCategoryDefinition,
  ItemDefinition,
  MaterialAmount,
  RecipeDefinition,
  SellOffer,
  ShopOffer,
  SkillDefinition,
  SkillLoopDefinition,
  SkillLoopId,
  SkillLevelEffect,
  ToolDefinition,
  ToolUpgradeDefinition,
} from '../domain/skill-loop/types';
import profileData from './data/profile.json';
import skillsData from './data/skills.json';
import itemsData from './data/items.json';
import activitiesData from './data/activities.json';
import recipesData from './data/recipes.json';
import toolsData from './data/tools.json';
import toolUpgradesData from './data/tool-upgrades.json';

/**
 * Content 7.0.0 assembly: the JSON files under data/ are the single source of truth for
 * mechanics (Melvor-style data-driven content). Initial records are derived here so data
 * files never hand-maintain zero-value keys; adding an item/skill/tool only touches its own
 * JSON file. The structural contract is enforced by scripts/validate-content-json.mjs and,
 * at assembly, by validateSkillLoopDefinition. JSON imports widen unions to string, so the
 * loader narrows them explicitly instead of asserting the whole shape.
 */
/** JSON widens optional keys away entirely, so required-level gating is read defensively. */
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

function sellOffers(
  raw: readonly { id: string; itemId: string; amount: number; coinValue: number }[],
): readonly SellOffer[] {
  return raw.map((offer) => ({
    id: offer.id,
    itemId: offer.itemId,
    amount: offer.amount,
    coinValue: offer.coinValue,
  }));
}

/** JSON widens optional keys away entirely, so each effect field is copied only when present. */
function levelEffect(raw: {
  globalSpeedBonusPermille?: number;
  globalXpBonusPermille?: number;
  offlineCapBonusMs?: number;
}): SkillLevelEffect {
  return {
    ...(raw.globalSpeedBonusPermille !== undefined
      ? { globalSpeedBonusPermille: raw.globalSpeedBonusPermille }
      : {}),
    ...(raw.globalXpBonusPermille !== undefined
      ? { globalXpBonusPermille: raw.globalXpBonusPermille }
      : {}),
    ...(raw.offlineCapBonusMs !== undefined ? { offlineCapBonusMs: raw.offlineCapBonusMs } : {}),
  };
}

export function loadPrototypeContent(): SkillLoopDefinition {
  const skills: readonly SkillDefinition[] = skillsData.map((skill) => ({
    id: skill.id,
    levels: skill.levels.map((level) => ({
      level: level.level,
      xpRequired: level.xpRequired,
      ...(level.effect !== undefined ? { effect: levelEffect(level.effect) } : {}),
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

  // The schema version rides with the content: 7.0.0 ships schema 3, 8.0.0 ships schema 4.
  if (profileData.schemaVersion !== 3 && profileData.schemaVersion !== 4)
    throw new Error(`Unsupported content schema version: ${String(profileData.schemaVersion)}`);

  return {
    profileId: 'skill-prototype-v1',
    schemaVersion: profileData.schemaVersion,
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
    ...(profileData.sellOffers !== undefined
      ? { sellOffers: sellOffers(profileData.sellOffers) }
      : {}),
  };
}
