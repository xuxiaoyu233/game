import { useEffect, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { SkillPrototypeV1Package } from './skill-prototype-types';
import type {
  SkillLoopCommand,
  SkillLoopErrorCode,
  SkillLoopState,
  SkillLoopSummary,
} from '../domain/skill-loop/types';
import type { WindowPort } from '../platform/ports';
import type { GameRuntime } from '../runtime/game-runtime';
import { readPreferences, writePreferences } from './preferences';
import './skill-prototype.css';

type PrototypeRuntime = GameRuntime<
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
}

const PREFERENCES_KEY = `skill-prototype-v1:${import.meta.env.DEV ? 'development' : 'release'}:preferences`;

const ACTION_ERRORS: Record<SkillLoopErrorCode, string> = {
  UNKNOWN_ACTIVITY: '找不到这项活动，请重新打开原型。',
  UNKNOWN_UPGRADE: '找不到这项工具提升。',
  LOCKED: '先提升对应技能等级。',
  ACTIVITY_ALREADY_RUNNING: '先暂停或切换当前活动。',
  NO_ACTIVITY_TO_PAUSE: '当前没有正在运行的活动。',
  NO_ACTIVITY_TO_RESUME: '当前没有可恢复的活动。',
  INSUFFICIENT_RESOURCES: '材料不足；现有库存没有被扣除。',
  ALREADY_PURCHASED: '这项工具提升已经完成。',
  NUMERIC_LIMIT: '数值达到安全上限，本次结算未写入；请导出存档保留进度。',
};

function formatCount(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(value);
}

