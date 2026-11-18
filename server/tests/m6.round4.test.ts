import assert from 'node:assert/strict';
import http from 'node:http';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  TROKO_DESKTOP_IPC_CHANNELS,
  TROKO_IPC_CHANNELS,
  isSafeExternalUrl,
} from '../../electron/main.ts';
import { createApp, type TrokoApp } from '../src/app.ts';

async function jsonReq<T>(
  baseUrl: string,
  method: string,
  pathname: string,
  body?: unknown
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json()) as T;
  return { status: res.status, data };
}

describe('M6 Round 4: Full Desktop & NLU Enhancements', () => {
  let app: TrokoApp;
  let baseUrl: string;

  beforeEach(async () => {
    app = createApp({ dbPath: ':memory:', heartbeatMs: 60_000 });
    const bound = await app.listen(0, '127.0.0.1');
    baseUrl = `http://${bound.host}:${bound.port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('resolves Windows/Spanish app aliases while rejecting shell metacharacters', async () => {
    const ok1 = await jsonReq<{ ok: boolean; app: string }>(
      baseUrl,
      'POST',
      '/api/apps/launch',
      { app: 'bloc de notas' }
    );
    assert.equal(ok1.status, 200);
    assert.equal(ok1.data.app, 'Notas');

    const ok2 = await jsonReq<{ ok: boolean; app: string }>(
      baseUrl,
      'POST',
      '/api/apps/launch',
      { app: 'chrome' }
    );
    assert.equal(ok2.status, 200);
    assert.equal(ok2.data.app, 'Safari');

    const ok3 = await jsonReq<{ ok: boolean; app: string }>(
      baseUrl,
      'POST',
      '/api/apps/launch',
      { app: 'explorador' }
    );
    assert.equal(ok3.status, 200);
    assert.equal(ok3.data.app, 'Finder');

    const bad = await jsonReq<{ ok: boolean; error: string }>(
      baseUrl,
      'POST',
      '/api/apps/launch',
      { app: 'calc && rm -rf /' }
    );
    assert.equal(bad.status, 400);
    assert.equal(bad.data.ok, false);
  });

  it('provides Quick Notes CRUD, NLU capture, and clears notes on memory wipe', async () => {
    const chatRes = await jsonReq<{
      ok: boolean;
      toolAction: { type: string; noteId: string; content: string } | null;
    }>(baseUrl, 'POST', '/api/chat/command', {
      text: 'Nota rápida: comprar café en grano',
      inputMode: 'text',
    });
    assert.equal(chatRes.status, 200);
    assert.equal(chatRes.data.toolAction?.type, 'create_note');

    const list1 = await jsonReq<{
      ok: boolean;
      notes: Array<{ id: string; content: string; pinned: boolean }>;
    }>(baseUrl, 'GET', '/api/notes');
    assert.equal(list1.data.notes.length, 1);
    assert.equal(list1.data.notes[0]?.content, 'comprar café en grano');

    const noteId = list1.data.notes[0]!.id;
    const pinned = await jsonReq<{
      ok: boolean;
      note: { id: string; pinned: boolean };
    }>(baseUrl, 'PATCH', `/api/notes/${noteId}`, { pinned: true });
    assert.equal(pinned.status, 200);
    assert.equal(pinned.data.note.pinned, true);

    await jsonReq(baseUrl, 'POST', '/api/memory/wipe', {});
    const listAfterWipe = await jsonReq<{ ok: boolean; notes: unknown[] }>(
      baseUrl,
      'GET',
      '/api/notes'
    );
    assert.equal(listAfterWipe.data.notes.length, 0);
  });

  it('handles reminders, task completion, habit logging, voseo, and system stats queries cleanly', async () => {
    // Task creation via voseo
    const addTask = await jsonReq<{
      ok: boolean;
      toolAction: { type: string; title: string } | null;
    }>(baseUrl, 'POST', '/api/chat/command', {
      text: 'anotame comprar leche',
      inputMode: 'text',
    });
    assert.equal(addTask.data.toolAction?.type, 'create_task');
    assert.equal(addTask.data.toolAction?.title, 'comprar leche');

    // Task completion
    const doneTask = await jsonReq<{
      ok: boolean;
      toolAction: { type: string; title: string } | null;
    }>(baseUrl, 'POST', '/api/chat/command', {
      text: 'Terminé comprar leche',
      inputMode: 'text',
    });
    assert.equal(doneTask.data.toolAction?.type, 'complete_task');

    // Relative reminder
    const relRem = await jsonReq<{
      ok: boolean;
      toolAction: { type: string; title: string } | null;
    }>(baseUrl, 'POST', '/api/chat/command', {
      text: 'Recuérdame en 15 minutos llamar a Juan',
      inputMode: 'text',
    });
    assert.equal(relRem.data.toolAction?.type, 'create_reminder');
    assert.equal(relRem.data.toolAction?.title, 'llamar a Juan');

    // Clock-time reminder
    const clockRem = await jsonReq<{
      ok: boolean;
      toolAction: { type: string; title: string } | null;
    }>(baseUrl, 'POST', '/api/chat/command', {
      text: 'Avísame a las 18:30 revisar el deploy',
      inputMode: 'text',
    });
    assert.equal(clockRem.data.toolAction?.type, 'create_reminder');
    assert.equal(clockRem.data.toolAction?.title, 'revisar el deploy');

    // Daily summary must answer summary for "¿Qué tengo hoy?"
    const summaryRes = await jsonReq<{
      ok: boolean;
      reply: string;
      toolAction: { type: string } | null;
    }>(baseUrl, 'POST', '/api/chat/command', {
      text: '¿Qué tengo hoy?',
      inputMode: 'text',
    });
    assert.equal(summaryRes.data.toolAction?.type, 'daily_summary');

    // Capabilities question must NOT hijack daily_summary
    const capRes = await jsonReq<{
      ok: boolean;
      reply: string;
      toolAction: Record<string, unknown> | null;
    }>(baseUrl, 'POST', '/api/chat/command', {
      text: '¿Qué puedes hacer hoy?',
      inputMode: 'text',
    });
    assert.notEqual(capRes.data.toolAction?.['type'], 'daily_summary');
    assert.match(capRes.data.reply, /tareas|hábitos|enfoque|puedo/i);

    // System stats via NLU & REST
    const statsNlu = await jsonReq<{
      ok: boolean;
      toolAction: { type: string; memUsedPct: number } | null;
    }>(baseUrl, 'POST', '/api/chat/command', {
      text: 'Estado de mi PC',
      inputMode: 'text',
    });
    assert.equal(statsNlu.data.toolAction?.type, 'system_stats');
    assert.equal(typeof statsNlu.data.toolAction?.memUsedPct, 'number');

    const statsRest = await jsonReq<{
      ok: boolean;
      cpuCores: number;
      memTotalBytes: number;
      realDesktopDir: string;
    }>(baseUrl, 'GET', '/api/system/stats');
    assert.equal(statsRest.status, 200);
    assert.equal(statsRest.data.cpuCores > 0, true);
    assert.equal(statsRest.data.memTotalBytes > 0, true);
    assert.equal(statsRest.data.realDesktopDir.length > 0, true);

    // Create habit first, then test natural-language habit logging
    await jsonReq(baseUrl, 'POST', '/api/habits', {
      name: 'Tomar agua',
      sceneId: 'water',
      unitLabel: 'vasos',
      dailyGoal: 8,
    });
    const habRes = await jsonReq<{
      ok: boolean;
      toolAction: { type: string; habitId: string; progress: number } | null;
    }>(baseUrl, 'POST', '/api/chat/command', {
      text: 'Tomé agua',
      inputMode: 'text',
    });
    assert.equal(habRes.data.toolAction?.type, 'log_habit');
    assert.equal(habRes.data.toolAction?.progress, 1);
  });

  it('executes structured action tool calls returned by external AI provider', async () => {
    const mockOllama = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        if (req.url?.startsWith('/api/chat')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  reply: '¡Hecho! Ya agregué la tarea.',
                  emotion: 'orgulloso',
                  action: { type: 'create_task', title: 'Preparar presentación' },
                }),
              },
              done: true,
            })
          );
          return;
        }
        res.writeHead(404).end();
      });
    });

    await new Promise<void>((resolve) => mockOllama.listen(0, '127.0.0.1', resolve));
    const addr = mockOllama.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;

    try {
      await jsonReq(baseUrl, 'PATCH', '/api/settings', {
        aiProvider: 'ollama',
        aiEndpoint: `http://127.0.0.1:${port}`,
        aiModel: 'llama3.2:3b',
      });

      const chatRes = await jsonReq<{
        ok: boolean;
        reply: string;
        emotion: string;
        toolAction: { type: string; title: string } | null;
      }>(baseUrl, 'POST', '/api/chat/command', {
        text: '¿Me ayudas a organizar lo de la presentación de mañana?',
        inputMode: 'text',
      });
      assert.equal(chatRes.status, 200);
      assert.equal(chatRes.data.toolAction?.type, 'create_task');
      assert.equal(chatRes.data.toolAction?.title, 'Preparar presentación');
      assert.equal(chatRes.data.emotion, 'orgulloso');

      const tasksRes = await jsonReq<{ ok: boolean; tasks: Array<{ title: string }> }>(
        baseUrl,
        'GET',
        '/api/tasks'
      );
      assert.equal(
        tasksRes.data.tasks.some((t) => t.title === 'Preparar presentación'),
        true
      );
    } finally {
      await new Promise<void>((resolve, reject) =>
        mockOllama.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  it('preserves SQLite 15-table invariant and secures Electron external URL helper', () => {
    assert.equal(app.db.listTables().length, 15);
    assert.deepEqual(Object.keys(TROKO_IPC_CHANNELS), ['SET_INTERACTIVE', 'HIDE', 'QUIT']);
    assert.equal(TROKO_DESKTOP_IPC_CHANNELS.NOTIFY, 'troko:notify');
    assert.equal(isSafeExternalUrl('https://github.com/FrancoBarrera00/Troko'), true);
    assert.equal(isSafeExternalUrl('http://127.0.0.1:4173'), true);
    assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
    assert.equal(isSafeExternalUrl('file:///etc/passwd'), false);
    assert.equal(isSafeExternalUrl('not a url'), false);
  });
});
