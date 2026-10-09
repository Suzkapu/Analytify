# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-flames.spec.ts >> static canonical row captures >> canonical artist row geometry at 1440px
- Location: e2e/design-v2-stats-flames.spec.ts:328:9

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('.v2-ranked-artist').nth(1)
  296 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: stats-artist-row-1440.png

Call log:
  - Expect "toHaveScreenshot(stats-artist-row-1440.png)" locator('.v2-ranked-artist').nth(1) with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('.v2-ranked-artist').nth(1)
    - locator resolved to <v2-stats-ranking-row kind="artists" class="v2-ranked-artist" _nghost-ng-c2140563739="" _ngcontent-ng-c3382161913="">…</v2-stats-ranking-row>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 296 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('.v2-ranked-artist').nth(1)
    - locator resolved to <v2-stats-ranking-row kind="artists" class="v2-ranked-artist" _nghost-ng-c2140563739="" _ngcontent-ng-c3382161913="">…</v2-stats-ranking-row>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - 296 pixels (ratio 0.01 of all image pixels) are different.

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
        - paragraph [ref=f2e33]: Personal listening
        - heading "Your top listening" [level=1] [ref=f2e34]
        - paragraph [ref=f2e35]: See top songs, artists, and genres, and how their rankings change.
      - group "Ranking category" [ref=f2e38]:
        - button "Songs" [ref=f2e39] [cursor=pointer]
        - button "Artists" [active] [pressed] [ref=f2e40] [cursor=pointer]
        - button "Genres" [ref=f2e41] [cursor=pointer]
      - group "Statistics controls" [ref=f2e44]:
        - group "Ranking period" [ref=f2e46]:
          - button "4 weeks" [pressed] [ref=f2e47] [cursor=pointer]
          - button "6 months" [ref=f2e48] [cursor=pointer]
          - button "1 year" [ref=f2e49] [cursor=pointer]
      - generic [ref=f2e50]:
        - group "Search rankings" [ref=f2e52]:
          - generic [ref=f2e54]:
            - generic [ref=f2e55]: Search artists
            - generic [ref=f2e56]:
              - generic [aria-hidden]: 
              - searchbox "Search artists" [ref=f2e57]
          - button "Compare dates" [ref=f2e58] [cursor=pointer]
          - switch "Search past rankings" [ref=f2e61] [cursor=pointer]
        - generic [ref=f2e65]:
          - generic [ref=f2e66]:
            - group "Rank 1. New" [ref=f2e67]:
              - img "Top 10 debut" [ref=f2e69]
              - generic [aria-hidden] [ref=f2e71]: "1"
              - generic [aria-hidden] [ref=f2e72]: ✦
            - button "Open Neon Coast on Spotify" [disabled] [ref=f2e73]:
              - img "Neon Coast photo" [ref=f2e74]
            - strong [ref=f2e76]: Neon Coast
            - button "View position history for Neon Coast" [ref=f2e77] [cursor=pointer]: History
          - generic [ref=f2e78]:
            - group "Rank 2. ↑ 15 places" [ref=f2e79]:
              - img "Hot mover" [ref=f2e81]
              - generic [aria-hidden] [ref=f2e83]: "2"
              - generic [aria-hidden] [ref=f2e84]: ↑ 15
            - button "Open Luma on Spotify" [ref=f2e85] [cursor=pointer]:
              - img "Luma photo" [ref=f2e86]
            - strong [ref=f2e88]: Luma
            - button "View position history for Luma" [ref=f2e89] [cursor=pointer]: History
          - generic [ref=f2e90]:
            - group "Rank 3. Unchanged" [ref=f2e91]:
              - generic [aria-hidden] [ref=f2e92]: "3"
              - generic [aria-hidden] [ref=f2e93]: —
            - button "Open Artist 2 on Spotify" [ref=f2e94] [cursor=pointer]:
              - img "Artist 2 photo" [ref=f2e95]
            - strong [ref=f2e97]: Artist 2
            - button "View position history for Artist 2" [ref=f2e98] [cursor=pointer]: History
  - text:   
  - contentinfo [ref=f2e99]:
    - generic [ref=f2e100]: Powered by Spotify
    - generic [ref=f2e101]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e102] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
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
  297 |     expect(await artwork.boundingBox()).toEqual(before);
  298 |     await artistSearch.fill('');
  299 |     await expect(page.getByRole('button', {name: 'Open Debut artist on Spotify'})).toBeDisabled();
  300 |     await expectNoBlockingAxeViolations(page);
  301 |     const geometryPath=testInfo.outputPath('flame-responsive-geometry.json');
  302 |     await writeFile(geometryPath,JSON.stringify({motion,evidence},null,2)+'\n');
  303 |     await testInfo.attach('flame-responsive-geometry.json', {path:geometryPath,contentType:'application/json'});
  304 |   });
  305 | }
  306 | 
  307 | test.describe('static canonical row captures', () => {
  308 |   // Capture canonical colors after suppressing decorative motion from startup.
  309 |   // Normal and reduced motion remain covered by the resizing workflows above.
  310 |   test.use({reducedMotion: 'reduce'});
  311 |   test.beforeEach(async ({page}) => {
  312 |     await mockCanonicalArtwork(page);
  313 |     // Use canonical labels and sample artwork to compare the designed 80px row;
  314 |     // longer real-data labels are exercised by the separate reflow workflows.
  315 |     await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items:[
  316 |       {...currentTracks[0],album:{images:[{url:canonicalArtworkUrl}]},name:'Midnight Drive',artists:[{id:'artist',name:'Neon Coast'}]},
  317 |       {...currentTracks[1],album:{images:[{url:canonicalArtworkUrl}]},name:'Paper Planes',artists:[{id:'artist',name:'Luma'}]},currentTracks[2]
  318 |     ],total:3}}));
  319 |     await page.route('https://api.spotify.com/v1/me/top/artists?*',route=>route.fulfill({json:{items:[
  320 |       {...currentArtists[0],images:[{url:canonicalArtworkUrl}],name:'Neon Coast'},{...currentArtists[1],images:[{url:canonicalArtworkUrl}],name:'Luma'},currentArtists[2]
  321 |     ],total:3}}));
  322 |     await clearCurrentFixtureStats(page);
  323 |     await page.reload();
  324 |     await expect(page.locator('.v2-ranking-row strong').first()).toHaveText('Midnight Drive');
  325 |   });
  326 | 
  327 |   for (const width of [390, 1440]) {
  328 |     test(`canonical artist row geometry at ${width}px`, async ({page}, testInfo) => {
  329 |       await page.setViewportSize({width, height: 900});
  330 |       await page.getByRole('button', {name: 'Artists', exact: true}).click();
  331 |       const row = page.locator('.v2-ranked-artist').nth(1);
  332 |       await row.evaluate(element => element.scrollIntoView({block: 'center'}));
  333 |       await expect(row.getByRole('button', {name: 'View position history for Luma'}))
  334 |         .toHaveCSS('border-top-color', 'rgb(52, 66, 58)');
  335 |       await recordCanonicalRow(row, testInfo, 'artist');
> 336 |       await expect(row).toHaveScreenshot(`stats-artist-row-${width}.png`, {animations: 'disabled'});
      |                         ^ Error: expect(locator).toHaveScreenshot(expected) failed
  337 |     });
  338 |   }
  339 |   for (const width of [390, 1440]) {
  340 |     test(`canonical flame colors and placement at ${width}px`, async ({page}, testInfo) => {
  341 |       await page.setViewportSize({width, height: 900});
  342 |       await expect(page.getByRole('img', {name: 'Top 10 debut', exact: true})).toHaveCSS('fill', 'rgb(119, 184, 255)');
  343 |       await expect(page.getByRole('img', {name: 'Hot mover', exact: true})).toHaveCSS('fill', 'rgb(255, 155, 84)');
  344 |       await page.locator('.v2-ranking-row').first().evaluate(row => row.scrollIntoView({block: 'center'}));
  345 |       await recordCanonicalRow(page.locator('.v2-ranking-row').first(), testInfo, 'debut');
  346 |       await expect(page.locator('.v2-ranking-row').first()).toHaveScreenshot(`stats-debut-row-${width}.png`, {animations: 'disabled'});
  347 |       await page.locator('.v2-ranking-row').nth(1).evaluate(row => row.scrollIntoView({block: 'center'}));
  348 |       await recordCanonicalRow(page.locator('.v2-ranking-row').nth(1), testInfo, 'hot-mover');
  349 |       await expect(page.locator('.v2-ranking-row').nth(1)).toHaveScreenshot(`stats-hot-mover-row-${width}.png`, {animations: 'disabled'});
  350 |     });
  351 |   }
  352 |   for (const width of [390,1440]) {
  353 |     test(`canonical History action states retain geometry and keyboard recovery at ${width}px`,async({page},testInfo)=>{
  354 |       await page.setViewportSize({width,height:900});
  355 |       const row=page.locator('.v2-ranking-row').nth(1);
  356 |       await page.evaluate(()=>document.fonts.ready);
  357 |       await row.evaluate(element=>element.scrollIntoView({block:'center'}));
  358 |       const history=row.getByRole('button',{name:'View position history for Paper Planes'});
  359 |       const artwork=row.getByRole('button',{name:'Open Paper Planes on Spotify'});
  360 |       // Establish actionability before measuring; hover can legitimately scroll
  361 |       // a control away from the fixed mobile navigation.
  362 |       await history.hover();
  363 |       await page.mouse.move(0,0);
  364 |       await recordCanonicalRow(row,testInfo,'history-action-row');
  365 |       await expect(history).toHaveCSS('background-color','rgb(13, 19, 15)');
  366 |       await expect(history).toHaveCSS('border-top-color','rgb(52, 66, 58)');
  367 |       await expect(history).toHaveCSS('border-top-width','1px');
  368 |       const initial=await history.boundingBox();
  369 |       expect(initial?.height).toBe(44);await expectIntrinsicHistory(history);
  370 |       await history.hover();
  371 |       await expect(history).toHaveCSS('background-color','rgb(24, 32, 25)');
  372 |       await expect(history).toHaveCSS('border-top-color','rgb(107, 125, 113)');
  373 |       expect(await history.boundingBox()).toEqual(initial);
  374 |       await artwork.focus();await artwork.press('Tab');
  375 |       await expect(history).toBeFocused();
  376 |       await expect(history).toHaveCSS('border-top-width','2px');
  377 |       await expect(history).toHaveCSS('border-top-color','rgb(159, 255, 200)');
  378 |       await expect(history).toHaveCSS('background-color','rgb(18, 24, 20)');
  379 |       await expect(history).toHaveCSS('outline-style','none');
  380 |       await history.hover();
  381 |       await expect(history).toHaveCSS('border-top-width','2px');
  382 |       await expect(history).toHaveCSS('background-color','rgb(18, 24, 20)');
  383 |       expect(await history.boundingBox()).toEqual(initial);
  384 |       await history.press('Enter');
  385 |       await expect(page.getByRole('dialog',{name:'Paper Planes position history'})).toBeVisible();
  386 |       await page.keyboard.press('Escape');
  387 |       await expect(page.getByRole('dialog')).toHaveCount(0);
  388 |       await expect(history).toBeFocused();
  389 |       await expect(history).toHaveCSS('border-top-width','2px');
  390 |       await expectNoBlockingAxeViolations(page);
  391 |       await artwork.focus();await page.mouse.move(0,0);
  392 |       await expect(history).toHaveCSS('background-color','rgb(13, 19, 15)');
  393 |       await expect(history).toHaveScreenshot(`stats-history-action-default-${width}.png`,{animations:'disabled'});
  394 |       await history.hover();
  395 |       await expect(history).toHaveCSS('background-color','rgb(24, 32, 25)');
  396 |       await expect(history).toHaveScreenshot(`stats-history-action-hover-${width}.png`,{animations:'disabled'});
  397 |       await artwork.focus();await artwork.press('Tab');
  398 |       await expect(history).toHaveCSS('border-top-width','2px');
  399 |       await expect(history).toHaveScreenshot(`stats-history-action-focus-${width}.png`,{animations:'disabled'});
  400 |       const path=testInfo.outputPath('history-action-state-geometry.json');
  401 |       await writeFile(path,JSON.stringify({width,initial,final:await history.boundingBox()},null,2)+'\n');
  402 |       await testInfo.attach('history-action-state-geometry',{path,contentType:'application/json'});
  403 |     });
  404 |   }
  405 | 
  406 | });
  407 | 
  408 | test('song ranking artwork and History follow the canonical independent action workflow', async ({page}) => {
  409 |   await page.setViewportSize({width:390,height:900});
  410 |   await page.getByRole('searchbox',{name:'Search songs or artists'}).fill('Known song 16');
  411 |   const row=page.locator('.v2-ranking-row');
  412 |   const artwork=row.getByRole('button',{name:'Open Known song 16 on Spotify'});
  413 |   const history=row.getByRole('button',{name:'View position history for Known song 16'});
  414 |   await expect(artwork).toHaveCSS('width','48px');
  415 |   await expect(artwork).toHaveCSS('height','48px');
  416 |   await expect(history).toHaveText('History');
  417 |   await expectIntrinsicHistory(history);
  418 |   await expect(row.locator('strong')).toHaveText('Known song 16');
  419 |   await expect(row.locator('.copy span')).toHaveText('Example Artist');
  420 |   await expect(row.getByRole('group',{name:'Rank 2. ↑ 15 places',exact:true})).toBeVisible();
  421 |   await history.press('Enter');
  422 |   await expect(page.getByRole('dialog')).toBeVisible();
  423 |   await page.keyboard.press('Escape');
  424 |   await expect(history).toBeFocused();
  425 |   await page.keyboard.press('Shift+Tab');
  426 |   await expect(artwork).toBeFocused();
  427 |   const before=await artwork.boundingBox();
  428 |   await expect(artwork).toHaveCSS('border-top-color','rgb(53, 231, 131)');
  429 |   await expect(artwork).toHaveCSS('border-top-width','3px');
  430 |   await artwork.hover();
  431 |   expect(await artwork.boundingBox()).toEqual(before);
  432 |   await history.focus();
  433 |   await expect(artwork).toHaveCSS('border-top-color','rgb(53, 231, 131)');
  434 |   await expect(artwork).toHaveCSS('border-top-width','2px');
  435 |   expect(await artwork.boundingBox()).toEqual(before);
  436 |   await expect(page.getByRole('dialog')).toHaveCount(0);
```