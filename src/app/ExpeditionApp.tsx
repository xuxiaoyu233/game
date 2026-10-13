import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type {
  ExpeditionCommand,
  ExpeditionDefinition,
  ExpeditionErrorCode,
} from '../domain/legacy/expedition/types';
import type { WindowPort } from '../platform/ports';
import type { ExpeditionRuntime } from '../runtime/legacy/expedition-runtime';
import { DEFAULT_THEME_ID, GAME_THEMES } from '../themes';
import { ExpeditionPanels } from './ExpeditionPanels';
import { formatAmount } from './format';
import { readPreferences, writePreferences } from './preferences';
import type { StoryArchiveUiEntry } from './story-archive-types';

const ACTION_ERRORS: Record<ExpeditionErrorCode, string> = {
  UNKNOWN_ID: '未找到对应内容，请重新打开游戏。',
  LOCKED: '先完成解锁条件。',
  WRONG_PHASE: '当前阶段不能执行这个操作。',
  INSUFFICIENT_RESOURCES: '还需要积累一些资源。',
  MAX_COUNT: '这类建筑已经建满。',
  COOLDOWN: '采集尚在冷却，稍等片刻。',
  ALREADY_CHOSEN: '这个事件已经作出选择。',
  ALREADY_PURCHASED: '这项永久能力已经兑换。',
  INVALID_SELECTION: '当前选择不符合解锁或装备条件。',
  TASK_NOT_READY: '先建成避难棚并守住两波怪潮。',
  PROJECT_ACTIVE: '当前项目尚未完工。',
  ALREADY_COMPLETED: '这项内容已经完成。',
  WORKER_UNAVAILABLE: '所选岗位没有可调配的人手。',
  EVENT_REQUIRED: '先处理当前出现的事件。',
  NUMERIC_LIMIT: '数值已达安全上限，请导出存档保留进度。',
  OUTPOST_WORKERS: '岗位人数必须与驻地人口一致。',
  OUTPOST_RECIPE_LOCKED: '先提升对应专业或归档所需副本记录。',
  OUTPOST_RECIPE_UNKNOWN: '找不到这项工坊配方，请重新打开驻地。',
  OUTPOST_RECIPE_TARGET: '制作批数或库存目标必须是有效的正整数。',
  OUTPOST_TARGET_CAPACITY: '库存目标超过当前物资上限；请先扩建驻地仓储。',
  OUTPOST_RESOURCES: '驻地原料不足，作业会等待库存补齐。',
  OUTPOST_STORAGE: '驻地仓储已满，释放空间后再继续。',
  OUTPOST_FACILITY_UNKNOWN: '找不到这项驻地设施，请重新打开游戏。',
  OUTPOST_FACILITY_MAX: '这项驻地设施已经建成。',
  ANCHOR_STABLE: '界锚稳定度已满，屏障组件未消耗。',
};

interface ExpeditionAppProps {
  readonly runtime: ExpeditionRuntime;
  readonly definition: ExpeditionDefinition;
  readonly windowPort: WindowPort;
  readonly storyArchiveEntries: readonly StoryArchiveUiEntry[];
}

