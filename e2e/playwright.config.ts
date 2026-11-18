import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(e2eDir, '..');

const explicitBaseUrl = process.env.BASE_URL || process.env.TROKO_BASE_URL;
const rawPort = process.env.TROKO_E2E_PORT ?? '4173';
const port = Number(rawPort);
if (!rawPort.trim() || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error(
    `Invalid TROKO_E2E_PORT "${rawPort}": must be an integer between 1 and 65535`,
  );
}
const baseURL = explicitBaseUrl || `http://127.0.0.1:${port}`;

const serverDistCandidates = [
  path.join(repoRoot, 'server', 'dist', 'index.js'),
  path.join(repoRoot, 'server', 'dist', 'server', 'src', 'index.js'),
];
const resolvedServerEntry = serverDistCandidates.find((p) => fs.existsSync(p));
const hasBuiltServer = Boolean(resolvedServerEntry);

const rootPkgPath = path.join(repoRoot, 'package.json');
let hasRootStartScript = false;
if (fs.existsSync(rootPkgPath)) {
  try {
    const rawPkg = fs.readFileSync(rootPkgPath, 'utf8');
    const parsedPkg = JSON.parse(rawPkg) as { scripts?: Record<string, string> };
    hasRootStartScript = Boolean(parsedPkg.scripts?.start);
  } catch {
    hasRootStartScript = false;
  }
}

const isListMode = process.argv.some(
  (arg) => arg === '--list' || arg.startsWith('--list='),
);
const shouldLaunchWebServer =
  !isListMode &&
  !explicitBaseUrl &&
  (hasBuiltServer || (hasRootStartScript && process.env.TROKO_E2E_USE_NPM_START === '1'));

let webServer:
  | {
      command: string;
      cwd: string;
      url: string;
      reuseExistingServer: boolean;
      timeout: number;
      env: Record<string, string>;
    }
  | undefined;

if (shouldLaunchWebServer) {
  const tmpDir =
    process.env.TROKO_E2E_TMP_DIR ||
    fs.mkdtempSync(path.join(os.tmpdir(), 'troko-e2e-'));
  process.env.TROKO_E2E_TMP_DIR = tmpDir;

  const dataDir = path.join(tmpDir, 'data');
  const dbPath = path.join(dataDir, 'troko-e2e.db');
  const desktopDir = path.join(tmpDir, 'desktop-sandbox');

  process.env.TROKO_E2E_DB_PATH = dbPath;
  process.env.TROKO_E2E_DESKTOP_DIR = desktopDir;

  const launchCommand = resolvedServerEntry
    ? `mkdir -p "${dataDir}" "${desktopDir}" && node "${resolvedServerEntry}"`
    : `mkdir -p "${dataDir}" "${desktopDir}" && npm --prefix "${repoRoot}" start`;

  webServer = {
    command: launchCommand,
    cwd: repoRoot,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      TROKO_DATA_DIR: dataDir,
      DATA_DIR: dataDir,
      TROKO_DB_PATH: dbPath,
      DB_PATH: dbPath,
      SQLITE_PATH: dbPath,
      TROKO_DESKTOP_DIR: desktopDir,
      DESKTOP_SANDBOX_DIR: desktopDir,
      DESKTOP_DIR: desktopDir,
    },
  };
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: {
    timeout: 7_500,
  },
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL,
    headless: true,
    viewport: { width: 1280, height: 800 },
    locale: 'es-ES',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
  ...(webServer ? { webServer } : {}),
});
