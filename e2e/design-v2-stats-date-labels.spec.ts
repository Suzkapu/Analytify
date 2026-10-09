import {writeFile} from 'node:fs/promises';
import {test, expect} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {showStatsDateControls, chooseStatsDate} from './helpers/stats-calendar';

for (const timezoneId of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) test.describe(`canonical saved day in ${timezoneId}`, () => {
  test.use({timezoneId, locale: 'de-AT'});
  test('calendar selection uses the saved date and keeps narrow date controls readable', async ({page}, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
    await mockSpotify(page); await seedAuthenticatedBrowser(page);
    const detailRequests: string[] = [];
    await page.route('**/rest/v1/stats_snapshots**', route => {
      if (new URL(route.request().url()).searchParams.has('id')) detailRequests.push(route.request().url());
      return route.fulfill({json: []});
    });
    await page.evaluate(async () => {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('AnalytifyDB', 4);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result, tx = db.transaction('statsHistory', 'readwrite');
          tx.objectStore('statsHistory').put({id: 'dated-ranking', userId: 'e2e-user_dev', range: 'short_term',
            timestamp: Date.parse('2026-09-25T00:10:00Z'), snapshotDate: '2026-09-24', isLoaded: true,
            topTracks: [{id: 'saved-song', name: 'Saved calendar-day song', artists: [{name: 'Saved Artist'}], album: {images: []}}],
            topArtists: [], topGenres: []});
          tx.oncomplete = () => {db.close(); resolve();}; tx.onerror = () => reject(tx.error);
        };
      });
    });
    await page.goto('/new/stats');
    await expect(page.locator('.v2-ranking-list strong')).toHaveText('Test Song');
    await showStatsDateControls(page);
    const ranking = page.getByRole('button', {name: 'Ranking date', exact: true});
    const comparison = page.getByRole('button', {name: 'Compare with', exact: true});
    await expect(ranking.locator('.value')).toHaveText('Today');
    await expect(comparison.locator('.value')).toHaveText('24 Sep 2026');
    await ranking.press('Enter');
    const calendar = page.getByRole('dialog', {name: 'VIEW SNAPSHOT', exact: true});
    await calendar.getByRole('button', {name: 'Previous saved month', exact: true}).click();
    await calendar.locator('button[data-date="2026-09-24"]').click();
    await expect(calendar).toHaveCount(0);
    await expect(page.locator('.v2-ranking-list strong')).toHaveText('Saved calendar-day song');
    await expect(ranking.locator('.value')).toHaveText('24 Sep 2026');
    await chooseStatsDate(page, 'comparison', 'current');
    await expect(comparison.locator('.value')).toHaveText('Today');
    expect(detailRequests).toEqual([]);
    const geometry = [];
    for (const width of [320, 360, 390, 760, 761, 768, 1024, 1440, 1920]) for (const height of [480, 1000]) {
      await page.setViewportSize({width, height});
      const compare = page.getByRole('button', {name: 'Compare dates', exact: true});
      expect((await compare.boundingBox())!.width).toBeCloseTo(width <= 760 ? 166 : 164, 4);
      const sample = await page.locator('#v2-stats-dates').evaluate(element => ({
        overflow: document.documentElement.scrollWidth - innerWidth,
        fields: [...element.querySelectorAll('.value')].map(value => {
          const bounds = value.getBoundingClientRect(), text = document.createRange(); text.selectNodeContents(value);
          return {box: bounds.toJSON(), text: text.getBoundingClientRect().toJSON(), label: value.textContent};
        })
      }));
      expect(sample.overflow).toBeLessThanOrEqual(1);
      for (const field of sample.fields) {
        expect(field.box.height).toBe(48);
        expect(field.text.left).toBeGreaterThanOrEqual(field.box.left + 16);
        expect(field.text.right).toBeLessThanOrEqual(field.box.right - 16);
        expect(field.text.bottom).toBeLessThanOrEqual(field.box.bottom);
      }
      geometry.push({width, height, ...sample});
      if ([390, 1440].includes(width)) {
        const row = page.locator('#v2-stats-dates');
        await row.evaluate(element => element.scrollIntoView({block: 'center', behavior: 'instant'}));
        await row.screenshot({path: testInfo.outputPath(`date-labels-${width}-${height}.png`), animations: 'disabled'});
      }
    }
    await expectNoBlockingAxeViolations(page);
    await writeFile(testInfo.outputPath('saved-day-responsive-geometry.json'), JSON.stringify({timezoneId, locale: 'de-AT', detailRequests, geometry}, null, 2));
  });
});
