import { useEffect, useRef, useState } from 'react';
import type { SkillLoopState, SkillLoopSummary } from '../../domain/skill-loop/types';

/**
 * Transient presentation feedback: what just changed on screen. Nothing here is a game fact;
 * floats are rebuilt from state diffs on every render and never persisted.
 */
export interface ProgressFloat {
  readonly id: number;
  readonly kind: 'item' | 'level';
  readonly label: string;
  readonly amount: number;
}

export interface ProgressFeedback {
  readonly floats: readonly ProgressFloat[];
  /** Skill that levelled up moments ago; used to highlight its card. */
  readonly levelUpSkillId: string | null;
}

const FLOAT_LIFETIME_MS = 1_400;
const LEVEL_HIGHLIGHT_MS = 2_600;
/** Absences longer than this are settlement, which the return report already explains. */
const SETTLEMENT_GAP_MS = 5_000;
const MAX_FLOATS = 4;

export function useProgressFeedback(
  state: SkillLoopState | null,
  summary: SkillLoopSummary | null,
  labelFor: (itemId: string) => string,
): ProgressFeedback {
  const [floats, setFloats] = useState<readonly ProgressFloat[]>([]);
  const [levelUpSkillId, setLevelUpSkillId] = useState<string | null>(null);
  const previous = useRef<{ state: SkillLoopState; summary: SkillLoopSummary } | null>(null);
  const counter = useRef(0);

  useEffect(() => {
    if (state === null || summary === null) return;
    const before = previous.current;
    previous.current = { state, summary };
    if (before === null) return;

    // A big jump in game time means an offline settlement, not a cycle the player watched.
    const gap = state.lastSimulatedAt - before.state.lastSimulatedAt;
    if (gap > SETTLEMENT_GAP_MS || gap <= 0) return;

    const next: ProgressFloat[] = [];
    for (const [itemId, amount] of Object.entries(state.inventory)) {
      const delta = amount - (before.state.inventory[itemId] ?? 0);
      if (delta <= 0) continue;
      next.push({ id: ++counter.current, kind: 'item', label: labelFor(itemId), amount: delta });
    }

    let levelled: string | null = null;
    for (const [skillId, progress] of Object.entries(summary.skills)) {
      const previousLevel = before.summary.skills[skillId]?.level ?? 1;
      if (progress.level > previousLevel) {
        levelled = skillId;
        next.push({
          id: ++counter.current,
          kind: 'level',
          label: skillId,
          amount: progress.level,
        });
      }
    }

    if (levelled !== null) {
      setLevelUpSkillId(levelled);
      window.setTimeout(() => setLevelUpSkillId(null), LEVEL_HIGHLIGHT_MS);
    }

    if (next.length === 0) return;
    const batch = next.slice(0, MAX_FLOATS);
    setFloats((current) => [...current, ...batch].slice(-MAX_FLOATS));
    const ids = new Set(batch.map((entry) => entry.id));
    window.setTimeout(
      () => setFloats((current) => current.filter((entry) => !ids.has(entry.id))),
      FLOAT_LIFETIME_MS,
    );
  }, [state, summary, labelFor]);

  return { floats, levelUpSkillId };
}
