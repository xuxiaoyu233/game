import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserSaveStorage } from './browser-save-storage';

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

describe('browser transaction storage', () => {
  it('commits main and the immediately preceding save together', async () => {
    const storage = new BrowserSaveStorage('transaction-test');
    expect(await storage.read()).toBeNull();
    await storage.write('first');
    expect(await storage.readBackup()).toBeNull();
    await storage.write('second');
    expect(await storage.read()).toBe('second');
    expect(await storage.readBackup()).toBe('first');
  });

  it('rolls back both main and backup if the candidate transaction aborts', async () => {
    const storage = new BrowserSaveStorage('abort-test');
    await storage.write('first');
    await storage.write('second');
    const originalPut = Reflect.get(IDBObjectStore.prototype, 'put');
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = originalPut.call(this, value, key);
      if (key === 'main' && value === 'candidate') this.transaction.abort();
      return request;
    });
    await expect(storage.write('candidate')).rejects.toThrow();
    spy.mockRestore();
    expect(await storage.read()).toBe('second');
    expect(await storage.readBackup()).toBe('first');
  });

  it('preserves a good backup when replacing a corrupt main during explicit recovery', async () => {
    const storage = new BrowserSaveStorage('preserve-backup-test');
    await storage.write('good-backup');
    await storage.write('corrupt-main');
    await storage.write('recovered-main', { preserveBackup: true });
    expect(await storage.read()).toBe('recovered-main');
    expect(await storage.readBackup()).toBe('good-backup');
  });
});
