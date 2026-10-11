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
