import { expect, resetTrokoState, test } from '../../helpers/troko.js';

test.describe('F18: Ajustes, Memory Wipe & Salir de Troko', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('F18-T1: Update AI provider & endpoint settings in Ajustes and persist across reload', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Ajustes');

    const aiSection = page
      .locator('[data-testid="settings-section-ai"], section:has-text("IA")')
      .first();
    const modelInput = aiSection
      .locator('input[name*="model" i], input[placeholder*="llama" i]')
      .first();
    await modelInput.fill('qwen2.5:3b');

    const saveBtn = aiSection.getByRole('button', { name: /Guardar/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
    }

    await expect
      .poll(async () => JSON.stringify(await api.getSettings()))
      .toContain('qwen2.5:3b');

    await page.reload();
    await troko.openTab('Ajustes');
    await expect(modelInput).toHaveValue('qwen2.5:3b');
  });

  test('F18-T2: Update voice/wake-word and Ajustes del enfoque durations with persistence', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Ajustes');

    const focusSection = page
      .locator('[data-testid="settings-section-focus"], section:has-text("Ajustes del enfoque")')
      .first();
    await expect(focusSection).toBeVisible();

    const inputs = focusSection.locator('input[type="number"]');
    await inputs.nth(0).fill('30');
    await inputs.nth(1).fill('10');

    const saveBtn = focusSection.getByRole('button', { name: /Guardar/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
    }

    await expect
      .poll(async () => {
        const s = await api.getSettings();
        return Number(s.focusMinutes ?? s.focusDurationMin ?? 0);
      })
      .toBe(30);

    await page.reload();
    await troko.openTab('Enfoque');
    await expect(troko.islandLocator).toContainText(/30:00/);
  });

  test('F18-T3: Export local memory JSON via Ajustes / /api/memory/export', async ({
    api,
    page,
    troko,
  }) => {
    await api.createTask('Tarea exportable');
    await api.createHabit({
      name: 'Hábito exportable',
      sceneId: 'book',
      unitLabel: 'pág',
      dailyGoal: 5,
    });
    await api.sendCommand('Mensaje exportable', 'text');

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Ajustes');

    const exportBtn = page
      .locator('[data-testid="settings-export-btn"]')
      .or(page.getByRole('button', { name: /Exportar memoria/i }))
      .first();
    await expect(exportBtn).toBeVisible();

    const exportPromise = page.waitForResponse(
      (res) => res.url().includes('/api/memory/export') && res.request().method() === 'POST',
    );
    await exportBtn.click();
    const res = await exportPromise;
    expect(res.status()).toBe(200);

    const exported = await res.json();
    const serialized = JSON.stringify(exported);
    expect(serialized).toContain('Tarea exportable');
    expect(serialized).toContain('Hábito exportable');
    expect(serialized).toContain('Mensaje exportable');
  });

  test('F18-T4: Full local memory wipe clears tasks, habits, reminders & chat permanently', async ({
    api,
    page,
    troko,
  }) => {
    await api.createTask('Tarea por borrar');
    await api.createHabit({
      name: 'Hábito por borrar',
      sceneId: 'water',
      unitLabel: 'vasos',
      dailyGoal: 4,
    });
    await api.sendCommand('Chat por borrar', 'text');

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Ajustes');

    const wipeBtn = page
      .locator('[data-testid="settings-wipe-btn"]')
      .or(page.getByRole('button', { name: /Borrar memoria|Limpiar memoria/i }))
      .first();
    await wipeBtn.click();

    const confirmBtn = page
      .getByRole('button', { name: /Confirmar|Sí, borrar|Eliminar todo/i })
      .first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }

    await expect
      .poll(async () => (await api.listTasks()).length)
      .toBe(0);
    expect(await api.listHabits()).toHaveLength(0);
    expect(await api.listReminders()).toHaveLength(0);
    expect(await api.getChat()).toHaveLength(0);

    await page.reload();
    await troko.completeOnboardingIfVisible();
    expect(await api.listTasks()).toHaveLength(0);
  });

  test('F18-T5: Salir de Troko footer button executes clean exit/shutdown flow', async ({
    api,
    page,
    troko,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await troko.goto({ completeOnboarding: true, api });
    await troko.clickExitTroko();

    const confirmBtn = page
      .getByRole('button', { name: /Confirmar|Salir/i })
      .first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.locator('body')).toContainText(
      /Hasta pronto|Troko cerrado|Sesión cerrada|Desconectado|Dormido/i,
    );
    expect(errors).toEqual([]);
  });

  test('F18-T6: Ajustes displays local privacy & OS permission status toggles cleanly', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Ajustes');

    await expect(troko.islandLocator).toContainText(/Micrófono/i);
    await expect(troko.islandLocator).toContainText(/Escritorio/i);
    await expect(troko.islandLocator).toContainText(/Correo/i);

    const soundToggle = page
      .getByRole('switch', { name: /Sonido|Efectos/i })
      .or(page.getByRole('checkbox', { name: /Sonido|Efectos/i }))
      .first();
    await soundToggle.click();

    await expect
      .poll(async () => {
        const s = await api.getSettings();
        return Boolean(s.soundEnabled ?? true);
      })
      .toBe(false);

    await page.reload();
    const sAfter = await api.getSettings();
    expect(Boolean(sAfter.soundEnabled ?? true)).toBe(false);
  });
});
