import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type {
  GameCommand,
  GameDefinition,
  GameErrorCode,
  GameState,
  GameSummary,
} from '../domain/legacy/types';
import type { WindowPort } from '../platform/ports';
import type { GameRuntime } from '../runtime/game-runtime';
import { DEFAULT_THEME_ID, GAME_THEMES } from '../themes';
import { formatAmount } from './format';
import { GamePanels } from './GamePanels';
import { readPreferences, writePreferences } from './preferences';

const ACTION_ERRORS: Record<GameErrorCode, string> = {
  INSUFFICIENT_MATERIALS: '再积累一些资源就能购买了。',
  LOCKED: '先完成解锁条件。',
  ALREADY_PURCHASED: '这项技术已经升级。',
  TASK_NOT_READY: '目标还没有完成。',
  ALREADY_CLAIMED: '这份奖励已经领取。',
  EVENT_NOT_PENDING: '这个事件已经处理。',
  UNKNOWN_ID: '未找到对应内容，请重新打开游戏。',
  NUMERIC_LIMIT: '数值已达安全上限，请导出存档保留进度。',
};

interface AppProps {
  readonly runtime: GameRuntime<GameDefinition, GameState, GameCommand, GameSummary, GameErrorCode>;
  readonly definition: GameDefinition;
  readonly windowPort: WindowPort;
}

