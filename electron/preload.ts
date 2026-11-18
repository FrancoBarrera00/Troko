import { contextBridge, ipcRenderer } from 'electron';

export interface TrokoDesktopInfo {
  hotkey: string;
  openAtLogin: boolean;
  platform: string;
}

export interface TrokoElectronApi {
  readonly isElectron: true;
  readonly platform: string;
  readonly hotkey: string;
  setInteractive: (interactive: boolean) => void;
  quitApp: () => void;
  hideWindow: () => void;
  getDesktopInfo: () => Promise<TrokoDesktopInfo>;
  setAutoLaunch: (enabled: boolean) => Promise<boolean>;
  notify: (title: string, body: string) => void;
  openExternal: (url: string) => Promise<boolean>;
  onSummoned: (listener: () => void) => () => void;
  getActiveWindow: () => Promise<{ title: string } | null>;
}

const defaultHotkey = process.platform === 'darwin' ? 'Option+Space' : 'Alt+Space';

const trokoElectronApi: TrokoElectronApi = {
  isElectron: true,
  platform: process.platform,
  hotkey: defaultHotkey,
  setInteractive: (interactive: boolean) => {
    ipcRenderer.send('troko:set-interactive', Boolean(interactive));
  },
  quitApp: () => {
    ipcRenderer.send('troko:quit');
  },
  hideWindow: () => {
    ipcRenderer.send('troko:hide');
  },
  getDesktopInfo: () => ipcRenderer.invoke('troko:get-desktop-info') as Promise<TrokoDesktopInfo>,
  setAutoLaunch: (enabled: boolean) =>
    ipcRenderer.invoke('troko:set-auto-launch', Boolean(enabled)) as Promise<boolean>,
  notify: (title: string, body: string) => {
    ipcRenderer.send('troko:notify', { title, body });
  },
  openExternal: (url: string) =>
    ipcRenderer.invoke('troko:open-external', url) as Promise<boolean>,
  onSummoned: (listener: () => void) => {
    const wrapped = () => listener();
    ipcRenderer.on('troko:summoned', wrapped);
    return () => {
      ipcRenderer.off('troko:summoned', wrapped);
    };
  },
  getActiveWindow: () =>
    ipcRenderer.invoke('troko:get-active-window') as Promise<{ title: string } | null>,
};

contextBridge.exposeInMainWorld('trokoElectron', trokoElectronApi);
