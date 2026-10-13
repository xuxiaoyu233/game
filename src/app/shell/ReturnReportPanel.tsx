import type { MouseEvent } from 'react';
import type {
  SkillLoopCommand,
  SkillLoopSummary,
  SkillLoopReturnReport,
} from '../../domain/skill-loop/types';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import type { SkillPrototypeV1Package } from '../skill-prototype-types';
import { formatCount, formatElapsed } from '../format';

interface ReturnReportPanelProps {
  readonly content: SkillPrototypeV1Package;
  readonly theme: SkillLoopTheme;
  readonly returnReport: SkillLoopReturnReport;
  readonly summary: SkillLoopSummary;
  readonly busy: boolean;
  readonly onDispatch: (command: SkillLoopCommand) => void;
  readonly onAnchorClick: (event: MouseEvent<HTMLAnchorElement>, targetId: string) => void;
}

/** 离线回执：离开时长、结算窗口、库存与经验增量、解锁的活动，以及一次性确认入口。 */

export function ReturnReportPanel({
  content,
  theme,
  returnReport,
  summary,
  busy,
  onDispatch,
  onAnchorClick,
}: ReturnReportPanelProps) {
  const { definition } = content;
  return (
    <section
      className="skill-prototype-return-report"
      id="return-report"
      aria-label="回访结算"
      data-testid="return-report"
    >
      <div className="skill-prototype-section-heading">
        <h2>离线进展</h2>
        <span>本次结算已写入存档</span>
      </div>
      <p>
        离开 {formatElapsed(returnReport.elapsedMs)}；结算窗口{' '}
        {formatElapsed(returnReport.settlementWindowMs)}
        {returnReport.offlineCapReached && '，已达到离线时长上限'}。
        {returnReport.offlineCapReached && '剩余时间不会自动切换到其他活动。'}
      </p>
      <ul className="skill-prototype-return-deltas">
        {definition.items.flatMap((item) => {
          const delta = returnReport.inventoryDelta[item.id] ?? 0;
          return delta === 0
            ? []
            : [
                <li key={`item-${item.id}`}>
                  库存 · {theme.itemCopy[item.id]?.label ?? item.id} {delta > 0 ? '+' : ''}
                  {formatCount(delta)}
                </li>,
              ];
        })}
        {definition.skills.flatMap((skill) => {
          const delta = returnReport.skillXpDelta[skill.id] ?? 0;
          return delta === 0
            ? []
            : [
                <li key={`xp-${skill.id}`}>
                  经验 · {theme.skillCopy[skill.id]?.label ?? skill.id} +{formatCount(delta)} XP
                </li>,
              ];
        })}
        {returnReport.unlockedActivityIds.map((activityId) => (
          <li key={`unlock-${activityId}`}>
            已解锁 · {theme.activityCopy[activityId]?.label ?? activityId}
          </li>
        ))}
      </ul>
      <p className="skill-prototype-return-guidance" data-testid="return-guidance">
        {returnReport.unlockedActivityIds.length > 0 ? (
          <>
            {theme.uiCopy.returnUnlockedPrefix}：{' '}
            {returnReport.unlockedActivityIds.map((activityId, index) => (
              <span key={activityId}>
                {index > 0 && '、'}
                <a
                  href={`#activity-${activityId}`}
                  onClick={(event) => onAnchorClick(event, `activity-${activityId}`)}
                >
                  {theme.activityCopy[activityId]?.label ?? activityId}
                </a>
              </span>
            ))}
          </>
        ) : summary.availableToolUpgradeIds[0] !== undefined ? (
          <>
            {theme.uiCopy.availableUpgradePrefix}：{' '}
            <a
              href={`#upgrade-${summary.availableToolUpgradeIds[0]}`}
              onClick={(event) =>
                onAnchorClick(event, `upgrade-${summary.availableToolUpgradeIds[0]}`)
              }
            >
              {theme.toolCopy[summary.availableToolUpgradeIds[0]]?.label ??
                summary.availableToolUpgradeIds[0]}
            </a>
          </>
        ) : summary.nextUnlocks[0] !== undefined ? (
          <>
            {theme.uiCopy.nextUnlockPrefix} {summary.nextUnlocks[0].level}：{' '}
            <a
              href={`#skill-progress-${summary.nextUnlocks[0].skillId}`}
              onClick={(event) => onAnchorClick(event, event.currentTarget.hash.slice(1))}
            >
              {theme.activityCopy[summary.nextUnlocks[0].activityId]?.label ??
                summary.nextUnlocks[0].activityId}
            </a>
          </>
        ) : (
          theme.uiCopy.returnCurrentGoal
        )}
      </p>
      <p className="skill-prototype-return-continuation">
        {returnReport.reason === 'continuing' && '原活动仍在进行，可继续当前作业。'}
        {returnReport.reason === 'insufficient-materials' &&
          '制作材料耗尽后活动已停止；补齐材料或选择其他活动即可继续。'}
        {returnReport.reason === 'paused' && '活动保持暂停，本次离开期间没有生产。'}
        {returnReport.reason === 'no-activity' && '返回时没有正在运行的活动。'}
      </p>
      <button
        className="primary-button"
        data-testid="acknowledge-return-report"
        disabled={busy}
        onClick={() => onDispatch({ kind: 'acknowledge-return-report' })}
      >
        继续游戏
      </button>
    </section>
  );
}
