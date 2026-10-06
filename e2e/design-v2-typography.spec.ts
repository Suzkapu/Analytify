import {test, expect} from './fixtures';
import {writeFile} from 'node:fs/promises';

for (const width of [390, 1440]) {
  test(`public pages load canonical Outfit rather than a system fallback at ${width}px`, async ({page}, testInfo) => {
    const browserErrors: string[] = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    await page.setViewportSize({width, height: 1080});
    const measurements = [];
    for (const path of ['/new/login', '/new/legal']) {
      await page.goto(path);
      const title = page.getByRole('main').getByRole('heading', {level: 1}).first();
      await expect(title).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(title).toHaveCSS('font-family', /^(?:"Outfit Variable"|Outfit Variable), sans-serif$/);
      const font = await title.evaluate(element => {
        const style = getComputedStyle(element);
        return {family: style.fontFamily, weight: style.fontWeight, size: style.fontSize,
          faces: [...document.fonts].filter(face => face.family.replace(/["']/g, '') === 'Outfit Variable')
            .map(face => ({status: face.status, weight: face.weight})),
          overflow: document.documentElement.scrollWidth - innerWidth};
      });
      expect(font.faces.some(face => face.status === 'loaded')).toBe(true);
      expect(font.overflow).toBeLessThanOrEqual(1);
      measurements.push({path, width, ...font});
    }
    await writeFile(testInfo.outputPath('public-font-measurements.json'), JSON.stringify(measurements, null, 2));
    expect(browserErrors, 'Public-page rendering must not throw browser errors').toEqual([]);
  });
}

test('initially hidden public page mounts with reduced motion without browser rendering errors', async ({page}) => {
  const browserErrors: string[] = [];
  page.on('pageerror', error => browserErrors.push(error.message));
  await page.addInitScript(() => {
    // Deterministic background-tab startup; native tab visibility varies by engine in headless runs.
    Object.defineProperty(document, 'hidden', {get: () => true, configurable: true});
  });
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/new/login');
  await expect(page.getByRole('main').getByRole('heading', {level: 1}).first()).toBeVisible();
  const ambient = page.locator('app-ambient-background');
  await expect(ambient).toHaveCSS('--ambient-intensity', /\d/);
  await page.goto('/new/legal');
  await expect(page.getByRole('main').getByRole('heading', {level: 1}).first()).toBeVisible();
  expect(browserErrors).toEqual([]);
});
