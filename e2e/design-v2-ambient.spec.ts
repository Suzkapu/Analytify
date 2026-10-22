import {readFile, writeFile} from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import {expect, test} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
import type {Page} from '@playwright/test';

// Menu belongs to the mobile header; preserve each test's original viewport
// after navigating through the real expanded drawer.
async function openNavigationMenu(page: Page) {
  const viewport = page.viewportSize();
  if (viewport && viewport.width > 760) await page.setViewportSize({...viewport, width: 390});
  await page.getByRole('button', {name: 'Open navigation menu'}).press('Enter');
  return async () => {if (viewport) await page.setViewportSize(viewport);};
}

test('one ambient renderer persists through overlays, routes, and shell modes', async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.goto('/new/playlists');
  const ambient = page.locator('app-ambient-background');
  await expect(ambient).toHaveCount(1);
  await ambient.evaluate(element => { (element as HTMLElement & {ambientIdentity?: string}).ambientIdentity = 'persistent'; });
  await page.locator('.ambient-dot').first().evaluate(async element => {
    const animation = element.getAnimations()[0]; await animation.ready;
    (window as any).__persistentParticle = animation;
    (window as any).__persistentParticleTime = animation.currentTime;
  });
  const baseIntensity = await ambient.evaluate(element => (element as HTMLElement).style.getPropertyValue('--ambient-intensity'));
  const glowCoordinates = () => ambient.evaluate(element => ['primary-x', 'primary-y', 'secondary-x', 'secondary-y']
    .map(key => (element as HTMLElement).style.getPropertyValue(`--ambient-${key}`)));
  const initialGlows = await glowCoordinates();

  const restoreViewport = await openNavigationMenu(page);
  await expect.poll(() => ambient.evaluate(element => (element as HTMLElement).style.getPropertyValue('--ambient-intensity')))
    .not.toBe(baseIntensity);
  expect(await glowCoordinates()).toEqual(initialGlows);
  await page.getByRole('link', {name: /Compare playlists/}).click();
  await expect(page).toHaveURL(/\/compare-room$/);
  await restoreViewport();
  expect(await ambient.evaluate(element => (element as HTMLElement & {ambientIdentity?: string}).ambientIdentity)).toBe('persistent');
  await expect(ambient).toHaveCount(1);
  expect(await page.locator('.ambient-dot').first().evaluate(element => {
    const animation = element.getAnimations()[0];
    return animation === (window as any).__persistentParticle && Number(animation.currentTime) >= Number((window as any).__persistentParticleTime);
  })).toBe(true);

  await page.getByRole('link', {name: 'Legal & privacy'}).click();
  expect(await ambient.evaluate(element => (element as HTMLElement & {ambientIdentity?: string}).ambientIdentity)).toBe('persistent');
  await expect(page.locator('.design-v2')).toHaveAttribute('data-chrome', 'public');
});

test('v2 ambient layer is decorative, fixed-glow, particle-scroll-responsive, and reflow-safe', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await page.goto('/new/login');
  const ambient = page.locator('app-ambient-background');
  await expect(ambient).toHaveCount(1);
  await expect(ambient).toHaveAttribute('aria-hidden', 'true');
  await expect(ambient).toHaveCSS('pointer-events', 'none');
  await expect(ambient).toHaveCSS('position', 'fixed');

  const initial = await ambient.evaluate(element => ({
    x: (element as HTMLElement).style.getPropertyValue('--ambient-primary-x'),
    y: (element as HTMLElement).style.getPropertyValue('--ambient-primary-y'),
    secondaryX: (element as HTMLElement).style.getPropertyValue('--ambient-secondary-x'),
    secondaryY: (element as HTMLElement).style.getPropertyValue('--ambient-secondary-y'),
    dotsY: (element as HTMLElement).style.getPropertyValue('--ambient-dots-y')
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
    (element as HTMLElement).style.getPropertyValue('--ambient-dots-y')
  )).not.toBe(initial.dotsY);
  const scrolled = await ambient.evaluate(element => ({
    x: (element as HTMLElement).style.getPropertyValue('--ambient-primary-x'),
    y: (element as HTMLElement).style.getPropertyValue('--ambient-primary-y'),
    secondaryX: (element as HTMLElement).style.getPropertyValue('--ambient-secondary-x'),
    secondaryY: (element as HTMLElement).style.getPropertyValue('--ambient-secondary-y')
  }));
  expect(scrolled).toEqual({x: initial.x, y: initial.y, secondaryX: initial.secondaryX, secondaryY: initial.secondaryY});

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
    const restoreViewport = await openNavigationMenu(page);
    await page.getByRole('link', {name: /Compare playlists/}).press('Enter');
    await expect(page).toHaveURL(/\/compare-room$/);
    await restoreViewport();
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
  expect(await page.locator('.ambient-dot').evaluateAll(elements => elements.map(element => ({
    animation: getComputedStyle(element).animationName, active: element.getAnimations().length
  })))).toEqual(Array.from({length: 26}, () => ({animation: 'none', active: 0})));
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
  const restoreViewport = await openNavigationMenu(page);
  await page.getByRole('link', {name: /Compare playlists/}).click();
  await expect(page.getByRole('main', {name: 'Compare Room content'})).toBeFocused();
  await restoreViewport();
  await expect.poll(() => page.evaluate(() => (window as any).__reducedTransitionStyles))
    .toEqual(['none', 'none', 'none']);
  await expect(page.locator('app-ambient-background')).toHaveCount(1);
});


