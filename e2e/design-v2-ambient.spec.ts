import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';
import {mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';

test('one ambient renderer persists through overlays, routes, and shell modes', async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.goto('/new/playlists');
  const ambient = page.locator('app-ambient-background');
  await expect(ambient).toHaveCount(1);
  await ambient.evaluate(element => { (element as HTMLElement & {ambientIdentity?: string}).ambientIdentity = 'persistent'; });
  const baseIntensity = await ambient.evaluate(element => (element as HTMLElement).style.getPropertyValue('--ambient-intensity'));

  await page.getByRole('button', {name: 'Open More tools'}).click();
  await expect.poll(() => ambient.evaluate(element => (element as HTMLElement).style.getPropertyValue('--ambient-intensity')))
    .not.toBe(baseIntensity);
  await page.getByRole('link', {name: /Compare Room/}).click();
  await expect(page).toHaveURL(/\/compare-room$/);
  expect(await ambient.evaluate(element => (element as HTMLElement & {ambientIdentity?: string}).ambientIdentity)).toBe('persistent');
  await expect(ambient).toHaveCount(1);

  await page.getByRole('link', {name: 'Legal & privacy'}).click();
  expect(await ambient.evaluate(element => (element as HTMLElement & {ambientIdentity?: string}).ambientIdentity)).toBe('persistent');
  await expect(page.locator('.design-v2')).toHaveAttribute('data-chrome', 'public');
});

test('v2 ambient layer is decorative, stable, scroll-responsive, and reflow-safe', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await page.goto('/new/login');
  const ambient = page.locator('app-ambient-background');
  await expect(ambient).toHaveCount(1);
  await expect(ambient).toHaveAttribute('aria-hidden', 'true');
  await expect(ambient).toHaveCSS('pointer-events', 'none');
  await expect(ambient).toHaveCSS('position', 'fixed');

  const initial = await ambient.evaluate(element => ({
    x: (element as HTMLElement).style.getPropertyValue('--ambient-primary-x'),
    y: (element as HTMLElement).style.getPropertyValue('--ambient-primary-y')
  }));
  await page.locator('.v2-main').evaluate(element => { (element as HTMLElement).style.minHeight = '2400px'; });
  const maxLongTaskMs = await page.evaluate(async () => {
    const longTasks: number[] = [];
    const observer = typeof PerformanceObserver === 'undefined' ? null : new PerformanceObserver(list => {
      longTasks.push(...list.getEntries().map(entry => entry.duration));
    });
    try { observer?.observe({type: 'longtask'}); } catch { /* unsupported browsers simply report no entries */ }
    for (let step = 0; step <= 24; step++) {
      window.scrollTo(0, document.documentElement.scrollHeight * step / 24);
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    observer?.disconnect();
    return Math.max(0, ...longTasks);
  });
  expect(maxLongTaskMs).toBeLessThan(100);
  await expect.poll(() => ambient.evaluate(element =>
    (element as HTMLElement).style.getPropertyValue('--ambient-primary-y')
  )).not.toBe(initial.y);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const axe = await new AxeBuilder({page})
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(axe.violations, JSON.stringify(axe.violations, null, 2)).toEqual([]);

  await page.reload();
  await expect.poll(() => ambient.evaluate(element =>
    (element as HTMLElement).style.getPropertyValue('--ambient-primary-x')
  )).toBe(initial.x);
});

for (const nativeTransitions of [true, false]) {
  test(`route content and focus survive with native transitions ${nativeTransitions ? 'enabled' : 'unavailable'}`, async ({page}) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(enabled => {
      const native = document.startViewTransition?.bind(document);
      (window as any).__nativeTransitionCalls = 0;
      (window as any).__nativeTransitionAvailable = !!native;
      Object.defineProperty(document, 'startViewTransition', {
        configurable: true,
        value: enabled && native ? (callback: () => void | Promise<void>) => {
          (window as any).__nativeTransitionCalls++;
          return native(callback);
        } : undefined
      });
    }, nativeTransitions);
    await mockSpotify(page);
    await seedAuthenticatedBrowser(page);
    await page.goto('/new/playlists');
    await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
    if (nativeTransitions) expect(await page.evaluate(() => (window as any).__nativeTransitionAvailable)).toBe(true);
    const ambient = page.locator('app-ambient-background');
    await ambient.evaluate(element => { (element as any).__transitionIdentity = 'same-renderer'; });
    const previousCalls = await page.evaluate(() => (window as any).__nativeTransitionCalls);
    await page.getByRole('button', {name: 'Open More tools'}).press('Enter');
    await page.getByRole('link', {name: /Compare Room/}).press('Enter');
    await expect(page).toHaveURL(/\/compare-room$/);
    await expect(page.getByRole('main', {name: 'Compare Room content'})).toBeVisible();
    await expect(page.locator('main')).toBeFocused();
    await expect(ambient).toHaveCount(1);
    expect(await ambient.evaluate(element => (element as any).__transitionIdentity)).toBe('same-renderer');
    const calls = await page.evaluate(() => (window as any).__nativeTransitionCalls);
    if (nativeTransitions) expect(calls).toBeGreaterThan(previousCalls);
    else expect(calls).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('v2 ambient layer remains static with reduced motion', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/new/login');
  const ambient = page.locator('app-ambient-background');
  const initial = await ambient.evaluate(element => ({
    x: (element as HTMLElement).style.getPropertyValue('--ambient-primary-x'),
    y: (element as HTMLElement).style.getPropertyValue('--ambient-primary-y')
  }));
  await page.locator('.v2-main').evaluate(element => { (element as HTMLElement).style.minHeight = '2400px'; });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  await expect(ambient).toHaveCSS('pointer-events', 'none');
  expect(await ambient.evaluate(element => ({
    x: (element as HTMLElement).style.getPropertyValue('--ambient-primary-x'),
    y: (element as HTMLElement).style.getPropertyValue('--ambient-primary-y')
  }))).toEqual(initial);
  await expect(page.locator('.ambient-dots')).toHaveCSS('transform', 'none');
});

test('reduced motion suppresses native route snapshot animations without losing navigation', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.addInitScript(() => {
    const native = document.startViewTransition.bind(document);
    (window as any).__reducedTransitionStyles = null;
    document.startViewTransition = ((callback: () => void | Promise<void>) => {
      const transition = native(callback);
      void transition.ready.then(() => {
        (window as any).__reducedTransitionStyles = ['::view-transition-group(root)',
          '::view-transition-old(root)', '::view-transition-new(root)'].map(pseudo =>
          getComputedStyle(document.documentElement, pseudo).animationName);
      }).catch(() => { (window as any).__reducedTransitionStyles = ['transition-ready-rejected']; });
      return transition;
    }) as typeof document.startViewTransition;
  });
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.goto('/new/playlists');
  await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
  await page.getByRole('button', {name: 'Open More tools'}).click();
  await page.getByRole('link', {name: /Compare Room/}).click();
  await expect(page.getByRole('main', {name: 'Compare Room content'})).toBeFocused();
  await expect.poll(() => page.evaluate(() => (window as any).__reducedTransitionStyles))
    .toEqual(['none', 'none', 'none']);
  await expect(page.locator('app-ambient-background')).toHaveCount(1);
});
