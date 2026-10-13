import type { KeyboardEvent, MutableRefObject } from 'react';
import { PROTOTYPE_TABS, type PrototypeTabId } from './tabs';

interface SkillMenuProps {
  readonly activeTab: PrototypeTabId;
  readonly tabButtonRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
  readonly onSelect: (tab: PrototypeTabId) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
}

/**
 * 主导航条。当前形态是三页签（训练/仓库/成长），骨架批次 `melvor-ia` 会改为
 * “技能 · 银行 · 商店 · 装备 · 熟练”的技能中心导航，此组件负责承载该变化。
 */

export function SkillMenu({ activeTab, tabButtonRefs, onSelect, onKeyDown }: SkillMenuProps) {
  return (
    <div
      className="skill-prototype-tabs"
      role="tablist"
      aria-label="游戏页面"
      data-testid="tab-list"
    >
      {PROTOTYPE_TABS.map((tab, index) => {
        const selected = activeTab === tab.id;
        return (
          <button
            className="skill-prototype-tab"
            type="button"
            key={tab.id}
            id={`prototype-tab-${tab.id}`}
            role="tab"
            aria-selected={selected}
            aria-controls="skill-prototype-tab-panel"
            tabIndex={selected ? 0 : -1}
            data-testid={`tab-${tab.id}`}
            ref={(element) => {
              tabButtonRefs.current[index] = element;
            }}
            onClick={() => onSelect(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
