import type {
  OutpostJobId,
  OutpostFacilityId,
  OutpostProfessionId,
  OutpostRecipeId,
  OutpostResourceId,
} from '../../domain/legacy/outpost/types';

export const OUTPOST_RESOURCE_COPY: Readonly<
  Record<OutpostResourceId, { readonly name: string; readonly unit: string }>
> = {
  'reclaimed-alloy': { name: '回收合金', unit: '块' },
  'charge-cell': { name: '蓄能芯', unit: '枚' },
  biofiber: { name: '生物纤维', unit: '束' },
  'structural-panel': { name: '结构板', unit: '块' },
  'barrier-kit': { name: '屏障组件', unit: '套' },
  'medical-kit': { name: '医疗包', unit: '组' },
  'anchor-shard': { name: '锚晶碎片', unit: '枚' },
  'echo-record': { name: '回声记录', unit: '份' },
  'anchor-frame': { name: '界锚框架', unit: '件' },
};

export const OUTPOST_JOB_COPY: Readonly<
  Record<OutpostJobId, { readonly name: string; readonly professionId: OutpostProfessionId }>
> = {
  'recover-alloy': { name: '回收金属', professionId: 'salvage' },
  'recover-cells': { name: '回收蓄能芯', professionId: 'engineering' },
  'cultivate-biofiber': { name: '培育生物纤维', professionId: 'medical' },
};

export const OUTPOST_PROFESSION_COPY: Readonly<Record<OutpostProfessionId, string>> = {
  salvage: '采集',
  engineering: '工程',
  medical: '救护',
};

export const OUTPOST_RECIPE_COPY: Readonly<
  Record<OutpostRecipeId, { readonly name: string; readonly description: string }>
> = {
  'refine-structural-panel': {
    name: '精制结构板',
    description: '把回收合金加工成扩建回收货栈所需的结构材料。',
  },
  'assemble-barrier-kit': {
    name: '组装屏障组件',
    description: '用于失籍城救援中加固界锚，实际恢复量受稳定度容量限制。',
  },
  'prepare-medical-kit': {
    name: '配制医疗包',
    description: '修复规则接入后可消耗；当前仅开放制作。',
  },
  'assemble-anchor-frame': {
    name: '组装界锚框架',
    description: '待运输契约提供锚晶与回声记录，并接入返场效果后开放。',
  },
};

export const OUTPOST_FACILITY_COPY: Readonly<
  Record<OutpostFacilityId, { readonly name: string; readonly effect: string }>
> = {
  'production-hangar': { name: '扩容回收货栈', effect: '仓储上限 +100；各类物资上限 +40' },
};

export const OUTPOST_PAUSE_COPY = {
  ingredients: '原料不足，等基础作业补齐后会继续。',
  storage: '成品或仓储空间不足，释放仓位后会继续。',
  'target-reached': '已完成设定批数。',
  workers: '对应专业当前没有驻地人员，调回一名后继续制作。',
} as const;
