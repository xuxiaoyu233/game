import type { WindowPort } from '../ports';

export class BrowserWindowPort implements WindowPort {
  readonly isDesktop = false;

  private unsupported(): Promise<never> {
    return Promise.reject(new Error('网页试玩不支持置顶、托盘和原生退出；这些功能需要桌面版。'));
  }

  setAlwaysOnTop(_enabled: boolean): Promise<void> {
    return this.unsupported();
  }
  hide(): Promise<void> {
    return this.unsupported();
  }
  show(): Promise<void> {
    return this.unsupported();
  }
  requestExit(): Promise<void> {
    return this.unsupported();
  }
  onCloseRequested(_callback: () => Promise<void>): Promise<() => void> {
    return this.unsupported();
  }
}
