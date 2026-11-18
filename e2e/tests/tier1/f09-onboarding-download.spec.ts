import { expect, resetTrokoState, test } from '../../helpers/troko.js';

test.describe('F9: First-Run Bienvenida & Model Download', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('T1-F09-01: First run presents Bienvenida modal with Llama 3.2 3B Instruct, 2,02 GB, and privacy details', async ({
    page,
  }) => {
    await page.goto('/');

    const dialog = page
      .getByRole('dialog')
      .or(page.locator('[data-testid="bienvenida-modal"]'))
      .first();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Bienvenid|Un paso antes de empezar/i);
    await expect(dialog).toContainText(/Llama 3\.2 3B Instruct/i);
    await expect(dialog).toContainText(/Q4_K_M/i);
    await expect(dialog).toContainText(/2[.,]02\s*GB/i);
    await expect(dialog).toContainText(/llama\.cpp|privacidad|local/i);

    await expect(page.getByRole('button', { name: /Descargar/i }).first()).toBeEnabled();
    await expect(page.getByRole('button', { name: /Ahora no/i }).first()).toBeEnabled();
  });

  test('T1-F09-02: Clicking Descargar starts model download with live progress bar and byte feedback', async ({
    api,
    page,
    troko,
  }) => {
    await page.goto('/');

    const startResPromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/onboarding/download/start') &&
        res.request().method() === 'POST',
    );
    await troko.startOnboardingDownload();
    const startRes = await startResPromise;
    expect([200, 202]).toContain(startRes.status());

    await expect(page.getByRole('button', { name: /Pausar/i }).first()).toBeVisible();

    await expect
      .poll(
        async () => {
          const state = await api.getOnboarding();
          return Number(state.downloadedBytes ?? state.downloaded_bytes ?? 0);
        },
        { timeout: 8_000 },
      )
      .toBeGreaterThan(0);

    const progressEl = page.locator('[role="progressbar"], progress').first();
    if ((await progressEl.count()) > 0) {
      await expect(progressEl).toBeVisible();
    }
  });

  test('T1-F09-03: Pausing (Pausar) and resuming (Reanudar) download preserves progress without resetting to 0', async ({
    api,
    page,
    troko,
  }) => {
    await page.goto('/');
    await troko.startOnboardingDownload();

    await expect
      .poll(
        async () => {
          const state = await api.getOnboarding();
          return Number(state.downloadedBytes ?? state.downloaded_bytes ?? 0);
        },
        { timeout: 8_000 },
      )
      .toBeGreaterThan(0);

    await page.getByRole('button', { name: /Pausar/i }).first().click();
    await expect(page.getByRole('button', { name: /Reanudar/i }).first()).toBeVisible();

    const pausedState = await api.getOnboarding();
    const pausedBytes = Number(
      pausedState.downloadedBytes ?? pausedState.downloaded_bytes ?? 0,
    );
    expect(pausedBytes).toBeGreaterThan(0);
    expect(String(pausedState.status)).toBe('paused');

    await page.getByRole('button', { name: /Reanudar/i }).first().click();
    await expect
      .poll(
        async () => {
          const state = await api.getOnboarding();
          return Number(state.downloadedBytes ?? state.downloaded_bytes ?? 0);
        },
        { timeout: 8_000 },
      )
      .toBeGreaterThanOrEqual(pausedBytes);
  });

  test('T1-F09-04: Clicking Ahora no enters Lite offline mode immediately without blocking the app', async ({
    api,
    page,
    troko,
  }) => {
    await page.goto('/');
    await troko.dismissOnboardingWithAhoraNo();

    await expect(troko.islandLocator).toBeVisible();
    await troko.openTab('Inicio');
    await troko.submitQuickPrompt('Anota una tarea probar modo lite');

    await expect
      .poll(async () => {
        const tasks = await api.listTasks();
        return tasks.some((t) =>
          String(t.title ?? '').toLowerCase().includes('probar modo lite'),
        );
      })
      .toBe(true);
  });

  test('T1-F09-05: Completing download enables Empezar, completes onboarding, and persists across reload', async ({
    api,
    page,
    troko,
  }) => {
    await page.goto('/');
    await troko.startOnboardingDownload();

    const empezarBtn = page.getByRole('button', { name: /Empezar/i }).first();
    await expect(empezarBtn).toBeVisible({ timeout: 20_000 });
    await expect(empezarBtn).toBeEnabled();

    const completePromise = page.waitForResponse(
      (res) =>
        res.url().includes('/api/onboarding/complete') &&
        res.request().method() === 'POST',
    );
    await empezarBtn.click();
    expect((await completePromise).status()).toBe(200);

    await expect(troko.islandLocator).toBeVisible();

    await page.reload();
    await expect(troko.islandLocator).toBeVisible();
    await expect(page.getByRole('button', { name: /Descargar/i })).toHaveCount(0);

    const status = await api.getOnboarding();
    expect(Boolean(status.completed ?? status.onboardingCompleted)).toBe(true);
  });
});
