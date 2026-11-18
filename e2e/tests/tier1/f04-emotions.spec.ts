import {
  expect,
  installSpeechRecognitionShim,
  resetTrokoState,
  test,
} from '../../helpers/troko.js';

test.describe('F4: 12 Facial Emotions', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('T1-F04-01: saludo and contento emotions trigger on greeting and positive command completion', async ({
    api,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Inicio');

    await troko.submitQuickPrompt('Hola Troko, buenos días');
    await expect
      .poll(async () => troko.getIslandMoodAttr(), { timeout: 6_000 })
      .toBe('saludo');

    await troko.submitQuickPrompt('Gracias Troko');
    await expect
      .poll(async () => troko.getIslandMoodAttr(), { timeout: 6_000 })
      .toBe('contento');

    const svgChildren = await troko.avatarSvgLocator.locator('path, circle, ellipse').count();
    expect(svgChildren).toBeGreaterThan(0);
  });

  test('T1-F04-02: enamorado (hearts) and orgulloso (stars) emotions render mood states and decorative SVG particles', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Chat');

    await troko.submitQuickPrompt('Te quiero mucho Troko, eres genial');
    await expect
      .poll(async () => troko.getIslandMoodAttr(), { timeout: 6_000 })
      .toBe('enamorado');

    const heartCount = await page
      .locator('#island [data-particle="heart"], #island .mood-hearts path, #island svg [data-mood-particle]')
      .count();
    expect(heartCount).toBeGreaterThan(0);

    await troko.submitQuickPrompt('Lo logré, terminé mi informe');
    await expect
      .poll(async () => troko.getIslandMoodAttr(), { timeout: 6_000 })
      .toBe('orgulloso');

    const starCount = await page
      .locator('#island [data-particle="star"], #island .mood-stars path, #island svg [data-mood-particle]')
      .count();
    expect(starCount).toBeGreaterThan(0);
  });

  test('T1-F04-03: festejo and animo emotions trigger on habit goal celebration and encouragement prompt', async ({
    api,
    page,
    troko,
  }) => {
    await api.createHabit({
      name: 'Meditar',
      sceneId: 'breathe',
      unitLabel: 'sesión',
      dailyGoal: 1,
    });
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Hábitos');

    await page.getByRole('button', { name: /\+1/i }).first().click();
    await expect(troko.islandLocator).toContainText(/¡Meta cumplida!/i);
    await expect
      .poll(async () => troko.getIslandMoodAttr(), { timeout: 6_000 })
      .toBe('festejo');

    await troko.openTab('Inicio');
    await troko.submitQuickPrompt('Necesito ánimo para seguir hoy');
    await expect
      .poll(async () => troko.getIslandMoodAttr(), { timeout: 6_000 })
      .toBe('animo');
  });

  test('T1-F04-04: escucha and sorpresa emotions activate during voice listening and surprise interactions', async ({
    api,
    page,
    troko,
  }) => {
    await installSpeechRecognitionShim(page);
    await troko.goto({ completeOnboarding: true, api });

    const micBtn = page
      .locator('#island button[aria-label*="voz" i], #island button[aria-label*="mic" i], #island [data-testid="mic-btn"]')
      .first();
    await micBtn.click();

    await expect
      .poll(async () => troko.getIslandMoodAttr(), { timeout: 5_000 })
      .toBe('escucha');
    expect(await troko.getIslandStateAttr()).toBe('listen');

    await troko.openTab('Chat');
    await troko.submitQuickPrompt('¡Sorpresa! Mira esto Troko');
    await expect
      .poll(async () => troko.getIslandMoodAttr(), { timeout: 6_000 })
      .toBe('sorpresa');
  });

  test('T1-F04-05: guino and mareado (spiral eyes) emotions render their distinct facial expressions', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Chat');

    await troko.submitQuickPrompt('Hazme un guiño');
    await expect
      .poll(async () => troko.getIslandMoodAttr(), { timeout: 6_000 })
      .toBe('guino');
    const guinoMarkup = await troko.avatarSvgLocator.innerHTML();

    await troko.submitQuickPrompt('Estoy mareado, gira Troko');
    await expect
      .poll(async () => troko.getIslandMoodAttr(), { timeout: 6_000 })
      .toBe('mareado');
    const mareadoMarkup = await troko.avatarSvgLocator.innerHTML();

    expect(await troko.getIslandMoodAttr()).toBe('mareado');
    expect(mareadoMarkup).not.toBe(guinoMarkup);
    const spiralOrDizzySvg = page.locator(
      '#island svg [data-eye="spiral"], #island [data-eye="spiral"], [data-mood="mareado"] svg',
    );
    await expect(spiralOrDizzySvg.first()).toBeVisible();
  });

  test('T1-F04-06: bostezo and molesto emotions trigger on drowsiness/rest and denied/frustrated conditions', async ({
    api,
    page,
    troko,
  }) => {
    await installSpeechRecognitionShim(page, { denyMic: true });
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Inicio');

    await troko.submitQuickPrompt('Descansa');
    await expect
      .poll(
        async () => {
          const mood = await troko.getIslandMoodAttr();
          const state = await troko.getIslandStateAttr();
          return mood === 'bostezo' || state === 'sleep';
        },
        { timeout: 6_000 },
      )
      .toBe(true);

    // Wake and trigger mic denial / frustration
    await troko.openIsland();
    const micBtn = page
      .locator('#island button[aria-label*="voz" i], #island button[aria-label*="mic" i], #island [data-testid="mic-btn"]')
      .first();
    await micBtn.click();

    await expect
      .poll(
        async () => {
          const mood = await troko.getIslandMoodAttr();
          const state = await troko.getIslandStateAttr();
          return mood === 'molesto' || state === 'alert';
        },
        { timeout: 5_000 },
      )
      .toBe(true);

    // Recovers cleanly on next valid prompt
    await troko.openTab('Inicio');
    await troko.submitQuickPrompt('Hola Troko');
    await expect
      .poll(async () => troko.getIslandStateAttr(), { timeout: 6_000 })
      .not.toBe('alert');
  });
});
