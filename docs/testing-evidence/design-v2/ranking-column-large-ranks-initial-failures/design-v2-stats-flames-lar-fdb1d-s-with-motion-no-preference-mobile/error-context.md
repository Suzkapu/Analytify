# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-flames.spec.ts >> large original ranks wrap movement without shifting actions with motion no-preference
- Location: e2e/design-v2-stats-flames.spec.ts:341:7

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('.v2-ranking-row')
Expected: 1
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" locator('.v2-ranking-row') with timeout 5000ms
  - waiting for locator('.v2-ranking-row')
    14 × locator resolved to 0 elements
       - unexpected value "0"

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
        - button "Songs" [pressed] [ref=f2e39] [cursor=pointer]
        - button "Artists" [ref=f2e40] [cursor=pointer]
        - button "Genres" [ref=f2e41] [cursor=pointer]
      - group "Statistics controls" [ref=f2e44]:
        - group "Ranking period" [ref=f2e46]:
          - button "4 weeks" [pressed] [ref=f2e47] [cursor=pointer]
          - button "6 months" [ref=f2e48] [cursor=pointer]
          - button "1 year" [ref=f2e49] [cursor=pointer]
        - generic [ref=f2e50]:
          - text: Ranking date
          - combobox "Ranking date" [ref=f2e51] [cursor=pointer]:
            - option "Current" [selected]
            - option "Oct 5, 2026"
        - generic [ref=f2e52]:
          - text: Compare against
          - combobox "Compare against" [ref=f2e53] [cursor=pointer]:
            - option "Previous available date"
            - option "Oct 5, 2026" [selected]
      - generic [ref=f2e54]:
        - group "Search rankings" [ref=f2e56]:
          - generic [ref=f2e58]:
            - generic [ref=f2e59]: Search songs or artists
            - generic [ref=f2e60]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [active] [ref=f2e61]: Thousandth boundary item
          - button "Search past" [ref=f2e62] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e63]: 
            - text: Search past
        - generic "No top songs found" [ref=f2e64]:
          - status [ref=f2e65]:
            - generic [aria-hidden] [ref=f2e66]: 
            - heading "No top songs found" [level=2] [ref=f2e67]
            - paragraph [ref=f2e68]: Try another search, date, or ranking period.
  - text:   
  - contentinfo [ref=f2e69]:
    - generic [ref=f2e70]: Powered by Spotify
    - generic [ref=f2e71]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e72] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  266 |       await expect(history).toHaveCSS('border-top-color','rgb(52, 66, 58)');
  267 |       await expect(history).toHaveCSS('border-top-width','1px');
  268 |       const initial=await history.boundingBox();
  269 |       expect(initial?.height).toBe(44);await expectIntrinsicHistory(history);
  270 |       await history.hover();
  271 |       await expect(history).toHaveCSS('background-color','rgb(24, 32, 25)');
  272 |       await expect(history).toHaveCSS('border-top-color','rgb(107, 125, 113)');
  273 |       expect(await history.boundingBox()).toEqual(initial);
  274 |       await artwork.focus();await artwork.press('Tab');
  275 |       await expect(history).toBeFocused();
  276 |       await expect(history).toHaveCSS('border-top-width','2px');
  277 |       await expect(history).toHaveCSS('border-top-color','rgb(159, 255, 200)');
  278 |       await expect(history).toHaveCSS('background-color','rgb(18, 24, 20)');
  279 |       await expect(history).toHaveCSS('outline-style','none');
  280 |       await history.hover();
  281 |       await expect(history).toHaveCSS('border-top-width','2px');
  282 |       await expect(history).toHaveCSS('background-color','rgb(18, 24, 20)');
  283 |       expect(await history.boundingBox()).toEqual(initial);
  284 |       await history.press('Enter');
  285 |       await expect(page.getByRole('dialog',{name:'Paper Planes position history'})).toBeVisible();
  286 |       await page.keyboard.press('Escape');
  287 |       await expect(page.getByRole('dialog')).toHaveCount(0);
  288 |       await expect(history).toBeFocused();
  289 |       await expect(history).toHaveCSS('border-top-width','2px');
  290 |       await expectNoBlockingAxeViolations(page);
  291 |       await artwork.focus();await page.mouse.move(0,0);
  292 |       await expect(history).toHaveCSS('background-color','rgb(13, 19, 15)');
  293 |       await expect(history).toHaveScreenshot(`stats-history-action-default-${width}.png`,{animations:'disabled'});
  294 |       await history.hover();
  295 |       await expect(history).toHaveCSS('background-color','rgb(24, 32, 25)');
  296 |       await expect(history).toHaveScreenshot(`stats-history-action-hover-${width}.png`,{animations:'disabled'});
  297 |       await artwork.focus();await artwork.press('Tab');
  298 |       await expect(history).toHaveCSS('border-top-width','2px');
  299 |       await expect(history).toHaveScreenshot(`stats-history-action-focus-${width}.png`,{animations:'disabled'});
  300 |       const path=testInfo.outputPath('history-action-state-geometry.json');
  301 |       await writeFile(path,JSON.stringify({width,initial,final:await history.boundingBox()},null,2)+'\n');
  302 |       await testInfo.attach('history-action-state-geometry',{path,contentType:'application/json'});
  303 |     });
  304 |   }
  305 | 
  306 | });
  307 | 
  308 | test('song ranking artwork and History follow the canonical independent action workflow', async ({page}) => {
  309 |   await page.setViewportSize({width:390,height:900});
  310 |   await page.getByRole('searchbox',{name:'Search songs or artists'}).fill('Known song 16');
  311 |   const row=page.locator('.v2-ranking-row');
  312 |   const artwork=row.getByRole('button',{name:'Open Known song 16 on Spotify'});
  313 |   const history=row.getByRole('button',{name:'View position history for Known song 16'});
  314 |   await expect(artwork).toHaveCSS('width','48px');
  315 |   await expect(artwork).toHaveCSS('height','48px');
  316 |   await expect(history).toHaveText('History');
  317 |   await expectIntrinsicHistory(history);
  318 |   await expect(row.locator('strong')).toHaveText('Known song 16');
  319 |   await expect(row.locator('.copy span')).toHaveText('Example Artist');
  320 |   await expect(row.getByRole('group',{name:'Rank 2. ↑ 15 places',exact:true})).toBeVisible();
  321 |   await history.press('Enter');
  322 |   await expect(page.getByRole('dialog')).toBeVisible();
  323 |   await page.keyboard.press('Escape');
  324 |   await expect(history).toBeFocused();
  325 |   await page.keyboard.press('Shift+Tab');
  326 |   await expect(artwork).toBeFocused();
  327 |   const before=await artwork.boundingBox();
  328 |   await expect(artwork).toHaveCSS('border-top-color','rgb(53, 231, 131)');
  329 |   await expect(artwork).toHaveCSS('border-top-width','3px');
  330 |   await artwork.hover();
  331 |   expect(await artwork.boundingBox()).toEqual(before);
  332 |   await history.focus();
  333 |   await expect(artwork).toHaveCSS('border-top-color','rgb(53, 231, 131)');
  334 |   await expect(artwork).toHaveCSS('border-top-width','2px');
  335 |   expect(await artwork.boundingBox()).toEqual(before);
  336 |   await expect(page.getByRole('dialog')).toHaveCount(0);
  337 |   await expectNoBlockingAxeViolations(page);
  338 | });
  339 | 
  340 | for (const motion of ['no-preference','reduce'] as const) {
  341 |   test(`large original ranks wrap movement without shifting actions with motion ${motion}`, async ({page},testInfo) => {
  342 |     await page.emulateMedia({reducedMotion:motion});
  343 |     const names=new Map([[50,'Fiftieth boundary item'],[100,'Hundredth boundary item'],[1000,'Thousandth boundary item']]);
  344 |     const items=Array.from({length:1000},(_,index)=>({...tracks[0],id:`boundary-${index+1}`,
  345 |       name:names.get(index+1) ?? `Boundary item ${index+1}`,
  346 |       external_urls:{spotify:`https://open.spotify.com/track/boundary-${index+1}`}}));
  347 |     const previous=items.filter((_,index)=>![49,99,999].includes(index));
  348 |     previous.unshift(items[99],items[999]);previous.splice(64,0,items[49]);
  349 |     await page.evaluate(async topTracks=>{
  350 |       await new Promise<void>((resolve,reject)=>{
  351 |         const request=indexedDB.open('AnalytifyDB',4);request.onerror=()=>reject(request.error);
  352 |         request.onsuccess=()=>{
  353 |           const db=request.result,transaction=db.transaction('statsHistory','readwrite');
  354 |           for(const userId of ['e2e-user','e2e-user_dev']) transaction.objectStore('statsHistory').put({userId,range:'short_term',
  355 |             timestamp:new Date('2026-10-05T12:00:00Z').getTime(),snapshotDate:'2026-10-05',
  356 |             topTracks,topArtists:[],topGenres:[],isLoaded:true});
  357 |           transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>reject(transaction.error);
  358 |         };
  359 |       });
  360 |     },previous);
  361 |     await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items,total:1000}}));
  362 |     await clearCurrentFixtureStats(page);await page.reload();await page.evaluate(()=>document.fonts.ready);
  363 |     const evidence=[];
  364 |     for(const [rank,name] of names) {
  365 |       await page.getByRole('searchbox',{name:'Search songs or artists'}).fill(name);
> 366 |       const row=page.locator('.v2-ranking-row');await expect(row).toHaveCount(1);
      |                                                                   ^ Error: expect(locator).toHaveCount(expected) failed
  367 |       const caption=rank===50?'↑ 15 places':rank===100?'↓ 99 places':'↓ 998 places';
  368 |       await expect(row.getByRole('group',{name:`Rank ${rank}. ${caption}`,exact:true})).toBeVisible();
  369 |       await expect(row.locator('.rank-number')).toHaveText(String(rank));
  370 |       await expect(row.locator('strong')).toHaveText(name);
  371 |       for(const width of [320,360,390,760,761,768,1024,1440,1920]) for(const height of [480,1080]) {
  372 |         await page.setViewportSize({width,height});await row.scrollIntoViewIfNeeded();
  373 |         const geometry=await row.evaluate(element=>{
  374 |           const bounds=element.getBoundingClientRect(),column=element.querySelector('.rank')!.getBoundingClientRect();
  375 |           const number=element.querySelector('.rank-number')!.getBoundingClientRect();
  376 |           const movement=element.querySelector('.rank-movement')!.getBoundingClientRect();
  377 |           const art=element.querySelector('.artwork')!.getBoundingClientRect();
  378 |           const copy=element.querySelector('.copy')!.getBoundingClientRect();
  379 |           const action=element.querySelector('.history')!.getBoundingClientRect();
  380 |           return {row:bounds.toJSON(),column:column.toJSON(),number:number.toJSON(),movement:movement.toJSON(),
  381 |             ordered:column.right<=art.left&&art.right<=copy.left&&copy.right<=action.left,
  382 |             copyInset:getComputedStyle(element.querySelector('.copy')!).paddingLeft,
  383 |             overflow:document.documentElement.scrollWidth-innerWidth};
  384 |         });
  385 |         expect(geometry.column.width).toBe(76);expect(geometry.column.height).toBe(60);
  386 |         expect(geometry.number.height).toBe(36);expect(geometry.movement.height).toBe(24);
  387 |         expect(geometry.movement.top).toBeCloseTo(geometry.number.bottom,1);
  388 |         expect(geometry.number.left).toBeCloseTo(geometry.column.left+2,1);
  389 |         expect(geometry.movement.left).toBeCloseTo(geometry.number.left,1);
  390 |         expect(geometry.number.right).toBeLessThanOrEqual(geometry.column.right-4);
  391 |         expect(geometry.movement.right).toBeLessThanOrEqual(geometry.column.right-4);
  392 |         expect(geometry.row.height).toBeGreaterThanOrEqual(92);expect(geometry.ordered).toBe(true);
  393 |         expect(geometry.copyInset).toBe(width<=760?'0px':'16px');expect(geometry.overflow).toBeLessThanOrEqual(1);
  394 |         await expectIntrinsicHistory(row.locator('.history'));
  395 |         evidence.push({rank,width,height,...geometry});
  396 |       }
  397 |       const history=row.getByRole('button',{name:'View position history for '+name});
  398 |       await history.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
  399 |       await page.keyboard.press('Escape');await expect(history).toBeFocused();
  400 |     }
  401 |     await expectNoBlockingAxeViolations(page);
  402 |     const path=testInfo.outputPath('large-rank-responsive-geometry.json');
  403 |     await writeFile(path,JSON.stringify({motion,evidence},null,2)+'\n');
  404 |     await testInfo.attach('large-rank-responsive-geometry',{path,contentType:'application/json'});
  405 |   });
  406 | 
  407 |   test(`long ranking names grow without clipping controls or keyboard actions with motion ${motion}`, async ({page},testInfo) => {
  408 |     await page.emulateMedia({reducedMotion:motion});
  409 |     const name='An exceptionally long song title with several meaningful words and an extended version subtitle';
  410 |     const artist='A long artist collaboration with additional featured performers';
  411 |     await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items:[
  412 |       {...currentTracks[1],name,artists:[{id:'artist',name:artist}]}
  413 |     ],total:1}}));
  414 |     await clearCurrentFixtureStats(page);
  415 |     await page.reload();
  416 |     const row=page.locator('.v2-ranking-row');
  417 |     await expect(row).toHaveCount(1);
  418 |     await expect(row.locator('strong')).toHaveText(name);
  419 |     const evidence=[];
  420 |     for(const width of [320,360,390,768,1024,1440,1920]) for(const height of [480,1080]) {
  421 |       await page.setViewportSize({width,height});
  422 |       const geometry=await row.evaluate(element=>{
  423 |         const bounds=element.getBoundingClientRect();
  424 |         const copy=element.querySelector('.copy')!.getBoundingClientRect();
  425 |         const art=element.querySelector('.artwork')!.getBoundingClientRect();
  426 |         const history=element.querySelector('.history')!.getBoundingClientRect();
  427 |         const style=getComputedStyle(element.querySelector('.copy')!);
  428 |         return {height:bounds.height,paddingBelowCopy:bounds.bottom-copy.bottom,paddingAboveCopy:copy.top-bounds.top,
  429 |           ordered:art.right<=copy.left&&copy.right<=history.left,
  430 |           overflow:document.documentElement.scrollWidth-innerWidth,
  431 |           copyOverflow:style.overflowY,textOverflow:style.textOverflow,
  432 |           artwork:{width:art.width,height:art.height},history:{width:history.width,height:history.height}};
  433 |       });
  434 |       expect(geometry.height).toBeGreaterThanOrEqual(80);
  435 |       expect(geometry.paddingBelowCopy).toBeGreaterThanOrEqual(15.9);
  436 |       expect(geometry.paddingAboveCopy).toBeGreaterThanOrEqual(15.9);
  437 |       expect(geometry.ordered).toBe(true);
  438 |       expect(geometry.overflow).toBeLessThanOrEqual(1);
  439 |       expect(geometry.copyOverflow).toBe('visible');expect(geometry.textOverflow).toBe('clip');
  440 |       expect(geometry.artwork).toEqual({width:48,height:48});
  441 |       await expectIntrinsicHistory(row.locator('.history'));
  442 |       await expect(row.locator('strong')).toHaveText(name);
  443 |       await expect(row.locator('.copy span')).toContainText(artist);
  444 |       evidence.push({width,height,...geometry});
  445 |     }
  446 |     await page.setViewportSize({width:320,height:480});
  447 |     const history=row.getByRole('button',{name:'View position history for '+name});
  448 |     await history.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();
  449 |     await page.keyboard.press('Escape');await expect(history).toBeFocused();
  450 |     await page.keyboard.press('Shift+Tab');
  451 |     await expect(row.getByRole('button',{name:'Open '+name+' on Spotify'})).toBeFocused();
  452 |     await expectNoBlockingAxeViolations(page);
  453 |     const reflowPath=testInfo.outputPath('long-row-reflow.json');
  454 |     await writeFile(reflowPath,JSON.stringify({motion,evidence},null,2)+'\n');
  455 |     await testInfo.attach('long-row-reflow.json',{path:reflowPath,contentType:'application/json'});
  456 |   });
  457 | }
  458 | 
```