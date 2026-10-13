import type {
  SkillLoopCommand,
  SkillLoopState,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import type { SkillPrototypeV1Package } from '../skill-prototype-types';

interface GrowthPageProps {
  readonly content: SkillPrototypeV1Package;
  readonly theme: SkillLoopTheme;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
  readonly atStageEnd: boolean;
  readonly busy: boolean;
  readonly onDispatch: (command: SkillLoopCommand) => void;
}

/** 成长页：工具提升与后续解锁。Melvor 里对应商店购买与装备，骨架阶段保持物品消耗形态。 */

export function GrowthPage({
  content,
  theme,
  state,
  summary,
  atStageEnd,
  busy,
  onDispatch,
}: GrowthPageProps) {
  const { definition } = content;
  return (
    <section className="skill-prototype-section skill-prototype-next" aria-labelledby="next-title">
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
          <article
            className="skill-prototype-upgrade"
            id={`upgrade-${upgrade.id}`}
            key={upgrade.id}
          >
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
                onClick={() => onDispatch({ kind: 'buy-tool-upgrade', upgradeId: upgrade.id })}
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
  );
}
