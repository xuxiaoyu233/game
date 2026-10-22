import type { MouseEvent } from 'react';
import type {
  SkillLoopCommand,
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import { formatCount } from './format';
import { getGatherSuggestion } from './derivations';

export interface NextStepLineProps {
  readonly theme: SkillLoopTheme;
  readonly definition: SkillLoopDefinition;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
  readonly busy: boolean;
  readonly onCommand: (command: SkillLoopCommand) => void;
  readonly onAnchorClick: (event: MouseEvent<HTMLAnchorElement>, targetId: string) => void;
}

/**
 * The next-step hint used to be its own card above the tabs, which pushed the skill grid off small
 * windows. It is now the status bar's second line: same guidance, one row, visible on every tab
 * because the status bar is. The `next-step` anchor is kept so existing links and tests still work.
 */
export function NextStepLine({
  theme,
  definition,
  state,
  summary,
  busy,
  onCommand,
  onAnchorClick,
}: NextStepLineProps) {
  const atStageEnd = summary.prototypeComplete;
  const gatherSuggestion = getGatherSuggestion(state, state.currentActivity, summary, definition);

  if (gatherSuggestion !== null) {
    const itemLabel = theme.itemCopy[gatherSuggestion.itemId]?.label ?? gatherSuggestion.itemId;
    return (
      <p className="skill-prototype-next-step-line" data-testid="next-step">
        <span className="skill-prototype-next-step-tag">下一步</span>
        <span>
          缺少 {itemLabel} × {formatCount(gatherSuggestion.amount)}
        </span>
        {gatherSuggestion.activityId === null ? (
          <span className="skill-prototype-status-warning">无直接采集来源</span>
        ) : (
          <button
            className="quiet-button skill-prototype-next-step-action"
            data-testid="next-step-replenish"
            disabled={busy}
            onClick={() => {
              const activityId = gatherSuggestion.activityId;
              if (activityId !== null) onCommand({ kind: 'switch-activity', activityId });
            }}
          >
            {theme.activityCopy[gatherSuggestion.activityId]?.label ?? gatherSuggestion.activityId}
          </button>
        )}
      </p>
    );
  }

  const upgradeId = summary.availableToolUpgradeIds[0];
  const unlock = summary.nextUnlocks[0];

  return (
    <p className="skill-prototype-next-step-line" data-testid="next-step">
      <span className="skill-prototype-next-step-tag">下一步</span>
      {upgradeId !== undefined ? (
        <a
          href={`#upgrade-${upgradeId}`}
          onClick={(event) => onAnchorClick(event, `upgrade-${upgradeId}`)}
        >
          可完成 {theme.toolCopy[upgradeId]?.label ?? upgradeId}
        </a>
      ) : unlock !== undefined ? (
        <a
          href={`#skill-progress-${unlock.skillId}`}
          onClick={(event) => onAnchorClick(event, `skill-progress-${unlock.skillId}`)}
        >
          {theme.skillCopy[unlock.skillId]?.label ?? unlock.skillId} Lv {unlock.level}：
          {theme.activityCopy[unlock.activityId]?.label ?? unlock.activityId}
        </a>
      ) : (
        <span>
          {atStageEnd ? theme.uiCopy.allContentAvailable : theme.uiCopy.returnCurrentGoal}
        </span>
      )}
    </p>
  );
}
