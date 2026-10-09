import {writeFile} from 'node:fs/promises';
import {test, expect} from './fixtures';
import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';

const current = [
  {name: 'Alternative Rock', count: 24, percentage: 24},
  {name: 'Dream Pop', count: 18, percentage: 18},
  {name: 'Trip Hop', count: 5, percentage: .5}
];
const previous = [
  {name: 'Dream Pop', count: 24, percentage: 24},
  {name: 'Alternative Rock', count: 18, percentage: 18}
];

test.beforeEach(async ({page}) => {
  await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.evaluate(async ({current, previous}) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AnalytifyDB', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['appData', 'featureData', 'statsHistory'], 'readwrite');
        for (const userId of ['e2e-user', 'e2e-user_dev']) {
          for (const [part, items] of Object.entries({tracks: [], artists: [], genres: current})) {
            transaction.objectStore('featureData').put({key: `${userId}_stats_short_term_${part}`, value: JSON.stringify(items)});
          }
          transaction.objectStore('appData').put({key: `${userId}_stats_short_term_lastUpdated`, value: String(Date.now())});
          for (const date of ['2026-10-04', '2026-10-05']) {
            transaction.objectStore('statsHistory').put({userId, range: 'short_term',
              timestamp: new Date(`${date}T12:00:00Z`).getTime(), snapshotDate: date,
              topTracks: [], topArtists: [], topGenres: previous, isLoaded: true});
          }
        }
        transaction.oncomplete = () => {db.close(); resolve();};
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, {current, previous});
  await page.goto('/new/stats');
  await page.getByRole('button', {name: 'Genres', exact: true}).click();
  await expect(page.locator('v2-genre-rankings .v2-genre-row')).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready);
});

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`genre chart scale, keyboard History and responsive resizing with motion ${motion}`, async ({page}, testInfo) => {
    await page.emulateMedia({reducedMotion: motion});
    const chart = page.locator('v2-genre-rankings');
    await expect(chart.locator('.ticks')).toHaveText('0%5%10%15%20%25%');
    await expect(chart.locator('.name small')).toHaveText(['↑ 1 place · +6 pp', '↓ 1 place · −6 pp', 'New']);
    const records = [];
    for (const width of [320, 360, 390, 760, 761, 768, 1024, 1440, 1920]) {
      for (const height of [480, 1080]) {
        await page.setViewportSize({width, height});
        const geometry = await chart.evaluate(element => {
          const row = element.querySelector('.v2-genre-row')!;
          const name = row.querySelector('.name')!.getBoundingClientRect();
          const bar = row.querySelector('.track')!.getBoundingClientRect();
          const action = row.querySelector('.history')!.getBoundingClientRect();
          const current = row.querySelector('.current')!.getBoundingClientRect();
          const previous = row.querySelector('.previous')!.getBoundingClientRect();
          return {overflow: document.documentElement.scrollWidth - innerWidth, row: row.getBoundingClientRect().toJSON(),
            name: name.toJSON(), bar: bar.toJSON(), action: action.toJSON(),
            currentRatio: current.width / bar.width, previousRatio: previous.width / bar.width};
        });
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        expect(geometry.action.height).toBe(44);
        expect(geometry.action.width).toBe(width <= 760 ? 88 : 96);
        expect(geometry.bar.height).toBe(8);
        expect(geometry.currentRatio).toBeCloseTo(.96, 2);
        expect(geometry.previousRatio).toBeCloseTo(.72, 2);
        expect(geometry.name.right).toBeLessThanOrEqual(geometry.action.x);
        expect(geometry.action.x + geometry.action.width).toBeLessThanOrEqual(geometry.row.x + geometry.row.width + .1);
        if (width <= 760) expect(geometry.bar.y).toBeGreaterThanOrEqual(geometry.name.y + geometry.name.height);
        records.push({width, height, ...geometry});
      }
    }
    const search = page.getByRole('searchbox', {name: 'Search genres'});
    await search.fill('DREAM');
    await expect(chart.locator('.v2-genre-row')).toHaveCount(1);
    await expect(chart.locator('strong')).toHaveText('2. Dream Pop');
    await expect(chart.locator('.ticks')).toHaveText('0%5%10%15%20%25%');
    const filteredRatio = await chart.locator('.v2-genre-row').evaluate(row =>
      row.querySelector('.current')!.getBoundingClientRect().width / row.querySelector('.track')!.getBoundingClientRect().width);
    expect(filteredRatio).toBeCloseTo(.72, 2);
    const history = chart.getByRole('button', {name: 'View position history for Dream Pop'});
    await search.press('Tab');
    const compareDates = page.getByRole('button', {name: 'Compare dates', exact: true});
    await expect(compareDates).toBeFocused();
    await compareDates.press('Tab');
    const searchPast = page.getByRole('switch', {name: 'Search past rankings', exact: true});
    await expect(searchPast).toBeFocused();
    await searchPast.press('Tab');
    await expect(history).toBeFocused();
    await expect(history).toHaveCSS('border-top-width', '2px');
    await expect(history).toHaveCSS('border-top-color', 'rgb(159, 255, 200)');
    await history.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Dream Pop');
    await page.setViewportSize({width: 320, height: 480});
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(history).toBeFocused();
    await search.fill('');
    await expect(chart.locator('.v2-genre-row')).toHaveCount(3);
    await search.fill('does not exist');
    await expect(page.getByText('No genre data found', {exact: true})).toBeVisible();
    await expect(chart).toHaveCount(0);
    await search.fill('');
    await expectNoBlockingAxeViolations(page);
    await writeFile(testInfo.outputPath('genre-responsive-geometry.json'), JSON.stringify(records, null, 2));
  });
}

