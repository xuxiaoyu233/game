import { useState } from 'react';
import type { ExpeditionCommand, ExpeditionDefinition, Profile } from '../domain/expedition/types';
import type { OutpostJobId } from '../domain/outpost/types';
import type { OutpostAmounts } from '../domain/outpost/types';
import {
  getOutpostResourceCapacity,
  getOutpostStorageCapacity,
  getOutpostProfessionLevel,
  getOutpostProfessionExperienceSinceReview,
  getOutpostProfessionProgress,
  OUTPOST_JOB_IDS,
  OUTPOST_PROFESSION_IDS,
  OUTPOST_RESOURCE_IDS,
} from '../domain/outpost/engine';
import type { OutpostState } from '../domain/outpost/types';
import {
  OUTPOST_JOB_COPY,
  OUTPOST_FACILITY_COPY,
  OUTPOST_PAUSE_COPY,
  OUTPOST_PROFESSION_COPY,
  OUTPOST_RECIPE_COPY,
  OUTPOST_RESOURCE_COPY,
} from '../themes/outpost-copy-v14';
import { formatAmount, formatRate } from './format';

interface OutpostPanelProps {
  readonly definition: ExpeditionDefinition;
  readonly state: OutpostState | null;
  readonly profile: Profile;
  readonly busy: boolean;
  readonly onCommand: (command: ExpeditionCommand) => void;
  readonly compact?: boolean;
}

function recipeCostText(inputs: OutpostAmounts): string {
  return Object.entries(inputs)
    .map(
      ([id, amount]) =>
        `${OUTPOST_RESOURCE_COPY[id as keyof typeof OUTPOST_RESOURCE_COPY]?.name ?? id} × ${amount ?? 0}`,
    )
    .join(' + ');
}

