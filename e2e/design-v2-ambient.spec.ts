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
  await expect(page).toHaveURL(/\/new\/compare-room$/);
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
  expect(axe.violations.filter(violation => ['serious', 'critical'].includes(violation.impact || ''))).toEqual([]);

  await page.reload();
  await expect.poll(() => ambient.evaluate(element =>
    (element as HTMLElement).style.getPropertyValue('--ambient-primary-x')
  )).toBe(initial.x);
});

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