export function App({ runtime, definition, windowPort }: AppProps) {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [preferences, setPreferences] = useState(() => readPreferences(DEFAULT_THEME_ID));
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinned, setPinned] = useState(false);
  const theme =
    GAME_THEMES.find((candidate) => candidate.id === preferences.themeId) ?? GAME_THEMES[0];

  useEffect(() => {
    document.body.style.backgroundColor = theme?.colors.background ?? '';
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, [theme]);

  useEffect(() => {
    writePreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    if (snapshot.status !== 'ready') return;
    const timer = setInterval(() => {
      void runtime.dispatch({ kind: 'tick' }).catch(() => undefined);
    }, 1_000);
    return () => clearInterval(timer);
  }, [runtime, snapshot.status]);

  useEffect(() => {
    // Blur/pagehide are best-effort in browsers; desktop close uses an awaited save barrier.
    const save = () => {
      void runtime.flush().catch(() => undefined);
    };
    window.addEventListener('blur', save);
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('blur', save);
      window.removeEventListener('pagehide', save);
    };
  }, [runtime]);

  function run(operation: () => Promise<unknown>, success?: string): void {
    setBusy(true);
    setNotice(null);
    void operation()
      .then((result) => {
        if (success !== undefined && result !== false) setNotice(success);
      })
      .catch((error: unknown) => {
        setNotice(error instanceof Error ? error.message : String(error));
      })
      .finally(() => setBusy(false));
  }

  function dispatch(command: GameCommand): void {
    void runtime
      .dispatch(command)
      .then((result) => {
        setNotice(result.ok ? null : ACTION_ERRORS[result.error]);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)));
  }

  if (theme === undefined) return <p role="alert">主题配置缺失。</p>;
  const colors = theme.colors;
  const style = {
    '--background': colors.background,
    '--surface': colors.surface,
    '--surface-raised': colors.surfaceRaised,
    '--text': colors.text,
    '--muted': colors.muted,
    '--accent': colors.accent,
    '--accent-soft': colors.accentSoft,
    '--border': colors.border,
    ...(theme.scene.backgroundImage === null
      ? {}
      : { '--scene-image': `url("${theme.scene.backgroundImage}")` }),
  } as CSSProperties;
  const ready = snapshot.status === 'ready' && snapshot.state !== null && snapshot.summary !== null;

  return (
    <main className={`game ${preferences.compact ? 'compact' : ''}`} style={style}>
      <header className="app-header">
        <div>
          <span className="brand-mark" aria-hidden="true">
            ✦
          </span>
          <h1>{theme.title}</h1>
        </div>
        <div className="window-actions">
          <button
            className="icon-button"
            aria-pressed={preferences.compact}
            onClick={() => setPreferences({ ...preferences, compact: !preferences.compact })}
          >
            {preferences.compact ? '展开' : '简洁'}
          </button>
          {windowPort.isDesktop && (
            <button
              className="icon-button"
              aria-pressed={pinned}
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await windowPort.setAlwaysOnTop(!pinned);
                  setPinned(!pinned);
                })
              }
            >
              置顶
            </button>
          )}
          {windowPort.isDesktop && (
            <button
              className="icon-button"
              disabled={!ready || busy}
              onClick={() => run(() => runtime.withSaveBarrier(() => windowPort.hide()))}
            >
              收起
            </button>
          )}
        </div>
      </header>
      <div className={`scene scene-${theme.scene.variant}`} aria-hidden="true">
        <span className="scene-orbit" />
        <span className="scene-core" />
        <span className="scene-ground" />
        <span className="scene-dot dot-one" />
        <span className="scene-dot dot-two" />
      </div>
      <div className="world-caption">
        <span>{theme.worldName}</span>
        <span>{theme.tagline}</span>
      </div>
      {(snapshot.error ?? notice) !== null && (
        <p className="notice" role="status">
          {snapshot.error ?? notice}
        </p>
      )}
      {!ready && (
        <section className="panel loading-panel">
          <h2>{snapshot.status === 'loading' ? '正在准备旅程…' : '需要处理存档'}</h2>
          <p>进度只保存在本机。加载完成后就能开始积累资源。</p>
          {snapshot.status === 'error' && (
            <div className="recovery-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => run(() => runtime.start())}
              >
                重试加载
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => run(() => runtime.recoverBackup(), '备份已恢复。')}
              >
                恢复备份
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => run(() => runtime.importSave(), '存档已导入。')}
              >
                导入存档
              </button>
              {snapshot.state !== null && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => run(() => runtime.exportSave(), '内存进度已导出。')}
                >
                  导出当前进度
                </button>
              )}
              {windowPort.isDesktop && snapshot.state === null && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => run(() => windowPort.requestExit())}
                >
                  退出
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {ready && snapshot.state !== null && snapshot.summary !== null && (
        <>
          <section className="resource-panel" aria-label="资源概况">
            <div className="resource-heading">
              <span>{theme.resourceName}</span>
              <span className="rate">+{formatAmount(snapshot.summary.productionRate)} / 秒</span>
            </div>
            <div className="resource-value" data-testid="balance">
              {formatAmount(snapshot.state.balance)}
              <span>{theme.resourceUnit}</span>
            </div>
            <button
              className="collect-button"
              disabled={busy}
              onClick={() => dispatch({ kind: 'collect' })}
            >
              采集<span>+{formatAmount(snapshot.summary.clickYield)}</span>
            </button>
          </section>
          <div className="details">
            <GamePanels
              definition={definition}
              state={snapshot.state}
              summary={snapshot.summary}
              theme={theme}
              busy={busy}
              onCommand={dispatch}
            />
          </div>
        </>
      )}
      <footer className="app-footer">
        <label className="theme-picker">
          主题
          <select
            aria-label="切换主题"
            value={theme.id}
            onChange={(event) => setPreferences({ ...preferences, themeId: event.target.value })}
          >
            {GAME_THEMES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <span className="save-status">
          {snapshot.status === 'ready' ? (snapshot.isDirty ? '等待保存' : '已保存') : '本地存档'}
        </span>
        <details className="save-menu">
          <summary>存档</summary>
          <div>
            <button
              disabled={!ready || busy}
              onClick={() => run(() => runtime.flush(), '进度已保存。')}
            >
              立即保存
            </button>
            <button
              disabled={!ready || busy}
              onClick={() => run(() => runtime.exportSave(), '存档已导出。')}
            >
              导出存档
            </button>
            <button
              disabled={snapshot.status === 'loading' || busy}
              onClick={() => run(() => runtime.importSave(), '存档已导入。')}
            >
              导入存档
            </button>
            {windowPort.isDesktop && (
              <button
                disabled={!ready || busy}
                onClick={() => run(() => runtime.withSaveBarrier(() => windowPort.requestExit()))}
              >
                保存并退出
              </button>
            )}
          </div>
        </details>
      </footer>
    </main>
  );
}
