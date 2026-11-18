import {
  expect,
  installSpeechSynthesisSpy,
  resetTrokoState,
  test,
} from '../../helpers/troko.js';

test.describe('F8: Local TTS & "Con voz" Toggle', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('T1-F08-01: "Con voz" toggle is visible in the panel and persists across reloads via /api/settings', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openIsland();

    const toggle = page
      .getByRole('switch', { name: /Con voz/i })
      .or(page.getByRole('checkbox', { name: /Con voz/i }))
      .or(page.getByRole('button', { name: /Con voz/i }))
      .first();
    await expect(toggle).toBeVisible();

    const patchPromise = page.waitForResponse(
      (res) => res.url().includes('/api/settings') && res.request().method() === 'PATCH',
    );
    await troko.toggleVoiceOutput(true);
    expect((await patchPromise).status()).toBe(200);

    await page.reload();
    await troko.openIsland();

    const settings = await api.getSettings();
    const persisted = Boolean(
      settings.voiceEnabled ?? settings.ttsEnabled ?? settings.conVoz,
    );
    expect(persisted).toBe(true);
  });

  test('T1-F08-02: With "Con voz" ON, sending a command triggers TTS output and speak (Hablando) state', async ({
    api,
    page,
    troko,
  }) => {
    await api.completeOnboarding();
    await installSpeechSynthesisSpy(page, { utteranceDurationMs: 600 });

    await troko.goto();
    await troko.toggleVoiceOutput(true);
    await troko.openTab('Inicio');
    await troko.submitQuickPrompt('Hola Troko');

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const win = window as unknown as {
            __ttsUtterances?: Array<{ text: string; lang: string }>;
          };
          return win.__ttsUtterances?.length ?? 0;
        }),
      )
      .toBeGreaterThanOrEqual(1);

    const utterances = await page.evaluate(() => {
      const win = window as unknown as {
        __ttsUtterances?: Array<{ text: string; lang: string }>;
      };
      return win.__ttsUtterances ?? [];
    });
    expect(utterances[0].lang.toLowerCase()).toMatch(/^es/);
    expect(utterances[0].text.trim().length).toBeGreaterThan(0);

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 6_000 })
      .toBe('idle');
  });

  test('T1-F08-03: Toggling "Con voz" OFF silences TTS playback while preserving visual feedback', async ({
    api,
    page,
    troko,
  }) => {
    await api.completeOnboarding();
    await installSpeechSynthesisSpy(page);

    await troko.goto();
    await troko.toggleVoiceOutput(false);
    await page.evaluate(() => {
      const win = window as unknown as { __ttsUtterances?: unknown[] };
      win.__ttsUtterances = [];
    });

    await troko.openTab('Inicio');
    await troko.submitQuickPrompt('Anota una tarea leer documentación');

    await expect
      .poll(async () => {
        const tasks = await api.listTasks();
        return tasks.some((t) =>
          String(t.title ?? '').toLowerCase().includes('leer documentación'),
        );
      })
      .toBe(true);

    const count = await page.evaluate(() => {
      const win = window as unknown as { __ttsUtterances?: unknown[] };
      return win.__ttsUtterances?.length ?? 0;
    });
    expect(count).toBe(0);
  });

  test('T1-F08-04: Toggling "Con voz" OFF mid-speech immediately cancels active TTS playback', async ({
    api,
    page,
    troko,
  }) => {
    await api.completeOnboarding();
    await installSpeechSynthesisSpy(page, { utteranceDurationMs: 5_000 });

    await troko.goto();
    await troko.toggleVoiceOutput(true);
    await troko.openTab('Chat');
    await troko.submitQuickPrompt('Cuéntame qué puedes hacer');

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 6_000 })
      .toBe('speak');

    await troko.toggleVoiceOutput(false);

    const cancelCount = await page.evaluate(() => {
      const win = window as unknown as { __ttsCancelCount?: number };
      return win.__ttsCancelCount ?? 0;
    });
    expect(cancelCount).toBeGreaterThanOrEqual(1);

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 5_000 })
      .not.toBe('speak');
  });

  test('T1-F08-05: Reminder alert respects "Con voz" toggle (speaks when ON, visual-only when OFF)', async ({
    api,
    page,
    troko,
  }) => {
    await api.completeOnboarding();
    const habit = await api.createHabit({
      name: 'Tomar agua',
      sceneId: 'water',
      unitLabel: 'vasos',
      dailyGoal: 8,
    });
    const habitId = String(habit.id ?? (habit.habit as Record<string, unknown>)?.id);

    await installSpeechSynthesisSpy(page);
    await troko.goto();
    await troko.toggleVoiceOutput(true);
    await api.testHabitReminder(habitId);

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const win = window as unknown as { __ttsUtterances?: unknown[] };
          return win.__ttsUtterances?.length ?? 0;
        }),
      )
      .toBeGreaterThanOrEqual(1);

    await troko.toggleVoiceOutput(false);
    await page.evaluate(() => {
      const win = window as unknown as { __ttsUtterances?: unknown[] };
      win.__ttsUtterances = [];
    });

    await api.testHabitReminder(habitId);
    await expect(troko.islandLocator).toContainText(/agua/i, { timeout: 6_000 });

    const silentCount = await page.evaluate(() => {
      const win = window as unknown as { __ttsUtterances?: unknown[] };
      return win.__ttsUtterances?.length ?? 0;
    });
    expect(silentCount).toBe(0);
  });
});
