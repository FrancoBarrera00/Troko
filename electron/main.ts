import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Troko-Desk Electron Wrapper (Dynamic Island / Notch Shell)
 * Renders an always-on-top, frameless, transparent overlay anchored to the top-center
 * of the primary display with click-through outside #island.
 */

export const TROKO_IPC_CHANNELS = {
  SET_INTERACTIVE: 'troko:set-interactive',
  HIDE: 'troko:hide',
  QUIT: 'troko:quit',
} as const;

export interface ElectronWindowOptions {
  width: number;
  height: number;
  x: number;
  y: number;
  frame: boolean;
  transparent: boolean;
  backgroundColor: string;
  alwaysOnTop: boolean;
  hasShadow: boolean;
  resizable: boolean;
  skipTaskbar: boolean;
  webPreferences: {
    contextIsolation: boolean;
    nodeIntegration: boolean;
    preload?: string;
  };
}

export function createTrokoNotchWindowConfig(
  screenWidth = 1440,
  preloadPath?: string
): ElectronWindowOptions {
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
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      ...(preloadPath ? { preload: preloadPath } : {}),
    },
  };
}

function normalizeEntryPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  try {
    return fs.realpathSync(resolved);
  } catch {
    return resolved;
  }
}

export function isMainEntrypoint(
  metaUrl = import.meta.url,
  argv1: string | null = process.argv[1] ?? null,
  versions: NodeJS.ProcessVersions = process.versions,
  defaultApp = (process as { defaultApp?: boolean }).defaultApp
): boolean {
  if (argv1) {
    try {
      const currentFile = normalizeEntryPath(fileURLToPath(metaUrl));
      const normalizedArgv1 = argv1.startsWith('file://') ? fileURLToPath(argv1) : argv1;
      const invokedFile = normalizeEntryPath(normalizedArgv1);
      return currentFile === invokedFile;
    } catch {
      return false;
    }
  }
  return Boolean(versions.electron) && !defaultApp;
}

function resolveFirstExisting(candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

async function waitForHealth(serverUrl: string, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const healthUrl = `${serverUrl.replace(/\/+$/, '')}/api/health`;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(healthUrl);
      if (res.ok) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`Troko backend did not become healthy within ${timeoutMs}ms at ${healthUrl}`);
}

interface EmbeddedBackendHandle {
  serverUrl: string;
  close: () => Promise<void>;
}

async function startEmbeddedBackend(
  userDataDir: string,
  appPath?: string
): Promise<EmbeddedBackendHandle> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  process.env['TROKO_DATA_DIR'] = userDataDir;

  const serverModulePath = resolveFirstExisting([
    path.resolve(currentDir, '../../server/dist/server/src/app.js'),
    path.resolve(currentDir, '../server/dist/server/src/app.js'),
    ...(appPath ? [path.resolve(appPath, 'server/dist/server/src/app.js')] : []),
  ]);

  if (!serverModulePath) {
    throw new Error('Could not locate compiled Troko server (server/dist/server/src/app.js)');
  }

  const staticDir = resolveFirstExisting([
    path.resolve(currentDir, '../../web/dist'),
    path.resolve(currentDir, '../web/dist'),
    ...(appPath ? [path.resolve(appPath, 'web/dist')] : []),
  ]);

  const serverMod = (await import(pathToFileURL(serverModulePath).href)) as {
    createApp: (config?: {
      dbPath?: string;
      staticDir?: string | null;
    }) => {
      listen: (port?: number, host?: string) => Promise<{ port: number; host: string }>;
      close: () => Promise<void>;
    };
  };

  const trokoApp = serverMod.createApp({
    dbPath: path.join(userDataDir, 'troko.db'),
    staticDir: staticDir ?? null,
  });

  const preferredPort = Number(process.env['PORT'] ?? 3000);
  let bound: { port: number; host: string };
  try {
    bound = await trokoApp.listen(preferredPort, '127.0.0.1');
  } catch {
    bound = await trokoApp.listen(0, '127.0.0.1');
  }

  return {
    serverUrl: `http://${bound.host}:${bound.port}`,
    close: () => trokoApp.close(),
  };
}

