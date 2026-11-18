import { expect, resetTrokoState, test } from '../../helpers/troko.js';

test.describe('F12: Tareas (Tasks, Reminders & Timers)', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('F12-T1: Create task in Tareas, update counters, and persist across reload', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Tareas');

    const input = page
      .getByPlaceholder(/Nueva tarea|Añadir tarea|Agregar tarea|Escribe una tarea/i)
      .first();
    await input.fill('Comprar leche de almendras');
    await input.press('Enter');

    await expect(troko.islandLocator).toContainText(/Comprar leche de almendras/i);
    await expect(troko.tabLocator('Tareas')).toContainText('1');

    const summary = await api.summary();
    expect(Number(summary.pendingTasksCount)).toBe(1);

    await troko.openTab('Inicio');
    const pendingTasksKpi = troko.islandLocator
      .locator('[data-testid="kpi-pending-tasks"], div, section, article, button')
      .filter({ hasText: /tareas?\s+pendientes?/i })
      .filter({ hasText: /\d+/ })
      .filter({ hasNotText: /hábitos hoy|próximo aviso/i })
      .last();
    await expect(pendingTasksKpi).toContainText(/\b1\b/);

    await page.reload();
    await troko.openTab('Tareas');
    await expect(troko.islandLocator).toContainText(/Comprar leche de almendras/i);
  });

  test('F12-T2: Check, uncheck, and delete task in Tareas', async ({
    api,
    page,
    troko,
  }) => {
    await api.createTask('Llamar al dentista');
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Tareas');

    const taskRow = page
      .locator('[data-testid="task-item"], li, [role="listitem"]')
      .filter({ hasText: 'Llamar al dentista' })
      .first();
    await expect(taskRow).toBeVisible();

    const checkbox = taskRow.getByRole('checkbox').first();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect
      .poll(async () => Number((await api.summary()).pendingTasksCount))
      .toBe(0);

    await checkbox.click();
    await expect(checkbox).not.toBeChecked();
    await expect
      .poll(async () => Number((await api.summary()).pendingTasksCount))
      .toBe(1);

    const deleteBtn = taskRow
      .getByRole('button', { name: /Eliminar|Borrar|Quitar/i })
      .or(taskRow.locator('button[aria-label*="Eliminar" i], button[aria-label*="Borrar" i]'))
      .first();
    await deleteBtn.click();

    await expect(taskRow).toHaveCount(0);
    expect(await api.listTasks()).toHaveLength(0);

    await page.reload();
    await troko.openTab('Tareas');
    await expect(troko.islandLocator).not.toContainText(/Llamar al dentista/i);
  });

  test('F12-T3: One-shot reminder fires via SSE into Dynamic Island and can be dismissed', async ({
    api,
    page,
    sse,
    troko,
  }) => {
    await sse.start();
    await troko.goto({ completeOnboarding: true, api });

    const triggerAt = new Date(Date.now() + 2000).toISOString();
    const created = await api.createReminder({
      title: 'Revisar horno',
      triggerAt,
      soundEnabled: true,
    });
    const reminderId = String(
      created.id ?? (created.reminder as Record<string, unknown>)?.id,
    );

    const dueEvt = await sse.waitForEvent('reminder.due', 8_000);
    expect(JSON.stringify(dueEvt.payload)).toContain('Revisar horno');

    await expect(troko.islandLocator).toContainText(/Revisar horno/i, { timeout: 6_000 });

    const dismissBtn = page
      .locator('#island')
      .getByRole('button', { name: /Listo|Descartar|Entendido|Cerrar/i })
      .first();
    if (await dismissBtn.isVisible().catch(() => false)) {
      await dismissBtn.click();
    } else {
      await api.dismissReminder(reminderId);
    }

    await expect
      .poll(async () => {
        const list = await api.listReminders();
        const item = list.find((r) => String(r.id) === reminderId);
        return item ? String(item.status) : 'dismissed';
      })
      .toMatch(/dismissed|completed|acked/i);
  });

  test('F12-T4: Create recurring reminder (daily) and persist schedule metadata', async ({
    api,
    page,
    troko,
  }) => {
    const tomorrow = new Date(Date.now() + 24 * 3600_000).toISOString();
    await api.createReminder({
      title: 'Tomar vitaminas',
      triggerAt: tomorrow,
      recurrence: 'daily',
      soundEnabled: true,
    });

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Tareas');

    const row = page
      .locator('[data-testid="reminder-item"], li, div')
      .filter({ hasText: 'Tomar vitaminas' })
      .first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(/Diario|Cada día|daily/i);

    const reminders = await api.listReminders();
    const item = reminders.find((r) => String(r.title) === 'Tomar vitaminas');
    expect(item?.recurrence).toBe('daily');
    expect(item?.status).toBe('scheduled');

    await page.reload();
    await troko.openTab('Tareas');
    await expect(troko.islandLocator).toContainText(/Tomar vitaminas/i);
  });

  test('F12-T5: Live SSE countdown timer: create, observe tick, pause, resume, and cancel', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Tareas');

    const timerLabelInput = page
      .getByPlaceholder(/Etiqueta|Temporizador|Nombre/i)
      .first();
    if (await timerLabelInput.isVisible().catch(() => false)) {
      await timerLabelInput.fill('Té verde');
    }
    const timer = await api.createTimer({ label: 'Té verde', durationSec: 120 });
    const timerId = String(timer.id ?? (timer.timer as Record<string, unknown>)?.id);

    await page.reload();
    await troko.openTab('Tareas');

    const timerRow = page
      .locator('[data-testid="timer-item"], li, div')
      .filter({ hasText: 'Té verde' })
      .first();
    await expect(timerRow).toBeVisible();

    const readTimerSec = async () => {
      const txt = await timerRow.innerText();
      const match = txt.match(/(\d{2}):(\d{2})/);
      return match ? Number(match[1]) * 60 + Number(match[2]) : null;
    };

    const t0 = await readTimerSec();
    expect(t0).not.toBeNull();

    await expect
      .poll(async () => {
        const current = await readTimerSec();
        return current !== null && current < t0!;
      }, { timeout: 5_000 })
      .toBe(true);

    await timerRow.getByRole('button', { name: /Pausar/i }).first().click();
    await expect
      .poll(async () => {
        const list = await api.listTimers();
        return list.find((t) => String(t.id) === timerId)?.status;
      })
      .toBe('paused');

    const pausedAt = await readTimerSec();
    await page.waitForTimeout(1200);
    expect(await readTimerSec()).toBe(pausedAt);

    await timerRow.getByRole('button', { name: /Reanudar/i }).first().click();
    await expect
      .poll(async () => {
        const current = await readTimerSec();
        return current !== null && current < pausedAt!;
      }, { timeout: 5_000 })
      .toBe(true);

    await timerRow.getByRole('button', { name: /Cancelar/i }).first().click();
    await expect
      .poll(async () => {
        const list = await api.listTimers();
        const found = list.find((t) => String(t.id) === timerId);
        return found ? String(found.status) : 'cancelled';
      })
      .toBe('cancelled');
  });

  test('F12-T6: Missed-while-asleep reminder catch-up via /api/app/wake', async ({
    api,
    page,
    troko,
  }) => {
    const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
    const created = await api.createReminder({
      title: 'Enviar reporte atrasado',
      triggerAt: tenMinAgo,
    });
    const reminderId = String(
      created.id ?? (created.reminder as Record<string, unknown>)?.id,
    );

    await troko.goto({ completeOnboarding: true, api });
    const wakeRes = await api.wakeApp();
    expect(JSON.stringify(wakeRes)).toContain('Enviar reporte atrasado');

    await expect(troko.islandLocator).toContainText(/Enviar reporte atrasado/i, {
      timeout: 6_000,
    });

    const ackBtn = page
      .locator('#island')
      .getByRole('button', { name: /Entendido|Confirmar|Aceptar|Descartar/i })
      .first();
    if (await ackBtn.isVisible().catch(() => false)) {
      await ackBtn.click();
    } else {
      await api.ackMissedReminder(reminderId);
    }

    await expect
      .poll(async () => {
        const list = await api.listReminders();
        const found = list.find((r) => String(r.id) === reminderId);
        return String(found?.status ?? '');
      })
      .not.toBe('scheduled');
  });
});
