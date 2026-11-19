import fs from 'node:fs';
import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { createDatabase } from './db/database.ts';
import type { TrokoDatabase } from './db/database.ts';
import { EventBus } from './eventBus.ts';
import { registerAiRoutes } from './routes/ai.ts';
import { registerCoreRoutes } from './routes/core.ts';
import { registerHabitRoutes } from './routes/habits.ts';
import { registerOsToolsRoutes } from './routes/osTools.ts';
import { registerProductivityRoutes } from './routes/productivity.ts';
import { registerStudyGuardianRoutes } from './routes/studyGuardian.ts';
import { AiProviderService } from './services/aiProvider.ts';
import { AppLauncherService } from './services/appLauncherService.ts';
import { BridgeService } from './services/bridgeService.ts';
import { FocusAssistantService } from './services/focusAssistantService.ts';
import { GuardianService } from './services/guardianService.ts';
import { HabitService } from './services/habitService.ts';
import { MailerService } from './services/mailerService.ts';
import { NluService } from './services/nluService.ts';
import { NotesService } from './services/notesService.ts';
import { OrganizerService } from './services/organizerService.ts';
import { ProductivityService } from './services/productivityService.ts';
import { ProgressionService } from './services/progressionService.ts';
import { SettingsService } from './services/settingsService.ts';
import { StudyService } from './services/studyService.ts';

export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export interface RouteRequest {
  raw: IncomingMessage;
  method: string;
  pathname: string;
  query: URLSearchParams;
  params: Record<string, string>;
  readJson<T = unknown>(maxBytes?: number): Promise<T>;
}

export type RouteHandler = (req: RouteRequest, res: ServerResponse) => Promise<void> | void;

interface CompiledRoute {
  method: string;
  regex: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

export function sendJson(res: ServerResponse, status: number, data: unknown): void {
  if (res.writableEnded || res.destroyed) return;
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(body);
}

export function sendError(res: ServerResponse, status: number, errorMessage: string): void {
  sendJson(res, status, { ok: false, error: errorMessage });
}

function compilePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const escaped = pattern
    .split('/')
    .map((segment) => {
      if (segment.startsWith(':')) {
        const name = segment.slice(1);
        paramNames.push(name);
        return '([^/]+)';
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  return {
    regex: new RegExp(`^${escaped}$`),
    paramNames,
  };
}

export class Router {
  private readonly routes: CompiledRoute[] = [];

  private add(method: string, pattern: string, handler: RouteHandler): void {
    const { regex, paramNames } = compilePattern(pattern);
    this.routes.push({ method, regex, paramNames, handler });
  }

  get(pattern: string, handler: RouteHandler): void {
    this.add('GET', pattern, handler);
  }

  post(pattern: string, handler: RouteHandler): void {
    this.add('POST', pattern, handler);
  }

  patch(pattern: string, handler: RouteHandler): void {
    this.add('PATCH', pattern, handler);
  }

  delete(pattern: string, handler: RouteHandler): void {
    this.add('DELETE', pattern, handler);
  }

  async handle(
    raw: IncomingMessage,
    res: ServerResponse,
    url: URL
  ): Promise<boolean> {
    const method = (raw.method ?? 'GET').toUpperCase();

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return true;
    }

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.regex.exec(url.pathname);
      if (!match) continue;

      const params: Record<string, string> = {};
      for (let i = 0; i < route.paramNames.length; i += 1) {
        const key = route.paramNames[i];
        const val = match[i + 1];
        if (key !== undefined && val !== undefined) {
          params[key] = decodeURIComponent(val);
        }
      }

      const routeReq: RouteRequest = {
        raw,
        method,
        pathname: url.pathname,
        query: url.searchParams,
        params,
        async readJson<T = unknown>(maxBytes = 1_048_576): Promise<T> {
          const chunks: Buffer[] = [];
          let total = 0;
          for await (const chunk of raw) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            total += buf.byteLength;
            if (total > maxBytes) {
              throw new HttpError(413, 'Payload too large');
            }
            chunks.push(buf);
          }
          const rawText = Buffer.concat(chunks).toString('utf8').trim();
          if (rawText.length === 0) {
            return {} as T;
          }
          try {
            return JSON.parse(rawText) as T;
          } catch {
            throw new HttpError(400, 'Invalid JSON body');
          }
        },
      };

      await route.handler(routeReq, res);
      return true;
    }

    return false;
  }
}

export interface AppConfig {
  dbPath?: string;
  staticDir?: string | null;
  desktopDir?: string;
  version?: string;
  heartbeatMs?: number;
  getLooseDesktopFilesCount?: () => Promise<number> | number;
}

