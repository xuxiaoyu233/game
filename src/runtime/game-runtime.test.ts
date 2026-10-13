import { describe, expect, it } from 'vitest';
import { createNewGame } from '../domain/engine';
import type { GameDefinition, GameState } from '../domain/types';
import { decodeSave, encodeSave } from '../persistence/save-codec';
import type { InstanceLease, SaveStorage } from '../platform/ports';
import { createGameRuntime } from './legacy/legacy-game-domain';

const definition: GameDefinition = {
  contentVersion: 'test-1',
  worldId: 'test-world',
  initialClickYield: 1,
  maxOfflineMs: 8 * 60 * 60 * 1_000,
  tools: [{ id: 'cart', baseCost: 20, costGrowth: 1.18, productionRate: 0.5 }],
  upgrades: [],
  tasks: [],
  events: [],
};

function savedState(overrides: Partial<GameState> = {}): GameState {
  return { ...createNewGame(definition, 0), ...overrides };
}

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
  readCount = 0;
  failNext = false;
  gate: ReturnType<typeof deferred<void>> | null = null;

  constructor(state: GameState | string | null = null) {
    this.main = typeof state === 'string' || state === null ? state : encodeSave(state);
  }
  read(): Promise<string | null> {
    this.readCount += 1;
    return Promise.resolve(this.main);
  }
  readBackup(): Promise<string | null> {
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
  exportFile(contents: string): Promise<boolean> {
    this.exported = contents;
    return Promise.resolve(true);
  }
  importFile(): Promise<string | null> {
    return Promise.resolve(this.candidate);
  }
}

class MemoryLease implements InstanceLease {
  acquired = 0;
  released = 0;
  refused = false;
  acquire(): Promise<void> {
    this.acquired += 1;
    return this.refused ? Promise.reject(new Error('already open')) : Promise.resolve();
  }
  release() {
    this.released += 1;
  }
}

async function settle() {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
}

