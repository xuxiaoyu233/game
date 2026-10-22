import { useMemo, useState } from 'react';
import type { SkillLoopDefinition, SkillLoopState } from '../../../domain/skill-loop/types';
import type { TreeDefinition, TreeNodeView } from '../../../domain/skill-loop/tree';
import { projectTree } from '../../../domain/skill-loop/tree';
import type { SkillLoopTheme } from '../../../themes/skill-prototype-v1';
import { TreeCanvas } from './TreeCanvas';

type Filter = 'all' | 'unlockable' | 'unlocked' | 'maxed';

const FILTERS: readonly { id: Filter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'unlockable', label: '可解锁' },
  { id: 'unlocked', label: '已解锁' },
  { id: 'maxed', label: '已满' },
];

const STATE_TEXT: Readonly<Record<TreeNodeView['state'], string>> = {
  locked: '前置未满足',
  unlockable: '前置已满足，可解锁',
  unlocked: '已解锁',
  maxed: '已到该树末端',
};

export interface TreeViewProps {
  readonly theme: SkillLoopTheme;
  readonly definition: SkillLoopDefinition;
  readonly state: SkillLoopState;
  readonly trees: readonly TreeDefinition[];
  readonly onBackToTraining: () => void;
  readonly onOpenSkill: (skillId: string) => void;
}

/**
 * Progressive disclosure, three levels in one screen:
 *   0  the tree list (which tree, how far along)
 *   1  one tree on the canvas
 *   2  the selected node's facts, with a way back into training
 * Keeping level 0 and 1 visible together means the player never loses which tree they are in, and
 * a single canvas never has to draw every tree at once.
 */
export function TreeView({
  theme,
  definition,
  state,
  trees,
  onBackToTraining,
  onOpenSkill,
}: TreeViewProps) {
  const [treeId, setTreeId] = useState(trees[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [focusRequest, setFocusRequest] = useState(0);

  const projected = useMemo(
    () =>
      trees.map((tree) => {
        const view = projectTree(definition, state, tree);
        return {
          tree,
          view,
          open: view.nodes.filter((node) => node.state !== 'locked').length,
          unlockable: view.nodes.filter((node) => node.state === 'unlockable').length,
        };
      }),
    [definition, state, trees],
  );

  const current = projected.find((entry) => entry.tree.id === treeId) ?? projected[0];
  const selected = current?.view.nodes.find((node) => node.id === selectedId) ?? null;
  const dimmedIds =
    filter === 'all' || current === undefined
      ? null
      : new Set(
          current.view.nodes
            .filter((node) => (filter === 'maxed' ? node.state === 'maxed' : node.state === filter))
            .map((node) => node.id),
        );

  if (current === undefined) return <p role="alert">当前内容没有定义任何树。</p>;

  const labelFor = (activityId: string): string =>
    theme.activityCopy[activityId]?.label ?? activityId;

  return (
    <section className="skill-prototype-tree" aria-label="树视图">
      <div className="skill-prototype-tree-bar">
        <button className="quiet-button" type="button" onClick={onBackToTraining}>
          ← 训练
        </button>
        <span className="skill-prototype-tree-crumb">树 / {current.tree.label}</span>
        <div className="skill-prototype-tree-filters" role="group" aria-label="按状态筛选">
          {FILTERS.map((entry) => (
            <button
              type="button"
              key={entry.id}
              className="quiet-button"
              aria-pressed={filter === entry.id}
              onClick={() => setFilter(entry.id)}
            >
              {entry.label}
            </button>
          ))}
          <button
            className="quiet-button"
            type="button"
            onClick={() => setFocusRequest((value) => value + 1)}
          >
            聚焦（F）
          </button>
        </div>
      </div>

      <div className="skill-prototype-tree-body">
        <nav className="skill-prototype-tree-sidebar" aria-label="树列表">
          {projected.map((entry) => (
            <button
              type="button"
              key={entry.tree.id}
              className="skill-prototype-tree-item"
              aria-pressed={entry.tree.id === current.tree.id}
              data-testid={`tree-select-${entry.tree.id}`}
              onClick={() => {
                setTreeId(entry.tree.id);
                setSelectedId(null);
              }}
            >
              <strong>{entry.tree.label}</strong>
              <small>
                {entry.open}/{entry.view.nodes.length} 已解锁
                {entry.unlockable > 0 ? ` · ${entry.unlockable} 可解锁` : ''}
              </small>
            </button>
          ))}
        </nav>

        <TreeCanvas
          tree={current.view}
          labelFor={labelFor}
          selectedId={selectedId}
          dimmedIds={dimmedIds}
          focusRequest={focusRequest}
          onSelect={setSelectedId}
        />

        <aside className="skill-prototype-tree-detail" aria-label="节点详情">
          {selected === null ? (
            <p className="skill-prototype-tree-hint">选择一个节点查看要求与下一步。</p>
          ) : (
            <>
              <strong>{labelFor(selected.activityId)}</strong>
              <dl>
                <dt>解锁等级</dt>
                <dd>Lv {selected.level}</dd>
                <dt>状态</dt>
                <dd>{STATE_TEXT[selected.state]}</dd>
              </dl>
              <button
                className="primary-button"
                type="button"
                onClick={() => onOpenSkill(current.tree.skillId)}
              >
                去训练
              </button>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}
