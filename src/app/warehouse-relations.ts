import type {
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopSummary,
} from '../domain/skill-loop/types';
import type { SkillLoopTheme } from '../themes/skill-prototype-v1';
import { missingMaterials } from './skill-prototype/derivations';
import { formatCount } from './skill-prototype/format';

export type WarehouseRelationStatus =
  'locked' | 'materials-short' | 'available' | 'complete' | 'unknown';

export interface WarehouseRelation {
  readonly id: string;
  readonly label: string;
  readonly status: WarehouseRelationStatus;
  readonly statusText: string;
}

export interface WarehouseRelations {
  readonly sources: readonly WarehouseRelation[];
  readonly uses: readonly WarehouseRelation[];
}

function activityStatus(
  activityId: string,
  definition: SkillLoopDefinition,
  theme: SkillLoopTheme,
  state: SkillLoopState,
  summary: SkillLoopSummary,
): Pick<WarehouseRelation, 'status' | 'statusText'> {
  const activity = definition.activities.find((entry) => entry.id === activityId);
  if (activity === undefined) return { status: 'unknown', statusText: '未关联活动' };
  if (!summary.availableActivityIds.includes(activity.id)) {
    const skillLabel = theme.skillCopy[activity.skillId]?.label ?? activity.skillId;
    return {
      status: 'locked',
      statusText: `未解锁 · ${skillLabel} Lv ${activity.requiredLevel}`,
    };
  }
  if (activity.kind === 'gather') return { status: 'available', statusText: '可采集' };

  const recipe = definition.recipes.find((entry) => entry.id === activity.recipeId);
  if (recipe === undefined) return { status: 'unknown', statusText: '缺少配方' };
  const missing = missingMaterials(state.inventory, recipe.inputs, theme);
  if (missing.length > 0) {
    return { status: 'materials-short', statusText: `材料不足 · 尚缺 ${missing.join('、')}` };
  }
  return { status: 'available', statusText: '可加工' };
}

function activityRelationsForRecipe(
  recipeId: string,
  definition: SkillLoopDefinition,
  theme: SkillLoopTheme,
  state: SkillLoopState,
  summary: SkillLoopSummary,
): WarehouseRelation[] {
  const activities = definition.activities.filter(
    (activity) => activity.kind === 'craft' && activity.recipeId === recipeId,
  );
  if (activities.length === 0) {
    return [
      {
        id: recipeId,
        label: theme.recipeCopy[recipeId]?.label ?? recipeId,
        status: 'unknown',
        statusText: '未关联加工活动',
      },
    ];
  }
  return activities.map((activity) => ({
    id: activity.id,
    label: theme.activityCopy[activity.id]?.label ?? activity.id,
    ...activityStatus(activity.id, definition, theme, state, summary),
  }));
}

function upgradeRelation(
  upgradeId: string,
  definition: SkillLoopDefinition,
  theme: SkillLoopTheme,
  state: SkillLoopState,
  summary: SkillLoopSummary,
): WarehouseRelation | null {
  const upgrade = definition.toolUpgrades.find((entry) => entry.id === upgradeId);
  if (upgrade === undefined) return null;
  const currentLevel = state.toolLevels[upgrade.toolId] ?? 0;
  const label = theme.toolCopy[upgrade.id]?.label ?? upgrade.id;
  if (currentLevel >= upgrade.targetLevel) {
    return { id: upgrade.id, label, status: 'complete', statusText: '已完成' };
  }
  if (currentLevel < upgrade.sourceLevel) {
    return {
      id: upgrade.id,
      label,
      status: 'locked',
      statusText: `未解锁 · 需要工具 Lv ${upgrade.sourceLevel}`,
    };
  }
  if (summary.availableToolUpgradeIds.includes(upgrade.id)) {
    return { id: upgrade.id, label, status: 'available', statusText: '可提升' };
  }
  const missing = Math.max(
    0,
    upgrade.requiredAmount - (state.inventory[upgrade.requiredItemId] ?? 0),
  );
  if (missing > 0) {
    return {
      id: upgrade.id,
      label,
      status: 'materials-short',
      statusText: `材料不足 · 尚缺 ${missing}`,
    };
  }
  return { id: upgrade.id, label, status: 'unknown', statusText: '暂不可提升' };
}

