import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
  close: null as ((event: { preventDefault(): void }) => Promise<void> | void) | null,
  tray: null as (() => void) | null,
  stopClose: vi.fn(),
  stopTray: vi.fn(),
  window: {
    setAlwaysOnTop: vi.fn(),
    hide: vi.fn(),
    isVisible: vi.fn(),
    show: vi.fn(),
    unminimize: vi.fn(),
    setFocus: vi.fn(),
    onCloseRequested: vi.fn(),
  },
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: native.listen }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => native.window }));

import { createDesktopPlatform } from './create-desktop-platform';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  native.close = null;
  native.tray = null;
  native.invoke.mockResolvedValue(undefined);
  native.listen.mockImplementation((_event: string, handler: () => void) => {
    native.tray = handler;
    return Promise.resolve(native.stopTray);
  });
  native.window.onCloseRequested.mockImplementation(
    (handler: (event: { preventDefault(): void }) => Promise<void> | void) => {
      native.close = handler;
      return Promise.resolve(native.stopClose);
    },
  );
});

describe('desktop save and exit barrier', () => {
  it('prevents close immediately and keeps the process alive after a failed save', async () => {
    const platform = await createDesktopPlatform();
    const preventDefault = vi.fn();
    const failedSave = vi.fn(() => {
      expect(preventDefault).toHaveBeenCalledOnce();
      return Promise.reject(new Error('disk locked'));
    });
    await platform.window.onCloseRequested(failedSave);

    const close = native.close;
    if (close === null) throw new Error('missing close handler');
    const pending = close({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    await expect(pending).rejects.toThrow('disk locked');
    expect(native.invoke).not.toHaveBeenCalledWith('exit_app');
  });

  it('coalesces close and tray requests and exits only when the save barrier resolves', async () => {
    const platform = await createDesktopPlatform();
    let finishSave: (() => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        }),
    );
    await platform.window.onCloseRequested(save);
    const close = native.close;
    const tray = native.tray;
    if (close === null || tray === null) throw new Error('missing native handlers');

    const closing = close({ preventDefault: vi.fn() });
    tray();
    await Promise.resolve();

    expect(save).toHaveBeenCalledOnce();
    expect(native.invoke).not.toHaveBeenCalledWith('exit_app');
    finishSave?.();
    await closing;
    expect(native.invoke).toHaveBeenCalledExactlyOnceWith('exit_app');
  });

  it('does not exit on a failed tray save and allows retry', async () => {
    const platform = await createDesktopPlatform();
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('disk full'))
      .mockResolvedValueOnce(undefined);
    await platform.window.onCloseRequested(save);
    const tray = native.tray;
    if (tray === null) throw new Error('missing tray handler');
    const reportError = vi.spyOn(console, 'error').mockImplementation(() => {});

    tray();
    await vi.waitFor(() =>
      expect(reportError).toHaveBeenCalledWith(
        '保存并退出失败，诸界救援局仍在运行。',
        expect.objectContaining({ message: 'disk full' }),
      ),
    );
    expect(native.invoke).not.toHaveBeenCalledWith('exit_app');
    tray();
    await vi.waitFor(() => expect(native.invoke).toHaveBeenCalledExactlyOnceWith('exit_app'));
  });

  it('cleans up a partially registered listener and unregisters both listeners', async () => {
    const platform = await createDesktopPlatform();
    native.listen.mockRejectedValueOnce(new Error('event registration failed'));
    await expect(platform.window.onCloseRequested(() => Promise.resolve())).rejects.toThrow(
      'event registration failed',
    );
    expect(native.stopClose).toHaveBeenCalledOnce();

    const stop = await platform.window.onCloseRequested(() => Promise.resolve());
    stop();
    expect(native.stopClose).toHaveBeenCalledTimes(2);
    expect(native.stopTray).toHaveBeenCalledOnce();
  });
});
