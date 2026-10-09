# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-flames.spec.ts >> large original ranks wrap movement without shifting actions with motion reduce
- Location: e2e/design-v2-stats-flames.spec.ts:444:7

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('.v2-ranking-row')
  Expected an image 358px by 93px, received 358px by 92px. 190 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: stats-large-rank-50-390.png

Call log:
  - Expect "toHaveScreenshot(stats-large-rank-50-390.png)" locator('.v2-ranking-row') with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('.v2-ranking-row')
    - locator resolved to <v2-stats-ranking-row kind="tracks" class="v2-ranking-row" _nghost-ng-c2140563739="" _ngcontent-ng-c3723836485="">…</v2-stats-ranking-row>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - Expected an image 358px by 93px, received 358px by 92px. 190 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('.v2-ranking-row')
    - locator resolved to <v2-stats-ranking-row kind="tracks" class="v2-ranking-row" _nghost-ng-c2140563739="" _ngcontent-ng-c3723836485="">…</v2-stats-ranking-row>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - Expected an image 358px by 93px, received 358px by 92px. 190 pixels (ratio 0.01 of all image pixels) are different.

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
              - searchbox "Search songs or artists" [active] [ref=f2e54]: Paper Planes
          - button "Compare dates" [ref=f2e55] [cursor=pointer]
          - switch "Search past rankings" [ref=f2e58] [cursor=pointer]
        - region "Rankings" [ref=f2e62]:
          - heading "Top songs" [level=2] [ref=f2e63]
          - generic [ref=f2e65]:
            - group "Rank 50. ↑ 15 places" [ref=f2e66]:
              - img "Hot mover" [ref=f2e68]
              - generic [aria-hidden] [ref=f2e70]: "50"
              - generic [aria-hidden] [ref=f2e71]: ↑ 15
            - button "Open Paper Planes on Spotify" [ref=f2e72] [cursor=pointer]:
              - img "Paper Planes cover" [ref=f2e73]
            - generic [ref=f2e74]:
              - strong [ref=f2e75]: Paper Planes
              - generic [ref=f2e76]: Luma
            - button "View position history for Paper Planes" [ref=f2e77] [cursor=pointer]: History
          - button "Create playlist from these songs" [ref=f2e79] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e80]: 
            - text: Create playlist from these songs
  - navigation "Primary navigation" [ref=f2e81]:
    - link "Playlists" [ref=f2e82] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f2e83]: 
    - link "Stats" [ref=f2e85] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f2e86]: 
    - link "History" [ref=f2e88] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f2e89]: 
  - contentinfo [ref=f2e91]:
    - generic [ref=f2e92]: Powered by Spotify
    - generic [ref=f2e93]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e94] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
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
  497 |         });
  498 |         expect(geometry.column.width).toBe(76);expect(geometry.column.height).toBe(60);
  499 |         expect(geometry.number.height).toBe(36);expect(geometry.movement.height).toBe(24);
  500 |         expect(geometry.movement.top).toBeCloseTo(geometry.number.bottom,1);
  501 |         expect(geometry.number.left).toBeCloseTo(geometry.column.left+2,1);
  502 |         expect(geometry.movement.left).toBeCloseTo(geometry.number.left,1);
  503 |         expect(geometry.number.right).toBeLessThanOrEqual(geometry.column.right-4);
  504 |         expect(geometry.movement.right).toBeLessThanOrEqual(geometry.column.right-4);
  505 |         expect(geometry.row.height).toBeGreaterThanOrEqual(92);expect(geometry.ordered).toBe(true);
  506 |         expect(geometry.copyInset).toBe(width<=760?'0px':'16px');expect(geometry.overflow).toBeLessThanOrEqual(1);
  507 |         await expectIntrinsicHistory(row.locator('.history'));
  508 |         evidence.push({rank,width,height,...geometry});
  509 |       }
  510 |       if(motion==='reduce') for(const width of [390,1440]) {
  511 |         await page.setViewportSize({width,height:900});
  512 |         await row.evaluate(element=>element.scrollIntoView({block:'center',behavior:'instant'}));
  513 |         expect(await row.evaluate(element=>{
  514 |           const nav=document.querySelector('.v2-mobile-nav');
  515 |           return !nav?.getClientRects().length || element.getBoundingClientRect().bottom<=nav.getBoundingClientRect().top;
  516 |         })).toBe(true);
> 517 |         await expect(row).toHaveScreenshot(`stats-large-rank-${rank}-${width}.png`,{animations:'disabled'});
      |                           ^ Error: expect(locator).toHaveScreenshot(expected) failed
  518 |       }
  519 |       const history=row.getByRole('button',{name:'View position history for '+name});
  520 |       await history.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
  521 |       await page.keyboard.press('Escape');await expect(history).toBeFocused();
  522 |     }
  523 |     await expectNoBlockingAxeViolations(page);
  524 |     const path=testInfo.outputPath('large-rank-responsive-geometry.json');
  525 |     await writeFile(path,JSON.stringify({motion,evidence},null,2)+'\n');
  526 |     await testInfo.attach('large-rank-responsive-geometry',{path,contentType:'application/json'});
  527 |   });
  528 | 
  529 |   test(`long ranking names grow without clipping controls or keyboard actions with motion ${motion}`, async ({page},testInfo) => {
  530 |     await page.emulateMedia({reducedMotion:motion});
  531 |     const name='An exceptionally long song title with several meaningful words and an extended version subtitle';
  532 |     const artist='A long artist collaboration with additional featured performers';
  533 |     await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items:[
  534 |       {...currentTracks[1],name,artists:[{id:'artist',name:artist}]}
  535 |     ],total:1}}));
  536 |     await clearCurrentFixtureStats(page);
  537 |     await page.reload();
  538 |     const row=page.locator('.v2-ranking-row');
  539 |     await expect(row).toHaveCount(1);
  540 |     await expect(row.locator('strong')).toHaveText(name);
  541 |     const evidence=[];
  542 |     for(const width of [320,360,390,768,1024,1440,1920]) for(const height of [480,1080]) {
  543 |       await page.setViewportSize({width,height});
  544 |       const geometry=await row.evaluate(element=>{
  545 |         const bounds=element.getBoundingClientRect();
  546 |         const copy=element.querySelector('.copy')!.getBoundingClientRect();
  547 |         const art=element.querySelector('.artwork')!.getBoundingClientRect();
  548 |         const history=element.querySelector('.history')!.getBoundingClientRect();
  549 |         const style=getComputedStyle(element.querySelector('.copy')!);
  550 |         return {height:bounds.height,paddingBelowCopy:bounds.bottom-copy.bottom,paddingAboveCopy:copy.top-bounds.top,
  551 |           ordered:art.right<=copy.left&&copy.right<=history.left,
  552 |           overflow:document.documentElement.scrollWidth-innerWidth,
  553 |           copyOverflow:style.overflowY,textOverflow:style.textOverflow,
  554 |           artwork:{width:art.width,height:art.height},history:{width:history.width,height:history.height}};
  555 |       });
  556 |       expect(geometry.height).toBeGreaterThanOrEqual(80);
  557 |       expect(geometry.paddingBelowCopy).toBeGreaterThanOrEqual(15.9);
  558 |       expect(geometry.paddingAboveCopy).toBeGreaterThanOrEqual(15.9);
  559 |       expect(geometry.ordered).toBe(true);
  560 |       expect(geometry.overflow).toBeLessThanOrEqual(1);
  561 |       expect(geometry.copyOverflow).toBe('visible');expect(geometry.textOverflow).toBe('clip');
  562 |       expect(geometry.artwork).toEqual({width:48,height:48});
  563 |       await expectIntrinsicHistory(row.locator('.history'));
  564 |       await expect(row.locator('strong')).toHaveText(name);
  565 |       await expect(row.locator('.copy span')).toContainText(artist);
  566 |       evidence.push({width,height,...geometry});
  567 |     }
  568 |     await page.setViewportSize({width:320,height:480});
  569 |     const history=row.getByRole('button',{name:'View position history for '+name});
  570 |     await history.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
  571 |     await page.keyboard.press('Escape');await expect(history).toBeFocused();
  572 |     await page.keyboard.press('Shift+Tab');
  573 |     await expect(row.getByRole('button',{name:'Open '+name+' on Spotify'})).toBeFocused();
  574 |     await expectNoBlockingAxeViolations(page);
  575 |     const reflowPath=testInfo.outputPath('long-row-reflow.json');
  576 |     await writeFile(reflowPath,JSON.stringify({motion,evidence},null,2)+'\n');
  577 |     await testInfo.attach('long-row-reflow.json',{path:reflowPath,contentType:'application/json'});
  578 |   });
  579 | }
  580 | 
```