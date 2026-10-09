# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-history.spec.ts >> category rank grids align with real saved positions through short and tall resizing
- Location: e2e/design-v2-stats-history.spec.ts:464:5

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 1

  Object {
    "canvasMatches": true,
-   "projectedAlignment": true,
+   "projectedAlignment": false,
    "viewport": 320,
  }

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
```

# Page snapshot

```yaml
- generic [ref=f2e5]:
  - link [aria-hidden] [ref=f2e6] [cursor=pointer]:
    - /url: "#v2-main-content"
    - text: Skip to main content
  - banner [aria-hidden] [ref=f2e7]:
    - generic [ref=f2e8]:
      - text:   
      - generic [ref=f2e9]: Your Top Listening
      - generic [ref=f2e11]:
        - button [ref=f2e12] [cursor=pointer]:
          - generic [aria-hidden] [ref=f2e13]: 
          - generic [ref=f2e14]: More
        - button [ref=f2e15] [cursor=pointer]:
          - generic [aria-hidden] [ref=f2e16]: 
  - main "Your Top Listening content" [ref=f2e17]:
    - generic [ref=f2e18]:
      - generic [ref=f2e20]:
        - generic [ref=f2e22]:
          - paragraph [ref=f2e23]: Personal listening
          - heading [level=1] [ref=f2e24]: Your top listening
          - paragraph [ref=f2e25]: See top songs, artists, and genres, and how their rankings change.
        - generic [ref=f2e26]:
          - region [ref=f2e27]:
            - generic [ref=f2e28]:
              - paragraph [ref=f2e29]: Period
              - group [ref=f2e30]:
                - button [pressed] [ref=f2e31] [cursor=pointer]:
                  - generic [ref=f2e32]: 4 weeks
                - button [ref=f2e33] [cursor=pointer]:
                  - generic [ref=f2e34]: 6 months
                - button [ref=f2e35] [cursor=pointer]:
                  - generic [ref=f2e36]: 1 year
            - generic [ref=f2e37]:
              - paragraph [ref=f2e38]: Category
              - group [ref=f2e39]:
                - button [pressed] [ref=f2e40] [cursor=pointer]:
                  - generic [ref=f2e42]: Songs
                - button [ref=f2e43] [cursor=pointer]:
                  - generic [ref=f2e45]: Artists
                - button [ref=f2e46] [cursor=pointer]:
                  - generic [ref=f2e48]: Genres
          - group [ref=f2e50]:
            - generic [ref=f2e52]:
              - generic [ref=f2e53]: Search songs or artists
              - generic [ref=f2e54]:
                - generic [aria-hidden]: 
                - searchbox [ref=f2e55]
            - button [expanded] [ref=f2e56] [cursor=pointer]: Compare dates
            - switch [ref=f2e59] [cursor=pointer]:
              - generic [ref=f2e60]: Search past rankings
          - region [ref=f2e63]:
            - button [ref=f2e65] [cursor=pointer]:
              - generic [ref=f2e66]: Ranking date
              - generic [ref=f2e67]: 4 Oct 2026
            - button [ref=f2e69] [cursor=pointer]:
              - generic [ref=f2e70]: Compare with
              - generic [ref=f2e71]: 28 Sep 2026
          - generic [ref=f2e72]:
            - generic [ref=f2e73]:
              - group [ref=f2e74]:
                - generic [aria-hidden] [ref=f2e75]: "1"
                - generic [aria-hidden] [ref=f2e76]: —
              - button [disabled] [ref=f2e77]
              - strong [ref=f2e80]: Other song 0
              - button [ref=f2e81] [cursor=pointer]: History
            - generic [ref=f2e82]:
              - group [ref=f2e83]:
                - generic [aria-hidden] [ref=f2e84]: "2"
                - generic [aria-hidden] [ref=f2e85]: —
              - button [disabled] [ref=f2e86]
              - strong [ref=f2e89]: Other song 1
              - button [ref=f2e90] [cursor=pointer]: History
            - generic [ref=f2e91]:
              - group [ref=f2e92]:
                - generic [aria-hidden] [ref=f2e96]: "3"
                - generic [aria-hidden] [ref=f2e97]: ↑ 57
              - button [disabled] [ref=f2e98]
              - generic [ref=f2e100]:
                - strong [ref=f2e101]: Midnight Drive
                - generic [ref=f2e102]: Example Artist
              - button [ref=f2e103] [cursor=pointer]: History
          - button [ref=f2e104] [cursor=pointer]:
            - generic [ref=f2e105]: 
            - text: Create playlist
      - dialog [ref=f2e108]:
        - generic [ref=f2e109]:
          - generic [ref=f2e112]:
            - heading "Midnight Drive position history" [level=2] [ref=f2e113]:
              - text: Midnight Drive
              - generic [ref=f2e114]: position history
            - paragraph [ref=f2e115]: Top Song
          - separator [ref=f2e116]
          - heading "Rank Position History" [level=3] [ref=f2e117]:
            - generic [aria-hidden] [ref=f2e118]: 
            - text: Rank Position History
          - generic [ref=f2e119]:
            - slider "Saved ranking position" [active] [ref=f2e120]:
              - img [aria-hidden] [ref=f2e121]: "#1#50#100#15 Sep#2018 Sep#34 Oct9 Sep · #50"
            - paragraph [ref=f2e135]: 9 Sep 2026, position 50
          - button "View saved positions" [ref=f2e136] [cursor=pointer]
        - button "Close" [ref=f2e137] [cursor=pointer]:
          - generic [aria-hidden] [ref=f2e138]: 
          - text: Close
  - navigation [aria-hidden] [ref=f2e139]:
    - link [ref=f2e140] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f2e141]: 
      - generic [ref=f2e142]: Playlists
    - link [ref=f2e143] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f2e144]: 
      - generic [ref=f2e145]: Stats
    - link [ref=f2e146] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f2e147]: 
      - generic [ref=f2e148]: History
  - contentinfo [aria-hidden] [ref=f2e149]:
    - generic [ref=f2e150]: Powered by Spotify
    - generic [ref=f2e151]: Artwork and metadata belong to their owners.
    - link [ref=f2e152] [cursor=pointer]:
      - /url: /new/legal
      - text: Legal & privacy
