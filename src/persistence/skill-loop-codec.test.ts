import { describe, expect, it } from 'vitest';
import { loadPrototypeContent } from '../content/load-prototype-content';
import { createSkillPrototypeV1Definition } from '../content/skill-prototype-v1';
import { createSkillPrototypeV2Definition } from '../content/skill-prototype-v2';
import { createSkillPrototypeV3Definition } from '../content/skill-prototype-v3';
import { createSkillPrototypeV5Definition } from '../content/skill-prototype-v5';
import { createSkillPrototypeV6Definition } from '../content/skill-prototype-v6';
import { createSkillPrototypeV7Definition } from '../content/skill-prototype-v7';
import { createSkillPrototypeV8Definition } from '../content/skill-prototype-v8';
import { createSkillPrototypeV9Definition } from '../content/skill-prototype-v9';
import { createNewSkillLoop, applySkillLoopCommand } from '../domain/skill-loop/engine';
import { migrateSkillPrototypeSave } from './skill-prototype-save-migrations';
import {
  SkillSaveValidationError,
  decodeSkillLoopSave,
  encodeSkillLoopSave,
  type SkillLoopSaveMigration,
} from './skill-loop-codec';

/**
 * Regression cover for the 2026-10-16 dead-save incident: a save labelled with the current content
 * version whose records no longer matched the current key set could neither take the same-version
 * fast path nor migrate, so the game refused to start. These cases pin the repair, the refusal and
 * the cross-version migration in one place; they read JSON content only (no DOM, no mocks).
 */
const definition = loadPrototypeContent();
const p3 = createSkillPrototypeV3Definition();
const previous = {
  p1: createSkillPrototypeV1Definition(),
  p2: createSkillPrototypeV2Definition(),
  p3,
  // Content 4.0.0 re-expressed the P3 content as JSON with identical IDs, exactly as main.tsx wires it.
  p4: { ...p3, contentVersion: '4.0.0' },
  // Content 5.0.0/6.0.0/7.0.0 snapshots are frozen under data-v5/, data-v6/ and data-v7/.
  p5: createSkillPrototypeV5Definition(),
  p6: createSkillPrototypeV6Definition(),
  p7: createSkillPrototypeV7Definition(),
  p8: createSkillPrototypeV8Definition(),
  p9: createSkillPrototypeV9Definition(),
};
const migrate: SkillLoopSaveMigration = (source, target) =>
  migrateSkillPrototypeSave(source, previous, target);

function freshSave(): Record<string, unknown> {
  const state = createNewSkillLoop(definition, 0);
  return JSON.parse(encodeSkillLoopSave(state)) as Record<string, unknown>;
}

function inventoryOf(save: Record<string, unknown>): Record<string, number> {
  return save['inventory'] as Record<string, number>;
}

