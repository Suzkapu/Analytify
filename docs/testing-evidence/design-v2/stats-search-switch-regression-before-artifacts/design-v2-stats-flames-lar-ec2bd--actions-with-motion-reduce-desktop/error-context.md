# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-flames.spec.ts >> large original ranks wrap movement without shifting actions with motion reduce
- Location: e2e/design-v2-stats-flames.spec.ts:441:7

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('.v2-ranking-row')
  475 pixels (ratio 0.02 of all image pixels) are different.

  Snapshot: stats-large-rank-50-390.png

Call log:
  - Expect "toHaveScreenshot(stats-large-rank-50-390.png)" locator('.v2-ranking-row') with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('.v2-ranking-row')
    - locator resolved to <v2-stats-ranking-row kind="tracks" class="v2-ranking-row" _nghost-ng-c2140563739="" _ngcontent-ng-c3382161913="">…</v2-stats-ranking-row>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 475 pixels (ratio 0.02 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('.v2-ranking-row')
    - locator resolved to <v2-stats-ranking-row kind="tracks" class="v2-ranking-row" _nghost-ng-c2140563739="" _ngcontent-ng-c3382161913="">…</v2-stats-ranking-row>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - 475 pixels (ratio 0.02 of all image pixels) are different.

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
          - switch "Search past rankings" [ref=f2e51] [cursor=pointer]
        - generic [ref=f2e56]:
          - group "Rank 50. ↑ 15 places" [ref=f2e57]:
            - img "Hot mover" [ref=f2e59]
            - generic [aria-hidden] [ref=f2e61]: "50"
            - generic [aria-hidden] [ref=f2e62]: ↑ 15
          - button "Open Paper Planes on Spotify" [ref=f2e63] [cursor=pointer]:
            - img "Paper Planes cover" [ref=f2e64]
          - generic [ref=f2e65]:
            - strong [ref=f2e66]: Paper Planes
            - generic [ref=f2e67]: Luma
          - button "View position history for Paper Planes" [ref=f2e68] [cursor=pointer]: History
        - button " Create playlist" [ref=f2e69] [cursor=pointer]:
          - generic [ref=f2e70]: 
          - text: Create playlist
  - navigation "Primary navigation" [ref=f2e71]:
    - link "Playlists" [ref=f2e72] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f2e73]: 
    - link "Stats" [ref=f2e75] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f2e76]: 
    - link "History" [ref=f2e78] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f2e79]: 
  - contentinfo [ref=f2e81]:
    - generic [ref=f2e82]: Powered by Spotify
    - generic [ref=f2e83]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e84] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
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
  437 |   await expectNoBlockingAxeViolations(page);
  438 | });
  439 | 
  440 | for (const motion of ['no-preference','reduce'] as const) {
  441 |   test(`large original ranks wrap movement without shifting actions with motion ${motion}`, async ({page},testInfo) => {
  442 |     await page.emulateMedia({reducedMotion:motion});
  443 |     await mockCanonicalArtwork(page);
  444 |     const names=new Map([[50,'Paper Planes'],[100,'A remarkably long song title that remains readable at every playlist width'],[1000,'Thousandth boundary item']]);
  445 |     const items=Array.from({length:1000},(_,index)=>({...tracks[0],id:`boundary-${index+1}`,
  446 |       name:names.get(index+1) ?? `Boundary item ${index+1}`,album:{images:[{url:canonicalArtworkUrl}]},
  447 |       artists:[{id:'artist',name:index===49?'Luma':index===99?'Luma, Atlas North and featured collaborators':'Example Artist'}],
  448 |       external_urls:{spotify:`https://open.spotify.com/track/boundary-${index+1}`}}));
  449 |     const previous=items.filter((_,index)=>![49,99,999].includes(index));
  450 |     previous.unshift(items[99],items[999]);previous.splice(64,0,items[49]);
  451 |     await page.evaluate(async topTracks=>{
  452 |       await new Promise<void>((resolve,reject)=>{
  453 |         const request=indexedDB.open('AnalytifyDB',4);request.onerror=()=>reject(request.error);
  454 |         request.onsuccess=()=>{
  455 |           const db=request.result,transaction=db.transaction('statsHistory','readwrite');
  456 |           for(const userId of ['e2e-user','e2e-user_dev']) transaction.objectStore('statsHistory').put({userId,range:'short_term',
  457 |             timestamp:new Date('2026-10-05T12:00:00Z').getTime(),snapshotDate:'2026-10-05',
  458 |             topTracks,topArtists:[],topGenres:[],isLoaded:true});
  459 |           transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>reject(transaction.error);
  460 |         };
  461 |       });
  462 |     },previous);
  463 |     await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items,total:1000}}));
  464 |     await clearCurrentFixtureStats(page);await page.reload();await page.evaluate(()=>document.fonts.ready);
  465 |     const evidence=[];
  466 |     for(const [rank,name] of names) {
  467 |       await page.getByRole('searchbox',{name:'Search songs or artists'}).fill(name);
  468 |       const row=page.locator('.v2-ranking-row');
  469 |       if(rank===1000) {
  470 |         // Fresh Spotify Stats deliberately caps the deduplicated pool at 100.
  471 |         await expect(row).toHaveCount(0);
  472 |         await expect(page.getByRole('heading',{name:'No top songs found'})).toBeVisible();
  473 |         evidence.push({rank,sourceLimit:100,visibleRows:0});continue;
  474 |       }
  475 |       await expect(row).toHaveCount(1);
  476 |       const caption=rank===50?'↑ 15 places':rank===100?'↓ 99 places':'↓ 998 places';
  477 |       await expect(row.getByRole('group',{name:`Rank ${rank}. ${caption}`,exact:true})).toBeVisible();
  478 |       await expect(row.locator('.rank-number')).toHaveText(String(rank));
  479 |       await expect(row.locator('strong')).toHaveText(name);
  480 |       await expect(row.getByRole('img',{name:'Hot mover',exact:true})).toHaveCount(rank===50?1:0);
  481 |       for(const width of [320,360,390,760,761,768,1024,1440,1920]) for(const height of [480,1080]) {
  482 |         await page.setViewportSize({width,height});await row.scrollIntoViewIfNeeded();
  483 |         const geometry=await row.evaluate(element=>{
  484 |           const bounds=element.getBoundingClientRect(),column=element.querySelector('.rank')!.getBoundingClientRect();
  485 |           const number=element.querySelector('.rank-number')!.getBoundingClientRect();
  486 |           const movement=element.querySelector('.rank-movement')!.getBoundingClientRect();
  487 |           const art=element.querySelector('.artwork')!.getBoundingClientRect();
  488 |           const copy=element.querySelector('.copy')!.getBoundingClientRect();
  489 |           const action=element.querySelector('.history')!.getBoundingClientRect();
  490 |           return {row:bounds.toJSON(),column:column.toJSON(),number:number.toJSON(),movement:movement.toJSON(),
  491 |             ordered:column.right<=art.left&&art.right<=copy.left&&copy.right<=action.left,
  492 |             copyInset:getComputedStyle(element.querySelector('.copy')!).paddingLeft,
  493 |             overflow:document.documentElement.scrollWidth-innerWidth};
  494 |         });
  495 |         expect(geometry.column.width).toBe(76);expect(geometry.column.height).toBe(60);
  496 |         expect(geometry.number.height).toBe(36);expect(geometry.movement.height).toBe(24);
  497 |         expect(geometry.movement.top).toBeCloseTo(geometry.number.bottom,1);
  498 |         expect(geometry.number.left).toBeCloseTo(geometry.column.left+2,1);
  499 |         expect(geometry.movement.left).toBeCloseTo(geometry.number.left,1);
  500 |         expect(geometry.number.right).toBeLessThanOrEqual(geometry.column.right-4);
  501 |         expect(geometry.movement.right).toBeLessThanOrEqual(geometry.column.right-4);
  502 |         expect(geometry.row.height).toBeGreaterThanOrEqual(92);expect(geometry.ordered).toBe(true);
  503 |         expect(geometry.copyInset).toBe(width<=760?'0px':'16px');expect(geometry.overflow).toBeLessThanOrEqual(1);
  504 |         await expectIntrinsicHistory(row.locator('.history'));
  505 |         evidence.push({rank,width,height,...geometry});
  506 |       }
  507 |       if(motion==='reduce') for(const width of [390,1440]) {
  508 |         await page.setViewportSize({width,height:900});
  509 |         await row.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
  510 |         expect(await row.evaluate(element=>{
  511 |           const nav=document.querySelector('.v2-mobile-nav');
  512 |           return !nav?.getClientRects().length || element.getBoundingClientRect().bottom<=nav.getBoundingClientRect().top;
  513 |         })).toBe(true);
> 514 |         await expect(row).toHaveScreenshot(`stats-large-rank-${rank}-${width}.png`,{animations:'disabled'});
      |                           ^ Error: expect(locator).toHaveScreenshot(expected) failed
  515 |       }
  516 |       const history=row.getByRole('button',{name:'View position history for '+name});
  517 |       await history.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
  518 |       await page.keyboard.press('Escape');await expect(history).toBeFocused();
  519 |     }
  520 |     await expectNoBlockingAxeViolations(page);
  521 |     const path=testInfo.outputPath('large-rank-responsive-geometry.json');
  522 |     await writeFile(path,JSON.stringify({motion,evidence},null,2)+'\n');
  523 |     await testInfo.attach('large-rank-responsive-geometry',{path,contentType:'application/json'});
  524 |   });
  525 | 
  526 |   test(`long ranking names grow without clipping controls or keyboard actions with motion ${motion}`, async ({page},testInfo) => {
  527 |     await page.emulateMedia({reducedMotion:motion});
  528 |     const name='An exceptionally long song title with several meaningful words and an extended version subtitle';
  529 |     const artist='A long artist collaboration with additional featured performers';
  530 |     await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items:[
  531 |       {...currentTracks[1],name,artists:[{id:'artist',name:artist}]}
  532 |     ],total:1}}));
  533 |     await clearCurrentFixtureStats(page);
  534 |     await page.reload();
  535 |     const row=page.locator('.v2-ranking-row');
  536 |     await expect(row).toHaveCount(1);
  537 |     await expect(row.locator('strong')).toHaveText(name);
  538 |     const evidence=[];
  539 |     for(const width of [320,360,390,768,1024,1440,1920]) for(const height of [480,1080]) {
  540 |       await page.setViewportSize({width,height});
  541 |       const geometry=await row.evaluate(element=>{
  542 |         const bounds=element.getBoundingClientRect();
  543 |         const copy=element.querySelector('.copy')!.getBoundingClientRect();
  544 |         const art=element.querySelector('.artwork')!.getBoundingClientRect();
  545 |         const history=element.querySelector('.history')!.getBoundingClientRect();
  546 |         const style=getComputedStyle(element.querySelector('.copy')!);
  547 |         return {height:bounds.height,paddingBelowCopy:bounds.bottom-copy.bottom,paddingAboveCopy:copy.top-bounds.top,
  548 |           ordered:art.right<=copy.left&&copy.right<=history.left,
  549 |           overflow:document.documentElement.scrollWidth-innerWidth,
  550 |           copyOverflow:style.overflowY,textOverflow:style.textOverflow,
  551 |           artwork:{width:art.width,height:art.height},history:{width:history.width,height:history.height}};
  552 |       });
  553 |       expect(geometry.height).toBeGreaterThanOrEqual(80);
  554 |       expect(geometry.paddingBelowCopy).toBeGreaterThanOrEqual(15.9);
  555 |       expect(geometry.paddingAboveCopy).toBeGreaterThanOrEqual(15.9);
  556 |       expect(geometry.ordered).toBe(true);
  557 |       expect(geometry.overflow).toBeLessThanOrEqual(1);
  558 |       expect(geometry.copyOverflow).toBe('visible');expect(geometry.textOverflow).toBe('clip');
  559 |       expect(geometry.artwork).toEqual({width:48,height:48});
  560 |       await expectIntrinsicHistory(row.locator('.history'));
  561 |       await expect(row.locator('strong')).toHaveText(name);
  562 |       await expect(row.locator('.copy span')).toContainText(artist);
  563 |       evidence.push({width,height,...geometry});
  564 |     }
  565 |     await page.setViewportSize({width:320,height:480});
  566 |     const history=row.getByRole('button',{name:'View position history for '+name});
  567 |     await history.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
  568 |     await page.keyboard.press('Escape');await expect(history).toBeFocused();
  569 |     await page.keyboard.press('Shift+Tab');
  570 |     await expect(row.getByRole('button',{name:'Open '+name+' on Spotify'})).toBeFocused();
  571 |     await expectNoBlockingAxeViolations(page);
  572 |     const reflowPath=testInfo.outputPath('long-row-reflow.json');
  573 |     await writeFile(reflowPath,JSON.stringify({motion,evidence},null,2)+'\n');
  574 |     await testInfo.attach('long-row-reflow.json',{path:reflowPath,contentType:'application/json'});
  575 |   });
  576 | }
  577 | 
```