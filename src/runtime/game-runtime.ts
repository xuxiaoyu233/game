import type { InstanceLease, SaveStorage } from '../platform/ports';

export interface RuntimeSnapshot<State, Summary> {
  readonly status: 'loading' | 'ready' | 'error';
  readonly state: State | null;
  readonly summary: Summary | null;
  readonly isDirty: boolean;
  readonly error: string | null;
  readonly revision: number;
}

export type RuntimeActionResult<State, ErrorCode extends string> =
  | { readonly ok: true; readonly state: State }
  | { readonly ok: false; readonly state: State; readonly error: ErrorCode };

/** Domain rules plug into the one lifecycle, action queue, save queue, and recovery barrier. */
export interface RuntimeDomain<Definition, State, Command, Summary, ErrorCode extends string> {
  readonly validateDefinition: (definition: Definition) => void;
  readonly createNewState: (definition: Definition, now: number) => State;
  readonly advanceTime: (
    state: State,
    definition: Definition,
    now: number,
  ) => { readonly state: State; readonly error?: ErrorCode };
  /** Capture domain-specific, acknowledgement-only facts around startup/offline settlement. */
  readonly prepareStartupState?: (before: State, advanced: State, definition: Definition) => State;
  readonly applyCommand: (
    state: State,
    definition: Definition,
    command: Command,
  ) => RuntimeActionResult<State, ErrorCode>;
  readonly getSummary: (state: State, definition: Definition) => Summary;
  readonly decodeSave: (contents: string, definition: Definition) => State;
  readonly encodeSave: (state: State) => string;
  readonly isNumericLimit: (error: ErrorCode) => boolean;
  readonly numericLimitError: ErrorCode;
  readonly isImmediateCommand: (command: Command) => boolean;
}

