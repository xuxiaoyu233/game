import { describe, expect, it } from 'vitest';
import { createSkillPrototypeV2Definition } from '../content/skill-prototype-v2';
import { createNewSkillLoop, getSkillLoopSummary } from '../domain/skill-loop/engine';
import type { SkillLoopDefinition, SkillLoopState } from '../domain/skill-loop/types';
import { SKILL_PROTOTYPE_V1_THEME } from '../themes/skill-prototype-v1';
import { deriveWarehouseRelations } from './warehouse-relations';

function setup() {
  const definition = createSkillPrototypeV2Definition();
  const state = createNewSkillLoop(definition, 1_000);
  return { definition, state, summary: getSkillLoopSummary(state, definition) };
}

describe('warehouse source and use relations', () => {
  it('derives gather and craft sources, recipe inputs, and truthful locked/shortage states', () => {
    const { definition, state, summary } = setup();
    const ore = deriveWarehouseRelations(
      'common-ore',
      definition,
      SKILL_PROTOTYPE_V1_THEME,
      state,
      summary,
    );
    expect(
      ore.sources.map(({ label, status, statusText }) => ({ label, status, statusText })),
    ).toEqual([
      { label: '采集基础矿料', status: 'available', statusText: '可采集' },
      { label: '采集富集矿层', status: 'locked', statusText: '未解锁 · 采掘 Lv 2' },
    ]);
    expect(ore.uses).toContainEqual(
      expect.objectContaining({
        label: '冶炼基础金属锭',
        status: 'materials-short',
        statusText: '材料不足 · 尚缺 基础矿料 × 2',
      }),
    );

    const ingot = deriveWarehouseRelations(
      'common-ingot',
      definition,
      SKILL_PROTOTYPE_V1_THEME,
      state,
      summary,
    );
    expect(ingot.sources).toContainEqual(
      expect.objectContaining({ label: '冶炼基础金属锭', status: 'materials-short' }),
    );
    expect(ingot.uses).toContainEqual(
      expect.objectContaining({
        label: '锻造基础工具坯',
        status: 'locked',
        statusText: '未解锁 · 金工 Lv 2',
      }),
    );

    const lockedOre = deriveWarehouseRelations(
      'advanced-ore',
      definition,
      SKILL_PROTOTYPE_V1_THEME,
      state,
      summary,
    );
    expect(lockedOre.sources[0]).toMatchObject({
      status: 'locked',
      statusText: '未解锁 · 采掘 Lv 3',
    });
  });

  it('derives tool-upgrade shortages, availability, completion, and prerequisite locks', () => {
    const { definition, state } = setup();
    const blank = deriveWarehouseRelations(
      'common-tool-blank',
      definition,
      SKILL_PROTOTYPE_V1_THEME,
      state,
      getSkillLoopSummary(state, definition),
    );
    expect(blank.uses).toContainEqual(
      expect.objectContaining({
        label: '采掘工具 II',
        status: 'materials-short',
        statusText: '材料不足 · 尚缺 1',
      }),
    );

    const readyState: SkillLoopState = {
      ...state,
      inventory: { ...state.inventory, 'common-tool-blank': 1 },
    };
    const ready = deriveWarehouseRelations(
      'common-tool-blank',
      definition,
      SKILL_PROTOTYPE_V1_THEME,
      readyState,
      getSkillLoopSummary(readyState, definition),
    );
    expect(ready.uses).toContainEqual(
      expect.objectContaining({ label: '采掘工具 II', status: 'available', statusText: '可提升' }),
    );

    const completedState: SkillLoopState = {
      ...state,
      toolLevels: { ...state.toolLevels, 'mining-tool': 2 },
    };
    const completed = deriveWarehouseRelations(
      'common-tool-blank',
      definition,
      SKILL_PROTOTYPE_V1_THEME,
      completedState,
      getSkillLoopSummary(completedState, definition),
    );
    expect(completed.uses).toContainEqual(
      expect.objectContaining({ label: '采掘工具 II', status: 'complete', statusText: '已完成' }),
    );

    const composite = deriveWarehouseRelations(
      'composite-tool-blank',
      definition,
      SKILL_PROTOTYPE_V1_THEME,
      state,
      getSkillLoopSummary(state, definition),
    );
    expect(composite.uses).toContainEqual(
      expect.objectContaining({
        label: '采掘工具 III',
        status: 'locked',
        statusText: '未解锁 · 需要工具 Lv 2',
      }),
    );
  });

  it('returns empty relations for items without a defined source or use', () => {
    const { definition, state } = setup();
    const extended: SkillLoopDefinition = {
      ...definition,
      items: [...definition.items, { id: 'orphan-item', categoryId: 'raw-material' }],
    };
    const relations = deriveWarehouseRelations(
      'orphan-item',
      extended,
      SKILL_PROTOTYPE_V1_THEME,
      state,
      getSkillLoopSummary(state, extended),
    );
    expect(relations).toEqual({ sources: [], uses: [] });
  });
});
