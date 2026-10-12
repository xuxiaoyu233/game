import type { InstanceLease } from '../ports';

/** Refuse unsupported browsers rather than claiming that local persistence is exclusive. */
export class BrowserInstanceLease implements InstanceLease {
  private acquiring: Promise<void> | null = null;
  private releaseLock: (() => void) | null = null;

  constructor(private readonly name = 'skill-prototype-v1:development:save') {}

  acquire(): Promise<void> {
    if (this.releaseLock !== null) return Promise.resolve();
    if (this.acquiring !== null) return this.acquiring;
    const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
    if (locks === undefined) {
      return Promise.reject(
        new Error(
          '当前浏览器不支持 Web Locks，无法安全协调多个标签页。请使用新版 Edge/Chrome 或桌面版。',
        ),
      );
    }
    this.acquiring = new Promise<void>((resolve, reject) => {
      void locks
        .request(this.name, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
          if (lock === null) {
            reject(new Error('另一个标签页正在使用此存档。请关闭其他游戏标签页后重试。'));
            return;
          }
          await new Promise<void>((release) => {
            this.releaseLock = release;
            resolve();
          });
        })
        .catch(reject);
    }).finally(() => {
      this.acquiring = null;
    });
    return this.acquiring;
  }

  release(): void {
    this.releaseLock?.();
    this.releaseLock = null;
  }
}
