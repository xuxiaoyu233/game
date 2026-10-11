import type { SaveStorage } from '../ports';

const STORE = 'snapshots';
const MAIN = 'main';
const BACKUP = 'backup';
const MAX_IMPORT_BYTES = 1_048_576;

/** Browser saves are separate from desktop files. A single transaction commits main and its prior backup. */
export class BrowserSaveStorage implements SaveStorage {
  private databasePromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly databaseName = 'outpost-web-development-v1') {}

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise !== null) return this.databasePromise;
    if (typeof indexedDB === 'undefined')
      return Promise.reject(new Error('当前浏览器不支持 IndexedDB，无法保存进度。'));
    this.databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.databaseName, 1);
      let settled = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE))
          request.result.createObjectStore(STORE);
      };
      request.onblocked = () => {
        settled = true;
        reject(new Error('本地存档数据库被旧标签页占用，请关闭其他游戏标签页后重试。'));
      };
      request.onerror = () => {
        settled = true;
        reject(request.error ?? new Error('无法打开浏览器存档数据库。'));
      };
      request.onsuccess = () => {
        const database = request.result;
        if (settled) {
          database.close();
          return;
        }
        database.onversionchange = () => {
          database.close();
          this.databasePromise = null;
        };
        resolve(database);
      };
    }).catch((error: unknown) => {
      this.databasePromise = null;
      throw error;
    });
    return this.databasePromise;
  }

  private async readKey(key: string): Promise<string | null> {
    const database = await this.open();
    return new Promise<string | null>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readonly');
      const request = transaction.objectStore(STORE).get(key);
      request.onsuccess = () => {
        const contents: unknown = request.result;
        if (contents === undefined) resolve(null);
        else if (typeof contents === 'string') resolve(contents);
        else reject(new Error('浏览器存档损坏，已保留原始数据。'));
      };
      request.onerror = () => reject(request.error ?? new Error('读取浏览器存档失败。'));
      transaction.onabort = () => reject(transaction.error ?? new Error('读取浏览器存档已中止。'));
    });
  }

  read(): Promise<string | null> {
    return this.readKey(MAIN);
  }
  readBackup(): Promise<string | null> {
    return this.readKey(BACKUP);
  }

  async write(contents: string, options?: { readonly preserveBackup?: boolean }): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      const request = store.get(MAIN);
      request.onsuccess = () => {
        const previous: unknown = request.result;
        if (typeof previous === 'string' && options?.preserveBackup !== true)
          store.put(previous, BACKUP);
        store.put(contents, MAIN);
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error('浏览器存档事务失败，旧存档仍然保留。'));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('浏览器存档失败，旧存档仍然保留。'));
    });
  }

  exportFile(contents: string): Promise<boolean> {
    const blob = new Blob([contents], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `前哨站存档-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Revoke after the browser has accepted the download navigation.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return Promise.resolve(true);
  }

  importFile(): Promise<string | null> {
    return new Promise<string | null>((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      let settled = false;
      const cleanup = () => {
        window.removeEventListener('focus', onFocus);
        input.remove();
      };
      const finish = (contents: string | null) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(contents);
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error(String(error)));
      };
      const onFocus = () => {
        // Older browsers lack the input cancel event. Allow a pending change event to run first.
        setTimeout(() => {
          if (input.files?.length === 0) finish(null);
        }, 300);
      };
      input.addEventListener('cancel', () => finish(null), { once: true });
      input.addEventListener(
        'change',
        () => {
          const file = input.files?.[0];
          if (file === undefined) {
            finish(null);
            return;
          }
          if (file.size > MAX_IMPORT_BYTES) {
            fail(new Error('存档文件超过 1 MiB，无法导入。'));
            return;
          }
          void file.text().then(finish, fail);
        },
        { once: true },
      );
      window.addEventListener('focus', onFocus, { once: true });
      document.body.append(input);
      try {
        if (navigator.userActivation?.isActive === false) {
          throw new Error('文件选择已失去点击授权，请再次点击“导入存档”。');
        }
        if (typeof input.showPicker === 'function') input.showPicker();
        else {
          if (navigator.userActivation?.isActive !== true) {
            throw new Error('当前浏览器无法确认文件选择授权，请使用新版 Edge/Chrome 或桌面版。');
          }
          input.click();
        }
      } catch (error) {
        fail(
          error instanceof Error && error.name === 'NotAllowedError'
            ? new Error('文件选择已失去点击授权，请再次点击“导入存档”。')
            : error,
        );
      }
    });
  }
}
