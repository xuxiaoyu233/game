import type { CSSProperties, MouseEvent } from 'react';
import type {
  SkillLoopCommand,
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import { getActivityRate, getSkillEtaMs } from '../../domain/skill-loop/rates';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import { DASH, formatPerHour, formatSeconds, formatShortDuration, formatCount } from './format';
import { getRecipeInputs, getSkillGroupId, missingMaterials } from './derivations';
import { NextStepLine } from './NextStepLine';
import { Icon } from './Icon';

export interface ActivityStatusBarProps {
  readonly theme: SkillLoopTheme;
  readonly definition: SkillLoopDefinition;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
  readonly busy: boolean;
  /** Activity offered by the guided start row when nothing is running yet. */
  readonly startActivityId: string | undefined;
  readonly onCommand: (command: SkillLoopCommand) => void;
  readonly onStartFirst: () => void;
  readonly onAnchorClick: (event: MouseEvent<HTMLAnchorElement>, targetId: string) => void;
}

/**
 * The persistent header line: whatever the player is doing right now stays visible above every
 * tab, so scrolling the training grid, warehouse or growth page never hides the current job.
 */
export function ActivityStatusBar({
  theme,
  definition,
  state,
  summary,
  busy,
  startActivityId,
  onCommand,
  onStartFirst,
  onAnchorClick,
}: ActivityStatusBarProps) {
  const current = state.currentActivity;

  if (current === null) {
    return (
      <section
        className="skill-prototype-status-bar is-idle"
        aria-label="当前活动"
        data-testid="activity-status"
      >
        <div className="skill-prototype-status-line">
          <span className="skill-prototype-icon-bubble tone-gather" aria-hidden="true">
            <Icon iconId="raw-material" className="skill-prototype-status-icon" />
          </span>
          <div className="skill-prototype-status-text">
            <p className="skill-prototype-kicker">{theme.uiCopy.startKicker}</p>
            <h2>{theme.uiCopy.startHeading}</h2>
          </div>
          <button
            className="primary-button skill-prototype-status-action"
            type="button"
            data-testid="start-first-activity"
            disabled={busy || startActivityId === undefined}
            onClick={onStartFirst}
          >
            {theme.uiCopy.startActionPrefix}
            {startActivityId === undefined
              ? ''
              : ` ${theme.activityCopy[startActivityId]?.label ?? startActivityId}`}
          </button>
        </div>
        <NextStepLine
          theme={theme}
          definition={definition}
          state={state}
          summary={summary}
          busy={busy}
          onCommand={onCommand}
          onAnchorClick={onAnchorClick}
        />
      </section>
    );
  }

  const activity = definition.activities.find((entry) => entry.id === current.activityId);
  const activityLabel = theme.activityCopy[current.activityId]?.label ?? current.activityId;
  const activityTone = activity === undefined ? 'gather' : getSkillGroupId(activity.skillId);
  const skillLabel = activity === undefined ? '' : (theme.skillCopy[activity.skillId]?.label ?? '');
  const level = activity === undefined ? null : (summary.skills[activity.skillId]?.level ?? null);
  const rate = getActivityRate(state, definition, current.activityId);
  const etaMs = getSkillEtaMs(state, definition, summary, current.activityId);
  const progress = activity === undefined ? undefined : summary.skills[activity.skillId];
  const remainingXp =
    progress !== undefined && progress.xpForNextLevel !== null
      ? progress.xpForNextLevel - progress.xp
      : null;
  const missing = missingMaterials(
    state.inventory,
    getRecipeInputs(current.activityId, definition),
    theme,
  );

  const statusText =
    current.status === 'running'
      ? '正在重复作业'
      : current.status === 'paused'
        ? '活动已暂停'
        : current.stopReason === 'insufficient-materials'
          ? '材料不足，活动已停止'
          : '活动已停止';

  const outputSummary =
    rate === null || rate.outputsPerHour.length === 0
      ? DASH
      : rate.outputsPerHour
          .map(
            (output) =>
              `${theme.itemCopy[output.itemId]?.label ?? output.itemId} ${formatPerHour(output.amountPerHour)}`,
          )
          .join(' · ');

  return (
    <section
      className="skill-prototype-status-bar"
      aria-label="当前活动"
      data-testid="activity-status"
    >
      <div className="skill-prototype-status-line">
        <span className={`skill-prototype-icon-bubble tone-${activityTone}`} aria-hidden="true">
          <Icon
            iconId={activity?.skillId}
            className="skill-prototype-status-icon"
            title={activityLabel}
          />
        </span>
        <div className="skill-prototype-status-text">
          <p className="skill-prototype-kicker">
            {statusText}
            {skillLabel !== '' && ` · ${skillLabel}${level === null ? '' : ` Lv ${level}`}`}
          </p>
          <h2>{activityLabel}</h2>
        </div>
        <span className="skill-prototype-status-cycle">
          {formatSeconds(current.cycleDurationMs)}
        </span>
        {current.status === 'running' ? (
          <button
            className="secondary-button skill-prototype-status-action"
            type="button"
            data-testid="status-bar-toggle"
            disabled={busy}
            onClick={() => onCommand({ kind: 'pause-activity' })}
          >
            暂停
          </button>
        ) : (
          <button
            className="primary-button skill-prototype-status-action"
            type="button"
            data-testid="status-bar-toggle"
            disabled={busy || missing.length > 0}
            onClick={() => onCommand({ kind: 'resume-activity' })}
          >
            恢复
          </button>
        )}
      </div>
      <span
        className="skill-prototype-progress skill-prototype-progress--md"
        role="progressbar"
        aria-valuenow={Math.round(
          current.cycleDurationMs > 0 ? (current.progressMs / current.cycleDurationMs) * 100 : 0,
        )}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="当前周期进度"
        style={
          {
            '--progress':
              current.cycleDurationMs > 0 ? current.progressMs / current.cycleDurationMs : 0,
          } as CSSProperties
        }
      >
        <span className="skill-prototype-progress-fill" />
      </span>
      <p className="skill-prototype-status-meta" data-testid="status-bar-meta">
        {current.stopReason === 'insufficient-materials' ? (
          <span className="skill-prototype-status-warning">缺少：{missing.join('、')}</span>
        ) : (
          <>
            <span data-testid="status-bar-rate">产出 {outputSummary}</span>
            <span className="skill-prototype-status-sep">·</span>
            <span
              data-testid="status-bar-eta"
              title={remainingXp === null ? undefined : `还差 ${formatCount(remainingXp)} XP`}
            >
              {etaMs === null
                ? '技能已到当前上限'
                : `升级尚需 ${formatShortDuration(etaMs)}${
                    remainingXp === null ? '' : ` · 还差 ${formatCount(remainingXp)} XP`
                  }`}
            </span>
          </>
        )}
      </p>
      <NextStepLine
        theme={theme}
        definition={definition}
        state={state}
        summary={summary}
        busy={busy}
        onCommand={onCommand}
        onAnchorClick={onAnchorClick}
      />
      {current.progressMs > 0 && current.status !== 'running' && (
        <small className="skill-prototype-cycle-warning">{theme.uiCopy.cycleDiscardWarning}</small>
      )}
    </section>
  );
}