export function ExpeditionApp({
  runtime,
  definition,
  windowPort,
  storyArchiveEntries,
}: ExpeditionAppProps) {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const saveMenu = useRef<HTMLDetailsElement>(null);
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
    }, 500);
    return () => clearInterval(timer);
  }, [runtime, snapshot.status]);
  useEffect(() => {
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

  function operate(operation: () => Promise<unknown>, success?: string): void {
    setBusy(true);
    setNotice(null);
    void operation()
      .then((result) => {
        if (success !== undefined && result !== false) setNotice(success);
      })
      .catch((error: unknown) => setNotice(error instanceof Error ? error.message : String(error)))
      .finally(() => setBusy(false));
  }

  function operateFromSaveMenu(operation: () => Promise<unknown>, success: string): void {
    if (saveMenu.current !== null) saveMenu.current.open = false;
    operate(operation, success);
  }

  function dispatch(command: ExpeditionCommand): void {
    operate(async () => {
      const result = await runtime.dispatch(command);
      setNotice(result.ok ? null : ACTION_ERRORS[result.error]);
    });
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
  const legacy = snapshot.state?.legacyArchive;

  return (
    <main className={`game expedition-game ${preferences.compact ? 'compact' : ''}`} style={style}>
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
            <>
              <button
                className="icon-button"
                aria-pressed={pinned}
                disabled={busy}
                onClick={() =>
                  operate(async () => {
                    await windowPort.setAlwaysOnTop(!pinned);
                    setPinned(!pinned);
                  })
                }
              >
                置顶
              </button>
              <button
                className="icon-button"
                disabled={!ready || busy}
                onClick={() => operate(() => runtime.withSaveBarrier(() => windowPort.hide()))}
              >
                收起
              </button>
            </>
          )}
        </div>
      </header>
      <div
        className={`scene scene-${theme.scene.variant} ${snapshot.state?.activeRun != null ? 'run-scene' : ''}`}
        aria-hidden="true"
      >
        <span className="scene-orbit" />
        <span className="scene-core" />
        <span className="scene-ground" />
        <span className="scene-dot dot-one" />
        <span className="scene-dot dot-two" />
      </div>
      {(snapshot.error ?? notice) !== null && (
        <p className="notice" role="status">
          {snapshot.error ?? notice}
        </p>
      )}
      {!ready && (
        <section className="panel loading-panel">
          <h2>{snapshot.status === 'loading' ? '正在准备旅程…' : '需要处理存档'}</h2>
          <p>进度保存在本机。加载完成后就能继续旅程。</p>
          {snapshot.status === 'error' && (
            <div className="recovery-actions">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => operate(() => runtime.start())}
              >
                重试加载
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => operate(() => runtime.recoverBackup(), '备份已恢复。')}
              >
                恢复备份
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => operate(() => runtime.importSave(), '存档已导入。')}
              >
                导入存档
              </button>
              {snapshot.state !== null && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => operate(() => runtime.exportSave(), '内存进度已导出。')}
                >
                  导出当前进度
                </button>
              )}
              {windowPort.isDesktop && snapshot.state === null && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => operate(() => windowPort.requestExit())}
                >
                  退出
                </button>
              )}
            </div>
          )}
        </section>
      )}
      {ready && snapshot.state !== null && snapshot.summary !== null && (
        <ExpeditionPanels
          definition={definition}
          state={snapshot.state}
          summary={snapshot.summary}
          busy={busy}
          onCommand={dispatch}
          storyArchiveEntries={storyArchiveEntries}
        />
      )}
      {legacy !== null && legacy !== undefined && (
        <details className="panel legacy-panel">
          <summary>已保留的原型旅程</summary>
          <p>原型进度完整保留在存档中。这份记录独立于新副本的临时木石。</p>
          <div className="reward-line">
            <span>累计采集</span>
            <strong>{formatAmount(legacy.totalGathered)}</strong>
          </div>
          <div className="reward-line">
            <span>采集车 / 加工站 / 无人机</span>
            <strong>
              {legacy.toolCounts.extractor ?? 0} / {legacy.toolCounts.processor ?? 0} /{' '}
              {legacy.toolCounts.drone ?? 0}
            </strong>
          </div>
          <p>
            已完成 {legacy.claimedTaskIds.length} 个任务 · 已兑换{' '}
            {legacy.purchasedUpgradeIds.length} 项升级
          </p>
        </details>
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
        <details className="save-menu" ref={saveMenu}>
          <summary>存档</summary>
          <div>
            <button
              disabled={!ready || busy}
              onClick={() => operateFromSaveMenu(() => runtime.flush(), '进度已保存。')}
            >
              立即保存
            </button>
            <button
              disabled={!ready || busy}
              onClick={() => operateFromSaveMenu(() => runtime.exportSave(), '存档已导出。')}
            >
              导出存档
            </button>
            <button
              disabled={snapshot.status === 'loading' || busy}
              onClick={() => operateFromSaveMenu(() => runtime.importSave(), '存档已导入。')}
            >
              导入存档
            </button>
            {windowPort.isDesktop && (
              <button
                disabled={!ready || busy}
                onClick={() =>
                  operate(() => runtime.withSaveBarrier(() => windowPort.requestExit()))
                }
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