```

# Test source

```ts
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
  495 |     await page.mouse.move(0, 0);
  496 |     await slider.focus(); await slider.press('Home'); await slider.press('ArrowRight');
  497 |     await expect(slider).toHaveAttribute('aria-valuetext', `9 Sep 2026, position ${middle}`);
  498 |     for (const width of [320,390,600,601,768,1440]) for (const height of [480,1000]) {
  499 |       await page.setViewportSize({width, height});
  500 |       await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  501 |       const projectionDiagnostic = await slider.locator('svg').evaluate(svg => {
  502 |         const line = svg.querySelectorAll('.grid-line')[1] as SVGLineElement;
  503 |         const point = svg.querySelectorAll('.position-marker')[1] as SVGCircleElement;
  504 |         const box = (n: SVGGraphicsElement) => {const b = n.getBoundingClientRect(); return {x: b.x, y: b.y, width: b.width, height: b.height};};
  505 |         const matrix = line.getScreenCTM()!;
  506 |         return {lineY: line.y1.baseVal.value, circleY: point.cy.baseVal.value, lineRect: box(line), circleRect: box(point),
  507 |           lineBBox: line.getBBox().y, circleBBox: point.getBBox().y, circleRadius: point.r.baseVal.value,
  508 |           scale: matrix.d, offset: matrix.f, lineProjection: matrix.d * line.y1.baseVal.value + matrix.f,
  509 |           circleProjection: matrix.d * point.cy.baseVal.value + matrix.f};
  510 |       });
  511 |       const diagnosticPath = testInfo.outputPath(`projection-${category}-${width}-${height}.json`);
  512 |       await writeFile(diagnosticPath, JSON.stringify(projectionDiagnostic, null, 2));
  513 |       await testInfo.attach(`projection-${category}-${width}-${height}.json`, {path: diagnosticPath, contentType: 'application/json'});
  514 |       await expect.poll(() => slider.locator('svg').evaluate(svg => {
  515 |         const box = svg.getBoundingClientRect(), vb = (svg as SVGSVGElement).viewBox.baseVal;
  516 |         const line = svg.querySelectorAll('.grid-line')[1].getBoundingClientRect();
  517 |         const point = svg.querySelectorAll('.position-marker')[1].getBoundingClientRect();
  518 |         return {viewport: innerWidth, canvasMatches: Math.abs(box.width - vb.width) < 0.001 && Math.abs(box.height - vb.height) < 0.001,
  519 |           projectedAlignment: Math.abs(line.y + line.height / 2 - point.y - point.height / 2) < 0.0005};
> 520 |       })).toEqual({viewport: width, canvasMatches: true, projectedAlignment: true});
      |           ^ Error: expect(received).toEqual(expected) // deep equality
  521 |       const measured = await slider.evaluate(element => {
  522 |         const svg = element.querySelector('svg')!, grid = [...svg.querySelectorAll('.grid-line')], markers = [...svg.querySelectorAll('.position-marker')];
  523 |         const labels = [...svg.querySelectorAll('.axis-label')];
  524 |         const lineY = (n: Element) => Number(n.getAttribute('y1'));
  525 |         const markerY = (n: Element) => Number(n.getAttribute('cy'));
  526 |         return {axes: labels.map(n => n.textContent), grid: grid.map(lineY), points: markers.slice(0, 3).map(markerY),
  527 |           labelY: labels.map(n => Number(n.getAttribute('y')) - 8),
  528 |           projectedGridMiddle: grid[1].getBoundingClientRect().y + grid[1].getBoundingClientRect().height / 2,
  529 |           projectedGridHeight: grid[1].getBoundingClientRect().height,
  530 |           projectedPointMiddle: markers[1].getBoundingClientRect().y + markers[1].getBoundingClientRect().height / 2,
  531 |           overflow: document.documentElement.scrollWidth - innerWidth};
  532 |       });
  533 |       expect(measured.axes).toEqual(['#1', `#${middle}`, `#${limit}`]);
  534 |       for (let i = 0; i < 3; i++) {
  535 |         expect(measured.grid[i]).toBeCloseTo(measured.points[i], 8);
  536 |         expect(measured.labelY[i]).toBeCloseTo(measured.points[i], 8);
  537 |       }
  538 |       expect(measured.projectedGridMiddle).toBeCloseTo(measured.projectedPointMiddle, 3);
  539 |       expect(measured.overflow).toBeLessThanOrEqual(1);
  540 |       await expect(slider).toHaveAttribute('aria-valuetext', `9 Sep 2026, position ${middle}`);
  541 |       evidence.push({category, width, height, ...measured});
  542 |       if (height === 1000 && [390,1440].includes(width)) await dialog.screenshot({path: testInfo.outputPath(`history-grid-${category}-${width}.png`), animations: 'disabled'});
  543 |     }
  544 |     await expectNoBlockingAxeViolations(page);
  545 |     await dialog.getByRole('button', {name: 'Close', exact: true}).click(); await expect(trigger).toBeFocused();
  546 |   }
  547 |   await testInfo.attach('category-grid-geometry.json', {body: JSON.stringify(evidence, null, 2), contentType: 'application/json'});
  548 | });
  549 | 
```