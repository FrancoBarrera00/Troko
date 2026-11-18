import {
  emitSimulatedSpeech,
  expect,
  installSpeechRecognitionShim,
  resetTrokoState,
  test,
} from '../../helpers/troko.js';

test.describe('F6: Wake-Word & Natural Voice Commands', () => {
  test.beforeEach(async ({ api, page }) => {
    await resetTrokoState(api);
    await api.completeOnboarding();
    await api.patchSettings({ wakeWordEnabled: true });
    await installSpeechRecognitionShim(page);
  });

  test('T1-F06-01: Saying wake word "Troko" while collapsed wakes island into listen (Escuchando) state', async ({
    page,
    troko,
  }) => {
    await troko.goto();
    const initialBox = await troko.islandLocator.boundingBox();
    expect(initialBox).not.toBeNull();

    await emitSimulatedSpeech(page, 'Troko', false);

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 5_000 })
      .toBe('listen');
    expect(await troko.getIslandStatusText()).toMatch(/Escuchando/i);

    const listeningBox = await troko.islandLocator.boundingBox();
    expect(listeningBox).not.toBeNull();
    expect(listeningBox!.width).toBeGreaterThanOrEqual(initialBox!.width);
  });

  test('T1-F06-02: Clicking microphone button activates push-to-talk and shows live transcript bubble below closed island', async ({
    page,
    troko,
  }) => {
    await troko.goto();

    const micBtn = page
      .locator('#island button[aria-label*="voz" i], #island button[aria-label*="mic" i], #island [data-testid="mic-btn"]')
      .first();
    await micBtn.click();

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 5_000 })
      .toBe('listen');

    await emitSimulatedSpeech(page, 'Anota una tarea', false);
    const bubble = page
      .locator('[data-testid="transcript-bubble"], #island-transcript, #island + [role="status"]')
      .first();
    await expect(bubble).toContainText(/Anota una tarea/i);

    await emitSimulatedSpeech(page, 'Anota una tarea comprar pan', true);
    await expect(bubble).toContainText(/comprar pan/i);
  });

  test('T1-F06-03: Natural Spanish voice command "Troko, anota una tarea: comprar pan" executes and persists task', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto();
    await emitSimulatedSpeech(page, 'Troko, anota una tarea: comprar pan', true);

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 6_000 })
      .toBe('success');
    await expect(troko.islandLocator).toContainText(/Anotado|Listo/i);

    await troko.openTab('Tareas');
    await expect(troko.islandLocator).toContainText(/comprar pan/i);

    const tasks = await api.listTasks();
    expect(
      tasks.some((t) => String(t.title ?? '').toLowerCase().includes('comprar pan')),
    ).toBe(true);

    const messages = await api.getChat();
    expect(
      messages.some(
        (m) =>
          (m.input_mode === 'voice' || m.inputMode === 'voice') &&
          String(m.content ?? '').toLowerCase().includes('comprar pan'),
      ),
    ).toBe(true);
  });

  test('T1-F06-04: Voice command "Troko, enfócate 25 minutos" starts a Pomodoro focus session', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto();
    await emitSimulatedSpeech(page, 'Troko, enfócate 25 minutos', true);

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 6_000 })
      .toBe('focus');
    await expect(troko.islandLocator).toContainText(/25:00|24:5\d/);

    const focus = await api.getFocus();
    const session = (focus.session ?? focus) as Record<string, unknown>;
    expect(Number(session.duration_sec ?? session.durationSec)).toBe(1500);
    expect(['active', 'running']).toContain(String(session.status));
  });

  test('T1-F06-05: Voice command "Troko, descansa" transitions Troko into sleep (Dormido) state', async ({
    page,
    troko,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await troko.goto();
    await emitSimulatedSpeech(page, 'Troko, descansa', true);

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 6_000 })
      .toBe('sleep');
    expect(await troko.getIslandStatusText()).toMatch(/Dormido/i);

    await troko.openIsland();
    expect(await troko.getIslandStateAttr()).not.toBe('sleep');
    expect(errors).toEqual([]);
  });
});
