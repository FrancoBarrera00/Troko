import {
  expect,
  resetTrokoState,
  startMockOpenAiServer,
  test,
} from '../../helpers/troko.js';

test.describe('F7: Local AI Brain & Pluggable LLM', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('T1-F07-01: Offline Spanish NLU intent router executes task and timer commands with zero external LLM', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Inicio');

    const cmdPromise1 = page.waitForResponse(
      (res) => res.url().includes('/api/chat/command') && res.request().method() === 'POST',
    );
    await troko.submitQuickPrompt('Anota una tarea revisar correo');
    const res1 = await cmdPromise1;
    expect(res1.status()).toBe(200);

    await troko.openTab('Chat');
    const cmdPromise2 = page.waitForResponse(
      (res) => res.url().includes('/api/chat/command') && res.request().method() === 'POST',
    );
    await troko.submitQuickPrompt('Temporizador de 5 minutos');
    const res2 = await cmdPromise2;
    expect(res2.status()).toBe(200);

    const tasks = await api.listTasks();
    expect(
      tasks.some((t) => String(t.title ?? '').toLowerCase().includes('revisar correo')),
    ).toBe(true);

    const timers = await api.listTimers();
    expect(
      timers.some((tm) => Number(tm.duration_sec ?? tm.durationSec) === 300),
    ).toBe(true);
  });

  test('T1-F07-02: Offline English NLU intent router parses English task and focus commands accurately', async ({
    api,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Chat');

    await troko.submitQuickPrompt('Add a task buy milk');
    await expect
      .poll(async () => {
        const tasks = await api.listTasks();
        return tasks.some((t) => String(t.title ?? '').toLowerCase().includes('buy milk'));
      })
      .toBe(true);

    await troko.submitQuickPrompt('Start focus 25 minutes');
    await expect
      .poll(async () => {
        const focus = await api.getFocus();
        const session = (focus.session ?? focus) as Record<string, unknown>;
        return Number(session.duration_sec ?? session.durationSec);
      })
      .toBe(1500);
  });

  test('T1-F07-03: Configuring a pluggable AI provider (Ollama / OpenAI-compatible) in Ajustes persists via /api/settings', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Ajustes');

    const aiSection = page
      .locator('[data-testid="settings-section-ai"], section:has-text("IA"), div:has-text("Proveedor")')
      .first();
    await expect(aiSection).toBeVisible();

    const providerSelect = aiSection.locator('select').first();
    if ((await providerSelect.count()) > 0) {
      const options = await providerSelect.locator('option').evaluateAll((els) =>
        els.map((o) => ({
          value: (o as HTMLOptionElement).value,
          label: (o.textContent ?? '').trim(),
        })),
      );
      const preferred =
        options.find((o) => /ollama/i.test(o.value) || /ollama/i.test(o.label)) ??
        options.find((o) => /openai/i.test(o.value) || /openai/i.test(o.label)) ??
        options.find((o) => /local/i.test(o.value) || /local/i.test(o.label));
      if (preferred) {
        await providerSelect.selectOption(preferred.value);
      }
    }

    const endpointInput = aiSection
      .locator('input[name*="endpoint" i], input[name*="url" i], input[placeholder*="http" i]')
      .first();
    await endpointInput.fill('http://127.0.0.1:11434');

    const modelInput = aiSection
      .locator('input[name*="model" i], input[placeholder*="llama" i]')
      .first();
    await modelInput.fill('llama3.2:3b');

    const saveBtn = aiSection.getByRole('button', { name: /Guardar/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
    }

    await expect
      .poll(async () => JSON.stringify(await api.getSettings()))
      .toContain('11434');

    await page.reload();
    await troko.openTab('Ajustes');
    await expect(endpointInput).toHaveValue('http://127.0.0.1:11434');
    await expect(modelInput).toHaveValue('llama3.2:3b');
  });

  test('T1-F07-04: When configured external AI provider is unreachable, Troko falls back cleanly to built-in offline NLU', async ({
    api,
    page,
    troko,
  }) => {
    await api.completeOnboarding();
    await api.patchSettings({
      aiProvider: 'openai',
      aiEndpoint: 'http://127.0.0.1:59999',
      aiModel: 'llama3.2:3b',
    });

    await troko.goto();
    await troko.openTab('Chat');

    const taskResPromise = page.waitForResponse(
      (res) => res.url().includes('/api/chat/command') && res.request().method() === 'POST',
    );
    await troko.submitQuickPrompt('Anota una tarea planificar semana');
    expect((await taskResPromise).status()).toBe(200);

    const chatResPromise = page.waitForResponse(
      (res) => res.url().includes('/api/chat/command') && res.request().method() === 'POST',
    );
    await troko.submitQuickPrompt('¿Qué puedes hacer hoy?');
    expect((await chatResPromise).status()).toBe(200);

    const tasks = await api.listTasks();
    expect(
      tasks.some((t) => String(t.title ?? '').toLowerCase().includes('planificar semana')),
    ).toBe(true);
    await expect(troko.islandLocator).toContainText(/tareas|hábitos|enfoque|puedo/i);
  });

  test('T1-F07-05: Pluggable AIProvider uses live mock OpenAI-compatible endpoint when available', async ({
    api,
    troko,
  }) => {
    const mockServer = await startMockOpenAiServer(
      '¡Hola! Tu agenda está lista y con mucha chispa hoy.',
    );
    try {
      await api.completeOnboarding();
      await api.patchSettings({
        aiProvider: 'openai',
        aiEndpoint: mockServer.url,
        aiModel: 'mock-troko-model',
      });

      await troko.goto();
      await troko.openTab('Chat');
      await troko.submitQuickPrompt('Resume mi día con humor');

      await expect(troko.islandLocator).toContainText(/mucha chispa hoy/i, {
        timeout: 8_000,
      });
      expect(mockServer.requests.length).toBeGreaterThanOrEqual(1);
    } finally {
      await mockServer.close();
    }
  });
});