export async function bootElectronNotchShell(serverUrl?: string): Promise<void> {
  // Dynamic import so non-Electron environments can inspect this module safely
  const electronModule = await import('electron' as string).catch(() => null);
  if (!electronModule || !(electronModule as { app?: unknown }).app) {
    return;
  }

  const {
    app,
    BrowserWindow,
    screen,
    ipcMain,
    Tray,
    Menu,
    nativeImage,
    shell,
  } = electronModule as {
    app: {
      requestSingleInstanceLock: () => boolean;
      getPath: (name: string) => string;
      getAppPath: () => string;
      whenReady: () => Promise<void>;
      on: (event: string, listener: (...args: unknown[]) => void) => void;
      quit: () => void;
    };
    BrowserWindow: new (options: ElectronWindowOptions) => {
      loadURL: (url: string) => Promise<void>;
      setAlwaysOnTop: (flag: boolean, level?: string) => void;
      setVisibleOnAllWorkspaces: (
        visible: boolean,
        options?: { visibleOnFullScreen?: boolean }
      ) => void;
      setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => void;
      isVisible: () => boolean;
      isDestroyed: () => boolean;
      show: () => void;
      hide: () => void;
      focus: () => void;
      on: (event: string, listener: () => void) => void;
    };
    screen: {
      getPrimaryDisplay: () => { workAreaSize: { width: number; height: number } };
    };
    ipcMain: {
      on: (channel: string, listener: (_event: unknown, ...args: unknown[]) => void) => void;
    };
    Tray: new (image: unknown) => {
      setToolTip: (tip: string) => void;
      setContextMenu: (menu: unknown) => void;
      on: (event: string, listener: () => void) => void;
      destroy: () => void;
    };
    Menu: {
      buildFromTemplate: (
        template: Array<
          | { label: string; click: () => void }
          | { type: 'separator' }
        >
      ) => unknown;
    };
    nativeImage: {
      createFromPath: (path: string) => unknown;
      createEmpty: () => unknown;
    };
    shell: {
      openExternal: (url: string) => Promise<void>;
    };
  };

  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  await app.whenReady();

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const appPath = app.getAppPath();
  const explicitServerUrl = serverUrl ?? process.env['TROKO_SERVER_URL'];
  let backendHandle: EmbeddedBackendHandle | null = null;
  let resolvedServerUrl = explicitServerUrl ?? '';

  if (!resolvedServerUrl) {
    const userDataDir = app.getPath('userData');
    fs.mkdirSync(userDataDir, { recursive: true });
    backendHandle = await startEmbeddedBackend(userDataDir, appPath);
    resolvedServerUrl = backendHandle.serverUrl;
  }

  await waitForHealth(resolvedServerUrl);

  const preloadPath = resolveFirstExisting([
    path.resolve(currentDir, 'preload.cjs'),
    path.resolve(currentDir, 'dist/preload.cjs'),
    path.resolve(appPath, 'electron/dist/preload.cjs'),
  ]);

  const display = screen.getPrimaryDisplay();
  const config = createTrokoNotchWindowConfig(display.workAreaSize.width, preloadPath);
  const win = new BrowserWindow(config);

  win.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform !== 'win32' && typeof win.setVisibleOnAllWorkspaces === 'function') {
    try {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch {
      // Ignore on platforms where workspace pinning is unsupported
    }
  }
  win.setIgnoreMouseEvents(true, { forward: true });

  const toggleWindowVisibility = (): void => {
    if (win.isDestroyed()) return;
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  };

  let tray: InstanceType<typeof Tray> | null = null;
  const trayIconPath = resolveFirstExisting([
    path.resolve(currentDir, '../assets/tray-icon.png'),
    path.resolve(currentDir, 'assets/tray-icon.png'),
    path.resolve(appPath, 'electron/assets/tray-icon.png'),
  ]);
  const trayImage = trayIconPath
    ? nativeImage.createFromPath(trayIconPath)
    : nativeImage.createEmpty();

  let shuttingDown = false;
  const shutdownAndQuit = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    tray?.destroy();
    tray = null;
    if (backendHandle) {
      await backendHandle.close().catch(() => {});
      backendHandle = null;
    }
    app.quit();
  };

  tray = new Tray(trayImage);
  tray.setToolTip('Troko-Desk');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Mostrar/Ocultar Troko',
        click: toggleWindowVisibility,
      },
      {
        label: 'Abrir en navegador',
        click: () => {
          void shell.openExternal(resolvedServerUrl);
        },
      },
      { type: 'separator' },
      {
        label: 'Salir de Troko',
        click: () => {
          void shutdownAndQuit();
        },
      },
    ])
  );
  tray.on('click', toggleWindowVisibility);

  app.on('second-instance', () => {
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });

  ipcMain.on(TROKO_IPC_CHANNELS.SET_INTERACTIVE, (_event, interactive) => {
    if (!win.isDestroyed()) {
      win.setIgnoreMouseEvents(!Boolean(interactive), { forward: true });
    }
  });

  ipcMain.on(TROKO_IPC_CHANNELS.HIDE, () => {
    if (!win.isDestroyed()) {
      win.hide();
    }
  });

  ipcMain.on(TROKO_IPC_CHANNELS.QUIT, () => {
    void shutdownAndQuit();
  });

  app.on('before-quit', () => {
    if (!shuttingDown && backendHandle) {
      shuttingDown = true;
      void backendHandle.close().catch(() => {});
      backendHandle = null;
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      void shutdownAndQuit();
    }
  });

  await win.loadURL(resolvedServerUrl);
}

if (isMainEntrypoint()) {
  void bootElectronNotchShell();
}
