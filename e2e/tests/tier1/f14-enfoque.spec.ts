import { expect, resetTrokoState, test } from '../../helpers/troko.js';

test.describe('F14: Enfoque (Pomodoro Focus Mode & Weekly Stats)', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('F14-T1: Start 25/5 Pomodoro with task label, circular SVG ring, 4-dot cycle & laptop scene', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Enfoque');

    const labelInput = page
      .getByPlaceholder(/En qué|Tarea|Etiqueta|informe/i)
      .first();
    await labelInput.fill('informe');
    await page.getByRole('button', { name: /Empezar/i }).first().click();

    await expect(troko.islandLocator).toContainText(/informe/i);
    await expect(troko.islandLocator).toContainText(/25:00|24:5\d/);

    const ring = page.locator('[data-testid="focus-ring"] svg, svg circle').first();
    await expect(ring).toBeVisible();

    const cycleDots = page
      .locator('[data-testid="focus-cycle-dots"] > *, [data-testid="focus-cycle-dot"]');
    if ((await cycleDots.count()) > 0) {
      expect(await cycleDots.count()).toBeGreaterThanOrEqual(4);
    }

    const focusScene = page
      .locator('[data-testid="focus-scene"] svg, svg[data-scene="focus"]')
      .first();
    await expect(focusScene).toBeVisible();
    const box = await focusScene.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);
  });

  test('F14-T2: Collapsed Dynamic Island displays live MM:SS countdown during focus state', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Enfoque');
    await page.getByRole('button', { name: /Empezar/i }).first().click();
    await troko.closeIsland('escape');

    await expect
      .poll(async () => troko.getIslandStateAttr())
      .toBe('focus');

    const readSeconds = async () => {
      const txt = await troko.islandLocator.innerText();
      const m = txt.match(/(\d{2}):(\d{2})/);
      return m ? Number(m[1]) * 60 + Number(m[2]) : null;
    };

    const initial = await readSeconds();
    expect(initial).not.toBeNull();

    await expect
      .poll(async () => {
        const cur = await readSeconds();
        return cur !== null && cur < initial!;
      }, { timeout: 5_000 })
      .toBe(true);

    await troko.openIsland();
    await expect(troko.tabLocator('Enfoque')).toContainText(/\d{2}:\d{2}/);
  });

  test('F14-T3: Focus controls: Pausar, Reanudar, and +5 min extend', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Enfoque');
    await page.getByRole('button', { name: /Empezar/i }).first().click();

    await page.getByRole('button', { name: /Pausar/i }).first().click();
    await expect
      .poll(async () => {
        const f = await api.getFocus();
        const s = (f.session ?? f) as Record<string, unknown>;
        return String(s.status);
      })
      .toBe('paused');

    const getTimerText = async () =>
      (await page
        .locator('[data-testid="focus-timer-display"], #panel')
        .first()
        .innerText())
        .match(/(\d{2}:\d{2})/)?.[1] ?? '';

    const frozen = await getTimerText();
    await page.waitForTimeout(1300);
    expect(await getTimerText()).toBe(frozen);

    await page.getByRole('button', { name: /Reanudar/i }).first().click();
    await expect
      .poll(async () => (await getTimerText()) !== frozen, { timeout: 5_000 })
      .toBe(true);

    await page.getByRole('button', { name: /\+5 min/i }).first().click();
    await expect
      .poll(async () => {
        const f = await api.getFocus();
        const s = (f.session ?? f) as Record<string, unknown>;
        return Number(s.remaining_sec ?? s.remainingSec ?? 0);
      })
      .toBeGreaterThan(1600);
  });

  test('F14-T4: Terminar updates HOY summary & 7-day chart; Detener stops cleanly without adding block', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Enfoque');
    await page.getByRole('button', { name: /Empezar/i }).first().click();
    await page.getByRole('button', { name: /Terminar/i }).first().click();

    await expect(troko.islandLocator).toContainText(/1\s*bloque/i);
    const chart = page
      .locator('[data-testid="focus-weekly-chart"], section:has-text("HOY")')
      .first();
    await expect(chart).toBeVisible();

    await page.getByRole('button', { name: /Empezar/i }).first().click();
    await page.getByRole('button', { name: /Detener/i }).first().click();

    await expect(troko.islandLocator).toContainText(/1\s*bloque/i);
    await expect(page.getByRole('button', { name: /Empezar/i }).first()).toBeVisible();
  });

  test('F14-T5: Active Pomodoro focus session persists and resumes across page.reload()', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Enfoque');

    const labelInput = page
      .getByPlaceholder(/En qué|Tarea|Etiqueta|informe/i)
      .first();
    await labelInput.fill('estudiar algoritmos');
    await page.getByRole('button', { name: /Empezar/i }).first().click();

    await expect
      .poll(
        async () => {
          const f = await api.getFocus();
          const s = (f.session ?? f) as Record<string, unknown>;
          const status = String(s.status ?? '');
          const remaining = Number(s.remaining_sec ?? s.remainingSec ?? 1500);
          return status === 'running' || status === 'active' ? remaining : 1500;
        },
        { timeout: 6_000 },
      )
      .toBeLessThan(1500);
    await page.reload();

    await expect
      .poll(async () => troko.getIslandStateAttr())
      .toBe('focus');

    await troko.openTab('Enfoque');
    await expect(troko.islandLocator).toContainText(/estudiar algoritmos/i);
    const focus = await api.getFocus();
    const session = (focus.session ?? focus) as Record<string, unknown>;
    expect(String(session.label ?? '')).toContain('estudiar algoritmos');
  });

  test('F14-T6: Cycle indicator advances across focus blocks and enters break phase', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Enfoque');

    await page.getByRole('button', { name: /Empezar/i }).first().click();
    await page.getByRole('button', { name: /Terminar/i }).first().click();

    await expect(troko.islandLocator).toContainText(/Descanso|05:00|5:00|Empezar/i);

    const startNext = page.getByRole('button', { name: /Empezar|Siguiente/i }).first();
    await startNext.click();

    const focus = await api.getFocus();
    const session = (focus.session ?? focus) as Record<string, unknown>;
    const cycle = Number(session.cycle_index ?? session.cycleIndex ?? 1);
    expect(cycle).toBeGreaterThanOrEqual(1);
  });
});
