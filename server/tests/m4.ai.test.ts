import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, describe, it } from 'node:test';
import { createApp } from '../src/app.ts';
import { createDatabase } from '../src/db/database.ts';
import { EventBus } from '../src/eventBus.ts';
import { AiProviderService } from '../src/services/aiProvider.ts';
import { AppLauncherService } from '../src/services/appLauncherService.ts';
import { MailerService } from '../src/services/mailerService.ts';
import { NluService } from '../src/services/nluService.ts';
import { OrganizerService } from '../src/services/organizerService.ts';
import { ProductivityService } from '../src/services/productivityService.ts';
import { SettingsService } from '../src/services/settingsService.ts';

interface CapturedRequest {
  method: string;
  url: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown> | null;
}

const activeServers: http.Server[] = [];

async function startMockAiServer(
  handler: (req: CapturedRequest, res: http.ServerResponse) => void
): Promise<{ url: string; server: http.Server; requests: CapturedRequest[] }> {
  const requests: CapturedRequest[] = [];
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
      const captured: CapturedRequest = {
        method: req.method ?? 'GET',
        url: req.url ?? '/',
        headers: req.headers,
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

async function getUnusedPort(): Promise<number> {
  const srv = http.createServer();
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
  const addr = srv.address();
  const port = typeof addr === 'object' && addr !== null ? addr.port : 59999;
  await new Promise<void>((resolve) => srv.close(() => resolve()));
  return port;
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

describe('M4 AiProviderService & NluService', () => {
  it('detectOllama discovers models from /api/tags and handles unreachable ports', async () => {
    const mock = await startMockAiServer((req, res) => {
      if (req.method === 'GET' && req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: [{ name: 'llama3.2:3b' }, { name: 'qwen2.5:7b' }],
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const svc = new AiProviderService();
    const detected = await svc.detectOllama(`${mock.url}/`);
    assert.equal(detected.ollamaDetected, true);
    assert.equal(detected.endpoint, mock.url);
    assert.deepEqual(detected.models, ['llama3.2:3b', 'qwen2.5:7b']);

    const deadPort = await getUnusedPort();
    const unreachable = await svc.detectOllama(`http://127.0.0.1:${deadPort}`, 400);
    assert.equal(unreachable.ollamaDetected, false);
    assert.deepEqual(unreachable.models, []);
    assert.ok(unreachable.error && unreachable.error.length > 0);
  });

  it('testConnection validates local_fallback, ollama, openai_compatible, and error cases', async () => {
    const svc = new AiProviderService();

    const localRes = await svc.testConnection({
      aiProvider: 'local_fallback',
      aiEndpoint: 'http://127.0.0.1:11434',
      aiModel: 'llama3.2:3b',
      aiApiKey: '',
    });
    assert.equal(localRes.ok, true);
    assert.equal(localRes.provider, 'local_fallback');
    assert.match(localRes.replyPreview ?? '', /offline/i);

    const mock = await startMockAiServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'llama3.2:3b' }] }));
        return;
      }
      if (req.url === '/api/chat') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: { role: 'assistant', content: 'OK listo' } }));
        return;
      }
      if (req.url === '/v1/chat/completions') {
        if (req.headers['authorization'] !== 'Bearer sk-test-123') {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'Unauthorized' } }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'OK OpenAI' } }],
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const ollamaOk = await svc.testConnection({
      aiProvider: 'ollama',
      aiEndpoint: mock.url,
      aiModel: 'llama3.2:3b',
      aiApiKey: '',
    });
    assert.equal(ollamaOk.ok, true);
    assert.equal(ollamaOk.replyPreview, 'OK listo');
    assert.ok(ollamaOk.latencyMs >= 0);

    const ollamaMissingModel = await svc.testConnection({
      aiProvider: 'ollama',
      aiEndpoint: mock.url,
      aiModel: 'modelo-inexistente',
      aiApiKey: '',
    });
    assert.equal(ollamaMissingModel.ok, false);
    assert.match(ollamaMissingModel.error ?? '', /no encontrado/i);

    const openAiOk = await svc.testConnection({
      aiProvider: 'openai_compatible',
      aiEndpoint: mock.url,
      aiModel: 'gpt-4o-mini',
      aiApiKey: 'sk-test-123',
    });
    assert.equal(openAiOk.ok, true);
    assert.equal(openAiOk.replyPreview, 'OK OpenAI');

    const deadPort = await getUnusedPort();
    const deadRes = await svc.testConnection({
      aiProvider: 'openai',
      aiEndpoint: `http://127.0.0.1:${deadPort}`,
      aiModel: 'gpt-4o-mini',
      aiApiKey: 'sk-test',
    });
    assert.equal(deadRes.ok, false);
    assert.ok(deadRes.error && deadRes.error.length > 0);
  });

  it('generateReply sends history and supports plain-text, structured JSON, and unreachable fallback', async () => {
    let mode: 'plain' | 'json' = 'plain';
    const mock = await startMockAiServer((req, res) => {
      if (req.url === '/api/chat') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const content =
          mode === 'plain'
            ? 'Claro, aquí tienes tu resumen.'
            : '```json\n{"reply":"¡Genial progreso!","emotion":"orgulloso","intent":"encourage"}\n```';
        res.end(JSON.stringify({ message: { role: 'assistant', content } }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const svc = new AiProviderService();
    const settings = {
      aiProvider: 'ollama' as const,
      aiEndpoint: mock.url,
      aiModel: 'llama3.2:3b',
      aiApiKey: '',
    };

    const plainRes = await svc.generateReply(
      settings,
      [
        { role: 'user', content: 'Hola Troko' },
        { role: 'assistant', content: '¡Hola! ¿En qué te ayudo?' },
      ],
      '¿Cómo voy?'
    );
    assert.deepEqual(plainRes, { reply: 'Claro, aquí tienes tu resumen.' });
    assert.equal(mock.requests.length, 1);
    const sentMessages = mock.requests[0]?.body?.['messages'] as Array<{
      role: string;
      content: string;
    }>;
    assert.equal(sentMessages.length, 4);
    assert.equal(sentMessages[0]?.role, 'system');
    assert.equal(sentMessages[1]?.content, 'Hola Troko');
    assert.equal(sentMessages[2]?.content, '¡Hola! ¿En qué te ayudo?');
    assert.equal(sentMessages[3]?.content, '¿Cómo voy?');

    mode = 'json';
    const jsonRes = await svc.generateReply(settings, [], 'Terminé mi proyecto');
    assert.deepEqual(jsonRes, {
      reply: '¡Genial progreso!',
      emotion: 'orgulloso',
      intent: 'encourage',
    });

    const deadPort = await getUnusedPort();
    const unreachable = await svc.generateReply(
      { ...settings, aiEndpoint: `http://127.0.0.1:${deadPort}` },
      [],
      'Hola',
      { timeoutMs: 400 }
    );
    assert.equal(unreachable, null);
  });

  it('NluService preserves deterministic intents and uses external provider with history + offline fallback', async () => {
    const mock = await startMockAiServer((req, res) => {
      if (req.url === '/v1/chat/completions') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: JSON.stringify({
                    reply: 'Recuerdo que te gusta el café. ¿Organizamos tu tarde?',
                    emotion: 'guino',
                  }),
                },
              },
            ],
          })
        );
        return;
      }
      res.writeHead(500);
      res.end();
    });

    const db = createDatabase(':memory:');
    const eventBus = new EventBus();
    const settingsService = new SettingsService(db, eventBus);
    const productivityService = new ProductivityService(db, eventBus, settingsService);
    const mailerService = new MailerService(db, eventBus);
    const organizerService = new OrganizerService(db, eventBus, settingsService);
    const appLauncherService = new AppLauncherService(db, eventBus);
    const aiProvider = new AiProviderService();
    const nluService = new NluService({
      db,
      eventBus,
      settingsService,
      productivityService,
      mailerService,
      organizerService,
      appLauncherService,
      aiProvider,
    });

    try {
      settingsService.patchSettings({
        aiProvider: 'openai_compatible',
        aiEndpoint: mock.url,
        aiModel: 'qwen2.5:3b',
      });

      // Deterministic intents must NOT hit external LLM
      const taskRes = await nluService.processUserMessage('Anota una tarea: Comprar café');
      assert.equal(taskRes.toolAction?.['type'], 'create_task');
      assert.equal(mock.requests.length, 0);

      const enTaskRes = await nluService.processUserMessage('Add a task: Review PR');
      assert.equal(enTaskRes.toolAction?.['type'], 'create_task');
      assert.equal(mock.requests.length, 0);

      // Conversational message hits external LLM and includes prior history
      const chatRes = await nluService.processUserMessage('¿Qué me recomiendas ahora?');
      assert.equal(chatRes.reply, 'Recuerdo que te gusta el café. ¿Organizamos tu tarde?');
      assert.equal(chatRes.emotion, 'guino');
      assert.equal(mock.requests.length, 1);
      const sentMsgs = mock.requests[0]?.body?.['messages'] as Array<{
        role: string;
        content: string;
      }>;
      assert.ok(sentMsgs.some((m) => m.content.includes('Comprar café')));

      // Unreachable endpoint cleanly falls back to offline NLU
      const deadPort = await getUnusedPort();
      settingsService.patchSettings({
        aiEndpoint: `http://127.0.0.1:${deadPort}`,
      });
      const fallbackRes = await nluService.processUserMessage('Hola Troko');
      assert.equal(fallbackRes.emotion, 'saludo');
      assert.match(fallbackRes.reply, /Hola/i);
    } finally {
      nluService.stop();
      productivityService.stop();
      eventBus.close();
      db.close();
    }
  });

  it('HTTP routes GET /api/ai/detect and POST /api/ai/test integrate with createApp', async () => {
    const mock = await startMockAiServer((req, res) => {
      if (req.url === '/api/tags') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ models: [{ name: 'llama3.2:3b' }] }));
        return;
      }
      if (req.url === '/api/chat') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: { role: 'assistant', content: 'OK' } }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    const app = createApp({ dbPath: ':memory:', staticDir: null, heartbeatMs: 0 });
    const { port } = await app.listen(0, '127.0.0.1');
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const detectRes = await fetch(
        `${baseUrl}/api/ai/detect?endpoint=${encodeURIComponent(mock.url)}`
      );
      assert.equal(detectRes.status, 200);
      const detectJson = (await detectRes.json()) as {
        ollamaDetected: boolean;
        models: string[];
      };
      assert.equal(detectJson.ollamaDetected, true);
      assert.deepEqual(detectJson.models, ['llama3.2:3b']);

      const testRes = await fetch(`${baseUrl}/api/ai/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiProvider: 'ollama',
          aiEndpoint: mock.url,
          aiModel: 'llama3.2:3b',
        }),
      });
      assert.equal(testRes.status, 200);
      const testJson = (await testRes.json()) as {
        ok: boolean;
        provider: string;
        replyPreview?: string;
      };
      assert.equal(testJson.ok, true);
      assert.equal(testJson.provider, 'ollama');
      assert.equal(testJson.replyPreview, 'OK');
    } finally {
      await app.close();
    }
  });

  it('resolves endpoints ending in /v1 to /v1/chat/completions without duplicating /v1', async () => {
    const mock = await startMockAiServer((req, res) => {
      if (req.url === '/v1/chat/completions') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: 'OK v1' } }],
          })
        );
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `Unexpected path: ${req.url}` } }));
    });

    const svc = new AiProviderService();
    const settings = {
      aiProvider: 'openai' as const,
      aiEndpoint: `${mock.url}/v1`,
      aiModel: 'gpt-4o-mini',
      aiApiKey: 'sk-test',
    };

    const testRes = await svc.testConnection(settings);
    assert.equal(testRes.ok, true);
    assert.equal(testRes.replyPreview, 'OK v1');

    const replyRes = await svc.generateReply(settings, [], 'Hola');
    assert.deepEqual(replyRes, { reply: 'OK v1' });

    assert.equal(mock.requests.length, 2);
    assert.equal(mock.requests[0]?.url, '/v1/chat/completions');
    assert.equal(mock.requests[1]?.url, '/v1/chat/completions');
  });
});
