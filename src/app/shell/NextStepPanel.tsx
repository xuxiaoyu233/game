import type { MouseEvent } from 'react';
import type {
  CurrentActivity,
  SkillLoopCommand,
  SkillLoopState,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import type { SkillPrototypeV1Package } from '../skill-prototype-types';
import { formatCount } from '../format';
import { getGatherSuggestion } from '../skill-derivations';

interface NextStepPanelProps {
  readonly content: SkillPrototypeV1Package;
  readonly theme: SkillLoopTheme;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
  readonly current: CurrentActivity | null;
  readonly atStageEnd: boolean;
  readonly busy: boolean;
  readonly onDispatch: (command: SkillLoopCommand) => void;
  readonly onAnchorClick: (event: MouseEvent<HTMLAnchorElement>, targetId: string) => void;
}

/**
 * 下一步建议区：缺料时推荐产出该材料的采集活动，否则指向可用工具提升或下一个解锁。
 * 这是本项目面向小窗口挂机的差异化引导，Melvor 没有对应区块，保留。
 */

export function NextStepPanel({
  content,
  theme,
  state,
  summary,
  current,
  atStageEnd,
  busy,
  onDispatch,
  onAnchorClick,
}: NextStepPanelProps) {
  const { definition } = content;
  const gatherSuggestion = getGatherSuggestion(state, current, summary, content);

  return (
    <section className="skill-prototype-next-step" aria-label="下一步" data-testid="next-step">
      <div className="skill-prototype-next-step-heading">
        <h2>{theme.uiCopy.nextStepHeading}</h2>
      </div>
      {gatherSuggestion !== null ? (
        <div className="skill-prototype-next-step-body">
          {gatherSuggestion.activityId === null ? (
            <p>
              {theme.uiCopy.replenishPrefix}：
              {theme.itemCopy[gatherSuggestion.itemId]?.label ?? gatherSuggestion.itemId} ×{' '}
              {formatCount(gatherSuggestion.amount)}。{theme.uiCopy.noDirectGather}
            </p>
          ) : (
            <>
              <p>
                {theme.uiCopy.replenishPrefix}：
                {theme.itemCopy[gatherSuggestion.itemId]?.label ?? gatherSuggestion.itemId} ×{' '}
                {formatCount(gatherSuggestion.amount)}。
              </p>
              <button
                className="secondary-button"
                data-testid="next-step-replenish"
                disabled={busy}
                onClick={() => {
                  const activityId = gatherSuggestion.activityId;
                  if (activityId !== null) onDispatch({ kind: 'switch-activity', activityId });
                }}
              >
                {theme.uiCopy.switchToActivityPrefix}
                {theme.activityCopy[gatherSuggestion.activityId]?.label ??
                  gatherSuggestion.activityId}
              </button>
              {current?.status === 'running' && current.progressMs > 0 && (
                <small>{theme.uiCopy.cycleDiscardWarning}</small>
              )}
            </>
          )}
        </div>
      ) : (
        <ul className="skill-prototype-next-step-targets">
          {summary.availableToolUpgradeIds.slice(0, 1).map((upgradeId) => {
            const upgrade = definition.toolUpgrades.find((entry) => entry.id === upgradeId);
            if (upgrade === undefined) return null;
            return (
              <li key={upgrade.id}>
                <a
                  href={`#upgrade-${upgrade.id}`}
                  onClick={(event) => onAnchorClick(event, `upgrade-${upgrade.id}`)}
                >
                  {theme.uiCopy.availableUpgradePrefix}{' '}
                  {theme.toolCopy[upgrade.id]?.label ?? upgrade.id}
                </a>
              </li>
            );
          })}
          {summary.availableToolUpgradeIds.length === 0 &&
            summary.nextUnlocks.slice(0, 1).map((unlock) => (
              <li key={unlock.activityId}>
                <a
                  href={`#skill-progress-${unlock.skillId}`}
                  onClick={(event) => onAnchorClick(event, `skill-progress-${unlock.skillId}`)}
                >
                  {theme.skillCopy[unlock.skillId]?.label ?? unlock.skillId} ·{' '}
                  {theme.uiCopy.nextUnlockPrefix} {unlock.level}：
                  {theme.activityCopy[unlock.activityId]?.label ?? unlock.activityId}
                </a>
              </li>
            ))}
          {summary.availableToolUpgradeIds.length === 0 && summary.nextUnlocks.length === 0 && (
            <li>
              {atStageEnd ? theme.uiCopy.allContentAvailable : theme.uiCopy.returnCurrentGoal}
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
