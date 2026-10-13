import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { PrototypeRuntime, SkillPrototypeV1Package } from './skill-prototype-types';
import type { SkillLoopCommand } from '../domain/skill-loop/types';
import type { WindowPort } from '../platform/ports';
import { readPreferences, writePreferences } from './preferences';
import { ACTION_ERRORS } from './action-errors';
import { PROTOTYPE_TABS, tabForAnchor, type PrototypeTabId } from './shell/tabs';
import { BankPage } from './shell/BankPage';
import { CurrentActivityBar } from './shell/CurrentActivityBar';
import { GrowthPage } from './shell/GrowthPage';
import { NextStepPanel } from './shell/NextStepPanel';
import { ReturnReportPanel } from './shell/ReturnReportPanel';
import { SaveMenu } from './shell/SaveMenu';
import { SkillMenu } from './shell/SkillMenu';
import { SkillPage } from './shell/SkillPage';
import { WindowActions } from './shell/WindowActions';
import './skill-prototype.css';

interface SkillPrototypeAppProps {
  readonly runtime: PrototypeRuntime;
  readonly content: SkillPrototypeV1Package;
  readonly windowPort: WindowPort;
}

const PREFERENCES_KEY = `skill-prototype-v1:${import.meta.env.DEV ? 'development' : 'release'}:preferences`;

/**
 * 原型编排层：订阅运行时快照、派发命令、持有页签与偏好状态。
 * 各展示区块拆在 `./shell/` 下，本文件只负责组装与跨区块的状态。
 */

export function SkillPrototypeApp({ runtime, content, windowPort }: SkillPrototypeAppProps) {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [activeTab, setActiveTab] = useState<PrototypeTabId>('training');
  const [anchorVersion, setAnchorVersion] = useState(0);
  const tabPanelRef = useRef<HTMLDivElement | null>(null);
  const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingAnchorId = useRef<string | null>(null);
  const [preferences, setPreferences] = useState(() =>
    readPreferences(content.theme.id, PREFERENCES_KEY),
  );
  const { definition, theme } = content;
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
  } as CSSProperties;
  const ready = snapshot.status === 'ready' && snapshot.state !== null && snapshot.summary !== null;
  const state = snapshot.state;
  const summary = snapshot.summary;
  const current = state?.currentActivity ?? null;
  const returnReport = state?.returnReport ?? null;
  const nextActivity = definition.activities.find(
    (activity) => activity.kind === 'gather' && summary?.availableActivityIds.includes(activity.id),
  );

  useEffect(() => {
    document.body.style.backgroundColor = theme.colors.background;
    return () => {
      document.body.style.backgroundColor = '';
    };
  }, [theme.colors.background]);

  useEffect(() => {
    writePreferences(preferences, PREFERENCES_KEY);
  }, [preferences]);

  useEffect(() => {
    if (snapshot.status !== 'ready' || state?.currentActivity?.status !== 'running') return;
    const timer = window.setInterval(() => {
      void runtime.dispatch({ kind: 'tick' }).catch(() => undefined);
    }, 500);
    return () => window.clearInterval(timer);
  }, [runtime, snapshot.status, state?.currentActivity?.status]);

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

  function actionFor(activityId: string): SkillLoopCommand {
    if (current?.activityId === activityId) return { kind: 'resume-activity' };
    return current === null
      ? { kind: 'start-activity', activityId }
      : { kind: 'switch-activity', activityId };
  }

  function navigateToAnchor(targetId: string): void {
    pendingAnchorId.current = targetId;
    setActiveTab(tabForAnchor(targetId));
    setAnchorVersion((version) => version + 1);
  }

  function handleAnchorClick(event: MouseEvent<HTMLAnchorElement>, targetId: string): void {
    event.preventDefault();
    navigateToAnchor(targetId);
  }

  function focusTab(index: number): void {
    const tab = PROTOTYPE_TABS[index];
    if (tab === undefined) return;
    setActiveTab(tab.id);
    tabButtonRefs.current[index]?.focus();
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const lastIndex = PROTOTYPE_TABS.length - 1;
    if (event.key === 'ArrowRight') focusTab(index === lastIndex ? 0 : index + 1);
    else if (event.key === 'ArrowLeft') focusTab(index === 0 ? lastIndex : index - 1);
    else if (event.key === 'Home') focusTab(0);
    else if (event.key === 'End') focusTab(lastIndex);
    else return;
    event.preventDefault();
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
  const atStageEnd = summary.prototypeComplete;
  const themeStyle = style;

  return (
    <main className={`skill-prototype ${preferences.compact ? 'compact' : ''}`} style={themeStyle}>
      <header className="skill-prototype-header">
        <div>
          <p className="skill-prototype-kicker">{theme.uiCopy.productKicker}</p>
          <h1>{theme.title}</h1>
        </div>
        <WindowActions
          compact={preferences.compact}
          pinned={pinned}
          busy={busy}
          windowPort={windowPort}
          onToggleCompact={() => setPreferences({ ...preferences, compact: !preferences.compact })}
          onTogglePinned={async () => {
            await windowPort.setAlwaysOnTop(!pinned);
            setPinned(!pinned);
          }}
          onHide={() => operate(() => runtime.withSaveBarrier(() => windowPort.hide()))}
        />
        {returnReport !== null && (
          <button
            className="skill-prototype-return-shortcut"
            data-testid="open-return-report"
            onClick={() => navigateToAnchor('return-report')}
          >
            离线进展待确认
          </button>
        )}
      </header>

      <CurrentActivityBar
        content={content}
        theme={theme}
        state={state}
        current={current}
        nextActivity={nextActivity}
        busy={busy}
        onDispatch={dispatch}
      />

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

      <NextStepPanel
        content={content}
        theme={theme}
        state={state}
        summary={summary}
        current={current}
        atStageEnd={atStageEnd}
        busy={busy}
        onDispatch={dispatch}
        onAnchorClick={handleAnchorClick}
      />

      <SkillMenu
        activeTab={activeTab}
        tabButtonRefs={tabButtonRefs}
        onSelect={setActiveTab}
        onKeyDown={handleTabKeyDown}
      />

      <div
        className="skill-prototype-tab-panel"
        id="skill-prototype-tab-panel"
        role="tabpanel"
        aria-labelledby={`prototype-tab-${activeTab}`}
        data-testid="tab-panel"
        ref={tabPanelRef}
      >
        {activeTab === 'training' && (
          <>
            {returnReport !== null && (
              <ReturnReportPanel
                content={content}
                theme={theme}
                returnReport={returnReport}
                summary={summary}
                busy={busy}
                onDispatch={dispatch}
                onAnchorClick={handleAnchorClick}
              />
            )}

            <SkillPage
              content={content}
              theme={theme}
              state={state}
              summary={summary}
              current={current}
              busy={busy}
              actionFor={actionFor}
              onDispatch={dispatch}
            />
          </>
        )}

        {activeTab === 'warehouse' && (
          <BankPage content={content} theme={theme} state={state} summary={summary} />
        )}

        {activeTab === 'growth' && (
          <GrowthPage
            content={content}
            theme={theme}
            state={state}
            summary={summary}
            atStageEnd={atStageEnd}
            busy={busy}
            onDispatch={dispatch}
          />
        )}

        <SaveMenu runtime={runtime} busy={busy} ready={ready} operate={operate} />
      </div>
    </main>
  );
}
