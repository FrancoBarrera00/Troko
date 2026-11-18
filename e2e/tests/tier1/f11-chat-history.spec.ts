import {
  emitSimulatedSpeech,
  expect,
  installSpeechRecognitionShim,
  resetTrokoState,
  test,
} from '../../helpers/troko.js';

test.describe('F11: Chat Conversational History', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('T1-F11-01: Multi-turn conversation renders alternating user and Troko messages in order', async ({
    api,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Chat');

    await troko.submitQuickPrompt('Hola Troko, ¿cómo estás?');
    await expect(troko.islandLocator).toContainText(/Hola Troko, ¿cómo estás\?/i);

    await troko.submitQuickPrompt('¿Cuántas tareas tengo pendientes?');
    await expect(troko.islandLocator).toContainText(/¿Cuántas tareas tengo pendientes\?/i);

    await expect
      .poll(async () => (await api.getChat()).length, { timeout: 6_000 })
      .toBeGreaterThanOrEqual(4);

    const messages = await api.getChat();
    expect(messages[0].role).toBe('user');
    expect(messages[1].role).toBe('assistant');
    expect(messages[2].role).toBe('user');
    expect(messages[3].role).toBe('assistant');
  });

  test('T1-F11-02: Commands executed via Chat render tool-execution badges alongside Troko reply', async ({
    api,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Chat');

    await troko.submitQuickPrompt('Anota una tarea enviar factura');

    await expect
      .poll(async () => {
        const msgs = await api.getChat();
        return msgs.some(
          (m) =>
            m.role === 'assistant' &&
            Boolean(m.intent_json ?? m.intentJson ?? m.intent),
        );
      })
      .toBe(true);

    await expect(troko.islandLocator).toContainText(/enviar factura|Tarea|Anotad/i);
  });

  test('T1-F11-03: Voice-originated commands appear in Chat history with voice input_mode', async ({
    api,
    page,
    troko,
  }) => {
    await api.completeOnboarding();
    await installSpeechRecognitionShim(page);
    await troko.goto();

    const micBtn = page
      .locator('#island button[aria-label*="voz" i], #island button[aria-label*="mic" i], #island [data-testid="mic-btn"]')
      .first();
    await micBtn.click();
    await emitSimulatedSpeech(page, 'Troko, anota una tarea llamar a mamá', true);

    await troko.openTab('Chat');
    await expect(troko.islandLocator).toContainText(/llamar a mamá/i, { timeout: 6_000 });

    const msgs = await api.getChat();
    expect(
      msgs.some(
        (m) =>
          (m.input_mode === 'voice' || m.inputMode === 'voice') &&
          String(m.content ?? '').toLowerCase().includes('llamar a mamá'),
      ),
    ).toBe(true);
  });

  test('T1-F11-04: Conversational history persists locally across full browser reload', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Chat');

    await troko.submitQuickPrompt('Recuérdame que este mensaje debe persistir');
    await expect
      .poll(async () => (await api.getChat()).length, { timeout: 6_000 })
      .toBeGreaterThanOrEqual(2);

    await page.reload();
    await troko.openTab('Chat');
    await expect(troko.islandLocator).toContainText(
      /Recuérdame que este mensaje debe persistir/i,
    );
  });

  test('T1-F11-05: Clearing chat history removes all messages from UI and SQLite (DELETE /api/chat)', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await api.sendCommand('Primer mensaje de prueba', 'text');

    await troko.openTab('Chat');
    await expect(troko.islandLocator).toContainText(/Primer mensaje de prueba/i);

    const clearPromise = page.waitForResponse(
      (res) => res.url().includes('/api/chat') && res.request().method() === 'DELETE',
    );
    await page
      .getByRole('button', { name: /Limpiar|Borrar chat|Vaciar/i })
      .first()
      .click();
    const confirmBtn = page.getByRole('button', { name: /Confirmar|Sí/i }).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }
    expect((await clearPromise).status()).toBe(200);

    expect(await api.getChat()).toHaveLength(0);

    await page.reload();
    await troko.openTab('Chat');
    await expect(troko.islandLocator).not.toContainText(/Primer mensaje de prueba/i);
  });
});
