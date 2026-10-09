# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-genres.spec.ts >> canonical genre comparisons at 1440px
- Location: e2e/design-v2-stats-genres.spec.ts:119:7

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('v2-genre-rankings .chart')
  Expected an image 1120px by 197px, received 1360px by 196px. 55391 pixels (ratio 0.21 of all image pixels) are different.

  Snapshot: stats-genres-1440.png

Call log:
  - Expect "toHaveScreenshot(stats-genres-1440.png)" locator('v2-genre-rankings .chart') with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('v2-genre-rankings .chart')
    - locator resolved to <div role="group" class="chart" aria-label="Genre shares" _ngcontent-ng-c2716495613="">…</div>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - Expected an image 1120px by 197px, received 1360px by 196px. 55391 pixels (ratio 0.21 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('v2-genre-rankings .chart')
    - locator resolved to <div role="group" class="chart" aria-label="Genre shares" _ngcontent-ng-c2716495613="">…</div>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - Expected an image 1120px by 197px, received 1360px by 196px. 55391 pixels (ratio 0.21 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - link "Analytify playlists" [ref=f1e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e10]: Analytify
      - navigation "Main navigation" [ref=f1e11]:
        - link "Playlists" [ref=f1e12] [cursor=pointer]:
          - /url: /new/playlists
          - generic [aria-hidden] [ref=f1e13]: 
        - link "Stats" [ref=f1e15] [cursor=pointer]:
          - /url: /new/stats
          - generic [aria-hidden] [ref=f1e16]: 
        - link "History" [ref=f1e18] [cursor=pointer]:
          - /url: /new/history
          - generic [aria-hidden] [ref=f1e19]: 
      - generic [ref=f1e21]:
        - button "Open More tools" [ref=f1e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e23]: 
          - generic [ref=f1e24]: More
        - button "Open account and data settings" [ref=f1e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e26]: 
  - main "Your Top Listening content" [ref=f1e27]:
    - generic [ref=f1e30]:
      - generic [ref=f1e32]:
        - heading "Your top listening" [level=1] [ref=f1e34]
        - paragraph [ref=f1e35]: Your songs, artists and genres, ranked over time.
      - generic [ref=f1e36]:
        - region "Statistics controls" [ref=f1e37]:
          - generic [ref=f1e38]:
            - paragraph [ref=f1e39]: Period
            - group "Ranking period" [ref=f1e40]:
              - button "4 weeks" [pressed] [ref=f1e41] [cursor=pointer]
              - button "6 months" [ref=f1e43] [cursor=pointer]
              - button "1 year" [ref=f1e45] [cursor=pointer]
          - generic [ref=f1e47]:
            - paragraph [ref=f1e48]: Category
            - group "Ranking category" [ref=f1e49]:
              - button "Songs" [ref=f1e50] [cursor=pointer]
              - button "Artists" [ref=f1e53] [cursor=pointer]
              - button "Genres" [active] [pressed] [ref=f1e56] [cursor=pointer]
        - group "Search rankings" [ref=f1e60]:
          - generic [ref=f1e62]:
            - generic [ref=f1e63]: Search genres
            - generic [ref=f1e64]:
              - generic [aria-hidden]: 
              - searchbox "Search genres" [ref=f1e65]
          - button "Compare dates" [ref=f1e66] [cursor=pointer]
          - switch "Search past rankings" [ref=f1e69] [cursor=pointer]
        - region "Rankings" [ref=f1e73]:
          - heading "Top genres" [level=2] [ref=f1e74]
          - group "Genre shares" [ref=f1e76]:
            - generic [aria-hidden] [ref=f1e77]:
              - generic [ref=f1e78]: Genre
              - generic [ref=f1e79]:
                - generic [ref=f1e80]: 0%
                - generic [ref=f1e81]: 5%
                - generic [ref=f1e82]: 10%
                - generic [ref=f1e83]: 15%
                - generic [ref=f1e84]: 20%
                - generic [ref=f1e85]: 25%
              - generic [ref=f1e86]: Share
            - generic [ref=f1e87]:
              - generic [ref=f1e88]:
                - strong [ref=f1e89]: 1. Alternative Rock
                - generic [ref=f1e90]: ↑ 1 place · +6 pp
              - 'img "Alternative Rock: 24%, previously 18%" [ref=f1e91]'
              - generic [ref=f1e94]: 24%
              - button "View position history for Alternative Rock" [ref=f1e95] [cursor=pointer]:
                - generic [aria-hidden] [ref=f1e96]: 
                - text: History
            - generic [ref=f1e97]:
              - generic [ref=f1e98]:
                - strong [ref=f1e99]: 2. Dream Pop
                - generic [ref=f1e100]: ↓ 1 place · −6 pp
              - 'img "Dream Pop: 18%, previously 24%" [ref=f1e101]'
              - generic [ref=f1e104]: 18%
              - button "View position history for Dream Pop" [ref=f1e105] [cursor=pointer]:
                - generic [aria-hidden] [ref=f1e106]: 
                - text: History
            - generic [ref=f1e107]:
              - generic [ref=f1e108]:
                - strong [ref=f1e109]: 3. Trip Hop
                - generic [ref=f1e110]: New
              - 'img "Trip Hop: <1%" [ref=f1e111]'
              - generic [ref=f1e113]: <1%
              - button "View position history for Trip Hop" [ref=f1e114] [cursor=pointer]:
                - generic [aria-hidden] [ref=f1e115]: 
                - text: History
  - text:   
  - contentinfo [ref=f1e116]:
    - generic [ref=f1e117]: Powered by Spotify
    - generic [ref=f1e118]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e119] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
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
  91  |     const compareDates = page.getByRole('button', {name: 'Compare dates', exact: true});
  92  |     await expect(compareDates).toBeFocused();
  93  |     await compareDates.press('Tab');
  94  |     const searchPast = page.getByRole('switch', {name: 'Search past rankings', exact: true});
  95  |     await expect(searchPast).toBeFocused();
  96  |     await searchPast.press('Tab');
  97  |     await expect(history).toBeFocused();
  98  |     await expect(history).toHaveCSS('border-top-width', '2px');
  99  |     await expect(history).toHaveCSS('border-top-color', 'rgb(159, 255, 200)');
  100 |     await history.press('Enter');
  101 |     await expect(page.getByRole('dialog')).toBeVisible();
  102 |     await expect(page.getByRole('dialog')).toContainText('Dream Pop');
  103 |     await page.setViewportSize({width: 320, height: 480});
  104 |     await expect(page.getByRole('dialog')).toBeVisible();
  105 |     await page.keyboard.press('Escape');
  106 |     await expect(history).toBeFocused();
  107 |     await search.fill('');
  108 |     await expect(chart.locator('.v2-genre-row')).toHaveCount(3);
  109 |     await search.fill('does not exist');
  110 |     await expect(page.getByText('No genre data found', {exact: true})).toBeVisible();
  111 |     await expect(chart).toHaveCount(0);
  112 |     await search.fill('');
  113 |     await expectNoBlockingAxeViolations(page);
  114 |     await writeFile(testInfo.outputPath('genre-responsive-geometry.json'), JSON.stringify(records, null, 2));
  115 |   });
  116 | }
  117 | 
  118 | for (const width of [390, 1440]) {
  119 |   test(`canonical genre comparisons at ${width}px`, async ({page}) => {
  120 |     await page.setViewportSize({width, height: 1080});
  121 |     const chart = page.locator('v2-genre-rankings .chart');
  122 |     await expect(chart).toHaveCSS('background-color', 'rgb(11, 16, 13)');
  123 |     await expect(chart.locator('.v2-genre-row').first()).toHaveCSS('height', width === 390 ? '54px' : '44px');
  124 |     await expect(chart.locator('strong').first()).toHaveCSS('font-weight', '500');
  125 |     await expect(chart.locator('strong').first()).toHaveCSS('font-family', /^"?Outfit Variable"?, sans-serif$/);
  126 |     expect(await page.evaluate(() => [...document.fonts].some(font =>
  127 |       font.family.replace(/["']/g, '') === 'Outfit Variable' && font.status === 'loaded'))).toBe(true);
  128 |     await expect(chart.locator('.lost')).toHaveCSS('background-color', 'rgb(162, 173, 166)');
> 129 |     await expect(chart).toHaveScreenshot(`stats-genres-${width}.png`, {animations: 'disabled'});
      |                         ^ Error: expect(locator).toHaveScreenshot(expected) failed
  130 |   });
  131 | }
  132 | 
  133 | for (const motion of ['no-preference', 'reduce'] as const) {
  134 |   test(`long genre names reflow without losing shares or History with motion ${motion}`, async ({page}, testInfo) => {
  135 |     await page.emulateMedia({reducedMotion: motion});
  136 |     const name = 'An exceptionally long genre name '.repeat(5) + 'UnbrokenGenre'.repeat(12);
  137 |     await page.evaluate(async name => {
  138 |       await new Promise<void>((resolve, reject) => {
  139 |         const request = indexedDB.open('AnalytifyDB', 4);
  140 |         request.onerror = () => reject(request.error);
  141 |         request.onsuccess = () => {
  142 |           const db = request.result, transaction = db.transaction('featureData', 'readwrite');
  143 |           for (const userId of ['e2e-user', 'e2e-user_dev']) {
  144 |             transaction.objectStore('featureData').put({key: `${userId}_stats_short_term_genres`,
  145 |               value: JSON.stringify([{name, count: 24, percentage: 24}])});
  146 |           }
  147 |           transaction.oncomplete = () => {db.close(); resolve();};
  148 |           transaction.onerror = () => reject(transaction.error);
  149 |         };
  150 |       });
  151 |     }, name);
  152 |     await page.reload();
  153 |     await page.getByRole('button', {name: 'Genres', exact: true}).click();
  154 |     const row = page.locator('v2-genre-rankings .v2-genre-row');
  155 |     await expect(row).toHaveCount(1);
  156 |     await expect(row.locator('strong')).toHaveText(`1. ${name}`);
  157 |     await page.evaluate(() => document.fonts.ready);
  158 |     expect(await page.evaluate(() => [...document.fonts].some(font =>
  159 |       font.family.replace(/["']/g, '') === 'Outfit Variable' && font.status === 'loaded'))).toBe(true);
  160 |     const records = [];
  161 |     for (const width of [320, 360, 390, 760, 761, 768, 1024, 1440, 1920]) {
  162 |       for (const height of [480, 1080]) {
  163 |         await page.setViewportSize({width, height});
  164 |         const geometry = await row.evaluate(element => {
  165 |           const name = element.querySelector<HTMLElement>('.name')!, bounds = name.getBoundingClientRect();
  166 |           const action = element.querySelector('.history')!.getBoundingClientRect();
  167 |           const bar = element.querySelector('.track')!.getBoundingClientRect();
  168 |           return {overflow: document.documentElement.scrollWidth - innerWidth, name: bounds.toJSON(), action: action.toJSON(),
  169 |             clippedX: name.scrollWidth - name.clientWidth, clippedY: name.scrollHeight - name.clientHeight,
  170 |             rowHeight: element.getBoundingClientRect().height, bar: bar.toJSON()};
  171 |         });
  172 |         records.push({width, height, ...geometry});
  173 |         await writeFile(testInfo.outputPath('genre-long-label-geometry.json'), JSON.stringify(records, null, 2));
  174 |         expect(geometry.overflow).toBeLessThanOrEqual(1);
  175 |         expect(geometry.clippedX).toBeLessThanOrEqual(1);
  176 |         expect(geometry.clippedY).toBeLessThanOrEqual(1);
  177 |         expect(geometry.name.right).toBeLessThanOrEqual(geometry.action.x);
  178 |         expect(geometry.rowHeight).toBeGreaterThanOrEqual(geometry.name.height);
  179 |         expect(geometry.action.height).toBe(44);
  180 |         expect(geometry.action.width).toBe(width <= 760 ? 88 : 96);
  181 |         expect(geometry.bar.height).toBe(8);
  182 |       }
  183 |     }
  184 |     const history = row.getByRole('button', {name: `View position history for ${name}`});
  185 |     await history.press('Space');
  186 |     await expect(page.getByRole('dialog')).toBeVisible();
  187 |     await expect(page.getByRole('dialog')).toContainText(name);
  188 |     await page.keyboard.press('Escape');
  189 |     await expect(history).toBeFocused();
  190 |     await writeFile(testInfo.outputPath('genre-long-label-geometry.json'), JSON.stringify(records, null, 2));
  191 |   });
  192 | }
  193 | 
```