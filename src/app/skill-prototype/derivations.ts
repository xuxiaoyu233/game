import type {
  ActivityDefinition,
  CurrentActivity,
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import { getEffectiveCycleMs } from '../../domain/skill-loop/rates';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import type { ToneId } from '../../themes/eras';

/**
 * Single source for the semantic group (and therefore the tone) of a skill or an item category:
 * `gather` pulls raw materials from the environment, `craft` refines them, `support` buffs and
 * funds. The group id doubles as the tone id, so one mapping drives the training-page grouping,
 * the warehouse category tones and the status-bar highlight. Presentation only, no state: the
 * hue itself comes from the era palette (see src/themes/eras.ts).
 */
export type SkillGroupId = ToneId;

const SKILL_GROUP: Readonly<Record<string, SkillGroupId>> = {
  // Raw materials pulled from the environment.
  mining: 'gather',
  woodcutting: 'gather',
  fishing: 'gather',
  firemaking: 'gather',
  // Refining and crafting chains.
  metalworking: 'craft',
  crafting: 'craft',
  cooking: 'craft',
  herbalism: 'craft',
  herblore: 'craft',
  farming: 'craft',
  // Support lines: buffs and coin, no material output of their own.
  agility: 'support',
  thieving: 'support',
};

const CATEGORY_GROUP: Readonly<Record<string, SkillGroupId>> = {
  'raw-material': 'gather',
  'processed-material': 'craft',
  'tool-component': 'craft',
  fuel: 'support',
  consumable: 'support',
  currency: 'support',
  'trade-good': 'support',
};

export function getSkillGroupId(skillId: string): SkillGroupId {
  return SKILL_GROUP[skillId] ?? 'craft';
}

export function getCategoryGroupId(categoryId: string): SkillGroupId {
  return CATEGORY_GROUP[categoryId] ?? 'support';
}

/** Material inputs consumed by one cycle of a craft activity. */
export function getRecipeInputs(
  activityId: string,
  definition: SkillLoopDefinition,
): readonly { readonly itemId: string; readonly amount: number }[] {
  const activity = definition.activities.find((entry) => entry.id === activityId);
  if (activity?.kind !== 'craft') return [];
  return definition.recipes.find((recipe) => recipe.id === activity.recipeId)?.inputs ?? [];
}

/** Human-readable shortage list for the given inputs, e.g. "基础矿料 × 2". */
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

/** Single source for the "which gather activity replenishes this missing input" projection. */
export function getGatherSuggestion(
  state: SkillLoopState,
  current: CurrentActivity | null,
  summary: SkillLoopSummary,
  definition: SkillLoopDefinition,
): { readonly itemId: string; readonly amount: number; readonly activityId: string | null } | null {
  if (current === null) return null;
  const activity = definition.activities.find((entry) => entry.id === current.activityId);
  if (activity?.kind !== 'craft') return null;
  const inputs = definition.recipes.find((recipe) => recipe.id === activity.recipeId)?.inputs;
  if (inputs === undefined) return null;

  for (const input of inputs) {
    const missing = input.amount - (state.inventory[input.itemId] ?? 0);
    if (missing <= 0) continue;

    let selected: {
      readonly activity: Extract<ActivityDefinition, { kind: 'gather' }>;
      readonly rate: number;
    } | null = null;
    for (const candidate of definition.activities) {
      if (candidate.kind !== 'gather' || !summary.availableActivityIds.includes(candidate.id))
        continue;
      const output = candidate.outputs.find((entry) => entry.itemId === input.itemId);
      if (output === undefined) continue;
      // Rates must match the engine, so the shared domain formula decides the cycle length.
      const cycleMs = getEffectiveCycleMs(state, definition, candidate);
      const rate = output.amount / cycleMs;
      if (selected === null || rate > selected.rate) selected = { activity: candidate, rate };
    }

    return { itemId: input.itemId, amount: missing, activityId: selected?.activity.id ?? null };
  }

  return null;
}