for (const width of [390, 1440]) {
  test(`canonical genre comparisons at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 1080});
    const chart = page.locator('v2-genre-rankings .chart');
    await expect(chart).toHaveCSS('background-color', 'rgb(11, 16, 13)');
    await expect(chart.locator('.v2-genre-row').first()).toHaveCSS('height', width === 390 ? '54px' : '44px');
    await expect(chart.locator('strong').first()).toHaveCSS('font-weight', '500');
    await expect(chart.locator('strong').first()).toHaveCSS('font-family', /^"?Outfit Variable"?, sans-serif$/);
    expect(await page.evaluate(() => [...document.fonts].some(font =>
      font.family.replace(/["']/g, '') === 'Outfit Variable' && font.status === 'loaded'))).toBe(true);
    await expect(chart.locator('.lost')).toHaveCSS('background-color', 'rgb(162, 173, 166)');
    await expect(chart).toHaveScreenshot(`stats-genres-${width}.png`, {animations: 'disabled'});
  });
}

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`long genre names reflow without losing shares or History with motion ${motion}`, async ({page}, testInfo) => {
    await page.emulateMedia({reducedMotion: motion});
    const name = 'An exceptionally long genre name '.repeat(5) + 'UnbrokenGenre'.repeat(12);
    await page.evaluate(async name => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('AnalytifyDB', 4);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, transaction = db.transaction('featureData', 'readwrite');
          for (const userId of ['e2e-user', 'e2e-user_dev']) {
            transaction.objectStore('featureData').put({key: `${userId}_stats_short_term_genres`,
              value: JSON.stringify([{name, count: 24, percentage: 24}])});
          }
          transaction.oncomplete = () => {db.close(); resolve();};
          transaction.onerror = () => reject(transaction.error);
        };
      });
    }, name);
    await page.reload();
    await page.getByRole('button', {name: 'Genres', exact: true}).click();
    const row = page.locator('v2-genre-rankings .v2-genre-row');
    await expect(row).toHaveCount(1);
    await expect(row.locator('strong')).toHaveText(`1. ${name}`);
    await page.evaluate(() => document.fonts.ready);
    expect(await page.evaluate(() => [...document.fonts].some(font =>
      font.family.replace(/["']/g, '') === 'Outfit Variable' && font.status === 'loaded'))).toBe(true);
    const records = [];
    for (const width of [320, 360, 390, 760, 761, 768, 1024, 1440, 1920]) {
      for (const height of [480, 1080]) {
        await page.setViewportSize({width, height});
        const geometry = await row.evaluate(element => {
          const name = element.querySelector<HTMLElement>('.name')!, bounds = name.getBoundingClientRect();
          const action = element.querySelector('.history')!.getBoundingClientRect();
          const bar = element.querySelector('.track')!.getBoundingClientRect();
          return {overflow: document.documentElement.scrollWidth - innerWidth, name: bounds.toJSON(), action: action.toJSON(),
            clippedX: name.scrollWidth - name.clientWidth, clippedY: name.scrollHeight - name.clientHeight,
            rowHeight: element.getBoundingClientRect().height, bar: bar.toJSON()};
        });
        records.push({width, height, ...geometry});
        await writeFile(testInfo.outputPath('genre-long-label-geometry.json'), JSON.stringify(records, null, 2));
        expect(geometry.overflow).toBeLessThanOrEqual(1);
        expect(geometry.clippedX).toBeLessThanOrEqual(1);
        expect(geometry.clippedY).toBeLessThanOrEqual(1);
        expect(geometry.name.right).toBeLessThanOrEqual(geometry.action.x);
        expect(geometry.rowHeight).toBeGreaterThanOrEqual(geometry.name.height);
        expect(geometry.action.height).toBe(44);
        expect(geometry.action.width).toBe(width <= 760 ? 88 : 96);
        expect(geometry.bar.height).toBe(8);
      }
    }
    const history = row.getByRole('button', {name: `View position history for ${name}`});
    await history.press('Space');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText(name);
    await page.keyboard.press('Escape');
    await expect(history).toBeFocused();
    await writeFile(testInfo.outputPath('genre-long-label-geometry.json'), JSON.stringify(records, null, 2));
  });
}
