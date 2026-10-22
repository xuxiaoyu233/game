import { useState } from 'react';
import type {
  ItemDefinition,
  SkillLoopCommand,
  SkillLoopDefinition,
  SkillLoopState,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import { getOfflinePlan } from '../../domain/skill-loop/rates';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import { getCategoryGroupId } from './derivations';
import { deriveWarehouseRelations } from '../warehouse-relations';
import {
  DASH,
  formatCount,
  formatCycleMultiplier,
  formatElapsed,
  formatShortDuration,
} from './format';
import { Icon } from './Icon';

export interface WarehousePanelProps {
  readonly theme: SkillLoopTheme;
  readonly definition: SkillLoopDefinition;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
  readonly busy: boolean;
  readonly onCommand: (command: SkillLoopCommand) => void;
}

/** Inventory is grouped by category and searchable, so two dozen items never become a wall. */
export function WarehousePanel({
  theme,
  definition,
  state,
  summary,
  busy,
  onCommand,
}: WarehousePanelProps) {
  const [query, setQuery] = useState('');
  // Categories holding stock start expanded (that is what the player cares about); an explicit
  // collapse is remembered, so the panel never hides progress without being asked to.
  const [collapsed, setCollapsed] = useState<readonly string[]>([]);
  const activeBuff = state.buffs?.[0] ?? null;
  const fuel = definition.offlineFuel;
  const offers = definition.shopOffers ?? [];
  const sellOffers = definition.sellOffers ?? [];
  const plan = getOfflinePlan(state, definition);
  const needle = query.trim().toLowerCase();
  const hasStock = (categoryId: string): boolean =>
    definition.items.some(
      (item) => item.categoryId === categoryId && (state.inventory[item.id] ?? 0) > 0,
    );
  const searching = needle !== '';

  const matches = (item: ItemDefinition): boolean => {
    if (needle === '') return true;
    const label = theme.itemCopy[item.id]?.label ?? '';
    const category = theme.categoryCopy[item.categoryId]?.label ?? '';
    return (
      label.toLowerCase().includes(needle) ||
      item.id.toLowerCase().includes(needle) ||
      category.toLowerCase().includes(needle)
    );
  };

  const groups = definition.itemCategories
    .map((category) => ({
      category,
      items: definition.items.filter((item) => item.categoryId === category.id && matches(item)),
    }))
    .filter((group) => group.items.length > 0);

  const totalMatched = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <section className="skill-prototype-section" aria-labelledby="inventory-title">
      <div className="skill-prototype-section-heading">
        <h2 id="inventory-title">仓库</h2>
        <span>当前数量</span>
      </div>

      <div className="skill-prototype-status-strip" data-testid="consumable-status">
        <div className="skill-prototype-status-card">
          <strong>{theme.uiCopy.buffHeading}</strong>
          {activeBuff !== null ? (
            <p data-testid="active-buff">
              {theme.itemCopy[activeBuff.sourceItemId]?.label ?? activeBuff.sourceItemId}
              {activeBuff.speedMultiplierPermille !== undefined &&
                ` · ${formatCycleMultiplier(activeBuff.speedMultiplierPermille)}`}
              {activeBuff.xpMultiplierPermille !== undefined &&
                ` · 经验 +${Math.round((activeBuff.xpMultiplierPermille - 1_000) / 10)}%`}
              {` · 剩余 ${formatElapsed(activeBuff.remainingMs)}`}
            </p>
          ) : (
            <p className="skill-prototype-status-empty">{theme.uiCopy.buffDescription}</p>
          )}
        </div>
        {fuel !== undefined && (
          <div className="skill-prototype-status-card">
            <strong>{theme.uiCopy.fuelHeading}</strong>
            <p data-testid="fuel-count">
              {theme.itemCopy[fuel.itemId]?.label ?? fuel.itemId} ×{' '}
              {formatCount(state.inventory[fuel.itemId] ?? 0)}
            </p>
            <small>{theme.uiCopy.fuelDescription}</small>
          </div>
        )}
        <div className="skill-prototype-status-card">
          <strong>离线规划</strong>
          <p data-testid="offline-plan">
            {plan.projectedCycles === 0
              ? '当前没有运行中的活动'
              : `上限 ${formatShortDuration(plan.maxWindowMs)} · 可完成 ${formatCount(
                  plan.projectedCycles,
                )} 次${
                  plan.projectedOutputs.length === 0
                    ? ''
                    : ` → ${plan.projectedOutputs
                        .map(
                          (output) =>
                            `${theme.itemCopy[output.itemId]?.label ?? output.itemId} ${formatCount(output.amount)}`,
                        )
                        .join('、')}`
                }`}
          </p>
          <small>
            {plan.fuelItemId === null
              ? '没有配置离线燃料'
              : plan.fuelUnitsSpendable === 0
                ? `无${theme.itemCopy[plan.fuelItemId]?.label ?? plan.fuelItemId}，无法延长`
                : `${theme.itemCopy[plan.fuelItemId]?.label ?? plan.fuelItemId} ${formatCount(
                    plan.fuelUnitsSpendable,
                  )} 份可用，可延长 ${formatShortDuration(plan.maxWindowMs - plan.baseWindowMs)}`}
            {plan.offlineCapBonusMs > 0 &&
              ` · 等级加成 +${formatShortDuration(plan.offlineCapBonusMs)}`}
            {plan.projectedXp > 0 && ` · 预计 ${formatCount(plan.projectedXp)} XP`}
          </small>
        </div>
      </div>

      <div className="skill-prototype-search">
        <Icon iconId="raw-material" className="skill-prototype-search-icon" />
        <input
          type="search"
          className="skill-prototype-search-input"
          data-testid="inventory-search"
          value={query}
          placeholder="搜索资源名称、类别或 ID"
          aria-label="搜索仓库资源"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="skill-prototype-search-count">
          {searching ? `${totalMatched} 项匹配` : `${definition.items.length} 件`}
        </span>
      </div>

      {groups.length === 0 && (
        <p className="skill-prototype-section-note" data-testid="inventory-empty">
          没有匹配的资源；换个名称或清空搜索框。
        </p>
      )}

      {groups.map((group) => {
        const categoryLabel = theme.categoryCopy[group.category.id]?.label ?? group.category.id;
        return (
          <details
            className={`skill-prototype-inventory-group tone-${getCategoryGroupId(group.category.id)}`}
            data-testid={`inventory-group-${group.category.id}`}
            key={group.category.id}
            open={
              searching || (hasStock(group.category.id) && !collapsed.includes(group.category.id))
            }
          >
            <summary
              onClick={(event) => {
                // Fully controlled: the click drives our state instead of the native toggle.
                event.preventDefault();
                if (searching) return;
                setCollapsed((current) =>
                  current.includes(group.category.id)
                    ? current.filter((id) => id !== group.category.id)
                    : [...current, group.category.id],
                );
              }}
            >
              <Icon iconId={group.category.id} className="skill-prototype-group-icon" />
              <strong>{categoryLabel}</strong>
              <span>
                {group.items.length} 件
                {searching ? '' : hasStock(group.category.id) ? ' · 有库存' : ' · 空'}
              </span>
            </summary>
            <table className="skill-prototype-inventory">
              <thead>
                <tr>
                  <th scope="col">资源</th>
                  <th scope="col">数量</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => {
                  const relations = deriveWarehouseRelations(
                    item.id,
                    definition,
                    theme,
                    state,
                    summary,
                  );
                  return (
                    <tr key={item.id} data-testid={`inventory-${item.id}`}>
                      <th scope="row">
                        <span className="skill-prototype-inventory-name">
                          <span className="skill-prototype-icon-bubble" aria-hidden="true">
                            <Icon iconId={item.id} className="skill-prototype-item-icon" />
                          </span>
                          {theme.itemCopy[item.id]?.label ?? item.id}
                        </span>
                        {item.consumable !== undefined && (state.inventory[item.id] ?? 0) > 0 && (
                          <button
                            className="secondary-button skill-prototype-consume"
                            data-testid={`consume-${item.id}`}
                            disabled={busy}
                            onClick={() => onCommand({ kind: 'consume', itemId: item.id })}
                          >
                            {theme.uiCopy.consumeAction}
                          </button>
                        )}
                        <details
                          className="skill-prototype-inventory-relations"
                          data-testid={`inventory-relations-${item.id}`}
                        >
                          <summary>查看来源与用途</summary>
                          <div className="skill-prototype-relation-groups">
                            {(['sources', 'uses'] as const).map((kind) => {
                              const entries = relations[kind];
                              return (
                                <div className="skill-prototype-relation-group" key={kind}>
                                  <strong>{kind === 'sources' ? '来源' : '用途'}</strong>
                                  {entries.length > 0 ? (
                                    entries.map((relation) => (
                                      <div
                                        className="skill-prototype-relation-entry"
                                        key={relation.id}
                                      >
                                        <span>{relation.label}</span>
                                        <small
                                          className={`skill-prototype-relation-status skill-prototype-relation-status-${relation.status}`}
                                        >
                                          {relation.statusText}
                                        </small>
                                      </div>
                                    ))
                                  ) : (
                                    <small className="skill-prototype-relation-status-unknown">
                                      暂无{kind === 'sources' ? '来源' : '用途'}
                                    </small>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      </th>
                      <td>
                        <output>{formatCount(state.inventory[item.id] ?? 0)}</output>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </details>
        );
      })}

      {/* Shop and sell sit in one trade band so a wide window can place them side by side; the
          narrow layout keeps them stacked in the same order. */}
      <div className="skill-prototype-trade">
        {offers.length > 0 && (
          <section className="skill-prototype-shop" aria-labelledby="shop-title">
            <div className="skill-prototype-section-heading">
              <h2 id="shop-title">{theme.uiCopy.shopHeading}</h2>
              <span>{theme.uiCopy.shopCoinLabel}</span>
            </div>
            <p className="skill-prototype-shop-description">{theme.uiCopy.shopDescription}</p>
            <div className="skill-prototype-shop-list">
              {offers.map((offer) => {
                const coins = state.inventory['coin'] ?? 0;
                const affordable = coins >= offer.coinCost;
                const offerCategoryId = definition.items.find(
                  (entry) => entry.id === offer.itemId,
                )?.categoryId;
                return (
                  <article
                    className={`skill-prototype-shop-offer tone-${getCategoryGroupId(offerCategoryId ?? '')}`}
                    key={offer.id}
                  >
                    <div>
                      <strong>
                        <span className="skill-prototype-icon-bubble" aria-hidden="true">
                          <Icon iconId={offer.itemId} className="skill-prototype-item-icon" />
                        </span>
                        {theme.itemCopy[offer.itemId]?.label ?? offer.itemId} × {offer.amount}
                      </strong>
                      <small>
                        {theme.itemCopy['coin']?.label ?? 'coin'} × {formatCount(offer.coinCost)}
                      </small>
                    </div>
                    <button
                      className="secondary-button skill-prototype-shop-buy"
                      data-testid={`shop-buy-${offer.id}`}
                      disabled={busy || !affordable}
                      onClick={() => onCommand({ kind: 'purchase', offerId: offer.id })}
                    >
                      {affordable
                        ? theme.uiCopy.shopBuyPrefix
                        : `尚缺 ${formatCount(offer.coinCost - coins)}`}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {sellOffers.length > 0 && (
          <section className="skill-prototype-shop" aria-labelledby="sell-title">
            <div className="skill-prototype-section-heading">
              <h2 id="sell-title">{theme.uiCopy.sellHeading}</h2>
              <span>{theme.uiCopy.shopCoinLabel}</span>
            </div>
            <p className="skill-prototype-shop-description">{theme.uiCopy.sellDescription}</p>
            <div className="skill-prototype-shop-list">
              {sellOffers.map((offer) => {
                const owned = state.inventory[offer.itemId] ?? 0;
                const affordable = owned >= offer.amount;
                const offerCategoryId = definition.items.find(
                  (entry) => entry.id === offer.itemId,
                )?.categoryId;
                return (
                  <article
                    className={`skill-prototype-shop-offer tone-${getCategoryGroupId(offerCategoryId ?? '')}`}
                    key={offer.id}
                  >
                    <div>
                      <strong>
                        <span className="skill-prototype-icon-bubble" aria-hidden="true">
                          <Icon iconId={offer.itemId} className="skill-prototype-item-icon" />
                        </span>
                        {theme.itemCopy[offer.itemId]?.label ?? offer.itemId} × {offer.amount}
                      </strong>
                      <small>
                        {theme.itemCopy['coin']?.label ?? 'coin'} × {formatCount(offer.coinValue)}
                      </small>
                    </div>
                    <button
                      className="secondary-button skill-prototype-shop-buy"
                      data-testid={`sell-${offer.id}`}
                      disabled={busy || !affordable}
                      onClick={() => onCommand({ kind: 'sell', offerId: offer.id })}
                    >
                      {affordable
                        ? theme.uiCopy.sellActionPrefix
                        : `尚缺 ${formatCount(offer.amount - owned)}`}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {!searching && plan.projectedCycles === 0 && (
        <p className="skill-prototype-section-note">{DASH} 选择一个活动后，这里会估算离线收益。</p>
      )}
    </section>
  );
}
