import { describe, expect, it } from 'vitest';
import { createSkillPrototypeV1Definition } from '../content/skill-prototype-v1';
import { createSkillPrototypeV2Definition } from '../content/skill-prototype-v2';
import { createNewSkillLoop } from '../domain/skill-loop/engine';
import type { SkillLoopState } from '../domain/skill-loop/types';
import { decodeSkillLoopSave, encodeSkillLoopSave } from '../persistence/skill-loop-codec';
import { migrateSkillPrototypeSave } from '../persistence/skill-prototype-save-migrations';
import type { InstanceLease, SaveStorage } from '../platform/ports';
import { createSkillLoopRuntimeDomain } from './skill-loop-runtime-domain';
import { createConfiguredGameRuntime } from './game-runtime';

const runtimeDomain = createSkillLoopRuntimeDomain((source, targetDefinition) =>
  migrateSkillPrototypeSave(source, createSkillPrototypeV1Definition(), targetDefinition),
);

class PrototypeStorage implements SaveStorage {
  main: string | null = null;
  backup: string | null = null;
  candidate: string | null = null;
  writes = 0;

  read(): Promise<string | null> {
    return Promise.resolve(this.main);
  }
  readBackup(): Promise<string | null> {
    return Promise.resolve(this.backup);
  }
  write(contents: string, options?: { readonly preserveBackup?: boolean }): Promise<void> {
    if (options?.preserveBackup !== true) this.backup = this.main;
    this.main = contents;
    this.writes += 1;
    return Promise.resolve();
  }
  exportFile(): Promise<boolean> {
    return Promise.resolve(true);
  }
  importFile(): Promise<string | null> {
    return Promise.resolve(this.candidate);
  }
}

class PrototypeLease implements InstanceLease {
  acquire(): Promise<void> {
    return Promise.resolve();
  }
  release(): void {}
}

