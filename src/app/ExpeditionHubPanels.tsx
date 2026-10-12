import { type WorldVariantDefinition } from '../domain/expedition/types';
import {
  CONTRACT_COPY,
  OBJECTIVE_COPY,
  PERK_COPY,
  RESEARCH_COPY,
  WORLD_COPY,
  WORLD_VARIANT_COPY,
} from '../themes/expedition-copy';
import { CLUE_COPY, FIRST_EXPEDITION_GUIDANCE } from '../themes/story-copy-v13';
import { DifficultyModifierSelector } from './DifficultyModifierSelector';
import { OutpostPanel } from './OutpostPanel';
import { StoryPanels } from './StoryPanels';
import type { ExpeditionHubPanelsProps } from './expedition-panels-types';
import {
  researchEffectText,
  rewardName,
  selectedVariant,
  settlementStoryResponse,
} from './expedition-panel-model';
import { getResourceName } from './resource-copy';

export function ExpeditionHubPanels({
  definition,
  state,
  summary,
  busy,
  onCommand,
  storyArchiveEntries,
  hubTab,
  setHubTab,
  selectedContractIds,
  setSelectedContractIds,
}: ExpeditionHubPanelsProps) {
  const run = state.activeRun;
  const recommendedWorld =
    definition.worlds.find(
      (item) =>
        summary.availableWorldIds.includes(item.id) &&
        !state.profile.clearedWorldIds.includes(item.id),
    ) ?? definition.worlds.find((item) => summary.availableWorldIds.includes(item.id));
  const firstExpedition = state.profile.clearedWorldIds.length === 0;
  if (run === null) {
    const settlement = state.lastSettlement;
    const storyResponse = settlementStoryResponse(state);
    return (
      <>
        <section className="hub-intro">
          <span className="eyebrow">寰门总台 · 行动调度</span>
          <div className="resource-heading">
            <h2>追查被删除的求援者</h2>
            <span className="points" data-testid="points">
              {state.profile.points} 界点
            </span>
          </div>
          <p>
            {firstExpedition
              ? FIRST_EXPEDITION_GUIDANCE
              : '每次回归都会带回可复核的现场记录。选择下一份契约，再决定是否承担额外行动风险。'}
          </p>
        </section>
        <nav className="hub-tabs" role="tablist" aria-label="主空间">
          {(
            [
              ['departure', '出发'],
              ['growth', '成长'],
              ['archive', '档案'],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              role="tab"
              aria-selected={hubTab === tab}
              className={hubTab === tab ? 'selected' : ''}
              onClick={() => setHubTab(tab)}
            >
              {label}
            </button>
          ))}
        </nav>
        {hubTab === 'departure' && (
          <>
            {settlement !== null && (
              <section className="panel settlement-preview" aria-label="上次结算摘要">
                <div>
                  <span className="eyebrow">上次回归</span>
                  <strong>
                    {WORLD_COPY[settlement.worldId]?.name} · +{settlement.points} 界点
                  </strong>
                </div>
                <button className="text-button" onClick={() => setHubTab('archive')}>
                  查看档案 →
                </button>
              </section>
            )}
            {recommendedWorld !== undefined &&
              (() => {
                const contracts = definition.contracts.filter(
                  (contract) => contract.worldId === recommendedWorld.id,
                );
                const variant = selectedVariant(state, definition, recommendedWorld.id);
                const contract = variant
                  ? contracts.find((item) => item.id === variant.contractId)
                  : (contracts.find(
                      (item) => item.id === selectedContractIds[recommendedWorld.id],
                    ) ?? contracts.find((item) => item.isDefault));
                const objectiveIds = [
                  ...(contract?.primaryObjectiveIds ?? []),
                  ...(contract?.optionalObjectiveIds ?? []),
                ];
                const reward =
                  definition.rewards.base +
                  objectiveIds.reduce((total, id) => {
                    const objective = definition.objectives.find((item) => item.id === id);
                    return total + (objective?.rewardPoints ?? 0);
                  }, 0);
                const worldCopy = WORLD_COPY[recommendedWorld.id];
                return (
                  <section className="panel recommended-world" aria-label="推荐契约">
                    <span className="eyebrow">建议继续</span>
                    <div className="section-title">
                      <h2>{worldCopy?.name ?? recommendedWorld.id}</h2>
                      <span>
                        {variant
                          ? (WORLD_VARIANT_COPY[variant.id]?.name ?? variant.id)
                          : contract
                            ? CONTRACT_COPY[contract.id]?.name
                            : '基础契约'}
                      </span>
                    </div>
                    <p>{worldCopy?.objective ?? '完成世界契约，带回新的线索。'}</p>
                    <div className="world-outcome-summary">
                      <span>基础回归约 +{reward} 界点</span>
                      <span>局内能芯、锚材与建筑每次行动后重置</span>
                    </div>
                    <DifficultyModifierSelector
                      definition={definition}
                      world={recommendedWorld}
                      selectedModifierIds={
                        state.profile.selectedDifficultyModifierIds[recommendedWorld.id] ?? []
                      }
                      disabled={busy}
                      onCommand={onCommand}
                    />
                    {contracts.length > 1 && !variant && (
                      <label className="recommended-contract">
                        本次契约
                        <select
                          aria-label={`${worldCopy?.name ?? recommendedWorld.id}本次契约`}
                          value={contract?.id ?? ''}
                          disabled={busy}
                          onChange={(event) =>
                            setSelectedContractIds((current) => ({
                              ...current,
                              [recommendedWorld.id]: event.target.value,
                            }))
                          }
                        >
                          {contracts.map((item) => (
                            <option
                              key={item.id}
                              value={item.id}
                              disabled={!summary.availableContractIds.includes(item.id)}
                            >
                              {CONTRACT_COPY[item.id]?.name ?? item.id}
                              {!summary.availableContractIds.includes(item.id) ? ' · 未解锁' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    <button
                      className="primary-action full-width"
                      disabled={busy || !contract}
                      aria-label={`进入${worldCopy?.name ?? recommendedWorld.id}`}
                      onClick={() =>
                        onCommand({
                          kind: 'enter-world',
                          worldId: recommendedWorld.id,
                          ...(contract ? { contractId: contract.id } : {}),
                        })
                      }
                    >
                      准备并进入
                    </button>
                  </section>
                );
              })()}
            <StoryPanels
              definition={definition}
              state={state}
              summary={summary}
              busy={busy}
              onCommand={onCommand}
              storyArchiveEntries={storyArchiveEntries}
              view="journey"
            />
            <details className="panel world-picker">
              <summary>世界与行动契约</summary>
              <section className="panel">
                <div className="section-title">
                  <h2>可用世界</h2>
                  <span>局内物资 · 每次行动后清空</span>
                </div>
                {definition.worlds.map((item) => {
                  const copy = WORLD_COPY[item.id];
                  const unlocked = summary.availableWorldIds.includes(item.id);
                  const cleared = state.profile.clearedWorldIds.includes(item.id);
                  const contracts = definition.contracts.filter(
                    (contract) => contract.worldId === item.id,
                  );
                  const variants = (definition.worldVariants ?? []).filter(
                    (variant) => variant.worldId === item.id,
                  );
                  const variant = selectedVariant(state, definition, item.id);
                  const defaultContract = contracts.find((contract) => contract.isDefault);
                  const selectedContractId =
                    variant?.contractId ??
                    selectedContractIds[item.id] ??
                    defaultContract?.id ??
                    '';
                  const selectedContract = contracts.find(
                    (contract) => contract.id === selectedContractId,
                  );
                  const selectedPrimaryObjectives =
                    selectedContract?.primaryObjectiveIds
                      .map((id) => definition.objectives.find((objective) => objective.id === id))
                      .filter((objective) => objective !== undefined) ?? [];
                  const selectedOptionalObjectives =
                    selectedContract?.optionalObjectiveIds
                      .map((id) => definition.objectives.find((objective) => objective.id === id))
                      .filter((objective) => objective !== undefined) ?? [];
                  const requiredRewardPoints = selectedPrimaryObjectives.reduce(
                    (sum, objective) => sum + objective.rewardPoints,
                    0,
                  );
                  const optionalRewardPoints = selectedOptionalObjectives.reduce(
                    (sum, objective) => sum + objective.rewardPoints,
                    0,
                  );
                  return (
                    <div key={item.id} className={`world-card ${unlocked ? '' : 'locked'}`}>
                      <div className="world-card-title">
                        <h3>{copy?.name ?? item.id}</h3>
                        <span>
                          {cleared ? '已完成 · 可重入' : unlocked ? copy?.subtitle : '尚未解锁'}
                        </span>
                      </div>
                      <p>{copy?.description}</p>
                      {unlocked && item.id !== recommendedWorld?.id && (
                        <DifficultyModifierSelector
                          definition={definition}
                          world={item}
                          selectedModifierIds={
                            state.profile.selectedDifficultyModifierIds[item.id] ?? []
                          }
                          disabled={busy}
                          onCommand={onCommand}
                        />
                      )}
                      {cleared && variants.length > 0 && (
                        <label className="contract-choice">
                          固定返场变体
                          <select
                            aria-label={`${copy?.name ?? item.id}返场变体`}
                            value={variant?.id ?? ''}
                            disabled={!unlocked || busy}
                            onChange={(event) => {
                              const worldVariantId = event.target.value;
                              onCommand({
                                kind: 'select-world-variant',
                                worldVariantId:
                                  worldVariantId.length > 0
                                    ? (worldVariantId as WorldVariantDefinition['id'])
                                    : null,
                                worldId: item.id,
                              });
                            }}
                          >
                            <option value="">未选定 · 使用常规任务</option>
                            {variants.map((candidate) => {
                              const available = summary.availableWorldVariantIds.includes(
                                candidate.id,
                              );
                              return (
                                <option
                                  key={candidate.id}
                                  value={candidate.id}
                                  disabled={!available}
                                >
                                  {WORLD_VARIANT_COPY[candidate.id]?.name ?? candidate.id}
                                  {!available ? ' · 当前故事分支未开放' : ''}
                                </option>
                              );
                            })}
                          </select>
                          {variant && <small>{WORLD_VARIANT_COPY[variant.id]?.description}</small>}
                        </label>
                      )}
                      <div className="world-card-bottom">
                        <small>
                          {unlocked
                            ? copy?.objective
                            : `完成${WORLD_COPY[item.unlockAfterWorld ?? '']?.name ?? '前置世界'}后解锁`}
                        </small>
                        <button
                          className="purchase"
                          disabled={busy || !unlocked || !selectedContract}
                          onClick={() =>
                            onCommand({
                              kind: 'enter-world',
                              worldId: item.id,
                              ...(selectedContract ? { contractId: selectedContract.id } : {}),
                            })
                          }
                          aria-label={`进入${copy?.name ?? item.id}`}
                        >
                          {unlocked ? '进入世界 →' : '待解锁'}
                        </button>
                      </div>
                      {contracts.length > 1 && !variant && (
                        <div className="contract-choice">
                          <label>
                            本次契约
                            <select
                              aria-label={`${copy?.name ?? item.id}本次契约`}
                              value={selectedContractId}
                              disabled={!unlocked || busy}
                              onChange={(event) =>
                                setSelectedContractIds((current) => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                            >
                              {contracts.map((contract) => (
                                <option
                                  key={contract.id}
                                  value={contract.id}
                                  disabled={!summary.availableContractIds.includes(contract.id)}
                                >
                                  {CONTRACT_COPY[contract.id]?.name ?? contract.id}
                                  {!summary.availableContractIds.includes(contract.id)
                                    ? ' · 未解锁'
                                    : ''}
                                </option>
                              ))}
                            </select>
                          </label>
                          <p>
                            {summary.availableContractIds.includes(selectedContractId)
                              ? (CONTRACT_COPY[selectedContractId]?.description ??
                                '完成本次契约目标后回归主空间。')
                              : (CONTRACT_COPY[selectedContractId]?.unlockHint ??
                                '完成相关目标后开放。')}
                          </p>
                          {selectedContract &&
                            summary.availableContractIds.includes(selectedContractId) && (
                              <div
                                className="contract-reward-comparison"
                                aria-label="契约回报与目标"
                              >
                                <div className="world-card-bottom">
                                  <small>基础回归 + 必做目标</small>
                                  <strong>+{definition.rewards.base + requiredRewardPoints}</strong>
                                </div>
                                <div className="world-card-bottom">
                                  <small>可选目标额外回报</small>
                                  <strong>最多 +{optionalRewardPoints}</strong>
                                </div>
                                <small>
                                  必做：
                                  {selectedPrimaryObjectives
                                    .map(
                                      (objective) =>
                                        OBJECTIVE_COPY[objective.id]?.name ?? objective.id,
                                    )
                                    .join('、')}
                                  {selectedOptionalObjectives.length > 0
                                    ? `；可选：${selectedOptionalObjectives
                                        .map(
                                          (objective) =>
                                            OBJECTIVE_COPY[objective.id]?.name ?? objective.id,
                                        )
                                        .join('、')}`
                                    : ''}
                                </small>
                                <small>完成必做后可安全回归；继续挑战前可锁定当前回报。</small>
                              </div>
                            )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            </details>
            <details className="panel help-panel">
              <summary>旅程规则</summary>
              <p>
                {getResourceName(recommendedWorld, 'wood')}用于供能与生产，
                {getResourceName(recommendedWorld, 'stone')}
                用于建设和加固界锚。行动阶段自动生产；界潮和现场异动会停下来等你确认。建成临时避难所并守住两次界潮即可回归，之后可锁定成果再挑战。
              </p>
              <p>
                {getResourceName(recommendedWorld, 'wood')}、
                {getResourceName(recommendedWorld, 'stone')}
                和设施每次行动后重置；界点、能力与已带回证据留在总台。
              </p>
            </details>
          </>
        )}
        {hubTab === 'growth' && (
          <>
            <OutpostPanel
              definition={definition}
              state={state.outpost}
              profile={state.profile}
              busy={busy}
              onCommand={onCommand}
            />
            <section className="panel growth-panel">
              <div className="section-title">
                <h2>永久成长</h2>
                <span>兑换后影响后续旅程</span>
              </div>
              {definition.perks.map((perk) => {
                const copy = PERK_COPY[perk.id];
                const owned = state.profile.perkIds.includes(perk.id);
                const pointsMissing = Math.max(0, perk.cost - state.profile.points);
                const effect =
                  perk.id === 'harvest-training'
                    ? `手动与自动采集 +${Math.round((definition.harvestMultiplier - 1) * 100)}%`
                    : perk.id === 'reinforced-core'
                      ? `生命上限 ${definition.baseHp} → ${Math.round(definition.baseHp * definition.hpMultiplier)}`
                      : `每局一次恢复 ${definition.repairHp} 生命`;
                return (
                  <div className="shop-row" key={perk.id}>
                    <div className="shop-copy">
                      <h3>{copy.name}</h3>
                      <p>
                        {effect} · {copy.description}
                      </p>
                    </div>
                    <button
                      className="purchase"
                      aria-label={`兑换${copy.name}`}
                      disabled={busy || owned || state.profile.points < perk.cost}
                      onClick={() => onCommand({ kind: 'buy-perk', perkId: perk.id })}
                    >
                      {owned ? '已兑换' : `兑换 · ${perk.cost} 界点`}
                    </button>
                    {!owned && pointsMissing > 0 && (
                      <small className="action-hint">还差 {pointsMissing} 界点</small>
                    )}
                  </div>
                );
              })}
              {definition.researchRoot && (definition.researchNodes?.length ?? 0) > 0 && (
                <section className="research-tree" aria-label="准备工具研究">
                  <div className="section-title">
                    <h2>行动准备工具</h2>
                    <span>同一界点池 · 每次行动冻结一个准备工具</span>
                  </div>
                  <p>
                    {definition.researchRoot.requiredClueIds.every((clueId) =>
                      state.profile.discoveredClueIds.includes(clueId),
                    )
                      ? '共同根节点已开启。研究永久保留，准备槽可在每次出发前更换；本批工具用于第七环行动。'
                      : `共同根节点尚未开启；先带回线索：${definition.researchRoot.requiredClueIds
                          .map((clueId) => CLUE_COPY[clueId]?.title ?? clueId)
                          .join('、')}。`}
                  </p>
                  <div className="preparation-slot" aria-label="当前准备槽">
                    唯一准备槽：
                    <strong>
                      {state.profile.equippedPreparationId
                        ? RESEARCH_COPY[state.profile.equippedPreparationId]?.name
                        : '空'}
                    </strong>
                  </div>
                  {(definition.researchNodes ?? []).map((node) => {
                    const copy = RESEARCH_COPY[node.id];
                    const owned = state.profile.researchNodeIds.includes(node.id);
                    const available = summary.availableResearchNodeIds.includes(node.id);
                    const pointsMissing = Math.max(0, node.cost - state.profile.points);
                    const equipped = state.profile.equippedPreparationId === node.id;
                    return (
                      <div
                        className={`shop-row ${available || owned ? '' : 'locked'}`}
                        key={node.id}
                      >
                        <div className="shop-copy">
                          <h3>{copy.name}</h3>
                          <p>
                            {researchEffectText(node, recommendedWorld ?? definition.worlds[0])} ·{' '}
                            {copy.description}
                          </p>
                          {node.appliesToWorldIds !== undefined && (
                            <small className="action-hint">
                              适用世界：
                              {node.appliesToWorldIds
                                .map((worldId) => WORLD_COPY[worldId]?.name ?? worldId)
                                .join('、')}
                            </small>
                          )}
                          {!available && !owned && (
                            <small className="action-hint">
                              前置：
                              {node.requiredClueIds
                                .filter(
                                  (clueId) => !state.profile.discoveredClueIds.includes(clueId),
                                )
                                .map((clueId) => CLUE_COPY[clueId]?.title ?? clueId)
                                .join('、') || '研究前置节点尚未完成'}
                            </small>
                          )}
                        </div>
                        <div className="research-actions">
                          <button
                            className="purchase"
                            aria-label={`研究${copy.name}`}
                            disabled={
                              busy || owned || !available || state.profile.points < node.cost
                            }
                            onClick={() =>
                              onCommand({ kind: 'research-node', researchNodeId: node.id })
                            }
                          >
                            {owned ? '已研究' : `研究 · ${node.cost} 界点`}
                          </button>
                          {owned && (
                            <button
                              className="secondary"
                              aria-label={equipped ? `卸下${copy.name}` : `装备${copy.name}`}
                              disabled={busy}
                              onClick={() =>
                                onCommand({
                                  kind: 'equip-preparation',
                                  researchNodeId: equipped ? null : node.id,
                                })
                              }
                            >
                              {equipped ? '卸下准备' : '装入准备槽'}
                            </button>
                          )}
                        </div>
                        {!owned && pointsMissing > 0 && (
                          <small className="action-hint">还差 {pointsMissing} 界点</small>
                        )}
                      </div>
                    );
                  })}
                </section>
              )}
            </section>
          </>
        )}
        {hubTab === 'archive' && (
          <>
            {settlement !== null && (
              <section
                className={`panel settlement ${settlement.outcome === 'success' || settlement.outcome === 'secured' ? '' : 'muted-panel'}`}
              >
                <span className="eyebrow">第 {settlement.sequence} 次旅程 · 已结算</span>
                <div className="section-title">
                  <h2>
                    {settlement.outcome === 'success'
                      ? '回归成功'
                      : settlement.outcome === 'secured'
                        ? '回归成果已确认'
                        : settlement.outcome === 'failed'
                          ? '行动失败'
                          : '已撤离副本'}
                  </h2>
                  <strong>+{settlement.points} 界点</strong>
                </div>
                <p>
                  {WORLD_COPY[settlement.worldId]?.name} · 守住 {settlement.clearedWaves} 次界潮
                </p>
                {settlement.rewards.map((line) => (
                  <div className="reward-line" key={line.id}>
                    <span>{rewardName(line.id)}</span>
                    <span>+{line.points}</span>
                  </div>
                ))}
                {storyResponse !== null && (
                  <aside
                    className="settlement-story-response"
                    data-testid="settlement-story-response"
                  >
                    <strong>{storyResponse.title}</strong>
                    <p>{storyResponse.text}</p>
                  </aside>
                )}
                {(settlement.outcome === 'success' || settlement.outcome === 'secured') &&
                  settlement.completedObjectiveIds.map((objectiveId) => {
                    const returnText = OBJECTIVE_COPY[objectiveId]?.returnText;
                    return returnText ? <p key={objectiveId}>{returnText}</p> : null;
                  })}
              </section>
            )}
            <StoryPanels
              definition={definition}
              state={state}
              summary={summary}
              busy={busy}
              onCommand={onCommand}
              storyArchiveEntries={storyArchiveEntries}
              view="archive"
            />
          </>
        )}
      </>
    );
  }
  return null;
}
