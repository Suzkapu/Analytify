import AxeBuilder from '@axe-core/playwright';
import {expect, Page} from '@playwright/test';
import {CURRENT_TERMS_VERSION} from '../../src/app/core/legal/terms-acceptance.service';

export async function expectNoBlockingAxeViolations(page: Page): Promise<void> {
  const result = await new AxeBuilder({page})
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  expect(result.violations.filter(item => ['serious', 'critical'].includes(item.impact || '')),
    JSON.stringify(result.violations, null, 2)).toEqual([]);
}

export async function seedAuthenticatedBrowser(page: Page, options: {cloudIdentity?: boolean} = {}): Promise<void> {
  await page.goto('/login');
  await page.evaluate(async settings => {
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
        const transaction = db.transaction(['appData', 'featureData'], 'readwrite');
        const store = transaction.objectStore('appData');
        store.put({key: 'spotifyAccessToken', value: 'e2e-access-token'});
        store.put({key: 'spotifyTokenExpiresAt', value: String(Date.now() + 3_600_000)});
        store.put({key: 'spotifyUserId', value: 'e2e-user'});
        if (settings.cloudIdentity) {
          store.put({key: 'supabaseUserId', value: '11111111-1111-4111-8111-111111111111'});
        }
        store.put({key: 'spotifyConnectionMode', value: 'hosted'});
        store.put({key: 'termsAcceptance', value: `${settings.termsVersion}|2026-09-19T00:00:00.000Z|11111111-1111-4111-8111-111111111111`});
        const playlists = JSON.stringify([
          {id: 'fav', name: 'Favourite Tracks', owner: {id: 'e2e-user'}, images: [], tracks: {total: 0}, description: ''},
          {id: 'playlist-1', name: 'Test Playlist', owner: {id: 'e2e-user'}, images: [], tracks: {total: 1}, description: ''}
        ]);
        const featureStore = transaction.objectStore('featureData');
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(today.getDate() - 1);
        const recentTracks = JSON.stringify([
          {played_at: today.toISOString(), track: {id: 'recent-1', name: 'Played today', artists: [{name: 'Test Artist'}], album: {images: []}, external_urls: {spotify: 'https://open.spotify.com/track/recent-1'}}},
          {played_at: yesterday.toISOString(), track: {id: 'recent-2', name: 'Played yesterday', artists: [{name: 'Test Artist'}], album: {images: []}, external_urls: {spotify: 'https://open.spotify.com/track/recent-2'}}}
        ]);
        for (const userId of ['e2e-user', 'e2e-user_dev']) {
          featureStore.put({key: `${userId}_playlists`, value: playlists});
          featureStore.put({key: `${userId}_recently_played`, value: recentTracks});
          store.put({key: `${userId}_playlists_lastUpdated`, value: String(Date.now())});
          store.put({key: `${userId}_recently_played_lastChecked`, value: String(Date.now())});
          store.put({key: `${userId}_spotify_profile_id`, value: 'e2e-user'});
          store.put({key: `${userId}_spotify_profile_id_verified`, value: 'true'});
          store.put({key: `${userId}_playlists_showSaved`, value: 'true'});
        }
        transaction.oncomplete = () => { db.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
  }, {termsVersion: CURRENT_TERMS_VERSION, cloudIdentity: options.cloudIdentity === true});
}

export async function mockSpotify(page: Page): Promise<void> {
  await page.route('https://api.spotify.com/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/v1/me') return route.fulfill({json: {id: 'e2e-user', display_name: 'Browser test user', images: []}});
    if (path.includes('/top/artists')) return route.fulfill({json: {items: [{id: 'artist-1', name: 'Test Artist', images: [], genres: ['pop']}], total: 1}});
    if (path.includes('/top/tracks')) return route.fulfill({json: {items: [{id: 'track-1', name: 'Test Song', artists: [{id: 'artist-1', name: 'Test Artist'}], album: {id: 'album-1', name: 'Test Album', images: []}, duration_ms: 180000}], total: 1}});
    if (path.includes('/me/player/recently-played')) {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const track = (id: string, name: string) => ({
        id, name, artists: [{id: 'artist-1', name: 'Test Artist'}],
        album: {id: `album-${id}`, name: 'Test Album', images: []},
        external_urls: {spotify: `https://open.spotify.com/track/${id}`}
      });
      return route.fulfill({json: {items: [
        {played_at: today.toISOString(), track: track('recent-1', 'Played today')},
        {played_at: yesterday.toISOString(), track: track('recent-2', 'Played yesterday')}
      ]}});
    }
    if (path.includes('/me/playlists')) return route.fulfill({json: {items: [{id: 'playlist-1', name: 'Test Playlist', owner: {id: 'e2e-user'}, images: [], tracks: {total: 1}, description: ''}], total: 1, next: null}});
    if (path.includes('/me/tracks')) return route.fulfill({json: {items: [], total: 0, next: null}});
    return route.fulfill({json: {items: [], total: 0, next: null}});
  });
}
