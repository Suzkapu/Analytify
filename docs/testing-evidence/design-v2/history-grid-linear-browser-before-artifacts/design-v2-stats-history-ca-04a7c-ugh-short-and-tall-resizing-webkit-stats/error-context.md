# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-history.spec.ts >> category rank grids align with real saved positions through short and tall resizing
- Location: e2e/design-v2-stats-history.spec.ts:464:5

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  getByRole('dialog', { name: 'Midnight Drive position history', exact: true }).getByRole('slider', { name: 'Saved ranking position' })
Expected: "9 Sep 2026, position 50"
Received: "28 Sep 2026, position 60"
Timeout:  5000ms

Call log:
  - Expect "toHaveAttribute" getByRole('dialog', { name: 'Midnight Drive position history', exact: true }).getByRole('slider', { name: 'Saved ranking position' }) with timeout 5000ms
  - waiting for getByRole('dialog', { name: 'Midnight Drive position history', exact: true }).getByRole('slider', { name: 'Saved ranking position' })
    14 × locator resolved to <div tabindex="0" role="slider" aria-valuemin="1" aria-valuemax="7" aria-valuenow="6" class="history-plot" _ngcontent-ng-c3018853340="" aria-orientation="horizontal" aria-label="Saved ranking position" aria-valuetext="28 Sep 2026, position 60" aria-description="Use Left and Right arrows, Home or End to inspect saved dates and positions.">…</div>
       - unexpected value "28 Sep 2026, position 60"

