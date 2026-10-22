import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectedTree } from '../../../domain/skill-loop/tree';
import { focusNodeId } from '../../../domain/skill-loop/tree';

const NODE_WIDTH = 176;
const NODE_HEIGHT = 64;
const MIN_SCALE = 0.5;
const MAX_SCALE = 1.5;

export interface TreeCanvasProps {
  readonly tree: ProjectedTree;
  readonly labelFor: (activityId: string) => string;
  readonly selectedId: string | null;
  readonly dimmedIds: ReadonlySet<string> | null;
  readonly focusRequest: number;
  readonly onSelect: (nodeId: string) => void;
}

/**
 * One tree at a time (progressive disclosure level 1). Pan and zoom write only one transform on
 * the layer, never layout: the canvas can hold a few hundred nodes before this needs culling, and
 * a per-tree canvas keeps that number in the low tens.
 */
export function TreeCanvas({
  tree,
  labelFor,
  selectedId,
  dimmedIds,
  focusRequest,
  onSelect,
}: TreeCanvasProps) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 24, y: 16 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const viewport = useRef<HTMLDivElement | null>(null);

  const width = Math.max(NODE_WIDTH + 48, ...tree.nodes.map((node) => node.x + NODE_WIDTH + 48));
  const height = Math.max(NODE_HEIGHT + 32, ...tree.nodes.map((node) => node.y + NODE_HEIGHT + 32));

  const centerOn = useCallback(
    (nodeId: string | null) => {
      const node = tree.nodes.find((entry) => entry.id === nodeId);
      const box = viewport.current;
      if (node === undefined || box === null) return;
      setScale(1);
      setOffset({
        x: box.clientWidth / 2 - (node.x + NODE_WIDTH / 2),
        y: box.clientHeight / 2 - (node.y + NODE_HEIGHT / 2),
      });
    },
    [tree.nodes],
  );

  // `F` follows the design contract: jump to the node the player can unlock next.
  useEffect(() => {
    if (focusRequest === 0) return;
    centerOn(focusNodeId(tree));
  }, [focusRequest, tree, centerOn]);

  function handleWheel(event: React.WheelEvent<HTMLDivElement>): void {
    event.preventDefault();
    setScale((current) =>
      Math.min(MAX_SCALE, Math.max(MIN_SCALE, current - Math.sign(event.deltaY) * 0.1)),
    );
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    // A press that starts on a node belongs to that node: capturing the pointer here would swallow
    // the click and make every node dead.
    if ((event.target as HTMLElement).closest('.skill-prototype-tree-node') !== null) return;
    drag.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>): void {
    const start = drag.current;
    if (start === null) return;
    setOffset({
      x: start.ox + (event.clientX - start.x),
      y: start.oy + (event.clientY - start.y),
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>): void {
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div
      className="skill-prototype-tree-canvas"
      ref={viewport}
      role="application"
      aria-label="技能树画布：拖拽平移，滚轮缩放，F 聚焦下一个可解锁节点"
      tabIndex={0}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={(event) => {
        if (event.key === 'f' || event.key === 'F') centerOn(focusNodeId(tree));
        if (event.key === '0') {
          setScale(1);
          setOffset({ x: 24, y: 16 });
        }
      }}
    >
      <div
        className="skill-prototype-tree-layer"
        style={{
          width,
          height,
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
        }}
      >
        <svg
          className="skill-prototype-tree-edges"
          width={width}
          height={height}
          aria-hidden="true"
        >
          {tree.edges.map((edge) => {
            const from = tree.nodes.find((node) => node.id === edge.from);
            const to = tree.nodes.find((node) => node.id === edge.to);
            if (from === undefined || to === undefined) return null;
            const x1 = from.x + NODE_WIDTH / 2;
            const y1 = from.y + NODE_HEIGHT;
            const x2 = to.x + NODE_WIDTH / 2;
            const y2 = to.y;
            const mid = (y1 + y2) / 2;
            return (
              <path
                className={`skill-prototype-tree-edge${edge.done ? ' is-done' : ''}`}
                key={`${edge.from}-${edge.to}`}
                d={`M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`}
              />
            );
          })}
        </svg>
        {tree.nodes.map((node) => (
          <button
            type="button"
            key={node.id}
            className={`skill-prototype-tree-node is-${node.state}${
              node.id === selectedId ? ' is-selected' : ''
            }${dimmedIds !== null && !dimmedIds.has(node.id) ? ' is-dimmed' : ''}`}
            style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
            data-testid={`tree-node-${node.id}`}
            aria-pressed={node.id === selectedId}
            onClick={() => onSelect(node.id)}
          >
            <span className="skill-prototype-tree-node-label">{labelFor(node.activityId)}</span>
            <small>Lv {node.level}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
