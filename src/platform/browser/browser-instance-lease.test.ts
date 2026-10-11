import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserInstanceLease } from './browser-instance-lease';

afterEach(() => vi.unstubAllGlobals());

describe('browser exclusive lease', () => {
  it('refuses browsers without an exclusive-lock facility', async () => {
    vi.stubGlobal('navigator', {});
    await expect(new BrowserInstanceLease().acquire()).rejects.toThrow('Web Locks');
  });

  it('refuses a second tab and allows it once the first tab has released its lock', async () => {
    let held = false;
    vi.stubGlobal('navigator', {
      locks: {
        async request(
          _name: string,
          _options: LockOptions,
          callback: (lock: Lock | null) => Promise<void>,
        ) {
          if (held) {
            await callback(null);
            return;
          }
          held = true;
          try {
            await callback({ name: 'test', mode: 'exclusive' });
          } finally {
            held = false;
          }
        },
      },
    });
    const first = new BrowserInstanceLease('test');
    const second = new BrowserInstanceLease('test');
    await first.acquire();
    await expect(second.acquire()).rejects.toThrow('另一个标签页');
    first.release();
    for (let step = 0; step < 4; step += 1) await Promise.resolve();
    await second.acquire();
    second.release();
  });
});