describe('decodeSkillLoopSave', () => {
  it('tops up a same-version save whose records only miss keys', () => {
    const save = freshSave();
    const inventory = inventoryOf(save);
    inventory['coin'] = 7;
    delete inventory['clay'];

    const state = decodeSkillLoopSave(JSON.stringify(save), definition, migrate);

    expect(state.contentVersion).toBe(definition.contentVersion);
    expect(state.inventory['clay']).toBe(0);
    expect(state.inventory['coin']).toBe(7);
    expect(Object.keys(state.inventory).length).toBe(definition.items.length);
  });

  it('refuses a save carrying an ID the content cannot explain', () => {
    const save = freshSave();
    inventoryOf(save)['ghost-item'] = 1;

    const attempt = (): unknown => decodeSkillLoopSave(JSON.stringify(save), definition, migrate);

    expect(attempt).toThrowError(SkillSaveValidationError);
    expect(attempt).toThrowError(/ghost-item/);
  });

  it('names what drifted so a dead save is diagnosable', () => {
    const save = freshSave();
    delete inventoryOf(save)['clay'];
    delete inventoryOf(save)['fish-t2'];
    inventoryOf(save)['ghost-item'] = 1;

    const attempt = (): unknown => decodeSkillLoopSave(JSON.stringify(save), definition, migrate);

    // Refused (an unknown ID is never dropped silently) but the message says what to fix.
    expect(attempt).toThrowError(/期望 56 键，实际 55 键/);
    expect(attempt).toThrowError(/缺失/);
    expect(attempt).toThrowError(/多余：ghost-item/);
  });

  it('migrates a 5.0.0 save onto the current content and keeps its facts', () => {
    const v5 = createSkillPrototypeV5Definition();
    const save = JSON.parse(encodeSkillLoopSave(createNewSkillLoop(v5, 0))) as Record<
      string,
      unknown
    >;
    inventoryOf(save)['coin'] = 42;
    // 10 XP is within the 5.0.0 ceiling: the frozen definition validates the source strictly, so a
    // value above the old cap is refused by design (covered by the drift test above).
    (save['skillXp'] as Record<string, number>)['mining'] = 10;

    const state = decodeSkillLoopSave(JSON.stringify(save), definition, migrate);

    expect(state.contentVersion).toBe(definition.contentVersion);
    expect(state.inventory['coin']).toBe(42);
    expect(state.skillXp['mining']).toBe(10);
    for (const added of ['clay', 'fish-t2', 'meal-t2']) {
      expect(state.inventory[added]).toBe(0);
    }
  });

  it('migrates a 6.0.0 save onto the current content and keeps its facts', () => {
    const v6 = createSkillPrototypeV6Definition();
    // Start a gather activity first, so the migration has a live currentActivity to carry over.
    const started = applySkillLoopCommand(createNewSkillLoop(v6, 0), v6, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    const save = JSON.parse(encodeSkillLoopSave(started.state)) as Record<string, unknown>;
    inventoryOf(save)['coin'] = 9;
    inventoryOf(save)['clay'] = 5;
    // Farming XP earned under 6.0.0, where the level carried no offline effect yet.
    (save['skillXp'] as Record<string, number>)['farming'] = 2_079;

    const state = decodeSkillLoopSave(JSON.stringify(save), definition, migrate);

    expect(state.contentVersion).toBe(definition.contentVersion);
    expect(state.inventory['coin']).toBe(9);
    expect(state.inventory['clay']).toBe(5);
    expect(state.skillXp['farming']).toBe(2_079);
    expect(state.currentActivity?.activityId).toBe('mine-common-ore');
    // The rules batch adds no state keys: the migrated save carries exactly the current key set.
    expect(Object.keys(state.inventory).length).toBe(definition.items.length);
    expect(state.buffs).toEqual([]);
  });

  it('migrates a 7.0.0 save onto schema 4 with mastery zero-initialised and facts intact', () => {
    const v7 = createSkillPrototypeV7Definition();
    const started = applySkillLoopCommand(createNewSkillLoop(v7, 0), v7, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    const save = JSON.parse(encodeSkillLoopSave(started.state)) as Record<string, unknown>;
    inventoryOf(save)['coin'] = 12;
    (save['skillXp'] as Record<string, number>)['farming'] = 4_851;
    const buffAtSave = [
      { sourceItemId: 'cooked-fish', speedMultiplierPermille: 1_150, remainingMs: 900_000 },
    ];
    save['buffs'] = buffAtSave;

    const state = decodeSkillLoopSave(JSON.stringify(save), definition, migrate);

    expect(state.contentVersion).toBe(definition.contentVersion);
    expect(state.schemaVersion).toBe(4);
    // Every schema-3 fact survives the schema bump: holdings, XP, the running activity, the buff.
    expect(state.inventory['coin']).toBe(12);
    expect(state.skillXp['farming']).toBe(4_851);
    expect(state.currentActivity?.activityId).toBe('mine-common-ore');
    // The buff survives with its identity and remaining time; the speed multiplier is re-read from
    // current content (a 7.0.0 save carries the pre-retune 1150, today's cooked-fish is 870).
    expect(state.buffs?.length).toBe(1);
    expect(state.buffs?.[0]?.sourceItemId).toBe('cooked-fish');
    expect(state.buffs?.[0]?.speedMultiplierPermille).toBe(870);
    expect(state.buffs?.[0]?.remainingMs).toBe(900_000);
    // The captured cycle (8,000 ms under 7.0.0) can no longer be reproduced after the T1 retune,
    // so it is recomputed from the single duration formula instead of failing the whole save:
    // 7,000 ms base x the re-read 870‰ cooked-fish buff.
    expect(state.currentActivity?.cycleDurationMs).toBe(6_090);
    // Mastery starts at zero everywhere: never with fabricated progress.
    expect(Object.keys(state.masteryXp ?? {}).length).toBe(definition.activities.length);
    expect(Object.values(state.masteryXp ?? {}).every((value) => value === 0)).toBe(true);
    expect(Object.keys(state.masteryPool ?? {}).length).toBe(definition.skills.length);
    expect(Object.values(state.masteryPool ?? {}).every((value) => value === 0)).toBe(true);
  });

  it('migrates an 8.0.0 save onto 9.0.0 keeping mastery, the receipt and holdings', () => {
    const v8 = createSkillPrototypeV8Definition();
    const started = applySkillLoopCommand(createNewSkillLoop(v8, 0), v8, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    const save = JSON.parse(encodeSkillLoopSave(started.state)) as Record<string, unknown>;
    (save['masteryXp'] as Record<string, number>)['mine-common-ore'] = 480;
    (save['masteryPool'] as Record<string, number>)['mining'] = 1_200;
    (save['inventory'] as Record<string, number>)['coin'] = 30;
    const inventoryDelta = Object.fromEntries(v8.items.map((item) => [item.id, 0])) as Record<
      string,
      number
    >;
    inventoryDelta['common-ore'] = 5;
    const skillXpDelta = Object.fromEntries(v8.skills.map((skill) => [skill.id, 0])) as Record<
      string,
      number
    >;
    skillXpDelta['mining'] = 7;
    save['returnReport'] = {
      elapsedMs: 3_600_000,
      settlementWindowMs: 3_600_000,
      offlineCapReached: false,
      activityId: 'mine-common-ore',
      reason: 'continuing',
      inventoryDelta,
      skillXpDelta,
      unlockedActivityIds: [],
    };

    const state = decodeSkillLoopSave(JSON.stringify(save), definition, migrate);

    expect(state.contentVersion).toBe('10.0.0');
    expect(state.schemaVersion).toBe(4);
    // Mastery progress carries over inside schema 4; only the new activity/skill keys start at zero.
    expect(state.masteryXp?.['mine-common-ore']).toBe(480);
    expect(state.masteryPool?.['mining']).toBe(1_200);
    expect(state.masteryXp?.['mine-ore-t5']).toBe(0);
    expect(Object.keys(state.masteryXp ?? {}).length).toBe(definition.activities.length);
    expect(Object.keys(state.masteryPool ?? {}).length).toBe(definition.skills.length);
    expect(state.inventory['coin']).toBe(30);
    expect(state.inventory['core-t5']).toBe(0);
    expect(Object.keys(state.inventory).length).toBe(definition.items.length);
    // The pending receipt survives with its real numbers; only added IDs are zero-filled.
    expect(state.returnReport?.inventoryDelta['common-ore']).toBe(5);
    expect(state.returnReport?.inventoryDelta['core-t5']).toBe(0);
    expect(state.returnReport?.skillXpDelta['mining']).toBe(7);
    expect(state.currentActivity?.activityId).toBe('mine-common-ore');
  });

  it('migrates a 9.0.0 save onto 10.0.0 keeping mastery, the receipt and holdings', () => {
    const v9 = createSkillPrototypeV9Definition();
    const started = applySkillLoopCommand(createNewSkillLoop(v9, 0), v9, {
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    const save = JSON.parse(encodeSkillLoopSave(started.state)) as Record<string, unknown>;
    (save['masteryXp'] as Record<string, number>)['mine-common-ore'] = 480;
    (save['masteryPool'] as Record<string, number>)['mining'] = 1_200;
    (save['inventory'] as Record<string, number>)['coin'] = 30;
    const inventoryDelta = Object.fromEntries(v9.items.map((item) => [item.id, 0])) as Record<
      string,
      number
    >;
    inventoryDelta['common-ore'] = 5;
    const skillXpDelta = Object.fromEntries(v9.skills.map((skill) => [skill.id, 0])) as Record<
      string,
      number
    >;
    skillXpDelta['mining'] = 7;
    save['returnReport'] = {
      elapsedMs: 3_600_000,
      settlementWindowMs: 3_600_000,
      offlineCapReached: false,
      activityId: 'mine-common-ore',
      reason: 'continuing',
      inventoryDelta,
      skillXpDelta,
      unlockedActivityIds: [],
    };

    const state = decodeSkillLoopSave(JSON.stringify(save), definition, migrate);

    expect(state.contentVersion).toBe('10.0.0');
    expect(state.schemaVersion).toBe(4);
    // The pacing retune only changes XP thresholds, so every key set is unchanged: mastery, the
    // receipt and the holdings all carry straight across, and nothing is zero-filled.
    expect(state.masteryXp?.['mine-common-ore']).toBe(480);
    expect(state.masteryPool?.['mining']).toBe(1_200);
    expect(Object.keys(state.masteryXp ?? {}).length).toBe(definition.activities.length);
    expect(Object.keys(state.masteryPool ?? {}).length).toBe(definition.skills.length);
    expect(state.inventory['coin']).toBe(30);
    expect(Object.keys(state.inventory).length).toBe(definition.items.length);
    expect(state.returnReport?.inventoryDelta['common-ore']).toBe(5);
    expect(state.returnReport?.skillXpDelta['mining']).toBe(7);
    expect(state.currentActivity?.activityId).toBe('mine-common-ore');
  });

  it('refuses a schema-3-era save that already carries mastery fields', () => {
    const v7 = createSkillPrototypeV7Definition();
    const save = JSON.parse(encodeSkillLoopSave(createNewSkillLoop(v7, 0))) as Record<
      string,
      unknown
    >;
    save['masteryXp'] = { 'mine-common-ore': 40 };

    const attempt = (): unknown => decodeSkillLoopSave(JSON.stringify(save), definition, migrate);

    expect(attempt).toThrowError(SkillSaveValidationError);
    expect(attempt).toThrowError(/masteryXp/);
  });
});
