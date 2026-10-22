import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import type { SkillPrototypeV1Package } from './skill-prototype-types';
import type {
  SkillLoopCommand,
  SkillLoopErrorCode,
  SkillLoopState,
  SkillLoopSummary,
} from '../domain/skill-loop/types';
import { getEraId } from '../domain/skill-loop/eras';
import type { WindowPort } from '../platform/ports';
import type { GameRuntime } from '../runtime/game-runtime';
import { getEraDefinition } from '../themes/eras';
import { readPreferences, writePreferences } from './preferences';
import { toggleIdle, WINDOW_MODES, type WindowMode } from './window-mode';
import { PrototypeHeader } from './skill-prototype/PrototypeHeader';
import { ActivityStatusBar } from './skill-prototype/ActivityStatusBar';
import { ProgressFloats } from './skill-prototype/ProgressFloats';
import { useProgressFeedback } from './skill-prototype/use-progress-feedback';
import { SkillGrid } from './skill-prototype/SkillGrid';
import { RecordsPanel } from './skill-prototype/RecordsPanel';
import { SkillDetail } from './skill-prototype/SkillDetail';
import { WarehousePanel } from './skill-prototype/WarehousePanel';
import { GrowthPanel } from './skill-prototype/GrowthPanel';
import { ReturnReportCard } from './skill-prototype/ReturnReportCard';
import { SaveMenu } from './skill-prototype/SaveMenu';
import { TreeView } from './skill-prototype/tree/TreeView';
import type { TreeDefinition } from '../domain/skill-loop/tree';
import './skill-prototype.css';

export type PrototypeRuntime = GameRuntime<
  SkillPrototypeV1Package['definition'],
  SkillLoopState,
  SkillLoopCommand,
  SkillLoopSummary,
  SkillLoopErrorCode
>;

interface SkillPrototypeAppProps {
  readonly runtime: PrototypeRuntime;
  readonly content: SkillPrototypeV1Package;
  readonly windowPort: WindowPort;
  /** Tree layouts are content; the app layer may not import the content package directly. */
  readonly trees: readonly TreeDefinition[];
}

const PROTOTYPE_TABS = [
  { id: 'training', label: '训练' },
  { id: 'warehouse', label: '仓库' },
  { id: 'growth', label: '成长' },
  { id: 'records', label: '记录' },
] as const;

type PrototypeTabId = (typeof PROTOTYPE_TABS)[number]['id'];

const PREFERENCES_KEY = `skill-prototype-v1:${import.meta.env.DEV ? 'development' : 'release'}:preferences`;

const ACTION_ERRORS: Record<SkillLoopErrorCode, string> = {
  UNKNOWN_ACTIVITY: '找不到这项活动，请重新打开原型。',
  UNKNOWN_UPGRADE: '找不到这项工具提升。',
  UNKNOWN_ITEM: '找不到这个物品，请重新打开原型。',
  UNKNOWN_OFFER: '找不到这项商店报价。',
  UNKNOWN_SELL_OFFER: '找不到这项出售报价。',
  INSUFFICIENT_MASTERY_POOL: '精通池余量不足；本次兑换没有发生。',
  MASTERY_POOL_CAP_EXCEEDED: '兑换会越过该活动的精通上限；本次兑换没有发生。',
  NOT_CONSUMABLE: '这个物品不能食用。',
  LOCKED: '先提升对应技能等级。',
  ACTIVITY_ALREADY_RUNNING: '先暂停或切换当前活动。',
  NO_ACTIVITY_TO_PAUSE: '当前没有正在运行的活动。',
  NO_ACTIVITY_TO_RESUME: '当前没有可恢复的活动。',
  INSUFFICIENT_RESOURCES: '材料不足；现有库存没有被扣除。',
  ALREADY_PURCHASED: '这项工具提升已经完成。',
  INVALID_MASTERY_AMOUNT: '兑换数量必须是不小于 1 的整数；本次兑换没有发生。',
  NUMERIC_LIMIT: '数值达到安全上限，本次结算未写入；请导出存档保留进度。',
};

