import {
  expect,
  installSpeechRecognitionShim,
  resetTrokoState,
  test,
} from '../../helpers/troko.js';

test.describe('F10: Inicio Home Summary & Command Bar', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('T1-F10-01: Inicio renders command bar, mic button, lime send button, and ATAJOS shortcuts', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openIsland();

    const promptInput = page.getByPlaceholder(/Escribe o habla con Troko/i).first();
    await expect(promptInput).toBeVisible();
    await expect(promptInput).toBeEditable();

    const sendBtn = page.getByRole('button', { name: /Enviar|↑/i }).first();
    await expect(sendBtn).toBeVisible();

    await expect(troko.islandLocator).toContainText(/ATAJOS/i);
    await expect(page.getByRole('button', { name: /Hablar/i }).first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: /\+ Nueva tarea/i }).first(),
    ).toBeVisible();
  });

  test('T1-F10-02: Submitting a command via Inicio prompt executes intent, clears input, and updates KPI', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Inicio');

    const promptInput = page.getByPlaceholder(/Escribe o habla con Troko/i).first();
    const cmdPromise = page.waitForResponse(
      (res) => res.url().includes('/api/chat/command') && res.request().method() === 'POST',
    );
    await troko.submitQuickPrompt('Anota una tarea preparar presentación');
    expect((await cmdPromise).status()).toBe(200);

    await expect(promptInput).toHaveValue('');
    const pendingTasksKpi = troko.islandLocator
      .locator('[data-testid="kpi-pending-tasks"], div, section, article, button')
      .filter({ hasText: /tareas?\s+pendientes?/i })
      .filter({ hasText: /\d+/ })
      .filter({ hasNotText: /hábitos hoy|próximo aviso/i })
      .last();
    await expect(pendingTasksKpi).toContainText(/\b1\b/);
  });

  test('T1-F10-03: All 3 KPI cards (hábitos hoy, tareas pendientes, próximo aviso) reflect /api/summary', async ({
    api,
    troko,
  }) => {
    await api.createHabit({
      name: 'Leer',
      sceneId: 'book',
      unitLabel: 'páginas',
      dailyGoal: 10,
    });
    const t1 = await api.createTask('Tarea KPI 1');
    await api.createTask('Tarea KPI 2');
    const t1Id = String(t1.id ?? (t1.task as Record<string, unknown>)?.id);

    const inTwoHours = new Date(Date.now() + 2 * 3600_000).toISOString();
    await api.createReminder({ title: 'Llamar al médico', triggerAt: inTwoHours });

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Inicio');

    const habitsKpi = troko.islandLocator
      .locator('[data-testid="kpi-habits-today"], div, section, article, button')
      .filter({ hasText: /hábitos?\s+hoy/i })
      .filter({ hasText: /\d+\s*\/\s*\d+/ })
      .filter({ hasNotText: /tareas?\s+pendientes?|próximo aviso/i })
      .last();
    const pendingTasksKpi = troko.islandLocator
      .locator('[data-testid="kpi-pending-tasks"], div, section, article, button')
      .filter({ hasText: /tareas?\s+pendientes?/i })
      .filter({ hasText: /\d+/ })
      .filter({ hasNotText: /hábitos hoy|próximo aviso/i })
      .last();
    const nextReminderKpi = troko.islandLocator
      .locator('[data-testid="kpi-next-reminder"], div, section, article, button')
      .filter({ hasText: /próximo aviso/i })
      .filter({ hasNotText: /hábitos hoy|tareas?\s+pendientes?/i })
      .last();

    await expect(habitsKpi).toContainText(/0\/1/);
    await expect(pendingTasksKpi).toContainText(/\b2\b/);
    await expect(nextReminderKpi).toContainText(/Llamar al médico/i);

    await api.updateTask(t1Id, { completed: true });
    await expect(pendingTasksKpi).toContainText(/\b1\b/, { timeout: 6_000 });
  });

  test('T1-F10-04: ATAJOS chip "+ Nueva tarea" triggers task creation and persists', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Inicio');

    await page.getByRole('button', { name: /\+ Nueva tarea/i }).first().click();

    const taskInput = page
      .getByPlaceholder(/Nueva tarea|Escribe.*tarea|Título/i)
      .or(page.getByPlaceholder(/Escribe o habla con Troko/i))
      .first();
    await taskInput.fill('Comprar fruta');
    await taskInput.press('Enter');

    await expect
      .poll(async () => {
        const tasks = await api.listTasks();
        return tasks.some((t) => String(t.title ?? '').toLowerCase().includes('comprar fruta'));
      })
      .toBe(true);
  });

  test('T1-F10-05: ATAJOS chip "Hablar" initiates voice listening mode', async ({
    api,
    page,
    troko,
  }) => {
    await installSpeechRecognitionShim(page);
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Inicio');

    await page.getByRole('button', { name: /Hablar/i }).first().click();

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 5_000 })
      .toBe('listen');
    expect(await troko.getIslandStatusText()).toMatch(/Escuchando/i);
  });
});
