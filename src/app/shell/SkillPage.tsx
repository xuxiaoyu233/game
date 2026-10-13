import type {
  CurrentActivity,
  SkillLoopCommand,
  SkillLoopId,
  SkillLoopState,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import type { SkillPrototypeV1Package } from '../skill-prototype-types';
import { formatCount, formatSeconds } from '../format';
import { getRecipeInputs, missingMaterials } from '../skill-derivations';

interface SkillPageProps {
  readonly content: SkillPrototypeV1Package;
  readonly theme: SkillLoopTheme;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
  readonly current: CurrentActivity | null;
  readonly activeSkillId: SkillLoopId;
  readonly busy: boolean;
  readonly actionFor: (activityId: string) => SkillLoopCommand;
  readonly onDispatch: (command: SkillLoopCommand) => void;
}

/**
 * 技能页（Melvor 技能页的压缩形态）：顶部该技能经验条 + 该技能的动作瓦片。
 * 只显示当前选中技能的内容，切换技能由 `SkillStrip` 完成。
 */

export function SkillPage({
  content,
  theme,
  state,
  summary,
  current,
  activeSkillId,
  busy,
  actionFor,
  onDispatch,
}: SkillPageProps) {
  const { definition } = content;
  const progress = summary.skills[activeSkillId];
  const copy = theme.skillCopy[activeSkillId];
  const activities = definition.activities.filter((activity) => activity.skillId === activeSkillId);

  const threshold = progress?.xpForNextLevel ?? null;
  const progressMax = threshold ?? progress?.xpCeiling ?? Math.max(progress?.xp ?? 0, 1);
  const progressValue =
    threshold !== null && progress !== undefined
      ? Math.min(progress.xp, threshold)
      : progress?.xpCeiling !== null && progress !== undefined
        ? Math.min(progress.xp, progress.xpCeiling)
        : 1;

  return (
    <>
      {progress !== undefined && copy !== undefined && (
        <section className="skill-prototype-section" aria-labelledby="skill-progress-title">
          <div className="skill-prototype-section-heading">
            <h2 id="skill-progress-title">{copy.label}</h2>
            <span>Lv {progress.level}</span>
          </div>
          <article
            className="skill-prototype-skill"
            id={`skill-progress-${activeSkillId}`}
            data-testid={`skill-progress-${activeSkillId}`}
          >
            <p>{copy.description}</p>
            <progress max={progressMax} value={progressValue} aria-label={`${copy.label}经验`} />
            <small>
              {formatCount(progress.xp)} XP
              {threshold === null
                ? ` · 当前等级上限 Lv ${progress.maximumLevel}`
                : ` / ${formatCount(threshold)} XP`}
              {progress.atPrototypeCap && ' · 已达当前原型经验上限'}
            </small>
          </article>
        </section>
      )}

      <section className="skill-prototype-section" aria-labelledby="activity-list-title">
        <div className="skill-prototype-section-heading">
          <h2 id="activity-list-title">活动</h2>
          <span>一次只运行一项；切换会放弃未完成周期</span>
        </div>
        <div className="skill-prototype-activity-list">
          {activities.map((activity) => {
            const active = current?.activityId === activity.id;
            const unlocked = summary.availableActivityIds.includes(activity.id);
            const requirements = getRecipeInputs(activity.id, content);
            const missing = missingMaterials(state.inventory, requirements, theme);
            const itemOutputs =
              activity.kind === 'gather'
                ? activity.outputs
                : (definition.recipes.find((recipe) => recipe.id === activity.recipeId)?.outputs ??
                  []);
            const actionLabel = !unlocked
              ? `需要${copy?.label ?? activity.skillId} Lv ${activity.requiredLevel}`
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
                id={`activity-${activity.id}`}
                key={activity.id}
              >
                <div className="skill-prototype-activity-copy">
                  <div className="skill-prototype-activity-title">
                    <h3>{theme.activityCopy[activity.id]?.label ?? activity.id}</h3>
                    <span>
                      {copy?.label ?? activity.skillId} · Lv {activity.requiredLevel}
                    </span>
                  </div>
                  <p>{theme.activityCopy[activity.id]?.description}</p>
                  <small>
                    {formatSeconds(activity.durationMs)} · {activity.xpPerCycle} XP
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
                  onClick={() => onDispatch(actionFor(activity.id))}
                  aria-label={`${actionLabel}：${theme.activityCopy[activity.id]?.label ?? activity.id}`}
                >
                  {actionLabel}
                </button>
                {progress?.atPrototypeCap && unlocked && (
                  <span className="skill-prototype-cap-tag">本原型最高等级</span>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
