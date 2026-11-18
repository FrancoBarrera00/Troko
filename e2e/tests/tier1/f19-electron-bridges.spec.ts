import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, resetTrokoState, test } from '../../helpers/troko.js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

test.describe('F19: Optional Electron Notch Shell & Bridges', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('F19-T1: Ajustes renders Telegram, Weather (Clima), and Tavily bridges matching /api/integrations', async ({
    api,
    page,
    troko,
  }) => {
    const integrations = await api.getIntegrations();
    expect(integrations.length).toBeGreaterThanOrEqual(3);

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Ajustes');

    await expect(
      page
        .locator('[data-testid="integration-card-telegram"]')
        .or(troko.islandLocator.getByText(/Telegram/i))
        .first(),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-testid="integration-card-weather"]')
        .or(troko.islandLocator.getByText(/Clima|Weather/i))
        .first(),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-testid="integration-card-tavily"]')
        .or(troko.islandLocator.getByText(/Tavily/i))
        .first(),
    ).toBeVisible();

    for (const item of integrations) {
      expect(Boolean(item.enabled)).toBe(false);
    }
  });

  test('F19-T2: Configure and enable Telegram bridge (botToken, chatId) and persist across reload', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Ajustes');

    const card = page
      .locator('[data-testid="integration-card-telegram"], section:has-text("Telegram"), div:has-text("Telegram")')
      .first();
    await card.scrollIntoViewIfNeeded();

    const inputs = card.locator('input[type="text"], input[type="password"], input:not([type="checkbox"])');
    await inputs.nth(0).fill('123456:ABC-test-token');
    await inputs.nth(1).fill('987654321');

    const toggle = card.locator('input[type="checkbox"], [role="switch"]').first();
    if (!(await toggle.isChecked().catch(() => false))) {
      await toggle.click();
    }

    const saveBtn = card.getByRole('button', { name: /Guardar/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
    }

    await expect
      .poll(async () => {
        const list = await api.getIntegrations();
        return Boolean(list.find((i) => i.type === 'telegram')?.enabled);
      })
      .toBe(true);

    await page.reload();
    await troko.openTab('Ajustes');
    const after = await api.getIntegrations();
    const tg = after.find((i) => i.type === 'telegram');
    expect(Boolean(tg?.enabled)).toBe(true);
    expect(JSON.stringify(tg)).toContain('987654321');
  });

  test('F19-T3: Configure and enable Weather (Clima) and Tavily search bridges with persistence', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Ajustes');

    const weatherCard = page
      .locator('[data-testid="integration-card-weather"], section:has-text("Clima"), div:has-text("Clima")')
      .first();
    await weatherCard
      .locator('input[type="text"], input:not([type="checkbox"])')
      .first()
      .fill('Madrid');
    await weatherCard.locator('input[type="checkbox"], [role="switch"]').first().click();
    const wSave = weatherCard.getByRole('button', { name: /Guardar/i }).first();
    if (await wSave.isVisible().catch(() => false)) {
      await wSave.click();
    }

    const tavilyCard = page
      .locator('[data-testid="integration-card-tavily"], section:has-text("Tavily"), div:has-text("Tavily")')
      .first();
    await tavilyCard
      .locator('input[type="text"], input[type="password"], input:not([type="checkbox"])')
      .first()
      .fill('tvly-demo-12345');
    await tavilyCard.locator('input[type="checkbox"], [role="switch"]').first().click();
    const tSave = tavilyCard.getByRole('button', { name: /Guardar/i }).first();
    if (await tSave.isVisible().catch(() => false)) {
      await tSave.click();
    }

    await page.reload();
    const list = await api.getIntegrations();
    const weather = list.find((i) => i.type === 'weather');
    const tavily = list.find((i) => i.type === 'tavily');

    expect(Boolean(weather?.enabled)).toBe(true);
    expect(JSON.stringify(weather)).toContain('Madrid');
    expect(Boolean(tavily?.enabled)).toBe(true);
  });

  test('F19-T4: Disable an enabled integration bridge without losing config', async ({
    api,
    page,
    troko,
  }) => {
    await api.patchIntegration('telegram', {
      enabled: true,
      config: { botToken: '123456:ABC', chatId: '987654321' },
    });

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Ajustes');

    const card = page
      .locator('[data-testid="integration-card-telegram"], section:has-text("Telegram"), div:has-text("Telegram")')
      .first();
    await card.locator('input[type="checkbox"], [role="switch"]').first().click();

    await expect
      .poll(async () => {
        const list = await api.getIntegrations();
        return Boolean(list.find((i) => i.type === 'telegram')?.enabled);
      })
      .toBe(false);

    await page.reload();
    const after = await api.getIntegrations();
    const tg = after.find((i) => i.type === 'telegram');
    expect(Boolean(tg?.enabled)).toBe(false);
    expect(JSON.stringify(tg)).toContain('987654321');
  });

  test('F19-T5: Verify /api/health contract and electron/ notch wrapper packaging artifacts', async ({
    api,
  }) => {
    const health = await api.health();
    expect(health.ok).toBe(true);
    expect(typeof health.version).toBe('string');
    expect(Number(health.uptimeSec)).toBeGreaterThanOrEqual(0);

    const electronPkgPath = path.join(repoRoot, 'electron', 'package.json');
    const electronMainPath = path.join(repoRoot, 'electron', 'main.ts');
    expect(fs.existsSync(electronPkgPath)).toBe(true);
    expect(fs.existsSync(electronMainPath)).toBe(true);

    const parsedPkg = JSON.parse(
      fs.readFileSync(electronPkgPath, 'utf8'),
    ) as Record<string, unknown>;
    expect(typeof parsedPkg.main).toBe('string');
  });

  test('F19-T6: Dynamic Island notch top-center geometry holds cleanly for Electron notch framing', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });

    for (const vp of [
      { width: 1280, height: 800 },
      { width: 800, height: 600 },
    ]) {
      await page.setViewportSize(vp);
      const box = await troko.islandLocator.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeLessThanOrEqual(24);
      const centerX = box!.x + box!.width / 2;
      expect(Math.abs(centerX - vp.width / 2)).toBeLessThanOrEqual(20);

      await troko.openIsland();
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      expect(scrollWidth).toBeLessThanOrEqual(vp.width);
      await troko.closeIsland('escape');
    }
  });
});
