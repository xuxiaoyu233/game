import type {
  SkillLoopCommand,
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import { formatCount, formatCycleMultiplier } from './format';
import { Icon } from './Icon';

export interface GrowthPanelProps {
  readonly theme: SkillLoopTheme;
  readonly definition: SkillLoopDefinition;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
  readonly busy: boolean;
  readonly onCommand: (command: SkillLoopCommand) => void;
}

/**
 * Growth is grouped by tool line first (what the player owns), then by the skill unlocks coming
 * next, so a longer content list still reads as a small number of decisions.
 */
export function GrowthPanel({
  theme,
  definition,
  state,
  summary,
  busy,
  onCommand,
}: GrowthPanelProps) {
  const upgradeGroups = definition.tools
    .filter((tool) => definition.toolUpgrades.some((upgrade) => upgrade.toolId === tool.id))
    .map((tool) => ({
      tool,
      upgrades: definition.toolUpgrades.filter((upgrade) => upgrade.toolId === tool.id),
    }));
  const unlocksBySkill = definition.skills
    .map((skill) => ({
      skill,
      unlocks: summary.nextUnlocks.filter((unlock) => unlock.skillId === skill.id),
    }))
    .filter((group) => group.unlocks.length > 0);

  return (
    <>
      <section className="skill-prototype-section" aria-labelledby="next-title">
        <div className="skill-prototype-section-heading">
          <h2 id="next-title">工具线</h2>
          <span>材料换永久效率</span>
        </div>
        {upgradeGroups.map((group) => {
          const skillId = group.tool.skillId;
          const skillLabel = theme.skillCopy[skillId]?.label ?? skillId;
          const level = state.toolLevels[group.tool.id] ?? 1;
          const maxLevel = group.tool.levels.at(-1)?.level ?? 1;
          return (
            <div
              className="skill-prototype-growth-group"
              data-testid={`upgrade-group-${group.tool.id}`}
              key={group.tool.id}
            >
              <div className="skill-prototype-growth-heading">
                <Icon iconId={skillId} className="skill-prototype-group-icon" />
                <strong>{theme.toolCopy[group.tool.id]?.label ?? group.tool.id}</strong>
                <span>
                  {skillLabel} · 等级 {level} / {maxLevel}
                </span>
                {/* Five pips read the whole tool line at a glance; the text keeps the exact
                    numbers, so the pips stay decorative. */}
                <span className="skill-prototype-level-track" aria-hidden="true">
                  {group.tool.levels.map((entry) => (
                    <em
                      className={`skill-prototype-level-dot${entry.level <= level ? ' is-on' : ''}`}
                      key={entry.level}
                    />
                  ))}
                </span>
              </div>
              {group.upgrades.map((upgrade) => {
                const copy = theme.toolCopy[upgrade.id];
                const itemLabel =
                  theme.itemCopy[upgrade.requiredItemId]?.label ?? upgrade.requiredItemId;
                const currentLevel = state.toolLevels[upgrade.toolId] ?? 0;
                const purchased = currentLevel >= upgrade.targetLevel;
                const available = summary.availableToolUpgradeIds.includes(upgrade.id);
                const quantity = state.inventory[upgrade.requiredItemId] ?? 0;
                return (
                  <article
                    className="skill-prototype-upgrade"
                    id={`upgrade-${upgrade.id}`}
                    key={upgrade.id}
                  >
                    <div>
                      <strong>{copy?.label ?? upgrade.id}</strong>
                      <p>
                        {copy?.effect ?? '提升工具效率'} · 消耗{' '}
                        <Icon
                          iconId={upgrade.requiredItemId}
                          className="skill-prototype-item-icon"
                        />
                        {itemLabel} × {upgrade.requiredAmount}
                      </p>
                      <small>
                        等级 {upgrade.sourceLevel} → {upgrade.targetLevel}
                        {purchased
                          ? ''
                          : ` · 库存 ${formatCount(quantity)} / ${formatCount(upgrade.requiredAmount)}`}
                      </small>
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
                        onClick={() =>
                          onCommand({ kind: 'buy-tool-upgrade', upgradeId: upgrade.id })
                        }
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
            </div>
          );
        })}
      </section>

      <section className="skill-prototype-section" aria-labelledby="unlock-title">
        <div className="skill-prototype-section-heading">
          <h2 id="unlock-title">下阶段解锁</h2>
          <span>按技能分组</span>
        </div>
        {unlocksBySkill.length > 0 ? (
          unlocksBySkill.map((group) => (
            <div
              className="skill-prototype-growth-group"
              data-testid={`unlock-group-${group.skill.id}`}
              key={group.skill.id}
            >
              <div className="skill-prototype-growth-heading">
                <Icon iconId={group.skill.id} className="skill-prototype-group-icon" />
                <strong>{theme.skillCopy[group.skill.id]?.label ?? group.skill.id}</strong>
                <span>
                  当前 Lv {summary.skills[group.skill.id]?.level ?? 1}
                  {group.skill.levels.length > 0 && ` / ${group.skill.levels.at(-1)?.level ?? 1}`}
                </span>
              </div>
              <ul className="skill-prototype-unlocks">
                {group.unlocks.map((unlock) => (
                  <li key={unlock.activityId}>
                    <span>
                      Lv {unlock.level}：
                      {theme.activityCopy[unlock.activityId]?.label ?? unlock.activityId}
                    </span>
                    <small>
                      还差{' '}
                      {formatCount(
                        Math.max(
                          0,
                          unlock.level > 0
                            ? (group.skill.levels.find((level) => level.level === unlock.level)
                                ?.xpRequired ?? 0) - (summary.skills[group.skill.id]?.xp ?? 0)
                            : 0,
                        ),
                      )}{' '}
                      XP
                    </small>
                  </li>
                ))}
              </ul>
            </div>
          ))
        ) : (
          <p className="skill-prototype-route-note">
            当前定义的技能活动均已开放；继续训练或完成上方工具提升，选择下一步。
          </p>
        )}
        <p className="skill-prototype-section-note">
          等级效果示例：敏捷 Lv2 起全部活动 {formatCycleMultiplier(971)}，随等级提升覆盖更多活动。
        </p>
        {summary.prototypeComplete && (
          <p className="skill-prototype-stage-end" role="status">
            <Icon iconId="stage-end" className="skill-prototype-stage-end-icon" />
            当前原型切片已到已定义的技能与工具上限；后续成长内容尚未接入。
          </p>
        )}
      </section>
    </>
  );
}
