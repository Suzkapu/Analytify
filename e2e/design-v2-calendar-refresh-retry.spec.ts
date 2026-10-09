import type {Route} from '@playwright/test';
import {test, expect} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {showStatsDateControls} from './helpers/stats-calendar';

for (const reducedMotion of ['no-preference', 'reduce'] as const) test(`cached calendar Retry keeps focus and eligible dates through a real metadata request, motion ${reducedMotion}`, async ({page}) => {
  await page.emulateMedia({reducedMotion});
  await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  await mockSpotify(page); await seedAuthenticatedBrowser(page, {cloudIdentity: true});
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AnalytifyDB', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, tx = db.transaction(['appData', 'featureData', 'statsHistory'], 'readwrite');
        tx.objectStore('appData').put({key: 'de111111-1111-4111-8111-111111111111_backup_active', value: 'true'});
        for (const userId of ['e2e-user', 'e2e-user_dev']) {
          const parts = {tracks: [{id: 'current-song', name: 'Test Song', artists: [{name: 'Test Artist'}], album: {images: []}}],
            artists: [{id: 'current-artist', name: 'Test Artist', images: [], genres: ['pop']}], genres: [{name: 'pop', count: 1, percentage: 100}]};
          for (const [part, value] of Object.entries(parts)) tx.objectStore('featureData').put({key: `${userId}_stats_short_term_${part}`, value: JSON.stringify(value)});
          tx.objectStore('appData').put({key: `${userId}_stats_short_term_lastUpdated`, value: String(Date.now())});
        }
        tx.objectStore('statsHistory').put({id: '22222222-2222-4222-8222-222222222222', userId: 'e2e-user_dev', range: 'short_term',
          snapshotDate: '2026-10-03', timestamp: Date.parse('2026-10-03T12:00:00Z'), isLoaded: true,
          topTracks: [{id: 'cached-song', name: 'Cached ranking song', artists: [{name: 'Saved Artist'}], album: {images: []}}], topArtists: [], topGenres: []});
        tx.oncomplete = () => {db.close(); resolve();}; tx.onerror = () => reject(tx.error);
      };
    });
  });
  let holding = false;
  const requests: URL[] = [], pending: Route[] = [];
  await page.route('**/rest/v1/**', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/users')) return route.fulfill({json: {backup_active: true}});
    if (url.pathname.endsWith('/stats_snapshots') && route.request().method() === 'GET'
      && url.searchParams.get('select')?.replaceAll(' ', '') === 'id,explicit_percentage,genre_diversity,created_at,snapshot_date') {
      requests.push(url);
      if (holding) {pending.push(route); return;}
      return route.fulfill({status: 403, json: {message: 'Isolated metadata refresh failure'}});
    }
    return route.fulfill({json: []});
  });
  await page.goto('/new/stats');
  await expect(page.locator('.v2-ranking-list strong')).toHaveText('Test Song');
  await showStatsDateControls(page);
  const opener = page.getByRole('button', {name: 'Ranking date', exact: true});
  await opener.press('Enter');
  const dialog = page.getByRole('dialog', {name: 'VIEW SNAPSHOT', exact: true});
  await expect(dialog.getByText('Saved dates not refreshed', {exact: true})).toBeVisible();
  const cached = dialog.locator('button[data-date="2026-10-03"]');
  await expect(cached).toBeEnabled();
  const before = requests.length; holding = true;
  await dialog.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  await expect.poll(() => pending.length).toBe(1);
  await expect(dialog.getByText('Refreshing saved dates…', {exact: true})).toBeVisible();
  const close = dialog.getByRole('button', {name: 'Close', exact: true});
  await expect(close).toBeFocused();
  await expect(cached).toBeEnabled();
  await expect(dialog.getByRole('button', {name: 'Retry', exact: true})).toHaveCount(0);
  expect(requests).toHaveLength(before + 1);
  expect(requests.at(-1)!.searchParams.get('user_id')).toBe('eq.de111111-1111-4111-8111-111111111111');
  expect(requests.at(-1)!.searchParams.get('range')).toBe('eq.short_term');
  await expectNoBlockingAxeViolations(page);
  await pending[0].fulfill({json: [
    {id: '22222222-2222-4222-8222-222222222222', snapshot_date: '2026-10-03', created_at: '2026-10-03T12:00:00Z', explicit_percentage: 0, genre_diversity: 0},
    {id: '33333333-3333-4333-8333-333333333333', snapshot_date: '2026-10-06', created_at: '2026-10-06T12:00:00Z', explicit_percentage: 0, genre_diversity: 1}
  ]});
  await expect(dialog.getByText('Refreshing saved dates…', {exact: true})).toHaveCount(0);
  await expect(close).toBeFocused();
  await cached.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await expect(opener.locator('.value')).toHaveText('3 Oct 2026');
  await expect(page.locator('.v2-ranking-list strong')).toHaveText('Cached ranking song');
  expect(requests).toHaveLength(before + 1);
  await expectNoBlockingAxeViolations(page);
});
