import { expect, resetTrokoState, test } from '../../helpers/troko.js';

test.describe('F21: Study PDF Decoder, Real Focus Guardian & XP Accessories', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('F21-T1: Decode multi-section study summary losslessly, answer quiz & Feynman for XP', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openIsland();

    // Use quick shortcut from Inicio tab
    await page.getByTestId('inicio-study-shortcut').click();
    await expect(page.getByTestId('study-section')).toBeVisible();

    const sampleSummary = [
      '# 1. Arquitectura de Computadoras',
      '',
      'La CPU coordina el ciclo buscar-decodificar-ejecutar y utiliza registros internos de ultra alta velocidad para cada instrucción.',
      'La memoria caché L1 y L2 reduce la latencia entre el procesador y la memoria RAM principal.',
      '',
      '# 2. Sistemas Operativos',
      '',
      'El planificador del kernel reparte tiempo de procesador entre múltiples procesos usando cambios de contexto ordenados.',
    ].join('\n');

    await page.getByTestId('study-title-input').fill('Resumen Sistemas');
    await page.getByTestId('study-text-input').fill(sampleSummary);
    await page.getByTestId('study-decode-btn').click();

    await expect(page.getByTestId('study-doc-viewer')).toBeVisible();
    await expect(page.getByTestId('study-full-text')).toContainText(
      /buscar-decodificar-ejecutar/i
    );
    await expect(page.getByTestId('study-keypoints')).toBeVisible();

    // Answer quiz question correctly using API doc metadata
    const docsRes = await page.request.get('/api/study/docs');
    const docsJson = (await docsRes.json()) as {
      docs: Array<{
        blocks: Array<{
          quizQuestions: Array<{ correctIndex: number }>;
        }>;
      }>;
    };
    const firstQ = docsJson.docs[0]?.blocks[0]?.quizQuestions[0];
    expect(firstQ).toBeTruthy();

    await page.getByTestId(`study-quiz-option-0-${firstQ!.correctIndex}`).click();
    await expect(page.getByTestId('study-quiz-feedback-0')).toContainText(/\+25 XP/i);

    // Feynman check -> +30 XP
    await page
      .getByTestId('study-feynman-input')
      .fill(
        'La CPU ejecuta instrucciones con registros rapidos y la memoria cache reduce la latencia con la RAM.'
      );
    await page.getByTestId('study-feynman-btn').click();
    await expect(page.getByTestId('study-feynman-result')).toContainText(/\+30 XP/i);

    // Master block -> +35 XP
    await page.getByTestId('study-master-btn').click();
    await expect(page.getByTestId('study-master-btn')).toContainText(/Dominado/i);

    // Switch back to Enfoque & Guardián and finish a Focus block to cross Level 2 (>= 100 XP)
    await page.getByTestId('subtab-focus').click();
    await page.getByTestId('focus-start-btn').click();
    await page.getByTestId('focus-finish-btn').click();

    await expect(page.getByTestId('progression-card')).toContainText(/Nivel 2/i);

    // Equip unlocked 'glasses' accessory and verify SVG data-accessory updates
    await page.getByTestId('accessory-btn-glasses').click();
    await expect(page.getByTestId('troko-avatar').first()).toHaveAttribute(
      'data-accessory',
      'glasses'
    );
  });

  test('F21-T2: Real Focus Guardian triggers anti-distraction test alert cleanly', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Enfoque');

    await expect(page.getByTestId('guardian-card')).toBeVisible();
    await page.getByTestId('guardian-test-btn').click();

    await expect(page.getByTestId('guardian-alert-banner')).toContainText(
      /Guardián de Enfoque/i
    );
    await expect(page.getByTestId('guardian-card')).toContainText(
      /Distracciones en sesión:\s*1/i
    );
  });
});
