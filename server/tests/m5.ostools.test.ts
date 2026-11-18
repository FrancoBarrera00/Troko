import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { createDatabase } from '../src/db/database.ts';
import { EventBus } from '../src/eventBus.ts';
import {
  AppLauncherService,
  PLATFORM_APP_COMMANDS,
  WHITELISTED_APPS,
} from '../src/services/appLauncherService.ts';
import { BridgeService } from '../src/services/bridgeService.ts';
import { MailerService } from '../src/services/mailerService.ts';
import { NluService } from '../src/services/nluService.ts';
import { OrganizerService } from '../src/services/organizerService.ts';
import { ProductivityService } from '../src/services/productivityService.ts';
import { SettingsService } from '../src/services/settingsService.ts';

interface CapturedHttpRequest {
  method: string;
  url: string;
  body: Record<string, unknown> | null;
}

const activeServers: http.Server[] = [];

async function startMockHttpServer(
  handler: (req: CapturedHttpRequest, res: http.ServerResponse) => void
): Promise<{ url: string; server: http.Server; requests: CapturedHttpRequest[] }> {
  const requests: CapturedHttpRequest[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      let body: Record<string, unknown> | null = null;
      if (raw.length > 0) {
        try {
          body = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          body = null;
        }
      }
      const captured: CapturedHttpRequest = {
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        body,
      };
      requests.push(captured);
      handler(captured, res);
    });
  });

  activeServers.push(server);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    server,
    requests,
  };
}

afterEach(async () => {
  while (activeServers.length > 0) {
    const srv = activeServers.pop();
    if (srv) {
      srv.closeAllConnections?.();
      await new Promise<void>((resolve) => srv.close(() => resolve()));
    }
  }
});

describe('M5 AppLauncherService (F17)', () => {
  it('launches whitelisted apps safely in test mode with osLaunched=false', () => {
    const db = createDatabase(':memory:');
    const eventBus = new EventBus();
    const launcher = new AppLauncherService(db, eventBus);

    const prevNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'test';
    try {
      for (const app of WHITELISTED_APPS) {
        const res = launcher.launchApp({ appName: app });
        assert.equal(res.ok, true);
        assert.equal(res.app, app);
        assert.equal(res.appName, app);
        assert.equal(res.osLaunched, false);
        assert.ok(res.launchedAt.length > 0);
      }
      const accentRes = launcher.launchApp({ appName: 'musica' });
      assert.equal(accentRes.appName, 'Música');
      assert.equal(accentRes.osLaunched, false);
    } finally {
      if (prevNodeEnv === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = prevNodeEnv;
      }
      eventBus.close();
      db.close();
    }
  });

  it('rejects shell injection payloads and non-whitelisted apps', () => {
    const db = createDatabase(':memory:');
    const eventBus = new EventBus();
    const launcher = new AppLauncherService(db, eventBus);

    try {
      const injections = [
        'Safari; touch /tmp/pwn',
        '/bin/sh -c id',
        '$(touch /tmp/pwn)',
        'Notas && ls',
        'Notas | cat',
      ];
      for (const payload of injections) {
        assert.throws(() => launcher.launchApp({ appName: payload }));
        assert.equal(launcher.resolveWhitelistedApp(payload), null);
      }

      for (const unknown of ['Terminal', 'Bash', 'PowerShell', 'cmd.exe']) {
        assert.throws(() => launcher.launchApp({ appName: unknown }));
        assert.equal(launcher.resolveWhitelistedApp(unknown), null);
      }
    } finally {
      eventBus.close();
      db.close();
    }
  });

  it('PLATFORM_APP_COMMANDS covers all 7 apps across win32/darwin/linux without shells', () => {
    const forbiddenShells = new Set(['cmd', 'cmd.exe', 'sh', 'bash', 'powershell', 'powershell.exe']);
    for (const platform of ['win32', 'darwin', 'linux'] as const) {
      const table = PLATFORM_APP_COMMANDS[platform];
      assert.ok(table, `Missing platform table for ${platform}`);
      for (const app of WHITELISTED_APPS) {
        const spec = table[app];
        assert.ok(spec, `Missing ${app} in ${platform}`);
        assert.ok(typeof spec.cmd === 'string' && spec.cmd.trim().length > 0);
        assert.ok(Array.isArray(spec.args));
        assert.equal(
          forbiddenShells.has(spec.cmd.toLowerCase()),
          false,
          `Forbidden shell ${spec.cmd} in ${platform}.${app}`
        );
      }
    }
  });
});

