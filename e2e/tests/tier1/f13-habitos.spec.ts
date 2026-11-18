import {
  ALL_HABIT_SCENE_IDS,
  expect,
  resetTrokoState,
  test,
} from '../../helpers/troko.js';

test.describe('F13: Hábitos (Streaks, Weekly Rings & 15 Scenes)', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('F13-T1: Create habit via + Agregar modal and persist across reload', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Hábitos');

    await page.getByRole('button', { name: /\+ Agregar/i }).first().click();

    const dialog = page.getByRole('dialog').or(page.locator('form')).first();
    await dialog.getByLabel(/Nombre/i).or(dialog.getByPlaceholder(/Nombre|Leer/i)).first().fill('Leer');

    const sceneSelect = dialog.locator('select[name*="scene" i], [data-testid="scene-select"]').first();
    if ((await sceneSelect.count()) > 0) {
      await sceneSelect.selectOption('book');
    } else {
      const bookBtn = dialog.locator('[data-scene="book"], button[aria-label*="book" i]').first();
      if ((await bookBtn.count()) > 0) {
        await bookBtn.click();
      }
    }

    await dialog
      .getByLabel(/Unidad/i)
      .or(dialog.getByPlaceholder(/páginas|vasos|unidad/i))
      .first()
      .fill('páginas');
    await dialog
      .getByLabel(/Meta/i)
      .or(dialog.locator('input[type="number"]'))
      .first()
      .fill('20');

    const timeInput = dialog.locator('input[type="time"], input[name*="reminder" i]').first();
    if ((await timeInput.count()) > 0) {
      await timeInput.fill('21:00');
    }

    await dialog
      .getByRole('button', { name: /Guardar|Crear|Agregar/i })
      .first()
      .click();

    await expect(troko.islandLocator).toContainText(/Leer/i);
    await expect(troko.islandLocator).toContainText(/0\s*\/\s*20|0 de 20/i);

    const habits = await api.listHabits();
    expect(habits.some((h) => String(h.name) === 'Leer' && Number(h.dailyGoal ?? h.daily_goal) === 20)).toBe(true);

    await page.reload();
    await troko.openTab('Hábitos');
    await expect(troko.islandLocator).toContainText(/Leer/i);
  });

  test('F13-T2: Increment habit (+1) and undo (Deshacer) sync badges and Inicio KPI', async ({
    api,
    page,
    troko,
  }) => {
    await api.createHabit({
      name: 'Agua',
      sceneId: 'water',
      unitLabel: 'vasos',
      dailyGoal: 8,
    });
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Hábitos');

    const card = page
      .locator('[data-testid="habit-card"], article, section, div')
      .filter({ hasText: 'Agua' })
      .first();
    const plusOne = card.getByRole('button', { name: /\+1/i }).first();

    await plusOne.click();
    await plusOne.click();
    await plusOne.click();
    await expect(card).toContainText(/3\s*\/\s*8|3 de 8/i);

    await card.getByRole('button', { name: /Deshacer/i }).first().click();
    await expect(card).toContainText(/2\s*\/\s*8|2 de 8/i);

    await expect(troko.tabLocator('Hábitos')).toContainText('0/1');
    const summary = await api.summary();
    expect(Number(summary.habitsCompletedToday)).toBe(0);
    expect(Number(summary.habitsTotalToday)).toBe(1);

    await troko.openTab('Inicio');
    await expect(troko.islandLocator).toContainText(/0\/1/);
  });

  test('F13-T3: Reaching daily goal triggers ¡Meta cumplida! celebration and updates streak', async ({
    api,
    page,
    troko,
  }) => {
    await api.createHabit({
      name: 'Estirar',
      sceneId: 'stretch',
      unitLabel: 'veces',
      dailyGoal: 2,
    });
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Hábitos');

    const card = page
      .locator('[data-testid="habit-card"], article, div')
      .filter({ hasText: 'Estirar' })
      .first();
    const plusOne = card.getByRole('button', { name: /\+1/i }).first();

    await plusOne.click();
    await plusOne.click();

    await expect(troko.islandLocator).toContainText(/2\s*\/\s*2|¡Meta cumplida!/i);
    await expect(troko.islandLocator).toContainText(/¡Meta cumplida!/i);

    await expect
      .poll(async () => Number((await api.summary()).habitsCompletedToday))
      .toBe(1);

    const habits = await api.listHabits();
    const estirar = habits.find((h) => String(h.name) === 'Estirar');
    expect(Number(estirar?.streakCurrent ?? estirar?.streak_current ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(estirar?.streakBest ?? estirar?.streak_best ?? 0)).toBeGreaterThanOrEqual(1);
  });

  test('F13-T4: SEGUIMIENTO DE LA SEMANA displays Spanish weekdays S D L M X J V and updates ring', async ({
    api,
    page,
    troko,
  }) => {
    await api.createHabit({
      name: 'Caminar',
      sceneId: 'walk',
      unitLabel: 'paseo',
      dailyGoal: 1,
    });
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Hábitos');

    const tracker = page
      .locator('[data-testid="weekly-tracker"], section:has-text("SEGUIMIENTO DE LA SEMANA")')
      .first();
    await expect(tracker).toBeVisible();
    const trackerText = await tracker.innerText();
    for (const day of ['S', 'D', 'L', 'M', 'X', 'J', 'V']) {
      expect(trackerText).toContain(day);
    }

    const ringCount = await tracker.locator('svg circle').count();
    expect(ringCount).toBeGreaterThanOrEqual(7);

    await page.getByRole('button', { name: /\+1/i }).first().click();
    await expect(troko.islandLocator).toContainText(/1\s*\/\s*1|¡Meta cumplida!/i);

    await page.reload();
    await troko.openTab('Hábitos');
    await expect(troko.islandLocator).toContainText(/1\s*\/\s*1|¡Meta cumplida!/i);
  });

  test('F13-T5: Scheduled habit reminder Probar button triggers island habit_remind nudge', async ({
    api,
    page,
    sse,
    troko,
  }) => {
    await api.createHabit({
      name: 'Tomar agua',
      sceneId: 'water',
      unitLabel: 'vasos',
      dailyGoal: 8,
      reminderTime: '13:30',
    });
    await sse.start();
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Hábitos');

    await page.getByRole('button', { name: /Probar/i }).first().click();

    const evt = await sse.waitForEvent(
      (e) => e.type === 'habit.nudge' || e.type === 'island.state',
      6_000,
    );
    expect(evt).toBeTruthy();

    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 6_000 })
      .toMatch(/remind|notification/);
    await expect(troko.islandLocator).toContainText(/Tomar agua/i);
  });

  test('F13-T6: All 15 animated SVG habit scenes render distinct valid SVG graphics', async ({
    api,
    page,
    troko,
  }) => {
    for (const sceneId of ALL_HABIT_SCENE_IDS) {
      await api.createHabit({
        name: `Hábito ${sceneId}`,
        sceneId,
        unitLabel: 'vez',
        dailyGoal: 1,
      });
    }

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Hábitos');

    const seenMarkups = new Set<string>();
    for (const sceneId of ALL_HABIT_SCENE_IDS) {
      const sceneSvg = page
        .locator(`[data-scene="${sceneId}"] svg, svg[data-scene="${sceneId}"]`)
        .first();
      await expect(sceneSvg).toBeVisible();
      const box = await sceneSvg.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);

      const primitives = await sceneSvg
        .locator('path, circle, rect, ellipse, polygon, line')
        .count();
      expect(primitives).toBeGreaterThan(0);
      seenMarkups.add(await sceneSvg.innerHTML());
    }
    expect(seenMarkups.size).toBe(15);
  });
});
