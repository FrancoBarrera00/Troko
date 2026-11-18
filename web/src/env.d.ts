/// <reference types="vite/client" />

export interface TrokoElectronBridge {
  readonly isElectron: true;
  readonly platform?: string;
  setInteractive: (interactive: boolean) => void;
  quitApp: () => void;
  hideWindow: () => void;
}

declare global {
  interface Window {
    trokoElectron?: TrokoElectronBridge;
  }
}
