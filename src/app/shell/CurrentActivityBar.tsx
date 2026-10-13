import type {
  ActivityDefinition,
  CurrentActivity,
  SkillLoopCommand,
  SkillLoopState,
} from '../../domain/skill-loop/types';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import type { SkillPrototypeV1Package } from '../skill-prototype-types';
import { formatSeconds } from '../format';
import { getRecipeInputs, missingMaterials } from '../skill-derivations';

interface CurrentActivityBarProps {
  readonly content: SkillPrototypeV1Package;
  readonly theme: SkillLoopTheme;
  readonly state: SkillLoopState;
  readonly current: CurrentActivity | null;
  readonly nextActivity: ActivityDefinition | undefined;
  readonly busy: boolean;
  readonly onDispatch: (command: SkillLoopCommand) => void;
}

/** 首屏当前活动区：起始引导或正在进行的周期、进度、缺料与暂停/恢复。 */

export function CurrentActivityBar({
  content,
  theme,
  state,
  current,
  nextActivity,
  busy,
  onDispatch,
}: CurrentActivityBarProps) {
  return (
    <section className="skill-prototype-primary" aria-label="当前活动">
      {current === null ? (
        <>
          <div className="skill-prototype-primary-summary">
            <p className="skill-prototype-kicker">{theme.uiCopy.startKicker}</p>
            <h2>{theme.uiCopy.startHeading}</h2>
          </div>
          <button
            className="primary-button"
            type="button"
            data-testid="start-first-activity"
            disabled={busy || nextActivity === undefined}
            onClick={() => {
              if (nextActivity !== undefined)
                onDispatch({ kind: 'start-activity', activityId: nextActivity.id });
            }}
          >
            {theme.uiCopy.startActionPrefix}{' '}
            {nextActivity === undefined ? '' : theme.activityCopy[nextActivity.id]?.label}
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
          {current.stopReason === 'insufficient-materials' && (
            <p className="skill-prototype-active-copy">
              缺少：
              {missingMaterials(
                state.inventory,
                getRecipeInputs(current.activityId, content),
                theme,
              ).join('、')}
            </p>
          )}
          {current.progressMs > 0 && (
            <small className="skill-prototype-cycle-warning">
              {theme.uiCopy.cycleDiscardWarning}
            </small>
          )}
          <div className="skill-prototype-primary-actions">
            {current.status === 'running' ? (
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => onDispatch({ kind: 'pause-activity' })}
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
                    theme,
                  ).length > 0
                }
                onClick={() => onDispatch({ kind: 'resume-activity' })}
              >
                恢复活动
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
