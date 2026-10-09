# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-flames.spec.ts >> canonical flame timeline loops without moving controls and stops on preference changes
- Location: e2e/design-v2-stats-flames.spec.ts:124:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 3
Received: 0

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
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
        - button "Songs" [pressed] [ref=f1e39] [cursor=pointer]
        - button "Artists" [ref=f1e40] [cursor=pointer]
        - button "Genres" [ref=f1e41] [cursor=pointer]
      - group "Statistics controls" [ref=f1e44]:
        - group "Ranking period" [ref=f1e46]:
          - button "4 weeks" [pressed] [ref=f1e47] [cursor=pointer]
          - button "6 months" [ref=f1e48] [cursor=pointer]
          - button "1 year" [ref=f1e49] [cursor=pointer]
      - generic [ref=f1e50]:
        - group "Search rankings" [ref=f1e52]:
          - generic [ref=f1e54]:
            - generic [ref=f1e55]: Search songs or artists
            - generic [ref=f1e56]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f1e57]
          - button "Compare dates" [ref=f1e58] [cursor=pointer]
          - button "Search past" [ref=f1e60] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e61]: 
            - text: Search past
        - generic [ref=f1e62]:
          - generic [ref=f1e63]:
            - group "Rank 1. New" [ref=f1e64]:
              - img "Top 10 debut" [ref=f1e66]
              - generic [aria-hidden] [ref=f1e68]: "1"
              - generic [aria-hidden] [ref=f1e69]: ✦
            - button "Open Debut song on Spotify" [ref=f1e70] [cursor=pointer]:
              - img "Debut song cover" [ref=f1e71]
            - generic [ref=f1e72]:
              - strong [ref=f1e73]: Debut song
              - generic [ref=f1e74]: Example Artist
            - button "View position history for Debut song" [ref=f1e75] [cursor=pointer]: History
          - generic [ref=f1e76]:
            - group "Rank 2. ↑ 15 places" [ref=f1e77]:
              - img "Hot mover" [ref=f1e79]
              - generic [aria-hidden] [ref=f1e81]: "2"
              - generic [aria-hidden] [ref=f1e82]: ↑ 15
            - button "Open Known song 16 on Spotify" [ref=f1e83] [cursor=pointer]:
              - img "Known song 16 cover" [ref=f1e84]
            - generic [ref=f1e85]:
              - strong [ref=f1e86]: Known song 16
              - generic [ref=f1e87]: Example Artist
            - button "View position history for Known song 16" [ref=f1e88] [cursor=pointer]: History
          - generic [ref=f1e89]:
            - group "Rank 3. Unchanged" [ref=f1e90]:
              - generic [aria-hidden] [ref=f1e91]: "3"
              - generic [aria-hidden] [ref=f1e92]: —
            - button "Open Known song 2 on Spotify" [ref=f1e93] [cursor=pointer]:
              - img "Known song 2 cover" [ref=f1e94]
            - generic [ref=f1e95]:
              - strong [ref=f1e96]: Known song 2
              - generic [ref=f1e97]: Example Artist
            - button "View position history for Known song 2" [ref=f1e98] [cursor=pointer]: History
        - button " Create playlist" [ref=f1e99] [cursor=pointer]:
          - generic [ref=f1e100]: 
          - text: Create playlist
  - text:   
  - contentinfo [ref=f1e101]:
    - generic [ref=f1e102]: Powered by Spotify
    - generic [ref=f1e103]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e104] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
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
  89  |   expect(rendering.bounds.width).toBe(row.page().viewportSize()!.width === 390 ? 358 : 1120);
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
> 128 |   await expect.poll(() => flames.first().evaluate(element => element.getAnimations().length)).toBe(3);
      |                                                                                               ^ Error: expect(received).toBe(expected) // Object.is equality
  129 |   // Observe the native clock across a full loop before seeking deterministic
  130 |   // keyframes. A paused style sample alone would not prove the loop runs.
  131 |   const start = await flames.first().evaluate(element => Number(element.getAnimations()[0].currentTime));
  132 |   await expect.poll(() => flames.first().evaluate(element => Number(element.getAnimations()[0].currentTime) - 0), {timeout: 5000}).toBeGreaterThan(start + 2000);
  133 |   const evidence = [];
  134 |   for (const width of [390, 1440]) {
  135 |     await page.setViewportSize({width, height: 480});
  136 |     const rows = page.locator('.v2-ranking-row');
  137 |     const stable = await rows.evaluateAll(elements => elements.slice(0, 2).map(element => {
  138 |       const rank = element.querySelector('.rank-number')!.getBoundingClientRect();
  139 |       const history = element.querySelector('.v2-ranking-history')!.getBoundingClientRect();
  140 |       return {rank: {x: rank.x, y: rank.y}, history: {x: history.x, y: history.y}};
  141 |     }));
  142 |     for (const [time, opacity, rotate, scaleY] of [[0, 1, 0, 1], [400, .84, .035, 1.09], [800, .96, -.026, .96], [1200, .88, .017, 1.04], [1600, 1, 0, 1], [2000, 1, 0, 1], [2400, .84, .035, 1.09]]) {
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
  164 |       expect(await rows.evaluateAll(elements => elements.slice(0, 2).map(element => {
  165 |         const rank = element.querySelector('.rank-number')!.getBoundingClientRect();
  166 |         const history = element.querySelector('.v2-ranking-history')!.getBoundingClientRect();
  167 |         return {rank: {x: rank.x, y: rank.y}, history: {x: history.x, y: history.y}};
  168 |       }))).toEqual(stable);
  169 |       evidence.push({width, time, samples});
  170 |       if (time === 400) await rows.nth(0).screenshot({path: testInfo.outputPath(`flame-motion-${width}-400ms.png`)});
  171 |     }
  172 |   }
  173 |   await page.emulateMedia({reducedMotion: 'reduce'});
  174 |   for (const flame of await flames.all()) {
  175 |     await expect(flame).toHaveCSS('animation-name', 'none');
  176 |     await expect(flame).toHaveCSS('opacity', '1');
  177 |     expect(await flame.evaluate(element => element.getAnimations().length)).toBe(0);
  178 |     expect(await flame.evaluate(element => ({width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height}))).toEqual({width: 48, height: 48});
  179 |   }
  180 |   await page.emulateMedia({reducedMotion: 'no-preference'});
  181 |   await expect.poll(() => flames.first().evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(3);
  182 |   await expectNoBlockingAxeViolations(page);
  183 |   await writeFile(testInfo.outputPath('flame-canonical-motion.json'), JSON.stringify(evidence, null, 2));
  184 | });
  185 | 
  186 | for (const motion of ['no-preference', 'reduce'] as const) {
  187 |   test(`snapshot classifications survive filtering, categories and responsive resizing with motion ${motion}`, async ({page}, testInfo) => {
  188 |     await page.emulateMedia({reducedMotion: motion});
  189 |     const evidence = [];
  190 |     for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
  191 |       for (const height of [480, 1080]) {
  192 |         await page.setViewportSize({width, height});
  193 |         const row = page.locator('.v2-ranking-row').first();
  194 |         const geometry = await row.evaluate(element => {
  195 |           const art = element.querySelector('.v2-ranking-art')!.getBoundingClientRect();
  196 |           const flame = element.querySelector('svg')!.getBoundingClientRect();
  197 |           const rank = element.querySelector('.rank')!.getBoundingClientRect();
  198 |           const action = element.querySelector('.v2-ranking-history')!.getBoundingClientRect();
  199 |           return {overflow: document.documentElement.scrollWidth - innerWidth,
  200 |             icon: {width: flame.width, height: flame.height}, action: {width: action.width, height: action.height},
  201 |             rankWidth:rank.width, ordered: flame.right <= rank.right && rank.right <= art.left && art.right <= action.left,
  202 |             iconAnimation: getComputedStyle(element.querySelector('svg')!).animationName};
  203 |         });
  204 |         expect(geometry.overflow).toBeLessThanOrEqual(1);
  205 |         expect(geometry.icon).toEqual({width: 48, height: 48});
  206 |         expect(geometry.rankWidth).toBe(76);
  207 |         expect(geometry.action.width).toBeGreaterThanOrEqual(44);
  208 |         expect(geometry.action.height).toBeGreaterThanOrEqual(44);
  209 |         expect(geometry.ordered).toBe(true);
  210 |         expect(geometry.iconAnimation).toBe('none');
  211 |         evidence.push({width, height, ...geometry});
  212 |       }
  213 |     }
  214 |     const search = page.getByRole('searchbox', {name: 'Search songs or artists'});
  215 |     await search.fill('Known song 16');
  216 |     await expect(page.locator('.v2-ranking-row')).toHaveCount(1);
  217 |     await expect(page.locator('.v2-ranking-copy strong')).toHaveText('Known song 16');
  218 |     await expect(page.getByRole('group',{name:'Rank 2. ↑ 15 places',exact:true})).toHaveCount(1);
  219 |     await expect(page.getByRole('img', {name: 'Hot mover', exact: true})).toHaveCount(1);
  220 |     await expect(page.getByRole('img', {name: 'Top 10 debut', exact: true})).toHaveCount(0);
  221 |     const history = page.getByRole('button', {name: 'View position history for Known song 16'});
  222 |     await history.press('Enter');
  223 |     await expect(page.getByRole('dialog')).toBeVisible();
  224 |     await page.keyboard.press('Escape');
  225 |     await expect(history).toBeFocused();
  226 |     await search.fill('');
  227 |     await page.getByRole('button', {name: 'Artists', exact: true}).click();
  228 |     await expect(page.getByRole('img', {name: 'Top 10 debut', exact: true})).toHaveCount(1);
```