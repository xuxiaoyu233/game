import type { SkillLoopState, SkillLoopSummary } from '../../domain/skill-loop/types';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import type { SkillPrototypeV1Package } from '../skill-prototype-types';
import { formatCount } from '../format';
import { deriveWarehouseRelations } from '../warehouse-relations';

interface BankPageProps {
  readonly content: SkillPrototypeV1Package;
  readonly theme: SkillLoopTheme;
  readonly state: SkillLoopState;
  readonly summary: SkillLoopSummary;
}

/**
 * 仓库页：当前形态是类别/资源/数量表格，每行可展开来源与用途。
 * 骨架批次 `bank-grid` 会改为 Melvor 式物品格 + 选中详情，来源/用途派生逻辑复用。
 */

export function BankPage({ content, theme, state, summary }: BankPageProps) {
  const { definition } = content;
  return (
    <section className="skill-prototype-section" aria-labelledby="inventory-title">
      <div className="skill-prototype-section-heading">
        <h2 id="inventory-title">仓库</h2>
        <span>当前数量</span>
      </div>
      <table className="skill-prototype-inventory">
        <thead>
          <tr>
            <th scope="col">类别</th>
            <th scope="col">资源</th>
            <th scope="col">数量</th>
          </tr>
        </thead>
        <tbody>
          {definition.items.map((item) => {
            const relations = deriveWarehouseRelations(item.id, definition, theme, state, summary);
            return (
              <tr key={item.id} data-testid={`inventory-${item.id}`}>
                <td>{theme.categoryCopy[item.categoryId]?.label ?? item.categoryId}</td>
                <th scope="row">
                  <span>{theme.itemCopy[item.id]?.label ?? item.id}</span>
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
                                <div className="skill-prototype-relation-entry" key={relation.id}>
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
    </section>
  );
}