export function SkillPrototypeApp({ runtime, content, windowPort, trees }: SkillPrototypeAppProps) {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [activeTab, setActiveTab] = useState<PrototypeTabId>('training');
  // Which skill detail is open. Browsing is not a game fact, so it stays in memory only.
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  // Window shape is a view concern: it never enters the save, and switching it only re-crops the
  // same tree (panels are hidden, never unmounted), so scroll position and the open skill survive.
  const [mode, setMode] = useState<WindowMode>('active');
  const [anchorVersion, setAnchorVersion] = useState(0);
  const tabPanelRef = useRef<HTMLDivElement | null>(null);
  const pendingAnchorId = useRef<string | null>(null);
  const [preferences, setPreferences] = useState(() =>
    readPreferences(content.theme.id, PREFERENCES_KEY),
  );
  const { definition, theme } = content;
  const ready = snapshot.status === 'ready' && snapshot.state !== null && snapshot.summary !== null;
  const state = snapshot.state;
  const summary = snapshot.summary;
  // Era is derived, never stored: the palette follows the level and tool facts the engine holds,
  // so it can never drift from the save and needs no migration of its own.
  const eraId = state === null ? 'primitive' : getEraId(state, definition);
  const era = getEraDefinition(eraId);
  const style = {
    '--background': era.colors.background,
    '--surface': era.colors.surface,
    '--surface-raised': era.colors.surfaceRaised,
    '--text': era.colors.text,
    '--muted': era.colors.muted,
    '--accent': era.colors.accent,
    '--accent-soft': era.colors.accentSoft,
    '--border': era.colors.border,
    '--era-glow': era.glow,
    '--era-backdrop': era.backdrop,
    // Era scene artwork + semantic tone hues, both selected by the derived era id only.
    '--era-scene': era.scene,
    '--tone-gather': era.tones.gather,
    '--tone-craft': era.tones.craft,
    '--tone-support': era.tones.support,
  } as CSSProperties;
  const returnReport = state?.returnReport ?? null;
  const startActivity = definition.activities.find(
    (activity) => activity.kind === 'gather' && summary?.availableActivityIds.includes(activity.id),
  );
  const openSkill =
    selectedSkillId !== null && definition.skills.some((skill) => skill.id === selectedSkillId)
      ? selectedSkillId
      : null;
  const labelForItem = useCallback(
    (itemId: string) => theme.itemCopy[itemId]?.label ?? itemId,
    [theme],
  );
  const { floats, levelUpSkillId } = useProgressFeedback(state, summary, labelForItem);

  useEffect(() => {
    document.body.style.backgroundColor = era.colors.background;
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, [era.colors.background]);

  useEffect(() => {
    writePreferences(preferences, PREFERENCES_KEY);
  }, [preferences]);

  useEffect(() => {
    const spec = WINDOW_MODES[mode];
    // The browser build has no setSize (a page cannot resize its own window); it still switches
    // data-mode so the strip layout is inspectable in the dev server.
    void windowPort.setSize?.(spec.width, spec.height).catch(() => undefined);
    if (mode === 'idle') void windowPort.setAlwaysOnTop(true).catch(() => undefined);
  }, [mode, windowPort]);

  useEffect(() => {
    // Tick while an activity runs or a consumable buff is counting down, so the buff
    // timer stays live even with no activity selected.
    const needsTicks =
      snapshot.status === 'ready' &&
      (state?.currentActivity?.status === 'running' || (state?.buffs?.length ?? 0) > 0);
    if (!needsTicks) return;
    const timer = window.setInterval(() => {
      void runtime.dispatch({ kind: 'tick' }).catch(() => undefined);
    }, 500);
    return () => window.clearInterval(timer);
  }, [runtime, snapshot.status, state?.currentActivity?.status, state?.buffs?.length]);

  useEffect(() => {
    const save = () => void runtime.flush().catch(() => undefined);
    window.addEventListener('blur', save);
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('blur', save);
      window.removeEventListener('pagehide', save);
    };
  }, [runtime]);

  useEffect(() => {
    const panel = tabPanelRef.current;
    if (panel === null) return;

    const anchorId = pendingAnchorId.current;
    if (anchorId === null) {
      panel.scrollTop = 0;
      return;
    }

    const target = document.getElementById(anchorId);
    if (target !== null && panel.contains(target)) {
      target.scrollIntoView({ block: 'start' });
      pendingAnchorId.current = null;
      return;
    }

    pendingAnchorId.current = null;
    panel.scrollTop = 0;
  }, [activeTab, anchorVersion]);

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

  function dispatch(command: SkillLoopCommand): void {
    operate(async () => {
      const result = await runtime.dispatch(command);
      if (!result.ok) setNotice(ACTION_ERRORS[result.error]);
    });
  }

  function navigateToAnchor(targetId: string): void {
    pendingAnchorId.current = targetId;
    // A skill anchor opens that skill's detail, where the anchor element then lives.
    if (targetId.startsWith('skill-progress-'))
      setSelectedSkillId(targetId.slice('skill-progress-'.length));
    setActiveTab(targetId.startsWith('upgrade-') ? 'growth' : 'training');
    setAnchorVersion((version) => version + 1);
  }

  function handleAnchorClick(event: MouseEvent<HTMLAnchorElement>, targetId: string): void {
    event.preventDefault();
    navigateToAnchor(targetId);
  }

  if (snapshot.status === 'loading')
    return <main className="skill-prototype-loading">正在恢复本地原型存档…</main>;

  if (snapshot.status === 'error' && state === null) {
    return (
      <main className="skill-prototype-loading" role="alert">
        <h1>{theme.title}</h1>
        <p>{snapshot.error}</p>
        <button onClick={() => operate(() => runtime.start())}>重试加载</button>
        <button onClick={() => operate(() => runtime.recoverBackup())}>从备份恢复</button>
        <button onClick={() => operate(() => runtime.importSave())}>导入兼容存档</button>
      </main>
    );
  }

  if (state === null || summary === null) return <p role="alert">原型状态不可用。</p>;

  return (
    <main
      className={`skill-prototype ${preferences.compact ? 'compact' : ''}`}
      style={style}
      data-era={eraId}
      data-mode={mode}
    >
      {/* Ambient layers behind the shell, bottom-up: the era scene artwork (very dark, low
          contrast, registered in src/themes/assets/SOURCES.md), then two era-hued aurora blobs
          that drift slowly and give the frosted bars something to blur. Neither holds focus. */}
      <div className="skill-prototype-scene" aria-hidden="true" />
      <div className="skill-prototype-aurora" aria-hidden="true">
        <div className="skill-prototype-aurora-blob skill-prototype-aurora-blob-a" />
        <div className="skill-prototype-aurora-blob skill-prototype-aurora-blob-b" />
      </div>

      <PrototypeHeader
        theme={theme}
        windowPort={windowPort}
        eraId={eraId}
        compact={preferences.compact}
        pinned={pinned}
        busy={busy}
        hasPendingReturn={returnReport !== null}
        onToggleCompact={() => setPreferences({ ...preferences, compact: !preferences.compact })}
        onTogglePinned={() =>
          operate(async () => {
            await windowPort.setAlwaysOnTop(!pinned);
            setPinned(!pinned);
          })
        }
        onHide={() => operate(() => runtime.withSaveBarrier(() => windowPort.hide()))}
        onOpenReturnReport={() => navigateToAnchor('return-report')}
        mode={mode}
        onToggleIdle={() => setMode((current) => toggleIdle(current))}
      />

      <div className="skill-prototype-status-wrap">
        {mode === 'idle' && (
          <button
            className="skill-prototype-idle-art"
            type="button"
            aria-label="回到大窗"
            data-testid="window-mode-restore"
            onClick={() => setMode('active')}
          />
        )}
        <ActivityStatusBar
          theme={theme}
          definition={definition}
          state={state}
          summary={summary}
          busy={busy}
          startActivityId={startActivity?.id}
          onCommand={dispatch}
          onStartFirst={() => {
            if (startActivity !== undefined)
              dispatch({ kind: 'start-activity', activityId: startActivity.id });
          }}
          onAnchorClick={handleAnchorClick}
        />
        <ProgressFloats floats={floats} theme={theme} />
      </div>

      {notice !== null && (
        <p className="skill-prototype-notice" role="status">
          {notice}
        </p>
      )}
      {snapshot.error !== null && (
        <p className="skill-prototype-save-warning" role="alert">
          {snapshot.error}
        </p>
      )}

      <nav className="skill-prototype-tabs" aria-label="游戏页面">
        {PROTOTYPE_TABS.map((tab) => (
          <button
            className="skill-prototype-tab"
            type="button"
            key={tab.id}
            aria-pressed={activeTab === tab.id}
            aria-controls="skill-prototype-tab-panel"
            data-testid={`tab-${tab.id}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {mode === 'tree' && (
        <TreeView
          theme={theme}
          definition={definition}
          state={state}
          trees={trees}
          onBackToTraining={() => setMode('active')}
          onOpenSkill={(skillId) => {
            setSelectedSkillId(skillId);
            setActiveTab('training');
            setMode('active');
          }}
        />
      )}

      <div
        className="skill-prototype-tab-panel"
        id="skill-prototype-tab-panel"
        role="region"
        aria-label={`${PROTOTYPE_TABS.find((tab) => tab.id === activeTab)?.label ?? '页面'}内容`}
        data-testid="tab-panel"
        ref={tabPanelRef}
      >
        {activeTab === 'training' && (
          <>
            {returnReport !== null && (
              <ReturnReportCard
                theme={theme}
                definition={definition}
                report={returnReport}
                summary={summary}
                busy={busy}
                onCommand={dispatch}
                onAnchorClick={handleAnchorClick}
              />
            )}
            {/* One tree, two crops: below 720px the list and the detail take turns (as before), at
                720px and above they sit side by side so picking a skill no longer costs a trip. */}
            <div
              className={`skill-prototype-training-split${
                openSkill === null ? ' is-list-only' : ' is-detail-open'
              }`}
            >
              <div className="skill-prototype-training-list">
                <SkillGrid
                  theme={theme}
                  definition={definition}
                  state={state}
                  summary={summary}
                  levelUpSkillId={levelUpSkillId}
                  onSelectSkill={setSelectedSkillId}
                  onOpenTree={() => setMode('tree')}
                />
              </div>
              <div className="skill-prototype-training-detail">
                {openSkill === null ? (
                  <p className="skill-prototype-split-hint">
                    选择一个技能，右侧显示它的活动、工具提升与精通进度。
                  </p>
                ) : (
                  <SkillDetail
                    theme={theme}
                    definition={definition}
                    state={state}
                    summary={summary}
                    busy={busy}
                    skillId={openSkill}
                    onBack={() => setSelectedSkillId(null)}
                    onCommand={dispatch}
                  />
                )}
              </div>
            </div>
          </>
        )}

        {activeTab === 'warehouse' && (
          <WarehousePanel
            theme={theme}
            definition={definition}
            state={state}
            summary={summary}
            busy={busy}
            onCommand={dispatch}
          />
        )}

        {activeTab === 'growth' && (
          <GrowthPanel
            theme={theme}
            definition={definition}
            state={state}
            summary={summary}
            busy={busy}
            onCommand={dispatch}
          />
        )}

        {activeTab === 'records' && (
          <RecordsPanel theme={theme} definition={definition} state={state} summary={summary} />
        )}

        <SaveMenu runtime={runtime} ready={ready} busy={busy} onOperate={operate} />
      </div>
    </main>
  );
}
