import type { MouseEvent } from 'react';
import type {
  SkillLoopCommand,
  SkillLoopDefinition,
  SkillLoopReturnReport,
  SkillLoopSummary,
} from '../../domain/skill-loop/types';
import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import { formatCount, formatElapsed } from './format';

export interface ReturnReportCardProps {
  readonly theme: SkillLoopTheme;
  readonly definition: SkillLoopDefinition;
  readonly report: SkillLoopReturnReport;
  readonly summary: SkillLoopSummary;
  readonly busy: boolean;
  readonly onCommand: (command: SkillLoopCommand) => void;
  readonly onAnchorClick: (event: MouseEvent<HTMLAnchorElement>, targetId: string) => void;
}

export function ReturnReportCard({
  theme,
  definition,
  report,
  summary,
  busy,
  onCommand,
  onAnchorClick,
}: ReturnReportCardProps) {
  const nextUnlock = summary.nextUnlocks[0];
  const availableUpgradeId = summary.availableToolUpgradeIds[0];
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
        离开 {formatElapsed(report.elapsedMs)}；结算窗口 {formatElapsed(report.settlementWindowMs)}
        {report.offlineCapReached && '，已达到离线时长上限'}。
        {report.offlineCapReached && '剩余时间不会自动切换到其他活动。'}
      </p>
      <ul className="skill-prototype-return-deltas">
        {definition.items.flatMap((item) => {
          const delta = report.inventoryDelta[item.id] ?? 0;
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
          const delta = report.skillXpDelta[skill.id] ?? 0;
          return delta === 0
            ? []
            : [
                <li key={`xp-${skill.id}`}>
                  经验 · {theme.skillCopy[skill.id]?.label ?? skill.id} +{formatCount(delta)} XP
                </li>,
              ];
        })}
        {report.unlockedActivityIds.map((activityId) => (
          <li key={`unlock-${activityId}`}>
            已解锁 · {theme.activityCopy[activityId]?.label ?? activityId}
          </li>
        ))}
      </ul>
      <p className="skill-prototype-return-guidance" data-testid="return-guidance">
        {report.unlockedActivityIds.length > 0 ? (
          <>
            {theme.uiCopy.returnUnlockedPrefix}：{' '}
            {report.unlockedActivityIds.map((activityId, index) => (
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
        ) : availableUpgradeId !== undefined ? (
          <>
            {theme.uiCopy.availableUpgradePrefix}：{' '}
            <a
              href={`#upgrade-${availableUpgradeId}`}
              onClick={(event) => onAnchorClick(event, `upgrade-${availableUpgradeId}`)}
            >
              {theme.toolCopy[availableUpgradeId]?.label ?? availableUpgradeId}
            </a>
          </>
        ) : nextUnlock !== undefined ? (
          <>
            {theme.uiCopy.nextUnlockPrefix} {nextUnlock.level}：{' '}
            <a
              href={`#skill-progress-${nextUnlock.skillId}`}
              onClick={(event) => onAnchorClick(event, `skill-progress-${nextUnlock.skillId}`)}
            >
              {theme.activityCopy[nextUnlock.activityId]?.label ?? nextUnlock.activityId}
            </a>
          </>
        ) : (
          theme.uiCopy.returnCurrentGoal
        )}
      </p>
      <p className="skill-prototype-return-continuation">
        {report.reason === 'continuing' && '原活动仍在进行，可继续当前作业。'}
        {report.reason === 'insufficient-materials' &&
          '制作材料耗尽后活动已停止；补齐材料或选择其他活动即可继续。'}
        {report.reason === 'paused' && '活动保持暂停，本次离开期间没有生产。'}
        {report.reason === 'no-activity' && '返回时没有正在运行的活动。'}
      </p>
      <button
        className="primary-button"
        data-testid="acknowledge-return-report"
        disabled={busy}
        onClick={() => onCommand({ kind: 'acknowledge-return-report' })}
      >
        继续游戏
      </button>
    </section>
  );
}
