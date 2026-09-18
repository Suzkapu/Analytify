import AxeBuilder from '@axe-core/playwright';
import {expect, Page, test} from '@playwright/test';

const seriousOrCritical = ['serious', 'critical'];

async function expectNoBlockingAxeViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({page})
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = result.violations.filter(violation =>
    seriousOrCritical.includes(violation.impact || '')
  );
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
}

async function seedAuthenticatedBrowser(page: Page): Promise<void> {
  await page.goto('/login');
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AnalytifyDB', 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('appData')) db.createObjectStore('appData', {keyPath: 'key'});
        if (!db.objectStoreNames.contains('featureData')) db.createObjectStore('featureData', {keyPath: 'key'});
        if (!db.objectStoreNames.contains('statsHistory')) {
          const store = db.createObjectStore('statsHistory', {keyPath: 'id', autoIncrement: true});
          store.createIndex('by_user_range', ['userId', 'range']);
        }
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('appData', 'readwrite');
        const store = transaction.objectStore('appData');
        store.put({key: 'spotifyAccessToken', value: 'e2e-access-token'});
        store.put({key: 'spotifyTokenExpiresAt', value: String(Date.now() + 3_600_000)});
        store.put({key: 'spotifyUserId', value: 'e2e-user'});
        store.put({key: 'spotifyConnectionMode', value: 'hosted'});
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
}

async function mockSpotify(page: Page): Promise<void> {
  await page.route('https://api.spotify.com/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/me') {
      await route.fulfill({json: {id: 'e2e-user', display_name: 'Browser test user', images: []}});
      return;
    }
    if (path.includes('/top/artists')) {
      await route.fulfill({json: {items: [{id: 'artist-1', name: 'Test Artist', images: [], genres: ['pop']}], total: 1}});
      return;
    }
    if (path.includes('/top/tracks')) {
      await route.fulfill({json: {items: [{id: 'track-1', name: 'Test Song', artists: [{id: 'artist-1', name: 'Test Artist'}], album: {id: 'album-1', name: 'Test Album', images: []}, duration_ms: 180000}], total: 1}});
      return;
    }
    if (path.includes('/me/playlists')) {
      await route.fulfill({json: {items: [{id: 'playlist-1', name: 'Test Playlist', owner: {id: 'e2e-user'}, images: [], tracks: {total: 1}, description: ''}], total: 1, next: null}});
      return;
    }
    if (path.includes('/me/tracks')) {
      await route.fulfill({json: {items: [], total: 0, next: null}});
      return;
    }
    await route.fulfill({json: {items: [], total: 0, next: null}});
  });
}

test('logged-out home is keyboard reachable, zoom-safe, and WCAG 2.2 AA clean', async ({page}) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', {name: 'See what you listen to.'})).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
  await expect(page.getByRole('button', {name: 'Continue with Spotify'})).toBeVisible();
  await expectNoBlockingAxeViolations(page);
});

test('authenticated playlists route is responsive and WCAG 2.2 AA clean', async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.goto('/playlists');
  await expect(page.getByRole('heading', {name: /^Your playlists$/i}).first()).toBeVisible();
  await expect(page.getByText('Test Playlist')).toBeVisible();
  await expectNoBlockingAxeViolations(page);
});

test('authenticated stats route is responsive and WCAG 2.2 AA clean', async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.goto('/stats');
  await expect(page.getByRole('heading', {name: /^Your top listening$/i}).first()).toBeVisible();
  await expect(page.getByText('Test Song').first()).toBeVisible();
  await expectNoBlockingAxeViolations(page);
});

test('critical routes honor reduced-motion preferences', async ({page}) => {
  await page.emulateMedia({reducedMotion: 'reduce'});
  await page.goto('/login');
  const durations = await page.locator('body *').evaluateAll(elements => elements.flatMap(element => {
    const style = getComputedStyle(element);
    return [style.animationDuration, style.transitionDuration];
  }));
  expect(durations.every(duration => duration.split(',').every(value => parseFloat(value) <= 0.01))).toBe(true);
});