test('canonical particle phases loop independently through a complete native timeline', async ({page}, info) => {
  const context = JSON.parse(await readFile('docs/testing-evidence/design-v2/shell-ambient-particle-geometry.json', 'utf8'));
  const canonical = JSON.parse(context.content.find((entry: {type: string}) => entry.type === 'text').text);
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.setViewportSize({width: 1440, height: 810});
  await page.goto('/new/login');
  const geometry: unknown[] = [];
  for (const viewport of [{width: 1440, height: 810}, {width: 390, height: 867}]) {
    await page.setViewportSize(viewport);
    const mobile = viewport.width <= 760;
    await expect(page.locator('.ambient-dot:visible')).toHaveCount(mobile ? 12 : 26);
    const timing = await page.locator('.ambient-dot:visible').evaluateAll(elements => elements.map(element => {
      const animation = element.getAnimations()[0];
      const effect = animation.effect!.getTiming();
      return {duration: effect.duration, iterations: effect.iterations === Infinity ? 'infinite' : effect.iterations,
        easing: getComputedStyle(element).animationTimingFunction, playState: animation.playState};
    }));
    for (const item of timing) expect(item).toEqual({duration: 24000, iterations: 'infinite', easing: 'ease-in-out', playState: 'running'});
    for (const [time, phase, next] of [[0, 'A', null], [4000, 'A', 'B'], [8000, 'B', null],
      [12000, 'B', 'C'], [16000, 'C', null], [20000, 'C', 'A'], [24000, 'A', null]] as const) {
      await page.locator('.ambient-dot:visible').evaluateAll(async (elements, currentTime) => {
        await Promise.all(elements.map(async element => {const animation = element.getAnimations()[0]; animation.pause(); await animation.ready; animation.currentTime = currentTime;}));
      }, time);
      const sample = await page.locator('.ambient-dot:visible').evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element); const bounds = element.getBoundingClientRect();
        return {x: bounds.x, y: bounds.y, width: parseFloat(style.width), height: parseFloat(style.height), opacity: parseFloat(style.opacity), color: style.backgroundColor};
      }));
      const variant = (name: string) => canonical.variants.find((entry: {name: string}) =>
        entry.name === `Viewport=${mobile ? 'Mobile' : 'Desktop'}, Scene=Library, Phase=${name}`);
      const reference = variant(phase); const destination = next ? variant(next) : reference;
      for (let index = 0; index < sample.length; index++) {
        const from = reference.dots[index]; const to = destination.dots[index];
        const x = (from[1] + to[1]) / 2 / reference.size[0] * viewport.width;
        const y = (from[2] + to[2]) / 2 / reference.size[1] * viewport.height;
        expect(Math.abs(sample[index].x - x)).toBeLessThan(.03);
        expect(Math.abs(sample[index].y - y)).toBeLessThan(.03);
        expect(sample[index]).toMatchObject({width: from[3], height: from[4], color: 'rgb(53, 231, 131)'});
        expect(Math.abs(sample[index].opacity - from[5])).toBeLessThan(.0001);
      }
      geometry.push({viewport, time, sample});
    }
    await page.locator('.ambient-dot:visible').evaluateAll(elements => elements.forEach(element => element.getAnimations()[0].play()));
  }
  const before = await page.locator('.ambient-dot').first().evaluate(element => element.getAnimations()[0].currentTime as number);
  await expect.poll(() => page.locator('.ambient-dot').first().evaluate(element => element.getAnimations()[0].currentTime as number)).toBeGreaterThan(before + 100);

  await page.emulateMedia({reducedMotion: 'reduce'});
  await expect(page.locator('.ambient-dot').first()).toHaveCSS('animation-name', 'none');
  expect(await page.locator('.ambient-dot').first().evaluate(element => element.getAnimations().length)).toBe(0);
  const still = await page.locator('.ambient-dot').first().boundingBox();
  expect(Math.abs(still!.x - 390 * .17)).toBeLessThan(.03);
  expect(Math.abs(still!.y - 867 * 194.0625 / 810)).toBeLessThan(.03);
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await expect.poll(() => page.locator('.ambient-dot').first().evaluate(element => element.getAnimations()[0]?.playState)).toBe('running');
  await writeFile(info.outputPath('canonical-particle-timeline.json'), JSON.stringify(geometry, null, 2));
});


test('particle cohort keeps its phase across desktop mobile desktop resizing', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.setViewportSize({width: 1440, height: 810});
  await page.goto('/new/login');
  await expect(page.locator('.ambient-dot:visible')).toHaveCount(26);
  await page.locator('.ambient-dot').evaluateAll(async elements => {
    const first = elements[0].getAnimations()[0]; const extra = elements[12].getAnimations()[0];
    await Promise.all([first.ready, extra.ready]);
    (window as any).__particleResize = {first, extra, time: first.currentTime};
  });
  await page.setViewportSize({width: 390, height: 867});
  await expect(page.locator('.ambient-dot:visible')).toHaveCount(12);
  await page.setViewportSize({width: 1440, height: 810});
  await expect(page.locator('.ambient-dot:visible')).toHaveCount(26);
  const result = await page.locator('.ambient-dot').evaluateAll(elements => {
    const first = elements[0].getAnimations()[0]; const extra = elements[12].getAnimations()[0];
    return {sameFirst: first === (window as any).__particleResize.first, sameExtra: extra === (window as any).__particleResize.extra,
      phaseDifference: Math.abs(Number(first.currentTime) - Number(extra.currentTime)), advanced: Number(first.currentTime) >= Number((window as any).__particleResize.time)};
  });
  expect(result.sameFirst).toBe(true); expect(result.sameExtra).toBe(true);
  expect(result.phaseDifference).toBeLessThan(1); expect(result.advanced).toBe(true);
});
