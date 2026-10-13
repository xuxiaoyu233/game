import type { WindowPort } from '../../platform/ports';

interface WindowActionsProps {
  readonly compact: boolean;
  readonly pinned: boolean;
  readonly busy: boolean;
  readonly windowPort: WindowPort;
  readonly onToggleCompact: () => void;
  readonly onTogglePinned: () => Promise<void>;
  readonly onHide: () => void;
}

/** 标题栏窗口操作：简洁模式、置顶与收起（后两者仅桌面端可用）。 */

export function WindowActions({
  compact,
  pinned,
  busy,
  windowPort,
  onToggleCompact,
  onTogglePinned,
  onHide,
}: WindowActionsProps) {
  return (
    <div className="skill-prototype-window-actions">
      <button className="quiet-button" aria-pressed={compact} onClick={onToggleCompact}>
        {compact ? '展开' : '简洁'}
      </button>
      {windowPort.isDesktop && (
        <>
          <button
            className="quiet-button"
            aria-pressed={pinned}
            disabled={busy}
            onClick={() => void onTogglePinned()}
          >
            置顶
          </button>
          <button className="quiet-button" disabled={busy} onClick={onHide}>
            收起
          </button>
        </>
      )}
    </div>
  );
}
