import { describe, expect, it } from 'vitest';
import { BASE_GAME_DEFINITION } from '../content/base-game';
import { EXPEDITION_DEFINITION } from '../content/expedition';
import { createExpedition, createResourceLedger } from '../domain/expedition/engine';
import type { ExpeditionCommand, SaveBundle } from '../domain/expedition/types';
import { decodeExpeditionSave, encodeExpeditionSave } from '../persistence/expedition-codec';
import type { InstanceLease, SaveStorage } from '../platform/ports';
import { createExpeditionRuntime } from './expedition-runtime';
import {
  advanceAfterResolvingEvents,
  commandAfterResolvingEvents,
} from '../../tests/support/expedition-test-events';

const definition = EXPEDITION_DEFINITION;
const advanceExpedition = advanceAfterResolvingEvents;
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
class MemoryStorage implements SaveStorage {
  main: string | null;
  backup: string | null = null;
  candidate: string | null = null;
  exported: string | null = null;
  writes: string[] = [];
  reads = 0;
  failNext = false;
  gate: ReturnType<typeof deferred<void>> | null = null;
  constructor(contents: string | null = null) {
    this.main = contents;
  }
  read() {
    this.reads += 1;
    return Promise.resolve(this.main);
  }
  readBackup() {
    return Promise.resolve(this.backup);
  }
  async write(contents: string, options?: { readonly preserveBackup?: boolean }) {
    this.writes.push(contents);
    const gate = this.gate;
    this.gate = null;
    if (gate !== null) await gate.promise;
    if (this.failNext) {
      this.failNext = false;
      throw new Error('disk full');
    }
    if (options?.preserveBackup !== true) this.backup = this.main;
    this.main = contents;
  }
  exportFile(contents: string) {
    this.exported = contents;
    return Promise.resolve(true);
  }
  importFile() {
    return Promise.resolve(this.candidate);
  }
}
class MemoryLease implements InstanceLease {
  refused = false;
  releases = 0;
  acquire() {
    return this.refused ? Promise.reject(new Error('already open')) : Promise.resolve();
  }
  release() {
    this.releases += 1;
  }
}
function runtime(
  storage: SaveStorage,
  clock: () => number = () => 0,
  lease: InstanceLease = new MemoryLease(),
) {
  return createExpeditionRuntime(definition, storage, lease, clock, BASE_GAME_DEFINITION);
}
function decode(contents: string): SaveBundle {
  return decodeExpeditionSave(contents, definition, BASE_GAME_DEFINITION);
}
async function settle() {
  for (let step = 0; step < 12; step += 1) await Promise.resolve();
}
function command(state: SaveBundle, value: ExpeditionCommand): SaveBundle {
  return commandAfterResolvingEvents(state, definition, value);
}
function returnable(waves = 2, restore = false): SaveBundle {
  let state = command(createExpedition(definition, 0), { kind: 'enter-world', worldId: 'forest' });
  state = {
    ...state,
    activeRun: {
      ...state.activeRun!,
      resources: { wood: 120, stone: 100 },
      resourceLedger: createResourceLedger({ wood: 120, stone: 100 }),
    },
  };
  state = command(state, { kind: 'build', buildingId: 'shelter' });
  for (let count = 0; count < 3; count += 1)
    state = command(state, { kind: 'build', buildingId: 'wall' });
  for (let wave = 0; wave < waves; wave += 1) {
    state = advanceExpedition(state, definition, state.lastSimulatedAt + 1_000_000);
    state = command(state, { kind: 'fight-wave' });
    if (restore && wave === 0)
      state = command(state, { kind: 'choose-beacon', optionId: 'restore' });
  }
  return state;
}