export interface ServerContext {
  readonly config: AppConfig;
  readonly db: TrokoDatabase;
  readonly eventBus: EventBus;
  readonly settingsService: SettingsService;
  readonly productivityService: ProductivityService;
  readonly habitService: HabitService;
  readonly organizerService: OrganizerService;
  readonly mailerService: MailerService;
  readonly appLauncherService: AppLauncherService;
  readonly bridgeService: BridgeService;
  readonly aiProvider: AiProviderService;
  readonly nluService: NluService;
  readonly notesService: NotesService;
  readonly progressionService: ProgressionService;
  readonly guardianService: GuardianService;
  readonly studyService: StudyService;
  readonly focusAssistantService: FocusAssistantService;
  readonly version: string;
  readonly startedAtMs: number;
  readonly getLooseDesktopFilesCount: () => Promise<number> | number;
}

export interface TrokoApp {
  readonly server: http.Server;
  readonly router: Router;
  readonly ctx: ServerContext;
  readonly db: TrokoDatabase;
  readonly eventBus: EventBus;
  readonly settingsService: SettingsService;
  readonly staticDir: string | null;
  listen(port?: number, host?: string): Promise<{ port: number; host: string }>;
  close(): Promise<void>;
}

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

function resolveDefaultDbPath(): string {
  if (process.env['NUKO_DB_PATH']) {
    return process.env['NUKO_DB_PATH'];
  }
  if (process.env['TROKO_DB_PATH']) {
    return process.env['TROKO_DB_PATH'];
  }
  const dataDir = process.env['NUKO_DATA_DIR'] ?? process.env['TROKO_DATA_DIR'];
  if (dataDir) {
    const nukoDb = path.join(dataDir, 'nuko.db');
    const legacyDb = path.join(dataDir, 'troko.db');
    if (!fs.existsSync(nukoDb) && fs.existsSync(legacyDb)) {
      try {
        fs.copyFileSync(legacyDb, nukoDb);
      } catch {
        return legacyDb;
      }
    }
    return nukoDb;
  }
  const cwd = process.cwd();
  const baseDir =
    path.basename(cwd) === 'server' &&
    fs.existsSync(path.resolve(cwd, '../package.json'))
      ? path.resolve(cwd, '../data')
      : path.resolve(cwd, 'data');
  const nukoDb = path.join(baseDir, 'nuko.db');
  const legacyDb = path.join(baseDir, 'troko.db');
  if (!fs.existsSync(nukoDb) && fs.existsSync(legacyDb)) {
    try {
      fs.copyFileSync(legacyDb, nukoDb);
    } catch {
      return legacyDb;
    }
  }
  return nukoDb;
}

