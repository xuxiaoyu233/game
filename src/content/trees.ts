/**
 * Tree layouts are content, not save state: coordinates are canvas pixels written here by the
 * content author. This module declares its own structural types on purpose, because mechanical
 * content may not import from the domain layer (see scripts/check-architecture.mjs); the domain
 * side (src/domain/skill-loop/tree.ts) accepts these shapes structurally.
 *
 * The first slice keeps the chain helper so ten nodes stay readable. Any node may carry explicit
 * x/y overrides once a tree branches, and the helper never runs at runtime beyond module load.
 */
export interface TreeLayoutNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly activityId: string;
}

export interface TreeLayout {
  readonly id: string;
  readonly label: string;
  readonly skillId: string;
  readonly nodes: readonly TreeLayoutNode[];
}

const COLUMN = [96, 288] as const;
const ROW_HEIGHT = 104;

function chain(skillId: string, label: string, activityIds: readonly string[]): TreeLayout {
  const nodes: TreeLayoutNode[] = activityIds.map((activityId, index) => ({
    id: `${skillId}-node-${index + 1}`,
    activityId,
    x: COLUMN[index % COLUMN.length] ?? COLUMN[0],
    y: 32 + index * ROW_HEIGHT,
  }));
  return { id: `tree-skill-${skillId}`, label, skillId, nodes };
}

export const SKILL_TREES: readonly TreeLayout[] = [
  chain('mining', '采掘', [
    'mine-common-ore',
    'mine-rich-common-ore',
    'mine-advanced-ore',
    'mine-advanced-ore-deep',
    'mine-ore-t3',
    'mine-ore-t3-deep',
    'mine-ore-t4',
    'mine-ore-t4-deep',
    'mine-ore-t5',
    'mine-ore-t5-deep',
  ]),
  chain('woodcutting', '伐木', [
    'chop-wood-log',
    'chop-hardwood',
    'chop-hardwood-grove',
    'chop-wood-t3',
    'chop-wood-t3-grove',
    'chop-wood-t4',
    'chop-wood-t4-grove',
    'chop-wood-t5',
    'chop-wood-t5-grove',
  ]),
  chain('fishing', '钓鱼', [
    'catch-raw-fish',
    'catch-raw-fish-deep',
    'catch-fish-t2',
    'catch-fish-t3-bait',
    'catch-fish-t4-bait',
    'catch-fish-t5-bait',
  ]),
];
