import { useState } from 'react';
import type {
  ActivityDefinition,
  SkillLoopCommand,
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import {
  getActivityRate,
  getBestActivityForSkill,
  getMasteryProgress,
} from '../../domain/skill-loop/rates';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import { formatCount, formatPerHour, formatSeconds } from './format';
import { getRecipeInputs, missingMaterials } from './derivations';
import { Icon } from './Icon';

/**
 * Levels 1-6 sit in T1, 7-12 in T2, and so on up to the content ceiling (T5 today). The same
 * `tierOfLevel` the pacing audit uses keeps the UI and the tuning report in lockstep, so a designer
 * changing the tier size only touches one constant.
 */
const TIER_SIZE = 6;
const tierOfLevel = (level: number): number => Math.max(1, Math.ceil(level / TIER_SIZE));

export interface ActivityListProps {
  readonly theme: SkillLoopTheme;
  readonly definition: SkillLoopDefinition;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
  readonly busy: boolean;
  /** Only this skill's activities are rendered; the training home never lists everything at once. */
  readonly skillId: string;
  readonly onCommand: (command: SkillLoopCommand) => void;
}

export function ActivityList({
  theme,
  definition,
  state,
  summary,
  busy,
  skillId,
  onCommand,
}: ActivityListProps) {
  const current = state.currentActivity;
  const activities = definition.activities.filter((activity) => activity.skillId === skillId);

  function actionFor(activityId: string): SkillLoopCommand {
    if (current?.activityId === activityId) return { kind: 'resume-activity' };
    return current === null
      ? { kind: 'start-activity', activityId }
      : { kind: 'switch-activity', activityId };
  }

  // Group by tier (required level -> T1..T5); only tiers that actually hold this skill's activities show.
  const tierNumbers = Array.from(
    new Set(activities.map((activity) => tierOfLevel(activity.requiredLevel))),
  ).sort((a, b) => a - b);
  const grouped = new Map<number, ActivityDefinition[]>();
  for (const tier of tierNumbers) grouped.set(tier, []);
  for (const activity of activities)
    grouped.get(tierOfLevel(activity.requiredLevel))!.push(activity);

  const unlockedInTier = (tier: number): number =>
    grouped.get(tier)!.filter((activity) => summary.availableActivityIds.includes(activity.id))
      .length;

  // Collapse by default so the panel never overflows with every tier's rows at once: only the highest
  // tier that has unlocked work opens (T1 at the very start, a deeper tier as the player progresses).
  const defaultOpen =
    [...tierNumbers].reverse().find((tier) => unlockedInTier(tier) > 0) ?? tierNumbers[0];
  const [openTiers, setOpenTiers] = useState<ReadonlySet<number>>(
    () => new Set(defaultOpen === undefined ? [] : [defaultOpen]),
  );

  const toggleTier = (tier: number): void => {
    setOpenTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  return (
    <section className="skill-prototype-section" aria-labelledby="activity-list-title">
      <div className="skill-prototype-section-heading">
        <h2 id="activity-list-title">活动</h2>
        <span>一次只运行一项；切换会放弃未完成周期</span>
      </div>
      {tierNumbers.map((tier) => {
        const list = grouped.get(tier)!;
        const unlocked = unlockedInTier(tier);
        const isOpen = openTiers.has(tier);
        return (
          <div
            className="skill-prototype-activity-tier"
            key={tier}
            data-testid={`activity-tier-${tier}`}
          >
            <button
              type="button"
              className="skill-prototype-activity-tier-head"
              aria-expanded={isOpen}
              aria-controls={`activity-tier-panel-${tier}`}
              onClick={() => toggleTier(tier)}
            >
              <span className="skill-prototype-activity-tier-label">T{tier}</span>
              <span className="skill-prototype-activity-tier-count">
                已解锁 {unlocked}/{list.length}
              </span>
              <span className="skill-prototype-activity-tier-chevron" aria-hidden="true">
                {isOpen ? '▾' : '▸'}
              </span>
            </button>
            {isOpen && (
              <div
                className="skill-prototype-activity-list"
                id={`activity-tier-panel-${tier}`}
                data-testid={`activity-tier-panel-${tier}`}
              >
                {list.map((activity) => {
                  const active = current?.activityId === activity.id;
                  const unlockedActivity = summary.availableActivityIds.includes(activity.id);
                  const requirements = getRecipeInputs(activity.id, definition);
                  const missing = missingMaterials(state.inventory, requirements, theme);
                  const skill = summary.skills[activity.skillId];
                  const skillCopy = theme.skillCopy[activity.skillId];
                  const rate = getActivityRate(state, definition, activity.id);
                  const itemOutputs = rate?.outputsPerHour ?? [];
                  const actionLabel = !unlockedActivity
                    ? `需要${skillCopy?.label ?? activity.skillId} Lv ${activity.requiredLevel}`
                    : active
                      ? current?.status === 'running'
                        ? '正在运行'
                        : '恢复此活动'
                      : current === null
                        ? '开始活动'
                        : '切换到此活动';
                  const isBest =
                    getBestActivityForSkill(definition, summary, activity.skillId)?.id ===
                    activity.id;
                  const mastery = getMasteryProgress(state, definition, activity.id);
                  return (
                    <article
                      className={`skill-prototype-activity ${!unlockedActivity ? 'locked' : ''}${
                        active ? ' is-active' : ''
                      }`}
                      id={`activity-${activity.id}`}
                      key={activity.id}
                    >
                      <div className="skill-prototype-activity-copy">
                        <div className="skill-prototype-activity-title">
                          <h3>
                            <Icon iconId={activity.id} className="skill-prototype-activity-icon" />
                            {theme.activityCopy[activity.id]?.label ?? activity.id}
                            {isBest && unlockedActivity && (
                              <em className="skill-prototype-badge is-quiet">当前最优</em>
                            )}
                          </h3>
                          <span>
                            {skillCopy?.label ?? activity.skillId} · Lv {activity.requiredLevel}
                          </span>
                        </div>
                        <p>{theme.activityCopy[activity.id]?.description}</p>
                        <small>
                          {rate === null
                            ? formatSeconds(activity.durationMs)
                            : formatSeconds(rate.cycleDurationMs)}
                          {requirements.length > 0 &&
                            ` · 消耗 ${requirements
                              .map(
                                (entry) =>
                                  `${theme.itemCopy[entry.itemId]?.label} × ${entry.amount}`,
                              )
                              .join('、')}`}
                          {` · 产出 ${itemOutputs
                            .map(
                              (entry) =>
                                `${theme.itemCopy[entry.itemId]?.label} ${formatPerHour(
                                  entry.amountPerHour,
                                )}`,
                            )
                            .join('、')}`}
                        </small>
                        <small className="skill-prototype-activity-rate">
                          经验 {formatPerHour(rate?.xpPerHour ?? 0)}
                          {active && current?.status === 'running' && ' · 该活动正在运行'}
                        </small>
                        {mastery !== null && (
                          <small
                            className="skill-prototype-activity-mastery"
                            data-testid={`mastery-progress-${activity.id}`}
                          >
                            {mastery.atCap
                              ? `精通 Lv ${mastery.level}（已满）`
                              : `精通 Lv ${mastery.level} · 每周期 +${formatCount(mastery.xpPerCycle)} 精通`}
                          </small>
                        )}
                        {missing.length > 0 && unlockedActivity && (
                          <small className="skill-prototype-missing">
                            缺少：{missing.join('、')}
                          </small>
                        )}
                      </div>
                      <button
                        className={
                          active && current?.status === 'running'
                            ? 'quiet-button'
                            : 'secondary-button'
                        }
                        data-testid={`activity-action-${activity.id}`}
                        disabled={
                          busy ||
                          !unlockedActivity ||
                          (active && current?.status === 'running') ||
                          (missing.length > 0 && (!active || current?.status !== 'running'))
                        }
                        onClick={() => onCommand(actionFor(activity.id))}
                        aria-label={`${actionLabel}：${theme.activityCopy[activity.id]?.label ?? activity.id}`}
                      >
                        {actionLabel}
                      </button>
                      {skill?.atPrototypeCap && unlockedActivity && (
                        <span className="skill-prototype-cap-tag">本原型最高等级</span>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
