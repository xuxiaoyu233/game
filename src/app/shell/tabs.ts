/** 主导航、二级入口与锚点定位的共享定义（app 层）。 */

export const PROTOTYPE_TABS = [
  { id: 'skill', label: '技能' },
  { id: 'bank', label: '银行' },
  { id: 'shop', label: '商店' },
] as const;

/** 二级入口：一级导航放不下的页面（骨架阶段为占位）。 */
export const SECONDARY_TABS = [
  { id: 'equipment', label: '装备' },
  { id: 'mastery', label: '熟练' },
] as const;

export type PrototypeTabId =
  (typeof PROTOTYPE_TABS)[number]['id'] | (typeof SECONDARY_TABS)[number]['id'];

/** 主导航全部入口（一级 + 二级），方向键轮巡与 ref 索引共用此顺序。 */
export const NAV_TABS = [...PROTOTYPE_TABS, ...SECONDARY_TABS] as const;

// 锚点 id → 所在页签。集中登记，避免在各处用前缀判断散落推导；新增锚点类型必须在此登记。
const ANCHOR_PREFIX_TABS: readonly (readonly [string, PrototypeTabId])[] = [
  ['upgrade-', 'shop'],
  ['activity-', 'skill'],
  ['skill-progress-', 'skill'],
];

const ANCHOR_EXACT_TABS: Readonly<Record<string, PrototypeTabId>> = {
  'return-report': 'skill',
};

export function tabForAnchor(anchorId: string): PrototypeTabId {
  const exact = ANCHOR_EXACT_TABS[anchorId];
  if (exact !== undefined) return exact;
  for (const [prefix, tabId] of ANCHOR_PREFIX_TABS) {
    if (anchorId.startsWith(prefix)) return tabId;
  }
  return 'skill';
}
