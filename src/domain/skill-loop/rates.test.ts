import { describe, expect, it } from 'vitest';
import { loadPrototypeContent } from '../../content/load-prototype-content';
import { createNewSkillLoop } from './engine';
import {
  getEffectiveCycleMs,
  getGlobalSpeedMultiplier,
  getOfflineCapBonusMs,
  getOfflineCapMs,
  getGlobalXpMultiplier,
  getXpPerCycle,
} from './rates';
import { MASTERY_CHECKPOINT_SPEED_PERMILLE } from './mastery';
import { validateSkillLoopDefinition } from './validation';
import type { ActivityDefinition, SkillLoopDefinition, SkillLoopState } from './types';

/**
 * Contract cover for the content 7.0.0 rate rules. These are pure derivations over state plus
 * versioned content (no mocks, no DOM, no clock), which is the zero-cost test category the
 * project policy allows before the first playable milestone. They pin the two semantics that are
 * easy to get wrong: a level effect takes the current level's value (never a sum across levels),
 * and the offline window is clamped at 24h however many skills contribute.
 */
const definition = loadPrototypeContent();
const HOUR_MS = 3_600_000;

/** Shared XP curve: Lv5 starts at 1053, Lv7 at 2079, Lv8 at 2799, Lv12 at 8107. */
function stateWithSkillXp(skillId: string, xp: number): SkillLoopState {
  const state = createNewSkillLoop(definition, 0);
  return { ...state, skillXp: { ...state.skillXp, [skillId]: xp } };
}

const vial = definition.activities.find((activity) => activity.id === 'craft-clay-vial');
if (vial === undefined) throw new Error('content lost craft-clay-vial');

/* Speed direction (content 8.0.0 retune): every speed field is a CYCLE multiplier, so a value
   below 1000 must shorten the cycle. Before the retune the consumable and agility fields were
   written above 1000 and the engine multiplied them onto the duration, which made "faster" buffs
   slower in play (agility Lv2 turned an 8 s gather cycle into 8,240 ms). These cases pin the
   direction for each of the four factors so the convention cannot silently flip back. */
const gather = definition.activities.find((activity) => activity.id === 'mine-common-ore');
if (gather === undefined) throw new Error('content lost mine-common-ore');

function withBuff(state: SkillLoopState, speedMultiplierPermille: number): SkillLoopState {
  return {
    ...state,
    buffs: [{ sourceItemId: 'cooked-fish', speedMultiplierPermille, remainingMs: 60_000 }],
  };
}

/** Mastery pool fill is derived, so writing pool XP is enough to engage a checkpoint tier. */
function withMasteryPool(state: SkillLoopState, skillId: string, poolXp: number): SkillLoopState {
  return { ...state, masteryPool: { ...(state.masteryPool ?? {}), [skillId]: poolXp } };
}

describe('getEffectiveCycleMs speed direction', () => {
  const base = createNewSkillLoop(definition, 0);

  it('is the base duration with no speed effect in force', () => {
    expect(getEffectiveCycleMs(base, definition, gather)).toBe(gather.durationMs);
  });

  it('shortens the cycle under the cooked-fish speed buff (870 -> about 0.87x)', () => {
    const buffed = withBuff(base, 870);
    const plain = getEffectiveCycleMs(base, definition, gather);
    const withConsumable = getEffectiveCycleMs(buffed, definition, gather);
    expect(withConsumable).toBeLessThan(plain);
    expect(withConsumable).toBe(Math.ceil((gather.durationMs * 870) / 1_000));
  });

  it('shortens the cycle at agility Lv2 and Lv3 by 1/1.03 and 1/1.06', () => {
    const lv2 = stateWithSkillXp('agility', 180);
    const lv3 = stateWithSkillXp('agility', 407);
    expect(getGlobalSpeedMultiplier(lv2, definition)).toBe(971);
    expect(getGlobalSpeedMultiplier(lv3, definition)).toBe(943);
    const plain = getEffectiveCycleMs(base, definition, gather);
    expect(getEffectiveCycleMs(lv2, definition, gather)).toBe(
      Math.ceil((gather.durationMs * 971) / 1_000),
    );
    expect(getEffectiveCycleMs(lv3, definition, gather)).toBe(
      Math.ceil((gather.durationMs * 943) / 1_000),
    );
    expect(getEffectiveCycleMs(lv2, definition, gather)).toBeLessThan(plain);
    expect(getEffectiveCycleMs(lv3, definition, gather)).toBeLessThan(
      getEffectiveCycleMs(lv2, definition, gather),
    );
  });

  it('shortens the cycle once a mastery checkpoint tier engages', () => {
    const plain = getEffectiveCycleMs(base, definition, gather);
    // Mining owns 10 activities after T3–T5, so a full 12,000 pool engages the top tier.
    const engaged = withMasteryPool(base, 'mining', 12_000);
    const tier = MASTERY_CHECKPOINT_SPEED_PERMILLE.at(-1) ?? 1_000;
    expect(tier).toBeLessThan(1_000);
    expect(getEffectiveCycleMs(engaged, definition, gather)).toBe(
      Math.ceil((gather.durationMs * tier) / 1_000),
    );
    expect(getEffectiveCycleMs(engaged, definition, gather)).toBeLessThan(plain);
  });
});