describe('expedition runtime atomic progress', () => {
  it('refuses the v0.7.1 save without changing the main file or its backup', async () => {
    const oldState = {
      ...createExpedition(definition, 0),
      schemaVersion: 7 as const,
      contentVersion: '12.0.0',
    };
    const original = JSON.stringify(oldState);
    const storage = new MemoryStorage(original);
    storage.backup = 'existing recovery copy';
    const game = runtime(storage);
    await expect(game.start()).rejects.toThrow('请使用旧版 v0.7.1 打开');
    expect(game.getSnapshot().status).toBe('error');
    expect(storage.main).toBe(original);
    expect(storage.backup).toBe('existing recovery copy');
    expect(storage.writes).toHaveLength(0);
    game.dispose();
  });

  it('commits an early battle only after a successful write and retries without duplicating the reward', async () => {
    const state = command(
      advanceExpedition(
        command(createExpedition(definition, 0), { kind: 'enter-world', worldId: 'forest' }),
        definition,
        120_000,
      ),
      { kind: 'build', buildingId: 'shelter' },
    );
    const storage = new MemoryStorage(encodeExpeditionSave(state));
    const game = runtime(storage, () => 120_000);
    await game.start();
    storage.failNext = true;
    await expect(game.dispatch({ kind: 'fight-early' })).rejects.toThrow('disk full');
    expect(game.getSnapshot().state?.activeRun).toMatchObject({
      clearedWaves: 0,
      initiativePoints: 0,
      hp: 100,
    });
    await game.dispatch({ kind: 'fight-early' });
    expect(game.getSnapshot().state?.activeRun).toMatchObject({
      clearedWaves: 1,
      initiativePoints: 1,
      hp: 97,
    });
    expect(decode(storage.main!).activeRun?.initiativePoints).toBe(1);
    game.dispose();
  });
  it('refuses an older legacy save without replacing it or creating a backup', async () => {
    const original = JSON.stringify({ schemaVersion: 1, contentVersion: '1.0.0', balance: 37 });
    const storage = new MemoryStorage(original);
    const game = runtime(storage);
    await expect(game.start()).rejects.toThrow('不迁移旧版存档');
    expect(storage.main).toBe(original);
    expect(storage.backup).toBeNull();
    expect(storage.writes).toHaveLength(0);
    game.dispose();
  });

  it('retains one offline candidate on startup failure and never advances it again on retry', async () => {
    const entered = command(createExpedition(definition, 0), {
      kind: 'enter-world',
      worldId: 'forest',
    });
    const storage = new MemoryStorage(encodeExpeditionSave(entered));
    storage.failNext = true;
    let now = 24 * 60 * 60 * 1_000;
    const game = runtime(storage, () => now);
    await expect(game.start()).rejects.toThrow('disk full');
    const candidate = game.getSnapshot().state;
    expect(candidate?.activeRun?.phase).toBe('awaiting-wave');
    expect(candidate?.activeRun?.hp).toBe(100);
    now += 24 * 60 * 60 * 1_000;
    await game.start();
    expect(game.getSnapshot().state).toBe(candidate);
    expect(storage.reads).toBe(1);
    expect(game.getSnapshot().isDirty).toBe(false);
    game.dispose();
  });

  it('refuses a second instance before reading or opening an import picker', async () => {
    const lease = new MemoryLease();
    lease.refused = true;
    const storage = new MemoryStorage();
    let picks = 0;
    storage.importFile = () => {
      picks += 1;
      return Promise.resolve(null);
    };
    const game = runtime(storage, () => 0, lease);
    await expect(game.start()).rejects.toThrow('already open');
    await expect(game.importSave()).rejects.toThrow('独占权');
    expect(storage.reads).toBe(0);
    expect(storage.writes).toHaveLength(0);
    expect(picks).toBe(0);
    game.dispose();
  });

  it('does not publish entry until its save succeeds and uses the same sequence after failure', async () => {
    const storage = new MemoryStorage();
    const game = runtime(storage);
    await game.start();
    const gate = deferred<void>();
    storage.gate = gate;
    storage.failNext = true;
    const entering = game.dispatch({ kind: 'enter-world', worldId: 'forest' });
    const rejection = expect(entering).rejects.toThrow('disk full');
    await settle();
    expect(game.getSnapshot().state?.activeRun).toBeNull();
    expect(game.getSnapshot().state?.profile.nextRunSequence).toBe(1);
    gate.resolve();
    await rejection;
    expect(game.getSnapshot().state?.activeRun).toBeNull();
    expect((await game.dispatch({ kind: 'enter-world', worldId: 'forest' })).ok).toBe(true);
    expect(game.getSnapshot().state?.activeRun?.sequence).toBe(1);
    expect(decode(storage.main!).profile.nextRunSequence).toBe(2);
    game.dispose();
  });

  it('keeps return provisional on failed storage, then awards exactly once across retries and reloads', async () => {
    const original = returnable();
    const storage = new MemoryStorage(encodeExpeditionSave(original));
    const game = runtime(storage, () => original.lastSimulatedAt);
    await game.start();
    storage.failNext = true;
    await expect(game.dispatch({ kind: 'return' })).rejects.toThrow('disk full');
    expect(game.getSnapshot().state?.profile.points).toBe(0);
    expect(game.getSnapshot().state?.activeRun?.sequence).toBe(1);
    expect(decode(storage.main!).activeRun?.sequence).toBe(1);
    expect((await game.dispatch({ kind: 'return' })).ok).toBe(true);
    expect(game.getSnapshot().state?.profile.points).toBe(20);
    expect(game.getSnapshot().state?.activeRun).toBeNull();
    expect(await game.dispatch({ kind: 'return' })).toMatchObject({
      ok: false,
      error: 'WRONG_PHASE',
    });
    game.dispose();
    await settle();
    const reopened = runtime(storage, () => original.lastSimulatedAt);
    await reopened.start();
    expect(reopened.getSnapshot().state?.profile.points).toBe(20);
    expect(reopened.getSnapshot().state?.profile.settledThrough).toBe(1);
    reopened.dispose();
  });

  it('does not debit or grant a permanent perk before its atomic save', async () => {
    const hub = command(returnable(3, true), { kind: 'return' });
    const storage = new MemoryStorage(encodeExpeditionSave(hub));
    const game = runtime(storage, () => hub.lastSimulatedAt);
    await game.start();
    storage.failNext = true;
    await expect(game.dispatch({ kind: 'buy-perk', perkId: 'reinforced-core' })).rejects.toThrow(
      'disk full',
    );
    expect(game.getSnapshot().state?.profile).toMatchObject({ points: 35, perkIds: [] });
    expect((await game.dispatch({ kind: 'buy-perk', perkId: 'reinforced-core' })).ok).toBe(true);
    expect(game.getSnapshot().state?.profile).toMatchObject({
      points: 0,
      totalPoints: 35,
      perkIds: ['reinforced-core'],
    });
    expect(await game.dispatch({ kind: 'buy-perk', perkId: 'reinforced-core' })).toMatchObject({
      ok: false,
      error: 'ALREADY_PURCHASED',
    });
    game.dispose();
  });

  it('saves investigation costs and temporary clues before publishing them, then archives once on return', async () => {
    const initial = returnable(2, true);
    const storage = new MemoryStorage(encodeExpeditionSave(initial));
    const game = runtime(storage, () => initial.lastSimulatedAt);
    await game.start();
    storage.failNext = true;
    await expect(
      game.dispatch({ kind: 'investigate', clueId: 'forest-inscription' }),
    ).rejects.toThrow('disk full');
    expect(game.getSnapshot().state?.activeRun?.resources).toEqual(initial.activeRun?.resources);
    expect(game.getSnapshot().state?.activeRun?.recoveredClueIds).toEqual([]);
    await game.dispatch({ kind: 'investigate', clueId: 'forest-inscription' });
    expect(decode(storage.main!).activeRun?.recoveredClueIds).toEqual(['forest-inscription']);
    expect(game.getSnapshot().state?.profile.discoveredClueIds).toEqual([]);
    await game.dispatch({ kind: 'return' });
    expect(decode(storage.main!).profile.discoveredClueIds).toEqual([
      'forest-signal',
      'forest-inscription',
    ]);
    expect(await game.dispatch({ kind: 'return' })).toMatchObject({
      ok: false,
      error: 'WRONG_PHASE',
    });
    game.dispose();
  });

  it('keeps dialogue choices and the next-world gate provisional until their save succeeds', async () => {
    const hub = command(returnable(), { kind: 'return' });
    const storage = new MemoryStorage(encodeExpeditionSave(hub));
    const game = runtime(storage, () => hub.lastSimulatedAt);
    await game.start();
    storage.failNext = true;
    const choice = {
      kind: 'choose-dialogue',
      dialogueId: 'keeper-debrief',
      optionId: 'trace-source',
    } as const;
    await expect(game.dispatch(choice)).rejects.toThrow('disk full');
    expect(game.getSnapshot().state?.profile.dialogueChoices).toEqual({});
    expect(game.getSnapshot().state?.profile.discoveredClueIds).toEqual(['forest-signal']);
    expect(await game.dispatch({ kind: 'enter-world', worldId: 'ruins' })).toMatchObject({
      ok: false,
      error: 'LOCKED',
    });
    await game.dispatch(choice);
    expect(decode(storage.main!).profile.dialogueChoices).toEqual({
      'keeper-debrief': 'trace-source',
    });
    expect(await game.dispatch(choice)).toMatchObject({ ok: false, error: 'ALREADY_CHOSEN' });
    await game.dispatch({ kind: 'enter-world', worldId: 'ruins' });
    expect(decode(storage.main!).activeRun?.resources).toEqual({ wood: 5, stone: 14 });
    game.dispose();
  });

  it('settles death without erasing previously earned meta or purchased perks', async () => {
    let state = command(command(returnable(3, true), { kind: 'return' }), {
      kind: 'buy-perk',
      perkId: 'reinforced-core',
    });
    const previousProfile = state.profile;
    state = command(state, { kind: 'enter-world', worldId: 'forest' });
    for (let wave = 0; wave < 3; wave += 1) {
      state = advanceExpedition(state, definition, state.lastSimulatedAt + 1_000_000);
      state = command(state, { kind: 'fight-wave' });
      if (state.activeRun?.phase === 'failed') break;
    }
    expect(state.activeRun?.phase).toBe('failed');
    const storage = new MemoryStorage(encodeExpeditionSave(state));
    const game = runtime(storage, () => state.lastSimulatedAt);
    await game.start();
    storage.failNext = true;
    await expect(game.dispatch({ kind: 'return' })).rejects.toThrow('disk full');
    expect(game.getSnapshot().state?.activeRun?.phase).toBe('failed');
    await game.dispatch({ kind: 'return' });
    expect(game.getSnapshot().state?.profile).toMatchObject({
      points: previousProfile.points,
      totalPoints: previousProfile.totalPoints,
      perkIds: previousProfile.perkIds,
      clearedWorldIds: previousProfile.clearedWorldIds,
      settledThrough: 2,
    });
    expect(decode(storage.main!).lastSettlement).toMatchObject({
      sequence: 2,
      outcome: 'failed',
      points: 0,
      rewards: [],
    });
    game.dispose();
  });

  it('does not spend building resources or publish battle damage if their writes fail', async () => {
    let state = command(createExpedition(definition, 0), {
      kind: 'enter-world',
      worldId: 'forest',
    });
    state = {
      ...state,
      activeRun: {
        ...state.activeRun!,
        resources: { wood: 120, stone: 100 },
        resourceLedger: createResourceLedger({ wood: 120, stone: 100 }),
      },
    };
    const storage = new MemoryStorage(encodeExpeditionSave(state));
    let now = 0;
    const game = runtime(storage, () => now);
    await game.start();
    storage.failNext = true;
    await expect(game.dispatch({ kind: 'build', buildingId: 'shelter' })).rejects.toThrow(
      'disk full',
    );
    expect(game.getSnapshot().state?.activeRun?.buildings.shelter).toBe(0);
    expect(game.getSnapshot().state?.activeRun?.resources).toEqual({ wood: 120, stone: 100 });
    await game.dispatch({ kind: 'build', buildingId: 'shelter' });
    now = 1_000_000;
    await game.dispatch({ kind: 'tick' });
    storage.failNext = true;
    await expect(game.dispatch({ kind: 'fight-wave' })).rejects.toThrow('disk full');
    expect(game.getSnapshot().state?.activeRun).toMatchObject({
      hp: 100,
      clearedWaves: 0,
      phase: 'awaiting-wave',
      lastBattle: null,
    });
    await game.dispatch({ kind: 'fight-wave' });
    expect(game.getSnapshot().state?.activeRun).toMatchObject({
      hp: 99,
      clearedWaves: 1,
      phase: 'preparing',
    });
    game.dispose();
  });

  it('retains ordinary gathered progress on save failure and does not clear newer dirty state on an old ack', async () => {
    const storage = new MemoryStorage();
    let now = 0;
    const game = runtime(storage, () => now);
    await game.start();
    await game.dispatch({ kind: 'enter-world', worldId: 'forest' });
    const gate = deferred<void>();
    storage.gate = gate;
    now = 5_000;
    await game.dispatch({ kind: 'gather', resource: 'wood' });
    const old = game.getSnapshot().state!;
    now += 1_500;
    await game.dispatch({ kind: 'gather', resource: 'wood' });
    gate.resolve();
    await settle();
    expect(decode(storage.main!).activeRun?.resources.wood).toBe(old.activeRun?.resources.wood);
    expect(game.getSnapshot().isDirty).toBe(true);
    storage.failNext = true;
    const gathered = game.getSnapshot().state?.activeRun?.resources.wood;
    await expect(game.flush()).rejects.toThrow('disk full');
    expect(game.getSnapshot().state?.activeRun?.resources.wood).toBe(gathered);
    await game.flush();
    expect(game.getSnapshot().isDirty).toBe(false);
    game.dispose();
  });

  it('imports through the same queue and opens the picker while an old write is still pending', async () => {
    const storage = new MemoryStorage();
    let now = 0;
    const game = runtime(storage, () => now);
    await game.start();
    await game.dispatch({ kind: 'enter-world', worldId: 'forest' });
    const gate = deferred<void>();
    storage.gate = gate;
    now = 5_000;
    await game.dispatch({ kind: 'gather', resource: 'wood' });
    let pickerCalled = false;
    const hub = command(returnable(), { kind: 'return' });
    storage.importFile = () => {
      pickerCalled = true;
      return Promise.resolve(JSON.stringify({ ...hub, revision: 999_999 }));
    };
    const revision = game.getSnapshot().revision;
    const importing = game.importSave();
    expect(pickerCalled).toBe(true);
    await settle();
    expect(game.getSnapshot().state?.profile.points).toBe(0);
    gate.resolve();
    expect(await importing).toBe(true);
    expect(game.getSnapshot().revision).toBe(revision + 1);
    expect(decode(storage.backup!).activeRun?.sequence).toBe(1);
    expect(decode(storage.main!).profile.points).toBe(20);
    game.dispose();
  });

  it('rejects invalid imports and releases the barrier after an early picker rejection', async () => {
    const storage = new MemoryStorage();
    const game = runtime(storage);
    await game.start();
    storage.candidate = '{"schemaVersion":5}';
    await expect(game.importSave()).rejects.toThrow('不迁移旧版存档');
    expect(game.getSnapshot().state?.profile.points).toBe(0);
    storage.importFile = () => Promise.reject(new Error('picker refused'));
    await expect(game.importSave()).rejects.toThrow('picker refused');
    expect((await game.dispatch({ kind: 'enter-world', worldId: 'forest' })).ok).toBe(true);
    game.dispose();
  });

  it('does not replace memory or permanent points when an imported candidate cannot be written', async () => {
    const storage = new MemoryStorage();
    const game = runtime(storage);
    await game.start();
    const hub = command(returnable(), { kind: 'return' });
    storage.candidate = encodeExpeditionSave(hub);
    const originalWrite = storage.write.bind(storage);
    storage.write = async (contents, options) => {
      if (decode(contents).profile.points === 20) throw new Error('candidate failed');
      await originalWrite(contents, options);
    };
    await expect(game.importSave()).rejects.toThrow('candidate failed');
    expect(game.getSnapshot().state?.profile.points).toBe(0);
    expect(game.getSnapshot().state?.activeRun).toBeNull();
    expect(decode(storage.main!).profile.points).toBe(0);
    expect((await game.dispatch({ kind: 'enter-world', worldId: 'forest' })).ok).toBe(true);
    game.dispose();
  });

  it('preserves a valid schema-8 backup during corrupt-main recovery and reuses the recovery candidate', async () => {
    const storage = new MemoryStorage('corrupt main');
    storage.backup = encodeExpeditionSave(createExpedition(definition, 1_000));
    const originalBackup = storage.backup;
    let now = 1_000;
    const game = runtime(storage, () => now);
    await expect(game.start()).rejects.toThrow();
    storage.failNext = true;
    await expect(game.recoverBackup()).rejects.toThrow('disk full');
    expect(game.getSnapshot().state).toBeNull();
    now = 100_000;
    await game.start();
    expect(storage.backup).toBe(originalBackup);
    expect(game.getSnapshot().state?.schemaVersion).toBe(8);
    expect(game.getSnapshot().state?.lastSimulatedAt).toBe(1_000);
    game.dispose();
  });

  it('waits for a fixed save before hiding and resumes safe time on failure', async () => {
    const storage = new MemoryStorage();
    let now = 0;
    const game = runtime(storage, () => now);
    await game.start();
    await game.dispatch({ kind: 'enter-world', worldId: 'forest' });
    const gate = deferred<void>();
    storage.gate = gate;
    storage.failNext = true;
    let hidden = false;
    now = 1_000;
    const barrier = game.withSaveBarrier(() => {
      hidden = true;
      return Promise.resolve();
    });
    const failure = expect(barrier).rejects.toThrow('disk full');
    await settle();
    now = 24 * 60 * 60 * 1_000;
    await expect(game.dispatch({ kind: 'tick' })).rejects.toThrow('正在保存');
    gate.resolve();
    await failure;
    expect(hidden).toBe(false);
    expect(game.getSnapshot().state?.activeRun).toMatchObject({ hp: 100, phase: 'awaiting-wave' });
    expect(game.getSnapshot().isDirty).toBe(true);
    game.dispose();
  });

  it('allows exporting a startup candidate even if the main save is failing', async () => {
    const storage = new MemoryStorage();
    storage.failNext = true;
    const game = runtime(storage);
    await expect(game.start()).rejects.toThrow('disk full');
    expect(await game.exportSave()).toBe(true);
    expect(decode(storage.exported!)).toEqual(game.getSnapshot().state);
    expect(storage.writes).toHaveLength(1);
    game.dispose();
  });

  it('holds the lease until an already-started important write finishes after disposal', async () => {
    const storage = new MemoryStorage();
    const lease = new MemoryLease();
    const game = runtime(storage, () => 0, lease);
    await game.start();
    const gate = deferred<void>();
    storage.gate = gate;
    const entering = game.dispatch({ kind: 'enter-world', worldId: 'forest' });
    const rejected = expect(entering).rejects.toThrow('已关闭');
    await settle();
    game.dispose();
    await settle();
    expect(lease.releases).toBe(0);
    gate.resolve();
    await rejected;
    await settle();
    expect(lease.releases).toBe(1);
    expect(decode(storage.main!).activeRun?.sequence).toBe(1);
  });
});
