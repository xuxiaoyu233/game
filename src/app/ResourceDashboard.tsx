import type {
  ExpeditionCommand,
  ExpeditionDefinition,
  ExpeditionSummary,
  SaveBundle,
} from '../domain/expedition/types';
import { formatAmount, formatRate } from './format';
import { getResourceName } from './resource-copy';

interface ResourceDashboardProps {
  readonly definition: ExpeditionDefinition;
  readonly state: SaveBundle;
  readonly summary: ExpeditionSummary;
  readonly busy: boolean;
  readonly onCommand: (command: ExpeditionCommand) => void;
  readonly mode: 'operations' | 'analysis';
}
const SOURCE_NAMES = { natural: '自然', workers: '人员', buildings: '建筑' } as const;

export function ResourceDashboard({
  definition,
  state,
  summary,
  busy,
  onCommand,
  mode,
}: ResourceDashboardProps) {
  const run = state.activeRun;
  const world = definition.worlds.find((item) => item.id === run?.worldId);
  if (run === null || world === undefined) return null;
  const woodName = getResourceName(world, 'wood');
  const stoneName = getResourceName(world, 'stone');
  const ledger = run.resourceLedger;
  const currentTotal = run.resources.wood + run.resources.stone;
  const earned = {
    wood: ledger.produced.wood + ledger.collected.wood + ledger.found.wood,
    stone: ledger.produced.stone + ledger.collected.stone + ledger.found.stone,
  };
  const spentTotal = ledger.spent.wood + ledger.spent.stone;
  const gatherReady = run.phase === 'preparing' && state.lastSimulatedAt >= run.gatherAvailableAt;
  const yieldAmount =
    definition.gatherYield *
    (state.profile.perkIds.includes('harvest-training') ? definition.harvestMultiplier : 1);
  const chartMax = Math.max(1, earned.wood, earned.stone, ledger.spent.wood, ledger.spent.stone);
  return (
    <section className="panel resource-dashboard" aria-label="物资总览">
      <div className="section-title">
        <h2>物资总览</h2>
        <span>{ledger.sinceUpgrade ? '收支自升级起统计' : '本轮实际收支'}</span>
      </div>
      {mode === 'analysis' && (
        <div className="stock-summary">
          <div>
            <small>当前库存合计</small>
            <strong data-testid="inventory-total">{formatAmount(currentTotal)}</strong>
            <small>临时物资件数合计</small>
          </div>
          <div>
            <small>累计获得</small>
            <strong data-testid="earned-total">{formatAmount(earned.wood + earned.stone)}</strong>
            <small>不含开局补给</small>
          </div>
          <div>
            <small>累计消耗</small>
            <strong data-testid="spent-total">{formatAmount(spentTotal)}</strong>
            <small>建设与调查</small>
          </div>
        </div>
      )}
      {mode === 'operations' && (
        <>
          <div className="resources-grid">
            {(['wood', 'stone'] as const).map((resource) => (
              <div className="resource-tile" key={resource}>
                <div className="resource-heading">
                  <span>{resource === 'wood' ? woodName : stoneName}</span>
                  <span className="rate">+{formatRate(summary.production[resource])}/秒</span>
                </div>
                <div className="inventory">
                  <strong data-testid={resource}>{formatAmount(run.resources[resource])}</strong>
                  <small>/{world.resourceCaps[resource]}</small>
                </div>
                <progress
                  value={run.resources[resource]}
                  max={world.resourceCaps[resource]}
                  aria-label={`${resource === 'wood' ? woodName : stoneName}仓储`}
                />
                <button
                  className="secondary full-width"
                  disabled={
                    busy ||
                    summary.pendingEvents.length > 0 ||
                    !gatherReady ||
                    run.resources[resource] >= world.resourceCaps[resource]
                  }
                  onClick={() => onCommand({ kind: 'gather', resource })}
                >
                  采集{resource === 'wood' ? woodName : stoneName} +{formatAmount(yieldAmount)}
                </button>
              </div>
            ))}
          </div>
          <small className="gather-guidance">
            手动采集用于补缺：每次 +{formatAmount(yieldAmount)}，{woodName}与{stoneName}共用 10
            秒冷却。
          </small>
        </>
      )}
      {mode === 'analysis' && (
        <div className="economy-details">
          <h3>收支图表与产出来源</h3>
          <svg
            className="economy-chart"
            viewBox="0 0 330 105"
            role="img"
            aria-label={`本轮${woodName}获得 ${formatAmount(earned.wood)}、消耗 ${formatAmount(ledger.spent.wood)}；${stoneName}获得 ${formatAmount(earned.stone)}、消耗 ${formatAmount(ledger.spent.stone)}`}
          >
            <text x="0" y="15">
              获得
            </text>
            <rect className="chart-earned" x="43" y="4" width="12" height="12" />
            <text x="90" y="15">
              消耗
            </text>
            <rect className="chart-spent" x="133" y="4" width="12" height="12" />
            {(['wood', 'stone'] as const).map((resource, index) => (
              <g key={resource} transform={`translate(0 ${index * 37 + 28})`}>
                <text x="0" y="15">
                  {resource === 'wood' ? woodName : stoneName}
                </text>
                <rect
                  className="chart-earned"
                  x="43"
                  y="0"
                  width={Math.max(0, (earned[resource] / chartMax) * 230)}
                  height="10"
                />
                <rect
                  className="chart-spent"
                  x="43"
                  y="15"
                  width={Math.max(0, (ledger.spent[resource] / chartMax) * 230)}
                  height="10"
                />
                <text className="chart-value" x="284" y="10">
                  {formatAmount(earned[resource])}
                </text>
                <text className="chart-value" x="284" y="25">
                  {formatAmount(ledger.spent[resource])}
                </text>
              </g>
            ))}
          </svg>
          <table className="production-table">
            <caption>每秒自动产出</caption>
            <thead>
              <tr>
                <th>来源</th>
                <th>{woodName}</th>
                <th>{stoneName}</th>
              </tr>
            </thead>
            <tbody>
              {summary.productionSources.map((source) => (
                <tr key={source.id}>
                  <td>{SOURCE_NAMES[source.id]}</td>
                  <td>{formatRate(source.production.wood)}</td>
                  <td>{formatRate(source.production.stone)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {summary.productionSources.length === 0 && <p>已停止生产，等待迎战或回归。</p>}
          <p>
            仓储已满时不计入未入库产量。{woodName}与{stoneName}用途不同，合计件数不能互相替代支付。
          </p>
        </div>
      )}
    </section>
  );
}
