/**
 * Troko-Desk Electron Wrapper (Dynamic Island / Notch Shell)
 * Renders an always-on-top, frameless, transparent overlay anchored to the top-center
 * of the primary display with click-through outside #island.
 */

export interface ElectronWindowOptions {
  width: number;
  height: number;
  x: number;
  y: number;
  frame: boolean;
  transparent: boolean;
  alwaysOnTop: boolean;
  hasShadow: boolean;
  resizable: boolean;
  skipTaskbar: boolean;
  webPreferences: {
    contextIsolation: boolean;
    nodeIntegration: boolean;
  };
}

export function createTrokoNotchWindowConfig(screenWidth = 1440): ElectronWindowOptions {
  const windowWidth = 740;
  const windowHeight = 640;
  const x = Math.round((screenWidth - windowWidth) / 2);

  return {
    width: windowWidth,
    height: windowHeight,
    x,
    y: 0,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  };
}

export async function bootElectronNotchShell(serverUrl = 'http://127.0.0.1:4173'): Promise<void> {
  // Dynamic import so non-Electron environments can inspect this module safely
  const electronModule = await import('electron' as string).catch(() => null);
  if (!electronModule) {
    return;
  }

  const { app, BrowserWindow, screen, ipcMain } = electronModule as {
    app: {
      whenReady: () => Promise<void>;
      on: (event: string, listener: () => void) => void;
    };
    BrowserWindow: new (options: ElectronWindowOptions) => {
      loadURL: (url: string) => Promise<void>;
      setAlwaysOnTop: (flag: boolean, level?: string) => void;
      setVisibleOnAllWorkspaces: (visible: boolean, options?: { visibleOnFullScreen?: boolean }) => void;
      setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void;
    };
    screen: {
      getPrimaryDisplay: () => { workAreaSize: { width: number; height: number } };
    };
    ipcMain: {
      on: (channel: string, listener: (_event: unknown, interactive: boolean) => void) => void;
    };
  };

  await app.whenReady();
  const display = screen.getPrimaryDisplay();
  const config = createTrokoNotchWindowConfig(display.workAreaSize.width);
  const win = new BrowserWindow(config);

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });

  ipcMain.on('troko:set-interactive', (_event, interactive: boolean) => {
    win.setIgnoreMouseEvents(!interactive, { forward: true });
  });

  await win.loadURL(serverUrl);
}
