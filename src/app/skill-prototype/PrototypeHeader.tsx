import type { EraId } from '../../domain/skill-loop/eras';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import type { WindowPort } from '../../platform/ports';
import type { WindowMode } from '../window-mode';
import { EraBanner } from './EraBanner';

export interface PrototypeHeaderProps {
  readonly theme: SkillLoopTheme;
  readonly windowPort: WindowPort;
  readonly eraId: EraId;
  readonly compact: boolean;
  readonly pinned: boolean;
  readonly busy: boolean;
  readonly hasPendingReturn: boolean;
  readonly mode: WindowMode;
  readonly onToggleCompact: () => void;
  readonly onTogglePinned: () => void;
  readonly onHide: () => void;
  readonly onOpenReturnReport: () => void;
  readonly onToggleIdle: () => void;
}

export function PrototypeHeader({
  theme,
  windowPort,
  eraId,
  compact,
  pinned,
  busy,
  hasPendingReturn,
  onToggleCompact,
  onTogglePinned,
  onHide,
  onOpenReturnReport,
  mode,
  onToggleIdle,
}: PrototypeHeaderProps) {
  return (
    <header className="skill-prototype-header">
      <div>
        <p className="skill-prototype-kicker">
          {theme.uiCopy.productKicker}
          <EraBanner eraId={eraId} />
        </p>
        <h1>{theme.title}</h1>
      </div>
      <div className="skill-prototype-window-actions">
        <button
          className="quiet-button"
          aria-pressed={mode === 'idle'}
          data-testid="window-mode-toggle"
          onClick={onToggleIdle}
        >
          {mode === 'idle' ? '展开' : '迷你'}
        </button>
        <button className="quiet-button" aria-pressed={compact} onClick={onToggleCompact}>
          {compact ? '展开' : '简洁'}
        </button>
        {windowPort.isDesktop && (
          <>
            <button
              className="quiet-button"
              aria-pressed={pinned}
              disabled={busy}
              onClick={onTogglePinned}
            >
              置顶
            </button>
            <button className="quiet-button" disabled={busy} onClick={onHide}>
              收起
            </button>
          </>
        )}
      </div>
      {hasPendingReturn && (
        <button
          className="skill-prototype-return-shortcut"
          data-testid="open-return-report"
          onClick={onOpenReturnReport}
        >
          离线进展待确认
        </button>
      )}
    </header>
  );
}
