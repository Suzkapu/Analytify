import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {expect, test} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';

for (const [scene, path] of [['Library', 'playlists'], ['Insights', 'history'], ['Social', 'compare-room'], ['League', 'song-league']] as const) {
  test(`canonical glow scene ${scene} preserves native assets and responsive geometry`, async ({page}, info) => {
    const envelope = JSON.parse(await readFile('docs/testing-evidence/design-v2/ambient-route-glow-canonical-geometry.json', 'utf8'));
    const canonical = JSON.parse(envelope.content.find((item: {type: string}) => item.type === 'text').text);
    const errors: string[] = []; const isolatedRequests: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    // All remote transports are synthetic. Real cloud identity/workflows are
    // separate contracts; this test mounts actual routes to verify their scene.
    await page.route('https://**', route => {isolatedRequests.push(new URL(route.request().url()).origin); return route.fulfill({status: 503, json: {message: 'Isolated glow fixture'}});});
    await mockSpotify(page); await seedAuthenticatedBrowser(page);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.goto(`/new/${path}`);
    const ambient = page.locator('app-ambient-background');
    await expect(ambient.locator('.ambient-primary img, .ambient-secondary img')).toHaveCount(2);
    await expect.poll(() => ambient.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    const geometry: unknown[] = [];
    for (const width of [1440, 1920, 1024, 768, 761, 760, 390, 360, 320]) for (const height of [480, 1000]) {
      await page.setViewportSize({width, height});
      const mobile = width <= 760;
      const reference = canonical.variants.find((variant: {name: string}) => variant.name === `Viewport=${mobile ? 'Mobile' : 'Desktop'}, Scene=${scene}`);
      await expect.poll(() => ambient.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalHeight === (window.innerWidth <= 760 ? 760 : 1050)))).toBe(true);
      const sample = await ambient.evaluate(element => ({background: getComputedStyle(element).backgroundColor, backgroundImage: getComputedStyle(element).backgroundImage,
        glows: ['.ambient-primary', '.ambient-secondary'].map(selector => {
          const glow = element.querySelector(selector)!; const image = glow.querySelector('img')!;
          const rect = image.getBoundingClientRect(); const style = getComputedStyle(glow);
          return {x: rect.x, y: rect.y, width: rect.width, height: rect.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
            asset: new URL(image.currentSrc).pathname.split('/').pop(), alt: image.alt, opacity: style.opacity, backgroundImage: style.backgroundImage};
        })}));
      expect(sample.background).toBe('rgb(7, 11, 9)'); expect(sample.backgroundImage).toBe('none');
      for (const [index, glow] of sample.glows.entries()) {
        const target = reference.glows[index];
        const expectedX = (target.x + target.width / 2) / reference.width * width - target.width / 2;
        const expectedY = (target.y + target.height / 2) / reference.height * height - target.height / 2;
        expect(Math.abs(glow.x - expectedX)).toBeLessThan(.03); expect(Math.abs(glow.y - expectedY)).toBeLessThan(.03);
        expect(glow).toMatchObject({width: target.width, height: target.height, naturalWidth: target.width, naturalHeight: target.height,
          asset: `ambient-${index === 0 ? 'green' : 'blue'}-${mobile ? 'mobile' : 'desktop'}.svg`, alt: '', opacity: '1', backgroundImage: 'none'});
      }
      geometry.push({scene, width, height, sample});
    }
    expect(errors).toEqual([]);
    await writeFile(info.outputPath('canonical-glow-geometry.json'), JSON.stringify({geometry, isolatedRequests}, null, 2));
    await page.screenshot({path: info.outputPath('canonical-glow-mobile-page.png'), fullPage: true});
    // Keep both captures even when an assertion fails. Initial baselines were
    // reviewed against Figma before copying; see glow-component-visual-review.json.
    for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
      await page.setViewportSize(viewport);
      await expect.poll(() => ambient.locator('img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalHeight === (window.innerWidth <= 760 ? 760 : 1050)))).toBe(true);
      await ambient.screenshot({path: info.outputPath(`candidate-${scene.toLowerCase()}-${name}.png`), scale: 'css', animations: 'disabled',
        style: '.design-v2 > :not(app-ambient-background), .ambient-dots {visibility:hidden !important;}'});
    }
    for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
      await page.setViewportSize(viewport);
      await expect(ambient).toHaveScreenshot(`glow-${scene.toLowerCase()}-${name}.png`, {scale: 'css', animations: 'disabled', threshold: .01, maxDiffPixels: 0,
        stylePath: resolve('e2e/helpers/glow-screenshot.css')});
    }
  });
}


test('actual route changes move glows smoothly and preserve the independent particle timeline', async ({page}, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('https://**', route => route.fulfill({status: 503, json: {message: 'Isolated glow fixture'}}));
  await mockSpotify(page); await seedAuthenticatedBrowser(page);
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.setViewportSize({width: 1440, height: 810});
  await page.goto('/new/playlists');
  const ambient = page.locator('app-ambient-background');
  await expect.poll(() => ambient.evaluate(element => element.style.getPropertyValue('--ambient-primary-x'))).toBe('25.0000%');
  await page.locator('.ambient-dot').first().evaluate(async element => {
    const animation = element.getAnimations()[0]; await animation.ready;
    (window as any).__glowParticle = animation; (window as any).__glowParticleTime = animation.currentTime;
  });
  await ambient.evaluate(element => {
    (window as any).__glowFrames = []; (window as any).__glowSettled = false;
    let frames = 0;
    const sample = () => {
      const x = parseFloat(element.style.getPropertyValue('--ambient-primary-x'));
      const y = parseFloat(element.style.getPropertyValue('--ambient-primary-y'));
      (window as any).__glowFrames.push({x, y});
      if (x === 68 && y === 30) {(window as any).__glowSettled = true; return;}
      if (++frames < 360) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  const sidebar = page.getByRole('complementary', {name: 'Desktop sidebar'});
  await sidebar.getByRole('link', {name: 'Compare playlists', exact: true}).click();
  await expect(page).toHaveURL(/\/compare-room$/);
  await expect.poll(() => page.evaluate(() => (window as any).__glowFrames.some((frame: {x: number}) => frame.x > 25 && frame.x < 40))).toBe(true);
  // Interrupt the first move through another real destination, before its
  // completion can overwrite the latest route's canonical target.
  await sidebar.getByRole('link', {name: 'History', exact: true}).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect.poll(() => page.evaluate(() => (window as any).__glowSettled)).toBe(true);
  expect(await page.locator('.ambient-dot').first().evaluate(element => element.getAnimations()[0] === (window as any).__glowParticle
    && Number(element.getAnimations()[0].currentTime) > Number((window as any).__glowParticleTime))).toBe(true);
  await page.emulateMedia({reducedMotion: 'reduce'});
  await sidebar.getByRole('link', {name: 'Compare playlists', exact: true}).click();
  await expect.poll(() => ambient.evaluate(element => element.style.getPropertyValue('--ambient-primary-x'))).toBe('40.0000%');
  expect(await page.locator('.ambient-dot').first().evaluate(element => element.getAnimations().length)).toBe(0);
  expect(errors).toEqual([]);
  await writeFile(info.outputPath('native-glow-route-frames.json'), JSON.stringify(await page.evaluate(() => (window as any).__glowFrames), null, 2));
});
