/** Storage implementations must preserve the previous valid save on write failure. */
export interface SaveStorage {
  read(): Promise<string | null>;
  readBackup(): Promise<string | null>;
  write(contents: string, options?: { readonly preserveBackup?: boolean }): Promise<void>;
  exportFile(contents: string): Promise<boolean>;
  importFile(): Promise<string | null>;
}

export interface InstanceLease {
  acquire(): Promise<void>;
  release(): void;
}

export interface WindowPort {
  readonly isDesktop: boolean;
  setAlwaysOnTop(enabled: boolean): Promise<void>;
  /**
   * Resize the host window. Optional: a browser page cannot resize its own window, so the web
   * build omits it and only switches `data-mode`.
   */
  setSize?(width: number, height: number): Promise<void>;
  hide(): Promise<void>;
  show(): Promise<void>;
  requestExit(): Promise<void>;
  onCloseRequested(callback: () => Promise<void>): Promise<() => void>;
}

export interface PlatformPorts {
  readonly storage: SaveStorage;
  readonly instanceLease: InstanceLease;
  readonly window: WindowPort;
}
