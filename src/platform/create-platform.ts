import type { PlatformPorts } from './ports';

/** Build-time selection keeps the web build free of native calls. */
export async function createPlatform(): Promise<PlatformPorts> {
  const environment = import.meta.env.DEV ? 'development' : 'release';
  if (__APP_TARGET__ === 'desktop') {
    const { createDesktopPlatform } = await import('./desktop/create-desktop-platform');
    return createDesktopPlatform();
  }
  const [{ BrowserSaveStorage }, { BrowserInstanceLease }, { BrowserWindowPort }] =
    await Promise.all([
      import('./browser/browser-save-storage'),
      import('./browser/browser-instance-lease'),
      import('./browser/browser-window-port'),
    ]);
  return {
    storage: new BrowserSaveStorage(`skill-prototype-v1-${environment}`),
    instanceLease: new BrowserInstanceLease(`skill-prototype-v1:${environment}:save`),
    window: new BrowserWindowPort(),
  };
}
