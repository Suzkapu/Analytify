# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-history.spec.ts >> history keyboard focus stays inside its canvas while resizing (no-preference)
- Location: e2e/design-v2-stats-history.spec.ts:563:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 2
Received: 3
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link [aria-hidden] [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
    - text: Skip to main content
  - banner [aria-hidden] [ref=f1e7]:
    - generic [ref=f1e8]:
      - text:   
      - generic [ref=f1e9]: Your Top Listening
      - generic [ref=f1e11]:
        - button [ref=f1e12] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e13]: 
          - generic [ref=f1e14]: More
        - button [ref=f1e15] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e16]: 
  - main "Your Top Listening content" [ref=f1e17]:
    - generic [ref=f1e18]:
      - generic [ref=f1e20]:
        - generic [ref=f1e22]:
          - paragraph [ref=f1e23]: Personal listening
          - heading [level=1] [ref=f1e24]: Your top listening
          - paragraph [ref=f1e25]: See top songs, artists, and genres, and how their rankings change.
        - generic [ref=f1e26]:
          - region [ref=f1e27]:
            - generic [ref=f1e28]:
              - paragraph [ref=f1e29]: Period
              - group [ref=f1e30]:
                - button [pressed] [ref=f1e31] [cursor=pointer]:
                  - generic [ref=f1e32]: 4 weeks
                - button [ref=f1e33] [cursor=pointer]:
                  - generic [ref=f1e34]: 6 months
                - button [ref=f1e35] [cursor=pointer]:
                  - generic [ref=f1e36]: 1 year
            - generic [ref=f1e37]:
              - paragraph [ref=f1e38]: Category
              - group [ref=f1e39]:
                - button [pressed] [ref=f1e40] [cursor=pointer]:
                  - generic [ref=f1e42]: Songs
                - button [ref=f1e43] [cursor=pointer]:
                  - generic [ref=f1e45]: Artists
                - button [ref=f1e46] [cursor=pointer]:
                  - generic [ref=f1e48]: Genres
          - group [ref=f1e50]:
            - generic [ref=f1e52]:
              - generic [ref=f1e53]: Search songs or artists
              - generic [ref=f1e54]:
                - generic [aria-hidden]: 
                - searchbox [ref=f1e55]
            - button [expanded] [ref=f1e56] [cursor=pointer]: Compare dates
            - switch [ref=f1e59] [cursor=pointer]:
              - generic [ref=f1e60]: Search past rankings
          - region [ref=f1e63]:
            - button [ref=f1e65] [cursor=pointer]:
              - generic [ref=f1e66]: Ranking date
              - generic [ref=f1e67]: 4 Oct 2026
            - button [ref=f1e69] [cursor=pointer]:
              - generic [ref=f1e70]: Compare with
              - generic [ref=f1e71]: 28 Sep 2026
          - generic [ref=f1e72]:
            - generic [ref=f1e73]:
              - group [ref=f1e74]:
                - generic [aria-hidden] [ref=f1e75]: "1"
                - generic [aria-hidden] [ref=f1e76]: —
              - button [disabled] [ref=f1e77]
              - strong [ref=f1e80]: Other 0
              - button [ref=f1e81] [cursor=pointer]: History
            - generic [ref=f1e82]:
              - group [ref=f1e83]:
                - generic [aria-hidden] [ref=f1e84]: "2"
                - generic [aria-hidden] [ref=f1e85]: —
              - button [disabled] [ref=f1e86]
              - strong [ref=f1e89]: Other 1
              - button [ref=f1e90] [cursor=pointer]: History
            - generic [ref=f1e91]:
              - group [ref=f1e92]:
                - generic [aria-hidden] [ref=f1e96]: "3"
                - generic [aria-hidden] [ref=f1e97]: ↑ 57
              - button [disabled] [ref=f1e98]
              - generic [ref=f1e100]:
                - strong [ref=f1e101]: Midnight Drive
                - generic [ref=f1e102]: Example Artist
              - button [ref=f1e103] [cursor=pointer]: History
          - button [ref=f1e104] [cursor=pointer]:
            - generic [ref=f1e105]: 
            - text: Create playlist
      - dialog [ref=f1e108]:
        - generic [ref=f1e109]:
          - generic [ref=f1e112]:
            - heading "Midnight Drive position history" [level=2] [ref=f1e113]:
              - text: Midnight Drive
              - generic [ref=f1e114]: position history
            - paragraph [ref=f1e115]: Top Song
          - separator [ref=f1e116]
          - heading "Rank Position History" [level=3] [ref=f1e117]:
            - generic [aria-hidden] [ref=f1e118]: 
            - text: Rank Position History
          - generic [ref=f1e119]:
            - slider "Saved ranking position" [active] [ref=f1e120]:
              - img [aria-hidden] [ref=f1e121]: "#1#50#100#155 Sep#2018 Sep#34 Oct18 Sep · #20"
            - paragraph [ref=f1e135]: 18 Sep 2026, position 20
          - button "View saved positions" [ref=f1e136] [cursor=pointer]
        - button "Close" [ref=f1e137] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e138]: 
          - text: Close
  - navigation [aria-hidden] [ref=f1e139]:
    - link [ref=f1e140] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e141]: 
      - generic [ref=f1e142]: Playlists
    - link [ref=f1e143] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e144]: 
      - generic [ref=f1e145]: Stats
    - link [ref=f1e146] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e147]: 
      - generic [ref=f1e148]: History
  - contentinfo [aria-hidden] [ref=f1e149]:
    - generic [ref=f1e150]: Powered by Spotify
    - generic [ref=f1e151]: Artwork and metadata belong to their owners.
    - link [ref=f1e152] [cursor=pointer]:
      - /url: /new/legal
      - text: Legal & privacy
