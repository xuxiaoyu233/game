import type { SkillLoopDefinition, SkillLoopState } from './types';

/**
 * Era is a purely derived read of the save: it adds no state of its own and can never drift from
 * the level and tool facts the engine already stores. The shell uses it to pick a palette, so an
 * era is presentation input only; nothing here is persisted and nothing here gates mechanics.
 */

/**
 * Seven eras, ordered earliest to latest. The index is the era's rank in the progression. Two new
 * eras (verdant, aurora) are slotted between the originals so the seven form a continuous colour
 * temperature ramp: warm amber -> spring green -> cold blue -> cyan -> indigo -> magenta.
 */
export type EraId =
  'primitive' | 'bronze' | 'verdant' | 'industrial' | 'precision' | 'aurora' | 'synthetic';

/** Ordered from earliest to latest; the index is the era's rank in the progression. */
export const ERA_ORDER: readonly EraId[] = [
  'primitive',
  'bronze',
  'verdant',
  'industrial',
  'precision',
  'aurora',
  'synthetic',
];

/**
 * Era boundaries as the cumulative share of the XP curve completed (0-100%). An era is entered once
 * the player's blended progress across every skill crosses its lower bound. The seven bands are
 * 0/1/5/15/35/60/85, so most of the long tail of the curve (the last 15% of XP) is its own era and
 * the early game is split finely enough to feel movement. The numbers are read straight from the
 * content curve, so a pacing retune that moves the ceiling shifts the bands with it.
 */
export const ERA_CUMULATIVE_PERCENT: readonly number[] = [0, 1, 5, 15, 35, 60, 85];

/**
 * Milestone thresholds for the records panel. These are per-skill level / tool facts surfaced as
 * progress markers; they are independent of the era bands above and kept as named fields so the
 * panel reads in plain language (e.g. "every skill at Lv 7").
 */
export const ERA_THRESHOLDS = {
  /** Bronze: first taste of T2 content, one skill at T2 or one tool line improved once. */
  bronzeAnySkillLevel: 7,
  bronzeAnyToolLevel: 2,
  /** Industrial: every skill has reached its T2 band. */
  industrialEverySkillLevel: 7,
  /** Precision: every skill is deep into T2. */
  precisionEverySkillLevel: 10,
  /** Synthetic: all five tool lines maxed (the skill ceiling is now carried by the era bands). */
  syntheticMaxedToolLines: 5,
} as const;

export function eraRank(eraId: EraId): number {
  const rank = ERA_ORDER.indexOf(eraId);
  return rank < 0 ? 0 : rank;
}

/**
 * Blended progress across every skill as a 0-100 share of the total XP curve. Each skill contributes
 * its earned XP over its own ceiling, so a skill that is 100% done always counts fully no matter how
 * tall its curve is; the sum is then normalised by the sum of every ceiling.
 */
function cumulativeCurvePercent(state: SkillLoopState, definition: SkillLoopDefinition): number {
  let earned = 0;
  let ceiling = 0;
  for (const skill of definition.skills) {
    const cap = skill.levels.at(-1)?.xpRequired ?? 0;
    earned += state.skillXp[skill.id] ?? 0;
    ceiling += cap;
  }
  return ceiling > 0 ? (earned / ceiling) * 100 : 0;
}

export function getEraId(state: SkillLoopState, definition: SkillLoopDefinition): EraId {
  const percent = cumulativeCurvePercent(state, definition);
  // The highest band whose lower bound the progress has reached; band 0 always qualifies.
  let index = 0;
  ERA_CUMULATIVE_PERCENT.forEach((bound, candidate) => {
    if (percent >= bound) index = candidate;
  });
  return ERA_ORDER[index] ?? 'primitive';
}
