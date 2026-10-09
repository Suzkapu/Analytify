# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-flames.spec.ts >> static canonical row captures >> canonical flame colors and placement at 1440px
- Location: e2e/design-v2-stats-flames.spec.ts:343:9

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 1120
Received: 1360
```

# Page snapshot

```yaml
- generic [ref=f2e5]:
  - link "Skip to main content" [ref=f2e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f2e7]:
    - generic [ref=f2e8]:
      - link "Analytify playlists" [ref=f2e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f2e10]: Analytify
      - navigation "Main navigation" [ref=f2e11]:
        - link "Playlists" [ref=f2e12] [cursor=pointer]:
          - /url: /new/playlists
          - generic [aria-hidden] [ref=f2e13]: 
        - link "Stats" [ref=f2e15] [cursor=pointer]:
          - /url: /new/stats
          - generic [aria-hidden] [ref=f2e16]: 
        - link "History" [ref=f2e18] [cursor=pointer]:
          - /url: /new/history
          - generic [aria-hidden] [ref=f2e19]: 
      - generic [ref=f2e21]:
        - button "Open More tools" [ref=f2e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f2e23]: 
          - generic [ref=f2e24]: More
        - button "Open account and data settings" [ref=f2e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f2e26]: 
  - main "Your Top Listening content" [ref=f2e27]:
    - generic [ref=f2e30]:
      - generic [ref=f2e32]:
        - heading "Your top listening" [level=1] [ref=f2e34]
        - paragraph [ref=f2e35]: Your songs, artists and genres, ranked over time.
      - generic [ref=f2e36]:
        - region "Statistics controls" [ref=f2e37]:
          - generic [ref=f2e38]:
            - paragraph [ref=f2e39]: Period
            - group "Ranking period" [ref=f2e40]:
              - button "4 weeks" [pressed] [ref=f2e41] [cursor=pointer]
              - button "6 months" [ref=f2e43] [cursor=pointer]
              - button "1 year" [ref=f2e45] [cursor=pointer]
          - generic [ref=f2e47]:
            - paragraph [ref=f2e48]: Category
            - group "Ranking category" [ref=f2e49]:
              - button "Songs" [pressed] [ref=f2e50] [cursor=pointer]
              - button "Artists" [ref=f2e53] [cursor=pointer]
              - button "Genres" [ref=f2e56] [cursor=pointer]
        - group "Search rankings" [ref=f2e60]:
          - generic [ref=f2e62]:
            - generic [ref=f2e63]: Search songs or artists
            - generic [ref=f2e64]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f2e65]
          - button "Compare dates" [ref=f2e66] [cursor=pointer]
          - switch "Search past rankings" [ref=f2e69] [cursor=pointer]
        - region "Rankings" [ref=f2e73]:
          - heading "Top songs" [level=2] [ref=f2e74]
          - generic [ref=f2e75]:
            - generic [ref=f2e76]:
              - group "Rank 1. New" [ref=f2e77]:
                - img "Top 10 debut" [ref=f2e79]
                - generic [aria-hidden] [ref=f2e81]: "1"
                - generic [aria-hidden] [ref=f2e82]: ✦
              - button "Open Midnight Drive on Spotify" [ref=f2e83] [cursor=pointer]:
                - img "Midnight Drive cover" [ref=f2e84]
              - generic [ref=f2e85]:
                - strong [ref=f2e86]: Midnight Drive
                - generic [ref=f2e87]: Neon Coast
              - button "View position history for Midnight Drive" [ref=f2e88] [cursor=pointer]: History
            - generic [ref=f2e89]:
              - group "Rank 2. ↑ 15 places" [ref=f2e90]:
                - img "Hot mover" [ref=f2e92]
                - generic [aria-hidden] [ref=f2e94]: "2"
                - generic [aria-hidden] [ref=f2e95]: ↑ 15
              - button "Open Paper Planes on Spotify" [ref=f2e96] [cursor=pointer]:
                - img "Paper Planes cover" [ref=f2e97]
              - generic [ref=f2e98]:
                - strong [ref=f2e99]: Paper Planes
                - generic [ref=f2e100]: Luma
              - button "View position history for Paper Planes" [ref=f2e101] [cursor=pointer]: History
            - generic [ref=f2e102]:
              - group "Rank 3. Unchanged" [ref=f2e103]:
                - generic [aria-hidden] [ref=f2e104]: "3"
                - generic [aria-hidden] [ref=f2e105]: —
              - button "Open Known song 2 on Spotify" [ref=f2e106] [cursor=pointer]:
                - img "Known song 2 cover" [ref=f2e107]
              - generic [ref=f2e108]:
                - strong [ref=f2e109]: Known song 2
                - generic [ref=f2e110]: Example Artist
              - button "View position history for Known song 2" [ref=f2e111] [cursor=pointer]: History
          - button "Create playlist from these songs" [ref=f2e113] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e114]: 
            - text: Create playlist from these songs
  - text:   
  - contentinfo [ref=f2e115]:
    - generic [ref=f2e116]: Powered by Spotify
    - generic [ref=f2e117]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e118] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1   | import type {Locator, TestInfo} from '@playwright/test';
  2   | import {writeFile} from 'node:fs/promises';
  3   | import {join} from 'node:path';
  4   | import {test, expect} from './fixtures';
  5   | import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
  6   | 
  7   | const canonicalArtworkUrl='http://127.0.0.1:4200/new/__e2e-canonical-stats-artwork.png';
  8   | async function mockCanonicalArtwork(page: import('@playwright/test').Page): Promise<void> {
  9   |   await page.route(canonicalArtworkUrl,route=>route.fulfill({path:join(__dirname,'assets/canonical-stats-artwork.png'),contentType:'image/png'}));
  10  | }
  11  | 
  12  | const tracks = Array.from({length: 30}, (_, rank) => ({
  13  |   id: `known-${rank}`, name: `Known song ${rank}`, artists: [{id: 'artist', name: 'Example Artist'}],
  14  |   album: {images: []}, external_urls: {spotify: `https://open.spotify.com/track/known-${rank}`}
  15  | }));
  16  | const artists = Array.from({length: 30}, (_, rank) => ({id: `artist-${rank}`, name: `Artist ${rank}`, images: [],
  17  |   external_urls: {spotify: `https://open.spotify.com/artist/artist-${rank}`}}));
  18  | const currentTracks = [{...tracks[0], id: 'debut', name: 'Debut song'}, tracks[16], tracks[2]];
  19  | const currentArtists = [{id: 'debut-artist', name: 'Debut artist', images: []}, artists[16], artists[2]];
  20  | 
  21  | async function clearCurrentFixtureStats(page: import('@playwright/test').Page): Promise<void> {
  22  |   // Remove only this test account's disposable current cache; keep comparison
  23  |   // snapshots and authentication so the real refresh path loads the new DTOs.
  24  |   await page.evaluate(async () => {
  25  |     await new Promise<void>((resolve,reject) => {
  26  |       const request=indexedDB.open('AnalytifyDB',4);
  27  |       request.onerror=()=>reject(request.error);
  28  |       request.onsuccess=()=>{
  29  |         const db=request.result;
  30  |         const transaction=db.transaction(['appData','featureData'],'readwrite');
  31  |         for(const user of ['e2e-user','e2e-user_dev']) for(const part of ['tracks','artists','genres','lastUpdated']) {
  32  |           const key=`${user}_stats_short_term_${part}`;
  33  |           transaction.objectStore('appData').delete(key);
  34  |           transaction.objectStore('featureData').delete(key);
  35  |         }
  36  |         transaction.oncomplete=()=>{db.close();resolve();};
  37  |         transaction.onerror=()=>reject(transaction.error);
  38  |       };
  39  |     });
  40  |   });
  41  | }
  42  | 
  43  | async function expectIntrinsicHistory(history: Locator): Promise<void> {
  44  |   const geometry=await history.evaluate(element=>{
  45  |     const text=document.createRange();text.selectNodeContents(element);
  46  |     const bounds=element.getBoundingClientRect();
  47  |     return {width:bounds.width,height:bounds.height,textWidth:text.getBoundingClientRect().width};
  48  |   });
  49  |   // Canonical text plus 12px on each side, with borders inset into that space.
  50  |   expect(geometry.width).toBeCloseTo(geometry.textWidth+24,1);
  51  |   expect(geometry.height).toBe(44);
  52  | }
  53  | 
  54  | async function recordCanonicalRow(row: Locator, testInfo: TestInfo, name: string): Promise<void> {
  55  |   await row.page().evaluate(() => document.fonts.ready);
  56  |   await expect(row).toHaveCSS('background-color', 'rgb(18, 24, 20)');
  57  |   await expect(row).toHaveCSS('padding-left', '16px');
  58  |   await expect(row.locator('strong')).toHaveCSS('font-family', /^"?Outfit Variable"?, sans-serif$/);
  59  |   expect(await row.page().evaluate(() => [...document.fonts].some(font =>
  60  |     font.family.replace(/["']/g, '') === 'Outfit Variable' && font.status === 'loaded'))).toBe(true);
  61  |   const history=row.getByRole('button',{name:/^View position history for/});
  62  |   await expectIntrinsicHistory(history);
  63  |   await expect(history).toHaveCSS('height','44px');
  64  |   await expect(history).toHaveCSS('font-size','14px');
  65  |   await expect(history).toHaveCSS('font-weight','600');
  66  |   await expect(history).toHaveCSS('line-height','20px');
  67  |   await expect(history).toHaveCSS('background-color','rgb(13, 19, 15)');
  68  |   await expect(history).toHaveCSS('border-top-color','rgb(52, 66, 58)');
  69  |   // Require the designed visible geometry before recording parity evidence.
  70  |   await expect.poll(() => row.evaluate(element => element.getBoundingClientRect().height)).toBe(80);
  71  |   const rendering = await row.evaluate(element => {
  72  |     const bounds = element.getBoundingClientRect();
  73  |     const ancestors = [];
  74  |     for (let current: Element | null = element; current; current = current.parentElement) {
  75  |       const style = getComputedStyle(current);
  76  |       ancestors.push({tag: current.tagName, classes: current.className, opacity: style.opacity,
  77  |         filter: style.filter, background: style.backgroundColor, shadow: style.boxShadow,
  78  |         zIndex: style.zIndex});
  79  |     }
  80  |     const image = element.querySelector('img')!;
  81  |     return {bounds: bounds.toJSON(), ancestors, artwork: {
  82  |       src: image.currentSrc, complete: image.complete, naturalWidth: image.naturalWidth,
  83  |       background: getComputedStyle(image.parentElement!).backgroundColor
  84  |     }};
  85  |   });
  86  |   expect(rendering.artwork.complete).toBe(true);
  87  |   expect(rendering.artwork.naturalWidth).toBeGreaterThan(0);
  88  |   expect(rendering.bounds.height).toBe(80);
> 89  |   expect(rendering.bounds.width).toBe(row.page().viewportSize()!.width === 390 ? 358 : 1120);
      |                                  ^ Error: expect(received).toBe(expected) // Object.is equality
  90  |   const evidencePath = testInfo.outputPath(`${name}-rendering.json`);
  91  |   await writeFile(evidencePath, JSON.stringify(rendering, null, 2));
  92  |   await testInfo.attach(`${name}-rendering.json`, {path: evidencePath, contentType: 'application/json'});
  93  | }
  94  | 
  95  | test.beforeEach(async ({page}) => {
  96  |   await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  97  |   await mockSpotify(page);
  98  |   await seedAuthenticatedBrowser(page);
  99  |   await page.evaluate(async ({tracks, artists}) => {
  100 |     await new Promise<void>((resolve, reject) => {
  101 |       const request = indexedDB.open('AnalytifyDB', 4);
  102 |       request.onerror = () => reject(request.error);
  103 |       request.onsuccess = () => {
  104 |         const db = request.result;
  105 |         const transaction = db.transaction('statsHistory', 'readwrite');
  106 |         for (const userId of ['e2e-user', 'e2e-user_dev']) {
  107 |           transaction.objectStore('statsHistory').put({userId, range: 'short_term',
  108 |             timestamp: new Date('2026-10-05T12:00:00Z').getTime(), snapshotDate: '2026-10-05',
  109 |             topTracks: tracks, topArtists: artists, topGenres: [], isLoaded: true});
  110 |         }
  111 |         transaction.oncomplete = () => {db.close(); resolve();};
  112 |         transaction.onerror = () => reject(transaction.error);
  113 |       };
  114 |     });
  115 |   }, {tracks, artists});
  116 |   await page.route('https://api.spotify.com/v1/me/top/tracks?*', route => route.fulfill({json: {items: currentTracks, total: 3}}));
  117 |   await page.route('https://api.spotify.com/v1/me/top/artists?*', route => route.fulfill({json: {items: currentArtists, total: 3}}));
  118 |   await page.goto('/new/stats');
  119 |   await expect(page.getByRole('button',{name:'Compare dates',exact:true})).toBeVisible();
  120 |   await expect(page.getByRole('img', {name: 'Top 10 debut', exact: true})).toHaveCount(1);
  121 |   await expect(page.getByRole('img', {name: 'Hot mover', exact: true})).toHaveCount(1);
  122 | });
  123 | 
  124 | test('canonical flame timeline loops without moving controls and stops on preference changes', async ({page}, testInfo) => {
  125 |   await page.emulateMedia({reducedMotion: 'no-preference'});
  126 |   const flames = page.locator('.v2-ranking-row v2-ranking-flame svg');
  127 |   await expect(flames).toHaveCount(2);
  128 |   await expect.poll(() => flames.first().evaluate(element => element.getAnimations().length)).toBe(3);
  129 |   // Observe the native clock across a full loop before seeking deterministic
  130 |   // keyframes. A paused style sample alone would not prove the loop runs.
  131 |   const start = await flames.first().evaluate(element => Number(element.getAnimations()[0].currentTime));
  132 |   await expect.poll(() => flames.first().evaluate(element => Number(element.getAnimations()[0].currentTime)), {timeout: 5000}).toBeGreaterThan(start + 2000);
  133 |   const evidence = [];
  134 |   for (const width of [390, 1440]) {
  135 |     await page.setViewportSize({width, height: 480});
  136 |     const rows = page.locator('.v2-ranking-row');
  137 |     const stable = await rows.evaluateAll(elements => elements.slice(0, 2).map(element => {
  138 |       const rank = element.querySelector('.rank-number')!.getBoundingClientRect();
  139 |       const history = element.querySelector('.v2-ranking-history')!.getBoundingClientRect();
  140 |       return {rank: {x: rank.x + scrollX, y: rank.y + scrollY}, history: {x: history.x + scrollX, y: history.y + scrollY}};
  141 |     }));
  142 |     for (const [time, opacity, rotate, scaleY] of [[0, 1, 0, 1], [100, .979334, .004521, 1.011625], [400, .84, .035, 1.09], [800, .96, -.026, .96], [1200, .88, .017, 1.04], [1600, 1, 0, 1], [2000, 1, 0, 1], [2400, .84, .035, 1.09]]) {
  143 |       const samples = await flames.evaluateAll((elements, time) => elements.map(element => {
  144 |         const animations = element.getAnimations();
  145 |         animations.forEach(animation => {animation.pause(); animation.currentTime = time;});
  146 |         const style = getComputedStyle(element);
  147 |         const matrix = new DOMMatrixReadOnly(style.transform);
  148 |         const bounds = element.getBoundingClientRect();
  149 |         return {label: element.getAttribute('aria-label'), opacity: Number(style.opacity), rotate: Math.atan2(matrix.b, matrix.a),
  150 |           scaleY: Number(style.scale.split(' ')[1] || style.scale), width: bounds.width, height: bounds.height,
  151 |           durations: animations.map(animation => animation.effect!.getTiming().duration), iterations: animations.map(animation => animation.effect!.getTiming().iterations === Infinity)};
  152 |       }), time);
  153 |       for (const sample of samples) {
  154 |         expect(sample.opacity).toBeCloseTo(opacity, 4);
  155 |         expect(sample.rotate).toBeCloseTo(rotate, 4);
  156 |         expect(sample.scaleY).toBeCloseTo(scaleY, 4);
  157 |         expect(sample.durations).toEqual([2000, 2000, 2000]);
  158 |         expect(sample.iterations).toEqual([true, true, true]);
  159 |         expect(sample.width).toBeGreaterThanOrEqual(48);
  160 |         expect(sample.width).toBeLessThan(51);
  161 |         expect(sample.height).toBeGreaterThan(46);
  162 |         expect(sample.height).toBeLessThan(55);
  163 |       }
  164 |       const after = await rows.evaluateAll(elements => elements.slice(0, 2).map(element => {
  165 |         const rank = element.querySelector('.rank-number')!.getBoundingClientRect();
  166 |         const history = element.querySelector('.v2-ranking-history')!.getBoundingClientRect();
  167 |         return {rank: {x: rank.x + scrollX, y: rank.y + scrollY}, history: {x: history.x + scrollX, y: history.y + scrollY}};
  168 |       }));
  169 |       for (let index = 0; index < stable.length; index++) for (const control of ['rank', 'history'] as const) for (const coordinate of ['x', 'y'] as const) {
  170 |         // Firefox serializes fractional viewport+scroll sums with ~3e-5px
  171 |         // rounding differences. This tolerance is below 0.00005px.
  172 |         expect(after[index][control][coordinate]).toBeCloseTo(stable[index][control][coordinate], 4);
  173 |       }
  174 |       evidence.push({width, time, samples});
  175 |       if (time === 400) for (const [index, kind] of ['debut', 'hot'].entries()) {
  176 |         const row = rows.nth(index);
  177 |         await row.evaluate(async element => {
  178 |           element.scrollIntoView({block: 'center'});
  179 |           await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  180 |         });
  181 |         // Native capture must include the painted controls, rather than a row
  182 |         // still underneath mobile navigation after screenshot auto-scrolling.
  183 |         const action = row.getByRole('button', {name: /^View position history for/});
  184 |         await expect.poll(() => action.evaluate(element => {
  185 |           const bounds = element.getBoundingClientRect();
  186 |           return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  187 |         })).toBe(true);
  188 |         await row.screenshot({path: testInfo.outputPath(`flame-motion-${kind}-${width}-400ms.png`)});
  189 |       }
```