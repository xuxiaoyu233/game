import type { PrototypeRuntime } from '../SkillPrototypeApp';

export interface SaveMenuProps {
  readonly runtime: PrototypeRuntime;
  readonly ready: boolean;
  readonly busy: boolean;
  readonly onOperate: (operation: () => Promise<unknown>, success?: string) => void;
}

export function SaveMenu({ runtime, ready, busy, onOperate }: SaveMenuProps) {
  return (
    <details className="skill-prototype-save-menu">
      <summary>本地存档</summary>
      <div>
        <button
          className="quiet-button"
          disabled={busy || !ready}
          onClick={() => onOperate(() => runtime.flush(), '存档已保存。')}
        >
          立即保存
        </button>
        <button
          className="quiet-button"
          disabled={busy || !ready}
          onClick={() => onOperate(() => runtime.exportSave())}
        >
          导出
        </button>
        <button
          className="quiet-button"
          disabled={busy || !ready}
          onClick={() => onOperate(() => runtime.importSave())}
        >
          导入兼容存档
        </button>
        <button
          className="quiet-button"
          disabled={busy || !ready}
          onClick={() => onOperate(() => runtime.recoverBackup(), '已从备份恢复。')}
        >
          恢复备份
        </button>
      </div>
    </details>
  );
}
