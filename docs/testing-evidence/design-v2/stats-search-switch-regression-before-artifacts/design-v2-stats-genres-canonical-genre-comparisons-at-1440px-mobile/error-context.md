# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-genres.spec.ts >> canonical genre comparisons at 1440px
- Location: e2e/design-v2-stats-genres.spec.ts:116:7

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('v2-genre-rankings .chart')
  5468 pixels (ratio 0.03 of all image pixels) are different.

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
  - 5468 pixels (ratio 0.03 of all image pixels) are different.
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
  - 5468 pixels (ratio 0.03 of all image pixels) are different.

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
        - paragraph [ref=f1e33]: Personal listening
        - heading "Your top listening" [level=1] [ref=f1e34]
        - paragraph [ref=f1e35]: See top songs, artists, and genres, and how their rankings change.
      - group "Ranking category" [ref=f1e38]:
        - button "Songs" [ref=f1e39] [cursor=pointer]
        - button "Artists" [ref=f1e40] [cursor=pointer]
        - button "Genres" [active] [pressed] [ref=f1e41] [cursor=pointer]
      - group "Statistics controls" [ref=f1e44]:
        - group "Ranking period" [ref=f1e46]:
          - button "4 weeks" [pressed] [ref=f1e47] [cursor=pointer]
          - button "6 months" [ref=f1e48] [cursor=pointer]
          - button "1 year" [ref=f1e49] [cursor=pointer]
      - generic [ref=f1e50]:
        - group "Search rankings" [ref=f1e52]:
          - generic [ref=f1e54]:
            - generic [ref=f1e55]: Search genres
            - generic [ref=f1e56]:
              - generic [aria-hidden]: 
              - searchbox "Search genres" [ref=f1e57]
          - button "Compare dates" [ref=f1e58] [cursor=pointer]
          - switch "Search past rankings" [ref=f1e61] [cursor=pointer]
        - group "Genre shares" [ref=f1e66]:
          - generic [aria-hidden] [ref=f1e67]:
            - generic [ref=f1e68]: Genre
            - generic [ref=f1e69]:
              - generic [ref=f1e70]: 0%
              - generic [ref=f1e71]: 5%
              - generic [ref=f1e72]: 10%
              - generic [ref=f1e73]: 15%
              - generic [ref=f1e74]: 20%
              - generic [ref=f1e75]: 25%
            - generic [ref=f1e76]: Share
          - generic [ref=f1e77]:
            - generic [ref=f1e78]:
              - strong [ref=f1e79]: 1. Alternative Rock
              - generic [ref=f1e80]: ↑ 1 place · +6 pp
            - 'img "Alternative Rock: 24%, previously 18%" [ref=f1e81]'
            - generic [ref=f1e84]: 24%
            - button "View position history for Alternative Rock" [ref=f1e85] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e86]: 
              - text: History
          - generic [ref=f1e87]:
            - generic [ref=f1e88]:
              - strong [ref=f1e89]: 2. Dream Pop
              - generic [ref=f1e90]: ↓ 1 place · −6 pp
            - 'img "Dream Pop: 18%, previously 24%" [ref=f1e91]'
            - generic [ref=f1e94]: 18%
            - button "View position history for Dream Pop" [ref=f1e95] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e96]: 
              - text: History
          - generic [ref=f1e97]:
            - generic [ref=f1e98]:
              - strong [ref=f1e99]: 3. Trip Hop
              - generic [ref=f1e100]: New
            - 'img "Trip Hop: <1%" [ref=f1e101]'
            - generic [ref=f1e103]: <1%
            - button "View position history for Trip Hop" [ref=f1e104] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e105]: 
              - text: History
  - text:   
  - contentinfo [ref=f1e106]:
    - generic [ref=f1e107]: Powered by Spotify
    - generic [ref=f1e108]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e109] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
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
  92  |     await expect(searchPast).toBeFocused();
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
> 126 |     await expect(chart).toHaveScreenshot(`stats-genres-${width}.png`, {animations: 'disabled'});
      |                         ^ Error: expect(locator).toHaveScreenshot(expected) failed
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