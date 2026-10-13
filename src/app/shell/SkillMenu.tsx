import { useState, type KeyboardEvent, type MutableRefObject } from 'react';
import type { SkillLoopId } from '../../domain/skill-loop/types';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import { PROTOTYPE_TABS, SECONDARY_TABS, type PrototypeTabId } from './tabs';

interface SkillMenuProps {
  readonly activeTab: PrototypeTabId;
  readonly tabButtonRefs: MutableRefObject<(HTMLButtonElement | null)[]>;
  readonly onSelect: (tab: PrototypeTabId) => void;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
}

/**
 * 主导航条（Melvor 左菜单的压缩形态）：一级入口 + 「更多」披露的二级入口。
 * 360 宽放不下全部入口，二级入口默认收起；「更多」只负责展开/收起，
 * 展开本身不切换页面，收起时若正停在二级入口则回到技能页（选中项必须可见）。
 * 「更多」是披露按钮而非页签，放在 tablist 之外以保持 ARIA 结构有效。
 */

const PRIMARY_ENTRIES = PROTOTYPE_TABS.map((tab, index) => ({ ...tab, index }));
const SECONDARY_ENTRIES = SECONDARY_TABS.map((tab, index) => ({
  ...tab,
  index: PRIMARY_ENTRIES.length + index,
}));

export function SkillMenu({ activeTab, tabButtonRefs, onSelect, onKeyDown }: SkillMenuProps) {
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const secondaryActive = SECONDARY_TABS.some((tab) => tab.id === activeTab);
  const showSecondary = disclosureOpen || secondaryActive;

  function toggleSecondary(): void {
    if (showSecondary) {
      setDisclosureOpen(false);
      if (secondaryActive) onSelect(PROTOTYPE_TABS[0].id);
      return;
    }
    setDisclosureOpen(true);
  }

  return (
    <div className="skill-prototype-tabs">
      <div
        className="skill-prototype-tablist"
        role="tablist"
        aria-label="游戏页面"
        data-testid="tab-list"
      >
        {PRIMARY_ENTRIES.map((tab) => {
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
                tabButtonRefs.current[tab.index] = element;
              }}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(event) => onKeyDown(event, tab.index)}
            >
              {tab.label}
            </button>
          );
        })}
        {showSecondary && (
          <div
            className="skill-prototype-secondary-tabs"
            id="skill-prototype-secondary-tabs"
            role="presentation"
          >
            {SECONDARY_ENTRIES.map((tab) => {
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
                    tabButtonRefs.current[tab.index] = element;
                  }}
                  onClick={() => onSelect(tab.id)}
                  onKeyDown={(event) => onKeyDown(event, tab.index)}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        className="skill-prototype-tab skill-prototype-tab-more"
        type="button"
        aria-expanded={showSecondary}
        aria-controls={showSecondary ? 'skill-prototype-secondary-tabs' : undefined}
        data-testid="tab-more"
        onClick={toggleSecondary}
      >
        更多{showSecondary ? ' ▾' : ' ▸'}
      </button>
    </div>
  );
}

interface SkillStripProps {
  readonly skills: readonly { readonly id: SkillLoopId; readonly level: number }[];
  readonly activeSkillId: SkillLoopId;
  readonly theme: SkillLoopTheme;
  readonly onSelectSkill: (skillId: SkillLoopId) => void;
}

/** 技能滑动条：Melvor 左菜单技能列表的压缩形态，当前技能高亮。 */

export function SkillStrip({ skills, activeSkillId, theme, onSelectSkill }: SkillStripProps) {
  return (
    <div className="skill-prototype-skill-strip" data-testid="skill-strip">
      {skills.map((skill) => {
        const active = skill.id === activeSkillId;
        return (
          <button
            className="skill-prototype-skill-chip"
            type="button"
            key={skill.id}
            aria-pressed={active}
            data-testid={`skill-chip-${skill.id}`}
            onClick={() => onSelectSkill(skill.id)}
          >
            <span>{theme.skillCopy[skill.id]?.label ?? skill.id}</span>
            <small>Lv {skill.level}</small>
          </button>
        );
      })}
    </div>
  );
}
