# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-current-load.spec.ts >> cold Spotify failure differs from empty rankings and offers recovery (reduce)
- Location: e2e/design-v2-stats-current-load.spec.ts:5:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('main').getByRole('alert')
Expected: visible
Timeout: 12000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('main').getByRole('alert') with timeout 12000ms
  - waiting for getByRole('main').getByRole('alert')

```

```yaml
- link "Skip to main content":
  - /url: "#v2-main-content"
- banner:
  - link "Analytify playlists":
    - /url: /new/playlists
    - text: Analytify
  - navigation "Main navigation":
    - link "Playlists":
      - /url: /new/playlists
    - link "Stats":
      - /url: /new/stats
    - link "History":
      - /url: /new/history
  - button "Open More tools": More
  - button "Open account and data settings"
- main "Your Top Listening content":
  - heading "Your top listening" [level=1]
  - paragraph: Your songs, artists and genres, ranked over time.
  - region "Statistics controls":
    - paragraph: Period
    - group "Ranking period":
      - button "4 weeks" [pressed]
      - button "6 months"
      - button "1 year"
    - paragraph: Category
    - group "Ranking category":
      - button "Songs" [pressed]
      - button "Artists"
      - button "Genres"
  - group "Search rankings":
    - text: Search songs or artists
    - searchbox "Search songs or artists"
    - button "Compare dates"
    - switch "Search past rankings"
  - region "Rankings":
    - heading "Top songs" [level=2]
    - status:
      - heading "No top songs found" [level=2]
      - paragraph: Try another search, date, or ranking period.
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
    - /url: /new/legal
```

# Test source

```ts
  1  | import {test, expect} from './fixtures';
  2  | import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3  | 
  4  | for (const motion of ['no-preference', 'reduce'] as const) {
  5  |   test(`cold Spotify failure differs from empty rankings and offers recovery (${motion})`, async ({page}) => {
  6  |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  7  |     await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page); await seedAuthenticatedBrowser(page);
  8  |     let failed = true;
  9  |     await page.route('https://api.spotify.com/v1/me/top/artists?*', route => failed
  10 |       ? route.fulfill({status: 503, headers: {'Retry-After': '0'}, json: {error: {status: 503, message: 'Isolated current Stats failure'}}})
  11 |       : route.fulfill({json: {items: [{id: 'recovered-artist', name: 'Recovered artist', genres: ['pop'], images: []}], total: 1}}));
  12 |     await page.goto('/new/stats');
  13 |     const main = page.getByRole('main');
> 14 |     await expect(main.getByRole('alert')).toBeVisible({timeout: 12_000});
     |                                           ^ Error: expect(locator).toBeVisible() failed
  15 |     await expect(main.getByRole('heading', {name: 'No top songs found', exact: true})).toHaveCount(0);
  16 |     await expect(main.locator('v2-stats-ranking-row')).toHaveCount(0);
  17 |     failed = false;
  18 |     await main.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  19 |     await expect(main.getByText('Test Song', {exact: true})).toBeVisible();
  20 |     await expect(main.getByRole('alert')).toHaveCount(0); await expectNoBlockingAxeViolations(page);
  21 |   });
  22 | }
  23 | 
  24 | test('successful empty Spotify responses produce an empty state without a failure alert', async ({page}) => {
  25 |   await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z')); await mockSpotify(page); await seedAuthenticatedBrowser(page);
  26 |   await page.route('https://api.spotify.com/v1/me/top/**', route => route.fulfill({json: {items: [], total: 0}}));
  27 |   await page.goto('/new/stats'); const main = page.getByRole('main');
  28 |   await expect(main.getByRole('heading', {name: 'No top songs found', exact: true})).toBeVisible();
  29 |   await expect(main.getByRole('alert')).toHaveCount(0); await expectNoBlockingAxeViolations(page);
  30 | });
  31 | 
```