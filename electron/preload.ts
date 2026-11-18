import { contextBridge, ipcRenderer } from 'electron';

export interface TrokoElectronApi {
  readonly isElectron: true;
  readonly platform: string;
  setInteractive: (interactive: boolean) => void;
  quitApp: () => void;
  hideWindow: () => void;
}

const trokoElectronApi: TrokoElectronApi = {
  isElectron: true,
  platform: process.platform,
  setInteractive: (interactive: boolean) => {
    ipcRenderer.send('troko:set-interactive', Boolean(interactive));
  },
  quitApp: () => {
    ipcRenderer.send('troko:quit');
  },
  hideWindow: () => {
    ipcRenderer.send('troko:hide');
  },
};

contextBridge.exposeInMainWorld('trokoElectron', trokoElectronApi);
