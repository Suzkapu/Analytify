# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-flames.spec.ts >> static canonical row captures >> canonical History action states retain geometry and keyboard recovery at 390px
- Location: e2e/design-v2-stats-flames.spec.ts:356:9

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('.v2-ranking-row').nth(1).getByRole('button', { name: 'View position history for Paper Planes' })
  Expected an image 69px by 45px, received 69px by 44px. 69 pixels (ratio 0.03 of all image pixels) are different.

  Snapshot: stats-history-action-default-390.png

Call log:
  - Expect "toHaveScreenshot(stats-history-action-default-390.png)" locator('.v2-ranking-row').nth(1).getByRole('button', { name: 'View position history for Paper Planes' }) with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('.v2-ranking-row').nth(1).getByRole('button', { name: 'View position history for Paper Planes' })
    - locator resolved to <button type="button" v2button="secondary" _ngcontent-ng-c2140563739="" aria-label="View position history for Paper Planes" class="history v2-ranking-history v2-button v2-button--secondary">History</button>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - Expected an image 69px by 45px, received 69px by 44px. 69 pixels (ratio 0.03 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('.v2-ranking-row').nth(1).getByRole('button', { name: 'View position history for Paper Planes' })
    - locator resolved to <button type="button" v2button="secondary" _ngcontent-ng-c2140563739="" aria-label="View position history for Paper Planes" class="history v2-ranking-history v2-button v2-button--secondary">History</button>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - Expected an image 69px by 45px, received 69px by 44px. 69 pixels (ratio 0.03 of all image pixels) are different.

```

# Page snapshot

```yaml
- generic [ref=f2e5]:
  - link "Skip to main content" [ref=f2e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f2e7]:
    - generic [ref=f2e8]:
      - text:   
      - generic [ref=f2e9]: Your Top Listening
      - generic [ref=f2e11]:
        - button "Open More tools" [ref=f2e12] [cursor=pointer]:
          - generic [aria-hidden] [ref=f2e13]: 
          - generic [ref=f2e14]: More
        - button "Open account and data settings" [ref=f2e15] [cursor=pointer]:
          - generic [aria-hidden] [ref=f2e16]: 
  - main "Your Top Listening content" [ref=f2e17]:
    - generic [ref=f2e20]:
      - heading "Your top listening" [level=1] [ref=f2e24]
      - generic [ref=f2e25]:
        - region "Statistics controls" [ref=f2e26]:
          - generic [ref=f2e27]:
            - paragraph [ref=f2e28]: Period
            - group "Ranking period" [ref=f2e29]:
              - button "4 weeks" [pressed] [ref=f2e30] [cursor=pointer]
              - button "6 months" [ref=f2e32] [cursor=pointer]
              - button "1 year" [ref=f2e34] [cursor=pointer]
          - generic [ref=f2e36]:
            - paragraph [ref=f2e37]: Category
            - group "Ranking category" [ref=f2e38]:
              - button "Songs" [pressed] [ref=f2e39] [cursor=pointer]
              - button "Artists" [ref=f2e42] [cursor=pointer]
              - button "Genres" [ref=f2e45] [cursor=pointer]
        - group "Search rankings" [ref=f2e49]:
          - generic [ref=f2e51]:
            - generic [ref=f2e52]: Search songs or artists
            - generic [ref=f2e53]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f2e54]
          - button "Compare dates" [ref=f2e55] [cursor=pointer]
          - switch "Search past rankings" [ref=f2e58] [cursor=pointer]
        - region "Rankings" [ref=f2e62]:
          - heading "Top songs" [level=2] [ref=f2e63]
          - generic [ref=f2e64]:
            - generic [ref=f2e65]:
              - group "Rank 1. New" [ref=f2e66]:
                - img "Top 10 debut" [ref=f2e68]
                - generic [aria-hidden] [ref=f2e70]: "1"
                - generic [aria-hidden] [ref=f2e71]: ✦
              - button "Open Midnight Drive on Spotify" [ref=f2e72] [cursor=pointer]:
                - img "Midnight Drive cover" [ref=f2e73]
              - generic [ref=f2e74]:
                - strong [ref=f2e75]: Midnight Drive
                - generic [ref=f2e76]: Neon Coast
              - button "View position history for Midnight Drive" [ref=f2e77] [cursor=pointer]: History
            - generic [ref=f2e78]:
              - group "Rank 2. ↑ 15 places" [ref=f2e79]:
                - img "Hot mover" [ref=f2e81]
                - generic [aria-hidden] [ref=f2e83]: "2"
                - generic [aria-hidden] [ref=f2e84]: ↑ 15
              - button "Open Paper Planes on Spotify" [active] [ref=f2e85] [cursor=pointer]:
                - img "Paper Planes cover" [ref=f2e86]
              - generic [ref=f2e87]:
                - strong [ref=f2e88]: Paper Planes
                - generic [ref=f2e89]: Luma
              - button "View position history for Paper Planes" [ref=f2e90] [cursor=pointer]: History
            - generic [ref=f2e91]:
              - group "Rank 3. Unchanged" [ref=f2e92]:
                - generic [aria-hidden] [ref=f2e93]: "3"
                - generic [aria-hidden] [ref=f2e94]: —
              - button "Open Known song 2 on Spotify" [ref=f2e95] [cursor=pointer]:
                - img "Known song 2 cover" [ref=f2e96]
              - generic [ref=f2e97]:
                - strong [ref=f2e98]: Known song 2
                - generic [ref=f2e99]: Example Artist
              - button "View position history for Known song 2" [ref=f2e100] [cursor=pointer]: History
          - button "Create playlist from these songs" [ref=f2e102] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e103]: 
            - text: Create playlist from these songs
  - navigation "Primary navigation" [ref=f2e104]:
    - link "Playlists" [ref=f2e105] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f2e106]: 
    - link "Stats" [ref=f2e108] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f2e109]: 
    - link "History" [ref=f2e111] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f2e112]: 
  - contentinfo [ref=f2e114]:
    - generic [ref=f2e115]: Powered by Spotify
    - generic [ref=f2e116]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e117] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  296 |     const before = await artwork.boundingBox();
  297 |     await expect(artwork).toHaveCSS('border-top-color', 'rgb(53, 231, 131)');
  298 |     await artwork.hover();
  299 |     await expect(artwork).toHaveCSS('border-top-color', 'rgb(53, 231, 131)');
  300 |     expect(await artwork.boundingBox()).toEqual(before);
  301 |     await artistSearch.fill('');
  302 |     await expect(page.getByRole('button', {name: 'Open Debut artist on Spotify'})).toBeDisabled();
  303 |     await expectNoBlockingAxeViolations(page);
  304 |     const geometryPath=testInfo.outputPath('flame-responsive-geometry.json');
  305 |     await writeFile(geometryPath,JSON.stringify({motion,evidence},null,2)+'\n');
  306 |     await testInfo.attach('flame-responsive-geometry.json', {path:geometryPath,contentType:'application/json'});
  307 |   });
  308 | }
  309 | 
  310 | test.describe('static canonical row captures', () => {
  311 |   // Capture canonical colors after suppressing decorative motion from startup.
  312 |   // Normal and reduced motion remain covered by the resizing workflows above.
  313 |   test.use({reducedMotion: 'reduce'});
  314 |   test.beforeEach(async ({page}) => {
  315 |     await mockCanonicalArtwork(page);
  316 |     // Use canonical labels and sample artwork to compare the designed 80px row;
  317 |     // longer real-data labels are exercised by the separate reflow workflows.
  318 |     await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items:[
  319 |       {...currentTracks[0],album:{images:[{url:canonicalArtworkUrl}]},name:'Midnight Drive',artists:[{id:'artist',name:'Neon Coast'}]},
  320 |       {...currentTracks[1],album:{images:[{url:canonicalArtworkUrl}]},name:'Paper Planes',artists:[{id:'artist',name:'Luma'}]},currentTracks[2]
  321 |     ],total:3}}));
  322 |     await page.route('https://api.spotify.com/v1/me/top/artists?*',route=>route.fulfill({json:{items:[
  323 |       {...currentArtists[0],images:[{url:canonicalArtworkUrl}],name:'Neon Coast'},{...currentArtists[1],images:[{url:canonicalArtworkUrl}],name:'Luma'},currentArtists[2]
  324 |     ],total:3}}));
  325 |     await clearCurrentFixtureStats(page);
  326 |     await page.reload();
  327 |     await expect(page.locator('.v2-ranking-row strong').first()).toHaveText('Midnight Drive');
  328 |   });
  329 | 
  330 |   for (const width of [390, 1440]) {
  331 |     test(`canonical artist row geometry at ${width}px`, async ({page}, testInfo) => {
  332 |       await page.setViewportSize({width, height: 900});
  333 |       await page.getByRole('button', {name: 'Artists', exact: true}).click();
  334 |       const row = page.locator('.v2-ranked-artist').nth(1);
  335 |       await row.evaluate(element => element.scrollIntoView({block: 'center'}));
  336 |       await expect(row.getByRole('button', {name: 'View position history for Luma'}))
  337 |         .toHaveCSS('border-top-color', 'rgb(52, 66, 58)');
  338 |       await recordCanonicalRow(row, testInfo, 'artist');
  339 |       await expect(row).toHaveScreenshot(`stats-artist-row-${width}.png`, {animations: 'disabled'});
  340 |     });
  341 |   }
  342 |   for (const width of [390, 1440]) {
  343 |     test(`canonical flame colors and placement at ${width}px`, async ({page}, testInfo) => {
  344 |       await page.setViewportSize({width, height: 900});
  345 |       await expect(page.getByRole('img', {name: 'Top 10 debut', exact: true})).toHaveCSS('fill', 'rgb(119, 184, 255)');
  346 |       await expect(page.getByRole('img', {name: 'Hot mover', exact: true})).toHaveCSS('fill', 'rgb(255, 155, 84)');
  347 |       await page.locator('.v2-ranking-row').first().evaluate(row => row.scrollIntoView({block: 'center'}));
  348 |       await recordCanonicalRow(page.locator('.v2-ranking-row').first(), testInfo, 'debut');
  349 |       await expect(page.locator('.v2-ranking-row').first()).toHaveScreenshot(`stats-debut-row-${width}.png`, {animations: 'disabled'});
  350 |       await page.locator('.v2-ranking-row').nth(1).evaluate(row => row.scrollIntoView({block: 'center'}));
  351 |       await recordCanonicalRow(page.locator('.v2-ranking-row').nth(1), testInfo, 'hot-mover');
  352 |       await expect(page.locator('.v2-ranking-row').nth(1)).toHaveScreenshot(`stats-hot-mover-row-${width}.png`, {animations: 'disabled'});
  353 |     });
  354 |   }
  355 |   for (const width of [390,1440]) {
  356 |     test(`canonical History action states retain geometry and keyboard recovery at ${width}px`,async({page},testInfo)=>{
  357 |       await page.setViewportSize({width,height:900});
  358 |       const row=page.locator('.v2-ranking-row').nth(1);
  359 |       await page.evaluate(()=>document.fonts.ready);
  360 |       await row.evaluate(element=>element.scrollIntoView({block:'center'}));
  361 |       const history=row.getByRole('button',{name:'View position history for Paper Planes'});
  362 |       const artwork=row.getByRole('button',{name:'Open Paper Planes on Spotify'});
  363 |       // Establish actionability before measuring; hover can legitimately scroll
  364 |       // a control away from the fixed mobile navigation.
  365 |       await history.hover();
  366 |       await page.mouse.move(0,0);
  367 |       await recordCanonicalRow(row,testInfo,'history-action-row');
  368 |       await expect(history).toHaveCSS('background-color','rgb(13, 19, 15)');
  369 |       await expect(history).toHaveCSS('border-top-color','rgb(52, 66, 58)');
  370 |       await expect(history).toHaveCSS('border-top-width','1px');
  371 |       const initial=await history.boundingBox();
  372 |       expect(initial?.height).toBe(44);await expectIntrinsicHistory(history);
  373 |       await history.hover();
  374 |       await expect(history).toHaveCSS('background-color','rgb(24, 32, 25)');
  375 |       await expect(history).toHaveCSS('border-top-color','rgb(107, 125, 113)');
  376 |       expect(await history.boundingBox()).toEqual(initial);
  377 |       await artwork.focus();await artwork.press('Tab');
  378 |       await expect(history).toBeFocused();
  379 |       await expect(history).toHaveCSS('border-top-width','2px');
  380 |       await expect(history).toHaveCSS('border-top-color','rgb(159, 255, 200)');
  381 |       await expect(history).toHaveCSS('background-color','rgb(18, 24, 20)');
  382 |       await expect(history).toHaveCSS('outline-style','none');
  383 |       await history.hover();
  384 |       await expect(history).toHaveCSS('border-top-width','2px');
  385 |       await expect(history).toHaveCSS('background-color','rgb(18, 24, 20)');
  386 |       expect(await history.boundingBox()).toEqual(initial);
  387 |       await history.press('Enter');
  388 |       await expect(page.getByRole('dialog',{name:'Paper Planes position history'})).toBeVisible();
  389 |       await page.keyboard.press('Escape');
  390 |       await expect(page.getByRole('dialog')).toHaveCount(0);
  391 |       await expect(history).toBeFocused();
  392 |       await expect(history).toHaveCSS('border-top-width','2px');
  393 |       await expectNoBlockingAxeViolations(page);
  394 |       await artwork.focus();await page.mouse.move(0,0);
  395 |       await expect(history).toHaveCSS('background-color','rgb(13, 19, 15)');
> 396 |       await expect(history).toHaveScreenshot(`stats-history-action-default-${width}.png`,{animations:'disabled'});
      |                             ^ Error: expect(locator).toHaveScreenshot(expected) failed
  397 |       await history.hover();
  398 |       await expect(history).toHaveCSS('background-color','rgb(24, 32, 25)');
  399 |       await expect(history).toHaveScreenshot(`stats-history-action-hover-${width}.png`,{animations:'disabled'});
  400 |       await artwork.focus();await artwork.press('Tab');
  401 |       await expect(history).toHaveCSS('border-top-width','2px');
  402 |       await expect(history).toHaveScreenshot(`stats-history-action-focus-${width}.png`,{animations:'disabled'});
  403 |       const path=testInfo.outputPath('history-action-state-geometry.json');
  404 |       await writeFile(path,JSON.stringify({width,initial,final:await history.boundingBox()},null,2)+'\n');
  405 |       await testInfo.attach('history-action-state-geometry',{path,contentType:'application/json'});
  406 |     });
  407 |   }
  408 | 
  409 | });
  410 | 
  411 | test('song ranking artwork and History follow the canonical independent action workflow', async ({page}) => {
  412 |   await page.setViewportSize({width:390,height:900});
  413 |   await page.getByRole('searchbox',{name:'Search songs or artists'}).fill('Known song 16');
  414 |   const row=page.locator('.v2-ranking-row');
  415 |   const artwork=row.getByRole('button',{name:'Open Known song 16 on Spotify'});
  416 |   const history=row.getByRole('button',{name:'View position history for Known song 16'});
  417 |   await expect(artwork).toHaveCSS('width','48px');
  418 |   await expect(artwork).toHaveCSS('height','48px');
  419 |   await expect(history).toHaveText('History');
  420 |   await expectIntrinsicHistory(history);
  421 |   await expect(row.locator('strong')).toHaveText('Known song 16');
  422 |   await expect(row.locator('.copy span')).toHaveText('Example Artist');
  423 |   await expect(row.getByRole('group',{name:'Rank 2. ↑ 15 places',exact:true})).toBeVisible();
  424 |   await history.press('Enter');
  425 |   await expect(page.getByRole('dialog')).toBeVisible();
  426 |   await page.keyboard.press('Escape');
  427 |   await expect(history).toBeFocused();
  428 |   await page.keyboard.press('Shift+Tab');
  429 |   await expect(artwork).toBeFocused();
  430 |   const before=await artwork.boundingBox();
  431 |   await expect(artwork).toHaveCSS('border-top-color','rgb(53, 231, 131)');
  432 |   await expect(artwork).toHaveCSS('border-top-width','3px');
  433 |   await artwork.hover();
  434 |   expect(await artwork.boundingBox()).toEqual(before);
  435 |   await history.focus();
  436 |   await expect(artwork).toHaveCSS('border-top-color','rgb(53, 231, 131)');
  437 |   await expect(artwork).toHaveCSS('border-top-width','2px');
  438 |   expect(await artwork.boundingBox()).toEqual(before);
  439 |   await expect(page.getByRole('dialog')).toHaveCount(0);
  440 |   await expectNoBlockingAxeViolations(page);
  441 | });
  442 | 
  443 | for (const motion of ['no-preference','reduce'] as const) {
  444 |   test(`large original ranks wrap movement without shifting actions with motion ${motion}`, async ({page},testInfo) => {
  445 |     await page.emulateMedia({reducedMotion:motion});
  446 |     await mockCanonicalArtwork(page);
  447 |     const names=new Map([[50,'Paper Planes'],[100,'A remarkably long song title that remains readable at every playlist width'],[1000,'Thousandth boundary item']]);
  448 |     const items=Array.from({length:1000},(_,index)=>({...tracks[0],id:`boundary-${index+1}`,
  449 |       name:names.get(index+1) ?? `Boundary item ${index+1}`,album:{images:[{url:canonicalArtworkUrl}]},
  450 |       artists:[{id:'artist',name:index===49?'Luma':index===99?'Luma, Atlas North and featured collaborators':'Example Artist'}],
  451 |       external_urls:{spotify:`https://open.spotify.com/track/boundary-${index+1}`}}));
  452 |     const previous=items.filter((_,index)=>![49,99,999].includes(index));
  453 |     previous.unshift(items[99],items[999]);previous.splice(64,0,items[49]);
  454 |     await page.evaluate(async topTracks=>{
  455 |       await new Promise<void>((resolve,reject)=>{
  456 |         const request=indexedDB.open('AnalytifyDB',4);request.onerror=()=>reject(request.error);
  457 |         request.onsuccess=()=>{
  458 |           const db=request.result,transaction=db.transaction('statsHistory','readwrite');
  459 |           for(const userId of ['e2e-user','e2e-user_dev']) transaction.objectStore('statsHistory').put({userId,range:'short_term',
  460 |             timestamp:new Date('2026-10-05T12:00:00Z').getTime(),snapshotDate:'2026-10-05',
  461 |             topTracks,topArtists:[],topGenres:[],isLoaded:true});
  462 |           transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>reject(transaction.error);
  463 |         };
  464 |       });
  465 |     },previous);
  466 |     await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items,total:1000}}));
  467 |     await clearCurrentFixtureStats(page);await page.reload();await page.evaluate(()=>document.fonts.ready);
  468 |     const evidence=[];
  469 |     for(const [rank,name] of names) {
  470 |       await page.getByRole('searchbox',{name:'Search songs or artists'}).fill(name);
  471 |       const row=page.locator('.v2-ranking-row');
  472 |       if(rank===1000) {
  473 |         // Fresh Spotify Stats deliberately caps the deduplicated pool at 100.
  474 |         await expect(row).toHaveCount(0);
  475 |         await expect(page.getByRole('heading',{name:'No top songs found'})).toBeVisible();
  476 |         evidence.push({rank,sourceLimit:100,visibleRows:0});continue;
  477 |       }
  478 |       await expect(row).toHaveCount(1);
  479 |       const caption=rank===50?'↑ 15 places':rank===100?'↓ 99 places':'↓ 998 places';
  480 |       await expect(row.getByRole('group',{name:`Rank ${rank}. ${caption}`,exact:true})).toBeVisible();
  481 |       await expect(row.locator('.rank-number')).toHaveText(String(rank));
  482 |       await expect(row.locator('strong')).toHaveText(name);
  483 |       await expect(row.getByRole('img',{name:'Hot mover',exact:true})).toHaveCount(rank===50?1:0);
  484 |       for(const width of [320,360,390,760,761,768,1024,1440,1920]) for(const height of [480,1080]) {
  485 |         await page.setViewportSize({width,height});await row.scrollIntoViewIfNeeded();
  486 |         const geometry=await row.evaluate(element=>{
  487 |           const bounds=element.getBoundingClientRect(),column=element.querySelector('.rank')!.getBoundingClientRect();
  488 |           const number=element.querySelector('.rank-number')!.getBoundingClientRect();
  489 |           const movement=element.querySelector('.rank-movement')!.getBoundingClientRect();
  490 |           const art=element.querySelector('.artwork')!.getBoundingClientRect();
  491 |           const copy=element.querySelector('.copy')!.getBoundingClientRect();
  492 |           const action=element.querySelector('.history')!.getBoundingClientRect();
  493 |           return {row:bounds.toJSON(),column:column.toJSON(),number:number.toJSON(),movement:movement.toJSON(),
  494 |             ordered:column.right<=art.left&&art.right<=copy.left&&copy.right<=action.left,
  495 |             copyInset:getComputedStyle(element.querySelector('.copy')!).paddingLeft,
  496 |             overflow:document.documentElement.scrollWidth-innerWidth};
```