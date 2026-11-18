import { expect, resetTrokoState, test } from '../../helpers/troko.js';

test.describe('F16: Mi Mac / Desktop Organizer (Preview + Undo)', () => {
  test.beforeEach(async ({ api, desktopSandbox }) => {
    await desktopSandbox.resolveFromApi(api);
    await resetTrokoState(api, desktopSandbox);
  });

  test('F16-T1: Scan loose files and verify all 8 category classifications', async ({
    api,
    desktopSandbox,
    troko,
  }) => {
    desktopSandbox.writeSampleSet();

    const scan = await api.scanDesktop();
    const preview = await api.previewDesktopTidy();
    const categories = (preview.categories ?? {}) as Record<string, number>;

    for (const cat of [
      'Capturas',
      'Imágenes',
      'Documentos',
      'Hojas de cálculo',
      'Audio',
      'Videos',
      'Comprimidos',
      'Otros',
    ]) {
      expect(Number(categories[cat] ?? 0)).toBeGreaterThanOrEqual(1);
    }

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Mi Mac');

    await expect(troko.islandLocator).toContainText(/8\s*archivos/i);
    expect(Number(scan.totalFiles ?? scan.looseCount ?? 8)).toBe(8);
  });

  test('F16-T2: Preview desktop tidy renders island desktop_tidy peek card without moving files', async ({
    api,
    desktopSandbox,
    page,
    troko,
  }) => {
    const samples = desktopSandbox.writeSampleSet();
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Mi Mac');

    await page.getByRole('button', { name: /Ordenar escritorio/i }).first().click();

    await expect(troko.islandLocator).toContainText(/8\s*archivos sueltos/i);
    await expect(page.getByRole('button', { name: /Ordenar ahora/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Cancelar/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Ver detalle/i }).first()).toBeVisible();

    for (const fileName of Object.keys(samples)) {
      expect(desktopSandbox.exists(fileName)).toBe(true);
    }
  });

  test('F16-T3: Ver detalle inspects file-to-folder mapping; Cancelar aborts with zero disk changes', async ({
    api,
    desktopSandbox,
    page,
    troko,
  }) => {
    const samples = desktopSandbox.writeSampleSet();
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Mi Mac');

    await page.getByRole('button', { name: /Ordenar escritorio/i }).first().click();
    await page.getByRole('button', { name: /Ver detalle/i }).first().click();

    await expect(troko.islandLocator).toContainText(/contrato\.pdf/i);
    await expect(troko.islandLocator).toContainText(/Documentos/i);

    await page.getByRole('button', { name: /Cancelar/i }).first().click();

    await expect(page.getByRole('button', { name: /Ordenar ahora/i })).toHaveCount(0);
    expect(desktopSandbox.listRootFiles().sort()).toEqual(Object.keys(samples).sort());
  });

  test('F16-T4: Confirm Ordenar ahora moves files on disk into category folders without deleting', async ({
    api,
    desktopSandbox,
    page,
    troko,
  }) => {
    const samples = desktopSandbox.writeSampleSet();
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Mi Mac');

    await page.getByRole('button', { name: /Ordenar escritorio/i }).first().click();
    await page.getByRole('button', { name: /Ordenar ahora/i }).first().click();

    await expect
      .poll(async () => troko.getIslandStateAttr())
      .toBe('success');

    expect(desktopSandbox.listRootFiles()).toHaveLength(0);
    const allFiles = desktopSandbox.listRecursive();
    expect(allFiles).toHaveLength(Object.keys(samples).length);

    expect(desktopSandbox.readFile('Documentos/contrato.pdf')).toBe(
      samples['contrato.pdf'],
    );
    expect(desktopSandbox.readFile('Imágenes/foto.jpg')).toBe(samples['foto.jpg']);
    expect(desktopSandbox.readFile('Comprimidos/archivo.zip')).toBe(
      samples['archivo.zip'],
    );

    await troko.openTab('Mi Mac');
    await expect(page.getByRole('button', { name: /Deshacer/i }).first()).toBeEnabled();
  });

  test('F16-T5: Atomic Deshacer restores every moved file to its exact original root path', async ({
    api,
    desktopSandbox,
    page,
    troko,
  }) => {
    const samples = desktopSandbox.writeSampleSet();
    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Mi Mac');

    await page.getByRole('button', { name: /Ordenar escritorio/i }).first().click();
    await page.getByRole('button', { name: /Ordenar ahora/i }).first().click();
    await expect
      .poll(async () => desktopSandbox.listRootFiles().length)
      .toBe(0);

    await troko.openTab('Mi Mac');
    await page.getByRole('button', { name: /Deshacer/i }).first().click();

    await expect
      .poll(async () => desktopSandbox.listRootFiles().length)
      .toBe(Object.keys(samples).length);

    for (const [name, content] of Object.entries(samples)) {
      expect(desktopSandbox.exists(name)).toBe(true);
      expect(desktopSandbox.readFile(name)).toBe(content);
    }
  });

  test('F16-T6: Collision-safe organize never overwrites existing file in target category folder', async ({
    api,
    desktopSandbox,
    page,
    troko,
  }) => {
    desktopSandbox.writeFile('Documentos/nota.txt', 'OLD');
    desktopSandbox.writeFile('nota.txt', 'NEW');

    await troko.goto({ completeOnboarding: true, api });
    await troko.openTab('Mi Mac');

    await page.getByRole('button', { name: /Ordenar escritorio/i }).first().click();
    await page.getByRole('button', { name: /Ordenar ahora/i }).first().click();

    await expect
      .poll(async () => desktopSandbox.listRootFiles().length)
      .toBe(0);

    expect(desktopSandbox.readFile('Documentos/nota.txt')).toBe('OLD');
    const allInDocs = desktopSandbox
      .listRecursive()
      .filter((rel) => rel.startsWith('Documentos/'));
    expect(allInDocs.length).toBe(2);
    const contents = allInDocs.map((rel) => desktopSandbox.readFile(rel)).sort();
    expect(contents).toEqual(['NEW', 'OLD']);

    await troko.openTab('Mi Mac');
    await page.getByRole('button', { name: /Deshacer/i }).first().click();

    await expect
      .poll(async () => desktopSandbox.exists('nota.txt'))
      .toBe(true);
    expect(desktopSandbox.readFile('nota.txt')).toBe('NEW');
    expect(desktopSandbox.readFile('Documentos/nota.txt')).toBe('OLD');
  });
});
