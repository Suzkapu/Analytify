# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-history.spec.ts >> approved shared snapshot has no private history actions in any category
- Location: e2e/design-v2-stats-history.spec.ts:38:5

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
  - link "Analytify playlists":
    - /url: /new/playlists
    - text: Analytify
  - navigation "Main navigation":
    - link "Playlists":
      - /url: /new/playlists
    - link "Stats":
      - /url: /new/stats
    - link "History":
      - /url: /new/history
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
  - button "Open Shared Song on Spotify":
    - img "Shared Song cover"
  - strong: Shared Song
  - text: Shared Artist
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
    - /url: /new/legal
```

# Test source

```ts
  1   | import {test, expect} from './fixtures';
  2   | import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
  3   | import {writeFile} from 'node:fs/promises';
  4   | import type {Route} from '@playwright/test';
  5   | 
  6   | test.beforeEach(async ({page}) => {
  7   |   await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  8   |   await mockSpotify(page);
  9   |   await seedAuthenticatedBrowser(page);
  10  |   await page.evaluate(async () => {
  11  |     const dates = ['2026-09-05','2026-09-09','2026-09-14','2026-09-18','2026-09-24','2026-09-28','2026-10-04'];
  12  |     const ranks = [15,4,45,20,90,60,3];
  13  |     const song = {id: 'history-song', name: 'Midnight Drive', artists: [{name: 'Example Artist'}], album: {images: []}};
  14  |     await new Promise<void>((resolve, reject) => {
  15  |       const request = indexedDB.open('AnalytifyDB', 4);
  16  |       request.onerror = () => reject(request.error);
  17  |       request.onsuccess = () => {
  18  |         const db = request.result, transaction = db.transaction('statsHistory', 'readwrite');
  19  |         for (const userId of ['e2e-user','e2e-user_dev']) for (let index = 0; index < dates.length; index++) {
  20  |           const other = Array.from({length: ranks[index] - 1}, (_, rank) => ({id: `other-${rank}`, name: `Other ${rank}`, artists: []}));
  21  |           transaction.objectStore('statsHistory').put({userId, range: 'short_term', timestamp: new Date(`${dates[index]}T12:00:00Z`).getTime(),
  22  |             snapshotDate: dates[index], topTracks: [...other, song], topArtists: [], topGenres: [], isLoaded: true});
  23  |         }
  24  |         transaction.oncomplete = () => {db.close(); resolve();};
  25  |         transaction.onerror = () => reject(transaction.error);
  26  |       };
  27  |     });
  28  |   });
  29  |   await page.route('https://api.spotify.com/v1/me/top/tracks?*', route => route.fulfill({json: {items: [], total: 0}}));
  30  |   await page.route('https://api.spotify.com/v1/me/top/artists?*', route => route.fulfill({json: {items: [], total: 0}}));
  31  |   await page.goto('/new/stats');
  32  |   const date = page.getByRole('combobox', {name: 'Ranking date', exact: true});
  33  |   await expect(date).toBeVisible();
  34  |   await date.selectOption(String(new Date('2026-10-04T12:00:00Z').getTime()));
  35  |   await expect(page.getByRole('button', {name: 'View position history for Midnight Drive'})).toBeVisible();
  36  | });
  37  | 
  38  | test('approved shared snapshot has no private history actions in any category', async ({page}) => {
  39  |   const requests: {path:string;body:any}[] = [];
  40  |   await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**', async route => {
  41  |     const path = new URL(route.request().url()).pathname;
  42  |     requests.push({path,body:route.request().postDataJSON()});
  43  |     return route.fulfill({json:path === '/rest/v1/rpc/get_shared_stats_snapshot' ? {
  44  |       ownerUserId:'shared-owner',ownerDisplayName:'Alex',snapshotDate:'2026-10-04',
  45  |       topTracks:[{id:'shared-song',name:'Shared Song',artists:[{name:'Shared Artist'}],album:{images:[]},external_urls:{spotify:'https://open.spotify.com/track/shared-song'}}],
  46  |       topArtists:[{id:'shared-artist',name:'Shared Artist',images:[],external_urls:{spotify:'https://open.spotify.com/artist/shared-artist'}}],
  47  |       topGenres:[{name:'pop',weight:100}]
  48  |     } : []});
  49  |   });
  50  |   await page.goto('/new/stats/shared-owner');
  51  |   await expect(page.getByRole('heading',{name:'Alex top listening'})).toBeVisible();
  52  |   for (const [category,item] of [['Songs','Shared Song'],['Artists','Shared Artist'],['Genres','pop']]) {
  53  |     await page.getByRole('group',{name:'Ranking category'}).getByRole('button',{name:category,exact:true}).click();
  54  |     const main = page.getByRole('main');
> 55  |     await expect(main.getByText(`1. ${item}`,{exact:true})).toBeVisible();
      |                                                             ^ Error: expect(locator).toBeVisible() failed
  56  |     await expect(main.getByRole('button',{name:/View position history/})).toHaveCount(0);
  57  |     await expect(main.getByRole('button',{name:'Search past',exact:true})).toHaveCount(0);
  58  |     await expect(main.getByRole('combobox',{name:'Ranking date',exact:true})).toHaveCount(0);
  59  |     await expect(main.getByRole('combobox',{name:'Compare against',exact:true})).toHaveCount(0);
  60  |     await expect(main.locator('button.v2-genre-row, .v2-artist-history')).toHaveCount(0);
  61  |     await expect(page.getByRole('dialog')).toHaveCount(0);
  62  |     if (category !== 'Genres') await expect(main.getByRole('button',{name:`Open ${item} on Spotify`})).toBeEnabled();
  63  |   }
  64  |   expect(requests.filter(request=>request.path === '/rest/v1/rpc/get_shared_stats_snapshot')).toEqual([
  65  |     {path:'/rest/v1/rpc/get_shared_stats_snapshot',body:{p_owner_user_id:'shared-owner',p_range:'short_term'}}
  66  |   ]);
  67  |   expect(requests.some(request=>request.path.startsWith('/rest/v1/stats_snapshot_'))).toBe(false);
  68  |   await expectNoBlockingAxeViolations(page);
  69  | });
  70  | 
  71  | for (const motion of ['no-preference','reduce'] as const) {
  72  |   test(`saved history preserves real dates, keyboard inspection and responsive geometry with motion ${motion}`, async ({page}, testInfo) => {
  73  |     await page.emulateMedia({reducedMotion: motion});
  74  |     const trigger = page.getByRole('button', {name: 'View position history for Midnight Drive'});
  75  |     await trigger.press('Enter');
  76  |     const dialog = page.getByRole('dialog', {name: 'Midnight Drive position history'});
  77  |     const close = dialog.getByRole('button', {name: 'Close', exact: true});
  78  |     await expect(dialog).toBeVisible();
  79  |     await expect(close).toBeFocused();
  80  |     const slider = dialog.getByRole('slider', {name: 'Saved ranking position'});
  81  |     await expect(slider).toHaveAttribute('aria-valuemax', '7');
  82  |     await slider.focus();
  83  |     await slider.press('End');
  84  |     await expect(slider).toHaveAttribute('aria-valuetext', '4 Oct 2026, position 3');
  85  |     await slider.press('Home');
  86  |     await slider.press('ArrowRight');
  87  |     await expect(slider).toHaveAttribute('aria-valuetext', '9 Sep 2026, position 4');
  88  |     await dialog.getByRole('button', {name: 'View saved positions'}).click();
  89  |     const table = dialog.getByRole('table', {name: 'Saved ranking positions'});
  90  |     await expect(table.getByRole('row')).toHaveCount(8);
  91  |     await expect(table.getByRole('cell').filter({hasText: /^#\d+$/})).toHaveText(['#15','#4','#45','#20','#90','#60','#3']);
  92  |     await expect(table.locator('time').first()).toHaveAttribute('datetime', '2026-09-05');
  93  |     await expectNoBlockingAxeViolations(page);
  94  |     const evidence = [];
  95  |     for (const width of [320,360,390,768,1024,1440,1920]) for (const height of [480,1080]) {
  96  |       await page.setViewportSize({width,height});
  97  |       await expect(dialog).toBeVisible();
  98  |       await expect.poll(async () => dialog.evaluate(element => ({
  99  |         viewportHeight: innerHeight,
  100 |         fits: element.getBoundingClientRect().height <= innerHeight - 32
  101 |       }))).toEqual({viewportHeight: height, fits: true});
  102 |       await expect.poll(async () => slider.locator('svg').evaluate(svg => {
  103 |         const box = svg.getBoundingClientRect(), viewBox = (svg as SVGSVGElement).viewBox.baseVal;
  104 |         return Math.abs(box.width - viewBox.width) + Math.abs(box.height - viewBox.height);
  105 |       })).toBeLessThan(1);
  106 |       const geometry = await dialog.evaluate(element => {
  107 |         const box = element.getBoundingClientRect(), close = element.querySelector('.close-button')!.getBoundingClientRect();
  108 |         const body = element.querySelector('.history-body') as HTMLElement;
  109 |         const overlay = element.parentElement!;
  110 |         return {overflow: document.documentElement.scrollWidth - innerWidth,
  111 |           dialog: {x: box.x, y: box.y, width: box.width, height: box.height}, close: {y: close.y, bottom: close.bottom, height: close.height},
  112 |           body: {height: body.clientHeight, scrollHeight: body.scrollHeight, overflow: getComputedStyle(body).overflowY},
  113 |           blur: getComputedStyle(overlay).backdropFilter,
  114 |           occluded: [[box.x + box.width / 2, box.y + 8], [box.x + box.width / 2, box.bottom - 8],
  115 |             [box.x + 8, box.y + box.height / 2], [box.right - 8, box.y + box.height / 2]]
  116 |             .filter(([x,y]) => !element.contains(document.elementFromPoint(x,y))).length,
  117 |           marker: element.querySelector('.position-marker')!.getBoundingClientRect().width};
  118 |       });
  119 |       expect(geometry.overflow).toBeLessThanOrEqual(1);
  120 |       expect(geometry.dialog.x).toBeGreaterThanOrEqual(15);
  121 |       expect(geometry.dialog.y).toBeGreaterThanOrEqual(15);
  122 |       expect(geometry.close.height).toBe(44);
  123 |       expect(geometry.close.bottom).toBeLessThanOrEqual(height - 15);
  124 |       expect(geometry.body.overflow).toBe('auto');
  125 |       expect(geometry.blur).toBe('blur(12px)');
  126 |       expect(geometry.occluded).toBe(0);
  127 |       expect([6,10]).toContain(geometry.marker);
  128 |       if (height === 480) expect(geometry.body.scrollHeight).toBeGreaterThan(geometry.body.height);
  129 |       evidence.push({width,height,...geometry});
  130 |     }
  131 |     const geometryPath = testInfo.outputPath('responsive-history-geometry.json');
  132 |     await writeFile(geometryPath, JSON.stringify(evidence,null,2) + '\n');
  133 |     await testInfo.attach('responsive-history-geometry', {path: geometryPath,contentType:'application/json'});
  134 |     await page.setViewportSize({width:1440,height:1080});
  135 |     await dialog.getByRole('button', {name: 'Hide saved positions'}).click();
  136 |     await expect(table).toHaveCount(0);
  137 |     await close.focus();
  138 |     await close.press('Shift+Tab');
  139 |     await expect(dialog.getByRole('button',{name:'View saved positions'})).toBeFocused();
  140 |     await dialog.screenshot({path:testInfo.outputPath(`history-selected-${motion}-1440.png`),animations:'disabled'});
  141 |     await page.keyboard.press('Escape');
  142 |     await expect(dialog).toHaveCount(0);
  143 |     await expect(trigger).toBeFocused();
  144 |   });
  145 | }
  146 | 
  147 | for (const motion of ['no-preference','reduce'] as const) for (const failureStatus of [403,503,200]) {
  148 |   test(`cloud failure ${failureStatus === 200 ? 'malformed response' : failureStatus} preserves local history and recovers with one scoped retry, motion ${motion}`, async ({page},testInfo) => {
  149 |     await page.emulateMedia({reducedMotion: motion});
  150 |     const pending: Route[] = [];
  151 |     const queries: URL[] = [];
  152 |     await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**', async route => {
  153 |       const url = new URL(route.request().url());
  154 |       if (url.pathname === '/rest/v1/stats_snapshot_tracks' && url.searchParams.get('select')?.startsWith('rank,')) {
  155 |         queries.push(url);
```