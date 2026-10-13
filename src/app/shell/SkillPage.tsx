import type {
  CurrentActivity,
  SkillLoopCommand,
  SkillLoopState,
} from '../../domain/skill-loop/types';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import type { SkillPrototypeV1Package } from '../skill-prototype-types';
import type { SkillLoopSummary } from '../../domain/skill-loop/types';
import { formatCount, formatSeconds } from '../format';
import { getRecipeInputs, missingMaterials } from '../skill-derivations';

interface SkillPageProps {
  readonly content: SkillPrototypeV1Package;
  readonly theme: SkillLoopTheme;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
  readonly current: CurrentActivity | null;
  readonly busy: boolean;
  readonly actionFor: (activityId: string) => SkillLoopCommand;
  readonly onDispatch: (command: SkillLoopCommand) => void;
}

/** 训练页：技能等级卡与活动列表。骨架批次会把活动按技能分组，形态改为 Melvor 式技能页。 */

export function SkillPage({
  content,
  theme,
  state,
  summary,
  current,
  busy,
  actionFor,
  onDispatch,
}: SkillPageProps) {
  const { definition } = content;
  return (
    <>
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
                id={`skill-progress-${skill.id}`}
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
            const missing = missingMaterials(state.inventory, requirements, theme);
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
                id={`activity-${activity.id}`}
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
                  onClick={() => onDispatch(actionFor(activity.id))}
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
    </>
  );
}
