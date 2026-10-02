import {expect, Page, test} from '@playwright/test';
import {
  expectNoBlockingAxeViolations,
  mockSpotify,
  seedAuthenticatedBrowser
} from './helpers/authenticated-browser';

test.beforeEach(async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
});

test('v2 playlists uses stable controls and preserves v2 navigation', async ({page}) => {
  await page.goto('/playlists');
  await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
  await expect(page.getByRole('searchbox', {name: 'Search your playlists'})).toBeVisible({timeout: 15_000});
  await expect(page.getByRole('button', {name: /Song count: default order/})).toBeVisible();

  const playlistCard = page.locator('.v2-playlist-card').filter({hasText: 'Test Playlist'});
  const open = playlistCard.locator('a[href="/songs/playlist-1"]');
  const analyze = playlistCard.locator('a[href="/analysis/playlist-1"]');
  await expect(open).toHaveAttribute('href', '/songs/playlist-1');
  await expect(analyze).toHaveAttribute('href', '/analysis/playlist-1');
  await open.click();
  await expect(page).toHaveURL(/\/songs\/playlist-1$/);
  await expect(page.getByRole('heading', {name: 'Playlist contents'})).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  await expectNoBlockingAxeViolations(page);
});

test('v2 library remains reflow-safe at 320 CSS pixels', async ({page}) => {
  await page.setViewportSize({width: 320, height: 800});
  await page.goto('/playlists');
  const playlistCard = page.locator('.v2-playlist-card').filter({hasText: 'Test Playlist'});
  await expect(playlistCard.locator('a[href="/songs/playlist-1"]')).toBeVisible({timeout: 15_000});
  await expect(playlistCard.locator('a[href="/analysis/playlist-1"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expectNoBlockingAxeViolations(page);
});

test('every v2 library child route retains the shared shell', async ({page}) => {
  for (const path of ['/songs/playlist-1', '/artistDetails/artist-1', '/analysis/playlist-1'] as const) {
    await page.goto(path);
    await expect(page.locator('.v2-page__header h1')).toBeVisible();
    await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
  }
});

async function seedAlbumPlaylist(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AnalytifyDB', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['appData', 'featureData'], 'readwrite');
        const tracks = [2, 1].map(index => ({
          id: `album-song-${index}`, name: `Album song ${index}`, playlist_index: index,
          duration_ms: 120000, artists: [{id: 'artist-1', name: 'Test Artist'}],
          album: {id: 'album-1', name: 'Test Album', images: []},
          external_urls: {spotify: `https://open.spotify.com/track/album-song-${index}`}
        }));
        for (const userId of ['e2e-user', 'e2e-user_dev']) {
          transaction.objectStore('featureData').put({key: `${userId}_artist_artist-1`,
            value: JSON.stringify({id: 'artist-1', name: 'Cached Test Artist', images: [], genres: ['pop']})});
          transaction.objectStore('featureData').put({key: `${userId}_playlist-1`,
            value: JSON.stringify([{id: 'artist-1', name: 'Test Artist', images: [], tracks}])});
          const store = transaction.objectStore('appData');
          store.put({key: `${userId}_playlist-1_lastUpdated`, value: String(Date.now())});
          store.put({key: `${userId}_playlist-1_Amount`, value: '2'});
          store.put({key: `${userId}_playlist-1_CachedTrackCount`, value: '2'});
          store.put({key: `${userId}_playlist-1_Name`, value: JSON.stringify('Test Playlist')});
          store.put({key: `${userId}_artist_artist-1_lastUpdated`, value: String(Date.now())});
        }
        transaction.oncomplete = () => {db.close(); resolve();};
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
}

test('album details expose playlist songs through keyboard controls', async ({page}) => {
  await seedAlbumPlaylist(page);
  await page.goto('/songs/playlist-1');
  await page.getByRole('button', {name: 'Albums', exact: true}).click();
  const open = page.getByRole('button', {name: 'View songs in Test Album'});
  await open.focus();
  await page.keyboard.press('Enter');
  const songs = page.getByRole('region', {name: 'Songs in Test Album'});
  await expect(songs.locator('.v2-track-copy strong')).toHaveText(['Album song 1', 'Album song 2']);
  await expectNoBlockingAxeViolations(page);
  await page.getByRole('button', {name: 'Back to albums'}).click();
  await expect(open).toBeVisible();
  await expect(open).toBeFocused();
  await expect(songs).toHaveCount(0);
});

test('analysis and artist details render asynchronously hydrated data', async ({page}) => {
  await seedAlbumPlaylist(page);
  await page.goto('/analysis/playlist-1');
  await expect(page.getByRole('heading', {name: 'Test Playlist', exact: true})).toBeVisible();
  const metrics = page.getByRole('region', {name: 'Playlist statistics'});
  await expect(metrics).toBeVisible();
  await expect(metrics.locator('v2-card').filter({hasText: 'Total songs'})).toContainText('2');
  await expectNoBlockingAxeViolations(page);
  await page.goto('/artistDetails/artist-1');
  await expect(page.getByRole('heading', {name: 'Cached Test Artist', exact: true, level: 1})).toBeVisible();
  await expectNoBlockingAxeViolations(page);
});

test('account hub is keyboard reachable on desktop and mobile', async ({page}) => {
  await page.goto('/playlists');
  const account = page.getByRole('button', {name: 'Open account and data settings'});
  await account.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', {name: /Browser test user/})).toBeVisible();
  await expect(page.getByRole('button', {name: 'Notifications'})).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', {name: /Browser test user/})).toBeHidden();

  await page.setViewportSize({width: 320, height: 800});
  await account.click();
  await expect(page.getByRole('dialog', {name: /Browser test user/})).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expectNoBlockingAxeViolations(page);
});

test('local data clear uses a consequence-first confirmation flow', async ({page}) => {
  await page.goto('/playlists');
  await page.getByRole('button', {name: 'Open account and data settings'}).click();
  await page.getByRole('button', {name: 'Clear data'}).click();
  await expect(page.getByRole('alertdialog', {name: 'What would you like to clear?'})).toBeVisible();
  await page.getByRole('button', {name: /Clear this browser and log out/}).click();
  await expect(page.getByRole('alertdialog', {name: 'Clear this browser and log out?'})).toBeVisible();
  await page.getByRole('button', {name: 'Clear and log out'}).click();
  await expect(page).toHaveURL(/\/login$/);
});
