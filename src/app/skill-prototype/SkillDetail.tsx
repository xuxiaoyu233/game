import { useEffect, useState, type CSSProperties } from 'react';
import type {
  SkillLoopCommand,
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import {
  getActivityOutputs,
  getSkillEtaMs,
  getBestActivityForSkill,
  getMasteryPool,
  getMasteryProgress,
} from '../../domain/skill-loop/rates';
import {
  MASTERY_CHECKPOINTS_PERMILLE,
  getMaxSpendableMasteryPool,
} from '../../domain/skill-loop/mastery';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import { deriveWarehouseRelations } from '../warehouse-relations';
import {
  DASH,
  formatCount,
  formatCycleMultiplier,
  formatPercent,
  formatShortDuration,
} from './format';
import { ActivityList } from './ActivityList';
import { Icon } from './Icon';

export interface SkillDetailProps {
  readonly theme: SkillLoopTheme;
  readonly definition: SkillLoopDefinition;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
  readonly busy: boolean;
  readonly skillId: string;
  readonly onBack: () => void;
  readonly onCommand: (command: SkillLoopCommand) => void;
}

/**
 * One skill at a time: its own activities, the tool line that upgrades it, and where its outputs
 * go. Details that used to be buried in a collapsed block now sit in the open.
 */
export function SkillDetail({
  theme,
  definition,
  state,
  summary,
  busy,
  skillId,
  onBack,
  onCommand,
}: SkillDetailProps) {
  const skill = definition.skills.find((candidate) => candidate.id === skillId);
  const copy = theme.skillCopy[skillId];
  const progress = summary.skills[skillId];
  const tool = definition.tools.find((candidate) => candidate.skillId === skillId);
  const toolLevel = tool?.levels.find(
    (candidate) => candidate.level === (state.toolLevels[tool.id] ?? 1),
  );
  const upgrades = definition.toolUpgrades.filter((upgrade) => upgrade.toolId === tool?.id);
  const levelEffect = skill?.levels.find(
    (candidate) => candidate.level === progress?.level,
  )?.effect;
  const best = getBestActivityForSkill(definition, summary, skillId);
  const etaMs = best === undefined ? null : getSkillEtaMs(state, definition, summary, best.id);
  const threshold = progress?.xpForNextLevel ?? null;
  const progressMax = threshold ?? progress?.xpCeiling ?? 1;
  const progressValue = Math.min(progress?.xp ?? 0, progressMax);

  const producedItemIds = [
    ...new Set(
      definition.activities
        .filter((activity) => activity.skillId === skillId)
        .flatMap((activity) =>
          getActivityOutputs(activity, definition).map((output) => output.itemId),
        ),
    ),
  ];

  // Mastery card (schema 4 only). The checkpoint tiers are pure derivations from the pool fill;
  // the one thing a derivation cannot say is "this tier was reached and then spent away", so the
  // card keeps a presentation-only high-water mark (like the progress floats, never persisted):
  // a tier above the current fill but at or below the high-water mark renders as 因消耗失效.
  const pool = getMasteryPool(state, definition, skillId);
  const poolCheckpointIndex = pool?.checkpointIndex ?? -1;
  const [highestSeenCheckpoint, setHighestSeenCheckpoint] = useState(-1);
  useEffect(() => {
    setHighestSeenCheckpoint((current) => Math.max(current, poolCheckpointIndex));
  }, [poolCheckpointIndex]);
  const skillActivities = definition.activities.filter((activity) => activity.skillId === skillId);

  return (
    <>
      <section className="skill-prototype-section" aria-labelledby="skill-detail-title">
        <div className="skill-prototype-detail-head">
          <button
            className="quiet-button skill-prototype-back"
            type="button"
            data-testid="skill-detail-back"
            onClick={onBack}
          >
            ← 返回技能
          </button>
          <div className="skill-prototype-detail-title" id={`skill-progress-${skillId}`}>
            <Icon iconId={skillId} className="skill-prototype-detail-icon" />
            <div>
              <h2 id="skill-detail-title">{copy?.label ?? skillId}</h2>
              <small>{copy?.description}</small>
            </div>
            <strong className="skill-prototype-detail-level">Lv {progress?.level ?? 1}</strong>
          </div>
        </div>
        <span
          className="skill-prototype-progress skill-prototype-progress--lg"
          role="progressbar"
          aria-valuenow={Math.round(progressMax > 0 ? (progressValue / progressMax) * 100 : 0)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${copy?.label ?? skillId}经验`}
          style={
            { '--progress': progressMax > 0 ? progressValue / progressMax : 0 } as CSSProperties
          }
        >
          <span className="skill-prototype-progress-fill" />
        </span>
        <ul className="skill-prototype-detail-facts">
          <li>
            <span>经验</span>
            <b>
              {formatCount(progress?.xp ?? 0)} /{' '}
              {threshold === null
                ? `${formatCount(progress?.xpCeiling ?? 0)}（上限）`
                : formatCount(threshold)}
            </b>
          </li>
          <li>
            <span>距下一级</span>
            <b data-testid="skill-detail-eta">
              {threshold === null
                ? '已达当前上限'
                : etaMs === null
                  ? '当前活动无法推算'
                  : `${formatShortDuration(etaMs)}（${best === undefined ? '' : (theme.activityCopy[best.id]?.label ?? best.id)}）`}
            </b>
          </li>
          <li>
            <span>工具</span>
            <b>
              {tool === undefined
                ? '该技能没有工具线'
                : `${theme.toolCopy[tool.id]?.label ?? tool.id} · 等级 ${state.toolLevels[tool.id] ?? 1}${
                    toolLevel === undefined
                      ? ''
                      : ` · ${formatCycleMultiplier(toolLevel.durationMultiplierPermille)}`
                  }`}
            </b>
          </li>
          {levelEffect !== undefined && (
            <li>
              <span>等级效果</span>
              <b>
                {[
                  levelEffect.globalSpeedBonusPermille !== undefined
                    ? `全部活动 ${formatCycleMultiplier(levelEffect.globalSpeedBonusPermille)}`
                    : null,
                  levelEffect.globalXpBonusPermille !== undefined
                    ? `技能经验 ${formatPercent(levelEffect.globalXpBonusPermille)}`
                    : null,
                  levelEffect.offlineCapBonusMs !== undefined
                    ? `离线上限 +${formatShortDuration(levelEffect.offlineCapBonusMs)}`
                    : null,
                ]
                  .filter((entry): entry is string => entry !== null)
                  .join(' · ')}
              </b>
            </li>
          )}
        </ul>
      </section>

      {pool !== null && (
        <section className="skill-prototype-section" aria-labelledby="mastery-title">
          <div className="skill-prototype-section-heading">
            <h2 id="mastery-title">{theme.uiCopy.masteryHeading}</h2>
            <span>{theme.uiCopy.masteryPoolLabel}</span>
          </div>
          <div className="skill-prototype-status-card" data-testid="mastery-pool">
            <span
              className="skill-prototype-progress skill-prototype-progress--md"
              role="progressbar"
              aria-valuenow={Math.floor(pool.fillPermille / 10)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${theme.uiCopy.masteryPoolLabel}填充率`}
              style={{ '--progress': pool.fillPermille / 1_000 } as CSSProperties}
            >
              <span className="skill-prototype-progress-fill" />
            </span>
            <p>
              {theme.uiCopy.masteryPoolLabel} {formatCount(pool.xp)} / {formatCount(pool.limit)}（
              {Math.floor(pool.fillPermille / 10)}%）
            </p>
            <div className="skill-prototype-mastery-checkpoints" data-testid="mastery-checkpoints">
              {MASTERY_CHECKPOINTS_PERMILLE.map((threshold, index) => {
                const active = index <= pool.checkpointIndex;
                const spent = !active && index <= highestSeenCheckpoint;
                const status = active
                  ? theme.uiCopy.masteryCheckpointActive
                  : spent
                    ? theme.uiCopy.masteryCheckpointSpent
                    : theme.uiCopy.masteryCheckpointLocked;
                return (
                  <em
                    className={`skill-prototype-mastery-checkpoint${active ? ' is-active' : ''}${
                      spent ? ' is-spent' : ''
                    }`}
                    key={threshold}
                  >
                    {threshold / 10}% {status}
                  </em>
                );
              })}
            </div>
            <ul className="skill-prototype-mastery-activities">
              {skillActivities.map((activity) => {
                const progress = getMasteryProgress(state, definition, activity.id);
                const spendable =
                  progress === null
                    ? 0
                    : getMaxSpendableMasteryPool({
                        poolXp: pool.xp,
                        activityMasteryXp: progress.xp,
                        masteryCap: progress.xpCeiling,
                      });
                const label = theme.activityCopy[activity.id]?.label ?? activity.id;
                return (
                  <li key={activity.id}>
                    <span>
                      {label} · 精通 Lv {progress?.level ?? 1}
                      {progress?.atCap ? '（已满）' : ''}
                    </span>
                    <button
                      className="secondary-button"
                      data-testid={`mastery-spend-${activity.id}`}
                      disabled={busy || spendable <= 0}
                      onClick={() =>
                        onCommand({
                          kind: 'spend-mastery-pool',
                          activityId: activity.id,
                          amount: spendable,
                        })
                      }
                      aria-label={`${theme.uiCopy.masterySpendAction} ${formatCount(spendable)} 精通池到${label}`}
                    >
                      {theme.uiCopy.masterySpendAction} {formatCount(spendable)}
                    </button>
                  </li>
                );
              })}
            </ul>
            <small>
              池内的精通按 1:1 兑成活动的精通经验；检查点只看当前填充率，消耗后跌回阈值即失效。
            </small>
          </div>
        </section>
      )}

      <ActivityList
        theme={theme}
        definition={definition}
        state={state}
        summary={summary}
        busy={busy}
        skillId={skillId}
        onCommand={onCommand}
      />

      {upgrades.length > 0 && (
        <section className="skill-prototype-section" aria-labelledby="skill-upgrade-title">
          <div className="skill-prototype-section-heading">
            <h2 id="skill-upgrade-title">工具提升</h2>
            <span>材料换永久效率</span>
          </div>
          {upgrades.map((upgrade) => {
            const upgradeCopy = theme.toolCopy[upgrade.id];
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
                  <strong>{upgradeCopy?.label ?? upgrade.id}</strong>
                  <p>
                    {upgradeCopy?.effect ?? '提升工具效率'} · 消耗 {itemLabel} ×{' '}
                    {upgrade.requiredAmount}
                  </p>
                  <small>
                    等级 {upgrade.sourceLevel} → {upgrade.targetLevel}
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
                    onClick={() => onCommand({ kind: 'buy-tool-upgrade', upgradeId: upgrade.id })}
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
        </section>
      )}

      {producedItemIds.length > 0 && (
        <section className="skill-prototype-section" aria-labelledby="skill-output-title">
          <div className="skill-prototype-section-heading">
            <h2 id="skill-output-title">产出与去向</h2>
            <span>这块东西之后能做什么</span>
          </div>
          <ul className="skill-prototype-relation-list">
            {producedItemIds.map((itemId) => {
              const relations = deriveWarehouseRelations(itemId, definition, theme, state, summary);
              const uses = relations.uses
                .slice(0, 3)
                .map((use) => use.label)
                .join('、');
              return (
                <li key={itemId}>
                  <Icon iconId={itemId} className="skill-prototype-relation-icon" />
                  <strong>{theme.itemCopy[itemId]?.label ?? itemId}</strong>
                  <span>{uses === '' ? '暂无下游用途' : uses}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="skill-prototype-section-note">
        产出速率为推算值：{DASH} 表示当前无法产出，随工具、增益与敏捷等级实时变化。
      </p>
    </>
  );
}