describe('M5 BridgeService (Weather, Tavily, Telegram)', () => {
  it('getWeather queries Open-Meteo geocoding + forecast and formats Spanish summary', async () => {
    const mock = await startMockHttpServer((req, res) => {
      if (req.url.startsWith('/v1/search')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            results: [
              {
                name: 'Madrid',
                country: 'España',
                latitude: 40.4165,
                longitude: -3.7026,
              },
            ],
          })
        );
        return;
      }
      if (req.url.startsWith('/v1/forecast')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            current: {
              temperature_2m: 22.4,
              apparent_temperature: 21.8,
              weather_code: 1,
              wind_speed_10m: 12.5,
            },
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const bridge = new BridgeService({
      geocodingBaseUrl: mock.url,
      forecastBaseUrl: mock.url,
    });

    const res = await bridge.getWeather('Madrid', 'metric');
    assert.equal(res.ok, true);
    assert.equal(res.city, 'Madrid');
    assert.equal(res.country, 'España');
    assert.equal(res.temperature, 22.4);
    assert.equal(res.unitSymbol, '°C');
    assert.equal(res.windUnit, 'km/h');
    assert.equal(res.weatherDescription, 'Mayormente despejado');
    assert.match(res.summary, /Madrid, España/);
    assert.match(res.summary, /22\.4°C/);
    assert.equal(mock.requests.length, 2);
  });

  it('getWeather handles errors and timeouts gracefully', async () => {
    const slowMock = await startMockHttpServer((_req, res) => {
      setTimeout(() => {
        if (!res.writableEnded) {
          res.writeHead(200);
          res.end('{}');
        }
      }, 250);
    });

    const bridge = new BridgeService({
      geocodingBaseUrl: slowMock.url,
      forecastBaseUrl: slowMock.url,
      timeoutMs: 40,
    });

    const timeoutRes = await bridge.getWeather('Madrid');
    assert.equal(timeoutRes.ok, false);
    assert.ok(timeoutRes.error);

    const errMock = await startMockHttpServer((_req, res) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: true }));
    });
    const errBridge = new BridgeService({
      geocodingBaseUrl: errMock.url,
      forecastBaseUrl: errMock.url,
    });
    const errRes = await errBridge.getWeather('Madrid');
    assert.equal(errRes.ok, false);
    assert.match(errRes.error ?? '', /500/);
  });

  it('searchTavily sends POST /search and returns answer & results', async () => {
    const mock = await startMockHttpServer((req, res) => {
      if (req.method === 'POST' && req.url === '/search') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            answer: 'Node.js 24 incluye node:sqlite estable.',
            results: [
              {
                title: 'Node.js 24 Release',
                url: 'https://nodejs.org/en/blog/release/v24.0.0',
                content: 'Release notes...',
              },
            ],
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const bridge = new BridgeService({ tavilyBaseUrl: mock.url });
    const res = await bridge.searchTavily('tvly-test-key', 'Node 24');
    assert.equal(res.ok, true);
    assert.equal(res.query, 'Node 24');
    assert.equal(res.answer, 'Node.js 24 incluye node:sqlite estable.');
    assert.equal(res.results.length, 1);
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0]?.body?.['api_key'], 'tvly-test-key');
    assert.equal(mock.requests[0]?.body?.['max_results'], 3);
    assert.equal(mock.requests[0]?.body?.['include_answer'], true);
  });

  it('searchTavily returns ok: false when HTTP 200 returns malformed JSON', async () => {
    const mock = await startMockHttpServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body>{broken json!!!</body></html>');
    });

    const bridge = new BridgeService({ tavilyBaseUrl: mock.url });
    const res = await bridge.searchTavily('tvly-test-key', 'Node 24');
    assert.equal(res.ok, false);
    assert.deepEqual(res.results, []);
    assert.match(res.error ?? '', /Respuesta inválida/);
  });

  it('sendTelegramMessage sends POST /bot.../sendMessage and returns messageId', async () => {
    const mock = await startMockHttpServer((req, res) => {
      if (req.method === 'POST' && req.url === '/bot123%3AABC/sendMessage') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            ok: true,
            result: { message_id: 987 },
          })
        );
        return;
      }
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, description: 'Bad Request' }));
    });

    const bridge = new BridgeService({ telegramBaseUrl: mock.url });
    const res = await bridge.sendTelegramMessage('123:ABC', '555000', 'Hola Troko');
    assert.equal(res.ok, true);
    assert.equal(res.messageId, 987);
    assert.equal(mock.requests.length, 1);
    assert.equal(mock.requests[0]?.body?.['chat_id'], '555000');
    assert.equal(mock.requests[0]?.body?.['text'], 'Hola Troko');
  });
});

