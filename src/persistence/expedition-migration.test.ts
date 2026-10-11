import { describe, expect, it } from 'vitest';
import { BASE_GAME_DEFINITION } from '../content/base-game';
import { EXPEDITION_DEFINITION } from '../content/expedition';
import { EXPEDITION_V13_DEFINITION } from '../content/expedition-v13';
import { EXPEDITION_V14_DEFINITION } from '../content/expedition-v14';
import { applyExpeditionCommand, createExpedition } from '../domain/expedition/engine';
import { decodeExpeditionSave, encodeExpeditionSave } from './expedition-codec';

describe('v0.8 save boundary', () => {
  it('creates and round trips a schema-8 rules fixture from an empty profile', () => {
    const created = createExpedition(EXPEDITION_DEFINITION, 100);
    expect(created).toMatchObject({ schemaVersion: 8, contentVersion: '12.0.0' });
    const decoded = decodeExpeditionSave(
      encodeExpeditionSave(created),
      EXPEDITION_DEFINITION,
      BASE_GAME_DEFINITION,
    );
    expect(decoded).toEqual(created);
  });

  it.each([1, 2, 3, 4, 5, 6])(
    'rejects legacy schema %s without changing its source',
    (schemaVersion) => {
      const source = JSON.stringify({ schemaVersion, contentVersion: `${schemaVersion}.0.0` });
      expect(() =>
        decodeExpeditionSave(source, EXPEDITION_DEFINITION, BASE_GAME_DEFINITION),
      ).toThrow('不迁移旧版存档');
      expect(source).toBe(
        JSON.stringify({ schemaVersion, contentVersion: `${schemaVersion}.0.0` }),
      );
    },
  );

  it('rejects the v0.7.1 schema-7 save and tells the player to use the old build', () => {
    const source = JSON.stringify({ schemaVersion: 7, contentVersion: '12.0.0' });
    expect(() => decodeExpeditionSave(source, EXPEDITION_DEFINITION, BASE_GAME_DEFINITION)).toThrow(
      '请使用旧版 v0.7.1 打开',
    );
    expect(source).toBe('{"schemaVersion":7,"contentVersion":"12.0.0"}');
  });

  it('rejects a schema-8 file with a different mechanical content version', () => {
    const created = createExpedition(EXPEDITION_DEFINITION, 100);
    const wrongContent = { ...created, contentVersion: '13.0.0' };
    expect(() =>
      decodeExpeditionSave(
        JSON.stringify(wrongContent),
        EXPEDITION_DEFINITION,
        BASE_GAME_DEFINITION,
      ),
    ).toThrow('不支持此存档格式或内容版本');
  });
});

describe('schema-8 to schema-9 outpost migration', () => {
  it('freezes and advances a v13 run before adding a fresh outpost without touching source text', () => {
    const start = createExpedition(EXPEDITION_V13_DEFINITION, 1_000);
    const entered = applyExpeditionCommand(start, EXPEDITION_V13_DEFINITION, {
      kind: 'enter-world',
      worldId: 'world-unlisted-city',
    });
    if (!entered.ok) throw new Error('Could not create the v13 migration fixture');
    const source = encodeExpeditionSave(entered.state);
    const migratedAt = 31_000;
    const migrated = decodeExpeditionSave(
      source,
      EXPEDITION_V14_DEFINITION,
      BASE_GAME_DEFINITION,
      undefined,
      migratedAt,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      EXPEDITION_V13_DEFINITION,
    );

    expect(migrated).toMatchObject({
      schemaVersion: 9,
      contentVersion: '14.0.0',
      lastSimulatedAt: migratedAt,
      activeRun: { sequence: 1, elapsedInStageMs: migratedAt - 1_000 },
      outpost: { resources: { 'reclaimed-alloy': 12, 'charge-cell': 10, biofiber: 8 } },
    });
    expect(entered.state).toMatchObject({ schemaVersion: 8, contentVersion: '13.0.0' });
    expect(source).toContain('"schemaVersion": 8');
  });

  it('adds continuous stock-target defaults to a prior schema-9 outpost save', () => {
    const created = createExpedition(EXPEDITION_V14_DEFINITION, 100);
    if (created.outpost === null) throw new Error('Missing v14 outpost state');
    const previousOutpost = { ...created.outpost } as Record<string, unknown>;
    delete previousOutpost.jobTargets;
    delete previousOutpost.reviewedProductionByJob;
    delete previousOutpost.reviewedCraftedByRecipe;
    delete previousOutpost.facilities;
    const previousSave = { ...created, outpost: previousOutpost };
    const source = JSON.stringify(previousSave);
    const migrated = decodeExpeditionSave(source, EXPEDITION_V14_DEFINITION, BASE_GAME_DEFINITION);
    expect(migrated.outpost?.jobTargets).toEqual({
      'recover-alloy': null,
      'recover-cells': null,
      'cultivate-biofiber': null,
    });
    expect(migrated.outpost?.reviewedProductionByJob).toEqual(created.outpost.producedByJob);
    expect(migrated.outpost?.reviewedCraftedByRecipe).toEqual(created.outpost.craftedByRecipe);
    expect(migrated.outpost?.facilities).toEqual({ 'production-hangar': 0 });
    expect(source).not.toContain('jobTargets');
  });
});
