/// <reference types="vite/client" />

export interface TrokoDesktopInfo {
  hotkey: string;
  openAtLogin: boolean;
  platform: string;
}

export interface TrokoElectronBridge {
  readonly isElectron: true;
  readonly platform?: string;
  readonly hotkey?: string;
  setInteractive: (interactive: boolean) => void;
  quitApp: () => void;
  hideWindow: () => void;
  getDesktopInfo?: () => Promise<TrokoDesktopInfo>;
  setAutoLaunch?: (enabled: boolean) => Promise<boolean>;
  notify?: (title: string, body: string) => void;
  openExternal?: (url: string) => Promise<boolean>;
  onSummoned?: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    trokoElectron?: TrokoElectronBridge;
  }
}
