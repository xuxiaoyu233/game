import { describe, expect, it } from 'vitest';
import { createSkillPrototypeV1Definition } from '../content/skill-prototype-v1';
import type { SkillLoopState } from '../domain/skill-loop/types';
import { decodeSkillLoopSave } from '../persistence/skill-loop-codec';
import type { InstanceLease, SaveStorage } from '../platform/ports';
import { SKILL_LOOP_RUNTIME_DOMAIN } from './skill-loop-runtime-domain';
import { createConfiguredGameRuntime } from './game-runtime';

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
    const definition = createSkillPrototypeV1Definition('level-threshold');
    const storage = new PrototypeStorage();
    const runtime = createConfiguredGameRuntime(
      definition,
      storage,
      new PrototypeLease(),
      SKILL_LOOP_RUNTIME_DOMAIN,
      () => now,
    );
    await runtime.start();
    const fresh = runtime.getSnapshot().state;
    expect(fresh?.inventory).toEqual({
      'common-ore': 0,
      'common-ingot': 0,
      'common-tool-blank': 0,
    });
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
});
