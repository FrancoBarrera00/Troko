import { expect, resetTrokoState, test, type TrokoTabLabel } from '../../helpers/troko.js';

test.describe('F2: Expanded 2-Column Panel & Sidebar', () => {
  test.beforeEach(async ({ api, troko }) => {
    await resetTrokoState(api);
    await troko.goto({ completeOnboarding: true, api });
  });

  test('T1-F02-01: Expanded panel displays 2-column layout with avatar, status, 7 tabs, footer actions, and Con voz toggle', async ({
    page,
    troko,
  }) => {
    await troko.openIsland();

    const sidebar = page
      .locator('[data-testid="panel-sidebar"], #panel aside, #panel nav, #island [role="tablist"]')
      .first();
    const content = page
      .locator('[data-testid="panel-content"], #panel main, #panel [role="tabpanel"]')
      .first();

    await expect(sidebar).toBeVisible();
    await expect(content).toBeVisible();

    const sidebarBox = await sidebar.boundingBox();
    const contentBox = await content.boundingBox();
    expect(sidebarBox).not.toBeNull();
    expect(contentBox).not.toBeNull();
    expect(sidebarBox!.x).toBeLessThan(contentBox!.x);

    await expect(troko.avatarSvgLocator).toBeVisible();
    expect(await troko.getIslandStatusText()).toMatch(/Reposo/i);

    const tabs: TrokoTabLabel[] = [
      'Inicio',
      'Chat',
      'Tareas',
      'Hábitos',
      'Enfoque',
      'Correo',
      'Mi Mac',
    ];
    let prevY = -Infinity;
    for (const label of tabs) {
      const tab = troko.tabLocator(label);
      await expect(tab).toBeVisible();
      const box = await tab.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y).toBeGreaterThanOrEqual(prevY);
      prevY = box!.y;
    }

    await expect(troko.tabLocator('Ajustes')).toBeVisible();
    await expect(
      page
        .locator('[data-testid="exit-troko-btn"]')
        .or(page.getByRole('button', { name: /Salir de Troko/i }))
        .first(),
    ).toBeVisible();

    const voiceToggle = page
      .getByRole('switch', { name: /Con voz/i })
      .or(page.getByRole('checkbox', { name: /Con voz/i }))
      .or(page.getByRole('button', { name: /Con voz/i }))
      .first();
    await expect(voiceToggle).toBeVisible();
  });

  test('T1-F02-02: Clicking each of the 7 tabs + Ajustes switches the right-hand view and updates active tab state', async ({
    page,
    troko,
  }) => {
    await troko.openIsland();

    const expectedViewCopy: Array<[TrokoTabLabel, RegExp]> = [
      ['Chat', /Conversación|Chat|Escribe/i],
      ['Tareas', /Tareas|Recordatorios|Temporizadores/i],
      ['Hábitos', /SEGUIMIENTO DE LA SEMANA|Hábitos/i],
      ['Enfoque', /Empezar|Enfoque|25:00/i],
      ['Correo', /Correo|Bandeja|No leídos/i],
      ['Mi Mac', /Ordenar escritorio|escritorio|Mi Mac|Mi Equipo/i],
      ['Ajustes', /Ajustes|IA|Enfoque|Memoria/i],
      ['Inicio', /ATAJOS|Escribe o habla con Troko/i],
    ];

    for (const [tabLabel, copyRegex] of expectedViewCopy) {
      await troko.openTab(tabLabel);
      const tab = troko.tabLocator(tabLabel);
      const selected =
        (await tab.getAttribute('aria-selected')) === 'true' ||
        (await tab.getAttribute('aria-current')) === 'page' ||
        (await tab.getAttribute('data-active')) === 'true';
      expect(selected).toBe(true);
      await expect(troko.islandLocator).toContainText(copyRegex);
    }
  });

  test('T1-F02-03: Keyboard arrow navigation moves focus and selection across sidebar tabs', async ({
    page,
    troko,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await troko.openIsland();
    const inicioTab = troko.tabLocator('Inicio');
    await inicioTab.focus();
    await expect(inicioTab).toBeFocused();

    await page.keyboard.press('ArrowDown');
    const chatTab = troko.tabLocator('Chat');
    await expect(chatTab).toBeFocused();

    await page.keyboard.press('ArrowDown');
    const tareasTab = troko.tabLocator('Tareas');
    await expect(tareasTab).toBeFocused();
    await page.keyboard.press('Enter');

    const tareasSelected =
      (await tareasTab.getAttribute('aria-selected')) === 'true' ||
      (await tareasTab.getAttribute('aria-current')) === 'page' ||
      (await tareasTab.getAttribute('data-active')) === 'true';
    expect(tareasSelected).toBe(true);

    await page.keyboard.press('ArrowUp');
    await expect(chatTab).toBeFocused();
    expect(errors).toEqual([]);
  });

  test('T1-F02-04: Sidebar live badges reflect Tareas count, Hábitos x/y progress, and Enfoque MM:SS countdown', async ({
    api,
    page,
    troko,
  }) => {
    await api.createTask('Revisar badge');
    await api.createHabit({
      name: 'Agua',
      sceneId: 'water',
      unitLabel: 'vasos',
      dailyGoal: 8,
    });
    await api.startFocus({ label: 'Bloque badge', durationSec: 1500 });

    const summary = await api.summary();
    await page.reload();
    await troko.openIsland();

    const tareasTab = troko.tabLocator('Tareas');
    await expect(tareasTab).toContainText('1');

    const habitosTab = troko.tabLocator('Hábitos');
    const completed = Number(summary.habitsCompletedToday ?? 0);
    const total = Number(summary.habitsTotalToday ?? 1);
    await expect(habitosTab).toContainText(`${completed}/${total}`);

    const enfoqueTab = troko.tabLocator('Enfoque');
    await expect(enfoqueTab).toContainText(/\d{2}:\d{2}/);
  });

  test('T1-F02-05: Empty states render clean Spanish placeholders when data is absent', async ({
    page,
    troko,
  }) => {
    await troko.openIsland();

    const pendingTasksKpi = troko.islandLocator
      .locator('[data-testid="kpi-pending-tasks"], div, section, article, button')
      .filter({ hasText: /tareas?\s+pendientes?/i })
      .filter({ hasText: /\d+/ })
      .filter({ hasNotText: /hábitos hoy|próximo aviso/i })
      .last();
    await expect(pendingTasksKpi).toContainText(/\b0\b/);
    await expect(troko.islandLocator).not.toContainText(/undefined|NaN/i);

    await troko.openTab('Tareas');
    await expect(troko.islandLocator).toContainText(/Sin tareas|No hay tareas|pendientes|Agregar/i);
    await expect(troko.islandLocator).not.toContainText(/undefined|NaN/i);

    await troko.openTab('Hábitos');
    await expect(troko.islandLocator).toContainText(/Sin hábitos|Agregar|\+ Agregar/i);
    await expect(troko.islandLocator).not.toContainText(/undefined|NaN/i);
  });

  test('T1-F02-06: Clicking Salir de Troko triggers clean exit or session shutdown confirmation state', async ({
    page,
    troko,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await troko.clickExitTroko();

    const confirmBtn = page
      .getByRole('button', { name: /Confirmar|Salir ahora|Sí, salir/i })
      .first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.locator('body')).toContainText(
      /Hasta pronto|Troko cerrado|Sesión cerrada|Desconectado|Dormido/i,
    );
    expect(errors).toEqual([]);
  });
});