export function deriveWarehouseRelations(
  itemId: string,
  definition: SkillLoopDefinition,
  theme: SkillLoopTheme,
  state: SkillLoopState,
  summary: SkillLoopSummary,
): WarehouseRelations {
  const sources = definition.activities.flatMap((activity) => {
    if (activity.kind === 'gather') {
      return activity.outputs.some((output) => output.itemId === itemId)
        ? [
            {
              id: activity.id,
              label: theme.activityCopy[activity.id]?.label ?? activity.id,
              ...activityStatus(activity.id, definition, theme, state, summary),
            },
          ]
        : [];
    }
    const recipe = definition.recipes.find((entry) => entry.id === activity.recipeId);
    return recipe?.outputs.some((output) => output.itemId === itemId)
      ? [
          {
            id: activity.id,
            label: theme.activityCopy[activity.id]?.label ?? activity.id,
            ...activityStatus(activity.id, definition, theme, state, summary),
          },
        ]
      : [];
  });

  for (const recipe of definition.recipes) {
    if (!recipe.outputs.some((output) => output.itemId === itemId)) continue;
    const linked = definition.activities.some(
      (activity) => activity.kind === 'craft' && activity.recipeId === recipe.id,
    );
    if (!linked)
      sources.push(...activityRelationsForRecipe(recipe.id, definition, theme, state, summary));
  }

  const uses = definition.recipes.flatMap((recipe) =>
    recipe.inputs.some((input) => input.itemId === itemId)
      ? activityRelationsForRecipe(recipe.id, definition, theme, state, summary)
      : [],
  );
  for (const upgrade of definition.toolUpgrades) {
    if (upgrade.requiredItemId !== itemId) continue;
    const relation = upgradeRelation(upgrade.id, definition, theme, state, summary);
    if (relation !== null) uses.push(relation);
  }
  const item = definition.items.find((entry) => entry.id === itemId);
  if (item?.consumable !== undefined) {
    const owned = state.inventory[itemId] ?? 0;
    uses.push({
      id: 'consume',
      label: `${theme.uiCopy.consumeAction} · ${theme.itemCopy[itemId]?.label ?? itemId}`,
      status: owned > 0 ? 'available' : 'materials-short',
      statusText: owned > 0 ? '可食用 · 限时加速' : '尚无库存',
    });
  }
  if (definition.offlineFuel?.itemId === itemId) {
    uses.push({
      id: 'offline-fuel',
      label: theme.uiCopy.fuelHeading,
      status: 'available',
      statusText: '延长离线结算上限',
    });
  }
  for (const offer of definition.shopOffers ?? []) {
    if (offer.itemId === itemId) {
      sources.push({
        id: `shop-source-${offer.id}`,
        label: `${theme.uiCopy.shopHeading} · ${formatCount(offer.amount)} 个 / ${formatCount(offer.coinCost)} 硬币`,
        status: (state.inventory['coin'] ?? 0) >= offer.coinCost ? 'available' : 'materials-short',
        statusText: (state.inventory['coin'] ?? 0) >= offer.coinCost ? '可购买' : '硬币不足',
      });
    }
    if (itemId === 'coin') {
      uses.push({
        id: `shop-use-${offer.id}`,
        label: `${theme.uiCopy.shopHeading} · ${theme.itemCopy[offer.itemId]?.label ?? offer.itemId} × ${formatCount(offer.amount)}`,
        status: 'available',
        statusText: `售价 ${formatCount(offer.coinCost)} 硬币`,
      });
    }
  }
  // Sell offers are sinks for the item and a second source for the coin.
  for (const offer of definition.sellOffers ?? []) {
    if (offer.itemId === itemId) {
      const owned = state.inventory[itemId] ?? 0;
      uses.push({
        id: `sell-use-${offer.id}`,
        label: `${theme.uiCopy.sellHeading} · ${formatCount(offer.amount)} 个 / ${formatCount(offer.coinValue)} 硬币`,
        status: owned >= offer.amount ? 'available' : 'materials-short',
        statusText: owned >= offer.amount ? '可出售' : '库存不足',
      });
    }
    if (itemId === 'coin') {
      const owned = state.inventory[offer.itemId] ?? 0;
      sources.push({
        id: `sell-source-${offer.id}`,
        label: `${theme.uiCopy.sellHeading} · ${theme.itemCopy[offer.itemId]?.label ?? offer.itemId} × ${formatCount(offer.amount)}`,
        status: owned >= offer.amount ? 'available' : 'materials-short',
        statusText: `售价 ${formatCount(offer.coinValue)} 硬币`,
      });
    }
  }
  return { sources, uses };
}