function resolveStaticDir(explicit?: string | null): string | null {
  if (explicit === null) return null;
  if (explicit !== undefined) {
    const resolved = path.resolve(explicit);
    return fs.existsSync(path.join(resolved, 'index.html')) ? resolved : null;
  }

  const candidates = [
    path.resolve(import.meta.dirname, '../../web/dist'),
    path.resolve(import.meta.dirname, '../../../../web/dist'),
    path.resolve(process.cwd(), 'web/dist'),
    path.resolve(process.cwd(), '../web/dist'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }
  return null;
}

function serveFile(res: ServerResponse, filePath: string, method: string): void {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_MAP[ext] ?? 'application/octet-stream';
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': stat.size,
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

export function createApp(config: AppConfig = {}): TrokoApp {
  const version = config.version ?? '0.1.0';
  const dbPath = config.dbPath ?? resolveDefaultDbPath();
  const staticDir = resolveStaticDir(config.staticDir);
  const heartbeatMs = config.heartbeatMs ?? 15000;

  const db = createDatabase(dbPath, version);
  const eventBus = new EventBus();
  const settingsService = new SettingsService(db, eventBus);
  const productivityService = new ProductivityService(db, eventBus, settingsService);
  const habitService = new HabitService(db, eventBus);
  const organizerService = new OrganizerService(
    db,
    eventBus,
    settingsService,
    config.desktopDir
  );
  const appLauncherService = new AppLauncherService(db, eventBus);
  const mailerService = new MailerService(
    db,
    eventBus,
    () =>
      appLauncherService
        .listIntegrations()
        .find((item) => item.type === 'imap_smtp') ?? null
  );
  const aiProvider = new AiProviderService();
  const bridgeService = new BridgeService();
  const notesService = new NotesService(dbPath, eventBus);
  const progressionService = new ProgressionService(dbPath, eventBus);
  const guardianService = new GuardianService(dbPath, eventBus, progressionService);
  const studyService = new StudyService(
    dbPath,
    eventBus,
    settingsService,
    aiProvider,
    progressionService
  );
  const focusAssistantService = new FocusAssistantService({
    dbPath,
    db,
    eventBus,
    productivityService,
    guardianService,
    progressionService,
  });

  productivityService.setFocusHooks({
    onFocusStarted: (phase) => {
      if (phase === 'focus') {
        guardianService.resetSession();
      }
    },
    onFocusCompleted: (phase) => {
      if (phase === 'focus') {
        const clean = guardianService.getRuntime().sessionDistractions === 0;
        const xp = clean ? 80 : 60;
        progressionService.awardXp(
          xp,
          clean ? 'Bloque de enfoque limpio (con bonus)' : 'Bloque de enfoque completado',
          { cleanFocusBlock: clean, resetFocusStreak: !clean }
        );
        focusAssistantService.flushShieldedQueue(true);
      }
    },
    onFocusStopped: () => {
      focusAssistantService.flushShieldedQueue(true);
    },
    shouldDeferReminder: (reminder) =>
      focusAssistantService.shouldDeferDuringFocus({
        id: reminder.id,
        kind: 'reminder',
        title: reminder.title,
        originalAt: reminder.triggerAt,
      }),
  });

  const nluService = new NluService({
    db,
    eventBus,
    settingsService,
    productivityService,
    habitService,
    notesService,
    mailerService,
    organizerService,
    appLauncherService,
    aiProvider,
    bridgeService,
    focusAssistantService,
    studyService,
  });
  const router = new Router();

  const ctx: ServerContext = {
    config,
    db,
    eventBus,
    settingsService,
    productivityService,
    habitService,
    organizerService,
    mailerService,
    appLauncherService,
    bridgeService,
    aiProvider,
    nluService,
    notesService,
    progressionService,
    guardianService,
    studyService,
    focusAssistantService,
    version,
    startedAtMs: Date.now(),
    getLooseDesktopFilesCount:
      config.getLooseDesktopFilesCount ?? (() => organizerService.getLooseDesktopFilesCount()),
  };

  registerCoreRoutes(router, ctx);
  registerProductivityRoutes(router, ctx);
  registerHabitRoutes(router, ctx);
  registerAiRoutes(router, ctx);
  registerOsToolsRoutes(router, ctx);
  registerStudyGuardianRoutes(router, ctx);

  const server = http.createServer(async (req, res) => {
    try {
      const host = req.headers.host ?? '127.0.0.1';
      const url = new URL(req.url ?? '/', `http://${host}`);

      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        const matched = await router.handle(req, res, url);
        if (!matched) {
          sendError(res, 404, 'Not found');
        }
        return;
      }

      const method = (req.method ?? 'GET').toUpperCase();
      if ((method === 'GET' || method === 'HEAD') && staticDir !== null) {
        let decodedPath = '/';
        try {
          decodedPath = decodeURIComponent(url.pathname);
        } catch {
          sendError(res, 400, 'Invalid path encoding');
          return;
        }
        const relPath = decodedPath.replace(/^\/+/, '');
        const resolved = path.resolve(staticDir, relPath);
        if (resolved !== staticDir && !resolved.startsWith(staticDir + path.sep)) {
          sendError(res, 403, 'Forbidden');
          return;
        }

        if (relPath.length > 0 && fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          serveFile(res, resolved, method);
          return;
        }

        const indexFile = path.join(staticDir, 'index.html');
        if (fs.existsSync(indexFile)) {
          serveFile(res, indexFile, method);
          return;
        }
      }

      sendError(res, 404, 'Not found');
    } catch (err) {
      if (err instanceof HttpError) {
        sendError(res, err.status, err.message);
        return;
      }
      sendError(res, 500, 'Internal server error');
    }
  });

  let heartbeatTimer: NodeJS.Timeout | null = null;
  if (heartbeatMs > 0) {
    heartbeatTimer = setInterval(() => {
      eventBus.sendHeartbeat();
    }, heartbeatMs);
    heartbeatTimer.unref();
  }

  let closed = false;

  return {
    server,
    router,
    ctx,
    db,
    eventBus,
    settingsService,
    staticDir,
    listen(port = 3000, host = '127.0.0.1') {
      return new Promise((resolve, reject) => {
        const onError = (err: Error): void => {
          server.off('listening', onListening);
          reject(err);
        };
        const onListening = (): void => {
          server.off('error', onError);
          const addr = server.address();
          const actualPort = typeof addr === 'object' && addr !== null ? addr.port : port;
          resolve({ port: actualPort, host });
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, host);
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      if (heartbeatTimer !== null) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      productivityService.stop();
      nluService.stop();
      eventBus.close();
      if (server.listening) {
        server.closeAllConnections?.();
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
      }
      db.close();
    },
  };
}
