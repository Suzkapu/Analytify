# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-flames.spec.ts >> static canonical row captures >> canonical History action states retain geometry and keyboard recovery at 1440px
- Location: e2e/design-v2-stats-flames.spec.ts:263:9

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('.v2-ranking-row').nth(1).getByRole('button', { name: 'View position history for Paper Planes' })
  56 pixels (ratio 0.02 of all image pixels) are different.

  Snapshot: stats-history-action-default-1440.png

Call log:
  - Expect "toHaveScreenshot(stats-history-action-default-1440.png)" locator('.v2-ranking-row').nth(1).getByRole('button', { name: 'View position history for Paper Planes' }) with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('.v2-ranking-row').nth(1).getByRole('button', { name: 'View position history for Paper Planes' })
    - locator resolved to <button type="button" v2button="secondary" _ngcontent-ng-c2140563739="" aria-label="View position history for Paper Planes" class="history v2-ranking-history v2-button v2-button--secondary">History</button>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 56 pixels (ratio 0.02 of all image pixels) are different.
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
  - 56 pixels (ratio 0.02 of all image pixels) are different.

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
        - group "Search rankings" [ref=f2e52]:
          - generic [ref=f2e54]:
            - generic [ref=f2e55]: Search songs or artists
            - generic [ref=f2e56]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f2e57]
          - button "Compare dates" [ref=f2e58] [cursor=pointer]
          - button "Search past" [ref=f2e60] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e61]: 
            - text: Search past
        - generic [ref=f2e62]:
          - generic [ref=f2e63]:
            - group "Rank 1. New" [ref=f2e64]:
              - img "Top 10 debut" [ref=f2e66]
              - generic [aria-hidden] [ref=f2e68]: "1"
              - generic [aria-hidden] [ref=f2e69]: ✦
            - button "Open Midnight Drive on Spotify" [ref=f2e70] [cursor=pointer]:
              - img "Midnight Drive cover" [ref=f2e71]
            - generic [ref=f2e72]:
              - strong [ref=f2e73]: Midnight Drive
              - generic [ref=f2e74]: Neon Coast
            - button "View position history for Midnight Drive" [ref=f2e75] [cursor=pointer]: History
          - generic [ref=f2e76]:
            - group "Rank 2. ↑ 15 places" [ref=f2e77]:
              - img "Hot mover" [ref=f2e79]
              - generic [aria-hidden] [ref=f2e81]: "2"
              - generic [aria-hidden] [ref=f2e82]: ↑ 15
            - button "Open Paper Planes on Spotify" [active] [ref=f2e83] [cursor=pointer]:
              - img "Paper Planes cover" [ref=f2e84]
            - generic [ref=f2e85]:
              - strong [ref=f2e86]: Paper Planes
              - generic [ref=f2e87]: Luma
            - button "View position history for Paper Planes" [ref=f2e88] [cursor=pointer]: History
          - generic [ref=f2e89]:
            - group "Rank 3. Unchanged" [ref=f2e90]:
              - generic [aria-hidden] [ref=f2e91]: "3"
              - generic [aria-hidden] [ref=f2e92]: —
            - button "Open Known song 2 on Spotify" [ref=f2e93] [cursor=pointer]:
              - img "Known song 2 cover" [ref=f2e94]
            - generic [ref=f2e95]:
              - strong [ref=f2e96]: Known song 2
              - generic [ref=f2e97]: Example Artist
            - button "View position history for Known song 2" [ref=f2e98] [cursor=pointer]: History
        - button " Create playlist" [ref=f2e99] [cursor=pointer]:
          - generic [ref=f2e100]: 
          - text: Create playlist
  - text:   
  - contentinfo [ref=f2e101]:
    - generic [ref=f2e102]: Powered by Spotify
    - generic [ref=f2e103]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e104] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  203 |     const before = await artwork.boundingBox();
  204 |     await expect(artwork).toHaveCSS('border-top-color', 'rgb(53, 231, 131)');
  205 |     await artwork.hover();
  206 |     await expect(artwork).toHaveCSS('border-top-color', 'rgb(53, 231, 131)');
  207 |     expect(await artwork.boundingBox()).toEqual(before);
  208 |     await artistSearch.fill('');
  209 |     await expect(page.getByRole('button', {name: 'Open Debut artist on Spotify'})).toBeDisabled();
  210 |     await expectNoBlockingAxeViolations(page);
  211 |     const geometryPath=testInfo.outputPath('flame-responsive-geometry.json');
  212 |     await writeFile(geometryPath,JSON.stringify({motion,evidence},null,2)+'\n');
  213 |     await testInfo.attach('flame-responsive-geometry.json', {path:geometryPath,contentType:'application/json'});
  214 |   });
  215 | }
  216 | 
  217 | test.describe('static canonical row captures', () => {
  218 |   // Capture canonical colors after suppressing decorative motion from startup.
  219 |   // Normal and reduced motion remain covered by the resizing workflows above.
  220 |   test.use({reducedMotion: 'reduce'});
  221 |   test.beforeEach(async ({page}) => {
  222 |     await mockCanonicalArtwork(page);
  223 |     // Use canonical labels and sample artwork to compare the designed 80px row;
  224 |     // longer real-data labels are exercised by the separate reflow workflows.
  225 |     await page.route('https://api.spotify.com/v1/me/top/tracks?*',route=>route.fulfill({json:{items:[
  226 |       {...currentTracks[0],album:{images:[{url:canonicalArtworkUrl}]},name:'Midnight Drive',artists:[{id:'artist',name:'Neon Coast'}]},
  227 |       {...currentTracks[1],album:{images:[{url:canonicalArtworkUrl}]},name:'Paper Planes',artists:[{id:'artist',name:'Luma'}]},currentTracks[2]
  228 |     ],total:3}}));
  229 |     await page.route('https://api.spotify.com/v1/me/top/artists?*',route=>route.fulfill({json:{items:[
  230 |       {...currentArtists[0],images:[{url:canonicalArtworkUrl}],name:'Neon Coast'},{...currentArtists[1],images:[{url:canonicalArtworkUrl}],name:'Luma'},currentArtists[2]
  231 |     ],total:3}}));
  232 |     await clearCurrentFixtureStats(page);
  233 |     await page.reload();
  234 |     await expect(page.locator('.v2-ranking-row strong').first()).toHaveText('Midnight Drive');
  235 |   });
  236 | 
  237 |   for (const width of [390, 1440]) {
  238 |     test(`canonical artist row geometry at ${width}px`, async ({page}, testInfo) => {
  239 |       await page.setViewportSize({width, height: 900});
  240 |       await page.getByRole('button', {name: 'Artists', exact: true}).click();
  241 |       const row = page.locator('.v2-ranked-artist').nth(1);
  242 |       await row.evaluate(element => element.scrollIntoView({block: 'center'}));
  243 |       await expect(row.getByRole('button', {name: 'View position history for Luma'}))
  244 |         .toHaveCSS('border-top-color', 'rgb(52, 66, 58)');
  245 |       await recordCanonicalRow(row, testInfo, 'artist');
  246 |       await expect(row).toHaveScreenshot(`stats-artist-row-${width}.png`, {animations: 'disabled'});
  247 |     });
  248 |   }
  249 |   for (const width of [390, 1440]) {
  250 |     test(`canonical flame colors and placement at ${width}px`, async ({page}, testInfo) => {
  251 |       await page.setViewportSize({width, height: 900});
  252 |       await expect(page.getByRole('img', {name: 'Top 10 debut', exact: true})).toHaveCSS('fill', 'rgb(119, 184, 255)');
  253 |       await expect(page.getByRole('img', {name: 'Hot mover', exact: true})).toHaveCSS('fill', 'rgb(255, 155, 84)');
  254 |       await page.locator('.v2-ranking-row').first().evaluate(row => row.scrollIntoView({block: 'center'}));
  255 |       await recordCanonicalRow(page.locator('.v2-ranking-row').first(), testInfo, 'debut');
  256 |       await expect(page.locator('.v2-ranking-row').first()).toHaveScreenshot(`stats-debut-row-${width}.png`, {animations: 'disabled'});
  257 |       await page.locator('.v2-ranking-row').nth(1).evaluate(row => row.scrollIntoView({block: 'center'}));
  258 |       await recordCanonicalRow(page.locator('.v2-ranking-row').nth(1), testInfo, 'hot-mover');
  259 |       await expect(page.locator('.v2-ranking-row').nth(1)).toHaveScreenshot(`stats-hot-mover-row-${width}.png`, {animations: 'disabled'});
  260 |     });
  261 |   }
  262 |   for (const width of [390,1440]) {
  263 |     test(`canonical History action states retain geometry and keyboard recovery at ${width}px`,async({page},testInfo)=>{
  264 |       await page.setViewportSize({width,height:900});
  265 |       const row=page.locator('.v2-ranking-row').nth(1);
  266 |       await page.evaluate(()=>document.fonts.ready);
  267 |       await row.evaluate(element=>element.scrollIntoView({block:'center'}));
  268 |       const history=row.getByRole('button',{name:'View position history for Paper Planes'});
  269 |       const artwork=row.getByRole('button',{name:'Open Paper Planes on Spotify'});
  270 |       // Establish actionability before measuring; hover can legitimately scroll
  271 |       // a control away from the fixed mobile navigation.
  272 |       await history.hover();
  273 |       await page.mouse.move(0,0);
  274 |       await recordCanonicalRow(row,testInfo,'history-action-row');
  275 |       await expect(history).toHaveCSS('background-color','rgb(13, 19, 15)');
  276 |       await expect(history).toHaveCSS('border-top-color','rgb(52, 66, 58)');
  277 |       await expect(history).toHaveCSS('border-top-width','1px');
  278 |       const initial=await history.boundingBox();
  279 |       expect(initial?.height).toBe(44);await expectIntrinsicHistory(history);
  280 |       await history.hover();
  281 |       await expect(history).toHaveCSS('background-color','rgb(24, 32, 25)');
  282 |       await expect(history).toHaveCSS('border-top-color','rgb(107, 125, 113)');
  283 |       expect(await history.boundingBox()).toEqual(initial);
  284 |       await artwork.focus();await artwork.press('Tab');
  285 |       await expect(history).toBeFocused();
  286 |       await expect(history).toHaveCSS('border-top-width','2px');
  287 |       await expect(history).toHaveCSS('border-top-color','rgb(159, 255, 200)');
  288 |       await expect(history).toHaveCSS('background-color','rgb(18, 24, 20)');
  289 |       await expect(history).toHaveCSS('outline-style','none');
  290 |       await history.hover();
  291 |       await expect(history).toHaveCSS('border-top-width','2px');
  292 |       await expect(history).toHaveCSS('background-color','rgb(18, 24, 20)');
  293 |       expect(await history.boundingBox()).toEqual(initial);
  294 |       await history.press('Enter');
  295 |       await expect(page.getByRole('dialog',{name:'Paper Planes position history'})).toBeVisible();
  296 |       await page.keyboard.press('Escape');
  297 |       await expect(page.getByRole('dialog')).toHaveCount(0);
  298 |       await expect(history).toBeFocused();
  299 |       await expect(history).toHaveCSS('border-top-width','2px');
  300 |       await expectNoBlockingAxeViolations(page);
  301 |       await artwork.focus();await page.mouse.move(0,0);
  302 |       await expect(history).toHaveCSS('background-color','rgb(13, 19, 15)');
> 303 |       await expect(history).toHaveScreenshot(`stats-history-action-default-${width}.png`,{animations:'disabled'});
      |                             ^ Error: expect(locator).toHaveScreenshot(expected) failed
  304 |       await history.hover();
  305 |       await expect(history).toHaveCSS('background-color','rgb(24, 32, 25)');
  306 |       await expect(history).toHaveScreenshot(`stats-history-action-hover-${width}.png`,{animations:'disabled'});
  307 |       await artwork.focus();await artwork.press('Tab');
  308 |       await expect(history).toHaveCSS('border-top-width','2px');
  309 |       await expect(history).toHaveScreenshot(`stats-history-action-focus-${width}.png`,{animations:'disabled'});
  310 |       const path=testInfo.outputPath('history-action-state-geometry.json');
  311 |       await writeFile(path,JSON.stringify({width,initial,final:await history.boundingBox()},null,2)+'\n');
  312 |       await testInfo.attach('history-action-state-geometry',{path,contentType:'application/json'});
  313 |     });
  314 |   }
  315 | 
  316 | });
  317 | 
  318 | test('song ranking artwork and History follow the canonical independent action workflow', async ({page}) => {
  319 |   await page.setViewportSize({width:390,height:900});
  320 |   await page.getByRole('searchbox',{name:'Search songs or artists'}).fill('Known song 16');
  321 |   const row=page.locator('.v2-ranking-row');
  322 |   const artwork=row.getByRole('button',{name:'Open Known song 16 on Spotify'});
  323 |   const history=row.getByRole('button',{name:'View position history for Known song 16'});
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
```