import type {
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import { ERA_ORDER, ERA_THRESHOLDS, eraRank, getEraId } from '../../domain/skill-loop/eras';
import { MASTERY_CHECKPOINTS_PERMILLE } from '../../domain/skill-loop/mastery';
import { getPrototypeCompletion } from '../../domain/skill-loop/progress';
import { getMasteryPool, getSkillLevel } from '../../domain/skill-loop/rates';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import { getEraDefinition } from '../../themes/eras';
import { deriveWarehouseRelations } from '../warehouse-relations';
import { formatCount } from './format';
import { Icon } from './Icon';

export interface RecordsPanelProps {
  readonly theme: SkillLoopTheme;
  readonly definition: SkillLoopDefinition;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
}

interface Milestone {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly reached: boolean;
}

interface StatRow {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** False when the number cannot be derived from the save and is therefore not recorded. */
  readonly derived: boolean;
  readonly note?: string;
}

/**
 * The records tab adds no state: every line is derived from skill XP, current holdings, tool
 * levels, the derived era and the one completion formula. Milestones are phrased from monotonic
 * facts ("最高技能等级达到 Lv 7") or from what is held right now ("当前持有木炭 ≥ 8"), never from
 * history, so nothing here can claim something the save no longer shows. Anything that genuinely
 * cannot be derived (total play time) is listed with an explicit "未记录" marker instead of a
 * fabricated number.
 */
export function RecordsPanel({ theme, definition, state, summary }: RecordsPanelProps) {
  const eraId = getEraId(state, definition);
  const era = getEraDefinition(eraId);
  const rank = eraRank(eraId);
  const nextEraId = ERA_ORDER[rank + 1];
  const completion = getPrototypeCompletion(state, definition);
  const masteryPools = definition.skills
    .map((skill) => getMasteryPool(state, definition, skill.id))
    .filter((pool) => pool !== null);
  const totalMasteryXp = Object.values(state.masteryXp ?? {}).reduce(
    (sum, value) => sum + value,
    0,
  );

  const levels = definition.skills.map((skill) => getSkillLevel(state, definition, skill.id));
  const highestLevel = levels.length === 0 ? 1 : Math.max(...levels);
  const lowestLevel = levels.length === 0 ? 1 : Math.min(...levels);
  const toolLevels = definition.tools.map((tool) => state.toolLevels[tool.id] ?? 0);
  const highestToolLevel = toolLevels.length === 0 ? 0 : Math.max(...toolLevels);
  const maxedToolLines = definition.tools.filter(
    (tool) => (state.toolLevels[tool.id] ?? 0) >= (tool.levels.at(-1)?.level ?? 1),
  ).length;

  const fuelItemId = definition.offlineFuel?.itemId;
  const charcoal = fuelItemId === undefined ? 0 : (state.inventory[fuelItemId] ?? 0);
  const coins = state.inventory['coin'] ?? 0;
  const ownedKinds = definition.items.filter((item) => (state.inventory[item.id] ?? 0) > 0).length;
  const totalXp = definition.skills.reduce((sum, skill) => sum + (state.skillXp[skill.id] ?? 0), 0);
  const completedUpgrades = definition.toolUpgrades.filter(
    (upgrade) => (state.toolLevels[upgrade.toolId] ?? 0) >= upgrade.targetLevel,
  ).length;

  const milestones: readonly Milestone[] = [
    {
      id: 'first-t2',
      label: `有技能进入 T2（Lv ${ERA_THRESHOLDS.bronzeAnySkillLevel}）`,
      detail: `当前最高技能等级 Lv ${highestLevel}`,
      reached: highestLevel >= ERA_THRESHOLDS.bronzeAnySkillLevel,
    },
    {
      id: 'all-t2',
      label: `全部技能达到 Lv ${ERA_THRESHOLDS.industrialEverySkillLevel}`,
      detail: `当前最低技能等级 Lv ${lowestLevel}`,
      reached: lowestLevel >= ERA_THRESHOLDS.industrialEverySkillLevel,
    },
    {
      id: 'all-lv10',
      label: `全部技能达到 Lv ${ERA_THRESHOLDS.precisionEverySkillLevel}`,
      detail: `当前最低技能等级 Lv ${lowestLevel}`,
      reached: lowestLevel >= ERA_THRESHOLDS.precisionEverySkillLevel,
    },
    {
      id: 'all-skills-max',
      label: '全部技能达到当前上限',
      detail: `${completion.maxedSkills} / ${completion.totalSkills} 项技能满级`,
      reached: completion.maxedSkills === completion.totalSkills,
    },
    {
      id: 'first-tool',
      label: '任一工具线完成提升',
      detail: `当前最高工具等级 Lv ${highestToolLevel}`,
      reached: highestToolLevel >= ERA_THRESHOLDS.bronzeAnyToolLevel,
    },
    {
      id: 'all-tools-max',
      label: `全部 ${ERA_THRESHOLDS.syntheticMaxedToolLines} 条工具线到顶`,
      detail: `${maxedToolLines} / ${definition.tools.length} 条到顶`,
      reached: maxedToolLines >= ERA_THRESHOLDS.syntheticMaxedToolLines,
    },
    {
      id: 'hold-fuel',
      label: `当前持有${fuelItemId === undefined ? '燃料' : (theme.itemCopy[fuelItemId]?.label ?? fuelItemId)} ≥ 8`,
      detail: `当前持有 ${formatCount(charcoal)}`,
      reached: charcoal >= 8,
    },
    {
      id: 'hold-coin',
      label: '当前持有硬币 ≥ 100',
      detail: `当前持有 ${formatCount(coins)}`,
      reached: coins >= 100,
    },
    {
      id: 'hold-variety',
      label: `当前持有物品种类 ≥ ${Math.min(20, definition.items.length)}`,
      detail: `当前持有 ${formatCount(ownedKinds)} / ${formatCount(definition.items.length)} 种`,
      reached: ownedKinds >= Math.min(20, definition.items.length),
    },
  ];

  const stats: readonly StatRow[] = [
    {
      id: 'play-time',
      label: '总游玩时长',
      // A neutral dash stands in for the value; the "未记录 · 不可派生" marker below is the
      // single source of that phrase, so the row never repeats it (the old copy said it twice).
      value: '–',
      derived: false,
      note: '存档中没有起始时间戳，无法从现有字段派生；需要新增存档字段后才可统计。',
    },
    { id: 'era', label: '当前时代', value: era.label, derived: true },
    { id: 'completion', label: '原型完成度', value: `${completion.percent}%`, derived: true },
    { id: 'highest-skill', label: '最高技能等级', value: `Lv ${highestLevel}`, derived: true },
    { id: 'lowest-skill', label: '最低技能等级', value: `Lv ${lowestLevel}`, derived: true },
    { id: 'total-xp', label: '已获得经验合计', value: formatCount(totalXp), derived: true },
    { id: 'highest-tool', label: '最高工具等级', value: `Lv ${highestToolLevel}`, derived: true },
    {
      id: 'upgrades',
      label: '已完成工具提升',
      value: `${completedUpgrades} / ${definition.toolUpgrades.length}`,
      derived: true,
    },
    {
      id: 'owned',
      label: '当前持有物品种类',
      value: `${formatCount(ownedKinds)} / ${formatCount(definition.items.length)}`,
      derived: true,
    },
    { id: 'coins', label: '当前持有硬币', value: formatCount(coins), derived: true },
  ];

  return (
    <>
      <section className="skill-prototype-section" aria-labelledby="records-era-title">
        <div className="skill-prototype-section-heading">
          <h2 id="records-era-title">时代</h2>
          <span>由等级与工具派生</span>
        </div>
        <div className="skill-prototype-era-card" data-testid="records-era">
          <span className="skill-prototype-era-card-index" aria-hidden="true">
            {rank + 1}
          </span>
          <div className="skill-prototype-era-card-body">
            <strong>{era.label}</strong>
            <p>{era.description}</p>
            <small>
              {nextEraId === undefined
                ? '已到达当前定义的最后一个时代。'
                : `下一时代「${getEraDefinition(nextEraId).label}」：${getEraDefinition(nextEraId).description}`}
            </small>
          </div>
        </div>
        <p className="skill-prototype-section-note">
          时代不写入存档，完全由当前技能等级与工具等级派生，因此读档后不会与内容不一致。
        </p>
      </section>

      <section className="skill-prototype-section" aria-labelledby="records-stats-title">
        <div className="skill-prototype-section-heading">
          <h2 id="records-stats-title">统计</h2>
          <span>完成度 {completion.percent}%</span>
        </div>
        <ul className="skill-prototype-stat-list" data-testid="records-stats">
          {stats.map((row) => (
            <li className="skill-prototype-stat-row" key={row.id}>
              <span>{row.label}</span>
              <b>{row.value}</b>
              {!row.derived && (
                <small className="skill-prototype-stat-unrecorded" title={row.note}>
                  未记录 · 不可派生
                </small>
              )}
            </li>
          ))}
        </ul>
        <p className="skill-prototype-section-note">
          技能经验进度 {formatCount(completion.skillXpEarned)} /{' '}
          {formatCount(completion.skillXpTotal)}
          ，工具提升 {completion.toolStepsEarned} / {completion.toolStepsTotal} 步；完成度为两者各占
          一半，是全应用唯一的完成度公式。
        </p>
      </section>

      {masteryPools.length > 0 && (
        <section className="skill-prototype-section" aria-labelledby="records-mastery-title">
          <div className="skill-prototype-section-heading">
            <h2 id="records-mastery-title">精通</h2>
            <span>由精通经验派生</span>
          </div>
          <ul className="skill-prototype-stat-list" data-testid="records-mastery">
            <li className="skill-prototype-stat-row">
              <span>已获精通经验合计</span>
              <b>{formatCount(totalMasteryXp)}</b>
            </li>
            {masteryPools.map((pool) => (
              <li className="skill-prototype-stat-row" key={pool.skillId}>
                <span>{theme.skillCopy[pool.skillId]?.label ?? pool.skillId} 精通池</span>
                <b>
                  {formatCount(pool.xp)} / {formatCount(pool.limit)}（
                  {Math.floor(pool.fillPermille / 10)}%）
                </b>
                {/* Same four chips as the skill detail card: state is read from the pure pool
                    derivation, so a tier spent back below its threshold flips to 因消耗失效. */}
                <span className="skill-prototype-mastery-checkpoints">
                  {MASTERY_CHECKPOINTS_PERMILLE.map((threshold, index) => {
                    const active = pool.fillPermille >= threshold;
                    const spent = !active && pool.checkpointIndex >= index;
                    return (
                      <em
                        className={`skill-prototype-mastery-checkpoint${
                          active ? ' is-active' : spent ? ' is-spent' : ''
                        }`}
                        key={threshold}
                        title={
                          active
                            ? `已达 ${threshold / 10}% 检查点`
                            : spent
                              ? `曾达 ${threshold / 10}%，因消耗跌破`
                              : `${threshold / 10}% 检查点未达成`
                        }
                      >
                        {threshold / 10}%
                      </em>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
          <p className="skill-prototype-section-note">
            精通等级与检查点全部由精通经验与池填充率派生，不写入存档。
          </p>
        </section>
      )}

      <section className="skill-prototype-section" aria-labelledby="records-milestones-title">
        <div className="skill-prototype-section-heading">
          <h2 id="records-milestones-title">里程碑</h2>
          <span>
            {milestones.filter((entry) => entry.reached).length} / {milestones.length} 达成
          </span>
        </div>
        <ul className="skill-prototype-milestone-list" data-testid="records-milestones">
          {milestones.map((milestone) => (
            <li
              className={`skill-prototype-milestone${milestone.reached ? ' is-reached' : ''}`}
              key={milestone.id}
            >
              <span className="skill-prototype-milestone-label">{milestone.label}</span>
              <small>{milestone.detail}</small>
              <em className="skill-prototype-badge">{milestone.reached ? '已达成' : '未达成'}</em>
            </li>
          ))}
        </ul>
        <p className="skill-prototype-section-note">
          里程碑只使用单调值（技能等级、工具等级）或当前持有量，不使用「曾经获得过」这类历史事实。
        </p>
      </section>

      <section className="skill-prototype-section" aria-labelledby="records-codex-title">
        <div className="skill-prototype-section-heading">
          <h2 id="records-codex-title">物品图鉴</h2>
          <span>
            当前持有 {formatCount(ownedKinds)} / {formatCount(definition.items.length)} 种
          </span>
        </div>
        <ul className="skill-prototype-codex-list" data-testid="records-codex">
          {definition.items.map((item) => {
            const relations = deriveWarehouseRelations(item.id, definition, theme, state, summary);
            const openSources = relations.sources.filter(
              (relation) => relation.status === 'available' || relation.status === 'complete',
            );
            const uses = relations.uses.map((relation) => relation.label);
            const owned = state.inventory[item.id] ?? 0;
            const label = theme.itemCopy[item.id]?.label ?? item.id;
            // Sources and uses moved into the cell tooltip: a 56-cell grid has to stay scannable,
            // and both fields are still one hover away instead of being dropped.
            const detail = `${label}｜当前可获得来源：${
              openSources.length === 0
                ? '暂无'
                : openSources.map((relation) => relation.label).join('、')
            }｜用途：${uses.length === 0 ? '暂无' : uses.slice(0, 3).join('、')}`;
            // New tier items have no glyph of their own yet; the icon falls back to the category so
            // the grid stays legible instead of showing 56 identical diamonds.
            return (
              <li className="skill-prototype-codex-item" key={item.id} title={detail}>
                <Icon
                  iconId={item.id}
                  fallbackId={item.categoryId}
                  className="skill-prototype-item-icon"
                />
                <strong>{label}</strong>
                <span className="skill-prototype-codex-owned">{formatCount(owned)}</span>
              </li>
            );
          })}
        </ul>
        <p className="skill-prototype-section-note">
          图鉴描述的是「当前可获得」与「当前持有」；物品被消耗后来源与持有量会同步变化，不做历史收集记录。
        </p>
      </section>
    </>
  );
}
