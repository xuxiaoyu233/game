import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserSaveStorage } from './browser-save-storage';

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());

describe('browser transaction storage', () => {
  it('writes the prototype profile without reading or replacing the previous browser save', async () => {
    const legacyFactory = indexedDB;
    const legacyOpen = legacyFactory.open('outpost-web-development-v1', 1);
    legacyOpen.onupgradeneeded = () => legacyOpen.result.createObjectStore('snapshots');
    const legacyDatabase = await new Promise<IDBDatabase>((resolve, reject) => {
      legacyOpen.onsuccess = () => resolve(legacyOpen.result);
      legacyOpen.onerror = () =>
        reject(legacyOpen.error ?? new Error('Cannot open legacy database'));
    });
    await new Promise<void>((resolve, reject) => {
      const transaction = legacyDatabase.transaction('snapshots', 'readwrite');
      transaction.objectStore('snapshots').put('legacy-save', 'main');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('Cannot write legacy database'));
    });

    const storage = new BrowserSaveStorage();
    expect(await storage.read()).toBeNull();
    await storage.write('prototype-save');
    expect(await storage.read()).toBe('prototype-save');

    const oldRead = legacyDatabase
      .transaction('snapshots', 'readonly')
      .objectStore('snapshots')
      .get('main');
    expect(
      await new Promise<unknown>((resolve, reject) => {
        oldRead.onsuccess = () => resolve(oldRead.result);
        oldRead.onerror = () => reject(oldRead.error ?? new Error('Cannot read legacy save'));
      }),
    ).toBe('legacy-save');
    legacyDatabase.close();
  });

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
