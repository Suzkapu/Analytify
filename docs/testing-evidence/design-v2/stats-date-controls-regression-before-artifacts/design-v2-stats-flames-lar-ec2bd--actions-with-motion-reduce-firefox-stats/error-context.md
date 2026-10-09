# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-flames.spec.ts >> large original ranks wrap movement without shifting actions with motion reduce
- Location: e2e/design-v2-stats-flames.spec.ts:351:7

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('.v2-ranking-row')
  443 pixels (ratio 0.02 of all image pixels) are different.

  Snapshot: stats-large-rank-50-390.png

Call log:
  - Expect "toHaveScreenshot(stats-large-rank-50-390.png)" locator('.v2-ranking-row') with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('.v2-ranking-row')
    - locator resolved to <v2-stats-ranking-row kind="tracks" class="v2-ranking-row" _nghost-ng-c2140563739="" _ngcontent-ng-c1689593240="">…</v2-stats-ranking-row>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 443 pixels (ratio 0.02 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('.v2-ranking-row')
    - locator resolved to <v2-stats-ranking-row kind="tracks" class="v2-ranking-row" _nghost-ng-c2140563739="" _ngcontent-ng-c1689593240="">…</v2-stats-ranking-row>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - 443 pixels (ratio 0.02 of all image pixels) are different.

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
      - generic [ref=f2e22]:
        - paragraph [ref=f2e23]: Personal listening
        - heading "Your top listening" [level=1] [ref=f2e24]
        - paragraph [ref=f2e25]: See top songs, artists, and genres, and how their rankings change.
      - group "Ranking category" [ref=f2e28]:
        - button "Songs" [pressed] [ref=f2e29] [cursor=pointer]
        - button "Artists" [ref=f2e30] [cursor=pointer]
        - button "Genres" [ref=f2e31] [cursor=pointer]
      - group "Statistics controls" [ref=f2e34]:
        - group "Ranking period" [ref=f2e36]:
          - button "4 weeks" [pressed] [ref=f2e37] [cursor=pointer]
          - button "6 months" [ref=f2e38] [cursor=pointer]
          - button "1 year" [ref=f2e39] [cursor=pointer]
      - generic [ref=f2e40]:
        - group "Search rankings" [ref=f2e42]:
          - generic [ref=f2e44]:
            - generic [ref=f2e45]: Search songs or artists
            - generic [ref=f2e46]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [active] [ref=f2e47]: Paper Planes
          - button "Compare dates" [ref=f2e48] [cursor=pointer]
          - button "Search past" [ref=f2e50] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e51]: 
            - text: Search past
        - generic [ref=f2e53]:
          - group "Rank 50. ↑ 15 places" [ref=f2e54]:
            - img "Hot mover" [ref=f2e56]
            - generic [aria-hidden] [ref=f2e58]: "50"
            - generic [aria-hidden] [ref=f2e59]: ↑ 15
          - button "Open Paper Planes on Spotify" [ref=f2e60] [cursor=pointer]:
            - img "Paper Planes cover" [ref=f2e61]
          - generic [ref=f2e62]:
            - strong [ref=f2e63]: Paper Planes
            - generic [ref=f2e64]: Luma
          - button "View position history for Paper Planes" [ref=f2e65] [cursor=pointer]: History
        - button " Create playlist" [ref=f2e66] [cursor=pointer]:
          - generic [ref=f2e67]: 
          - text: Create playlist
  - navigation "Primary navigation" [ref=f2e68]:
    - link "Playlists" [ref=f2e69] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f2e70]: 
    - link "Stats" [ref=f2e72] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f2e73]: 
    - link "History" [ref=f2e75] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f2e76]: 
  - contentinfo [ref=f2e78]:
    - generic [ref=f2e79]: Powered by Spotify
    - generic [ref=f2e80]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e81] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  324 |   await expect(artwork).toHaveCSS('width','48px');
  325 |   await expect(artwork).toHaveCSS('height','48px');
  326 |   await expect(history).toHaveText('History');
  327 |   await expectIntrinsicHistory(history);
  328 |   await expect(row.locator('strong')).toHaveText('Known song 16');
  329 |   await expect(row.locator('.copy span')).toHaveText('Example Artist');
  330 |   await expect(row.getByRole('group',{name:'Rank 2. ↑ 15 places',exact:true})).toBeVisible();
  331 |   await history.press('Enter');
  332 |   await expect(page.getByRole('dialog')).toBeVisible();
  333 |   await page.keyboard.press('Escape');
  334 |   await expect(history).toBeFocused();
  335 |   await page.keyboard.press('Shift+Tab');
  336 |   await expect(artwork).toBeFocused();
  337 |   const before=await artwork.boundingBox();
  338 |   await expect(artwork).toHaveCSS('border-top-color','rgb(53, 231, 131)');
  339 |   await expect(artwork).toHaveCSS('border-top-width','3px');
  340 |   await artwork.hover();
  341 |   expect(await artwork.boundingBox()).toEqual(before);
  342 |   await history.focus();
  343 |   await expect(artwork).toHaveCSS('border-top-color','rgb(53, 231, 131)');
  344 |   await expect(artwork).toHaveCSS('border-top-width','2px');
  345 |   expect(await artwork.boundingBox()).toEqual(before);
  346 |   await expect(page.getByRole('dialog')).toHaveCount(0);
  347 |   await expectNoBlockingAxeViolations(page);
  348 | });
  349 | 
  350 | for (const motion of ['no-preference','reduce'] as const) {
  351 |   test(`large original ranks wrap movement without shifting actions with motion ${motion}`, async ({page},testInfo) => {
  352 |     await page.emulateMedia({reducedMotion:motion});
  353 |     await mockCanonicalArtwork(page);
  354 |     const names=new Map([[50,'Paper Planes'],[100,'A remarkably long song title that remains readable at every playlist width'],[1000,'Thousandth boundary item']]);
  355 |     const items=Array.from({length:1000},(_,index)=>({...tracks[0],id:`boundary-${index+1}`,
  356 |       name:names.get(index+1) ?? `Boundary item ${index+1}`,album:{images:[{url:canonicalArtworkUrl}]},
  357 |       artists:[{id:'artist',name:index===49?'Luma':index===99?'Luma, Atlas North and featured collaborators':'Example Artist'}],
  358 |       external_urls:{spotify:`https://open.spotify.com/track/boundary-${index+1}`}}));
  359 |     const previous=items.filter((_,index)=>![49,99,999].includes(index));
  360 |     previous.unshift(items[99],items[999]);previous.splice(64,0,items[49]);
  361 |     await page.evaluate(async topTracks=>{
  362 |       await new Promise<void>((resolve,reject)=>{
  363 |         const request=indexedDB.open('AnalytifyDB',4);request.onerror=()=>reject(request.error);
  364 |         request.onsuccess=()=>{
  365 |           const db=request.result,transaction=db.transaction('statsHistory','readwrite');
  366 |           for(const userId of ['e2e-user','e2e-user_dev']) transaction.objectStore('statsHistory').put({userId,range:'short_term',
  367 |             timestamp:new Date('2026-10-05T12:00:00Z').getTime(),snapshotDate:'2026-10-05',
  368 |             topTracks,topArtists:[],topGenres:[],isLoaded:true});
  369 |           transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>reject(transaction.error);
  370 |         };
  371 |       });
  372 |     },previous);
  373 |     await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items,total:1000}}));
  374 |     await clearCurrentFixtureStats(page);await page.reload();await page.evaluate(()=>document.fonts.ready);
  375 |     const evidence=[];
  376 |     for(const [rank,name] of names) {
  377 |       await page.getByRole('searchbox',{name:'Search songs or artists'}).fill(name);
  378 |       const row=page.locator('.v2-ranking-row');
  379 |       if(rank===1000) {
  380 |         // Fresh Spotify Stats deliberately caps the deduplicated pool at 100.
  381 |         await expect(row).toHaveCount(0);
  382 |         await expect(page.getByRole('heading',{name:'No top songs found'})).toBeVisible();
  383 |         evidence.push({rank,sourceLimit:100,visibleRows:0});continue;
  384 |       }
  385 |       await expect(row).toHaveCount(1);
  386 |       const caption=rank===50?'↑ 15 places':rank===100?'↓ 99 places':'↓ 998 places';
  387 |       await expect(row.getByRole('group',{name:`Rank ${rank}. ${caption}`,exact:true})).toBeVisible();
  388 |       await expect(row.locator('.rank-number')).toHaveText(String(rank));
  389 |       await expect(row.locator('strong')).toHaveText(name);
  390 |       await expect(row.getByRole('img',{name:'Hot mover',exact:true})).toHaveCount(rank===50?1:0);
  391 |       for(const width of [320,360,390,760,761,768,1024,1440,1920]) for(const height of [480,1080]) {
  392 |         await page.setViewportSize({width,height});await row.scrollIntoViewIfNeeded();
  393 |         const geometry=await row.evaluate(element=>{
  394 |           const bounds=element.getBoundingClientRect(),column=element.querySelector('.rank')!.getBoundingClientRect();
  395 |           const number=element.querySelector('.rank-number')!.getBoundingClientRect();
  396 |           const movement=element.querySelector('.rank-movement')!.getBoundingClientRect();
  397 |           const art=element.querySelector('.artwork')!.getBoundingClientRect();
  398 |           const copy=element.querySelector('.copy')!.getBoundingClientRect();
  399 |           const action=element.querySelector('.history')!.getBoundingClientRect();
  400 |           return {row:bounds.toJSON(),column:column.toJSON(),number:number.toJSON(),movement:movement.toJSON(),
  401 |             ordered:column.right<=art.left&&art.right<=copy.left&&copy.right<=action.left,
  402 |             copyInset:getComputedStyle(element.querySelector('.copy')!).paddingLeft,
  403 |             overflow:document.documentElement.scrollWidth-innerWidth};
  404 |         });
  405 |         expect(geometry.column.width).toBe(76);expect(geometry.column.height).toBe(60);
  406 |         expect(geometry.number.height).toBe(36);expect(geometry.movement.height).toBe(24);
  407 |         expect(geometry.movement.top).toBeCloseTo(geometry.number.bottom,1);
  408 |         expect(geometry.number.left).toBeCloseTo(geometry.column.left+2,1);
  409 |         expect(geometry.movement.left).toBeCloseTo(geometry.number.left,1);
  410 |         expect(geometry.number.right).toBeLessThanOrEqual(geometry.column.right-4);
  411 |         expect(geometry.movement.right).toBeLessThanOrEqual(geometry.column.right-4);
  412 |         expect(geometry.row.height).toBeGreaterThanOrEqual(92);expect(geometry.ordered).toBe(true);
  413 |         expect(geometry.copyInset).toBe(width<=760?'0px':'16px');expect(geometry.overflow).toBeLessThanOrEqual(1);
  414 |         await expectIntrinsicHistory(row.locator('.history'));
  415 |         evidence.push({rank,width,height,...geometry});
  416 |       }
  417 |       if(motion==='reduce') for(const width of [390,1440]) {
  418 |         await page.setViewportSize({width,height:900});
  419 |         await row.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
  420 |         expect(await row.evaluate(element=>{
  421 |           const nav=document.querySelector('.v2-mobile-nav');
  422 |           return !nav?.getClientRects().length || element.getBoundingClientRect().bottom<=nav.getBoundingClientRect().top;
  423 |         })).toBe(true);
> 424 |         await expect(row).toHaveScreenshot(`stats-large-rank-${rank}-${width}.png`,{animations:'disabled'});
      |                           ^ Error: expect(locator).toHaveScreenshot(expected) failed
  425 |       }
  426 |       const history=row.getByRole('button',{name:'View position history for '+name});
  427 |       await history.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
  428 |       await page.keyboard.press('Escape');await expect(history).toBeFocused();
  429 |     }
  430 |     await expectNoBlockingAxeViolations(page);
  431 |     const path=testInfo.outputPath('large-rank-responsive-geometry.json');
  432 |     await writeFile(path,JSON.stringify({motion,evidence},null,2)+'\n');
  433 |     await testInfo.attach('large-rank-responsive-geometry',{path,contentType:'application/json'});
  434 |   });
  435 | 
  436 |   test(`long ranking names grow without clipping controls or keyboard actions with motion ${motion}`, async ({page},testInfo) => {
  437 |     await page.emulateMedia({reducedMotion:motion});
  438 |     const name='An exceptionally long song title with several meaningful words and an extended version subtitle';
  439 |     const artist='A long artist collaboration with additional featured performers';
  440 |     await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items:[
  441 |       {...currentTracks[1],name,artists:[{id:'artist',name:artist}]}
  442 |     ],total:1}}));
  443 |     await clearCurrentFixtureStats(page);
  444 |     await page.reload();
  445 |     const row=page.locator('.v2-ranking-row');
  446 |     await expect(row).toHaveCount(1);
  447 |     await expect(row.locator('strong')).toHaveText(name);
  448 |     const evidence=[];
  449 |     for(const width of [320,360,390,768,1024,1440,1920]) for(const height of [480,1080]) {
  450 |       await page.setViewportSize({width,height});
  451 |       const geometry=await row.evaluate(element=>{
  452 |         const bounds=element.getBoundingClientRect();
  453 |         const copy=element.querySelector('.copy')!.getBoundingClientRect();
  454 |         const art=element.querySelector('.artwork')!.getBoundingClientRect();
  455 |         const history=element.querySelector('.history')!.getBoundingClientRect();
  456 |         const style=getComputedStyle(element.querySelector('.copy')!);
  457 |         return {height:bounds.height,paddingBelowCopy:bounds.bottom-copy.bottom,paddingAboveCopy:copy.top-bounds.top,
  458 |           ordered:art.right<=copy.left&&copy.right<=history.left,
  459 |           overflow:document.documentElement.scrollWidth-innerWidth,
  460 |           copyOverflow:style.overflowY,textOverflow:style.textOverflow,
  461 |           artwork:{width:art.width,height:art.height},history:{width:history.width,height:history.height}};
  462 |       });
  463 |       expect(geometry.height).toBeGreaterThanOrEqual(80);
  464 |       expect(geometry.paddingBelowCopy).toBeGreaterThanOrEqual(15.9);
  465 |       expect(geometry.paddingAboveCopy).toBeGreaterThanOrEqual(15.9);
  466 |       expect(geometry.ordered).toBe(true);
  467 |       expect(geometry.overflow).toBeLessThanOrEqual(1);
  468 |       expect(geometry.copyOverflow).toBe('visible');expect(geometry.textOverflow).toBe('clip');
  469 |       expect(geometry.artwork).toEqual({width:48,height:48});
  470 |       await expectIntrinsicHistory(row.locator('.history'));
  471 |       await expect(row.locator('strong')).toHaveText(name);
  472 |       await expect(row.locator('.copy span')).toContainText(artist);
  473 |       evidence.push({width,height,...geometry});
  474 |     }
  475 |     await page.setViewportSize({width:320,height:480});
  476 |     const history=row.getByRole('button',{name:'View position history for '+name});
  477 |     await history.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
  478 |     await page.keyboard.press('Escape');await expect(history).toBeFocused();
  479 |     await page.keyboard.press('Shift+Tab');
  480 |     await expect(row.getByRole('button',{name:'Open '+name+' on Spotify'})).toBeFocused();
  481 |     await expectNoBlockingAxeViolations(page);
  482 |     const reflowPath=testInfo.outputPath('long-row-reflow.json');
  483 |     await writeFile(reflowPath,JSON.stringify({motion,evidence},null,2)+'\n');
  484 |     await testInfo.attach('long-row-reflow.json',{path:reflowPath,contentType:'application/json'});
  485 |   });
  486 | }
  487 | 
```