import type { CSSProperties } from 'react';
import type {
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import { getBestActivityForSkill, getSkillEtaMs } from '../../domain/skill-loop/rates';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import { getSkillGroupId, type SkillGroupId } from './derivations';
import { formatCount, formatShortDuration } from './format';
import { Icon } from './Icon';

export interface SkillGridProps {
  readonly theme: SkillLoopTheme;
  readonly definition: SkillLoopDefinition;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
  /** Skill that just levelled up; its card pulses briefly. */
  readonly levelUpSkillId: string | null;
  readonly onSelectSkill: (skillId: string) => void;
  readonly onOpenTree: () => void;
}

/**
 * Training home as a grouped list, not twelve equal cards. Skills are ordered the way the genre
 * reads them: 采集 (raw materials) / 加工 (refining) / 辅助 (support), so a longer content list
 * still reads as three small decisions. Each row carries a tone icon bubble, name, level, one
 * thin inline progress bar and a single line of decision info; the hourly rate stays in the
 * status bar so a card never repeats the same number twice on one screen. Group membership and
 * tone come from `derivations.ts` (single source); only the display names live here.
 */
const GROUP_ORDER: readonly SkillGroupId[] = ['gather', 'craft', 'support'];
const GROUP_KICKER: Readonly<Record<SkillGroupId, string>> = {
  gather: '采集',
  craft: '加工',
  support: '辅助',
};
const GROUP_NAME: Readonly<Record<SkillGroupId, string>> = {
  gather: '原料采集',
  craft: '加工制造',
  support: '辅助增益',
};

export function SkillGrid({
  theme,
  definition,
  state,
  summary,
  levelUpSkillId,
  onSelectSkill,
  onOpenTree,
}: SkillGridProps) {
  const runningSkillId = state.currentActivity?.activityId
    ? definition.activities.find((activity) => activity.id === state.currentActivity?.activityId)
        ?.skillId
    : undefined;

  const groups = GROUP_ORDER.map((groupId) => ({
    groupId,
    name: GROUP_NAME[groupId],
    skills: definition.skills.filter((skill) => getSkillGroupId(skill.id) === groupId),
  })).filter((group) => group.skills.length > 0);

  return (
    <section className="skill-prototype-section" aria-labelledby="skill-groups-title">
      <div className="skill-prototype-section-heading">
        <h2 id="skill-groups-title">技能</h2>
        <span>{definition.skills.length} 项 · 点击查看活动</span>
        <button className="quiet-button" type="button" data-testid="open-tree" onClick={onOpenTree}>
          树视图
        </button>
      </div>
      <div className="skill-prototype-skill-groups">
        {groups.map((group) => {
          const total = group.skills.length;
          const maxed = group.skills.filter(
            (skill) => summary.skills[skill.id]?.atPrototypeCap === true,
          ).length;
          return (
            <div
              className={`skill-prototype-skill-group tone-${group.groupId}`}
              key={group.groupId}
            >
              <div className="skill-prototype-skill-group-head">
                <span className="skill-prototype-tone-dot" aria-hidden="true" />
                <span className="skill-prototype-skill-group-kicker">
                  {GROUP_KICKER[group.groupId]}
                </span>
                <span className="skill-prototype-skill-group-name">{group.name}</span>
                <span className="skill-prototype-skill-group-count">
                  {maxed}/{total} 满级
                </span>
              </div>
              <div className="skill-prototype-skill-group-list">
                {group.skills.map((skill) => {
                  const copy = theme.skillCopy[skill.id];
                  const progress = summary.skills[skill.id];
                  const level = progress?.level ?? 1;
                  const isMaxed = progress?.atPrototypeCap === true;
                  const best = getBestActivityForSkill(definition, summary, skill.id);
                  const etaMs =
                    best === undefined ? null : getSkillEtaMs(state, definition, summary, best.id);
                  const lockedCount = definition.activities.filter(
                    (activity) =>
                      activity.skillId === skill.id &&
                      !summary.availableActivityIds.includes(activity.id),
                  ).length;
                  const xpForNextLevel = progress?.xpForNextLevel ?? null;
                  const xpInLevel = progress?.xp ?? 0;
                  const fraction =
                    xpForNextLevel !== null && xpForNextLevel > 0
                      ? Math.min(1, xpInLevel / xpForNextLevel)
                      : isMaxed
                        ? 1
                        : 0;
                  const running = runningSkillId === skill.id;
                  const progressStyle = { '--progress': fraction } as CSSProperties;
                  const label = copy?.label ?? skill.id;
                  return (
                    <button
                      className={`skill-prototype-skill-card${
                        running ? ' is-running' : ''
                      }${levelUpSkillId === skill.id ? ' is-levelup' : ''}${
                        isMaxed ? ' is-maxed' : ''
                      }`}
                      type="button"
                      key={skill.id}
                      id={`skill-progress-${skill.id}`}
                      data-testid={`skill-card-${skill.id}`}
                      aria-label={`${label}，等级 ${level}${
                        running ? '，正在训练' : isMaxed ? '，已达上限' : ''
                      }`}
                      onClick={() => onSelectSkill(skill.id)}
                    >
                      <span className="skill-prototype-icon-bubble" aria-hidden="true">
                        <Icon iconId={skill.id} className="skill-prototype-skill-icon" />
                      </span>
                      <span className="skill-prototype-skill-card-main">
                        <span className="skill-prototype-skill-card-top">
                          <span className="skill-prototype-skill-name">{label}</span>
                          <span className="skill-prototype-skill-level">Lv {level}</span>
                        </span>
                        <span
                          className="skill-prototype-progress skill-prototype-progress--sm"
                          role="progressbar"
                          aria-valuenow={Math.round(fraction * 100)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${label} 经验进度`}
                          style={progressStyle}
                        >
                          <span className="skill-prototype-progress-fill" />
                        </span>
                        {/* Decision information only: hourly rates live in the status bar. */}
                        <span className="skill-prototype-skill-meta">
                          {running && <em className="skill-prototype-badge">训练中</em>}
                          {isMaxed ? (
                            <span>已达当前上限</span>
                          ) : etaMs === null ? (
                            <span>缺料，无法估算</span>
                          ) : (
                            <span>尚需 {formatShortDuration(etaMs)}</span>
                          )}
                          {lockedCount > 0 && (
                            <em className="skill-prototype-badge is-quiet">
                              {lockedCount} 项待解锁
                            </em>
                          )}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="skill-prototype-section-note" data-testid="skill-grid-note">
        当前共 {formatCount(definition.activities.length)} 项活动；选中技能后只显示该技能的活动。
      </p>
    </section>
  );
}
