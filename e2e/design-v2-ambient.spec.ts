import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';

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
