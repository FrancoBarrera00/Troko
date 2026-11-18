import http from 'node:http';
import net from 'node:net';
import { expect, resetTrokoState, test } from '../../helpers/troko.js';

async function startMockOllamaServer(): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      if (req.method === 'GET' && req.url?.startsWith('/api/tags')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            models: [{ name: 'llama3.2:3b' }, { name: 'qwen2.5:7b' }],
          }),
        );
        return;
      }

      if (req.method === 'POST' && req.url?.startsWith('/api/chat')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            message: { role: 'assistant', content: 'OK' },
            done: true,
          }),
        );
        return;
      }

      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function startMockImapServer(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('* OK Mock IMAP ready\r\n');

    let buf = '';
    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      while (buf.includes('\n')) {
        const idx = buf.indexOf('\n');
        const line = buf.slice(0, idx + 1).replace(/\r?\n$/, '');
        buf = buf.slice(idx + 1);
        if (!line) continue;

        const spaceIdx = line.indexOf(' ');
        const tag = spaceIdx > 0 ? line.slice(0, spaceIdx) : 'A001';
        const rest = spaceIdx > 0 ? line.slice(spaceIdx + 1).trim() : line;
        const cmd = rest.split(/\s+/)[0]?.toUpperCase() ?? '';

        if (cmd === 'LOGIN') {
          socket.write(`${tag} OK LOGIN completed\r\n`);
        } else if (cmd === 'NOOP') {
          socket.write(`${tag} OK NOOP completed\r\n`);
        } else if (cmd === 'SELECT') {
          socket.write('* 0 EXISTS\r\n');
          socket.write(`${tag} OK [READ-WRITE] SELECT completed\r\n`);
        } else if (cmd === 'SEARCH') {
          socket.write('* SEARCH\r\n');
          socket.write(`${tag} OK SEARCH completed\r\n`);
        } else if (cmd === 'LOGOUT') {
          socket.write('* BYE Mock IMAP\r\n');
          socket.write(`${tag} OK LOGOUT completed\r\n`);
          socket.end();
        } else {
          socket.write(`${tag} OK ${cmd} completed\r\n`);
        }
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const s of sockets) s.destroy();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function startMockSmtpServer(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.write('220 localhost Mock ESMTP\r\n');

    let buf = '';
    let authStage: 'none' | 'user' | 'pass' = 'none';

    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      while (buf.includes('\n')) {
        const idx = buf.indexOf('\n');
        const line = buf.slice(0, idx + 1).replace(/\r?\n$/, '');
        buf = buf.slice(idx + 1);
        if (!line) continue;

        if (authStage === 'user') {
          authStage = 'pass';
          socket.write('334 UGFzc3dvcmQ6\r\n');
          continue;
        }
        if (authStage === 'pass') {
          authStage = 'none';
          socket.write('235 2.7.0 Authentication successful\r\n');
          continue;
        }

        const upper = line.toUpperCase();
        if (upper.startsWith('EHLO') || upper.startsWith('HELO')) {
          socket.write('250-localhost\r\n250 AUTH PLAIN LOGIN\r\n');
        } else if (upper.startsWith('AUTH PLAIN')) {
          socket.write('235 2.7.0 Authentication successful\r\n');
        } else if (upper.startsWith('AUTH LOGIN')) {
          authStage = 'user';
          socket.write('334 VXNlcm5hbWU6\r\n');
        } else if (upper.startsWith('QUIT')) {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
        } else {
          socket.write('250 OK\r\n');
        }
      }
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    port,
    close: () =>
      new Promise<void>((resolve, reject) => {
        for (const s of sockets) s.destroy();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function getUnusedPort(): Promise<number> {
  const srv = net.createServer();
  await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', () => resolve()));
  const addr = srv.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  await new Promise<void>((resolve, reject) =>
    srv.close((err) => (err ? reject(err) : resolve())),
  );
  return port;
}

test.describe('F20: Round 3 Desktop Companion Capabilities', () => {
  test.beforeEach(async ({ api, desktopSandbox }) => {
    await resetTrokoState(api, desktopSandbox);
  });

  test('F20-T1: BienvenidaModal detects Ollama, selects model, and persists settings on Usar Ollama', async ({
    api,
    page,
  }) => {
    await page.route('**/api/ai/detect*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          ollamaDetected: true,
          endpoint: 'http://127.0.0.1:11434',
          models: ['llama3.2:3b'],
        }),
      });
    });

    await page.goto('/');
    const modal = page.getByTestId('bienvenida-modal');
    await expect(modal).toBeVisible({ timeout: 10_000 });

    const banner = page.getByTestId('ollama-detected-banner');
    await expect(banner).toBeVisible();

    const modelSelect = page.getByTestId('ollama-model-select');
    await expect(modelSelect).toBeVisible();
    await expect(modelSelect).toHaveValue('llama3.2:3b');

    await page.getByTestId('use-ollama-btn').click();
    await expect(modal).toBeHidden({ timeout: 5_000 });

    const settings = await api.getSettings();
    expect(settings.aiProvider).toBe('ollama');
    expect(settings.aiEndpoint).toBe('http://127.0.0.1:11434');
    expect(settings.aiModel).toBe('llama3.2:3b');
    expect(settings.onboardingCompleted).toBe(true);
  });

  test('F20-T2: AjustesTab detects local mock Ollama server and tests AI connection', async ({
    api,
    page,
    troko,
  }) => {
    const mockOllama = await startMockOllamaServer();
    try {
      await troko.goto({ completeOnboarding: true, api });
      await troko.openTab('Ajustes');

      await page.getByTestId('ai-provider-select').selectOption('ollama');
      await page.getByTestId('ai-endpoint-input').fill(mockOllama.url);

      await page.getByTestId('detect-ollama-btn').click();

      const detectStatus = page.getByTestId('ollama-detect-status');
      await expect(detectStatus).toBeVisible();
      await expect(detectStatus).toContainText('2 modelos');
      await expect(page.getByTestId('ollama-model-chip-llama3.2:3b')).toBeVisible();
      await expect(page.getByTestId('ollama-model-chip-qwen2.5:7b')).toBeVisible();

      await page.getByTestId('ollama-model-chip-llama3.2:3b').click();
      await page.getByTestId('test-ai-connection-btn').click();

      const connStatus = page.getByTestId('ai-connection-status');
      await expect(connStatus).toBeVisible();
      await expect(connStatus).toContainText(/Conectado/i);
    } finally {
      await mockOllama.close();
    }
  });

  test('F20-T3: AjustesTab tests IMAP/SMTP against local mock TCP servers', async ({
    api,
    page,
    troko,
  }) => {
    const mockImap = await startMockImapServer();
    const mockSmtp = await startMockSmtpServer();
    try {
      await troko.goto({ completeOnboarding: true, api });
      await troko.openTab('Ajustes');

      const mailCard = page.getByTestId('integration-card-imap_smtp');
      await mailCard.scrollIntoViewIfNeeded();

      await page.getByTestId('imap-host-input').fill('127.0.0.1');
      await page.getByTestId('imap-port-input').fill(String(mockImap.port));
      await page.getByTestId('smtp-host-input').fill('127.0.0.1');
      await page.getByTestId('smtp-port-input').fill(String(mockSmtp.port));
      await page.getByTestId('imap-user-input').fill('usuario@local.test');
      await page.getByTestId('imap-pass-input').fill('secreto123');

      await page.getByTestId('test-integration-imap_smtp').click();

      const testStatus = page.getByTestId('imap-smtp-test-status');
      await expect(testStatus).toBeVisible({ timeout: 10_000 });
      await expect(testStatus).toContainText(/IMAP OK/i);
      await expect(testStatus).toContainText(/SMTP OK/i);
    } finally {
      await mockImap.close();
      await mockSmtp.close();
    }
  });

  test('F20-T4: CorreoTab shows mail-error-banner on failed sync and preserves confirm-before-send', async ({
    api,
    page,
    troko,
  }) => {
    const closedPort = await getUnusedPort();
    await api.patchIntegration('imap_smtp', {
      enabled: true,
      config: {
        imapHost: '127.0.0.1',
        imapPort: closedPort,
        smtpHost: '127.0.0.1',
        smtpPort: closedPort,
        user: 'usuario@local.test',
        pass: 'secreto123',
      },
    });

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Correo');

    const syncBtn = page.getByTestId('sync-inbox-btn');
    await expect(syncBtn).toBeVisible();
    await syncBtn.click();

    const errorBanner = page.getByTestId('mail-error-banner');
    await expect(errorBanner).toBeVisible({ timeout: 10_000 });

    // Confirm-before-send must remain intact
    await page.getByTestId('draft-body-input').fill('Confirmar entrega mañana');
    await page.getByTestId('create-draft-btn').click();

    const draftsList = page.getByTestId('drafts-list');
    await expect(draftsList).toBeVisible();
    const draftItem = draftsList.getByTestId('mail-draft-item').first();
    await expect(draftItem).toBeVisible();
    await expect(draftItem).toHaveAttribute('data-status', /^pending_confirm/);
    await expect(draftItem.getByTestId('send-draft-btn')).toBeVisible();
  });

  test('F20-T5: Live bridges test endpoint validation and ChatTab NLU tool badges', async ({
    api,
    page,
    request,
    troko,
  }) => {
    // Verify backend /api/integrations/:type/test missing-key/missing-config handling
    const weatherMissing = await request.post('/api/integrations/weather/test', {
      data: { config: { city: '' } },
    });
    expect(weatherMissing.ok()).toBe(true);
    const weatherJson = (await weatherMissing.json()) as { ok: boolean; details: string };
    expect(weatherJson.ok).toBe(false);
    expect(weatherJson.details).toMatch(/ciudad/i);

    const tavilyMissing = await request.post('/api/integrations/tavily/test', {
      data: { config: { apiKey: '' } },
    });
    expect(tavilyMissing.ok()).toBe(true);
    const tavilyJson = (await tavilyMissing.json()) as { ok: boolean; details: string };
    expect(tavilyJson.ok).toBe(false);
    expect(tavilyJson.details).toMatch(/API Key/i);

    const tgMissing = await request.post('/api/integrations/telegram/test', {
      data: { config: { botToken: '', chatId: '' } },
    });
    expect(tgMissing.ok()).toBe(true);
    const tgJson = (await tgMissing.json()) as { ok: boolean; details: string };
    expect(tgJson.ok).toBe(false);
    expect(tgJson.details).toMatch(/Bot Token/i);

    // Also verify real backend /api/chat/command handles disabled weather bridge cleanly without crashing
    const realDisabledRes = await api.sendCommand('¿Qué tiempo hace en Madrid?');
    expect(typeof realDisabledRes.reply).toBe('string');
    expect(String(realDisabledRes.reply).length).toBeGreaterThan(0);

    // Now test ChatTab tool badges for weather_query, web_search, telegram_send with mocked chat responses
    const mockedMessages: Array<{
      id: string;
      conversationId: string;
      role: 'user' | 'assistant';
      content: string;
      inputMode: 'text' | 'voice';
      emotion: string | null;
      toolAction: Record<string, unknown> | null;
      createdAt: string;
    }> = [];

    await page.route('**/api/chat', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ ok: true, messages: mockedMessages }),
        });
        return;
      }
      await route.continue();
    });

    await page.route('**/api/chat/command', async (route) => {
      const body = route.request().postDataJSON() as { text?: string };
      const text = body.text ?? '';
      let toolType = 'weather_query';
      let reply = 'En Madrid hace 22 °C y está despejado.';

      if (/busca/i.test(text)) {
        toolType = 'web_search';
        reply = 'Resultados web sobre Troko-Desk listos.';
      } else if (/telegram/i.test(text)) {
        toolType = 'telegram_send';
        reply = 'Mensaje enviado por Telegram.';
      }

      const now = new Date().toISOString();
      mockedMessages.push(
        {
          id: `u-${mockedMessages.length + 1}`,
          conversationId: 'conv-default',
          role: 'user',
          content: text,
          inputMode: 'text',
          emotion: null,
          toolAction: null,
          createdAt: now,
        },
        {
          id: `a-${mockedMessages.length + 2}`,
          conversationId: 'conv-default',
          role: 'assistant',
          content: reply,
          inputMode: 'text',
          emotion: 'contento',
          toolAction: { type: toolType },
          createdAt: now,
        },
      );

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          reply,
          emotion: 'contento',
          toolAction: { type: toolType },
        }),
      });
    });

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Chat');

    const chatInput = page.getByTestId('chat-input');
    const chatSend = page.getByTestId('chat-send-btn');

    await chatInput.fill('¿Qué tiempo hace en Madrid?');
    await chatSend.click();
    const weatherMsg = page.locator('[data-testid="chat-msg-assistant"][data-tool="weather_query"]');
    await expect(weatherMsg).toBeVisible();
    await expect(weatherMsg.getByTestId('chat-tool-badge')).toHaveText('Clima consultado');

    await chatInput.fill('Busca en internet noticias de IA');
    await chatSend.click();
    const searchMsg = page.locator('[data-testid="chat-msg-assistant"][data-tool="web_search"]');
    await expect(searchMsg).toBeVisible();
    await expect(searchMsg.getByTestId('chat-tool-badge')).toHaveText('Búsqueda web');

    await chatInput.fill('Envía un mensaje por Telegram: Hola equipo');
    await chatSend.click();
    const tgMsg = page.locator('[data-testid="chat-msg-assistant"][data-tool="telegram_send"]');
    await expect(tgMsg).toBeVisible();
    await expect(tgMsg.getByTestId('chat-tool-badge')).toHaveText('Mensaje de Telegram');
  });

  test('F20-T6: Electron overlay mode hides DesktopStage, uses transparent body, and calls quitApp on Salir de Troko', async ({
    api,
    page,
    troko,
  }) => {
    await page.addInitScript(() => {
      const win = window as unknown as {
        __trokoCalls?: { setInteractive: boolean[]; quitApp: number };
        trokoElectron?: {
          isElectron: boolean;
          platform: string;
          setInteractive: (v: boolean) => void;
          quitApp: () => void;
          hideWindow: () => void;
        };
      };
      win.__trokoCalls = { setInteractive: [], quitApp: 0 };
      win.trokoElectron = {
        isElectron: true,
        platform: 'win32',
        setInteractive: (v: boolean) => {
          win.__trokoCalls?.setInteractive.push(v);
        },
        quitApp: () => {
          if (win.__trokoCalls) {
            win.__trokoCalls.quitApp += 1;
          }
        },
        hideWindow: () => {},
      };
    });

    await troko.goto({ completeOnboarding: true, api });

    const hasElectronClass = await page.evaluate(() =>
      document.documentElement.classList.contains('troko-electron'),
    );
    expect(hasElectronClass).toBe(true);

    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe('rgba(0, 0, 0, 0)');

    await expect(page.locator('.stage')).toHaveCount(0);

    await troko.openIsland();
    await page.getByTestId('exit-troko-btn').click();

    await expect(page.getByTestId('exit-overlay')).toHaveCount(0);
    const quitCalls = await page.evaluate(
      () =>
        (window as unknown as { __trokoCalls?: { quitApp: number } }).__trokoCalls
          ?.quitApp ?? 0,
    );
    expect(quitCalls).toBe(1);
  });
});