/** 通用 Runtime：不带默认域类型参数。旧域接线见 `runtime/legacy/legacy-game-domain.ts`。 */
const AUTOSAVE_INTERVAL_MS = 5_000;
const NUMERIC_LIMIT_MESSAGE = '生产数值已达安全上限，本次额外收益未发放；请导出存档保留当前进度。';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class GameRuntime<Definition, State, Command, Summary, ErrorCode extends string> {
  private snapshot: RuntimeSnapshot<State, Summary> = {
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
  private startupCandidate: State | null = null;
  private startupRevision: number | null = null;
  private startupPreserveBackup = false;
  private startupWarning: string | null = null;
  private mainIsInvalid = false;
  private leaseAcquired = false;
  private paused = false;
  private disposed = false;

  constructor(
    private readonly definition: Definition,
    private readonly storage: SaveStorage,
    private readonly lease: InstanceLease,
    private readonly clock: () => number,
    private readonly domain: RuntimeDomain<Definition, State, Command, Summary, ErrorCode>,
  ) {}

  readonly getSnapshot = (): RuntimeSnapshot<State, Summary> => this.snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(patch: Partial<RuntimeSnapshot<State, Summary>> = {}): void {
    const updated = { ...this.snapshot, ...patch };
    this.snapshot = {
      ...updated,
      isDirty: updated.state !== null && updated.revision !== this.savedRevision,
    };
    for (const listener of this.listeners) listener();
  }

  private commit(state: State, error: string | null = this.snapshot.error): void {
    if (state === this.snapshot.state) {
      if (error !== this.snapshot.error) this.publish({ error });
      return;
    }
    this.publish({
      state,
      summary: this.domain.getSummary(state, this.definition),
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

  private requireReady(): State {
    this.ensureActive();
    if (this.snapshot.status !== 'ready' || this.snapshot.state === null)
      throw new Error('游戏尚未完成存档恢复，请先重试加载。');
    return this.snapshot.state;
  }

  private advanceCurrent(): boolean {
    const state = this.requireReady();
    const advanced = this.domain.advanceTime(state, this.definition, this.clock());
    this.commit(
      advanced.state,
      advanced.error !== undefined && this.domain.isNumericLimit(advanced.error)
        ? NUMERIC_LIMIT_MESSAGE
        : this.snapshot.error,
    );
    return advanced.error === undefined || !this.domain.isNumericLimit(advanced.error);
  }

  start(): Promise<void> {
    return this.enqueue(async () => {
      this.ensureActive();
      if (this.snapshot.status === 'ready') return;
      this.publish({ status: 'loading', error: null });
      try {
        this.domain.validateDefinition(this.definition);
        if (!this.leaseAcquired) {
          await this.lease.acquire();
          this.leaseAcquired = true;
          this.ensureActive();
        }
        if (this.startupCandidate === null) {
          const contents = await this.storage.read();
          this.ensureActive();
          let state: State;
          try {
            state =
              contents === null
                ? this.domain.createNewState(this.definition, this.clock())
                : this.domain.decodeSave(contents, this.definition);
            this.mainIsInvalid = false;
          } catch (error) {
            this.mainIsInvalid = true;
            throw error;
          }
          const advanced = this.domain.advanceTime(state, this.definition, this.clock());
          this.startupCandidate =
            advanced.error === undefined
              ? (this.domain.prepareStartupState?.(state, advanced.state, this.definition) ??
                advanced.state)
              : advanced.state;
          this.startupWarning =
            advanced.error !== undefined && this.domain.isNumericLimit(advanced.error)
              ? NUMERIC_LIMIT_MESSAGE
              : null;
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
          summary: this.domain.getSummary(candidate, this.definition),
          revision,
          error: this.startupWarning,
        });
      } catch (error) {
        if (!this.disposed) this.publish({ status: 'error', error: errorMessage(error) });
        throw error;
      }
    });
  }

  dispatch(command: Command): Promise<RuntimeActionResult<State, ErrorCode>> {
    if (this.paused) return Promise.reject(new Error('正在保存或导入存档，请稍后操作。'));
    return this.enqueue((): RuntimeActionResult<State, ErrorCode> => {
      this.requireReady();
      if (!this.advanceCurrent()) {
        const state = this.requireReady();
        this.maybeSave(this.domain.isImmediateCommand(command));
        return { ok: false, state, error: this.domain.numericLimitError };
      }
      const result = this.domain.applyCommand(this.requireReady(), this.definition, command);
      this.commit(result.state);
      const important = result.ok && this.domain.isImmediateCommand(command);
      this.maybeSave(important);
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

  private saveSnapshot(state: State, revision: number, preserveBackup = false): Promise<void> {
    const generation = this.saveGeneration;
    this.lastSaveRequestedRevision = revision;
    const result = this.saveQueue.then(async () => {
      this.ensureActive();
      if (generation !== this.saveGeneration) return;
      try {
        await this.storage.write(this.domain.encodeSave(state), { preserveBackup });
        this.savedRevision = revision;
        if (!this.disposed)
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
        if (!this.disposed && this.snapshot.status === 'ready') {
          this.advanceCurrent();
        }
        this.paused = false;
      }
    });
  }

  exportSave(): Promise<boolean> {
    return this.runBarrier(async () => {
      if (this.snapshot.status === 'ready') this.advanceCurrent();
      const state = this.snapshot.state;
      if (state === null) throw new Error('没有经过校验的游戏进度可导出。');
      // A manual backup must remain available even when the main-save device is full or unavailable.
      return this.storage.exportFile(this.domain.encodeSave(state));
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
      const decoded = this.domain.decodeSave(contents, this.definition);
      const advanced = this.domain.advanceTime(decoded, this.definition, this.clock());
      if (advanced.error !== undefined && this.domain.isNumericLimit(advanced.error))
        throw new Error(NUMERIC_LIMIT_MESSAGE);
      const candidate =
        this.domain.prepareStartupState?.(decoded, advanced.state, this.definition) ??
        advanced.state;
      await this.replaceFromSave(candidate);
      return true;
    }, true);
  }

  recoverBackup(): Promise<boolean> {
    return this.runBarrier(async () => {
      const contents = await this.storage.readBackup();
      if (contents === null) throw new Error('没有可恢复的备份存档。原存档已保留。');
      const decoded = this.domain.decodeSave(contents, this.definition);
      const advanced = this.domain.advanceTime(decoded, this.definition, this.clock());
      if (advanced.error !== undefined && this.domain.isNumericLimit(advanced.error))
        throw new Error(NUMERIC_LIMIT_MESSAGE);
      if (this.snapshot.status === 'ready') this.advanceCurrent();
      const candidate =
        this.domain.prepareStartupState?.(decoded, advanced.state, this.definition) ??
        advanced.state;
      await this.replaceFromSave(candidate);
      return true;
    }, true);
  }

  private async replaceFromSave(candidate: State): Promise<void> {
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
    await this.storage.write(this.domain.encodeSave(candidate), { preserveBackup });
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
      summary: this.domain.getSummary(candidate, this.definition),
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

export function createConfiguredGameRuntime<
  Definition,
  State,
  Command,
  Summary,
  ErrorCode extends string,
>(
  definition: Definition,
  storage: SaveStorage,
  lease: InstanceLease,
  domain: RuntimeDomain<Definition, State, Command, Summary, ErrorCode>,
  clock: () => number = Date.now,
): GameRuntime<Definition, State, Command, Summary, ErrorCode> {
  return new GameRuntime(definition, storage, lease, clock, domain);
}
