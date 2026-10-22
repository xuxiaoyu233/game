import type { SkillLoopTheme } from '../../themes/skill-prototype-v1';
import type { ProgressFloat } from './use-progress-feedback';
import { formatCount } from './format';

export interface ProgressFloatsProps {
  readonly floats: readonly ProgressFloat[];
  readonly theme: SkillLoopTheme;
}

/**
 * Floating "+1" chips anchored to the persistent status bar. Purely decorative: the same
 * information is available in the warehouse, so it is hidden from assistive technology and
 * disabled under reduced-motion preferences.
 */
export function ProgressFloats({ floats, theme }: ProgressFloatsProps) {
  if (floats.length === 0) return null;
  return (
    <div className="skill-prototype-floats" aria-hidden="true" data-testid="progress-floats">
      {floats.map((entry, index) => (
        <span
          className={`skill-prototype-float kind-${entry.kind}`}
          key={entry.id}
          style={{ animationDelay: `${index * 60}ms` }}
        >
          {entry.kind === 'level'
            ? `${theme.skillCopy[entry.label]?.label ?? entry.label} Lv ${entry.amount}`
            : `+${formatCount(entry.amount)} ${theme.itemCopy[entry.label]?.label ?? entry.label}`}
        </span>
      ))}
    </div>
  );
}