```

# Test source

```ts
  497 |     await page.mouse.move(0, 0);
  498 |     await slider.focus(); await slider.press('Home'); await slider.press('ArrowRight');
  499 |     await expect(slider).toHaveAttribute('aria-valuetext', `9 Sep 2026, position ${middle}`);
  500 |     for (const width of [320,390,600,601,768,1440]) for (const height of [480,1000]) {
  501 |       await page.setViewportSize({width, height});
  502 |       await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  503 |       const projectionDiagnostic = await slider.locator('svg').evaluate(svg => {
  504 |         const line = svg.querySelectorAll('.grid-line')[1] as SVGLineElement;
  505 |         const point = svg.querySelectorAll('.position-marker')[1] as SVGCircleElement;
  506 |         const box = (n: SVGGraphicsElement) => {const b = n.getBoundingClientRect(); return {x: b.x, y: b.y, width: b.width, height: b.height};};
  507 |         const matrix = line.getScreenCTM()!;
  508 |         return {lineY: line.y1.baseVal.value, circleY: point.cy.baseVal.value, lineRect: box(line), circleRect: box(point),
  509 |           lineBBox: line.getBBox().y, circleBBox: point.getBBox().y, circleRadius: point.r.baseVal.value,
  510 |           scale: matrix.d, offset: matrix.f, lineProjection: matrix.d * line.y1.baseVal.value + matrix.f,
  511 |           circleProjection: matrix.d * point.cy.baseVal.value + matrix.f};
  512 |       });
  513 |       const diagnosticPath = testInfo.outputPath(`projection-${category}-${width}-${height}.json`);
  514 |       await writeFile(diagnosticPath, JSON.stringify(projectionDiagnostic, null, 2));
  515 |       await testInfo.attach(`projection-${category}-${width}-${height}.json`, {path: diagnosticPath, contentType: 'application/json'});
  516 |       const measure = () => slider.evaluate(element => {
  517 |         const svg = element.querySelector('svg')!, grid = [...svg.querySelectorAll('.grid-line')], markers = [...svg.querySelectorAll('.position-marker')];
  518 |         const labels = [...svg.querySelectorAll('.axis-label')];
  519 |         const lineY = (n: Element) => Number(n.getAttribute('y1'));
  520 |         const markerY = (n: Element) => Number(n.getAttribute('cy'));
  521 |         const box = svg.getBoundingClientRect(), vb = (svg as SVGSVGElement).viewBox.baseVal;
  522 |         const matrix = (grid[1] as SVGLineElement).getScreenCTM()!;
  523 |         return {axes: labels.map(n => n.textContent), grid: grid.map(lineY), points: markers.slice(0, 3).map(markerY),
  524 |           labelY: labels.map(n => Number(n.getAttribute('y')) - 8),
  525 |           viewport: innerWidth, canvasMatches: Math.abs(box.width - vb.width) < 0.001 && Math.abs(box.height - vb.height) < 0.001,
  526 |           lineProjection: matrix.d * (grid[1] as SVGLineElement).y1.baseVal.value + matrix.f,
  527 |           pointProjection: matrix.d * (markers[1] as SVGCircleElement).cy.baseVal.value + matrix.f,
  528 |           projectedGridMiddle: grid[1].getBoundingClientRect().y + grid[1].getBoundingClientRect().height / 2,
  529 |           projectedGridHeight: grid[1].getBoundingClientRect().height,
  530 |           projectedPointMiddle: markers[1].getBoundingClientRect().y + markers[1].getBoundingClientRect().height / 2,
  531 |           overflow: document.documentElement.scrollWidth - innerWidth};
  532 |       });
  533 |       let measured = await measure();
  534 |       await expect.poll(async () => {
  535 |         await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  536 |         measured = await measure();
  537 |         return {viewport: measured.viewport, canvasMatches: measured.canvasMatches,
  538 |           projectedAlignment: Math.abs(measured.projectedGridMiddle - measured.projectedPointMiddle) <= 1 / 60};
  539 |       }).toEqual({viewport: width, canvasMatches: true, projectedAlignment: true});
  540 |       expect(measured.axes).toEqual(['#1', `#${middle}`, `#${limit}`]);
  541 |       for (let i = 0; i < 3; i++) {
  542 |         expect(measured.grid[i]).toBeCloseTo(measured.points[i], 8);
  543 |         expect(measured.labelY[i]).toBeCloseTo(measured.points[i], 8);
  544 |       }
  545 |       expect(measured.lineProjection).toBeCloseTo(measured.pointProjection, 8);
  546 |       // Gecko expands SVG stroke bounds in 1/60px layout units. Keep exact
  547 |       // coordinate/transform checks above and allow one unit for those bounds.
  548 |       expect(Math.abs(measured.projectedGridMiddle - measured.projectedPointMiddle)).toBeLessThanOrEqual(1 / 60);
  549 |       expect(measured.overflow).toBeLessThanOrEqual(1);
  550 |       await expect(slider).toHaveAttribute('aria-valuetext', `9 Sep 2026, position ${middle}`);
  551 |       evidence.push({category, width, height, ...measured});
  552 |       if (height === 1000 && [390,1440].includes(width)) await dialog.screenshot({path: testInfo.outputPath(`history-grid-${category}-${width}.png`), animations: 'disabled'});
  553 |     }
  554 |     await expectNoBlockingAxeViolations(page);
  555 |     await dialog.getByRole('button', {name: 'Close', exact: true}).click(); await expect(trigger).toBeFocused();
  556 |   }
  557 |   const geometryPath = testInfo.outputPath('category-grid-geometry.json');
  558 |   await writeFile(geometryPath, JSON.stringify(evidence, null, 2));
  559 |   await testInfo.attach('category-grid-geometry.json', {path: geometryPath, contentType: 'application/json'});
  560 | });
  561 | 
  562 | for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  563 |   test(`history keyboard focus stays inside its canvas while resizing (${reducedMotion})`, async ({page}, testInfo) => {
  564 |     await page.emulateMedia({reducedMotion});
  565 |     const trigger = page.getByRole('button', {name: 'View position history for Midnight Drive'});
  566 |     await trigger.press('Enter');
  567 |     const dialog = page.getByRole('dialog', {name: 'Midnight Drive position history'});
  568 |     const close = dialog.getByRole('button', {name: 'Close', exact: true});
  569 |     const slider = dialog.getByRole('slider', {name: 'Saved ranking position'});
  570 |     await slider.click();
  571 |     await expect(slider).toBeFocused();
  572 |     expect(await slider.evaluate(element => element.matches(':focus-visible'))).toBe(false);
  573 |     await page.mouse.move(0, 0);
  574 |     await close.focus();
  575 |     // Native Tab wraps from the last dialog control to the chart; programmatic
  576 |     // focus alone does not reliably enter Firefox's keyboard modality.
  577 |     await close.press('Tab');
  578 |     await expect(slider).toBeFocused();
  579 |     const evidence = [];
  580 |     for (const width of [320,390,600,601,768,1440]) for (const height of [480,1000]) {
  581 |       await page.setViewportSize({width, height});
  582 |       await expect.poll(() => slider.evaluate(element => element.getBoundingClientRect().height)).toBe(width <= 600 ? 232 : 248);
  583 |       const measured = await slider.evaluate(element => {
  584 |         const style = getComputedStyle(element), canvas = element.getBoundingClientRect();
  585 |         const body = element.closest('.history-body')!.getBoundingClientRect();
  586 |         const outlineWidth = parseFloat(style.outlineWidth), offset = parseFloat(style.outlineOffset);
  587 |         const extension = outlineWidth + offset;
  588 |         return {keyboardFocus: element.matches(':focus-visible'), outlineWidth, offset, color: style.outlineColor,
  589 |           outlineInsideCanvas: extension <= 0,
  590 |           horizontalOutlineInsideBody: canvas.left - extension >= body.left - 1 / 60 && canvas.right + extension <= body.right + 1 / 60,
  591 |           overflow: document.documentElement.scrollWidth - innerWidth};
  592 |       });
  593 |       evidence.push({width, height, ...measured});
  594 |       const evidencePath = testInfo.outputPath('keyboard-focus-geometry.json');
  595 |       await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  596 |       expect(measured.keyboardFocus).toBe(true);
> 597 |       expect(measured.outlineWidth).toBe(2);
      |                                     ^ Error: expect(received).toBe(expected) // Object.is equality
  598 |       expect(measured.color).toBe('rgb(159, 255, 200)');
  599 |       expect(measured.outlineInsideCanvas, 'the focus indicator must not extend into the scrolling clip').toBe(true);
  600 |       expect(measured.horizontalOutlineInsideBody).toBe(true);
  601 |       expect(measured.overflow).toBeLessThanOrEqual(1);
  602 |       await expect(slider).toBeFocused();
  603 |       if (height === 1000 && [390,1440].includes(width)) await dialog.screenshot({path: testInfo.outputPath(`history-keyboard-focus-${width}.png`), animations: 'disabled'});
  604 |     }
  605 |     await testInfo.attach('keyboard-focus-geometry.json', {path: testInfo.outputPath('keyboard-focus-geometry.json'), contentType: 'application/json'});
  606 |     await expectNoBlockingAxeViolations(page);
  607 |     await slider.press('Escape');
  608 |     await expect(dialog).toHaveCount(0);
  609 |     await expect(trigger).toBeFocused();
  610 |   });
  611 | }
  612 | 
```