function formatSeconds(milliseconds: number): string {
  const seconds = milliseconds / 1_000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)} 秒`;
}

function formatElapsed(milliseconds: number): string {
  const minutes = Math.floor(milliseconds / 60_000);
  if (minutes < 1) return '不足 1 分钟';
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours === 0 ? `${minutes} 分钟` : `${hours} 小时 ${remainingMinutes} 分钟`;
}

function getRecipeInputs(
  activityId: string,
  content: SkillPrototypeV1Package,
): readonly { readonly itemId: string; readonly amount: number }[] {
  const activity = content.definition.activities.find((entry) => entry.id === activityId);
  if (activity?.kind !== 'craft') return [];
  return content.definition.recipes.find((recipe) => recipe.id === activity.recipeId)?.inputs ?? [];
}

function missingMaterials(
  inventory: Readonly<Record<string, number>>,
  inputs: readonly { readonly itemId: string; readonly amount: number }[],
  content: SkillPrototypeV1Package,
): string[] {
  return inputs.flatMap((input) => {
    const missing = input.amount - (inventory[input.itemId] ?? 0);
    if (missing <= 0) return [];
    return [`${content.theme.itemCopy[input.itemId]?.label ?? input.itemId} × ${missing}`];
  });
}

export function SkillPrototypeApp({ runtime, content, windowPort }: SkillPrototypeAppProps) {
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pinned, setPinned] = useState(false);
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
  const currentDefinition =
    current === null
      ? undefined
      : definition.activities.find((activity) => activity.id === current.activityId);
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
          <p className="skill-prototype-kicker">本地技能放置切片 · P3</p>
          <h1>{theme.title}</h1>
        </div>
        <div className="skill-prototype-window-actions">
          <button
            className="quiet-button"
            aria-pressed={preferences.compact}
            onClick={() => setPreferences({ ...preferences, compact: !preferences.compact })}
          >
            {preferences.compact ? '展开' : '简洁'}
          </button>
          {windowPort.isDesktop && (
            <>
              <button
                className="quiet-button"
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
                className="quiet-button"
                disabled={busy}
                onClick={() => operate(() => runtime.withSaveBarrier(() => windowPort.hide()))}
              >
                收起
              </button>
            </>
          )}
        </div>
      </header>

      {returnReport !== null && (
        <section
          className="skill-prototype-return-report"
          aria-label="回访结算"
          data-testid="return-report"
        >
          <div className="skill-prototype-section-heading">
            <h2>离线进展</h2>
            <span>本次结算已写入存档</span>
          </div>
          <p>
            离开 {formatElapsed(returnReport.elapsedMs)}；结算窗口{' '}
            {formatElapsed(returnReport.settlementWindowMs)}
            {returnReport.offlineCapReached && '，已达到离线时长上限'}。
            {returnReport.offlineCapReached && '剩余时间不会自动切换到其他活动。'}
          </p>
          <ul className="skill-prototype-return-deltas">
            {definition.items.flatMap((item) => {
              const delta = returnReport.inventoryDelta[item.id] ?? 0;
              return delta === 0
                ? []
                : [
                    <li key={`item-${item.id}`}>
                      库存 · {theme.itemCopy[item.id]?.label ?? item.id} {delta > 0 ? '+' : ''}
                      {formatCount(delta)}
                    </li>,
                  ];
            })}
            {definition.skills.flatMap((skill) => {
              const delta = returnReport.skillXpDelta[skill.id] ?? 0;
              return delta === 0
                ? []
                : [
                    <li key={`xp-${skill.id}`}>
                      经验 · {theme.skillCopy[skill.id]?.label ?? skill.id} +{formatCount(delta)} XP
                    </li>,
                  ];
            })}
            {returnReport.unlockedActivityIds.map((activityId) => (
              <li key={`unlock-${activityId}`}>
                已解锁 · {theme.activityCopy[activityId]?.label ?? activityId}
              </li>
            ))}
          </ul>
          <p className="skill-prototype-return-continuation">
            {returnReport.reason === 'continuing' && '原活动仍在进行，可继续当前作业。'}
            {returnReport.reason === 'insufficient-materials' &&
              '制作材料耗尽后活动已停止；补齐材料或选择其他活动即可继续。'}
            {returnReport.reason === 'paused' && '活动保持暂停，本次离开期间没有生产。'}
            {returnReport.reason === 'no-activity' && '返回时没有正在运行的活动。'}
          </p>
          <button
            className="primary-button"
            data-testid="acknowledge-return-report"
            disabled={busy}
            onClick={() => dispatch({ kind: 'acknowledge-return-report' })}
          >
            继续游戏
          </button>
        </section>
      )}

      <section className="skill-prototype-primary" aria-label="当前活动">
        {current === null ? (
          <>
            <div>
              <p className="skill-prototype-kicker">从零开始</p>
              <h2>先采集基础矿料</h2>
              <p>采掘不消耗材料；之后可冶炼金属锭并锻造工具坯。</p>
            </div>
            <button
              className="primary-button"
              data-testid="start-first-activity"
              disabled={busy || nextActivity === undefined}
              onClick={() => {
                if (nextActivity !== undefined)
                  dispatch({ kind: 'start-activity', activityId: nextActivity.id });
              }}
            >
              开始采集基础矿料
            </button>
          </>
        ) : (
          <>
            <div className="skill-prototype-active-heading">
              <div>
                <p className="skill-prototype-kicker">
                  {current.status === 'running'
                    ? '正在重复作业'
                    : current.status === 'paused'
                      ? '活动已暂停'
                      : current.stopReason === 'insufficient-materials'
                        ? '材料不足，活动已停止'
                        : '活动已停止'}
                </p>
                <h2>{theme.activityCopy[current.activityId]?.label ?? current.activityId}</h2>
              </div>
              <strong>{formatSeconds(current.cycleDurationMs)}</strong>
            </div>
            <progress
              className="skill-prototype-progress"
              max={current.cycleDurationMs}
              value={current.progressMs}
              aria-label="当前周期进度"
            />
            <p className="skill-prototype-active-copy">
              {current.stopReason === 'insufficient-materials'
                ? `缺少：${missingMaterials(
                    state.inventory,
                    getRecipeInputs(current.activityId, content),
                    content,
                  ).join('、')}`
                : currentDefinition === undefined
                  ? ''
                  : theme.activityCopy[currentDefinition.id]?.description}
            </p>
            <div className="skill-prototype-primary-actions">
              {current.status === 'running' ? (
                <button
                  className="primary-button"
                  disabled={busy}
                  onClick={() => dispatch({ kind: 'pause-activity' })}
                >
                  暂停活动
                </button>
              ) : (
                <button
                  className="primary-button"
                  disabled={
                    busy ||
                    missingMaterials(
                      state.inventory,
                      getRecipeInputs(current.activityId, content),
                      content,
                    ).length > 0
                  }
                  onClick={() => dispatch({ kind: 'resume-activity' })}
                >
                  恢复活动
                </button>
              )}
              {state.currentActivity !== null &&
                nextActivity !== undefined &&
                nextActivity.id !== current.activityId && (
                  <button
                    className="quiet-button"
                    disabled={busy}
                    onClick={() =>
                      dispatch({ kind: 'switch-activity', activityId: nextActivity.id })
                    }
                  >
                    切换到采集基础矿料
                  </button>
                )}
            </div>
          </>
        )}
      </section>

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

      <section className="skill-prototype-section" aria-labelledby="skill-progress-title">
        <div className="skill-prototype-section-heading">
          <h2 id="skill-progress-title">技能</h2>
          <span>技能等级开放活动；浏览不会改变当前作业</span>
        </div>
        <div className="skill-prototype-skill-grid">
          {definition.skills.map((skill) => {
            const progress = summary.skills[skill.id];
            const copy = theme.skillCopy[skill.id];
            if (progress === undefined || copy === undefined) return null;
            const threshold = progress.xpForNextLevel;
            const progressMax = threshold ?? progress.xpCeiling ?? Math.max(progress.xp, 1);
            const progressValue =
              threshold !== null
                ? Math.min(progress.xp, threshold)
                : progress.xpCeiling !== null
                  ? Math.min(progress.xp, progress.xpCeiling)
                  : 1;
            return (
              <article
                className="skill-prototype-skill"
                data-testid={`skill-progress-${skill.id}`}
                key={skill.id}
              >
                <div className="skill-prototype-skill-heading">
                  <h3>{copy.label}</h3>
                  <span>Lv {progress.level}</span>
                </div>
                <p>{copy.description}</p>
                <progress
                  max={progressMax}
                  value={progressValue}
                  aria-label={`${copy.label}经验`}
                />
                <small>
                  {formatCount(progress.xp)} XP
                  {threshold === null
                    ? ` · 当前等级上限 Lv ${progress.maximumLevel}`
                    : ` / ${formatCount(threshold)} XP`}
                  {progress.atPrototypeCap && ' · 已达当前原型经验上限'}
                </small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="skill-prototype-section" aria-labelledby="activity-list-title">
        <div className="skill-prototype-section-heading">
          <h2 id="activity-list-title">活动</h2>
          <span>一次只运行一项；切换会放弃未完成周期</span>
        </div>
        <div className="skill-prototype-activity-list">
          {definition.activities.map((activity) => {
            const active = current?.activityId === activity.id;
            const unlocked = summary.availableActivityIds.includes(activity.id);
            const requirements = getRecipeInputs(activity.id, content);
            const missing = missingMaterials(state.inventory, requirements, content);
            const skill = summary.skills[activity.skillId];
            const skillCopy = theme.skillCopy[activity.skillId];
            const itemOutputs =
              activity.kind === 'gather'
                ? activity.outputs
                : (definition.recipes.find((recipe) => recipe.id === activity.recipeId)?.outputs ??
                  []);
            const actionLabel = !unlocked
              ? `需要${skillCopy?.label ?? activity.skillId} Lv ${activity.requiredLevel}`
              : active
                ? current?.status === 'running'
                  ? '正在运行'
                  : '恢复此活动'
                : current === null
                  ? '开始活动'
                  : '切换到此活动';
            return (
              <article
                className={`skill-prototype-activity ${!unlocked ? 'locked' : ''}`}
                key={activity.id}
              >
                <div className="skill-prototype-activity-copy">
                  <div className="skill-prototype-activity-title">
                    <h3>{theme.activityCopy[activity.id]?.label ?? activity.id}</h3>
                    <span>
                      {skillCopy?.label ?? activity.skillId} · Lv {activity.requiredLevel}
                    </span>
                  </div>
                  <p>{theme.activityCopy[activity.id]?.description}</p>
                  <small>
                    {formatSeconds(activity.durationMs)} · {activity.xpPerCycle} XP
                    {skillCopy?.label ?? activity.skillId}
                    {requirements.length > 0 &&
                      ` · 消耗 ${requirements.map((entry) => `${theme.itemCopy[entry.itemId]?.label} × ${entry.amount}`).join('、')}`}
                    {` · 产出 ${itemOutputs.map((entry) => `${theme.itemCopy[entry.itemId]?.label} × ${entry.amount}`).join('、')}`}
                  </small>
                  {missing.length > 0 && unlocked && (
                    <small className="skill-prototype-missing">缺少：{missing.join('、')}</small>
                  )}
                </div>
                <button
                  className={
                    active && current?.status === 'running' ? 'quiet-button' : 'secondary-button'
                  }
                  data-testid={`activity-action-${activity.id}`}
                  disabled={
                    busy ||
                    !unlocked ||
                    (active && current?.status === 'running') ||
                    (missing.length > 0 && (!active || current?.status !== 'running'))
                  }
                  onClick={() => dispatch(actionFor(activity.id))}
                  aria-label={`${actionLabel}：${theme.activityCopy[activity.id]?.label ?? activity.id}`}
                >
                  {actionLabel}
                </button>
                {skill?.atPrototypeCap && unlocked && (
                  <span className="skill-prototype-cap-tag">本原型最高等级</span>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="skill-prototype-section" aria-labelledby="inventory-title">
        <div className="skill-prototype-section-heading">
          <h2 id="inventory-title">库存</h2>
          <span>物品由活动产出、由配方或工具提升消耗</span>
        </div>
        <div className="skill-prototype-inventory">
          {definition.items.map((item) => (
            <article
              className="skill-prototype-item"
              key={item.id}
              data-testid={`inventory-${item.id}`}
            >
              <span>{theme.categoryCopy[item.categoryId]?.label}</span>
              <strong>{theme.itemCopy[item.id]?.label ?? item.id}</strong>
              <output>{formatCount(state.inventory[item.id] ?? 0)}</output>
            </article>
          ))}
        </div>
      </section>

      <section
        className="skill-prototype-section skill-prototype-next"
        aria-labelledby="next-title"
      >
        <div className="skill-prototype-section-heading">
          <h2 id="next-title">发展路线</h2>
          <span>当前内容边界</span>
        </div>
        {definition.toolUpgrades.map((upgrade) => {
          const tool = definition.tools.find((candidate) => candidate.id === upgrade.toolId);
          const copy = theme.toolCopy[upgrade.id];
          const itemLabel = theme.itemCopy[upgrade.requiredItemId]?.label ?? upgrade.requiredItemId;
          const currentLevel = state.toolLevels[upgrade.toolId] ?? 0;
          const purchased = currentLevel >= upgrade.targetLevel;
          const available = summary.availableToolUpgradeIds.includes(upgrade.id);
          const quantity = state.inventory[upgrade.requiredItemId] ?? 0;
          return (
            <article className="skill-prototype-upgrade" key={upgrade.id}>
              <div>
                <strong>{copy?.label ?? upgrade.id}</strong>
                <p>
                  {copy?.effect ?? '提升工具效率'} · 消耗 {itemLabel} × {upgrade.requiredAmount}
                </p>
                {tool !== undefined && (
                  <small>
                    {theme.toolCopy[tool.id]?.label ?? tool.id} · 等级 {upgrade.sourceLevel} →{' '}
                    {upgrade.targetLevel}
                  </small>
                )}
              </div>
              {purchased ? (
                <span
                  className="skill-prototype-upgrade-complete"
                  data-testid={`upgrade-complete-${upgrade.id}`}
                >
                  已完成
                </span>
              ) : available ? (
                <button
                  className="secondary-button"
                  data-testid={`upgrade-${upgrade.id}`}
                  disabled={busy}
                  onClick={() => dispatch({ kind: 'buy-tool-upgrade', upgradeId: upgrade.id })}
                >
                  完成工具提升
                </button>
              ) : (
                <small className="skill-prototype-route-note">
                  尚需 {itemLabel} × {Math.max(0, upgrade.requiredAmount - quantity)}
                </small>
              )}
            </article>
          );
        })}
        {summary.nextUnlocks.length > 0 ? (
          <ul className="skill-prototype-unlocks">
            {summary.nextUnlocks.map((unlock) => (
              <li key={unlock.activityId}>
                {theme.skillCopy[unlock.skillId]?.label} Lv {unlock.level}：
                {theme.activityCopy[unlock.activityId]?.label}
              </li>
            ))}
          </ul>
        ) : (
          <p className="skill-prototype-route-note">
            当前定义的技能活动均已开放；继续训练或查看上方工具提升，选择下一步。
          </p>
        )}
        {atStageEnd && (
          <p className="skill-prototype-stage-end" role="status">
            当前原型切片已到已定义的技能与工具上限；后续成长内容尚未接入。
          </p>
        )}
      </section>

      <details className="skill-prototype-save-menu">
        <summary>本地存档</summary>
        <div>
          <button
            className="quiet-button"
            disabled={busy || !ready}
            onClick={() => operate(() => runtime.flush(), '存档已保存。')}
          >
            立即保存
          </button>
          <button
            className="quiet-button"
            disabled={busy || !ready}
            onClick={() => operate(() => runtime.exportSave())}
          >
            导出
          </button>
          <button
            className="quiet-button"
            disabled={busy || !ready}
            onClick={() => operate(() => runtime.importSave())}
          >
            导入兼容存档
          </button>
          <button
            className="quiet-button"
            disabled={busy || !ready}
            onClick={() => operate(() => runtime.recoverBackup(), '已从备份恢复。')}
          >
            恢复备份
          </button>
        </div>
      </details>
    </main>
  );
}
