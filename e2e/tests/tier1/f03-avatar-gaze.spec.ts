import { expect, resetTrokoState, test } from '../../helpers/troko.js';

test.describe('F3: Troko Animated Vector Avatar & Gaze Tracking', () => {
  test.beforeEach(async ({ api }) => {
    await resetTrokoState(api);
  });

  test('T1-F03-01: Troko SVG mascot renders inside island and sidebar with geometric primitives', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.completeOnboardingIfVisible();

    const svg = troko.avatarSvgLocator;
    await expect(svg).toBeVisible();
    const box = await svg.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(16);
    expect(box!.height).toBeGreaterThan(16);

    const primitiveCount = await svg
      .locator('path, rect, circle, ellipse, polygon')
      .count();
    expect(primitiveCount).toBeGreaterThanOrEqual(4);

    await troko.openIsland();
    const sidebarSvg = page
      .locator('#panel aside svg, [data-testid="panel-sidebar"] svg, #island svg')
      .first();
    await expect(sidebarSvg).toBeVisible();
  });

  test('T1-F03-02: Pointer movement updates --gx and --gy gaze-tracking CSS variables proportionally', async ({
    api,
    page,
    troko,
  }) => {
    await troko.goto({ completeOnboarding: true, api });
    await troko.completeOnboardingIfVisible();

    const readGaze = async () =>
      page.evaluate(() => {
        const candidates = [
          document.querySelector('[data-testid="troko-avatar"]'),
          document.querySelector('#island svg'),
          document.querySelector('#island'),
        ];
        for (const el of candidates) {
          if (!el) continue;
          const style = getComputedStyle(el);
          const gx = parseFloat(style.getPropertyValue('--gx'));
          const gy = parseFloat(style.getPropertyValue('--gy'));
          if (!Number.isNaN(gx) && !Number.isNaN(gy)) {
            return { gx, gy };
          }
        }
        return null;
      });

    await page.mouse.move(40, 40);
    await expect.poll(async () => (await readGaze())?.gx ?? 0).toBeLessThan(0);
    const topLeft = await readGaze();
    expect(topLeft).not.toBeNull();

    await page.mouse.move(1200, 750);
    await expect
      .poll(async () => (await readGaze())?.gx ?? -1)
      .toBeGreaterThan(0);
    const bottomRight = await readGaze();
    expect(bottomRight).not.toBeNull();
    expect(bottomRight!.gx).toBeGreaterThan(topLeft!.gx);
    expect(bottomRight!.gy).toBeGreaterThan(topLeft!.gy);
    expect(Number.isFinite(bottomRight!.gx)).toBe(true);
    expect(Number.isFinite(bottomRight!.gy)).toBe(true);
  });

  test('T1-F03-03: Avatar performs periodic eye blinking within the 2.8s-6.5s idle window', async ({
    page,
    troko,
    api,
  }) => {
    await api.completeOnboarding();
    await page.clock.install();
    await troko.goto();

    let sawBlink = false;
    for (let elapsed = 0; elapsed < 7000; elapsed += 200) {
      await page.clock.runFor(200);
      const isBlinking = await page.evaluate(() => {
        const blinkEl = document.querySelector(
          '[data-blinking="true"], .blink, #island svg .is-blinking',
        );
        if (blinkEl) return true;
        const eyes = Array.from(
          document.querySelectorAll('#island svg [data-eye], #island svg ellipse, #island svg rect'),
        );
        return eyes.some((eye) => {
          const ry = eye.getAttribute('ry');
          const h = eye.getAttribute('height');
          const tf = getComputedStyle(eye).transform;
          return (
            (ry !== null && parseFloat(ry) <= 1.5) ||
            (h !== null && parseFloat(h) <= 2) ||
            (tf && tf.includes('matrix') && tf.includes(', 0.'))
          );
        });
      });
      if (isBlinking) {
        sawBlink = true;
        break;
      }
    }

    expect(sawBlink).toBe(true);
  });

  test('T1-F03-04: After 5 seconds of pointer inactivity, avatar performs an idle random glance', async ({
    page,
    troko,
    api,
  }) => {
    await api.completeOnboarding();
    await page.clock.install();
    await troko.goto();

    await page.mouse.move(640, 400);
    await page.clock.runFor(300);

    const readGaze = async () =>
      page.evaluate(() => {
        const el =
          document.querySelector('[data-testid="troko-avatar"]') ||
          document.querySelector('#island svg') ||
          document.querySelector('#island');
        if (!el) return { gx: 0, gy: 0 };
        const style = getComputedStyle(el);
        return {
          gx: parseFloat(style.getPropertyValue('--gx')) || 0,
          gy: parseFloat(style.getPropertyValue('--gy')) || 0,
        };
      });

    const baseline = await readGaze();
    let glanced = false;
    for (let ms = 0; ms < 7000; ms += 250) {
      await page.clock.runFor(250);
      const current = await readGaze();
      if (
        Math.abs(current.gx - baseline.gx) > 0.05 ||
        Math.abs(current.gy - baseline.gy) > 0.05
      ) {
        glanced = true;
        break;
      }
    }

    expect(glanced).toBe(true);
    expect(await troko.getIslandStateAttr()).not.toBe('sleep');
  });

  test('T1-F03-05: Enabling prefers-reduced-motion: reduce suppresses continuous idle animations', async ({
    page,
    troko,
    api,
  }) => {
    await api.completeOnboarding();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await troko.goto();

    await page.mouse.move(1100, 600);
    await page.clock.runFor(200);

    const animInfo = await page.evaluate(() => {
      const parseDurationSec = (raw: string): number => {
        const trimmed = raw.trim().toLowerCase();
        if (!trimmed || trimmed === 'none') return 0;
        const num = parseFloat(trimmed);
        if (Number.isNaN(num)) return 0;
        return trimmed.endsWith('ms') ? num / 1000 : num;
      };
      const roots = Array.from(
        document.querySelectorAll(
          '#island, [data-testid="troko-avatar"], #island svg, #island svg *',
        ),
      );
      const activeViolations: Array<{
        tag: string;
        name: string;
        duration: string;
        playState: string;
      }> = [];
      for (const el of roots) {
        const style = getComputedStyle(el);
        const names = style.animationName.split(',').map((s) => s.trim());
        const durations = style.animationDuration.split(',').map((s) => s.trim());
        const playStates = style.animationPlayState.split(',').map((s) => s.trim());
        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          if (!name || name === 'none') continue;
          const durRaw = durations[i] ?? durations[0] ?? '0s';
          const playState = playStates[i] ?? playStates[0] ?? 'running';
          const durSec = parseDurationSec(durRaw);
          const suppressed =
            durSec <= 0.001 || playState === 'paused' || playState === 'none';
          if (!suppressed) {
            activeViolations.push({
              tag: el.tagName,
              name,
              duration: durRaw,
              playState,
            });
          }
        }
      }
      return {
        reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        activeViolations,
      };
    });

    expect(animInfo.reduced).toBe(true);
    expect(animInfo.activeViolations).toEqual([]);

    const before = await page.evaluate(() => {
      const el =
        document.querySelector('[data-testid="troko-avatar"]') ||
        document.querySelector('#island');
      const s = el ? getComputedStyle(el) : null;
      return s ? s.getPropertyValue('--gx') : '0';
    });

    await page.clock.runFor(6000);
    const after = await page.evaluate(() => {
      const el =
        document.querySelector('[data-testid="troko-avatar"]') ||
        document.querySelector('#island');
      const s = el ? getComputedStyle(el) : null;
      return s ? s.getPropertyValue('--gx') : '0';
    });

    expect(after).toBe(before);
    await expect(troko.islandLocator).toBeVisible();
  });
});
