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

Expected: 0
Received: 1
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
          - switch "Search past rankings" [ref=f1e61] [cursor=pointer]
        - generic [ref=f1e65]:
          - generic [ref=f1e66]:
            - group "Rank 1. New" [ref=f1e67]:
              - img "Top 10 debut" [ref=f1e69]
              - generic [aria-hidden] [ref=f1e71]: "1"
              - generic [aria-hidden] [ref=f1e72]: ✦
            - button "Open Debut song on Spotify" [ref=f1e73] [cursor=pointer]:
              - img "Debut song cover" [ref=f1e74]
            - generic [ref=f1e75]:
              - strong [ref=f1e76]: Debut song
              - generic [ref=f1e77]: Example Artist
            - button "View position history for Debut song" [ref=f1e78] [cursor=pointer]: History
          - generic [ref=f1e79]:
            - group "Rank 2. ↑ 15 places" [ref=f1e80]:
              - img "Hot mover" [ref=f1e82]
              - generic [aria-hidden] [ref=f1e84]: "2"
              - generic [aria-hidden] [ref=f1e85]: ↑ 15
            - button "Open Known song 16 on Spotify" [ref=f1e86] [cursor=pointer]:
              - img "Known song 16 cover" [ref=f1e87]
            - generic [ref=f1e88]:
              - strong [ref=f1e89]: Known song 16
              - generic [ref=f1e90]: Example Artist
            - button "View position history for Known song 16" [ref=f1e91] [cursor=pointer]: History
          - generic [ref=f1e92]:
            - group "Rank 3. Unchanged" [ref=f1e93]:
              - generic [aria-hidden] [ref=f1e94]: "3"
              - generic [aria-hidden] [ref=f1e95]: —
            - button "Open Known song 2 on Spotify" [ref=f1e96] [cursor=pointer]:
              - img "Known song 2 cover" [ref=f1e97]
            - generic [ref=f1e98]:
              - strong [ref=f1e99]: Known song 2
              - generic [ref=f1e100]: Example Artist
            - button "View position history for Known song 2" [ref=f1e101] [cursor=pointer]: History
        - button " Create playlist" [ref=f1e102] [cursor=pointer]:
          - generic [ref=f1e103]: 
          - text: Create playlist
  - text:   
  - contentinfo [ref=f1e104]:
    - generic [ref=f1e105]: Powered by Spotify
    - generic [ref=f1e106]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e107] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
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
  190 |     }
  191 |   }
  192 |   await page.emulateMedia({reducedMotion: 'reduce'});
  193 |   for (const flame of await flames.all()) {
  194 |     await expect(flame).toHaveCSS('animation-name', 'none');
  195 |     await expect(flame).toHaveCSS('opacity', '1');
> 196 |     expect(await flame.evaluate(element => element.getAnimations().length)).toBe(0);
      |                                                                             ^ Error: expect(received).toBe(expected) // Object.is equality
  197 |     expect(await flame.evaluate(element => ({width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height}))).toEqual({width: 48, height: 48});
  198 |   }
  199 |   await page.emulateMedia({reducedMotion: 'no-preference'});
  200 |   await expect.poll(() => flames.first().evaluate(element => element.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(3);
  201 |   await expectNoBlockingAxeViolations(page);
  202 |   await writeFile(testInfo.outputPath('flame-canonical-motion.json'), JSON.stringify(evidence, null, 2));
  203 | });
  204 | 
  205 | for (const motion of ['no-preference', 'reduce'] as const) {
  206 |   test(`snapshot classifications survive filtering, categories and responsive resizing with motion ${motion}`, async ({page}, testInfo) => {
  207 |     await page.emulateMedia({reducedMotion: motion});
  208 |     const evidence = [];
  209 |     for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
  210 |       for (const height of [480, 1080]) {
  211 |         await page.setViewportSize({width, height});
  212 |         const row = page.locator('.v2-ranking-row').first();
  213 |         const geometry = await row.evaluate(element => {
  214 |           const art = element.querySelector('.v2-ranking-art')!.getBoundingClientRect();
  215 |           const flame = element.querySelector('svg')!.getBoundingClientRect();
  216 |           const rank = element.querySelector('.rank')!.getBoundingClientRect();
  217 |           const action = element.querySelector('.v2-ranking-history')!.getBoundingClientRect();
  218 |           return {overflow: document.documentElement.scrollWidth - innerWidth,
  219 |             icon: {width: Number.parseFloat(getComputedStyle(element.querySelector('svg')!).width), height: Number.parseFloat(getComputedStyle(element.querySelector('svg')!).height)}, paintedIcon: {width: flame.width, height: flame.height}, action: {width: action.width, height: action.height},
  220 |             rankWidth:rank.width, ordered: flame.right <= rank.right && rank.right <= art.left && art.right <= action.left,
  221 |             iconAnimation: getComputedStyle(element.querySelector('svg')!).animationName};
  222 |         });
  223 |         expect(geometry.overflow).toBeLessThanOrEqual(1);
  224 |         expect(geometry.icon).toEqual({width: 48, height: 48});
  225 |         expect(geometry.rankWidth).toBe(76);
  226 |         expect(geometry.action.width).toBeGreaterThanOrEqual(44);
  227 |         expect(geometry.action.height).toBeGreaterThanOrEqual(44);
  228 |         expect(geometry.ordered).toBe(true);
  229 |         if (motion === 'reduce') {
  230 |           expect(geometry.paintedIcon).toEqual({width: 48, height: 48});
  231 |           expect(geometry.iconAnimation).toBe('none');
  232 |         } else {
  233 |           expect(geometry.paintedIcon.width).toBeGreaterThanOrEqual(48);
  234 |           expect(geometry.paintedIcon.width).toBeLessThan(51);
  235 |           expect(geometry.paintedIcon.height).toBeGreaterThan(46);
  236 |           expect(geometry.paintedIcon.height).toBeLessThan(55);
  237 |           expect(geometry.iconAnimation).toMatch(/flame-opacity.*flame-rotation.*flame-scale/);
  238 |         }
  239 |         evidence.push({width, height, ...geometry});
  240 |       }
  241 |     }
  242 |     const search = page.getByRole('searchbox', {name: 'Search songs or artists'});
  243 |     await search.fill('Known song 16');
  244 |     await expect(page.locator('.v2-ranking-row')).toHaveCount(1);
  245 |     await expect(page.locator('.v2-ranking-copy strong')).toHaveText('Known song 16');
  246 |     await expect(page.getByRole('group',{name:'Rank 2. ↑ 15 places',exact:true})).toHaveCount(1);
  247 |     await expect(page.getByRole('img', {name: 'Hot mover', exact: true})).toHaveCount(1);
  248 |     await expect(page.getByRole('img', {name: 'Top 10 debut', exact: true})).toHaveCount(0);
  249 |     const history = page.getByRole('button', {name: 'View position history for Known song 16'});
  250 |     await history.press('Enter');
  251 |     await expect(page.getByRole('dialog')).toBeVisible();
  252 |     await page.keyboard.press('Escape');
  253 |     await expect(history).toBeFocused();
  254 |     await search.fill('');
  255 |     await page.getByRole('button', {name: 'Artists', exact: true}).click();
  256 |     await expect(page.getByRole('img', {name: 'Top 10 debut', exact: true})).toHaveCount(1);
  257 |     await expect(page.getByRole('img', {name: 'Hot mover', exact: true})).toHaveCount(1);
  258 |     for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
  259 |       for (const height of [480, 1080]) {
  260 |         await page.setViewportSize({width, height});
  261 |         const geometry = await page.locator('.v2-ranked-artist').first().evaluate(row => {
  262 |           const art = row.querySelector('.v2-artist-art')!.getBoundingClientRect();
  263 |           const flame = row.querySelector('svg')!.getBoundingClientRect();
  264 |           const rank = row.querySelector('.rank')!.getBoundingClientRect();
  265 |           const copy = row.querySelector('.v2-artist-copy')!.getBoundingClientRect();
  266 |           const history = row.querySelector('.v2-artist-history')!.getBoundingClientRect();
  267 |           return {overflow: document.documentElement.scrollWidth - innerWidth,
  268 |             art: {width: art.width, height: art.height}, history: {width: history.width, height: history.height},
  269 |             rankWidth:rank.width, ordered: flame.right <= rank.right && rank.right <= art.left && art.right <= copy.left && copy.right <= history.left};
  270 |         });
  271 |         expect(geometry.overflow).toBeLessThanOrEqual(1);
  272 |         expect(geometry.art).toEqual({width: 48, height: 48});
  273 |         expect(geometry.rankWidth).toBe(76);
  274 |         await expectIntrinsicHistory(page.locator('.v2-ranked-artist').first().locator('.history'));
  275 |         expect(geometry.ordered).toBe(true);
  276 |         evidence.push({category: 'artists', width, height, ...geometry});
  277 |       }
  278 |     }
  279 |     await page.setViewportSize({width: 390, height: 900});
  280 |     const artistSearch = page.getByRole('searchbox', {name: 'Search artists', exact: true});
  281 |     await artistSearch.fill('Artist 16');
  282 |     await expect(page.locator('.v2-ranked-artist')).toHaveCount(1);
  283 |     await expect(page.locator('.v2-artist-copy strong')).toHaveText('Artist 16');
  284 |     await expect(page.getByRole('group',{name:'Rank 2. ↑ 15 places',exact:true})).toHaveCount(1);
  285 |     const artistHistory = page.getByRole('button', {name: 'View position history for Artist 16'});
  286 |     await artistHistory.press('Enter');
  287 |     await expect(page.getByRole('dialog')).toBeVisible();
  288 |     await page.keyboard.press('Escape');
  289 |     await expect(artistHistory).toBeFocused();
  290 |     const artwork = page.getByRole('button', {name: 'Open Artist 16 on Spotify'});
  291 |     await page.keyboard.press('Shift+Tab');
  292 |     await expect(artwork).toBeFocused();
  293 |     const before = await artwork.boundingBox();
  294 |     await expect(artwork).toHaveCSS('border-top-color', 'rgb(53, 231, 131)');
  295 |     await artwork.hover();
  296 |     await expect(artwork).toHaveCSS('border-top-color', 'rgb(53, 231, 131)');
```