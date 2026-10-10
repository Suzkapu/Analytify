# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-updates.spec.ts >> Updates popup resizing, blur and Cancel-last (no-preference, height 480)
- Location: e2e/design-v2-settings-updates.spec.ts:131:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('app-login-page')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('app-login-page') with timeout 5000ms
  - waiting for locator('app-login-page')

```

```yaml
- link "Skip to main content":
  - /url: "#v2-main-content"
- banner:
  - link "Analytify playlists":
    - /url: /new/playlists
    - text: Analytify
- main "Sign in content":
  - region "Explore your playlists.":
    - text: Your Spotify library
    - heading "Explore your playlists." [level=1]
    - paragraph: Browse, search, share, and organize your Spotify playlists.
    - list "Analytify features":
      - listitem:
        - strong: Your Spotify library
        - text: with fast playlist and song search
      - listitem:
        - strong: Useful playlist tools
        - text: for summaries, merging, and sharing
      - listitem:
        - strong: Stored on this device
        - text: unless a feature needs the cloud
    - article:
      - link "Analytify home":
        - /url: /new/
        - text: Analytify
      - text: Welcome to Analytify
      - heading "Connect your Spotify account" [level=2]
      - paragraph: Sign in to load your Spotify library and playlists.
      - paragraph: Spotify will be asked for your profile, saved songs, playlists, top songs and artists, and recently played songs. Analytify requests playlist write access only for playlist copies you choose to create. It never reads your password or payment details.
      - checkbox "I agree to the Terms and acknowledge the Privacy Notice."
      - text: I agree to the
      - link "Terms":
        - /url: /new/legal#terms
      - text: and acknowledge the
      - link "Privacy Notice":
        - /url: /new/legal#privacy
      - text: .
      - group: Terms version
      - button "Continue with Spotify" [disabled]
      - button "Advanced options"
      - paragraph: Analytify never asks for your Spotify Client Secret. Personal-app sessions stay local unless you explicitly enable cloud features.
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
    - /url: /new/legal
