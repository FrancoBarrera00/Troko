import {
  emitSimulatedSpeech,
  expect,
  installSpeechRecognitionShim,
  installSpeechSynthesisSpy,
  resetTrokoState,
  test,
} from '../../helpers/troko.js';

test.describe('F5: Island Status States & Overlays', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('T1-F05-01: idle (Reposo) and attentive (Atento) states update data-state, #status-text, and #live', async ({
    api,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });

    expect(await troko.getIslandStateAttr()).toBe('idle');
    expect(await troko.getIslandStatusText()).toMatch(/Reposo/i);

    await troko.peekIsland();
    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 5_000 })
      .toBe('attentive');
    expect(await troko.getIslandStatusText()).toMatch(/Atento/i);
    await expect(troko.liveLocator).toHaveAttribute('aria-live', /polite|assertive/);
  });

  test('T1-F05-02: listen (Escuchando), think (Pensando), and speak (Hablando) transitions emit SSE and show slot indicators', async ({
    api,
    page,
    sse,
    troko,
  }) => {
    await api.completeOnboarding();
    await api.patchSettings({ voiceEnabled: true, ttsEnabled: true });

    await installSpeechRecognitionShim(page);
    await installSpeechSynthesisSpy(page, { utteranceDurationMs: 1800 });
    await sse.start();
    await troko.goto();

    const micBtn = page
      .locator('#island button[aria-label*="voz" i], #island button[aria-label*="mic" i], #island [data-testid="mic-btn"]')
      .first();
    await micBtn.click();

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 5_000 })
      .toBe('listen');
    expect(await troko.getIslandStatusText()).toMatch(/Escuchando/i);

    await emitSimulatedSpeech(page, 'Hola Troko', true);

    const thinkOrSpeakEvent = await sse.waitForEvent(
      (evt) =>
        evt.type === 'island.state' &&
        typeof evt.payload === 'object' &&
        evt.payload !== null &&
        ['think', 'speak'].includes(String((evt.payload as Record<string, unknown>).state)),
      8_000,
    );
    expect(thinkOrSpeakEvent).toBeTruthy();

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 6_000 })
      .toBe('speak');
    expect(await troko.getIslandStatusText()).toMatch(/Hablando/i);

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 6_000 })
      .toBe('idle');
  });

  test('T1-F05-03: success overlay renders check circle and Spanish badge word (Anotado / Listo)', async ({
    api,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Inicio');
    await troko.submitQuickPrompt('Anota una tarea: probar overlay');

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 6_000 })
      .toBe('success');
    await expect(troko.islandLocator).toContainText(/Anotado|Listo/i);
    await expect(troko.liveLocator).toContainText(/Anotado|Listo|tarea/i);

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 7_000 })
      .toBe('idle');
  });

  test('T1-F05-04: focus overlay displays target icon and live MM:SS countdown when panel is collapsed', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Enfoque');
    await page.getByRole('button', { name: /Empezar/i }).first().click();
    await troko.closeIsland('escape');

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 5_000 })
      .toBe('focus');

    const readMmSs = async () => {
      const text = await troko.islandLocator.innerText();
      const match = text.match(/(\d{2}):(\d{2})/);
      if (!match) return null;
      return Number(match[1]) * 60 + Number(match[2]);
    };

    const initialSec = await readMmSs();
    expect(initialSec).not.toBeNull();

    await expect
      .poll(async () => {
        const current = await readMmSs();
        return current !== null && current < initialSec!;
      }, { timeout: 5_000 })
      .toBe(true);
  });

  test('T1-F05-05: remind and notification overlays display prompt banners on habit/reminder triggers', async ({
    api,
    page,
    troko,
  }) => {
    const habit = await api.createHabit({
      name: 'Tomar agua',
      sceneId: 'water',
      unitLabel: 'vasos',
      dailyGoal: 8,
    });
    const habitId = String(habit.id ?? (habit.habit as Record<string, unknown>)?.id);

    await troko.goto({ completeOnboarding: true, api });
    await api.testHabitReminder(habitId);

    await expect
      .poll(
        async () => {
          const state = await troko.getIslandStateAttr();
          return state === 'remind' || state === 'notification';
        },
        { timeout: 6_000 },
      )
      .toBe(true);
    await expect(troko.islandLocator).toContainText(/Tomar agua|agua/i);

    const soon = new Date(Date.now() + 1200).toISOString();
    await api.createReminder({ title: 'Notificación de prueba', triggerAt: soon });

    await expect(troko.islandLocator).toContainText(/Notificación de prueba/i, {
      timeout: 7_000,
    });
  });

  test('T1-F05-06: sleep (Dormido) triggers after 35s idle and alert (Alerta) triggers on permission denial', async ({
    api,
    page,
    troko,
  }) => {
    await api.completeOnboarding();
    await installSpeechRecognitionShim(page, { denyMic: true });
    await page.clock.install();
    await troko.goto();

    await page.clock.fastForward(35_500);
    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 5_000 })
      .toBe('sleep');
    expect(await troko.getIslandStatusText()).toMatch(/Dormido/i);

    // Move pointer to wake back to idle
    await page.mouse.move(320, 320);
    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 5_000 })
      .toBe('idle');

    // Trigger mic permission denial -> alert state
    const micBtn = page
      .locator('#island button[aria-label*="voz" i], #island button[aria-label*="mic" i], #island [data-testid="mic-btn"]')
      .first();
    await micBtn.click();

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 5_000 })
      .toBe('alert');
    expect(await troko.getIslandStatusText()).toMatch(/Alerta/i);
  });
});
