# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-genres.spec.ts >> genre chart scale, keyboard History and responsive resizing with motion reduce
- Location: e2e/design-v2-stats-genres.spec.ts:49:7

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  getByRole('switch', { name: 'Search past rankings', exact: true })
Expected: focused
Received: inactive
Timeout:  5000ms

Call log:
  - Expect "toBeFocused" getByRole('switch', { name: 'Search past rankings', exact: true }) with timeout 5000ms
  - waiting for getByRole('switch', { name: 'Search past rankings', exact: true })
    14 × locator resolved to <button type="button" role="switch" aria-checked="false" _ngcontent-ng-c171844419="">…</button>
       - unexpected value "inactive"

```

```yaml
- switch "Search past rankings"
```

# Test source

```ts
  1   | import {writeFile} from 'node:fs/promises';
  2   | import {test, expect} from './fixtures';
  3   | import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
  4   | 
  5   | const current = [
  6   |   {name: 'Alternative Rock', count: 24, percentage: 24},
  7   |   {name: 'Dream Pop', count: 18, percentage: 18},
  8   |   {name: 'Trip Hop', count: 5, percentage: .5}
  9   | ];
  10  | const previous = [
  11  |   {name: 'Dream Pop', count: 24, percentage: 24},
  12  |   {name: 'Alternative Rock', count: 18, percentage: 18}
  13  | ];
  14  | 
  15  | test.beforeEach(async ({page}) => {
  16  |   await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  17  |   await mockSpotify(page);
  18  |   await seedAuthenticatedBrowser(page);
  19  |   await page.evaluate(async ({current, previous}) => {
  20  |     await new Promise<void>((resolve, reject) => {
  21  |       const request = indexedDB.open('AnalytifyDB', 4);
  22  |       request.onerror = () => reject(request.error);
  23  |       request.onsuccess = () => {
  24  |         const db = request.result;
  25  |         const transaction = db.transaction(['appData', 'featureData', 'statsHistory'], 'readwrite');
  26  |         for (const userId of ['e2e-user', 'e2e-user_dev']) {
  27  |           for (const [part, items] of Object.entries({tracks: [], artists: [], genres: current})) {
  28  |             transaction.objectStore('featureData').put({key: `${userId}_stats_short_term_${part}`, value: JSON.stringify(items)});
  29  |           }
  30  |           transaction.objectStore('appData').put({key: `${userId}_stats_short_term_lastUpdated`, value: String(Date.now())});
  31  |           for (const date of ['2026-10-04', '2026-10-05']) {
  32  |             transaction.objectStore('statsHistory').put({userId, range: 'short_term',
  33  |               timestamp: new Date(`${date}T12:00:00Z`).getTime(), snapshotDate: date,
  34  |               topTracks: [], topArtists: [], topGenres: previous, isLoaded: true});
  35  |           }
  36  |         }
  37  |         transaction.oncomplete = () => {db.close(); resolve();};
  38  |         transaction.onerror = () => reject(transaction.error);
  39  |       };
  40  |     });
  41  |   }, {current, previous});
  42  |   await page.goto('/new/stats');
  43  |   await page.getByRole('button', {name: 'Genres', exact: true}).click();
  44  |   await expect(page.locator('v2-genre-rankings .v2-genre-row')).toHaveCount(3);
  45  |   await page.evaluate(() => document.fonts.ready);
  46  | });
  47  | 
  48  | for (const motion of ['no-preference', 'reduce'] as const) {
  49  |   test(`genre chart scale, keyboard History and responsive resizing with motion ${motion}`, async ({page}, testInfo) => {
  50  |     await page.emulateMedia({reducedMotion: motion});
  51  |     const chart = page.locator('v2-genre-rankings');
  52  |     await expect(chart.locator('.ticks')).toHaveText('0%5%10%15%20%25%');
  53  |     await expect(chart.locator('.name small')).toHaveText(['↑ 1 place · +6 pp', '↓ 1 place · −6 pp', 'New']);
  54  |     const records = [];
  55  |     for (const width of [320, 360, 390, 760, 761, 768, 1024, 1440, 1920]) {
  56  |       for (const height of [480, 1080]) {
  57  |         await page.setViewportSize({width, height});
  58  |         const geometry = await chart.evaluate(element => {
  59  |           const row = element.querySelector('.v2-genre-row')!;
  60  |           const name = row.querySelector('.name')!.getBoundingClientRect();
  61  |           const bar = row.querySelector('.track')!.getBoundingClientRect();
  62  |           const action = row.querySelector('.history')!.getBoundingClientRect();
  63  |           const current = row.querySelector('.current')!.getBoundingClientRect();
  64  |           const previous = row.querySelector('.previous')!.getBoundingClientRect();
  65  |           return {overflow: document.documentElement.scrollWidth - innerWidth, row: row.getBoundingClientRect().toJSON(),
  66  |             name: name.toJSON(), bar: bar.toJSON(), action: action.toJSON(),
  67  |             currentRatio: current.width / bar.width, previousRatio: previous.width / bar.width};
  68  |         });
  69  |         expect(geometry.overflow).toBeLessThanOrEqual(1);
  70  |         expect(geometry.action.height).toBe(44);
  71  |         expect(geometry.action.width).toBe(width <= 760 ? 88 : 96);
  72  |         expect(geometry.bar.height).toBe(8);
  73  |         expect(geometry.currentRatio).toBeCloseTo(.96, 2);
  74  |         expect(geometry.previousRatio).toBeCloseTo(.72, 2);
  75  |         expect(geometry.name.right).toBeLessThanOrEqual(geometry.action.x);
  76  |         expect(geometry.action.x + geometry.action.width).toBeLessThanOrEqual(geometry.row.x + geometry.row.width + .1);
  77  |         if (width <= 760) expect(geometry.bar.y).toBeGreaterThanOrEqual(geometry.name.y + geometry.name.height);
  78  |         records.push({width, height, ...geometry});
  79  |       }
  80  |     }
  81  |     const search = page.getByRole('searchbox', {name: 'Search genres'});
  82  |     await search.fill('DREAM');
  83  |     await expect(chart.locator('.v2-genre-row')).toHaveCount(1);
  84  |     await expect(chart.locator('strong')).toHaveText('2. Dream Pop');
  85  |     await expect(chart.locator('.ticks')).toHaveText('0%5%10%15%20%25%');
  86  |     const filteredRatio = await chart.locator('.v2-genre-row').evaluate(row =>
  87  |       row.querySelector('.current')!.getBoundingClientRect().width / row.querySelector('.track')!.getBoundingClientRect().width);
  88  |     expect(filteredRatio).toBeCloseTo(.72, 2);
  89  |     const history = chart.getByRole('button', {name: 'View position history for Dream Pop'});
  90  |     await search.press('Tab');
  91  |     const searchPast = page.getByRole('switch', {name: 'Search past rankings', exact: true});
> 92  |     await expect(searchPast).toBeFocused();
      |                              ^ Error: expect(locator).toBeFocused() failed
  93  |     await searchPast.press('Tab');
  94  |     await expect(history).toBeFocused();
  95  |     await expect(history).toHaveCSS('border-top-width', '2px');
  96  |     await expect(history).toHaveCSS('border-top-color', 'rgb(159, 255, 200)');
  97  |     await history.press('Enter');
  98  |     await expect(page.getByRole('dialog')).toBeVisible();
  99  |     await expect(page.getByRole('dialog')).toContainText('Dream Pop');
  100 |     await page.setViewportSize({width: 320, height: 480});
  101 |     await expect(page.getByRole('dialog')).toBeVisible();
  102 |     await page.keyboard.press('Escape');
  103 |     await expect(history).toBeFocused();
  104 |     await search.fill('');
  105 |     await expect(chart.locator('.v2-genre-row')).toHaveCount(3);
  106 |     await search.fill('does not exist');
  107 |     await expect(page.getByText('No genre data found', {exact: true})).toBeVisible();
  108 |     await expect(chart).toHaveCount(0);
  109 |     await search.fill('');
  110 |     await expectNoBlockingAxeViolations(page);
  111 |     await writeFile(testInfo.outputPath('genre-responsive-geometry.json'), JSON.stringify(records, null, 2));
  112 |   });
  113 | }
  114 | 
  115 | for (const width of [390, 1440]) {
  116 |   test(`canonical genre comparisons at ${width}px`, async ({page}) => {
  117 |     await page.setViewportSize({width, height: 1080});
  118 |     const chart = page.locator('v2-genre-rankings .chart');
  119 |     await expect(chart).toHaveCSS('background-color', 'rgb(11, 16, 13)');
  120 |     await expect(chart.locator('.v2-genre-row').first()).toHaveCSS('height', width === 390 ? '54px' : '44px');
  121 |     await expect(chart.locator('strong').first()).toHaveCSS('font-weight', '500');
  122 |     await expect(chart.locator('strong').first()).toHaveCSS('font-family', /^"?Outfit Variable"?, sans-serif$/);
  123 |     expect(await page.evaluate(() => [...document.fonts].some(font =>
  124 |       font.family.replace(/["']/g, '') === 'Outfit Variable' && font.status === 'loaded'))).toBe(true);
  125 |     await expect(chart.locator('.lost')).toHaveCSS('background-color', 'rgb(162, 173, 166)');
  126 |     await expect(chart).toHaveScreenshot(`stats-genres-${width}.png`, {animations: 'disabled'});
  127 |   });
  128 | }
  129 | 
  130 | for (const motion of ['no-preference', 'reduce'] as const) {
  131 |   test(`long genre names reflow without losing shares or History with motion ${motion}`, async ({page}, testInfo) => {
  132 |     await page.emulateMedia({reducedMotion: motion});
  133 |     const name = 'An exceptionally long genre name '.repeat(5) + 'UnbrokenGenre'.repeat(12);
  134 |     await page.evaluate(async name => {
  135 |       await new Promise<void>((resolve, reject) => {
  136 |         const request = indexedDB.open('AnalytifyDB', 4);
  137 |         request.onerror = () => reject(request.error);
  138 |         request.onsuccess = () => {
  139 |           const db = request.result, transaction = db.transaction('featureData', 'readwrite');
  140 |           for (const userId of ['e2e-user', 'e2e-user_dev']) {
  141 |             transaction.objectStore('featureData').put({key: `${userId}_stats_short_term_genres`,
  142 |               value: JSON.stringify([{name, count: 24, percentage: 24}])});
  143 |           }
  144 |           transaction.oncomplete = () => {db.close(); resolve();};
  145 |           transaction.onerror = () => reject(transaction.error);
  146 |         };
  147 |       });
  148 |     }, name);
  149 |     await page.reload();
  150 |     await page.getByRole('button', {name: 'Genres', exact: true}).click();
  151 |     const row = page.locator('v2-genre-rankings .v2-genre-row');
  152 |     await expect(row).toHaveCount(1);
  153 |     await expect(row.locator('strong')).toHaveText(`1. ${name}`);
  154 |     await page.evaluate(() => document.fonts.ready);
  155 |     expect(await page.evaluate(() => [...document.fonts].some(font =>
  156 |       font.family.replace(/["']/g, '') === 'Outfit Variable' && font.status === 'loaded'))).toBe(true);
  157 |     const records = [];
  158 |     for (const width of [320, 360, 390, 760, 761, 768, 1024, 1440, 1920]) {
  159 |       for (const height of [480, 1080]) {
  160 |         await page.setViewportSize({width, height});
  161 |         const geometry = await row.evaluate(element => {
  162 |           const name = element.querySelector<HTMLElement>('.name')!, bounds = name.getBoundingClientRect();
  163 |           const action = element.querySelector('.history')!.getBoundingClientRect();
  164 |           const bar = element.querySelector('.track')!.getBoundingClientRect();
  165 |           return {overflow: document.documentElement.scrollWidth - innerWidth, name: bounds.toJSON(), action: action.toJSON(),
  166 |             clippedX: name.scrollWidth - name.clientWidth, clippedY: name.scrollHeight - name.clientHeight,
  167 |             rowHeight: element.getBoundingClientRect().height, bar: bar.toJSON()};
  168 |         });
  169 |         records.push({width, height, ...geometry});
  170 |         await writeFile(testInfo.outputPath('genre-long-label-geometry.json'), JSON.stringify(records, null, 2));
  171 |         expect(geometry.overflow).toBeLessThanOrEqual(1);
  172 |         expect(geometry.clippedX).toBeLessThanOrEqual(1);
  173 |         expect(geometry.clippedY).toBeLessThanOrEqual(1);
  174 |         expect(geometry.name.right).toBeLessThanOrEqual(geometry.action.x);
  175 |         expect(geometry.rowHeight).toBeGreaterThanOrEqual(geometry.name.height);
  176 |         expect(geometry.action.height).toBe(44);
  177 |         expect(geometry.action.width).toBe(width <= 760 ? 88 : 96);
  178 |         expect(geometry.bar.height).toBe(8);
  179 |       }
  180 |     }
  181 |     const history = row.getByRole('button', {name: `View position history for ${name}`});
  182 |     await history.press('Space');
  183 |     await expect(page.getByRole('dialog')).toBeVisible();
  184 |     await expect(page.getByRole('dialog')).toContainText(name);
  185 |     await page.keyboard.press('Escape');
  186 |     await expect(history).toBeFocused();
  187 |     await writeFile(testInfo.outputPath('genre-long-label-geometry.json'), JSON.stringify(records, null, 2));
  188 |   });
  189 | }
  190 | 
```