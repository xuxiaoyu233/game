import {
  advanceExpedition,
  applyExpeditionCommand,
  createExpedition,
  getExpeditionSummary,
} from '../../domain/legacy/expedition/engine';
import type {
  ExpeditionActionResult,
  ExpeditionCommand,
  ExpeditionDefinition,
  SaveBundle,
  ExpeditionSummary,
} from '../../domain/legacy/expedition/types';
import { validateExpeditionDefinition } from '../../domain/legacy/expedition/validation';
import type { GameDefinition } from '../../domain/legacy/types';
import type { ExpeditionDefinition as Version2Definition } from '../../domain/legacy/expedition/v2-types';
import {
  decodeExpeditionSave,
  encodeExpeditionSave,
} from '../../persistence/legacy/expedition-codec';
import type { InstanceLease, SaveStorage } from '../../platform/ports';

export interface ExpeditionRuntimeSnapshot {
  readonly status: 'loading' | 'ready' | 'error';
  readonly state: SaveBundle | null;
  readonly summary: ExpeditionSummary | null;
  readonly isDirty: boolean;
  readonly error: string | null;
  readonly revision: number;
}

const AUTOSAVE_INTERVAL_MS = 5_000;
const NUMERIC_LIMIT_MESSAGE = '游戏数值已达安全上限，本次动作未执行；请导出存档保留当前进度。';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ExpeditionRuntime {
  private snapshot: ExpeditionRuntimeSnapshot = {
    status: 'loading',
    state: null,
    summary: null,
    isDirty: false,
    error: null,
    revision: 0,
  };
  private readonly listeners = new Set<() => void>();
  private actionQueue: Promise<void> = Promise.resolve();
  private saveQueue: Promise<void> = Promise.resolve();
  private savedRevision = 0;
  private saveGeneration = 0;
  private lastSaveScheduledAt = 0;
  private lastSaveRequestedRevision = -1;
  private startupCandidate: SaveBundle | null = null;
  private startupRevision: number | null = null;
  private startupPreserveBackup = false;
  private startupWarning: string | null = null;
  private mainIsInvalid = false;
  private leaseAcquired = false;
  private paused = false;
  private disposed = false;

  constructor(
    private readonly definition: ExpeditionDefinition,
    private readonly storage: SaveStorage,
    private readonly lease: InstanceLease,
    private readonly clock: () => number,
    private readonly legacyDefinition: GameDefinition,
    private readonly previousDefinition?: Version2Definition,
    private readonly previousV3Definition?: ExpeditionDefinition,
    private readonly previousV4Definition?: ExpeditionDefinition,
    private readonly previousV5Definition?: ExpeditionDefinition,
    private readonly previousV6Definition?: ExpeditionDefinition,
    private readonly previousV7Definition?: ExpeditionDefinition,
    private readonly previousV8Definition?: ExpeditionDefinition,
    private readonly previousV9Definition?: ExpeditionDefinition,
    private readonly previousV10Definition?: ExpeditionDefinition,
    private readonly previousV11Definition?: ExpeditionDefinition,
    private readonly previousV13Definition?: ExpeditionDefinition,
    private readonly randomSeed: () => number = () => Math.floor(Math.random() * 0x1_0000_0000),
  ) {}

  readonly getSnapshot = (): ExpeditionRuntimeSnapshot => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<ExpeditionRuntimeSnapshot> = {}): void {
    const updated = { ...this.snapshot, ...patch };
    this.snapshot = {
      ...updated,
      isDirty: updated.state !== null && updated.revision !== this.savedRevision,
    };
    for (const listener of this.listeners) listener();
  }

  private commit(state: SaveBundle, error: string | null = this.snapshot.error): void {
    if (state === this.snapshot.state) {
      if (error !== this.snapshot.error) this.publish({ error });
      return;
    }
    this.publish({
      state,
      summary: getExpeditionSummary(state, this.definition),
      revision: this.snapshot.revision + 1,
      error,
    });
  }

  private enqueue<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.actionQueue.then(operation);
    this.actionQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error('游戏运行器已关闭。');
  }

  private requireReady(): SaveBundle {
    this.ensureActive();
    if (this.snapshot.status !== 'ready' || this.snapshot.state === null)
      throw new Error('游戏尚未完成存档恢复，请先重试加载。');
    return this.snapshot.state;
  }

  private advanceCurrent(): void {
    const state = this.requireReady();
    try {
      this.commit(advanceExpedition(state, this.definition, this.clock()));
    } catch (error) {
      this.publish({ error: errorMessage(error) });
      throw error;
    }
  }

  start(): Promise<void> {
    return this.enqueue(async () => {
      this.ensureActive();
      if (this.snapshot.status === 'ready') return;
      this.publish({ status: 'loading', error: null });
      try {
        validateExpeditionDefinition(this.definition);
        if (!this.leaseAcquired) {
          await this.lease.acquire();
          this.leaseAcquired = true;
          this.ensureActive();
        }
        if (this.startupCandidate === null) {
          const contents = await this.storage.read();
          this.ensureActive();
          let state: SaveBundle;
          try {
            state =
              contents === null
                ? createExpedition(this.definition, this.clock())
                : decodeExpeditionSave(
                    contents,
                    this.definition,
                    this.legacyDefinition,
                    this.previousDefinition,
                    this.clock(),
                    this.previousV3Definition,
                    this.previousV4Definition,
                    this.previousV5Definition,
                    this.previousV6Definition,
                    this.previousV7Definition,
                    this.previousV8Definition,
                    this.previousV9Definition,
                    this.previousV10Definition,
                    this.previousV11Definition,
                    this.previousV13Definition,
                  );
            this.mainIsInvalid = false;
          } catch (error) {
            this.mainIsInvalid = true;
            throw error;
          }
          this.startupCandidate = advanceExpedition(state, this.definition, this.clock());
          this.startupWarning = null;
          this.commit(this.startupCandidate, this.startupWarning);
          this.startupRevision = this.snapshot.revision;
        }
        // Retain this exact candidate on failure. Retrying start must not repeat offline settlement.
        const candidate = this.startupCandidate;
        const revision = this.startupRevision ?? this.snapshot.revision;
        await this.saveSnapshot(candidate, revision, this.startupPreserveBackup);
        this.ensureActive();
        this.startupCandidate = null;
        this.startupRevision = null;
        this.startupPreserveBackup = false;
        this.mainIsInvalid = false;
        this.lastSaveScheduledAt = this.clock();
        this.publish({
          status: 'ready',
          state: candidate,
          summary: getExpeditionSummary(candidate, this.definition),
          revision,
          error: this.startupWarning,
        });
      } catch (error) {
        if (!this.disposed) this.publish({ status: 'error', error: errorMessage(error) });
        throw error;
      }
    });
  }

  dispatch(command: ExpeditionCommand): Promise<ExpeditionActionResult> {
    if (this.paused) return Promise.reject(new Error('正在保存或导入存档，请稍后操作。'));
    return this.enqueue(async (): Promise<ExpeditionActionResult> => {
      this.requireReady();
      this.advanceCurrent();
      const runtimeCommand =
        command.kind === 'enter-world' && command.seed === undefined
          ? { ...command, seed: this.randomSeed() }
          : command;
      const result = applyExpeditionCommand(this.requireReady(), this.definition, runtimeCommand);
      const important = result.ok && command.kind !== 'tick' && command.kind !== 'gather';
      if (important && result.state !== this.snapshot.state) {
        // Profile changes, entry, buildings and battle outcomes become visible only after their atomic save.
        this.saveGeneration += 1;
        this.lastSaveRequestedRevision = -1;
        await this.saveQueue;
        this.ensureActive();
        const revision = this.snapshot.revision + 1;
        try {
          await this.saveSnapshot(result.state, revision);
          this.ensureActive();
          this.publish({
            state: result.state,
            summary: getExpeditionSummary(result.state, this.definition),
            revision,
            error: null,
          });
          this.lastSaveScheduledAt = this.clock();
        } catch (error) {
          if (!this.disposed)
            this.publish({
              error: `动作保存失败，尚未提交本次变化，可重试：${errorMessage(error)}`,
            });
          throw error;
        }
      } else {
        this.commit(
          result.state,
          !result.ok && result.error === 'NUMERIC_LIMIT'
            ? NUMERIC_LIMIT_MESSAGE
            : this.snapshot.error,
        );
        this.maybeSave(false);
      }
      return result;
    });
  }

  private maybeSave(immediate: boolean): void {
    if (!this.snapshot.isDirty) return;
    if (immediate || this.clock() - this.lastSaveScheduledAt >= AUTOSAVE_INTERVAL_MS) {
      const state = this.snapshot.state;
      if (state === null || this.lastSaveRequestedRevision === this.snapshot.revision) return;
      this.lastSaveScheduledAt = this.clock();
      void this.saveSnapshot(state, this.snapshot.revision).catch(() => undefined);
    }
  }

  private saveSnapshot(state: SaveBundle, revision: number, preserveBackup = false): Promise<void> {
    const generation = this.saveGeneration;
    this.lastSaveRequestedRevision = revision;
    const result = this.saveQueue.then(async () => {
      this.ensureActive();
      if (generation !== this.saveGeneration) return;
      try {
        await this.storage.write(encodeExpeditionSave(state), { preserveBackup });
        this.savedRevision = revision;
        if (!this.disposed && revision <= this.snapshot.revision)
          this.publish({
            error: this.snapshot.error === NUMERIC_LIMIT_MESSAGE ? NUMERIC_LIMIT_MESSAGE : null,
          });
      } catch (error) {
        this.lastSaveRequestedRevision = -1;
        if (!this.disposed)
          this.publish({ error: `保存失败，当前进度仍在内存中：${errorMessage(error)}` });
        throw error;
      }
    });
    this.saveQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  flush(): Promise<void> {
    if (this.paused) return Promise.reject(new Error('保存屏障正在执行，请稍后重试。'));
    return this.enqueue(async () => {
      this.requireReady();
      this.advanceCurrent();
      const state = this.requireReady();
      await this.saveSnapshot(state, this.snapshot.revision);
      this.lastSaveScheduledAt = this.clock();
    });
  }

  withSaveBarrier(operation: () => Promise<void>): Promise<void> {
    return this.runBarrier(async () => {
      this.advanceCurrent();
      await this.saveSnapshot(this.requireReady(), this.snapshot.revision);
      await operation();
    });
  }

  private runBarrier<T>(operation: () => Promise<T>, allowRecovery = false): Promise<T> {
    if (this.paused) return Promise.reject(new Error('已有存档或窗口操作正在进行。'));
    this.paused = true;
    return this.enqueue(async () => {
      try {
        this.ensureActive();
        if (!allowRecovery) this.requireReady();
        else if (!this.leaseAcquired) throw new Error('尚未取得存档独占权，不能导入或写入。');
        // Cancel queued stale snapshots; an already-started write must finish before the barrier writes.
        this.saveGeneration += 1;
        this.lastSaveRequestedRevision = -1;
        await this.saveQueue;
        this.ensureActive();
        return await operation();
      } catch (error) {
        if (!this.disposed) this.publish({ error: errorMessage(error) });
        throw error;
      } finally {
        try {
          if (!this.disposed && this.snapshot.status === 'ready') this.advanceCurrent();
        } finally {
          this.paused = false;
        }
      }
    });
  }

  exportSave(): Promise<boolean> {
    return this.runBarrier(async () => {
      if (this.snapshot.status === 'ready') this.advanceCurrent();
      const state = this.snapshot.state;
      if (state === null) throw new Error('没有经过校验的游戏进度可导出。');
      // A manual backup must remain available even when the main-save device is full or unavailable.
      return this.storage.exportFile(encodeExpeditionSave(state));
    }, true);
  }

  importSave(): Promise<boolean> {
    // Open the browser picker in the initiating click stack, before a slow old save can consume user activation.
    // Attach both handlers now: a picker rejection must not become unhandled while the barrier waits for old writes.
    let selection: Promise<
      | { readonly ok: true; readonly contents: string | null }
      | { readonly ok: false; readonly error: unknown }
    >;
    try {
      this.ensureActive();
      if (this.paused) throw new Error('已有存档或窗口操作正在进行。');
      if (!this.leaseAcquired) throw new Error('尚未取得存档独占权，不能导入或写入。');
      selection = this.storage.importFile().then(
        (contents) => ({ ok: true as const, contents }),
        (error: unknown) => ({ ok: false as const, error }),
      );
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return this.runBarrier(async () => {
      if (this.snapshot.status === 'ready') this.advanceCurrent();
      const selected = await selection;
      if (!selected.ok) throw selected.error;
      const contents = selected.contents;
      if (contents === null) return false;
      const decoded = decodeExpeditionSave(
        contents,
        this.definition,
        this.legacyDefinition,
        this.previousDefinition,
        this.clock(),
        this.previousV3Definition,
        this.previousV4Definition,
        this.previousV5Definition,
        this.previousV6Definition,
        this.previousV7Definition,
        this.previousV8Definition,
        this.previousV9Definition,
        this.previousV10Definition,
        this.previousV11Definition,
        this.previousV13Definition,
      );
      const advanced = advanceExpedition(decoded, this.definition, this.clock());
      await this.replaceFromSave(advanced);
      return true;
    }, true);
  }

  recoverBackup(): Promise<boolean> {
    return this.runBarrier(async () => {
      const contents = await this.storage.readBackup();
      if (contents === null) throw new Error('没有可恢复的备份存档。原存档已保留。');
      const decoded = decodeExpeditionSave(
        contents,
        this.definition,
        this.legacyDefinition,
        this.previousDefinition,
        this.clock(),
        this.previousV3Definition,
        this.previousV4Definition,
        this.previousV5Definition,
        this.previousV6Definition,
        this.previousV7Definition,
        this.previousV8Definition,
        this.previousV9Definition,
        this.previousV10Definition,
        this.previousV11Definition,
        this.previousV13Definition,
      );
      const advanced = advanceExpedition(decoded, this.definition, this.clock());
      if (this.snapshot.status === 'ready') this.advanceCurrent();
      await this.replaceFromSave(advanced);
      return true;
    }, true);
  }

  private async replaceFromSave(candidate: SaveBundle): Promise<void> {
    const previousState = this.snapshot.state;
    if (previousState !== null) await this.saveSnapshot(previousState, this.snapshot.revision);
    this.ensureActive();
    const revision = this.snapshot.revision + 1;
    const preserveBackup = previousState === null && this.mainIsInvalid;
    if (previousState === null) {
      // Recovery has no running state to roll back to. Keep an uncommitted candidate privately for start retry.
      this.startupCandidate = candidate;
      this.startupRevision = revision;
      this.startupPreserveBackup = preserveBackup;
      this.startupWarning = null;
    }
    // Storage.write atomically backs up its prior main save and commits the candidate.
    await this.storage.write(encodeExpeditionSave(candidate), { preserveBackup });
    this.ensureActive();
    this.savedRevision = revision;
    this.startupCandidate = null;
    this.startupRevision = null;
    this.startupPreserveBackup = false;
    this.startupWarning = null;
    this.mainIsInvalid = false;
    this.lastSaveScheduledAt = this.clock();
    this.lastSaveRequestedRevision = revision;
    this.publish({
      status: 'ready',
      state: candidate,
      summary: getExpeditionSummary(candidate, this.definition),
      revision,
      error: null,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.paused = true;
    this.saveGeneration += 1;
    this.listeners.clear();
    // Do not release exclusivity while a previously started write can still commit.
    void Promise.all([this.actionQueue, this.saveQueue]).then(() => this.lease.release());
  }
}

export function createExpeditionRuntime(
  definition: ExpeditionDefinition,
  storage: SaveStorage,
  lease: InstanceLease,
  clock: () => number,
  legacyDefinition: GameDefinition,
  previousDefinition?: Version2Definition,
  previousV3Definition?: ExpeditionDefinition,
  previousV4Definition?: ExpeditionDefinition,
  previousV5Definition?: ExpeditionDefinition,
  previousV6Definition?: ExpeditionDefinition,
  previousV7Definition?: ExpeditionDefinition,
  previousV8Definition?: ExpeditionDefinition,
  previousV9Definition?: ExpeditionDefinition,
  previousV10Definition?: ExpeditionDefinition,
  previousV11Definition?: ExpeditionDefinition,
  previousV13Definition?: ExpeditionDefinition,
  randomSeed?: () => number,
): ExpeditionRuntime {
  return new ExpeditionRuntime(
    definition,
    storage,
    lease,
    clock,
    legacyDefinition,
    previousDefinition,
    previousV3Definition,
    previousV4Definition,
    previousV5Definition,
    previousV6Definition,
    previousV7Definition,
    previousV8Definition,
    previousV9Definition,
    previousV10Definition,
    previousV11Definition,
    previousV13Definition,
    randomSeed,
  );
}
