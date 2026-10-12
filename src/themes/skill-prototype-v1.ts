import type { SkillLoopDefinition, SkillLoopId } from '../domain/skill-loop/types';

export interface SkillLoopTheme {
  readonly id: 'skill-prototype-v1';
  readonly title: string;
  readonly colors: {
    readonly background: string;
    readonly surface: string;
    readonly surfaceRaised: string;
    readonly text: string;
    readonly muted: string;
    readonly accent: string;
    readonly accentSoft: string;
    readonly border: string;
  };
  readonly skillCopy: Readonly<
    Record<SkillLoopId, { readonly label: string; readonly description: string }>
  >;
  readonly categoryCopy: Readonly<Record<SkillLoopId, { readonly label: string }>>;
  readonly itemCopy: Readonly<Record<SkillLoopId, { readonly label: string }>>;
  readonly activityCopy: Readonly<
    Record<SkillLoopId, { readonly label: string; readonly description: string }>
  >;
  readonly recipeCopy: Readonly<Record<SkillLoopId, { readonly label: string }>>;
  readonly toolCopy: Readonly<
    Record<SkillLoopId, { readonly label: string; readonly effect: string }>
  >;
}

export const SKILL_PROTOTYPE_V1_THEME: SkillLoopTheme = {
  id: 'skill-prototype-v1',
  title: '技能工坊原型',
  colors: {
    background: '#101820',
    surface: '#192630',
    surfaceRaised: '#22343f',
    text: '#edf5f2',
    muted: '#a3b6b5',
    accent: '#82d8b7',
    accentSoft: '#294e48',
    border: '#38505a',
  },
  skillCopy: {
    mining: { label: '采掘', description: '从矿层取得原料，并提升采集效率。' },
    metalworking: { label: '金工', description: '把矿料加工成金属锭与工具部件。' },
  },
  categoryCopy: {
    'raw-material': { label: '原料' },
    'processed-material': { label: '加工材料' },
    'tool-component': { label: '工具部件' },
  },
  itemCopy: {
    'common-ore': { label: '基础矿料' },
    'common-ingot': { label: '基础金属锭' },
    'common-tool-blank': { label: '基础工具坯' },
  },
  activityCopy: {
    'mine-common-ore': { label: '采集基础矿料', description: '无材料消耗，稳定获得基础矿料。' },
    'mine-rich-common-ore': { label: '采集富集矿层', description: '每周期获得两份基础矿料。' },
    'smelt-common-ingot': {
      label: '冶炼基础金属锭',
      description: '消耗两份基础矿料，产出一份金属锭。',
    },
    'forge-common-tool-blank': {
      label: '锻造基础工具坯',
      description: '消耗两份基础金属锭，制成工具坯。',
    },
  },
  recipeCopy: {
    'recipe-common-ingot': { label: '基础金属锭配方' },
    'recipe-common-tool-blank': { label: '基础工具坯配方' },
  },
  toolCopy: {
    'mining-tool': { label: '采掘工具', effect: '缩短采掘周期' },
    'mining-tool-ii': { label: '采掘工具 II', effect: '采掘周期缩短至基础周期的 80%' },
  },
};

function validateCopyRecord(
  copy: Readonly<Record<string, unknown>>,
  ids: ReadonlySet<string>,
  field: string,
): void {
  const keys = Object.keys(copy);
  if (keys.length !== ids.size || keys.some((id) => !ids.has(id)))
    throw new Error(`Skill-loop theme ${field} does not exactly match mechanics content`);
  for (const [id, value] of Object.entries(copy)) {
    if (value === null || typeof value !== 'object')
      throw new Error(`Missing skill-loop theme copy: ${field}/${id}`);
    for (const text of Object.values(value as Record<string, unknown>)) {
      if (typeof text !== 'string' || text.trim().length === 0)
        throw new Error(`Empty skill-loop theme text: ${field}/${id}`);
    }
  }
}

/** The single assembly gate keeps display names out of mechanics and rejects orphan copy. */
export function validateSkillPrototypeV1Theme(
  definition: SkillLoopDefinition,
  theme: SkillLoopTheme,
): void {
  if (theme.id !== definition.profileId) throw new Error('Skill-loop theme/profile mismatch');
  for (const value of Object.values(theme.colors)) {
    if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Invalid skill-loop theme color');
  }
  validateCopyRecord(
    theme.skillCopy,
    new Set(definition.skills.map((entry) => entry.id)),
    'skills',
  );
  validateCopyRecord(
    theme.categoryCopy,
    new Set(definition.itemCategories.map((entry) => entry.id)),
    'item categories',
  );
  validateCopyRecord(theme.itemCopy, new Set(definition.items.map((entry) => entry.id)), 'items');
  validateCopyRecord(
    theme.activityCopy,
    new Set(definition.activities.map((entry) => entry.id)),
    'activities',
  );
  validateCopyRecord(
    theme.recipeCopy,
    new Set(definition.recipes.map((entry) => entry.id)),
    'recipes',
  );
  validateCopyRecord(
    theme.toolCopy,
    new Set([
      ...definition.tools.map((entry) => entry.id),
      ...definition.toolUpgrades.map((entry) => entry.id),
    ]),
    'tools',
  );
}