describe('game runtime persistence boundaries', () => {
  it('retries the exact offline candidate and never settles an old gap twice', async () => {
    const storage = new MemoryStorage(savedState({ toolCounts: { cart: 1 }, totalGathered: 20 }));
    const lease = new MemoryLease();
    let now = 20 * 60 * 60 * 1_000;
    const runtime = createGameRuntime(definition, storage, lease, () => now);
    storage.failNext = true;
    await expect(runtime.start()).rejects.toThrow('disk full');
    const candidate = runtime.getSnapshot().state;
    expect(candidate?.balance).toBe(14_400);
    expect(candidate?.lastSimulatedAt).toBe(now);
    expect(runtime.getSnapshot().isDirty).toBe(true);
    now += 10_000;
    await runtime.start();
    expect(storage.readCount).toBe(1);
    expect(lease.acquired).toBe(1);
    expect(runtime.getSnapshot().state).toBe(candidate);
    expect(runtime.getSnapshot().isDirty).toBe(false);
    runtime.dispose();
    await settle();
    const reopened = createGameRuntime(definition, storage, new MemoryLease(), () => now - 10_000);
    await reopened.start();
    expect(reopened.getSnapshot().state?.balance).toBe(14_400);
    reopened.dispose();
  });

  it('obtains exclusive ownership before reading or writing', async () => {
    const storage = new MemoryStorage();
    const lease = new MemoryLease();
    lease.refused = true;
    const runtime = createGameRuntime(definition, storage, lease, () => 0);
    await expect(runtime.start()).rejects.toThrow('already open');
    expect(storage.readCount).toBe(0);
    expect(storage.writes).toHaveLength(0);
    expect(runtime.getSnapshot().status).toBe('error');
    runtime.dispose();
  });

  it('keeps damaged and incompatible saves instead of silently starting a new game', async () => {
    for (const contents of [
      'broken json',
      JSON.stringify({ ...savedState(), schemaVersion: 99 }),
      JSON.stringify({ ...savedState(), contentVersion: 'older-rules' }),
    ]) {
      const storage = new MemoryStorage(contents);
      const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => 1_000);
      await expect(runtime.start()).rejects.toThrow();
      expect(storage.main).toBe(contents);
      expect(storage.writes).toHaveLength(0);
      expect(runtime.getSnapshot().state).toBeNull();
      runtime.dispose();
    }
  });

  it('settles production at the old rate before purchasing, then immediately queues persistence', async () => {
    let now = 0;
    const storage = new MemoryStorage(
      savedState({ balance: 23, totalGathered: 43, toolCounts: { cart: 1 } }),
    );
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => now);
    await runtime.start();
    now = 2_000;
    const result = await runtime.dispatch({ kind: 'buy-tool', toolId: 'cart' });
    expect(result.ok).toBe(true);
    expect(result.state.balance).toBe(0);
    expect(result.state.totalGathered).toBe(44);
    expect(result.state.toolCounts.cart).toBe(2);
    await settle();
    expect(decodeSave(storage.main!, definition).toolCounts.cart).toBe(2);
    runtime.dispose();
  });

  it('does not clear newer dirty memory when an older snapshot is acknowledged', async () => {
    let now = 0;
    const storage = new MemoryStorage();
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => now);
    await runtime.start();
    storage.gate = deferred<void>();
    const gate = storage.gate;
    now = 5_000;
    await runtime.dispatch({ kind: 'collect' });
    const savedRevision = runtime.getSnapshot().revision;
    await runtime.dispatch({ kind: 'collect' });
    expect(runtime.getSnapshot().revision).toBeGreaterThan(savedRevision);
    gate.resolve();
    await settle();
    expect(decodeSave(storage.main!, definition).balance).toBe(1);
    expect(runtime.getSnapshot().state?.balance).toBe(2);
    expect(runtime.getSnapshot().isDirty).toBe(true);
    await runtime.flush();
    expect(runtime.getSnapshot().isDirty).toBe(false);
    runtime.dispose();
  });

  it('keeps successful purchases in memory after a failed save and flush retries them', async () => {
    const storage = new MemoryStorage(savedState({ balance: 20, totalGathered: 20 }));
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => 0);
    await runtime.start();
    storage.failNext = true;
    expect((await runtime.dispatch({ kind: 'buy-tool', toolId: 'cart' })).ok).toBe(true);
    await settle();
    expect(runtime.getSnapshot().state?.toolCounts.cart).toBe(1);
    expect(runtime.getSnapshot().isDirty).toBe(true);
    expect(runtime.getSnapshot().error).toContain('disk full');
    expect(decodeSave(storage.main!, definition).toolCounts.cart).toBe(0);
    await runtime.flush();
    expect(decodeSave(storage.main!, definition).toolCounts.cart).toBe(1);
    expect(runtime.getSnapshot().isDirty).toBe(false);
    runtime.dispose();
  });

  it('saves a fixed barrier revision and rejects new ticks until the window operation finishes', async () => {
    let now = 0;
    const storage = new MemoryStorage(savedState({ totalGathered: 20, toolCounts: { cart: 1 } }));
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => now);
    await runtime.start();
    const writeGate = deferred<void>();
    storage.gate = writeGate;
    const windowGate = deferred<void>();
    let operationRan = false;
    now = 2_000;
    const barrier = runtime.withSaveBarrier(async () => {
      operationRan = true;
      await windowGate.promise;
    });
    await settle();
    now = 6_000;
    await expect(runtime.dispatch({ kind: 'tick' })).rejects.toThrow('正在保存');
    expect(runtime.getSnapshot().state?.balance).toBe(1);
    expect(operationRan).toBe(false);
    writeGate.resolve();
    await settle();
    expect(operationRan).toBe(true);
    expect(decodeSave(storage.main!, definition).balance).toBe(1);
    windowGate.resolve();
    await barrier;
    expect(runtime.getSnapshot().state?.balance).toBe(3);
    expect(runtime.getSnapshot().isDirty).toBe(true);
    runtime.dispose();
  });

  it('does not hide on save failure and resumes production for time spent waiting', async () => {
    let now = 0;
    const storage = new MemoryStorage(savedState({ totalGathered: 20, toolCounts: { cart: 1 } }));
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => now);
    await runtime.start();
    const gate = deferred<void>();
    storage.gate = gate;
    storage.failNext = true;
    let hidden = false;
    now = 2_000;
    const barrier = runtime.withSaveBarrier(() => {
      hidden = true;
      return Promise.resolve();
    });
    const rejection = expect(barrier).rejects.toThrow('disk full');
    await settle();
    now = 6_000;
    gate.resolve();
    await rejection;
    expect(hidden).toBe(false);
    expect(runtime.getSnapshot().state?.balance).toBe(3);
    expect(runtime.getSnapshot().isDirty).toBe(true);
    await runtime.dispatch({ kind: 'collect' });
    expect(runtime.getSnapshot().state?.balance).toBe(4);
    runtime.dispose();
  });

  it('waits out old writes, backs up current memory, and allocates its own import revision', async () => {
    let now = 0;
    const storage = new MemoryStorage();
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => now);
    await runtime.start();
    const gate = deferred<void>();
    storage.gate = gate;
    now = 5_000;
    await runtime.dispatch({ kind: 'collect' });
    await runtime.dispatch({ kind: 'collect' });
    const previousRevision = runtime.getSnapshot().revision;
    storage.candidate = JSON.stringify({
      ...savedState({ balance: 100, totalGathered: 100, lastSimulatedAt: now }),
      revision: 999_999,
    });
    const imported = runtime.importSave();
    await settle();
    expect(runtime.getSnapshot().state?.balance).toBe(2);
    gate.resolve();
    expect(await imported).toBe(true);
    await settle();
    expect(runtime.getSnapshot().revision).toBe(previousRevision + 1);
    expect(runtime.getSnapshot().state?.balance).toBe(100);
    expect(decodeSave(storage.main!, definition).balance).toBe(100);
    expect(decodeSave(storage.backup!, definition).balance).toBe(2);
    expect(runtime.getSnapshot().isDirty).toBe(false);
    runtime.dispose();
  });

  it('retains the current save and memory when the candidate write fails', async () => {
    const storage = new MemoryStorage(savedState({ balance: 5, totalGathered: 5 }));
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => 0);
    await runtime.start();
    storage.candidate = encodeSave(savedState({ balance: 100, totalGathered: 100 }));
    const originalWrite = storage.write.bind(storage);
    storage.write = async (contents) => {
      if (decodeSave(contents, definition).balance === 100) throw new Error('candidate failed');
      await originalWrite(contents);
    };
    await expect(runtime.importSave()).rejects.toThrow('candidate failed');
    expect(runtime.getSnapshot().state?.balance).toBe(5);
    expect(decodeSave(storage.main!, definition).balance).toBe(5);
    runtime.dispose();
  });

  it('cancels queued old saves replaced by the import barrier snapshot', async () => {
    const storage = new MemoryStorage(savedState({ balance: 100, totalGathered: 100 }));
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => 0);
    await runtime.start();
    const gate = deferred<void>();
    storage.gate = gate;
    await runtime.dispatch({ kind: 'buy-tool', toolId: 'cart' });
    await runtime.dispatch({ kind: 'buy-tool', toolId: 'cart' });
    storage.candidate = encodeSave(savedState({ balance: 1_000, totalGathered: 1_000 }));
    const imported = runtime.importSave();
    await settle();
    expect(storage.writes).toHaveLength(2);
    gate.resolve();
    await imported;
    expect(storage.writes).toHaveLength(4);
    expect(decodeSave(storage.backup!, definition).toolCounts.cart).toBe(2);
    expect(decodeSave(storage.main!, definition).balance).toBe(1_000);
    runtime.dispose();
  });

  it('opens the file picker synchronously before waiting for a slow old save', async () => {
    let now = 0;
    const storage = new MemoryStorage();
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => now);
    await runtime.start();
    const gate = deferred<void>();
    storage.gate = gate;
    now = 5_000;
    await runtime.dispatch({ kind: 'collect' });
    let pickerCalled = false;
    storage.importFile = () => {
      pickerCalled = true;
      return Promise.resolve(
        encodeSave(savedState({ balance: 100, totalGathered: 100, lastSimulatedAt: now })),
      );
    };
    const importing = runtime.importSave();
    expect(pickerCalled).toBe(true);
    await settle();
    expect(runtime.getSnapshot().state?.balance).toBe(1);
    gate.resolve();
    expect(await importing).toBe(true);
    expect(runtime.getSnapshot().state?.balance).toBe(100);
    runtime.dispose();
  });

  it('handles an early picker rejection while an old save is pending and releases the barrier afterward', async () => {
    let now = 0;
    const storage = new MemoryStorage();
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => now);
    await runtime.start();
    const gate = deferred<void>();
    storage.gate = gate;
    now = 5_000;
    await runtime.dispatch({ kind: 'collect' });
    storage.importFile = () => Promise.reject(new Error('picker refused'));
    const importing = runtime.importSave();
    const rejection = expect(importing).rejects.toThrow('picker refused');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(runtime.dispatch({ kind: 'collect' })).rejects.toThrow('正在保存');
    gate.resolve();
    await rejection;
    expect(runtime.getSnapshot().state?.balance).toBe(1);
    expect((await runtime.dispatch({ kind: 'collect' })).state.balance).toBe(2);
    runtime.dispose();
  });

  it('turns a synchronous picker exception into a rejected operation without blocking later play', async () => {
    const storage = new MemoryStorage();
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => 0);
    await runtime.start();
    storage.importFile = () => {
      throw new Error('native dialog failure');
    };
    const importing = runtime.importSave();
    await expect(importing).rejects.toThrow('native dialog failure');
    expect((await runtime.dispatch({ kind: 'collect' })).state.balance).toBe(1);
    runtime.dispose();
  });

  it('does not open a picker without a lease or during another active barrier', async () => {
    const storage = new MemoryStorage();
    let pickerCalls = 0;
    const selection = deferred<string | null>();
    storage.importFile = () => {
      pickerCalls += 1;
      return selection.promise;
    };
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => 0);
    await expect(runtime.importSave()).rejects.toThrow('独占权');
    expect(pickerCalls).toBe(0);
    await runtime.start();
    const importing = runtime.importSave();
    await expect(runtime.importSave()).rejects.toThrow('正在进行');
    expect(pickerCalls).toBe(1);
    selection.resolve(null);
    expect(await importing).toBe(false);
    expect((await runtime.dispatch({ kind: 'collect' })).state.balance).toBe(1);
    runtime.dispose();
  });

  it('does not issue autosaves more often than the five-second interval for ordinary collection', async () => {
    let now = 0;
    const storage = new MemoryStorage();
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => now);
    await runtime.start();
    for (now = 1_000; now <= 4_000; now += 1_000) await runtime.dispatch({ kind: 'collect' });
    await settle();
    expect(storage.writes).toHaveLength(1);
    await runtime.dispatch({ kind: 'tick' });
    await settle();
    expect(storage.writes).toHaveLength(2);
    runtime.dispose();
  });

  it('retains the exclusive lease until an already-started save has finished', async () => {
    let now = 0;
    const storage = new MemoryStorage();
    const lease = new MemoryLease();
    const runtime = createGameRuntime(definition, storage, lease, () => now);
    await runtime.start();
    const gate = deferred<void>();
    storage.gate = gate;
    now = 5_000;
    await runtime.dispatch({ kind: 'collect' });
    await settle();
    runtime.dispose();
    await settle();
    expect(lease.released).toBe(0);
    gate.resolve();
    await settle();
    expect(lease.released).toBe(1);
  });

  it('reports an overflowing offline settlement without granting or marking it as credited', async () => {
    const state = savedState({
      balance: Number.MAX_SAFE_INTEGER,
      totalGathered: Number.MAX_SAFE_INTEGER,
      toolCounts: { cart: 1 },
    });
    const storage = new MemoryStorage(state);
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => 10_000);
    await runtime.start();
    expect(runtime.getSnapshot().state?.balance).toBe(Number.MAX_SAFE_INTEGER);
    expect(runtime.getSnapshot().state?.lastSimulatedAt).toBe(0);
    expect(runtime.getSnapshot().error).toContain('安全上限');
    expect(await runtime.dispatch({ kind: 'collect' })).toMatchObject({
      ok: false,
      error: 'NUMERIC_LIMIT',
    });
    runtime.dispose();
  });

  it('recovers a validated backup without replacing it with the corrupt main save', async () => {
    const storage = new MemoryStorage('damaged main');
    storage.backup = encodeSave(
      savedState({ balance: 5, totalGathered: 25, toolCounts: { cart: 1 } }),
    );
    const validBackup = storage.backup;
    let now = 2_000;
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => now);
    await expect(runtime.start()).rejects.toThrow();
    storage.failNext = true;
    await expect(runtime.recoverBackup()).rejects.toThrow('disk full');
    expect(runtime.getSnapshot().state).toBeNull();
    expect(storage.main).toBe('damaged main');
    expect(storage.backup).toBe(validBackup);
    now = 10_000;
    await runtime.start();
    expect(runtime.getSnapshot().state?.balance).toBe(6);
    expect(runtime.getSnapshot().state?.lastSimulatedAt).toBe(2_000);
    expect(storage.backup).toBe(validBackup);
    expect(storage.readCount).toBe(1);
    runtime.dispose();
  });

  it('rejects an invalid backup without overwriting a corrupt main', async () => {
    const storage = new MemoryStorage('damaged main');
    storage.backup = JSON.stringify({ ...savedState(), claimedTaskIds: ['foreign'] });
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => 0);
    await expect(runtime.start()).rejects.toThrow();
    await expect(runtime.recoverBackup()).rejects.toThrow('未知 ID');
    expect(storage.main).toBe('damaged main');
    expect(storage.writes).toHaveLength(0);
    runtime.dispose();
  });

  it('exports a valid in-memory candidate even when its startup save failed', async () => {
    const storage = new MemoryStorage();
    storage.failNext = true;
    const runtime = createGameRuntime(definition, storage, new MemoryLease(), () => 0);
    await expect(runtime.start()).rejects.toThrow('disk full');
    expect(await runtime.exportSave()).toBe(true);
    expect(decodeSave(storage.exported!, definition)).toEqual(runtime.getSnapshot().state);
    expect(storage.writes).toHaveLength(1);
    expect(runtime.getSnapshot().isDirty).toBe(true);
    runtime.dispose();
  });
});