export function OutpostPanel({
  definition,
  state,
  profile,
  busy,
  onCommand,
  compact = false,
}: OutpostPanelProps) {
  const outpostDefinition = definition.outpost;
  const [assignmentDraft, setAssignmentDraft] = useState<Readonly<
    Record<OutpostJobId, number>
  > | null>(null);
  if (state === null || outpostDefinition === undefined) return null;
  const assignments = assignmentDraft ?? state.jobAssignments;
  const assignedTotal = OUTPOST_JOB_IDS.reduce((sum, id) => sum + assignments[id], 0);
  const recipe = outpostDefinition.recipes.find((item) => item.id === state.activeRecipeId);
  const storedTotal = OUTPOST_RESOURCE_IDS.reduce(
    (sum, resourceId) => sum + state.resources[resourceId],
    0,
  );
  const storageCapacity = getOutpostStorageCapacity(state, outpostDefinition);
  const engineeringProgress = getOutpostProfessionProgress(state, outpostDefinition, 'engineering');
  const nextEngineeringRecipe = outpostDefinition.recipes
    .filter(
      (item) =>
        item.professionId === 'engineering' &&
        item.minimumProfessionLevel > engineeringProgress.level,
    )
    .sort((left, right) => left.minimumProfessionLevel - right.minimumProfessionLevel)[0];
  const productionSinceReview = OUTPOST_JOB_IDS.map((jobId) => ({
    jobId,
    amount: Math.max(0, state.producedByJob[jobId] - state.reviewedProductionByJob[jobId]),
  })).filter((entry) => entry.amount > 0);
  const craftsSinceReview = outpostDefinition.recipes
    .map((item) => ({
      recipeId: item.id,
      batches: Math.max(0, state.craftedByRecipe[item.id] - state.reviewedCraftedByRecipe[item.id]),
    }))
    .filter((entry) => entry.batches > 0);
  const professionExperienceSinceReview = getOutpostProfessionExperienceSinceReview(
    state,
    outpostDefinition,
  );
  const professionGrowthSinceReview = OUTPOST_PROFESSION_IDS.flatMap((professionId) => {
    const experience = professionExperienceSinceReview[professionId];
    if (experience <= 0) return [];
    const previousExperience = Math.max(0, state.professionExperience[professionId] - experience);
    const previousLevel = getOutpostProfessionLevel(
      {
        ...state,
        professionExperience: { ...state.professionExperience, [professionId]: previousExperience },
      },
      outpostDefinition,
      professionId,
    );
    const currentLevel = getOutpostProfessionLevel(state, outpostDefinition, professionId);
    return [
      { professionId, experience, levelUp: currentLevel > previousLevel ? currentLevel : null },
    ];
  });
  const hasNewActivity =
    productionSinceReview.length > 0 ||
    craftsSinceReview.length > 0 ||
    professionGrowthSinceReview.length > 0;

  return (
    <section
      className={`panel outpost-panel ${compact ? 'outpost-panel-compact' : ''}`}
      aria-label="寰门总台驻地"
    >
      <div className="section-title">
        <div>
          <span className="eyebrow">长期驻地 · 持续作业</span>
          <h2>寰门总台</h2>
        </div>
        <span>
          {storedTotal.toFixed(0)} / {storageCapacity} 仓储
        </span>
      </div>
      <section className="outpost-visit-summary" aria-label="驻地回访摘要">
        <div className="section-title">
          <strong>自上次查看以来</strong>
          {hasNewActivity && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => onCommand({ kind: 'acknowledge-outpost-report' })}
            >
              标记已读
            </button>
          )}
        </div>
        {hasNewActivity ? (
          <div className="outpost-ledger-grid">
            {productionSinceReview.map(({ jobId, amount }) => {
              const job = outpostDefinition.jobs.find((item) => item.id === jobId);
              if (job === undefined) return null;
              return (
                <span key={jobId}>
                  {OUTPOST_JOB_COPY[jobId].name} +{formatAmount(amount)}{' '}
                  {OUTPOST_RESOURCE_COPY[job.output].unit}
                </span>
              );
            })}
            {craftsSinceReview.map(({ recipeId, batches }) => (
              <span key={recipeId}>
                {OUTPOST_RECIPE_COPY[recipeId].name} 完成 {batches} 批
              </span>
            ))}
            {professionGrowthSinceReview.map(({ professionId, experience, levelUp }) => (
              <span key={professionId}>
                {OUTPOST_PROFESSION_COPY[professionId]} +{formatAmount(experience)} XP
                {levelUp === null ? '' : ` · 升至等级 ${levelUp}`}
              </span>
            ))}
          </div>
        ) : (
          <small>暂无新产出或完成的制作。</small>
        )}
      </section>
      <div className="outpost-resource-grid" aria-label="驻地库存">
        {OUTPOST_RESOURCE_IDS.map((resourceId) => {
          const id = resourceId;
          const amount = state.resources[resourceId];
          const cap = getOutpostResourceCapacity(state, outpostDefinition, resourceId);
          const copy = OUTPOST_RESOURCE_COPY[resourceId];
          if (amount === 0 && !['reclaimed-alloy', 'charge-cell', 'biofiber'].includes(id))
            return null;
          return (
            <div className="outpost-resource" key={id}>
              <span>{copy.name}</span>
              <strong data-testid={`outpost-resource-${id}`}>
                {formatAmount(amount)} / {formatAmount(cap)} <small>{copy.unit}</small>
              </strong>
            </div>
          );
        })}
      </div>
      <section className="outpost-profession" aria-label="工程专业成长">
        <div className="section-title">
          <strong>工程专业 · 等级 {engineeringProgress.level}</strong>
          <span>
            {formatAmount(engineeringProgress.experience)} XP
            {engineeringProgress.nextLevelExperience === null
              ? ' · 当前上限'
              : ` / ${formatAmount(engineeringProgress.nextLevelExperience)} XP`}
          </span>
        </div>
        {engineeringProgress.nextLevelExperience !== null && (
          <progress
            data-testid="outpost-engineering-progress"
            max={
              engineeringProgress.nextLevelExperience - engineeringProgress.currentLevelExperience
            }
            value={engineeringProgress.experience - engineeringProgress.currentLevelExperience}
            aria-label="工程经验进度"
          />
        )}
        <small>
          {nextEngineeringRecipe === undefined
            ? '已解锁当前版本的工程配方。'
            : `工程等级 ${nextEngineeringRecipe.minimumProfessionLevel} 解锁${OUTPOST_RECIPE_COPY[nextEngineeringRecipe.id].name}${
                nextEngineeringRecipe.requiredClueIds.length > 0 ? '，还需归档对应记录' : ''
              }。`}
        </small>
      </section>

      <details className="outpost-facilities" open>
        <summary>驻地设施</summary>
        {outpostDefinition.facilities.map((facility) => {
          const built = state.facilities[facility.id] >= facility.maxCount;
          const canPay = Object.entries(facility.cost).every(
            ([id, amount]) => state.resources[id as keyof typeof state.resources] >= (amount ?? 0),
          );
          return (
            <article className="outpost-recipe-card" key={facility.id}>
              <div className="section-title">
                <h3>{OUTPOST_FACILITY_COPY[facility.id].name}</h3>
                <span>{built ? '已建成' : '未建'}</span>
              </div>
              <small>效果：{OUTPOST_FACILITY_COPY[facility.id].effect}</small>
              <small>成本：{recipeCostText(facility.cost)}</small>
              <button
                className="secondary"
                disabled={busy || built || !canPay}
                onClick={() =>
                  onCommand({ kind: 'build-outpost-facility', facilityId: facility.id })
                }
              >
                {built
                  ? '设施已建成'
                  : canPay
                    ? `建造${OUTPOST_FACILITY_COPY[facility.id].name}`
                    : '资源不足'}
              </button>
            </article>
          );
        })}
      </details>

      <details className="outpost-workforce" open={!compact}>
        <summary>
          岗位安排 · {assignedTotal} / {outpostDefinition.population} 人
        </summary>
        <div className="outpost-job-list">
          {OUTPOST_JOB_IDS.map((jobId) => {
            const job = outpostDefinition.jobs.find((item) => item.id === jobId);
            if (job === undefined) return null;
            const count = assignments[jobId];
            const workingOnRecipe =
              recipe?.professionId === job.professionId && state.reservedOutput !== null;
            const rate = job.amountPerWorkerHour * Math.max(0, count - (workingOnRecipe ? 1 : 0));
            const resourceName = OUTPOST_RESOURCE_COPY[job.output].name;
            const target = state.jobTargets[jobId];
            const currentStock = state.resources[job.output];
            const stockCap = getOutpostResourceCapacity(state, outpostDefinition, job.output);
            const status =
              count === 0
                ? '无人执行'
                : workingOnRecipe
                  ? '正在承担制作'
                  : target !== null && target > stockCap
                    ? '库存目标高于当前上限'
                    : target !== null && currentStock >= target
                      ? '已达到库存目标'
                      : currentStock >= stockCap || storedTotal >= storageCapacity
                        ? '仓储已满'
                        : '自动作业中';
            const isStoppedByCapacity = currentStock >= stockCap || storedTotal >= storageCapacity;
            const effectiveRate =
              (target !== null && currentStock >= target) || isStoppedByCapacity ? 0 : rate;
            return (
              <div className="outpost-job-card" key={jobId}>
                <div className="outpost-job-row">
                  <div>
                    <strong>{OUTPOST_JOB_COPY[jobId].name}</strong>
                    <small>
                      {OUTPOST_PROFESSION_COPY[job.professionId]} · {formatRate(effectiveRate)}{' '}
                      {resourceName}/时 · {status}
                    </small>
                  </div>
                  <div className="outpost-stepper">
                    <button
                      className="secondary"
                      aria-label={`${OUTPOST_JOB_COPY[jobId].name}减少一人`}
                      disabled={busy || count === 0}
                      onClick={() => setAssignmentDraft({ ...assignments, [jobId]: count - 1 })}
                    >
                      −
                    </button>
                    <output aria-label={`${OUTPOST_JOB_COPY[jobId].name}人数`}>{count}</output>
                    <button
                      className="secondary"
                      aria-label={`${OUTPOST_JOB_COPY[jobId].name}增加一人`}
                      disabled={busy || assignedTotal >= outpostDefinition.population}
                      onClick={() => setAssignmentDraft({ ...assignments, [jobId]: count + 1 })}
                    >
                      ＋
                    </button>
                  </div>
                </div>
                <label className="outpost-target-control">
                  <span>库存目标</span>
                  <select
                    aria-label={`${OUTPOST_JOB_COPY[jobId].name}库存目标`}
                    value={target === null ? 'none' : String(target)}
                    disabled={busy}
                    onChange={(event) =>
                      onCommand({
                        kind: 'set-outpost-job-target',
                        jobId,
                        target: event.target.value === 'none' ? null : Number(event.target.value),
                      })
                    }
                  >
                    <option value="none">持续补满</option>
                    {[20, 40, 60, 100]
                      .filter((value) => value <= stockCap)
                      .map((value) => (
                        <option key={value} value={value}>
                          达到 {value} 后暂停
                        </option>
                      ))}
                    {target !== null && target > stockCap && (
                      <option value={String(target)} disabled>
                        原有目标 {target}（当前上限 {stockCap}，扩容后可用）
                      </option>
                    )}
                  </select>
                </label>
                {target !== null && target > stockCap && (
                  <small className="outpost-target-warning" role="note">
                    已保留原有目标；扩建驻地仓储后才可达到，也可改选当前可用目标。
                  </small>
                )}
              </div>
            );
          })}
        </div>
        {assignmentDraft !== null && (
          <button
            className="secondary"
            disabled={busy || assignedTotal !== outpostDefinition.population}
            onClick={() => {
              onCommand({ kind: 'set-outpost-workers', assignments });
              setAssignmentDraft(null);
            }}
          >
            保存岗位分配
          </button>
        )}
      </details>

      <details className="outpost-recipes" open={!compact}>
        <summary>
          工坊配方 · {recipe === undefined ? '未运行' : OUTPOST_RECIPE_COPY[recipe.id].name}
        </summary>
        {recipe !== undefined && (
          <div className="outpost-active-recipe" aria-label="当前制作任务">
            <div className="section-title">
              <strong>{OUTPOST_RECIPE_COPY[recipe.id].name}</strong>
              <span>
                {state.remainingBatches === null ? '持续循环' : `剩余 ${state.remainingBatches} 批`}
              </span>
            </div>
            <progress
              max={recipe.durationMs}
              value={Math.min(recipe.durationMs, state.recipeProgressMs)}
              aria-label="配方进度"
            />
            <p>{state.pausedReason === null ? '制作中' : OUTPOST_PAUSE_COPY[state.pausedReason]}</p>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => onCommand({ kind: 'stop-outpost-recipe' })}
            >
              停止并退回未消耗原料
            </button>
          </div>
        )}
        <div className="outpost-recipe-list">
          {outpostDefinition.recipes.map((item) => {
            const copy = OUTPOST_RECIPE_COPY[item.id];
            const level = getOutpostProfessionLevel(state, outpostDefinition, item.professionId);
            const missingClue = item.requiredClueIds.find(
              (id) => !profile.discoveredClueIds.includes(id),
            );
            const unlocked = level >= item.minimumProfessionLevel && missingClue === undefined;
            return (
              <article className={`outpost-recipe-card ${unlocked ? '' : 'locked'}`} key={item.id}>
                <div className="section-title">
                  <h3>{copy.name}</h3>
                  <span>{Math.round(item.durationMs / 60_000)} 分/批</span>
                </div>
                <p>{copy.description}</p>
                <small>
                  投入：{recipeCostText(item.inputs)} · 产出：
                  {OUTPOST_RESOURCE_COPY[item.output].name} × {item.outputAmount}
                </small>
                {!unlocked && (
                  <small className="action-hint">
                    {missingClue !== undefined
                      ? '需要先归档对应副本记录'
                      : `${OUTPOST_PROFESSION_COPY[item.professionId]}专业等级 ${item.minimumProfessionLevel}（当前 ${level}）`}
                  </small>
                )}
                {unlocked && (
                  <div className="outpost-recipe-actions">
                    {[1, 5, 20].map((batches) => (
                      <button
                        className="secondary"
                        key={batches}
                        aria-label={`制作${copy.name}${batches}批`}
                        disabled={busy}
                        onClick={() =>
                          onCommand({ kind: 'start-outpost-recipe', recipeId: item.id, batches })
                        }
                      >
                        {batches} 批
                      </button>
                    ))}
                    <button
                      className="secondary"
                      aria-label={`持续制作${copy.name}`}
                      disabled={busy}
                      onClick={() =>
                        onCommand({
                          kind: 'start-outpost-recipe',
                          recipeId: item.id,
                          batches: null,
                        })
                      }
                    >
                      持续
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </details>

      <details className="outpost-ledger">
        <summary>作业总览 · 已产出与已完成制作</summary>
        <div className="outpost-ledger-grid">
          {OUTPOST_JOB_IDS.map((jobId) => {
            const job = outpostDefinition.jobs.find((item) => item.id === jobId);
            if (job === undefined) return null;
            return (
              <span key={jobId}>
                {OUTPOST_JOB_COPY[jobId].name}：{formatAmount(state.producedByJob[jobId])}{' '}
                {OUTPOST_RESOURCE_COPY[job.output].unit}
              </span>
            );
          })}
          {outpostDefinition.recipes.map((item) => (
            <span key={item.id}>
              {OUTPOST_RECIPE_COPY[item.id].name}：{state.craftedByRecipe[item.id]} 批
            </span>
          ))}
        </div>
      </details>
    </section>
  );
}
