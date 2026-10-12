import type { BuildingId } from '../domain/expedition/types';
import {
  BEACON_OPTIONS,
  BUILDING_COPY,
  CONTRACT_COPY,
  DIFFICULTY_MODIFIER_COPY,
  EVENT_COPY,
  OBJECTIVE_COPY,
  PROJECT_COPY,
  RESEARCH_COPY,
  TASK_NAV_COPY,
  WORKER_ROLE_COPY,
  WORLD_COPY,
} from '../themes/expedition-copy';
import { OUTPOST_RESOURCE_COPY } from '../themes/outpost-copy-v14';
import { formatAmount, formatRate } from './format';
import { CampStrategyPanel } from './CampStrategyPanel';
import { OutpostPanel } from './OutpostPanel';
import { ResourceDashboard } from './ResourceDashboard';
import { StoryPanels } from './StoryPanels';
import type { ExpeditionRunPanelsProps } from './expedition-panels-types';
import {
  affordable,
  costText,
  projectDescription,
  researchEffectText,
  rewardName,
  storyThreadLabel,
} from './expedition-panel-model';
import { getResourceName } from './resource-copy';

export function ExpeditionRunPanels({
  definition,
  state,
  summary,
  busy,
  onCommand,
  storyArchiveEntries,
  activeTab,
  setActiveTab,
  constructionTarget,
  setConstructionTarget,
}: ExpeditionRunPanelsProps) {
  const run = state.activeRun;
  if (run === null) return null;
  const world = definition.worlds.find((item) => item.id === run.worldId);
  if (world === undefined) return <p role="alert">副本配置缺失。</p>;
  const woodName = getResourceName(world, 'wood');
  const stoneName = getResourceName(world, 'stone');
  const copy = WORLD_COPY[world.id];
  const snowMode = world.mode?.kind === 'snow-observatory' ? world.mode : null;
  const snowEnvironment = summary.snowEnvironment;
  const anchorStability = summary.anchorStability;
  const anchorSupport = definition.outpost?.anchorSupport;
  const anchorSupportStock =
    anchorSupport === undefined || state.outpost === null
      ? 0
      : state.outpost.resources[anchorSupport.resourceId];
  const anchorSupportGain =
    anchorSupport === undefined || anchorStability === null
      ? 0
      : Math.max(
          0,
          Math.min(anchorSupport.stability, anchorStability.capacity - anchorStability.current),
        );
  const isAnchorCity = anchorStability !== null;
  const isSnow = snowMode !== null;
  const optionalSnowReward = summary.objectives
    .filter((objective) => !objective.mandatory && !objective.completed)
    .reduce((total, objective) => total + objective.rewardPoints, 0);
  const targetBuilding = world.buildings.find((item) => item.id === constructionTarget);
  const targetCost = summary.buildingCosts[constructionTarget];
  const targetShortage = {
    wood: Math.max(0, targetCost.wood - run.resources.wood),
    stone: Math.max(0, targetCost.stone - run.resources.stone),
  };
  const preparing = run.phase === 'preparing';
  const finished = run.phase === 'completed' || run.phase === 'failed';
  const eventPending = summary.pendingEvents.length > 0;
  const nextWave = Math.min(3, run.clearedWaves + 1);
  const canRestore = affordable(run.resources, definition.beaconRestoreCost);
  const remainingSeconds = Math.ceil(summary.stageRemainingMs / 1000);
  const countdown = `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`;
  const hasPendingTaskNode = summary.pendingEvents.length > 0 || summary.beaconPending;
  const hasOptionalTask =
    summary.availableProjectIds.length > 0 || summary.availableClueIds.length > 0;
  const hasTaskAttention = hasPendingTaskNode || hasOptionalTask;

  return (
    <>
      <section className="run-heading">
        <span className="eyebrow">
          第 {run.sequence} 次行动 ·{' '}
          {isSnow
            ? `${snowEnvironment?.nodesResolved ?? 0}/${snowEnvironment?.nodeCount ?? snowMode.nodeCount} 个环境节点完成`
            : `${run.clearedWaves}/3 波已守住`}
        </span>
        <div className="resource-heading">
          <h2>{copy?.name ?? world.id}</h2>
          <span className="phase-badge">
            {isSnow
              ? run.phase === 'preparing'
                ? '环境作业中'
                : run.phase === 'awaiting-environment'
                  ? '环境节点待确认'
                  : run.phase === 'completed'
                    ? '记录已恢复'
                    : '状态异常'
              : preparing
                ? '备战中'
                : run.phase === 'awaiting-wave'
                  ? '界潮待确认'
                  : run.phase === 'completed'
                    ? '挑战完成'
                    : '行动失败'}
          </span>
        </div>
        <div className="run-snapshot" aria-label="当前物资">
          <span>
            {woodName} <strong>{formatAmount(run.resources.wood)}</strong>
            <small>+{formatRate(summary.production.wood)}/秒</small>
          </span>
          <span>
            {stoneName} <strong>{formatAmount(run.resources.stone)}</strong>
            <small>+{formatRate(summary.production.stone)}/秒</small>
          </span>
          <span>
            回归预估 <strong>+{summary.rewardTotal}</strong>
          </span>
        </div>
        {(run.difficultyModifierIds.length > 0 || summary.difficultyScore > 0) && (
          <p className="run-difficulty-summary" data-testid="run-difficulty-summary">
            附加难度 {summary.difficultyScore} · 基础契约奖励 +{summary.difficultyReward} 界点
            {run.difficultyModifierIds.length > 0
              ? ` · ${run.difficultyModifierIds
                  .map((id) => DIFFICULTY_MODIFIER_COPY[id]?.name ?? id)
                  .join('、')}`
              : ''}
          </p>
        )}
        {run.preparationId !== null && (
          <p className="preparation-note" data-testid="run-preparation">
            本局准备：<strong>{RESEARCH_COPY[run.preparationId]?.name}</strong>。
            {(() => {
              const node = definition.researchNodes?.find(
                (candidate) => candidate.id === run.preparationId,
              );
              return node ? researchEffectText(node, world) : '本局准备快照已固定。';
            })()}
          </p>
        )}
        <p>
          {isSnow
            ? '供暖会消耗燃料并抬升温度；节省燃料能腾出建材修复发电机。每个环境停点都等你确认，离线时间不会自动跨过危险。'
            : run.buildings.shelter === 0
              ? '基础目标：建成临时避难所，守住前两次界潮。'
              : run.clearedWaves < 2
                ? '临时避难所已建成。守住第二次界潮就能安全回归。'
                : '基本任务已完成：立即回归，或继续挑战。'}
        </p>
      </section>
      {anchorStability !== null && (
        <section className="panel anchor-stability-panel" aria-label="界锚稳定度">
          <div className="section-title">
            <h2>界锚稳定度</h2>
            <strong data-testid="anchor-stability">
              {formatAmount(anchorStability.current)} / {anchorStability.capacity}
            </strong>
          </div>
          <progress
            className={
              anchorStability.current < anchorStability.optionalRouteThreshold
                ? 'danger-progress'
                : ''
            }
            value={anchorStability.current}
            max={anchorStability.capacity}
            aria-label="当前界锚稳定度"
          />
          <p>
            常规界潮预计消耗 {anchorStability.nextWaveLoss}；提前压线另消耗{' '}
            {anchorStability.earlyPressureLoss}。稳定度达到 {anchorStability.optionalRouteThreshold}{' '}
            可进入现场复核区域；低于门槛仍可完成基础救援。
          </p>
          {anchorSupport !== undefined && !eventPending && !finished && (
            <button
              className="secondary full-width"
              data-testid="reinforce-anchor"
              disabled={busy || anchorSupportStock < 1 || anchorSupportGain <= 0}
              onClick={() => onCommand({ kind: 'reinforce-anchor' })}
            >
              {anchorSupportGain <= 0
                ? '界锚稳定度已满'
                : anchorSupportStock < 1
                  ? `需要${OUTPOST_RESOURCE_COPY[anchorSupport.resourceId].name} × 1`
                  : `消耗${OUTPOST_RESOURCE_COPY[anchorSupport.resourceId].name} × 1 · 稳定度 +${anchorSupportGain}`}
            </button>
          )}
        </section>
      )}
      {eventPending && (
        <p className="event-pause-notice" role="status">
          有事件等待选择；副本生产与阶段计时已暂停，驻地作业继续。请先在“任务”页查看成本和后果。
        </p>
      )}
      <nav className="run-tabs" role="tablist" aria-label="副本面板">
        {(
          [
            ['operations', isAnchorCity ? '行动' : '经营'],
            ['tasks', `任务${hasTaskAttention ? ' · 待办' : ''}`],
            ['analysis', '账目'],
            ['outpost', '驻地'],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? 'selected' : ''}
            onClick={() => setActiveTab(tab)}
          >
            {label}
          </button>
        ))}
      </nav>
      {isSnow && snowEnvironment !== null && snowMode !== null && (
        <section className="panel snow-environment-panel" aria-label="雪站环境与发电机">
          <div className="section-title">
            <h2>供能与温度</h2>
            <span>
              节点 {snowEnvironment.nodesResolved}/{snowEnvironment.nodeCount}
            </span>
          </div>
          <div className="snow-metrics">
            <div>
              <span>燃料</span>
              <strong>
                {formatAmount(snowEnvironment.fuel)} / {snowEnvironment.fuelCapacity}
              </strong>
            </div>
            <div>
              <span>当前温度</span>
              <strong
                className={
                  snowEnvironment.temperature <= snowEnvironment.dangerTemperature
                    ? 'danger-text'
                    : ''
                }
              >
                {formatAmount(snowEnvironment.temperature)}°C
              </strong>
            </div>
            <div>
              <span>发电机完整度</span>
              <strong>
                {formatAmount(snowEnvironment.generatorIntegrity)} /{' '}
                {snowEnvironment.requiredGeneratorIntegrity}（回归门槛）
              </strong>
            </div>
          </div>
          <progress
            className="snow-temperature-bar"
            max={snowMode.temperatureCap - snowEnvironment.dangerTemperature}
            value={Math.max(0, snowEnvironment.temperature - snowEnvironment.dangerTemperature)}
            aria-label="距离低温危险的温度余量"
          />
          <p>
            {snowEnvironment.pendingReason === 'checkpoint'
              ? snowEnvironment.nodesResolved >= snowEnvironment.nodeCount
                ? '第四处记录已恢复；可以直接回归，结算主线与可选奖励。'
                : '本段作业已完成。确认后进入下一个节点。'
              : snowEnvironment.pendingReason === 'low-temperature'
                ? '温度已触及危险线，作业暂停；必须先恢复供暖再继续。'
                : snowEnvironment.pendingReason === 'fuel-depleted'
                  ? '燃料已经耗尽，作业暂停；可以补燃料，或在温度允许时节省燃料继续。'
                  : `预计下一停点约 ${Math.ceil(snowEnvironment.projectedStageMs / 1000)} 秒；按当前供暖设置，温度约 ${formatAmount(snowEnvironment.projectedTemperature)}°C、余燃料约 ${formatAmount(snowEnvironment.projectedFuel)}。`}
          </p>
          {run.phase === 'awaiting-environment' && (
            <>
              <div className="choice-row snow-actions">
                <button
                  className="secondary"
                  disabled={busy || eventPending || !snowEnvironment.canStoke}
                  onClick={() => onCommand({ kind: 'stoke-furnace' })}
                >
                  补充燃料 · 木 {snowMode.stokeCost.wood} / 石 {snowMode.stokeCost.stone}
                </button>
                <button
                  className="secondary"
                  disabled={busy || eventPending || !snowEnvironment.canRepairGenerator}
                  onClick={() => onCommand({ kind: 'repair-generator' })}
                >
                  修复发电机 · 木 {snowMode.repairCost.wood} / 石 {snowMode.repairCost.stone}
                </button>
              </div>
              {snowEnvironment.nodesResolved >= snowEnvironment.nodeCount ? (
                <button
                  className="secondary full-width"
                  disabled={busy || eventPending || !snowEnvironment.canContinue}
                  onClick={() =>
                    onCommand({ kind: 'continue-snow', heaterOn: snowEnvironment.heaterOn })
                  }
                >
                  完成校时并准备返航
                </button>
              ) : (
                <div className="choice-row snow-actions">
                  <button
                    className={summary.canReturn ? 'secondary' : 'primary-action'}
                    disabled={
                      busy ||
                      eventPending ||
                      !snowEnvironment.canContinue ||
                      snowEnvironment.fuel <= 0
                    }
                    onClick={() => onCommand({ kind: 'continue-snow', heaterOn: true })}
                  >
                    确认继续并供暖
                  </button>
                  <button
                    className="secondary"
                    disabled={
                      busy ||
                      eventPending ||
                      !snowEnvironment.canContinue ||
                      snowEnvironment.temperature <= snowEnvironment.dangerTemperature
                    }
                    onClick={() => onCommand({ kind: 'continue-snow', heaterOn: false })}
                  >
                    确认继续并节省燃料
                  </button>
                </div>
              )}
              {snowEnvironment.pendingReason !== 'checkpoint' && (
                <small>这是途中停点；确认后继续当前节点，不会额外跳过作业进度。</small>
              )}
              {summary.canSecureRewards && (
                <div className="return-anchor-panel" aria-label="雪站安全返航锚点">
                  <p>
                    三处主线记录与发电机条件已满足。可现在回归，或锁定 +{summary.rewardTotal}{' '}
                    积分和线索，再完成最后一处可选记录（+{optionalSnowReward} 分）。
                  </p>
                  <button
                    className="return-button secure-rewards-button full-width"
                    disabled={busy || eventPending}
                    onClick={() => onCommand({ kind: 'secure-rewards' })}
                  >
                    锁定主线成果，挑战可选记录
                  </button>
                </div>
              )}
              {run.securedObjectiveIds.length > 0 && (
                <p className="secured-rewards-note" role="status">
                  主线回报与观测日志已锚定；现在撤离仍可带回，继续后新增积分另行结算。
                </p>
              )}
            </>
          )}
          {summary.canReturn && (
            <button
              className="return-button full-width"
              disabled={busy}
              onClick={() => onCommand({ kind: 'return' })}
            >
              回归寰门总台 · +{summary.rewardTotal} 界点
            </button>
          )}
        </section>
      )}
      {!isSnow && (
        <section
          className="battle-panel panel"
          aria-label={isAnchorCity ? '界潮与队员状态' : '怪潮与生命'}
        >
          <div className="resource-heading">
            <span>
              营地生命{' '}
              <strong data-testid="hp">
                {run.hp}/{run.maxHp}
              </strong>
            </span>
            <span>
              防御 <strong>{summary.defense}</strong>
            </span>
          </div>
          <progress className="hp-bar" max={run.maxHp} value={run.hp} aria-label="营地生命" />
          {!finished && (
            <>
              <div className="wave-heading">
                <h3>
                  第 {nextWave} 次界潮 {nextWave === 3 ? '· 自愿挑战' : '· 基础任务'}
                </h3>
                <strong>{preparing ? countdown : '等待迎战'}</strong>
              </div>
              <p className={summary.predictedDamage >= run.hp ? 'danger-text' : ''}>
                强度 {summary.nextWaveStrength} · 预计损伤 {summary.predictedDamage}
                {summary.predictedDamage >= run.hp
                  ? ' · 当前防御会失守'
                  : ` · 战后生命 ${Math.max(0, run.hp - summary.predictedDamage)}`}
              </p>
              {run.preparationId === 'battle-bracing' && run.phase === 'awaiting-wave' && (
                <button
                  className="secondary full-width"
                  disabled={busy || eventPending || (!summary.canBrace && !run.braceArmed)}
                  onClick={() => onCommand({ kind: 'brace' })}
                >
                  {run.braceArmed
                    ? `支架已启用 · 下一波防御 +${summary.braceDamageReduction}`
                    : run.braceUsed
                      ? '本局支架已使用'
                      : `启用承力支架 · 下一波防御 +${summary.braceDamageReduction}`}
                </button>
              )}
              {nextWave === 3 && summary.nextWaveRewardTotal > 0 && (
                <p className="challenge-reward-preview" data-testid="challenge-reward-preview">
                  若守住第三次界潮，新增回报 +{summary.nextWaveRewardTotal} 界点
                  {run.securedObjectiveIds.length > 0
                    ? `；已锁定的 +${summary.securedRewardTotal} 不受本波成败影响。`
                    : summary.canSecureRewards
                      ? `；当前 +${summary.rewardTotal} 界点尚未锁定，继续挑战前可先锁定。`
                      : summary.canReturn
                        ? '；当前已满足回归条件，继续挑战前请先处理待办事项再锁定。'
                        : '；当前必做目标尚未完成，本轮回报仍有风险。'}
                  {summary.earlyBonus > 0 ? ` 提前迎战另有 +${summary.earlyBonus} 临时奖励。` : ''}
                </p>
              )}
              {!preparing &&
                (summary.pendingEvents.length > 0 ? (
                  <button className="secondary full-width" onClick={() => setActiveTab('tasks')}>
                    先处理任务事件，再迎战 →
                  </button>
                ) : (
                  <button
                    className="primary-action full-width fight-button"
                    disabled={busy || !summary.canFightWave}
                    onClick={() => onCommand({ kind: 'fight-wave' })}
                  >
                    确认迎战第 {nextWave} 次界潮
                  </button>
                ))}
              {preparing && (
                <>
                  <button
                    className="return-button early-fight"
                    disabled={busy || !summary.canFightEarly}
                    onClick={() => onCommand({ kind: 'fight-early' })}
                  >
                    提前压线 · 第 {nextWave} 次界潮 · +{summary.earlyBonus} 界点
                  </button>
                  <p className={summary.earlyPredictedDamage >= run.hp ? 'danger-text' : ''}>
                    提前出击：强度 {summary.earlyWaveStrength} · 预计损伤{' '}
                    {summary.earlyPredictedDamage}。
                    {summary.pendingEvents.length > 0
                      ? '先前往“任务”处理事件。'
                      : run.buildings.shelter === 0
                        ? '先建立避难棚。'
                        : '放弃剩余生产时间，并额外损失界锚稳定度；界点需成功回归后结算。'}
                  </p>
                  {summary.stageRemainingMs > 0 && (
                    <p className="early-yield-cost">
                      等待到界潮窗口，预计还能生产{woodName}{' '}
                      {formatAmount(summary.earlyYieldForgone.wood)}、{stoneName}{' '}
                      {formatAmount(summary.earlyYieldForgone.stone)}
                      ；提前压线会放弃这段产出并损失额外稳定度。
                    </p>
                  )}
                </>
              )}
            </>
          )}
          {summary.canSecureRewards && (
            <div className="return-anchor-panel" aria-label="安全返航锚点">
              <p>
                必要目标已完成。可以现在回归，也可以锁定当前 +{summary.rewardTotal}{' '}
                界点与档案，再挑战下一次界潮；守住可新增 +{summary.nextWaveRewardTotal}{' '}
                界点，失守仍保留已锁定部分。
              </p>
              <button
                className="return-button secure-rewards-button"
                disabled={busy || eventPending}
                onClick={() => onCommand({ kind: 'secure-rewards' })}
              >
                锁定现有战果，挑战第 {nextWave} 次界潮
              </button>
            </div>
          )}
          {run.securedObjectiveIds.length > 0 && (
            <p className="secured-rewards-note" role="status">
              回归锚已生效：失守或撤离仍可带回 +{summary.securedRewardTotal}；新获得的 +
              {summary.atRiskRewardTotal} 界点仍有风险。
            </p>
          )}
          {run.lastBattle !== null && (
            <div className="battle-report" role="log">
              第 {run.lastBattle.wave} 次界潮：强度 {run.lastBattle.strength} − 防御{' '}
              {run.lastBattle.defense} → 损伤 {run.lastBattle.damage}。
              {run.lastBattle.braceReduction > 0
                ? ` 承力支架抵消 ${run.lastBattle.braceReduction} 点伤害。`
                : ''}
              {run.lastBattle.survived ? '队伍守住了本次冲击。' : '本轮行动失败，永久成长保留。'}
              {run.lastBattle.preparationRemainingMs > 0 &&
                ` 提前 ${Math.ceil(run.lastBattle.preparationRemainingMs / 1000)} 秒，待结算额外界点 +${run.lastBattle.initiativePoints}。`}
            </div>
          )}
          {state.profile.perkIds.includes('field-repair') && (
            <button
              className="secondary full-width repair-button"
              disabled={busy || eventPending || !summary.canRepair}
              onClick={() => onCommand({ kind: 'repair' })}
            >
              {run.repairUsed
                ? '应急修复已使用'
                : `应急修复 · 恢复 ${definition.repairHp} 生命（本局一次）`}
            </button>
          )}
          {summary.canReturn && (
            <button
              className="return-button"
              disabled={busy}
              onClick={() => onCommand({ kind: 'return' })}
            >
              {run.phase === 'failed'
                ? summary.securedRewardTotal > 0
                  ? `结束旅程 · 带回已锁定 +${summary.securedRewardTotal}`
                  : '结束旅程 · 回到主空间'
                : `回归寰门总台 · +${summary.rewardTotal} 界点`}
            </button>
          )}
          {run.phase === 'completed' && !summary.canReturn && (
            <>
              <p>缺少避难棚，基础回归任务未完成。</p>
              <button
                className="primary-action return-action"
                disabled={busy}
                onClick={() => onCommand({ kind: 'abandon' })}
              >
                结束旅程 · 无奖励撤离
              </button>
            </>
          )}
        </section>
      )}
      {activeTab === 'outpost' && (
        <OutpostPanel
          definition={definition}
          state={state.outpost}
          profile={state.profile}
          busy={busy}
          onCommand={onCommand}
        />
      )}
      {hasTaskAttention && !finished && activeTab !== 'tasks' && (
        <button className="task-alert" onClick={() => setActiveTab('tasks')}>
          {hasPendingTaskNode ? TASK_NAV_COPY.pending : TASK_NAV_COPY.optional}
        </button>
      )}
      {activeTab === 'operations' && (
        <>
          <ResourceDashboard
            definition={definition}
            state={state}
            summary={summary}
            busy={busy}
            onCommand={onCommand}
            mode="operations"
          />
          {!finished && (
            <CampStrategyPanel
              definition={definition}
              state={state}
              summary={summary}
              busy={busy}
              onCommand={onCommand}
              environmentalMode={isSnow}
            />
          )}
        </>
      )}
      <div className="details">
        {activeTab === 'tasks' && (
          <>
            <section className="panel objective-panel">
              <div className="section-title">
                <h2>{CONTRACT_COPY[run.contractId]?.name ?? '本局契约'}</h2>
                <span>成功回归后永久结算</span>
              </div>
              <p>{CONTRACT_COPY[run.contractId]?.description ?? '完成必要目标后返回主空间。'}</p>
              {summary.objectives.map((objective) => {
                const objectiveCopy = OBJECTIVE_COPY[objective.objectiveId];
                return (
                  <div
                    className={`objective-row ${objective.completed ? 'complete' : ''}`}
                    key={objective.objectiveId}
                  >
                    <span aria-hidden="true">{objective.completed ? '✓' : '○'}</span>
                    <div>
                      <strong>{objectiveCopy?.name ?? objective.objectiveId}</strong>
                      <p>{objectiveCopy?.description ?? '完成目标条件。'}</p>
                    </div>
                    <small>
                      {objective.mandatory ? '必做' : '可选'}
                      {objective.rewardPoints > 0 ? ` · +${objective.rewardPoints} 界点` : ''}
                    </small>
                  </div>
                );
              })}
            </section>
            {summary.pendingEvents.map((event) => {
              const eventCopy = EVENT_COPY[event.id];
              return (
                <section className="panel event-panel" key={event.id}>
                  <span className="eyebrow">
                    {storyThreadLabel(definition, event.storyThreadId)} · 等待抉择
                  </span>
                  <h2>{eventCopy?.title ?? event.id}</h2>
                  <p>{eventCopy?.description ?? '请选择事件方案，决定本轮可用的行动。'}</p>
                  {event.options.map((option) => {
                    const optionCopy = eventCopy?.options[option.id];
                    return (
                      <button
                        className="event-option"
                        key={option.id}
                        disabled={busy || !affordable(run.resources, option.cost)}
                        onClick={() =>
                          onCommand({
                            kind: 'choose-event',
                            eventId: event.id,
                            optionId: option.id,
                          })
                        }
                      >
                        <strong>{optionCopy?.label ?? option.id}</strong>
                        <span>
                          消耗 {costText(option.cost, world)}
                          {option.resourceReward !== undefined
                            ? ` · 获得 ${costText(option.resourceReward, world)}`
                            : ''}
                          {' · '}
                          {optionCopy?.description ?? '确认后会影响本轮可用内容。'}
                        </span>
                      </button>
                    );
                  })}
                </section>
              );
            })}
            {definition.events
              .filter(
                (event) =>
                  event.worldId === run.worldId && Object.hasOwn(run.eventChoices, event.id),
              )
              .map((event) => {
                const eventCopy = EVENT_COPY[event.id];
                const option = event.options.find((item) => item.id === run.eventChoices[event.id]);
                return (
                  <section className="panel resolved-event" key={event.id}>
                    <span className="eyebrow">
                      {storyThreadLabel(definition, event.storyThreadId)} · 已决定
                    </span>
                    <h2>{eventCopy?.title ?? event.id}</h2>
                    <p>{eventCopy?.options[option?.id ?? '']?.label ?? option?.id}</p>
                  </section>
                );
              })}
            {run.activeProject !== null &&
              (() => {
                const project = definition.projects.find(
                  (item) => item.id === run.activeProject?.projectId,
                );
                if (!project) return null;
                return (
                  <section className="panel project-panel">
                    <span className="eyebrow">
                      {finished ? '派队项目 · 已中断' : '派队项目 · 进行中'}
                    </span>
                    <h2>{PROJECT_COPY[project.id]?.name ?? project.id}</h2>
                    <p>
                      {finished
                        ? '战斗结束时项目尚未完成，调查记录未能带回，本轮不会结算这项奖励。'
                        : projectDescription(project)}
                    </p>
                    <div className="project-progress-label">
                      <span>
                        {WORKER_ROLE_COPY[run.activeProject.workerRole]} · {project.workerCount} 人
                      </span>
                      <span>
                        {Math.floor((run.activeProject.elapsedMs / project.durationMs) * 100)}%
                      </span>
                    </div>
                    <progress
                      max={project.durationMs}
                      value={run.activeProject.elapsedMs}
                      aria-label="项目进度"
                    />
                  </section>
                );
              })()}
            {summary.availableProjectIds.map((projectId) => {
              const project = definition.projects.find((item) => item.id === projectId);
              if (!project) return null;
              const preset = definition.workforce.presets.find(
                (item) => item.id === run.workerPresetId,
              );
              return (
                <section className="panel project-panel" key={project.id}>
                  <span className="eyebrow">派队项目 · 可执行</span>
                  <h2>{PROJECT_COPY[project.id]?.name ?? project.id}</h2>
                  <p>{projectDescription(project)}</p>
                  <p>
                    项目费用：{costText(project.cost, world)} · 当前防御 {summary.defense}
                  </p>
                  <div className="choice-row">
                    {(['wood', 'stone', 'guard'] as const).map((role) => (
                      <button
                        className="secondary"
                        key={role}
                        disabled={
                          busy ||
                          eventPending ||
                          (preset?.[role] ?? 0) < project.workerCount ||
                          !affordable(run.resources, project.cost)
                        }
                        onClick={() =>
                          onCommand({
                            kind: 'start-project',
                            projectId: project.id,
                            workerRole: role,
                          })
                        }
                      >
                        派{WORKER_ROLE_COPY[role]}
                      </button>
                    ))}
                  </div>
                  <small>选择守备岗位会降低项目期间的防御；选择采集岗位会减少对应资源产出。</small>
                </section>
              );
            })}
            {summary.completedProjectIds.map((projectId) => (
              <section className="panel resolved-event" key={projectId}>
                <span className="eyebrow">派队项目 · 已完成</span>
                <h2>{PROJECT_COPY[projectId]?.name ?? projectId}</h2>
                <p>记录已经装入临时行李，成功回归后才会变成永久档案。</p>
              </section>
            ))}
          </>
        )}
        {activeTab === 'tasks' && (
          <StoryPanels
            definition={definition}
            state={state}
            summary={summary}
            busy={busy}
            onCommand={onCommand}
            storyArchiveEntries={storyArchiveEntries}
          />
        )}
        {!finished && (
          <>
            {activeTab === 'tasks' && summary.beaconPending && (
              <section className="panel event-panel">
                <span className="eyebrow">事件 · 守夜人的提议</span>
                <h2>废弃烽火台</h2>
                <p>{copy?.beaconText}</p>
                <button
                  className="event-option"
                  disabled={busy || eventPending}
                  onClick={() => onCommand({ kind: 'choose-beacon', optionId: 'salvage' })}
                >
                  <strong>{BEACON_OPTIONS.salvage.label}</strong>
                  <span>
                    立即获得 {costText(definition.beaconSalvageReward, world)}。
                    {BEACON_OPTIONS.salvage.description}
                  </span>
                </button>
                <button
                  className="event-option"
                  disabled={busy || eventPending || !canRestore}
                  onClick={() => onCommand({ kind: 'choose-beacon', optionId: 'restore' })}
                >
                  <strong>{BEACON_OPTIONS.restore.label}</strong>
                  <span>
                    消耗 {costText(definition.beaconRestoreCost, world)} · 防御 +
                    {definition.beaconDefense} · 成功回归额外 +{definition.rewards.beacon} 分。
                  </span>
                </button>
                <p>本局只能选择一次。资源不足时，可稍后再决定。</p>
              </section>
            )}
            {activeTab === 'tasks' && run.clearedWaves === 2 && (
              <section className="panel challenge-panel">
                <span className="eyebrow">可选条款 · 系统询问</span>
                <h2>提高最后一波的强度？</h2>
                <p>
                  强化使敌人强度提高 {Math.round((definition.finalWaveMultiplier - 1) * 100)}
                  %；守住后额外 +{definition.rewards.boostedFinal}{' '}
                  分。失败会失去本轮全部未结算奖励。
                </p>
                <div className="choice-row">
                  <button
                    className="secondary"
                    aria-pressed={!run.boostedFinal}
                    disabled={busy || eventPending}
                    onClick={() => onCommand({ kind: 'set-final-boost', enabled: false })}
                  >
                    普通挑战
                  </button>
                  <button
                    className="secondary"
                    aria-pressed={run.boostedFinal}
                    disabled={busy || eventPending}
                    onClick={() => onCommand({ kind: 'set-final-boost', enabled: true })}
                  >
                    强化挑战
                  </button>
                </div>
              </section>
            )}
            {activeTab === 'operations' && (
              <section className="panel">
                <div className="section-title">
                  <h2>现场设施</h2>
                  <span>发展与防守，共用能芯和锚材</span>
                </div>
                {!finished && (
                  <div className="construction-target">
                    <label>
                      当前积累目标
                      <select
                        aria-label="当前积累目标"
                        value={constructionTarget}
                        onChange={(event) =>
                          setConstructionTarget(event.target.value as BuildingId)
                        }
                      >
                        {world.buildings.map((item) => (
                          <option key={item.id} value={item.id}>
                            {BUILDING_COPY[item.id].name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p>
                      {targetBuilding !== undefined &&
                      run.buildings[constructionTarget] >= targetBuilding.maxCount
                        ? '该建筑已达数量上限，可以选择其他积累目标。'
                        : `当前目标还差${woodName} ${formatAmount(targetShortage.wood)} / ${stoneName} ${formatAmount(targetShortage.stone)}。`}
                    </p>
                  </div>
                )}
                {world.buildings.map((building) => {
                  const buildingCopy = BUILDING_COPY[building.id];
                  const unlocked = run.clearedWaves >= building.unlockAfterWave;
                  const count = run.buildings[building.id];
                  const cost = summary.buildingCosts[building.id];
                  const woodMissing = Math.max(0, cost.wood - run.resources.wood);
                  const stoneMissing = Math.max(0, cost.stone - run.resources.stone);
                  const hasEnoughResources = woodMissing === 0 && stoneMissing === 0;
                  const effect =
                    building.defense > 0
                      ? `防御 +${building.defense}`
                      : building.stabilityBonus !== undefined
                        ? `界锚稳定度 +${building.stabilityBonus}`
                        : building.production.wood > 0
                          ? `产${woodName} +${formatRate(building.production.wood)}/秒`
                          : building.production.stone > 0
                            ? `产${stoneName} +${formatRate(building.production.stone)}/秒`
                            : `成功回归 +${definition.rewards.monument} 分`;
                  return (
                    <div className={`shop-row ${unlocked ? '' : 'locked'}`} key={building.id}>
                      <div className="shop-copy">
                        <h3>
                          {buildingCopy.name}
                          <span className="quantity">
                            {count}/{building.maxCount}
                          </span>
                        </h3>
                        <p>
                          {unlocked
                            ? `${buildingCopy.description} · ${effect}`
                            : `守住第 ${building.unlockAfterWave} 波后解锁`}
                        </p>
                        {unlocked && count < building.maxCount && (
                          <p className="shop-detail">
                            费用 {woodName} {formatAmount(cost.wood)} · {stoneName}{' '}
                            {formatAmount(cost.stone)}
                            {!hasEnoughResources
                              ? ` · 还差${woodName} ${formatAmount(woodMissing)} / ${stoneName} ${formatAmount(stoneMissing)}`
                              : ''}
                          </p>
                        )}
                      </div>
                      <button
                        className="purchase build-purchase"
                        aria-label={`建造${buildingCopy.name}`}
                        disabled={
                          busy ||
                          eventPending ||
                          !unlocked ||
                          count >= building.maxCount ||
                          !affordable(run.resources, cost)
                        }
                        onClick={() => onCommand({ kind: 'build', buildingId: building.id })}
                      >
                        {count >= building.maxCount ? (
                          '已建满'
                        ) : (
                          <>
                            <span>
                              {count === 0 ? '建造' : '增建'}
                              {buildingCopy.name}
                            </span>
                            <small>
                              {woodName} {formatAmount(cost.wood)} · {stoneName}{' '}
                              {formatAmount(cost.stone)}
                            </small>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </section>
            )}
          </>
        )}
        {activeTab === 'tasks' && summary.canReturn && run.phase !== 'failed' && (
          <section className="panel reward-preview">
            <h2>现在回归可以带走</h2>
            {summary.rewardPreview.map((line) => (
              <div className="reward-line" key={line.id}>
                <span>
                  {run.securedRewards.some((reward) => reward.id === line.id) ? '已锁定 · ' : ''}
                  {rewardName(line.id)}
                </span>
                <span>+{line.points} 界点</span>
              </div>
            ))}
            <p>
              已锁定 +{summary.securedRewardTotal}；成功回归还可带回新增 +
              {summary.atRiskRewardTotal}。 继续经营不会自动结算。
            </p>
          </section>
        )}
        {activeTab === 'tasks' && !finished && (
          <details className="panel help-panel">
            <summary>旅程说明与撤离</summary>
            <p>
              界潮或现场异动待处理时，自动生产暂停。回归会清空局内物资；失败保留已兑换能力和已归档证据。
            </p>
            <p>
              撤离会清空本局临时物资。
              {summary.securedRewardTotal > 0
                ? `回归锚已锁定 +${summary.securedRewardTotal}，撤离仍可带回；之后新增成果仍有风险。`
                : '尚未锁定的本轮奖励与证据会失去，已有永久成长保留。'}
            </p>
            <button
              className="secondary abandon-button"
              disabled={busy}
              onClick={() => onCommand({ kind: 'abandon' })}
            >
              {summary.securedRewardTotal > 0
                ? `放弃本轮 · 带回已锁定 +${summary.securedRewardTotal}`
                : '放弃本轮 · 无奖励撤离'}
            </button>
          </details>
        )}
        {activeTab === 'analysis' && (
          <ResourceDashboard
            definition={definition}
            state={state}
            summary={summary}
            busy={busy}
            onCommand={onCommand}
            mode="analysis"
          />
        )}
      </div>
    </>
  );
}