/** Worst legal stack of tool x consumable x global x mastery, enumerated the way validation does. */
function worstCycleMultiplier(): number {
  let worst = 1;
  for (const tool of definition.tools) {
    for (const level of tool.levels) {
      for (const item of definition.items) {
        const buff = item.consumable?.speedMultiplierPermille ?? 1_000;
        for (const skill of definition.skills) {
          for (const threshold of skill.levels) {
            const global = threshold.effect?.globalSpeedBonusPermille ?? 1_000;
            for (const mastery of [...MASTERY_CHECKPOINT_SPEED_PERMILLE, 1_000]) {
              const product =
                (level.durationMultiplierPermille * buff * global * mastery) / 1_000_000_000_000;
              if (product < worst) worst = product;
            }
          }
        }
      }
    }
  }
  return worst;
}

describe('cycle multiplier floor', () => {
  it('keeps every reachable stack above the 0.3 floor the content is tuned against', () => {
    const worst = worstCycleMultiplier();
    // The 0.5 floor predates the retune: with all four factors on the cycle convention the worst
    // legal stack now sits below it by design, and 0.3 is where content is tuned to stop.
    expect(worst).toBeGreaterThanOrEqual(0.3);
    expect(worst).toBeLessThan(0.5);
    expect(() => validateSkillLoopDefinition(definition)).not.toThrow();
  });

  it('never lets the shortest content cycle reach the one-second zone', () => {
    const shortest = definition.activities.reduce(
      (minimum: ActivityDefinition, activity) =>
        activity.durationMs < minimum.durationMs ? activity : minimum,
      definition.activities[0] as ActivityDefinition,
    );
    expect(Math.ceil(shortest.durationMs * worstCycleMultiplier())).toBeGreaterThan(1_000);
  });
});

describe('getGlobalXpMultiplier', () => {
  it('is neutral while no levelled XP effect is in force', () => {
    expect(getGlobalXpMultiplier(createNewSkillLoop(definition, 0), definition)).toBe(1_000);
  });

  it('takes the current level value, not a sum across levels', () => {
    // Herbalism Lv5-Lv7 grant 1030, Lv8-Lv10 grant 1060, Lv11+ grant 1100; only the current level counts.
    expect(getGlobalXpMultiplier(stateWithSkillXp('herbalism', 1_053), definition)).toBe(1_030);
    expect(getGlobalXpMultiplier(stateWithSkillXp('herbalism', 2_799), definition)).toBe(1_060);
    expect(getGlobalXpMultiplier(stateWithSkillXp('herbalism', 8_107), definition)).toBe(1_100);
  });

  it('grants nothing at a level the content left without an effect', () => {
    expect(getGlobalXpMultiplier(stateWithSkillXp('herbalism', 693), definition)).toBe(1_000);
  });
});

