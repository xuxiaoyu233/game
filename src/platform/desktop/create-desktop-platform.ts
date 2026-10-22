import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { PlatformPorts } from '../ports';

const EXIT_REQUESTED_EVENT = 'zhujie-rescue-bureau://exit-requested';

/** Loaded only by the desktop factory; the web entry never imports native APIs. */
export async function createDesktopPlatform(): Promise<PlatformPorts> {
  const nativeWindow = getCurrentWindow();
  // Establish native IPC before the runtime begins reading a save.
  await nativeWindow.isVisible();

  return {
    storage: {
      read: () => invoke<string | null>('save_read'),
      readBackup: () => invoke<string | null>('save_read_backup'),
      write: (contents, options) =>
        invoke<void>('save_write', { contents, preserveBackup: options?.preserveBackup ?? false }),
      exportFile: (contents) => invoke<boolean>('save_export_file', { contents }),
      importFile: () => invoke<string | null>('save_import_file'),
    },
    // The Rust plugin acquires the process-wide lease before setup or save reads.
    instanceLease: {
      acquire: () => Promise.resolve(),
      release: () => {},
    },
    window: {
      isDesktop: true,
      setAlwaysOnTop: (enabled) => nativeWindow.setAlwaysOnTop(enabled),
      // Logical pixels so the strip keeps its 280x72 CSS size on high-DPI screens.
      setSize: (width, height) => nativeWindow.setSize(new LogicalSize(width, height)),
      hide: () => nativeWindow.hide(),
      show: async () => {
        await nativeWindow.unminimize();
        await nativeWindow.show();
        await nativeWindow.setFocus();
      },
      // The caller must first await its save barrier; only this command exits.
      requestExit: () => invoke<void>('exit_app'),
      onCloseRequested: async (callback) => {
        let running: Promise<void> | null = null;
        let exitPending = false;
        let disposed = false;

        const runBarrier = (exit: boolean): Promise<void> => {
          if (disposed) return Promise.resolve();
          exitPending ||= exit;
          if (running !== null) return running;
          running = Promise.resolve()
            .then(callback)
            .then(async () => {
              if (exitPending && !disposed) await invoke<void>('exit_app');
            })
            .finally(() => {
              running = null;
              exitPending = false;
            });
          return running;
        };

        const stopClose = await nativeWindow.onCloseRequested((event) => {
          // Prevent synchronously, before the asynchronous save starts.
          event.preventDefault();
          return runBarrier(false);
        });
        let stopTray: (() => void) | undefined;
        try {
          stopTray = await listen(EXIT_REQUESTED_EVENT, () => {
            void runBarrier(true).catch((error: unknown) => {
              // The lifecycle callback reports save failures in the UI. This
              // void native event also needs a rejection handler of its own.
              console.error('保存并退出失败，技能放置原型仍在运行。', error);
            });
          });
        } catch (error) {
          stopClose();
          throw error;
        }

        return () => {
          disposed = true;
          stopClose();
          stopTray?.();
        };
      },
    },
  };
}
