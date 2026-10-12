import type {
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopSummary,
} from '../domain/skill-loop/types';
import type { SkillLoopTheme } from '../themes/skill-prototype-v1';

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
  const missing = recipe.inputs.flatMap((input) => {
    const amount = input.amount - (state.inventory[input.itemId] ?? 0);
    if (amount <= 0) return [];
    const itemLabel = theme.itemCopy[input.itemId]?.label ?? input.itemId;
    return [`${itemLabel} × ${amount}`];
  });
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
  return { sources, uses };
}