```

# Test source

```ts
  1  | import AxeBuilder from '@axe-core/playwright';
  2  | import {expect, Page} from '@playwright/test';
  3  | import {CURRENT_TERMS_VERSION} from '../../src/app/core/legal/terms-acceptance.service';
  4  | 
  5  | export async function expectNoBlockingAxeViolations(page: Page): Promise<void> {
  6  |   const result = await new AxeBuilder({page})
  7  |     .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  8  |   expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
  9  | }
  10 | 
  11 | export async function seedAuthenticatedBrowser(page: Page, options: {cloudIdentity?: boolean} = {}): Promise<void> {
  12 |   await page.goto('/new/login');
> 13 |   await expect(page.locator('app-login-page')).toBeVisible();
     |                                                ^ Error: expect(locator).toBeVisible() failed
  14 |   await page.evaluate(async settings => {
  15 |     await new Promise<void>((resolve, reject) => {
  16 |       const request = indexedDB.open('AnalytifyDB', 4);
  17 |       request.onupgradeneeded = () => {
  18 |         const db = request.result;
  19 |         if (!db.objectStoreNames.contains('appData')) db.createObjectStore('appData', {keyPath: 'key'});
  20 |         if (!db.objectStoreNames.contains('featureData')) db.createObjectStore('featureData', {keyPath: 'key'});
  21 |         if (!db.objectStoreNames.contains('statsHistory')) {
  22 |           const store = db.createObjectStore('statsHistory', {keyPath: 'id', autoIncrement: true});
  23 |           store.createIndex('by_user_range', ['userId', 'range']);
  24 |         }
  25 |       };
  26 |       request.onerror = () => reject(request.error);
  27 |       request.onsuccess = () => {
  28 |         const db = request.result;
  29 |         const transaction = db.transaction(['appData', 'featureData'], 'readwrite');
  30 |         const store = transaction.objectStore('appData');
  31 |         store.put({key: 'spotifyAccessToken', value: 'e2e-access-token'});
  32 |         store.put({key: 'spotifyTokenExpiresAt', value: String(Date.now() + 3_600_000)});
  33 |         store.put({key: 'spotifyUserId', value: 'e2e-user'});
  34 |         if (settings.cloudIdentity) {
  35 |           store.put({key: 'supabaseUserId', value: '11111111-1111-4111-8111-111111111111'});
  36 |         }
  37 |         store.put({key: 'spotifyConnectionMode', value: 'hosted'});
  38 |         store.put({key: 'termsAcceptance', value: `${settings.termsVersion}|2026-09-19T00:00:00.000Z|11111111-1111-4111-8111-111111111111`});
  39 |         const playlists = JSON.stringify([
  40 |           {id: 'fav', name: 'Favourite Tracks', owner: {id: 'e2e-user'}, images: [], tracks: {total: 0}, description: ''},
  41 |           {id: 'playlist-1', name: 'Test Playlist', owner: {id: 'e2e-user'}, images: [], tracks: {total: 1}, description: ''}
  42 |         ]);
  43 |         const featureStore = transaction.objectStore('featureData');
  44 |         const today = new Date();
  45 |         const yesterday = new Date(today);
  46 |         yesterday.setDate(today.getDate() - 1);
  47 |         const recentTracks = JSON.stringify([
  48 |           {played_at: today.toISOString(), track: {id: 'recent-1', name: 'Played today', artists: [{name: 'Test Artist'}], album: {images: []}, external_urls: {spotify: 'https://open.spotify.com/track/recent-1'}}},
  49 |           {played_at: yesterday.toISOString(), track: {id: 'recent-2', name: 'Played yesterday', artists: [{name: 'Test Artist'}], album: {images: []}, external_urls: {spotify: 'https://open.spotify.com/track/recent-2'}}}
  50 |         ]);
  51 |         for (const userId of ['e2e-user', 'e2e-user_dev']) {
  52 |           featureStore.put({key: `${userId}_playlists`, value: playlists});
  53 |           featureStore.put({key: `${userId}_recently_played`, value: recentTracks});
  54 |           store.put({key: `${userId}_playlists_lastUpdated`, value: String(Date.now())});
  55 |           store.put({key: `${userId}_recently_played_lastChecked`, value: String(Date.now())});
  56 |           store.put({key: `${userId}_spotify_profile_id`, value: 'e2e-user'});
  57 |           store.put({key: `${userId}_spotify_profile_id_verified`, value: 'true'});
  58 |           store.put({key: `${userId}_playlists_showSaved`, value: 'true'});
  59 |         }
  60 |         transaction.oncomplete = () => { db.close(); resolve(); };
  61 |         transaction.onerror = () => reject(transaction.error);
  62 |       };
  63 |     });
  64 |   }, {termsVersion: CURRENT_TERMS_VERSION, cloudIdentity: options.cloudIdentity === true});
  65 | }
  66 | 
  67 | export async function mockSpotify(page: Page): Promise<void> {
  68 |   await page.route('https://api.spotify.com/**', async route => {
  69 |     const path = new URL(route.request().url()).pathname;
  70 |     if (path === '/v1/me') return route.fulfill({json: {id: 'e2e-user', display_name: 'Browser test user', images: []}});
  71 |     if (path.includes('/top/artists')) return route.fulfill({json: {items: [{id: 'artist-1', name: 'Test Artist', images: [], genres: ['pop']}], total: 1}});
  72 |     if (path.includes('/top/tracks')) return route.fulfill({json: {items: [{id: 'track-1', name: 'Test Song', artists: [{id: 'artist-1', name: 'Test Artist'}], album: {id: 'album-1', name: 'Test Album', images: []}, duration_ms: 180000}], total: 1}});
  73 |     if (path.includes('/me/player/recently-played')) {
  74 |       const today = new Date();
  75 |       const yesterday = new Date(today);
  76 |       yesterday.setDate(today.getDate() - 1);
  77 |       const track = (id: string, name: string) => ({
  78 |         id, name, artists: [{id: 'artist-1', name: 'Test Artist'}],
  79 |         album: {id: `album-${id}`, name: 'Test Album', images: []},
  80 |         external_urls: {spotify: `https://open.spotify.com/track/${id}`}
  81 |       });
  82 |       return route.fulfill({json: {items: [
  83 |         {played_at: today.toISOString(), track: track('recent-1', 'Played today')},
  84 |         {played_at: yesterday.toISOString(), track: track('recent-2', 'Played yesterday')}
  85 |       ]}});
  86 |     }
  87 |     if (path.includes('/me/playlists')) return route.fulfill({json: {items: [{id: 'playlist-1', name: 'Test Playlist', owner: {id: 'e2e-user'}, images: [], tracks: {total: 1}, description: ''}], total: 1, next: null}});
  88 |     if (path.includes('/me/tracks')) return route.fulfill({json: {items: [], total: 0, next: null}});
  89 |     return route.fulfill({json: {items: [], total: 0, next: null}});
  90 |   });
  91 | }
  92 | 
```