describe('skill-loop GameRuntime integration', () => {
  it('uses the shared runtime lifecycle and refuses an old save without replacing the new profile', async () => {
    let now = 1_000;
    const definition = createSkillPrototypeV2Definition();
    const storage = new PrototypeStorage();
    const runtime = createConfiguredGameRuntime(
      definition,
      storage,
      new PrototypeLease(),
      runtimeDomain,
      () => now,
    );
    await runtime.start();
    const fresh = runtime.getSnapshot().state;
    expect(fresh?.inventory).toEqual(definition.initialInventory);
    expect(storage.main).not.toBeNull();

    const started = await runtime.dispatch({
      kind: 'start-activity',
      activityId: 'mine-common-ore',
    });
    expect(started.ok).toBe(true);
    now += 3_000;
    await runtime.dispatch({ kind: 'tick' });
    const beforeImport = runtime.getSnapshot().state as SkillLoopState;
    const currentSave = storage.main;
    const incompatible = JSON.stringify({
      schemaVersion: 9,
      contentVersion: '14.0.0',
      worldId: 'old',
    });
    storage.candidate = incompatible;

    await expect(runtime.importSave()).rejects.toThrow('profile 或格式版本不兼容');
    expect(runtime.getSnapshot().state).toEqual(beforeImport);
    expect(storage.main).toBe(currentSave);
    expect(storage.candidate).toBe(incompatible);
    expect(storage.writes).toBe(2);
    expect(() => decodeSkillLoopSave(storage.main ?? '', definition)).not.toThrow();
    runtime.dispose();
  });

  it('migrates a P1 save additively and preserves it as the backup', async () => {
    let now = 10_000;
    const previousDefinition = createSkillPrototypeV1Definition();
    const definition = createSkillPrototypeV2Definition();
    const storage = new PrototypeStorage();
    const previous = createNewSkillLoop(previousDefinition, now);
    const previousState: SkillLoopState = {
      ...previous,
      inventory: { ...previous.inventory, 'common-ore': 18, 'common-ingot': 2 },
      skillXp: { ...previous.skillXp, mining: 16, metalworking: 10 },
      toolLevels: { ...previous.toolLevels, 'mining-tool': 2 },
      currentActivity: {
        activityId: 'mine-common-ore',
        status: 'paused',
        progressMs: 2_400,
        cycleDurationMs: 6_400,
        stopReason: null,
      },
    };
    const oldSave = encodeSkillLoopSave(previousState);
    storage.main = oldSave;
    const runtime = createConfiguredGameRuntime(
      definition,
      storage,
      new PrototypeLease(),
      runtimeDomain,
      () => now,
    );

    await runtime.start();

    const migrated = runtime.getSnapshot().state;
    expect(migrated).toMatchObject({
      schemaVersion: 2,
      contentVersion: '2.0.0',
      returnReport: null,
      inventory: {
        'common-ore': 18,
        'common-ingot': 2,
        'advanced-ore': 0,
        'advanced-ingot': 0,
        'composite-tool-blank': 0,
      },
      skillXp: { mining: 16, metalworking: 10 },
      toolLevels: { 'mining-tool': 2 },
      currentActivity: {
        activityId: 'mine-common-ore',
        status: 'paused',
        progressMs: 2_400,
        cycleDurationMs: 6_400,
      },
    });
    expect(storage.backup).toBe(oldSave);
    expect(storage.main).toContain('"contentVersion": "2.0.0"');
    expect(() => decodeSkillLoopSave(storage.main ?? '', definition)).not.toThrow();

    await runtime.dispatch({ kind: 'resume-activity' });
    now += 4_000;
    await runtime.dispatch({ kind: 'tick' });

    async function switchAndRun(
      activityId: string,
      cycles: number,
      cycleDurationMs: number,
    ): Promise<void> {
      await runtime.dispatch({ kind: 'switch-activity', activityId });
      now += cycles * cycleDurationMs;
      await runtime.dispatch({ kind: 'tick' });
    }

    await switchAndRun('mine-rich-common-ore', 7, 8_000);
    await switchAndRun('mine-advanced-ore', 2, 9_600);
    await switchAndRun('smelt-common-ingot', 9, 6_000);
    await switchAndRun('forge-common-tool-blank', 1, 10_000);
    await switchAndRun('smelt-advanced-ingot', 1, 9_000);
    await switchAndRun('forge-composite-tool-blank', 1, 14_000);
    const toolUpgrade = await runtime.dispatch({
      kind: 'buy-tool-upgrade',
      upgradeId: 'mining-tool-iii',
    });

    expect(toolUpgrade.ok).toBe(true);
    expect(runtime.getSnapshot().state).toMatchObject({
      contentVersion: '2.0.0',
      inventory: {
        'common-ore': 15,
        'common-ingot': 7,
        'common-tool-blank': 1,
        'advanced-ore': 0,
        'advanced-ingot': 0,
        'composite-tool-blank': 0,
      },
      skillXp: { mining: 44, metalworking: 70 },
      toolLevels: { 'mining-tool': 3 },
    });
    runtime.dispose();
  });

  it('migrates the previous P2 schema without changing its game facts', async () => {
    const now = 20_000;
    const definition = createSkillPrototypeV2Definition();
    const legacyDefinition = { ...definition, schemaVersion: 1 as const };
    const current = createNewSkillLoop(legacyDefinition, now);
    const previousSave = JSON.stringify({
      ...current,
      inventory: { ...current.inventory, 'common-ore': 23 },
      skillXp: { ...current.skillXp, mining: 12 },
      returnReport: undefined,
    });
    const storage = new PrototypeStorage();
    storage.main = previousSave;
    const runtime = createConfiguredGameRuntime(
      definition,
      storage,
      new PrototypeLease(),
      runtimeDomain,
      () => now,
    );

    await runtime.start();

    expect(runtime.getSnapshot().state).toMatchObject({
      schemaVersion: 2,
      contentVersion: '2.0.0',
      inventory: { 'common-ore': 23 },
      skillXp: { mining: 12 },
      returnReport: null,
    });
    expect(storage.backup).toBe(previousSave);
    expect(() => decodeSkillLoopSave(storage.main ?? '', definition)).not.toThrow();
    runtime.dispose();
  });

  it('persists the startup return report and confirms it without repeating settlement', async () => {
    const startTime = 30_000;
    let now = startTime;
    const definition = createSkillPrototypeV2Definition();
    const fresh = createNewSkillLoop(definition, startTime);
    const started = {
      ...fresh,
      currentActivity: {
        activityId: 'mine-common-ore',
        status: 'running' as const,
        progressMs: 0,
        cycleDurationMs: 8_000,
        stopReason: null,
      },
    };
    const storage = new PrototypeStorage();
    storage.main = encodeSkillLoopSave(started);
    now += definition.maxOfflineMs + 60 * 60 * 1_000;
    const runtime = createConfiguredGameRuntime(
      definition,
      storage,
      new PrototypeLease(),
      runtimeDomain,
      () => now,
    );

    await runtime.start();
    const settled = runtime.getSnapshot().state;
    expect(settled?.inventory['common-ore']).toBe(3_600);
    expect(settled?.returnReport).toMatchObject({ offlineCapReached: true });
    const inventoryBeforeAcknowledge = settled?.inventory;
    const xpBeforeAcknowledge = settled?.skillXp;

    await runtime.dispatch({ kind: 'acknowledge-return-report' });

    expect(runtime.getSnapshot().state?.inventory).toEqual(inventoryBeforeAcknowledge);
    expect(runtime.getSnapshot().state?.skillXp).toEqual(xpBeforeAcknowledge);
    expect(runtime.getSnapshot().state?.returnReport).toBeNull();
    expect(storage.writes).toBe(2);
    expect(() => decodeSkillLoopSave(storage.main ?? '', definition)).not.toThrow();
    runtime.dispose();
  });
});
