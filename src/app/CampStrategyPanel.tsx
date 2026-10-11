import type {
  ExpeditionCommand,
  ExpeditionDefinition,
  ExpeditionSummary,
  SaveBundle,
} from '../domain/expedition/types';
import { STANCE_COPY, WORKER_COPY } from '../themes/expedition-copy';
import { getResourceName } from './resource-copy';

interface CampStrategyPanelProps {
  readonly definition: ExpeditionDefinition;
  readonly state: SaveBundle;
  readonly summary: ExpeditionSummary;
  readonly busy: boolean;
  readonly environmentalMode?: boolean;
  readonly onCommand: (command: ExpeditionCommand) => void;
}

export function CampStrategyPanel({
  definition,
  state,
  summary,
  busy,
  environmentalMode = false,
  onCommand,
}: CampStrategyPanelProps) {
  const run = state.activeRun;
  if (run === null) return null;
  const world = definition.worlds.find((item) => item.id === run.worldId);
  const allocation = definition.workforce.presets.find(
    (preset) => preset.id === run.workerPresetId,
  );
  const project =
    run.activeProject === null
      ? null
      : definition.projects.find((item) => item.id === run.activeProject?.projectId);
  if (run.activeProject !== null && project === undefined)
    throw new Error('Unknown active project in workforce panel');
  const projectWorkers = project?.workerCount ?? 0;
  const assignedRole = run.activeProject?.workerRole;
  const finished = run.phase === 'failed' || run.phase === 'completed';
  const transitioning = run.workerTransition !== null;
  return (
    <section className="panel strategy-panel" aria-label="队员调度">
      <div className="section-title">
        <h2>队员调度</h2>
        <span>
          {definition.workforce.size} 人 · {finished ? '本轮已结束' : '可随时调整'}
        </span>
      </div>
      <div className="crew-allocation" data-testid="worker-allocation">
        <span>
          {getResourceName(world, 'wood')}回收{' '}
          {transitioning
            ? 0
            : (allocation?.wood ?? 0) - (assignedRole === 'wood' ? projectWorkers : 0)}
        </span>
        <span>
          {getResourceName(world, 'stone')}回收{' '}
          {transitioning
            ? 0
            : (allocation?.stone ?? 0) - (assignedRole === 'stone' ? projectWorkers : 0)}
        </span>
        <span>
          守备{' '}
          {transitioning
            ? 0
            : (allocation?.guard ?? 0) - (assignedRole === 'guard' ? projectWorkers : 0)}
        </span>
        <span>项目外派 {projectWorkers}</span>
      </div>
      <div className="preset-grid">
        {definition.workforce.presets.map((preset) => (
          <button
            className="secondary"
            key={preset.id}
            aria-pressed={
              transitioning
                ? run.workerTransition?.targetPresetId === preset.id
                : run.workerPresetId === preset.id
            }
            disabled={
              busy ||
              summary.pendingEvents.length > 0 ||
              finished ||
              transitioning ||
              run.workerPresetId === preset.id
            }
            title={WORKER_COPY[preset.id].description}
            onClick={() => onCommand({ kind: 'set-workers', presetId: preset.id })}
          >
            {WORKER_COPY[preset.id].name}
          </button>
        ))}
      </div>
      {transitioning && run.workerTransition !== null && (
        <p role="status" className="worker-transition-notice">
          正在转岗至 {WORKER_COPY[run.workerTransition.targetPresetId].name}，还需{' '}
          {Math.ceil(summary.workerTransitionRemainingMs / 1000)}{' '}
          秒。转岗期间人员暂停生产与守备；自然和建筑产出继续，完成前不能迎战。
        </p>
      )}
      <p>
        {environmentalMode
          ? `人员自动生产材料；调整${getResourceName(world, 'wood')}与${getResourceName(world, 'stone')}回收配置，决定供能和修复预算的来源。`
          : `人员自动工作。守备每人贡献 ${definition.workforce.guardDefense} 基础防御；建设路线再调整最终效果。界潮待确认时，人员产出暂停。`}
      </p>
      {!environmentalMode && (
        <details className="stance-menu" open={!run.stanceChosen && run.clearedWaves === 0}>
          <summary>
            本局路线 · {STANCE_COPY[run.stanceId].name}
            {run.stanceChosen ? '（已固定）' : '（尚可选择）'}
          </summary>
          <p>第一波前可选择一次，之后本局固定；人员调度仍能随时改变。</p>
          <div className="stance-options">
            {definition.stances.map((stance) => (
              <button
                className="event-option"
                key={stance.id}
                aria-pressed={run.stanceId === stance.id && run.stanceChosen}
                disabled={busy || summary.pendingEvents.length > 0 || !summary.canChooseStance}
                onClick={() => onCommand({ kind: 'choose-stance', stanceId: stance.id })}
              >
                <strong>{STANCE_COPY[stance.id].name}</strong>
                <span>
                  自动产出 ×{stance.productionMultiplier} · 防御 ×{stance.defenseMultiplier}
                </span>
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