describe('M5 NluService Live Bridge Routing & /api/integrations/:type/test', () => {
  it('guides user to Ajustes with zero HTTP calls when integrations are disabled, and calls BridgeService when enabled', async () => {
    const mock = await startMockHttpServer((req, res) => {
      if (req.url.startsWith('/v1/search')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            results: [
              { name: 'Buenos Aires', country: 'Argentina', latitude: -34.6, longitude: -58.38 },
            ],
          })
        );
        return;
      }
      if (req.url.startsWith('/v1/forecast')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            current: {
              temperature_2m: 24,
              apparent_temperature: 24,
              weather_code: 0,
              wind_speed_10m: 10,
            },
          })
        );
        return;
      }
      if (req.url === '/search') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            answer: 'Resumen de búsqueda Tavily.',
            results: [{ title: 'Result 1', url: 'https://example.com', content: 'abc' }],
          })
        );
        return;
      }
      if (req.url === '/botTOKEN1/sendMessage') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: { message_id: 42 } }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const db = createDatabase(':memory:');
    const eventBus = new EventBus();
    const settingsService = new SettingsService(db, eventBus);
    const productivityService = new ProductivityService(db, eventBus, settingsService);
    const organizerService = new OrganizerService(db, eventBus, settingsService);
    const appLauncherService = new AppLauncherService(db, eventBus);
    const mailerService = new MailerService(db, eventBus);
    const bridgeService = new BridgeService({
      geocodingBaseUrl: mock.url,
      forecastBaseUrl: mock.url,
      tavilyBaseUrl: mock.url,
      telegramBaseUrl: mock.url,
    });
    const nlu = new NluService({
      db,
      eventBus,
      settingsService,
      productivityService,
      mailerService,
      organizerService,
      appLauncherService,
      bridgeService,
    });

    try {
      // 1. Disabled -> zero HTTP calls, guide to Ajustes
      const wDisabled = await nlu.processUserMessage('¿Qué clima hace en Buenos Aires?');
      assert.equal(wDisabled.toolAction?.['type'], 'weather_query');
      assert.match(wDisabled.reply, /Ajustes/);

      const tDisabled = await nlu.processUserMessage('Busca noticias sobre TypeScript');
      assert.equal(tDisabled.toolAction?.['type'], 'web_search');
      assert.match(tDisabled.reply, /Ajustes/);

      const tgDisabled = await nlu.processUserMessage('Envía por telegram Hola equipo');
      assert.equal(tgDisabled.toolAction?.['type'], 'telegram_send');
      assert.match(tgDisabled.reply, /Ajustes/);

      assert.equal(mock.requests.length, 0);

      // 2. Enable integrations in SQLite
      appLauncherService.patchIntegration('weather', {
        enabled: true,
        config: { city: 'Madrid', units: 'metric' },
      });
      appLauncherService.patchIntegration('tavily', {
        enabled: true,
        config: { apiKey: 'tvly-live-123' },
      });
      appLauncherService.patchIntegration('telegram', {
        enabled: true,
        config: { botToken: 'TOKEN1', chatId: 'CHAT1' },
      });

      const wEnabled = await nlu.processUserMessage('¿Qué clima hace en Buenos Aires?');
      assert.equal(wEnabled.toolAction?.['type'], 'weather_query');
      assert.equal(wEnabled.toolAction?.['ok'], true);
      assert.match(wEnabled.reply, /Buenos Aires/);

      const tEnabled = await nlu.processUserMessage('Busca noticias sobre TypeScript');
      assert.equal(tEnabled.toolAction?.['type'], 'web_search');
      assert.equal(tEnabled.toolAction?.['ok'], true);
      assert.match(tEnabled.reply, /Resumen de búsqueda Tavily/);

      const tgEnabled = await nlu.processUserMessage('Envía por telegram Hola equipo');
      assert.equal(tgEnabled.toolAction?.['type'], 'telegram_send');
      assert.equal(tgEnabled.toolAction?.['ok'], true);
      assert.equal(tgEnabled.toolAction?.['messageId'], 42);
      assert.match(tgEnabled.reply, /CHAT1/);

      assert.equal(mock.requests.length, 4);
    } finally {
      nlu.stop();
      productivityService.stop();
      eventBus.close();
      db.close();
    }
  });

  it('POST /api/integrations/:type/test tests weather, tavily, and telegram via BridgeService', async () => {
    const mock = await startMockHttpServer((req, res) => {
      if (req.url.startsWith('/v1/search')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            results: [{ name: 'Madrid', country: 'España', latitude: 40.4, longitude: -3.7 }],
          })
        );
        return;
      }
      if (req.url.startsWith('/v1/forecast')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            current: {
              temperature_2m: 20,
              apparent_temperature: 20,
              weather_code: 0,
              wind_speed_10m: 8,
            },
          })
        );
        return;
      }
      if (req.url === '/search') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ answer: 'OK', results: [] }));
        return;
      }
      if (req.url === '/botBOT_OK/sendMessage') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, result: { message_id: 101 } }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const app = createApp({ dbPath: ':memory:', staticDir: null, heartbeatMs: 0 });
    // Redirect BridgeService URLs by temporarily intercepting global fetch to route to mock
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (
        rawUrl.startsWith('https://geocoding-api.open-meteo.com') ||
        rawUrl.startsWith('https://api.open-meteo.com') ||
        rawUrl.startsWith('https://api.tavily.com') ||
        rawUrl.startsWith('https://api.telegram.org')
      ) {
        const parsed = new URL(rawUrl);
        return originalFetch(`${mock.url}${parsed.pathname}${parsed.search}`, init);
      }
      return originalFetch(input, init);
    }) as typeof fetch;

    try {
      const { port } = await app.listen(0, '127.0.0.1');
      const base = `http://127.0.0.1:${port}`;

      const weatherRes = await fetch(`${base}/api/integrations/weather/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { city: 'Madrid', units: 'metric' } }),
      });
      const weatherJson = (await weatherRes.json()) as { ok: boolean; details: string };
      assert.equal(weatherRes.status, 200);
      assert.equal(weatherJson.ok, true);
      assert.match(weatherJson.details, /Madrid/);

      const tavilyRes = await fetch(`${base}/api/integrations/tavily/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { apiKey: 'tvly-abc' } }),
      });
      const tavilyJson = (await tavilyRes.json()) as { ok: boolean; details: string };
      assert.equal(tavilyRes.status, 200);
      assert.equal(tavilyJson.ok, true);
      assert.match(tavilyJson.details, /Tavily/);

      const tgRes = await fetch(`${base}/api/integrations/telegram/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: { botToken: 'BOT_OK', chatId: '999' } }),
      });
      const tgJson = (await tgRes.json()) as { ok: boolean; details: string };
      assert.equal(tgRes.status, 200);
      assert.equal(tgJson.ok, true);
      assert.match(tgJson.details, /999/);
    } finally {
      globalThis.fetch = originalFetch;
      await app.close();
    }
  });
});
