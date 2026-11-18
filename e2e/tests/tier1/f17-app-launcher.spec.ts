import fs from 'node:fs';
import { expect, resetTrokoState, test } from '../../helpers/troko.js';

test.describe('F17: Whitelisted App Launcher', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('F17-T1: Launch whitelisted app via Mi Mac launcher and /api/apps/launch', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Mi Mac');

    const launchResPromise = page.waitForResponse(
      (res) => res.url().includes('/api/apps/launch') && res.request().method() === 'POST',
    );
    await page
      .locator('[data-testid="app-launcher-grid"] button, #panel button')
      .filter({ hasText: /Notas|Safari|Calendario/i })
      .first()
      .click();

    const res = await launchResPromise;
    expect(res.status()).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Boolean(body.ok ?? body.launched)).toBe(true);

    await expect(
      page.locator('[data-testid="launched-app-window"], [role="dialog"]').first(),
    ).toBeVisible();
  });

  test('F17-T2: Natural Spanish command "Abre Notas" launches whitelisted app stage panel', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Inicio');
    await troko.submitQuickPrompt('Abre Notas');

    await expect
      .poll(async () => troko.getIslandStateAttr())
      .toBe('success');

    const appWindow = page
      .locator('[data-testid="launched-app-window"]')
      .or(page.locator('main, [data-testid="desktop-stage"]'))
      .first();
    await expect(appWindow).toContainText(/Notas/i);
  });

  test('F17-T3: Launch multiple distinct whitelisted applications sequentially', async ({
    api,
    page,
    troko,
  }) => {
    const r1 = await api.launchApp('Calendario');
    expect(Boolean(r1.ok ?? r1.launched)).toBe(true);

    const r2 = await api.launchApp('Calculadora');
    expect(Boolean(r2.ok ?? r2.launched)).toBe(true);

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Inicio');
    await troko.submitQuickPrompt('Abre Calendario');
    await troko.submitQuickPrompt('Abre Calculadora');

    await expect(page.locator('body')).toContainText(/Calculadora/i);
  });

  test('F17-T4: Strictly reject arbitrary shell command injection via POST /api/apps/launch', async ({
    api,
  }) => {
    const marker = '/tmp/troko_pwn_test_api';
    if (fs.existsSync(marker)) {
      fs.unlinkSync(marker);
    }

    const res1 = await api.launchAppRaw(`Safari; touch ${marker}`);
    expect([400, 403]).toContain(res1.status());

    const res2 = await api.launchAppRaw(`/bin/sh -c "touch ${marker}"`);
    expect([400, 403]).toContain(res2.status());

    expect(fs.existsSync(marker)).toBe(false);
  });

  test('F17-T5: Reject arbitrary shell command submitted via "Abre ..." prompt bar', async ({
    api,
    troko,
  }) => {
    const marker = '/tmp/troko_cmd_inject_ui';
    if (fs.existsSync(marker)) {
      fs.unlinkSync(marker);
    }

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Chat');
    await troko.submitQuickPrompt(`Abre $(touch ${marker})`);

    await expect(troko.islandLocator).toContainText(
      /no est[aá]|permitid|seguridad|lista|disponible/i,
      { timeout: 6_000 },
    );
    expect(fs.existsSync(marker)).toBe(false);
  });

  test('F17-T6: Close launched whitelisted app stage panel cleanly', async ({
    api,
    page,
    troko,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Inicio');
    await troko.submitQuickPrompt('Abre Notas');

    const appWindow = page.locator('[data-testid="launched-app-window"]').first();
    await expect(appWindow).toBeVisible();

    await appWindow.getByRole('button', { name: /Cerrar|×|X/i }).first().click();
    await expect(appWindow).toBeHidden();

    await troko.closeIsland('escape');
    await troko.openIsland();
    expect(errors).toEqual([]);
  });
});
