import {writeFile} from 'node:fs/promises';
import {test, expect} from './fixtures';
import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';

test.beforeEach(async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
});

test('canonical period and category geometry survives breakpoint and short-window resizing', async ({page}, testInfo) => {
  await page.goto('/new/stats');
  const row = page.getByRole('region', {name: 'Statistics controls', exact: true});
  const period = page.getByRole('group', {name: 'Ranking period'});
  const category = page.getByRole('group', {name: 'Ranking category'});
  const evidence = [];
  for (const width of [320, 360, 390, 760, 761, 768, 1024, 1440, 1920]) for (const height of [480, 1000]) {
    await page.setViewportSize({width, height});
    const sample = await row.evaluate(element => {
      const groups = [...element.querySelectorAll('v2-tabs')];
      return {overflow: document.documentElement.scrollWidth - innerWidth, row: element.getBoundingClientRect().toJSON(),
        groups: groups.map(group => ({box: group.getBoundingClientRect().toJSON(), caption: group.querySelector('p')!.getBoundingClientRect().toJSON(),
          buttons: [...group.querySelectorAll('button')].map(button => ({box: button.getBoundingClientRect().toJSON(), font: getComputedStyle(button).fontSize,
            icon: button.querySelector('img')?.getBoundingClientRect().toJSON(), label: button.querySelector('button > span:last-child')!.getBoundingClientRect().toJSON()}))}))};
    });
    expect(sample.overflow).toBeLessThanOrEqual(1);
    expect(sample.row.height).toBe(width <= 760 ? 160 : 76);
    for (const group of sample.groups) {
      expect(group.caption.height).toBe(20);
      const [first, second, third] = group.buttons;
      for (const button of group.buttons) {
        expect(button.box.height).toBe(48);
        expect(button.box.width).toBeCloseTo(first.box.width, 1);
        expect(button.box.y - group.caption.bottom).toBeCloseTo(8, 4);
        expect(button.label.left).toBeGreaterThanOrEqual(button.box.left);
        expect(button.label.right).toBeLessThanOrEqual(button.box.right);
        if (button.icon) {
          expect(button.icon.width).toBe(20); expect(button.icon.height).toBe(20);
          if (width <= 760) expect(button.label.top).toBeGreaterThanOrEqual(button.icon.bottom);
          else expect(button.label.left).toBeGreaterThanOrEqual(button.icon.right);
        }
      }
      expect(second.box.x - first.box.right).toBeCloseTo(width <= 760 ? 4 : 8, 1);
      expect(third.box.x - second.box.right).toBeCloseTo(width <= 760 ? 4 : 8, 1);
    }
    if (width <= 760) expect(sample.groups[1].box.y - sample.groups[0].box.bottom).toBeCloseTo(8, 4);
    else {
      expect(sample.groups[1].box.x - sample.groups[0].box.right).toBeCloseTo(16, 4);
      // Equal fractional grid tracks may round to adjacent 1/64px layout units.
      expect(Math.abs(sample.groups[0].box.width - sample.groups[1].box.width)).toBeLessThanOrEqual(1 / 64);
    }
    evidence.push({width, height, ...sample});
    if ([390, 1440].includes(width)) {
      // Capture the settled element rather than an intermediate smooth-scroll frame.
      await row.evaluate(element => element.scrollIntoView({block: 'center', behavior: 'instant'}));
      await row.screenshot({path: testInfo.outputPath(`period-category-${width}-${height}.png`), animations: 'disabled'});
    }
  }
  await expect(period.getByRole('button', {name: '4 weeks', exact: true})).toHaveAttribute('aria-pressed', 'true');
  await expect(category.getByRole('button', {name: 'Songs', exact: true})).toHaveAttribute('aria-pressed', 'true');
  const loadedIcons = await category.locator('img').evaluateAll(images => images.map(image => ({loaded: (image as HTMLImageElement).complete,
    width: (image as HTMLImageElement).naturalWidth, height: (image as HTMLImageElement).naturalHeight, src: (image as HTMLImageElement).currentSrc})));
  expect(loadedIcons).toHaveLength(3);
  for (const icon of loadedIcons) {expect(icon.loaded).toBe(true); expect(icon.width).toBe(20); expect(icon.height).toBe(20); expect(icon.src).toContain('/new/assets/design-v2/stats-category-');}
  await expectNoBlockingAxeViolations(page);
  await writeFile(testInfo.outputPath('period-category-responsive-geometry.json'), JSON.stringify(evidence, null, 2));
});

test('period keyboard changes query the selected range once and category choices reuse its payload', async ({page}, testInfo) => {
  const requests: {kind: string; range: string | null; offset: number; limit: number}[] = [];
  await page.route('https://api.spotify.com/v1/me/top/**', async route => {
    const url = new URL(route.request().url()), kind = url.pathname.endsWith('tracks') ? 'tracks' : 'artists', range = url.searchParams.get('time_range');
    const offset = Number(url.searchParams.get('offset')), limit = Number(url.searchParams.get('limit'));
    requests.push({kind, range, offset, limit});
    const item = kind === 'tracks' ? {id: `song-${range}`, name: `Song ${range}`, artists: [{name: 'Artist'}], album: {images: []}}
      : {id: `artist-${range}`, name: `Artist ${range}`, images: [], genres: ['pop']};
    await route.fulfill({json: {items: offset === 0 ? [item] : [], total: 1}});
  });
  await page.goto('/new/stats');
  const period = page.getByRole('group', {name: 'Ranking period'});
  const category = page.getByRole('group', {name: 'Ranking category'});
  await expect(page.locator('.v2-ranking-list strong')).toHaveText('Song short_term');
  await period.getByRole('button', {name: '4 weeks', exact: true}).press('ArrowRight');
  const medium = period.getByRole('button', {name: '6 months', exact: true});
  await expect(medium).toBeFocused();
  await expect(medium).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.v2-ranking-list strong')).toHaveText('Song medium_term');
  await medium.press('End');
  const long = period.getByRole('button', {name: '1 year', exact: true});
  await expect(long).toBeFocused();
  await expect(page.locator('.v2-ranking-list strong')).toHaveText('Song long_term');
  await long.press('Space');
  await category.getByRole('button', {name: 'Songs', exact: true}).press('ArrowRight');
  const artists = category.getByRole('button', {name: 'Artists', exact: true});
  await expect(artists).toBeFocused();
  await expect(artists).toHaveCSS('border-top-width', '2px');
  await expect(artists).toHaveCSS('border-top-color', 'rgb(53, 231, 131)');
  await expect(page.locator('.v2-artist-rankings strong')).toHaveText('Artist long_term');
  expect(requests.sort((a, b) => `${a.range}:${a.kind}`.localeCompare(`${b.range}:${b.kind}`) || a.offset - b.offset)).toEqual(
    ['long_term', 'medium_term', 'short_term'].flatMap(range => [{kind: 'artists', range, offset: 0, limit: 50}, {kind: 'tracks', range, offset: 0, limit: 50},
      {kind: 'tracks', range, offset: 50, limit: 50}, {kind: 'tracks', range, offset: 100, limit: 10}]));
  await expectNoBlockingAxeViolations(page);
  await writeFile(testInfo.outputPath('period-service-requests.json'), JSON.stringify(requests, null, 2));
});