```

```yaml
- slider "Saved ranking position"
```

# Test source

```ts
  396 |     const fulfillLate=async(index:number)=>{
  397 |       const responsePromise=page.waitForResponse(response=>response.request()===pending[index].request());
  398 |       await pending[index].fulfill(lateOutcome==='ready'
  399 |         ? {json:[{rank:1,stats_snapshots:{snapshot_date:'2026-09-02'}}]}
  400 |         : {status:403,json:{message:'Isolated late unavailable history'}});
  401 |       const response=await responsePromise;await response.finished();
  402 |       // Allow the received response and Angular's next paint to finish before
  403 |       // asserting it did not alter the newer UI; no fixed timer or forced action.
  404 |       await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  405 |     };
  406 |     await fulfillLate(0);
  407 |     await expect(dialog.getByRole('status')).toContainText('Refreshing saved history');
  408 |     await expect(dialog.getByRole('button',{name:'Retrying…',exact:true})).toBeDisabled();
  409 |     await expect(dialog.getByRole('alert')).toHaveCount(0);
  410 |     await expect(slider).toHaveAttribute('aria-valuemax','7');
  411 |     expect(pending).toHaveLength(2);
  412 |     await pending[1].fulfill({json:[{rank:9,stats_snapshots:{snapshot_date:'2026-09-03'}}]});
  413 |     await expect(slider).toHaveAttribute('aria-valuemax','8');
  414 |     await dialog.getByRole('button',{name:'View saved positions'}).click();
  415 |     const table=dialog.getByRole('table',{name:'Saved ranking positions'});
  416 |     await expect(table.getByRole('cell').filter({hasText:/^#\d+$/})).toHaveText(['#9','#15','#4','#45','#20','#90','#60','#3']);
  417 |     await expect(table.locator('time')).toHaveText(['3 Sep','5 Sep','9 Sep','14 Sep','18 Sep','24 Sep','28 Sep','4 Oct']);
  418 |     await close.click();await trigger.press('Enter');await expect.poll(()=>pending.length).toBe(3);
  419 |     await page.goBack();
  420 |     await expect(page.getByRole('heading',{name:'Alex top listening'})).toBeVisible();
  421 |     await expect(page.getByRole('dialog')).toHaveCount(0);
  422 |     await fulfillLate(2);
  423 |     await expect(page.getByRole('heading',{name:'Alex top listening'})).toBeVisible();
  424 |     const main=page.getByRole('main');
  425 |     await expect(main.locator('.v2-ranking-copy strong')).toHaveText('Shared Song');
  426 |     await expect(main.getByRole('group',{name:'Rank 1. Unchanged',exact:true})).toBeVisible();
  427 |     await expect(main.locator('.rank-number')).toHaveText('1');
  428 |     await expect(main.getByRole('button',{name:/View position history/})).toHaveCount(0);
  429 |     await expect(main.getByRole('alert')).toHaveCount(0);
  430 |     await expect(page.getByRole('dialog')).toHaveCount(0);
  431 |     expect(sharedRequests).toEqual(Array.from({length:2},()=>({p_owner_user_id:'shared-owner',p_range:'short_term'})));
  432 |     expect(pending).toHaveLength(3);
  433 |     await expectNoBlockingAxeViolations(page);
  434 |   });
  435 | }
  436 | 
  437 | test('canonical history palette distinguishes surfaces, controls, hover and keyboard focus',async({page})=>{
  438 |   await page.emulateMedia({reducedMotion:'reduce'});
  439 |   const searchBorder=await page.getByRole('searchbox',{name:'Search songs or artists'}).evaluate(element=>getComputedStyle(element).borderColor);
  440 |   await page.getByRole('button',{name:'View position history for Midnight Drive'}).press('Enter');
  441 |   const dialog=page.getByRole('dialog',{name:'Midnight Drive position history'});
  442 |   const close=dialog.getByRole('button',{name:'Close',exact:true});
  443 |   const slider=dialog.getByRole('slider',{name:'Saved ranking position'});
  444 |   await slider.focus();await page.mouse.move(0,0);
  445 |   const colors=await dialog.evaluate(element=>({
  446 |     surfaceBorder:getComputedStyle(element).borderColor,
  447 |     selection:getComputedStyle(element.querySelector('.entity-badge')!).backgroundColor,
  448 |     chartSelection:getComputedStyle(element.querySelector('.history-area')!).fill,
  449 |     defaultControl:getComputedStyle(element.querySelector('.close-button')!).borderColor
  450 |   }));
  451 |   await close.hover();
  452 |   const hover=await close.evaluate(element=>({border:getComputedStyle(element).borderColor,background:getComputedStyle(element).backgroundColor}));
  453 |   await close.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');
  454 |   await expect(close).toBeFocused();
  455 |   const focus=await close.evaluate(element=>({border:getComputedStyle(element).borderColor,background:getComputedStyle(element).backgroundColor}));
  456 |   expect({searchBorder,...colors,hover,focus}).toEqual({
  457 |     searchBorder:'rgb(107, 125, 113)',surfaceBorder:'rgb(52, 66, 58)',selection:'rgb(25, 60, 41)',chartSelection:'rgb(25, 60, 41)',
  458 |     defaultControl:'rgb(107, 125, 113)',hover:{border:'rgb(107, 125, 113)',background:'rgb(24, 32, 25)'},
  459 |     focus:{border:'rgb(159, 255, 200)',background:'rgb(18, 24, 20)'}
  460 |   });
  461 |   await expectNoBlockingAxeViolations(page);
  462 | });
  463 | 
  464 | test('category rank grids align with real saved positions through short and tall resizing', async ({page}, testInfo) => {
  465 |   await page.emulateMedia({reducedMotion: 'reduce'});
  466 |   await page.evaluate(async () => {
  467 |     const dates = ['2026-09-05','2026-09-09','2026-09-14','2026-09-18','2026-09-24','2026-09-28','2026-10-04'];
  468 |     const ranks = {tracks: [1,50,100,20,90,60,3], artists: [1,25,50,20,45,30,3], genres: [1,8,15,4,12,6,3]};
  469 |     await new Promise<void>((resolve, reject) => {
  470 |       const request = indexedDB.open('AnalytifyDB', 4); request.onerror = () => reject(request.error);
  471 |       request.onsuccess = () => {
  472 |         const db = request.result, tx = db.transaction('statsHistory', 'readwrite');
  473 |         for (const userId of ['e2e-user', 'e2e-user_dev']) for (let i = 0; i < dates.length; i++) {
  474 |           const song = {id: 'history-song', name: 'Midnight Drive', artists: [{name: 'Example Artist'}], album: {images: []}};
  475 |           const artist = {id: 'history-artist', name: 'History Artist', images: [], genres: ['fixture-genre']};
  476 |           tx.objectStore('statsHistory').put({userId, range: 'short_term', snapshotDate: dates[i],
  477 |             timestamp: Date.parse(`${dates[i]}T12:00:00Z`), isLoaded: true,
  478 |             topTracks: [...Array.from({length: ranks.tracks[i] - 1}, (_, j) => ({id: `other-song-${j}`, name: `Other song ${j}`, artists: []})), song],
  479 |             topArtists: [...Array.from({length: ranks.artists[i] - 1}, (_, j) => ({id: `other-artist-${j}`, name: `Other artist ${j}`, images: [], genres: []})), artist],
  480 |             topGenres: [...Array.from({length: ranks.genres[i] - 1}, (_, j) => ({name: `Other genre ${j}`, weight: 100})), {name: 'fixture-genre', weight: 50}]});
  481 |         }
  482 |         tx.oncomplete = () => {db.close(); resolve();}; tx.onerror = () => reject(tx.error);
  483 |       };
  484 |     });
  485 |   });
  486 |   await page.reload(); await chooseStatsDate(page, 'ranking', '2026-10-04');
  487 |   const evidence = [];
  488 |   for (const [category, name, middle, limit] of [['Songs', 'Midnight Drive', 50, 100], ['Artists', 'History Artist', 25, 50], ['Genres', 'fixture-genre', 8, 15]] as const) {
  489 |     await page.getByRole('group', {name: 'Ranking category'}).getByRole('button', {name: category, exact: true}).click();
  490 |     const trigger = page.getByRole('button', {name: `View position history for ${name}`, exact: true});
  491 |     await trigger.press('Enter');
  492 |     const dialog = page.getByRole('dialog', {name: `${name} position history`, exact: true});
  493 |     const slider = dialog.getByRole('slider', {name: 'Saved ranking position'});
  494 |     await expect(slider).toHaveAttribute('aria-valuemax', '7');
  495 |     await slider.focus(); await slider.press('Home'); await slider.press('ArrowRight');
> 496 |     await expect(slider).toHaveAttribute('aria-valuetext', `9 Sep 2026, position ${middle}`);
      |                          ^ Error: expect(locator).toHaveAttribute(expected) failed
  497 |     for (const width of [320,390,600,601,768,1440]) for (const height of [480,1000]) {
  498 |       await page.setViewportSize({width, height});
  499 |       await expect.poll(() => slider.locator('svg').evaluate(svg => {
  500 |         const box = svg.getBoundingClientRect(), vb = (svg as SVGSVGElement).viewBox.baseVal;
  501 |         return {viewport: innerWidth, canvasMatches: Math.abs(box.width - vb.width) < 0.001 && Math.abs(box.height - vb.height) < 0.001};
  502 |       })).toEqual({viewport: width, canvasMatches: true});
  503 |       const measured = await slider.evaluate(element => {
  504 |         const svg = element.querySelector('svg')!, grid = [...svg.querySelectorAll('.grid-line')], markers = [...svg.querySelectorAll('.position-marker')];
  505 |         const labels = [...svg.querySelectorAll('.axis-label')];
  506 |         const lineY = (n: Element) => Number(n.getAttribute('y1'));
  507 |         const markerY = (n: Element) => Number(n.getAttribute('cy'));
  508 |         return {axes: labels.map(n => n.textContent), grid: grid.map(lineY), points: markers.slice(0, 3).map(markerY),
  509 |           labelY: labels.map(n => Number(n.getAttribute('y')) - 8),
  510 |           projectedGridMiddle: grid[1].getBoundingClientRect().y,
  511 |           projectedPointMiddle: markers[1].getBoundingClientRect().y + markers[1].getBoundingClientRect().height / 2,
  512 |           overflow: document.documentElement.scrollWidth - innerWidth};
  513 |       });
  514 |       expect(measured.axes).toEqual(['#1', `#${middle}`, `#${limit}`]);
  515 |       for (let i = 0; i < 3; i++) {
  516 |         expect(measured.grid[i]).toBeCloseTo(measured.points[i], 8);
  517 |         expect(measured.labelY[i]).toBeCloseTo(measured.points[i], 8);
  518 |       }
  519 |       expect(measured.projectedGridMiddle).toBeCloseTo(measured.projectedPointMiddle, 3);
  520 |       expect(measured.overflow).toBeLessThanOrEqual(1);
  521 |       await expect(slider).toHaveAttribute('aria-valuetext', `9 Sep 2026, position ${middle}`);
  522 |       evidence.push({category, width, height, ...measured});
  523 |       if (height === 1000 && [390,1440].includes(width)) await dialog.screenshot({path: testInfo.outputPath(`history-grid-${category}-${width}.png`), animations: 'disabled'});
  524 |     }
  525 |     await expectNoBlockingAxeViolations(page);
  526 |     await dialog.getByRole('button', {name: 'Close', exact: true}).click(); await expect(trigger).toBeFocused();
  527 |   }
  528 |   await testInfo.attach('category-grid-geometry.json', {body: JSON.stringify(evidence, null, 2), contentType: 'application/json'});
  529 | });
  530 | 
```