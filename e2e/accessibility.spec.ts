import AxeBuilder from '@axe-core/playwright';
import {expect, Page, test} from '@playwright/test';
import {CURRENT_TERMS_VERSION} from '../src/app/core/legal/terms-acceptance.service';

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
  await page.evaluate(async termsVersion => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AnalytifyDB', 4);
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
        store.put({
          key: 'termsAcceptance',
          value: `${termsVersion}|2026-09-19T00:00:00.000Z|11111111-1111-4111-8111-111111111111`
        });
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, CURRENT_TERMS_VERSION);
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
  await expect(page.getByRole('heading', {name: 'Explore your playlists.'})).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toBeVisible();
  await page.evaluate(() => { document.documentElement.style.zoom = '200%'; });
  await expect(page.getByRole('button', {name: 'Continue with Spotify'})).toBeVisible();
  await expectNoBlockingAxeViolations(page);
});

test('fresh logged-out visit contains no account, feature, stats, or tracking data', async ({page}) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', {name: 'Explore your playlists.'})).toBeVisible();

  const state = await page.evaluate(async () => {
    const databaseNames = typeof indexedDB.databases === 'function'
      ? (await indexedDB.databases()).map(database => database.name).filter(Boolean)
      : [];
    const recordCounts: Record<string, number> = {};

    if (databaseNames.includes('AnalytifyDB')) {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('AnalytifyDB');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const stores = Array.from(database.objectStoreNames);
          if (stores.length === 0) {
            database.close();
            resolve();
            return;
          }
          const transaction = database.transaction(stores, 'readonly');
          for (const storeName of stores) {
            const count = transaction.objectStore(storeName).count();
            count.onsuccess = () => { recordCounts[storeName] = count.result; };
          }
          transaction.oncomplete = () => { database.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    }

    return {
      cookie: document.cookie,
      localStorageKeys: Object.keys(localStorage),
      sessionStorageKeys: Object.keys(sessionStorage),
      recordCounts
    };
  });

  expect(state.cookie).toBe('');
  expect(state.localStorageKeys).toEqual([]);
  expect(state.sessionStorageKeys).toEqual([]);
  expect(Object.values(state.recordCounts).every(count => count === 0)).toBe(true);
});

test('current terms acceptance survives a new page load in a first-party cookie', async ({page}) => {
  const acceptedAt = '2026-09-21T08:00:00.000Z';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  await page.context().addCookies([{
    name: 'analytify_terms_acceptance',
    value: encodeURIComponent(`${CURRENT_TERMS_VERSION}|${acceptedAt}|${sessionId}`),
    url: 'http://127.0.0.1:4200',
    sameSite: 'Lax'
  }]);

  await page.goto('/login');
  await expect(page.getByRole('checkbox')).toBeChecked();
  await page.reload();
  await expect(page.getByRole('checkbox')).toBeChecked();
});

test('an acceptance saved by the previous IndexedDB layout is migrated on startup', async ({page}) => {
  await page.route('**/__terms_migration_seed__', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Storage migration seed</title>'
  }));
  await page.goto('/__terms_migration_seed__');
  await page.evaluate(async termsVersion => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AnalytifyDB', 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore('appData', {keyPath: 'key'});
        db.createObjectStore('featureData', {keyPath: 'key'});
        const history = db.createObjectStore('statsHistory', {keyPath: 'id', autoIncrement: true});
        history.createIndex('by_user_range', ['userId', 'range']);
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction('featureData', 'readwrite');
        transaction.objectStore('featureData').put({
          key: 'termsAcceptance',
          value: `${termsVersion}|2026-09-21T08:00:00.000Z|33333333-3333-4333-8333-333333333333`
        });
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, CURRENT_TERMS_VERSION);

  await page.goto('/login');
  await expect(page.getByRole('checkbox')).toBeChecked();
  await expect.poll(() => page.evaluate(() => document.cookie)).toContain('analytify_terms_acceptance=');
});

test('authenticated playlists route is responsive and WCAG 2.2 AA clean', async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.goto('/playlists');
  await expect(page.getByRole('heading', {name: /^Your playlists$/i}).first()).toBeVisible();
  await expect(page.getByText('Test Playlist')).toBeVisible();
  await expectNoBlockingAxeViolations(page);
});

test('enabled stats route is responsive and WCAG 2.2 AA clean', async ({page}) => {
  await mockSpotify(page);
  await seedAuthenticatedBrowser(page);
  await page.goto('/stats');
  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByRole('heading', {name: /^Your top listening$/i}).first()).toBeVisible();
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