describe('getXpPerCycle', () => {
  it('pays the base XP with no buff and no levelled bonus', () => {
    const state = createNewSkillLoop(definition, 0);
    expect(getXpPerCycle(state, definition, vial)).toBe(vial.xpPerCycle);
  });

  it('applies the levelled global bonus alone', () => {
    const state = stateWithSkillXp('herbalism', 2_799);
    // 11 XP x 1.060 = 11.66, rounded to 12.
    expect(getXpPerCycle(state, definition, vial)).toBe(12);
  });

  it('multiplies the consumable buff with the levelled bonus', () => {
    const base = stateWithSkillXp('herbalism', 1_053);
    const state: SkillLoopState = {
      ...base,
      buffs: [{ sourceItemId: 'clarity-potion', xpMultiplierPermille: 1_200, remainingMs: 1_000 }],
    };
    // 11 XP x 1.200 x 1.030 = 13.596, rounded to 14.
    expect(getXpPerCycle(state, definition, vial)).toBe(14);
  });
});

describe('getOfflineCapMs', () => {
  it('is the content base cap while no levelled bonus is in force', () => {
    const state = createNewSkillLoop(definition, 0);
    expect(getOfflineCapBonusMs(state, definition)).toBe(0);
    expect(getOfflineCapMs(state, definition)).toBe(definition.maxOfflineMs);
  });

  it('adds the current farming level value', () => {
    expect(getOfflineCapBonusMs(stateWithSkillXp('farming', 693), definition)).toBe(1 * HOUR_MS);
    expect(getOfflineCapBonusMs(stateWithSkillXp('farming', 2_079), definition)).toBe(2 * HOUR_MS);
    expect(getOfflineCapBonusMs(stateWithSkillXp('farming', 8_107), definition)).toBe(6 * HOUR_MS);
    // Lv12 farming: 8h base + 6h level bonus = 14h, still under the 24h ceiling.
    expect(getOfflineCapMs(stateWithSkillXp('farming', 8_107), definition)).toBe(14 * HOUR_MS);
  });

  it('clamps the window at 24h however many skills contribute', () => {
    const state = createNewSkillLoop(definition, 0);
    const crowded: SkillLoopDefinition = {
      ...definition,
      maxOfflineMs: 20 * HOUR_MS,
      skills: definition.skills.map((skill) =>
        skill.id === 'farming' || skill.id === 'herbalism'
          ? {
              ...skill,
              levels: skill.levels.map((level) =>
                level.level === 1
                  ? { ...level, effect: { offlineCapBonusMs: 10 * HOUR_MS } }
                  : level,
              ),
            }
          : skill,
      ),
    };
    // 20h base + 10h + 10h would be 40h; the ceiling keeps the window at one day.
    expect(getOfflineCapBonusMs(state, crowded)).toBe(20 * HOUR_MS);
    expect(getOfflineCapMs(state, crowded)).toBe(24 * HOUR_MS);
  });
});

/* Curve pacing (content 10.0.0). The tail of the curve used to hold half the total XP while the
   last three levels opened no new activity, so the endgame was pure waiting. These two assertions
   pin the shape the content was retuned to; they mirror the gates in scripts/audit-pacing.mjs so a
   numeric edit that breaks pacing fails in the test run as well as in the content gate. */
describe('content curve pacing', () => {
  const skill = definition.skills[0];
  const ceiling = skill?.levels.at(-1)?.xpRequired ?? 0;
  const thresholdOf = (level: number): number =>
    skill?.levels.find((entry) => entry.level === level)?.xpRequired ?? 0;
  /** Best base rate (no buff, tool, global or mastery) offered inside a six-level band. */
  const bestRatePerMinute = (startLevel: number): number => {
    const rows = definition.activities.filter(
      (activity) =>
        activity.requiredLevel >= startLevel && activity.requiredLevel <= startLevel + 5,
    );
    return Math.max(
      ...rows.map((activity) => (activity.xpPerCycle / activity.durationMs) * 60_000),
    );
  };

  it('keeps all twelve skills inside the 36-48 hour band at the best tier rate', () => {
    let minutes = 0;
    for (let start = 1; start <= 30; start += 6) {
      const to = start + 5 >= 30 ? ceiling : thresholdOf(start + 6);
      minutes += (to - thresholdOf(start)) / bestRatePerMinute(start);
    }
    const totalHours = (minutes / 60) * definition.skills.length;
    expect(totalHours).toBeGreaterThanOrEqual(36);
    expect(totalHours).toBeLessThanOrEqual(48);
  });

  it('keeps the last three levels under a quarter of the curve', () => {
    const tail = ceiling - thresholdOf(27);
    expect(tail / ceiling).toBeLessThanOrEqual(0.25);
  });
});
