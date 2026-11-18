import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  TROKO_IPC_CHANNELS,
  bootElectronNotchShell,
  createTrokoNotchWindowConfig,
  isMainEntrypoint,
} from '../../electron/main.ts';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('M5 Electron Notch Shell & Packaging', () => {
  it('computes frameless transparent always-on-top top-center window config', () => {
    const defaultCfg = createTrokoNotchWindowConfig();
    assert.equal(defaultCfg.width, 740);
    assert.equal(defaultCfg.height, 640);
    assert.equal(defaultCfg.x, Math.round((1440 - 740) / 2));
    assert.equal(defaultCfg.y, 0);
    assert.equal(defaultCfg.frame, false);
    assert.equal(defaultCfg.transparent, true);
    assert.equal(defaultCfg.backgroundColor, '#00000000');
    assert.equal(defaultCfg.alwaysOnTop, true);
    assert.equal(defaultCfg.hasShadow, false);
    assert.equal(defaultCfg.resizable, false);
    assert.equal(defaultCfg.skipTaskbar, true);
    assert.equal(defaultCfg.webPreferences.contextIsolation, true);
    assert.equal(defaultCfg.webPreferences.nodeIntegration, false);
    assert.equal(defaultCfg.webPreferences.preload, undefined);

    const customCfg = createTrokoNotchWindowConfig(1920, '/app/electron/dist/preload.cjs');
    assert.equal(customCfg.x, Math.round((1920 - 740) / 2));
    assert.equal(customCfg.webPreferences.preload, '/app/electron/dist/preload.cjs');
  });

  it('exports expected IPC channel constants', () => {
    assert.deepEqual(TROKO_IPC_CHANNELS, {
      SET_INTERACTIVE: 'troko:set-interactive',
      HIDE: 'troko:hide',
      QUIT: 'troko:quit',
    });
  });

  it('guards entrypoint auto-boot so importing electron/main.ts in tests does not launch Electron', async () => {
    const mainPath = path.join(REPO_ROOT, 'electron/main.ts');
    const mainUrl = pathToFileURL(mainPath).href;

    // In node --test, argv[1] is not electron/main.ts
    assert.equal(isMainEntrypoint(mainUrl, process.argv[1]), false);

    // When invoked directly as entrypoint
    assert.equal(isMainEntrypoint(mainUrl, mainPath), true);

    // When invoked with a file:// URL
    assert.equal(isMainEntrypoint(mainUrl, mainUrl), true);

    // When invoked via a symlink to the entrypoint
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'troko-electron-symlink-'));
    try {
      const linkPath = path.join(tmpDir, 'main-link.ts');
      fs.symlinkSync(mainPath, linkPath);
      assert.equal(isMainEntrypoint(mainUrl, linkPath), true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // Packaged Electron app (no argv[1], electron version present, defaultApp falsy)
    assert.equal(
      isMainEntrypoint(
        mainUrl,
        null,
        { ...process.versions, electron: '45.0.0' } as NodeJS.ProcessVersions,
        false
      ),
      true
    );

    // Non-Electron without argv[1]
    assert.equal(isMainEntrypoint(mainUrl, null, process.versions, false), false);

    // Calling bootElectronNotchShell in Node environment returns cleanly without throwing
    await bootElectronNotchShell('http://127.0.0.1:4173');
  });

  it('includes valid PNG icon assets for tray and Windows packaging', () => {
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    for (const relPath of ['electron/assets/icon.png', 'electron/assets/tray-icon.png']) {
      const fullPath = path.join(REPO_ROOT, relPath);
      assert.equal(fs.existsSync(fullPath), true, `${relPath} should exist`);
      const bytes = fs.readFileSync(fullPath);
      assert.equal(bytes.subarray(0, 8).equals(pngMagic), true, `${relPath} must be a valid PNG`);
    }
  });

  it('defines preload bridge exposing window.trokoElectron contract', () => {
    const preloadTs = fs.readFileSync(path.join(REPO_ROOT, 'electron/preload.ts'), 'utf8');
    assert.match(preloadTs, /contextBridge\.exposeInMainWorld\(\s*'trokoElectron'/);
    assert.match(preloadTs, /isElectron:\s*true/);
    assert.match(preloadTs, /setInteractive/);
    assert.match(preloadTs, /quitApp/);
    assert.match(preloadTs, /hideWindow/);
  });
});
