/**
 * Tuning tables and pure number-level helpers for the content 8.0.0 mastery system. Everything
 * here is deterministic: no randomness, no clock, no state. The state-dependent projections
 * (mastery level from XP, the multipliers actually in force) live in `rates.ts`, which composes
 * these tables into the single cycle/XP formulas — that split keeps the cycle formula
 * single-sourced in rates.ts while every tuning constant stays in this one file.
 */

/** Share of each mastery-XP gain that flows into the owning skill's pool (25%), floored. */
export const MASTERY_POOL_SHARE_PERMILLE = 250;

/**
 * Pool fill rates (permille of the pool limit) at which checkpoints engage, ascending. The
 * derivation is a pure comparison against the current pool, so spending pool XP below a
 * threshold deactivates that tier automatically; nothing is stored.
 */
export const MASTERY_CHECKPOINTS_PERMILLE: readonly number[] = [100, 250, 500, 950];

/**
 * Mastery XP coefficient per mastery level, indexed by level - 1 and clamped at the last entry.
 * Simplified from Melvor, where mastery XP per action is flat: here the per-cycle mastery XP
 * scales with the activity's own XP so cheap activities still advance mastery, while the
 * coefficient keeps later mastery levels slightly more rewarding. Monotonic by construction; this
 * table is the single tuning point for mastery pacing (content 8.0.0).
 */
export const MASTERY_COEFFICIENT_PERMILLE: readonly number[] = [
  1_000, 1_010, 1_020, 1_030, 1_040, 1_050, 1_060, 1_070, 1_080, 1_090, 1_100, 1_120,
];

/**
 * Checkpoint effects for the owning skill, indexed by the tier that engaged (0 = 10% fill). The
 * speed column follows the TOOL convention — a duration multiplier below 1000 shortens the
 * cycle — and only the highest engaged tier applies; tiers never stack with each other. The XP
 * column follows the consumable convention (above 1000 = more XP).
 */
export const MASTERY_CHECKPOINT_SPEED_PERMILLE: readonly number[] = [950, 900, 850, 800];
export const MASTERY_CHECKPOINT_XP_PERMILLE: readonly number[] = [1_050, 1_100, 1_150, 1_200];

/**
 * Pool limit contributed by each activity of the owning skill. Tuned against the current T1/T2
 * XP rates so the 10% checkpoint lands within the first stretch of focused training and 95%
 * within a few hours; because pool accrual tracks the skill's own XP rates, the S9 pacing
 * decision will shift these times and the constant is the single place to re-balance.
 */
export const MASTERY_POOL_BASE_PER_ACTIVITY = 1_200;

/** Mastery coefficient in force at a given mastery level (clamped at the table end). */
export function getMasteryCoefficientPermille(level: number): number {
  const table = MASTERY_COEFFICIENT_PERMILLE;
  if (level <= 1) return table[0] ?? 1_000;
  const index = Math.min(level, table.length) - 1;
  return table[index] ?? table[table.length - 1] ?? 1_000;
}

/** Pool limit for a skill with the given number of activities. */
export function getMasteryPoolLimit(activityCount: number): number {
  return MASTERY_POOL_BASE_PER_ACTIVITY * Math.max(1, activityCount);
}

/**
 * Index of the highest checkpoint in force at a pool fill permille, or -1 when none is. Tiers
 * never stack: the effect tables are read at this single index.
 */
export function getMasteryCheckpointIndex(fillPermille: number): number {
  let best = -1;
  MASTERY_CHECKPOINTS_PERMILLE.forEach((threshold, index) => {
    if (fillPermille >= threshold) best = index;
  });
  return best;
}

export type MasteryPoolSpendResolution =
  | { readonly ok: true; readonly amount: number }
  | {
      readonly ok: false;
      readonly reason: 'invalid-amount' | 'insufficient-pool' | 'cap-exceeded';
    };

/**
 * Resolve a spend-mastery-pool request against both boundaries without touching state: the pool
 * must cover the request 1:1 and the receiving activity's mastery XP must stay under its cap
 * (the owning skill's XP ceiling, since mastery reuses that curve). Pure, so the engine and the
 * UI's "max spendable" hint read the same rule.
 */
export function resolveMasteryPoolSpend(args: {
  readonly poolXp: number;
  readonly requested: number;
  readonly activityMasteryXp: number;
  readonly masteryCap: number;
}): MasteryPoolSpendResolution {
  const { poolXp, requested, activityMasteryXp, masteryCap } = args;
  if (!Number.isSafeInteger(requested) || requested <= 0) {
    return { ok: false, reason: 'invalid-amount' };
  }
  if (requested > poolXp) return { ok: false, reason: 'insufficient-pool' };
  if (activityMasteryXp + requested > masteryCap) {
    return { ok: false, reason: 'cap-exceeded' };
  }
  return { ok: true, amount: requested };
}

/** Largest amount that satisfies both boundaries at once; 0 when nothing fits. */
export function getMaxSpendableMasteryPool(args: {
  readonly poolXp: number;
  readonly activityMasteryXp: number;
  readonly masteryCap: number;
}): number {
  const byPool = args.poolXp;
  const byCap = Math.max(0, args.masteryCap - args.activityMasteryXp);
  return Math.max(0, Math.min(byPool, byCap));
}
