/** 主导航页签与锚点定位的共享定义（app 层）。 */

export const PROTOTYPE_TABS = [
  { id: 'training', label: '训练' },
  { id: 'warehouse', label: '仓库' },
  { id: 'growth', label: '成长' },
] as const;

export type PrototypeTabId = (typeof PROTOTYPE_TABS)[number]['id'];

// 锚点 id → 所在页签。集中登记，避免在各处用前缀判断散落推导；新增锚点类型必须在此登记。
const ANCHOR_PREFIX_TABS: readonly (readonly [string, PrototypeTabId])[] = [
  ['upgrade-', 'growth'],
  ['activity-', 'training'],
  ['skill-progress-', 'training'],
];

const ANCHOR_EXACT_TABS: Readonly<Record<string, PrototypeTabId>> = {
  'return-report': 'training',
};

export function tabForAnchor(anchorId: string): PrototypeTabId {
  const exact = ANCHOR_EXACT_TABS[anchorId];
  if (exact !== undefined) return exact;
  for (const [prefix, tabId] of ANCHOR_PREFIX_TABS) {
    if (anchorId.startsWith(prefix)) return tabId;
  }
  return 'training';
}
