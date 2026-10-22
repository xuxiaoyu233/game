import { getSkillLevel } from './rates';
import type { SkillLoopDefinition, SkillLoopState } from './types';

/**
 * Trees are pure projections of facts the save already holds. Nothing here is stored: a node is
 * unlocked because the skill level says so, not because a flag was written, so reading an old save
 * can never disagree with the canvas.
 *
 * Progressive disclosure is the shape of the feature, not a compromise: the sidebar lists the
 * trees (level 0), one tree is drawn at a time (level 1) and a node opens its own detail (level 2).
 * A single canvas holding every tree would force a culling layer, a minimap and a zoom model on
 * content that is still linear per skill.
 */
export type TreeNodeState = 'locked' | 'unlockable' | 'unlocked' | 'maxed';

export interface TreeNodeSpec {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly activityId: string;
}

export interface TreeDefinition {
  readonly id: string;
  readonly label: string;
  readonly skillId: string;
  readonly nodes: readonly TreeNodeSpec[];
}

export interface TreeNodeView extends TreeNodeSpec {
  readonly level: number;
  readonly state: TreeNodeState;
  /** Single-chain trees: the one node that has to open first. */
  readonly requires: readonly string[];
}

export interface TreeEdgeView {
  readonly from: string;
  readonly to: string;
  readonly done: boolean;
}

export interface ProjectedTree {
  readonly nodes: readonly TreeNodeView[];
  readonly edges: readonly TreeEdgeView[];
}

export function projectTree(
  definition: SkillLoopDefinition,
  state: SkillLoopState,
  tree: TreeDefinition,
): ProjectedTree {
  const level = getSkillLevel(state, definition, tree.skillId);
  const ceiling =
    definition.skills.find((skill) => skill.id === tree.skillId)?.levels.at(-1)?.level ?? 1;

  const ordered = tree.nodes
    .map((node) => {
      const activity = definition.activities.find((entry) => entry.id === node.activityId);
      // A typo in the layout file must not silently drop a node: that is how a tree ends up
      // looking complete while hiding a step the player needs.
      if (activity === undefined)
        throw new Error(`树 ${tree.id} 引用了不存在的活动：${node.activityId}`);
      return { node, requiredLevel: activity.requiredLevel };
    })
    .sort((a, b) => a.requiredLevel - b.requiredLevel || a.node.id.localeCompare(b.node.id));

  const nodes: TreeNodeView[] = ordered.map((entry, index) => {
    const previous = ordered[index - 1] ?? null;
    const reached = level >= entry.requiredLevel;
    const next = ordered[index + 1] ?? null;
    // maxed: this is the last step and the skill itself is at its ceiling.
    const maxed = reached && next === null && level >= ceiling;
    const stepAway = previous !== null && level >= previous.requiredLevel;
    const nodeState: TreeNodeState = maxed
      ? 'maxed'
      : reached
        ? 'unlocked'
        : stepAway
          ? 'unlockable'
          : 'locked';
    return {
      ...entry.node,
      level: entry.requiredLevel,
      state: nodeState,
      requires: previous === null ? [] : [previous.node.id],
    };
  });

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: TreeEdgeView[] = nodes.flatMap((node) =>
    node.requires.flatMap((fromId) => {
      const from = byId.get(fromId);
      if (from === undefined) return [];
      return [{ from: fromId, to: node.id, done: from.state !== 'locked' }];
    }),
  );

  return { nodes, edges };
}

/** The node the player is working toward: first unlockable, else the first locked one. */
export function focusNodeId(tree: ProjectedTree): string | null {
  return (
    tree.nodes.find((node) => node.state === 'unlockable')?.id ??
    tree.nodes.find((node) => node.state === 'locked')?.id ??
    tree.nodes.at(-1)?.id ??
    null
  );
}
