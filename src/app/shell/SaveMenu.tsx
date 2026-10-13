import type { PrototypeRuntime } from '../skill-prototype-types';

interface SaveMenuProps {
  readonly runtime: PrototypeRuntime;
  readonly busy: boolean;
  readonly ready: boolean;
  readonly operate: (operation: () => Promise<unknown>, success?: string) => void;
}

/** 本地存档菜单：立即保存、导出、导入兼容存档、恢复备份。 */

export function SaveMenu({ runtime, busy, ready, operate }: SaveMenuProps) {
  return (
    <details className="skill-prototype-save-menu">
      <summary>本地存档</summary>
      <div>
        <button
          className="quiet-button"
          disabled={busy || !ready}
          onClick={() => operate(() => runtime.flush(), '存档已保存。')}
        >
          立即保存
        </button>
        <button
          className="quiet-button"
          disabled={busy || !ready}
          onClick={() => operate(() => runtime.exportSave())}
        >
          导出
        </button>
        <button
          className="quiet-button"
          disabled={busy || !ready}
          onClick={() => operate(() => runtime.importSave())}
        >
          导入兼容存档
        </button>
        <button
          className="quiet-button"
          disabled={busy || !ready}
          onClick={() => operate(() => runtime.recoverBackup(), '已从备份恢复。')}
        >
          恢复备份
        </button>
      </div>
    </details>
  );
}
