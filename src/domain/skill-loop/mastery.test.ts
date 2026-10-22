import { describe, expect, it } from 'vitest';
import { loadPrototypeContent } from '../../content/load-prototype-content';
import { createNewSkillLoop } from './engine';
import {
  MASTERY_CHECKPOINTS_PERMILLE,
  getMaxSpendableMasteryPool,
  getMasteryCheckpointIndex,
  getMasteryCoefficientPermille,
  getMasteryPoolLimit,
  resolveMasteryPoolSpend,
} from './mastery';
import {
  getEffectiveCycleMs,
  getMasteryProgress,
  getMasterySpeedMultiplier,
  getMasteryXpMultiplier,
} from './rates';
import type { SkillLoopState } from './types';

/**
 * Contract cover for the content 8.0.0 mastery rules. Pure derivations over state plus the
 * tuning tables (no mocks, no DOM, no clock) — the zero-cost category the project policy allows.
 * They pin the semantics that must never drift: the checkpoint derivation is a pure pool
 * comparison (spending below a threshold deactivates the tier with no stored flag), the spend
 * resolution rejects all three boundaries, and the multipliers compose into the one cycle/XP
 * formulas in rates.ts.
 */
const definition = loadPrototypeContent();
const HOUR_MS = 3_600_000;

function stateWithMasteryPool(skillId: string, poolXp: number): SkillLoopState {
  const state = createNewSkillLoop(definition, 0);
  return { ...state, masteryPool: { ...state.masteryPool, [skillId]: poolXp } };
}

/** A schema-3-shaped state: the mastery keys are removed, not set to undefined. */
function stateWithoutMastery(): SkillLoopState {
  const clone = { ...createNewSkillLoop(definition, 0) } as Record<string, unknown>;
  delete clone['masteryXp'];
  delete clone['masteryPool'];
  return clone as unknown as SkillLoopState;
}

const vial = definition.activities.find((activity) => activity.id === 'craft-clay-vial');
const mining = definition.activities.find((activity) => activity.id === 'mine-common-ore');
if (vial === undefined || mining === undefined) throw new Error('content lost B4 fixtures');

describe('mastery tables', () => {
  it('keeps the coefficient table monotonic and clamped at the last level', () => {
    expect(getMasteryCoefficientPermille(1)).toBe(1_000);
    expect(getMasteryCoefficientPermille(5)).toBe(1_040);
    expect(getMasteryCoefficientPermille(12)).toBe(1_120);
    expect(getMasteryCoefficientPermille(99)).toBe(1_120);
    for (let level = 2; level <= 24; level += 1) {
      expect(getMasteryCoefficientPermille(level)).toBeGreaterThanOrEqual(
        getMasteryCoefficientPermille(level - 1),
      );
    }
  });

  it('scales the pool limit with the owning skill activity count', () => {
    expect(getMasteryPoolLimit(1)).toBe(1_200);
    expect(getMasteryPoolLimit(4)).toBe(4_800);
  });

  it('derives checkpoints as a pure pool comparison', () => {
    expect(getMasteryCheckpointIndex(0)).toBe(-1);
    expect(getMasteryCheckpointIndex(99)).toBe(-1);
    for (const [index, threshold] of MASTERY_CHECKPOINTS_PERMILLE.entries()) {
      expect(getMasteryCheckpointIndex(threshold - 1)).toBe(index - 1);
      expect(getMasteryCheckpointIndex(threshold)).toBe(index);
    }
    expect(getMasteryCheckpointIndex(1_000)).toBe(MASTERY_CHECKPOINTS_PERMILLE.length - 1);
  });
});

describe('resolveMasteryPoolSpend', () => {
  const base = { poolXp: 500, activityMasteryXp: 0, masteryCap: 8_107 };
  it('accepts a request inside both boundaries', () => {
    expect(resolveMasteryPoolSpend({ ...base, requested: 300 })).toEqual({ ok: true, amount: 300 });
  });
  it('rejects a request larger than the pool balance', () => {
    expect(resolveMasteryPoolSpend({ ...base, requested: 600 })).toEqual({
      ok: false,
      reason: 'insufficient-pool',
    });
  });
  it('rejects a request that would push the activity past its mastery cap', () => {
    expect(
      resolveMasteryPoolSpend({
        poolXp: 500,
        requested: 200,
        activityMasteryXp: 8_000,
        masteryCap: 8_107,
      }),
    ).toEqual({ ok: false, reason: 'cap-exceeded' });
  });
  it('rejects non-positive or non-integer amounts', () => {
    for (const requested of [0, -5, 1.5]) {
      expect(resolveMasteryPoolSpend({ ...base, requested }).ok).toBe(false);
    }
  });
  it('reports the largest spendable amount that fits both boundaries', () => {
    expect(
      getMaxSpendableMasteryPool({ poolXp: 500, activityMasteryXp: 0, masteryCap: 8_107 }),
    ).toBe(500);
    expect(
      getMaxSpendableMasteryPool({ poolXp: 500, activityMasteryXp: 8_000, masteryCap: 8_107 }),
    ).toBe(107);
    expect(getMaxSpendableMasteryPool({ poolXp: 0, activityMasteryXp: 0, masteryCap: 8_107 })).toBe(
      0,
    );
  });
});

describe('mastery multipliers in the shared formulas', () => {
  it('are neutral on a state without mastery fields (schema 3 sources)', () => {
    const bare = stateWithoutMastery();
    expect(getMasterySpeedMultiplier(bare, definition, mining)).toBe(1_000);
    expect(getMasteryXpMultiplier(bare, definition, mining)).toBe(1_000);
  });

  it('engage the tier that matches the pool fill, never stacking tiers', () => {
    // Mining owns 10 activities after T3–T5 -> pool limit 12,000; a 50% fill engages tier index 2.
    const state = stateWithMasteryPool('mining', 6_000);
    expect(getMasterySpeedMultiplier(state, definition, mining)).toBe(850);
    expect(getMasteryXpMultiplier(state, definition, mining)).toBe(1_150);
  });

  it('shorten the cycle through the single duration formula', () => {
    const state = stateWithMasteryPool('mining', 6_000);
    // T1 gather base (7,000 ms after the 5.3 alignment) x tool 1000 x no buff x no global
    // x mastery 850 -> 5,950 ms.
    expect(getEffectiveCycleMs(state, definition, mining)).toBe(5_950);
  });

  it('report per-activity mastery progress from the shared curve', () => {
    const state = createNewSkillLoop(definition, 0);
    const progress = getMasteryProgress(state, definition, vial.id);
    expect(progress).not.toBeNull();
    expect(progress?.level).toBe(1);
    expect(progress?.xpPerCycle).toBe(vial?.xpPerCycle);
    // The shared curve runs to Lv30; its ceiling is 56,548 XP after the tail retune (content 10.0.0).
    expect(progress?.xpCeiling).toBe(56_548);
  });

  it('keep a one-hour cycle integer-safe under the fastest mastery tier', () => {
    const longActivity = { ...mining, durationMs: HOUR_MS };
    const state = stateWithMasteryPool('mining', 12_000);
    expect(getEffectiveCycleMs(state, definition, longActivity)).toBe(Math.ceil(HOUR_MS * 0.8));
  });
});
