# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-history.spec.ts >> late unavailable history cannot replace a reopened request or shared navigation
- Location: e2e/design-v2-stats-history.spec.ts:346:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('main').getByText('1. Shared Song', { exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('main').getByText('1. Shared Song', { exact: true }) with timeout 5000ms
  - waiting for getByRole('main').getByText('1. Shared Song', { exact: true })

```

```yaml
- link "Skip to main content":
  - /url: "#v2-main-content"
- banner:
  - text: Shared Top Listening
  - button "Open More tools": More
  - button "Open account and data settings"
- main "Shared Top Listening content":
  - paragraph: Approved shared access
  - heading "Alex top listening" [level=1]
  - paragraph: See top songs, artists, and genres, and how their rankings change.
  - group "Ranking category":
    - button "Songs" [pressed]
    - button "Artists"
    - button "Genres"
  - group "Statistics controls":
    - group "Ranking period":
      - button "4 weeks" [pressed]
      - button "6 months"
      - button "1 year"
  - group "Search rankings":
    - text: Search songs or artists
    - searchbox "Search songs or artists"
  - group "Rank 1. Unchanged"
  - button "Open Shared Song on Spotify" [disabled]:
    - img "Shared Song cover"
  - strong: Shared Song
  - text: Shared Artist
- navigation "Primary navigation":
  - link "Playlists":
    - /url: /new/playlists
  - link "Stats":
    - /url: /new/stats
  - link "History":
    - /url: /new/history
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
    - /url: /new/legal
```

# Test source

```ts
  320 |     await expect(busy).toBeDisabled();await expect(busy).toHaveAttribute('aria-busy','true');
  321 |     await busy.evaluate(button=>(button as HTMLButtonElement).click());expect(pending).toHaveLength(2);
  322 |     await expect(close).toBeEnabled();
  323 |     await dialog.screenshot({path:testInfo.outputPath('history-cloud-only-retrying.png'),animations:'disabled'});
  324 |     await pending[1].fulfill({json:[]});
  325 |     await expect(dialog).toContainText('No saved positions yet');
  326 |     await expect(dialog.getByRole('alert')).toHaveCount(0);
  327 |     await expect(dialog.getByRole('button',{name:/Retry/})).toHaveCount(0);
  328 |     await expect(dialog.locator('svg,table')).toHaveCount(0);
  329 |     await expectNoBlockingAxeViolations(page);
  330 |     await dialog.screenshot({path:testInfo.outputPath('history-cloud-only-empty.png'),animations:'disabled'});
  331 |     await close.click();await expect(trigger).toBeFocused();
  332 |     await trigger.press('Enter');await expect.poll(()=>pending.length).toBe(3);
  333 |     await pending[2].fulfill({json:[{rank:7,stats_snapshots:{snapshot_date:'2026-09-18'}}]});
  334 |     await expect(dialog).toContainText('One saved position');
  335 |     await expect(dialog.locator('time')).toHaveAttribute('datetime','2026-09-18');
  336 |     await expect(dialog).toContainText('#7');
  337 |     await expect(dialog.locator('svg,table')).toHaveCount(0);
  338 |     await expectNoBlockingAxeViolations(page);
  339 |     await dialog.screenshot({path:testInfo.outputPath('history-cloud-only-single.png'),animations:'disabled'});
  340 |     await close.click();await expect(trigger).toBeFocused();
  341 |     expect(pending).toHaveLength(3);
  342 |   });
  343 | }
  344 | 
  345 | for (const lateOutcome of ['ready','unavailable'] as const) {
  346 |   test(`late ${lateOutcome} history cannot replace a reopened request or shared navigation`, async ({page}) => {
  347 |     const pending:Route[]=[];
  348 |     const sharedRequests:unknown[]=[];
  349 |     await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**',async route=>{
  350 |       const url=new URL(route.request().url());
  351 |       if(url.pathname==='/rest/v1/stats_snapshot_tracks' && url.searchParams.get('select')?.startsWith('rank,')) {
  352 |         expect(url.searchParams.get('track_id')).toBe('eq.history-song');
  353 |         expect(url.searchParams.get('stats_snapshots.user_id')).toBe('eq.de111111-1111-4111-8111-111111111111');
  354 |         expect(url.searchParams.get('stats_snapshots.range')).toBe('eq.short_term');
  355 |         pending.push(route);return;
  356 |       }
  357 |       if(url.pathname==='/rest/v1/rpc/get_shared_stats_snapshot') {
  358 |         sharedRequests.push(route.request().postDataJSON());
  359 |         return route.fulfill({json:{ownerUserId:'shared-owner',ownerDisplayName:'Alex',snapshotDate:'2026-10-04',
  360 |           topTracks:[{id:'shared-song',name:'Shared Song',artists:[{name:'Shared Artist'}],album:{images:[]}}],topArtists:[],topGenres:[]}});
  361 |       }
  362 |       return route.fulfill({json:url.pathname==='/rest/v1/users'?{backup_active:true}:[]});
  363 |     });
  364 |     await page.evaluate(async()=>{
  365 |       await new Promise<void>((resolve,reject)=>{
  366 |         const request=indexedDB.open('AnalytifyDB',4);request.onerror=()=>reject(request.error);
  367 |         request.onsuccess=()=>{
  368 |           const db=request.result,tx=db.transaction(['appData','statsHistory'],'readwrite');
  369 |           tx.objectStore('appData').put({key:'supabaseUserId',value:'11111111-1111-4111-8111-111111111111'});
  370 |           tx.objectStore('appData').put({key:'de111111-1111-4111-8111-111111111111_backup_active',value:'true'});
  371 |           for(const userId of ['e2e-user','e2e-user_dev'])tx.objectStore('statsHistory').put({userId,range:'short_term',
  372 |             timestamp:new Date('2026-09-03T12:00:00Z').getTime(),snapshotDate:'2026-09-03',topTracks:[],topArtists:[],topGenres:[],isLoaded:false});
  373 |           tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);
  374 |         };
  375 |       });
  376 |     });
  377 |     // Use the real router link and browser history so the pending controller is
  378 |     // destroyed by navigation, rather than reloading the application in a fixture.
  379 |     await page.goto('/new/stats/shared-owner');
  380 |     await expect(page.getByRole('heading',{name:'Alex top listening'})).toBeVisible();
  381 |     await page.getByRole('link',{name:'Stats',exact:true}).first().click();
  382 |     await expect(page.getByRole('heading',{name:'Your top listening'})).toBeVisible();
  383 |     await page.getByRole('combobox',{name:'Ranking date',exact:true}).selectOption(String(new Date('2026-10-04T12:00:00Z').getTime()));
  384 |     const trigger=page.getByRole('button',{name:'View position history for Midnight Drive'});
  385 |     const dialog=page.getByRole('dialog',{name:'Midnight Drive position history'});
  386 |     const close=dialog.getByRole('button',{name:'Close',exact:true});
  387 |     const slider=dialog.getByRole('slider',{name:'Saved ranking position'});
  388 |     await trigger.press('Enter');await expect.poll(()=>pending.length).toBe(1);
  389 |     await close.click();await expect(trigger).toBeFocused();
  390 |     await trigger.press('Enter');await expect.poll(()=>pending.length).toBe(2);
  391 |     const fulfillLate=async(index:number)=>{
  392 |       const responsePromise=page.waitForResponse(response=>response.request()===pending[index].request());
  393 |       await pending[index].fulfill(lateOutcome==='ready'
  394 |         ? {json:[{rank:1,stats_snapshots:{snapshot_date:'2026-09-02'}}]}
  395 |         : {status:403,json:{message:'Isolated late unavailable history'}});
  396 |       const response=await responsePromise;await response.finished();
  397 |       // Allow the received response and Angular's next paint to finish before
  398 |       // asserting it did not alter the newer UI; no fixed timer or forced action.
  399 |       await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  400 |     };
  401 |     await fulfillLate(0);
  402 |     await expect(dialog.getByRole('status')).toContainText('Refreshing saved history');
  403 |     await expect(dialog.getByRole('button',{name:'Retrying…',exact:true})).toBeDisabled();
  404 |     await expect(dialog.getByRole('alert')).toHaveCount(0);
  405 |     await expect(slider).toHaveAttribute('aria-valuemax','7');
  406 |     expect(pending).toHaveLength(2);
  407 |     await pending[1].fulfill({json:[{rank:9,stats_snapshots:{snapshot_date:'2026-09-03'}}]});
  408 |     await expect(slider).toHaveAttribute('aria-valuemax','8');
  409 |     await dialog.getByRole('button',{name:'View saved positions'}).click();
  410 |     const table=dialog.getByRole('table',{name:'Saved ranking positions'});
  411 |     await expect(table.getByRole('cell').filter({hasText:/^#\d+$/})).toHaveText(['#9','#15','#4','#45','#20','#90','#60','#3']);
  412 |     await expect(table.locator('time')).toHaveText(['3 Sep','5 Sep','9 Sep','14 Sep','18 Sep','24 Sep','28 Sep','4 Oct']);
  413 |     await close.click();await trigger.press('Enter');await expect.poll(()=>pending.length).toBe(3);
  414 |     await page.goBack();
  415 |     await expect(page.getByRole('heading',{name:'Alex top listening'})).toBeVisible();
  416 |     await expect(page.getByRole('dialog')).toHaveCount(0);
  417 |     await fulfillLate(2);
  418 |     await expect(page.getByRole('heading',{name:'Alex top listening'})).toBeVisible();
  419 |     const main=page.getByRole('main');
> 420 |     await expect(main.getByText('1. Shared Song',{exact:true})).toBeVisible();
      |                                                                 ^ Error: expect(locator).toBeVisible() failed
  421 |     await expect(main.getByRole('button',{name:/View position history/})).toHaveCount(0);
  422 |     await expect(main.getByRole('alert')).toHaveCount(0);
  423 |     await expect(page.getByRole('dialog')).toHaveCount(0);
  424 |     expect(sharedRequests).toEqual(Array.from({length:2},()=>({p_owner_user_id:'shared-owner',p_range:'short_term'})));
  425 |     expect(pending).toHaveLength(3);
  426 |     await expectNoBlockingAxeViolations(page);
  427 |   });
  428 | }
  429 | 
  430 | test('canonical history palette distinguishes surfaces, controls, hover and keyboard focus',async({page})=>{
  431 |   await page.emulateMedia({reducedMotion:'reduce'});
  432 |   const searchBorder=await page.getByRole('searchbox',{name:'Search songs or artists'}).evaluate(element=>getComputedStyle(element).borderColor);
  433 |   await page.getByRole('button',{name:'View position history for Midnight Drive'}).press('Enter');
  434 |   const dialog=page.getByRole('dialog',{name:'Midnight Drive position history'});
  435 |   const close=dialog.getByRole('button',{name:'Close',exact:true});
  436 |   const slider=dialog.getByRole('slider',{name:'Saved ranking position'});
  437 |   await slider.focus();await page.mouse.move(0,0);
  438 |   const colors=await dialog.evaluate(element=>({
  439 |     surfaceBorder:getComputedStyle(element).borderColor,
  440 |     selection:getComputedStyle(element.querySelector('.entity-badge')!).backgroundColor,
  441 |     chartSelection:getComputedStyle(element.querySelector('.history-area')!).fill,
  442 |     defaultControl:getComputedStyle(element.querySelector('.close-button')!).borderColor
  443 |   }));
  444 |   await close.hover();
  445 |   const hover=await close.evaluate(element=>({border:getComputedStyle(element).borderColor,background:getComputedStyle(element).backgroundColor}));
  446 |   await close.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
  447 |   await expect(close).toBeFocused();
  448 |   const focus=await close.evaluate(element=>({border:getComputedStyle(element).borderColor,background:getComputedStyle(element).backgroundColor}));
  449 |   expect({searchBorder,...colors,hover,focus}).toEqual({
  450 |     searchBorder:'rgb(107, 125, 113)',surfaceBorder:'rgb(52, 66, 58)',selection:'rgb(25, 60, 41)',chartSelection:'rgb(25, 60, 41)',
  451 |     defaultControl:'rgb(107, 125, 113)',hover:{border:'rgb(107, 125, 113)',background:'rgb(24, 32, 25)'},
  452 |     focus:{border:'rgb(159, 255, 200)',background:'rgb(18, 24, 20)'}
  453 |   });
  454 |   await expectNoBlockingAxeViolations(page);
  455 | });
  456 | 
```