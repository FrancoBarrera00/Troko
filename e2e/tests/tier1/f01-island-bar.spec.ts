import { expect, resetTrokoState, test } from '../../helpers/troko.js';

test.describe('F1: Top-Screen Dynamic Island Bar', () => {
  test.beforeEach(async ({ api, troko }) => {
    await resetTrokoState(api);
    await troko.goto({ completeOnboarding: true, api });
  });

  test('T1-F01-01: Island renders anchored at top-center in collapsed idle state with aria-expanded="false"', async ({
    page,
    troko,
  }) => {
    const island = troko.islandLocator;
    await expect(island).toBeVisible();

    const viewport = page.viewportSize()!;
    const box = await island.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeLessThanOrEqual(48);

    const centerX = box!.x + box!.width / 2;
    expect(Math.abs(centerX - viewport.width / 2)).toBeLessThanOrEqual(20);
    expect(box!.width).toBeLessThan(500);

    const expandedAttr =
      (await island.getAttribute('aria-expanded')) ??
      (await island.locator('[aria-expanded]').first().getAttribute('aria-expanded'));
    expect(expandedAttr).toBe('false');

    const stateAttr = await troko.getIslandStateAttr();
    expect(stateAttr).toBe('idle');

    const statusText = await troko.getIslandStatusText();
    expect(statusText).toMatch(/Reposo/i);
  });

  test('T1-F01-02: Hovering over collapsed island triggers subtle peek expansion without pinning panel open', async ({
    page,
    troko,
  }) => {
    const island = troko.islandLocator;
    const initialBox = await island.boundingBox();
    expect(initialBox).not.toBeNull();

    await troko.peekIsland();
    await expect
      .poll(
        async () => {
          const box = await island.boundingBox();
          const peekAttr = await island.getAttribute('data-peek');
          const stateAttr = await troko.getIslandStateAttr();
          return {
            expanded: await troko.isIslandOpen(),
            widenedOrPeek:
              peekAttr === 'true' ||
              stateAttr === 'attentive' ||
              (box !== null && box.width > initialBox!.width) ||
              (box !== null && box.height > initialBox!.height),
            width: box?.width ?? 0,
          };
        },
        { timeout: 5_000 },
      )
      .toMatchObject({
        expanded: false,
        widenedOrPeek: true,
      });

    const peekBox = await island.boundingBox();
    expect(peekBox!.width).toBeLessThan(600);

    await page.mouse.move(100, 500);
    await expect
      .poll(
        async () => {
          const stateAttr = await troko.getIslandStateAttr();
          const box = await island.boundingBox();
          return {
            stateAttr,
            widthClose: box !== null && Math.abs(box.width - initialBox!.width) <= 8,
          };
        },
        { timeout: 5_000 },
      )
      .toMatchObject({ stateAttr: 'idle', widthClose: true });
  });

  test('T1-F01-03: Clicking the island pins open the expanded panel and sets aria-expanded="true"', async ({
    page,
    troko,
  }) => {
    await troko.openIsland();

    const expandedAttr =
      (await troko.islandLocator.getAttribute('aria-expanded')) ??
      (await troko.islandLocator
        .locator('[aria-expanded]')
        .first()
        .getAttribute('aria-expanded'));
    expect(expandedAttr).toBe('true');

    const viewport = page.viewportSize()!;
    const box = await troko.islandLocator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(600);
    expect(box!.width).toBeLessThanOrEqual(760);

    const centerX = box!.x + box!.width / 2;
    expect(Math.abs(centerX - viewport.width / 2)).toBeLessThanOrEqual(24);

    // Moving pointer away must not close a pinned panel
    await page.mouse.move(50, 700);
    await expect(troko.tabLocator('Inicio')).toBeVisible();
    expect(await troko.isIslandOpen()).toBe(true);
  });

  test('T1-F01-04: Pressing Escape unpins and closes the expanded island panel', async ({
    troko,
  }) => {
    await troko.openIsland();
    await expect(troko.tabLocator('Inicio')).toBeVisible();

    await troko.closeIsland('escape');

    const box = await troko.islandLocator.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThan(500);

    const expandedAttr =
      (await troko.islandLocator.getAttribute('aria-expanded')) ??
      (await troko.islandLocator
        .locator('[aria-expanded]')
        .first()
        .getAttribute('aria-expanded'));
    expect(expandedAttr).toBe('false');
    await expect(troko.tabLocator('Tareas')).toBeHidden();
  });

  test('T1-F01-05: Clicking outside the expanded panel closes it and viewport resize preserves top-center alignment', async ({
    page,
    troko,
  }) => {
    await troko.openIsland();
    await troko.closeIsland('outside');

    const collapsedBox = await troko.islandLocator.boundingBox();
    expect(collapsedBox).not.toBeNull();
    expect(collapsedBox!.width).toBeLessThan(500);

    for (const size of [
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size);
      await expect
        .poll(async () => {
          const box = await troko.islandLocator.boundingBox();
          if (!box) return Infinity;
          return Math.abs(box.x + box.width / 2 - size.width / 2);
        })
        .toBeLessThanOrEqual(20);

      const box = await troko.islandLocator.boundingBox();
      expect(box!.y).toBeLessThanOrEqual(48);
    }
  });
});
