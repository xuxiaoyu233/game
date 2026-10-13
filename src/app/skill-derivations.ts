import type {
  ActivityDefinition,
  CurrentActivity,
  SkillLoopState,
  SkillLoopSummary,
} from '../domain/skill-loop/types';
import type { SkillPrototypeV1Package } from './skill-prototype-types';
import type { SkillLoopTheme } from '../themes/skill-prototype-v1';

/** 从内容定义派生的展示信息。只读推导，不维护第二份关系表，不参与规则计算。 */

export function getRecipeInputs(
  activityId: string,
  content: SkillPrototypeV1Package,
): readonly { readonly itemId: string; readonly amount: number }[] {
  const activity = content.definition.activities.find((entry) => entry.id === activityId);
  if (activity?.kind !== 'craft') return [];
  return content.definition.recipes.find((recipe) => recipe.id === activity.recipeId)?.inputs ?? [];
}

export function missingMaterials(
  inventory: Readonly<Record<string, number>>,
  inputs: readonly { readonly itemId: string; readonly amount: number }[],
  theme: SkillLoopTheme,
): string[] {
  return inputs.flatMap((input) => {
    const missing = input.amount - (inventory[input.itemId] ?? 0);
    if (missing <= 0) return [];
    return [`${theme.itemCopy[input.itemId]?.label ?? input.itemId} × ${missing}`];
  });
}

export function getGatherSuggestion(
  state: SkillLoopState,
  current: CurrentActivity | null,
  summary: SkillLoopSummary,
  content: SkillPrototypeV1Package,
): { readonly itemId: string; readonly amount: number; readonly activityId: string | null } | null {
  if (current === null) return null;
  const activity = content.definition.activities.find((entry) => entry.id === current.activityId);
  if (activity?.kind !== 'craft') return null;
  const inputs = content.definition.recipes.find(
    (recipe) => recipe.id === activity.recipeId,
  )?.inputs;
  if (inputs === undefined) return null;

  for (const input of inputs) {
    const missing = input.amount - (state.inventory[input.itemId] ?? 0);
    if (missing <= 0) continue;

    let selected: {
      readonly activity: Extract<ActivityDefinition, { kind: 'gather' }>;
      readonly rate: number;
    } | null = null;
    for (const candidate of content.definition.activities) {
      if (candidate.kind !== 'gather' || !summary.availableActivityIds.includes(candidate.id))
        continue;
      const output = candidate.outputs.find((entry) => entry.itemId === input.itemId);
      if (output === undefined) continue;
      const tool = content.definition.tools.find((entry) => entry.skillId === candidate.skillId);
      const toolLevel = tool?.levels.find((entry) => entry.level === state.toolLevels[tool.id]);
      const durationMs = Math.ceil(
        (candidate.durationMs * (toolLevel?.durationMultiplierPermille ?? 1_000)) / 1_000,
      );
      const rate = output.amount / durationMs;
      if (selected === null || rate > selected.rate) selected = { activity: candidate, rate };
    }

    return { itemId: input.itemId, amount: missing, activityId: selected?.activity.id ?? null };
  }

  return null;
}
