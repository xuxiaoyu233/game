import type { GameCommand, GameDefinition, GameState, GameSummary } from '../domain/types';
import type { GameTheme } from '../themes/types';
import { formatAmount } from './format';

interface GamePanelsProps {
  readonly definition: GameDefinition;
  readonly state: GameState;
  readonly summary: GameSummary;
  readonly theme: GameTheme;
  readonly busy: boolean;
  readonly onCommand: (command: GameCommand) => void;
}

export function GamePanels({
  definition,
  state,
  summary,
  theme,
  busy,
  onCommand,
}: GamePanelsProps) {
  const currentTask = definition.tasks.find((task) => !state.claimedTaskIds.includes(task.id));
  const pendingEvent = definition.events.find((event) =>
    summary.pendingEventIds.includes(event.id),
  );

  return (
    <>
      {currentTask !== undefined && (
        <section className="panel task-panel" aria-label="阶段任务">
          <span className="eyebrow">当前目标</span>
          <h2>{theme.tasks[currentTask.id]?.name}</h2>
          <p>{theme.tasks[currentTask.id]?.description}</p>
          <div className="task-progress">
            <span>
              累计 {formatAmount(state.totalGathered)} / {formatAmount(currentTask.totalGathered)}
            </span>
            <span>
              {theme.tools[currentTask.requiredTool.toolId]?.name}{' '}
              {state.toolCounts[currentTask.requiredTool.toolId] ?? 0} /{' '}
              {currentTask.requiredTool.count}
            </span>
          </div>
          <progress
            value={Math.min(state.totalGathered, currentTask.totalGathered)}
            max={currentTask.totalGathered}
          />
          <button
            className="secondary full-width"
            disabled={busy || !summary.readyTaskIds.includes(currentTask.id)}
            onClick={() => onCommand({ kind: 'claim-task', taskId: currentTask.id })}
          >
            领取奖励 · {formatAmount(currentTask.reward)} {theme.resourceUnit}
          </button>
        </section>
      )}
      {summary.isCompleted && (
        <p className="completion">基地已建立。继续扩建，下一段旅程正在准备中。</p>
      )}
      {pendingEvent !== undefined && (
        <section className="panel event-panel" aria-label="突发事件">
          <span className="eyebrow">新的发现</span>
          <h2>{theme.events[pendingEvent.id]?.name}</h2>
          <p>{theme.events[pendingEvent.id]?.description}</p>
          {pendingEvent.options.map((option) => (
            <button
              className="event-option"
              disabled={busy}
              key={option.id}
              onClick={() =>
                onCommand({ kind: 'choose-event', eventId: pendingEvent.id, optionId: option.id })
              }
            >
              <strong>{theme.events[pendingEvent.id]?.options[option.id]?.name}</strong>
              <span>{theme.events[pendingEvent.id]?.options[option.id]?.description}</span>
            </button>
          ))}
        </section>
      )}
      <section className="panel" aria-label="生产工具">
        <div className="section-title">
          <h2>生产工具</h2>
          <span>持续积累</span>
        </div>
        {definition.tools.map((tool) => {
          const available = summary.availableToolIds.includes(tool.id);
          const price = summary.toolPrices[tool.id] ?? 0;
          return (
            <div className={`shop-row ${available ? '' : 'locked'}`} key={tool.id}>
              <div className="shop-copy">
                <h3>
                  {theme.tools[tool.id]?.name}
                  <span className="quantity">×{state.toolCounts[tool.id] ?? 0}</span>
                </h3>
                <p>
                  {available
                    ? theme.tools[tool.id]?.description
                    : `完成「${theme.tasks[tool.unlockedByTaskId ?? '']?.name ?? '阶段任务'}」后解锁`}
                </p>
              </div>
              <button
                className="purchase"
                disabled={busy || !available || state.balance < price}
                onClick={() => onCommand({ kind: 'buy-tool', toolId: tool.id })}
                aria-label={`购买${theme.tools[tool.id]?.name}`}
              >
                {available ? formatAmount(price) : '未解锁'}
              </button>
            </div>
          );
        })}
      </section>
      <section className="panel" aria-label="技术升级">
        <div className="section-title">
          <h2>技术升级</h2>
          <span>每项购买一次</span>
        </div>
        {definition.upgrades.map((upgrade) => {
          const purchased = state.purchasedUpgradeIds.includes(upgrade.id);
          const available = summary.availableUpgradeIds.includes(upgrade.id);
          return (
            <div className={`shop-row ${available || purchased ? '' : 'locked'}`} key={upgrade.id}>
              <div className="shop-copy">
                <h3>{theme.upgrades[upgrade.id]?.name}</h3>
                <p>{theme.upgrades[upgrade.id]?.description}</p>
              </div>
              <button
                className="purchase"
                disabled={busy || !available || state.balance < upgrade.cost}
                onClick={() => onCommand({ kind: 'buy-upgrade', upgradeId: upgrade.id })}
              >
                {purchased ? '已升级' : available ? formatAmount(upgrade.cost) : '未解锁'}
              </button>
            </div>
          );
        })}
      </section>
    </>
  );
}
