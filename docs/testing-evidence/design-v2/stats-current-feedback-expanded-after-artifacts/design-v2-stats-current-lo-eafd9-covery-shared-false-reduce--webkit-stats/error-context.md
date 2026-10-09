# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-current-load.spec.ts >> current feedback responsive loading/failure/empty and same-range recovery shared=false (reduce)
- Location: e2e/design-v2-stats-current-load.spec.ts:77:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 20
Received: 19
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - text:   
      - generic [ref=f1e9]: Your Top Listening
      - generic [ref=f1e11]:
        - button "Open More tools" [ref=f1e12] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e13]: 
          - generic [ref=f1e14]: More
        - button "Open account and data settings" [ref=f1e15] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e16]: 
  - main "Your Top Listening content" [ref=f1e17]:
    - generic [ref=f1e20]:
      - heading "Your top listening" [level=1] [ref=f1e24]
      - generic [ref=f1e25]:
        - region "Statistics controls" [ref=f1e26]:
          - generic [ref=f1e27]:
            - paragraph [ref=f1e28]: Period
            - group "Ranking period" [ref=f1e29]:
              - button "4 weeks" [pressed] [ref=f1e30] [cursor=pointer]
              - button "6 months" [ref=f1e32] [cursor=pointer]
              - button "1 year" [ref=f1e34] [cursor=pointer]
          - generic [ref=f1e36]:
            - paragraph [ref=f1e37]: Category
            - group "Ranking category" [ref=f1e38]:
              - button "Songs" [pressed] [ref=f1e39] [cursor=pointer]
              - button "Artists" [ref=f1e42] [cursor=pointer]
              - button "Genres" [ref=f1e45] [cursor=pointer]
        - group "Search rankings" [ref=f1e49]:
          - generic [ref=f1e51]:
            - generic [ref=f1e52]: Search songs or artists
            - generic [ref=f1e53]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f1e54]
          - button "Compare dates" [ref=f1e55] [cursor=pointer]
          - switch "Search past rankings" [ref=f1e58] [cursor=pointer]
        - status [ref=f1e63]:
          - generic [ref=f1e64]:
            - paragraph [ref=f1e65]:
              - strong [ref=f1e67]: Loading your Spotify insights…
            - paragraph [ref=f1e68]: Your rankings will appear when this range is ready.
  - navigation "Primary navigation" [ref=f1e85]:
    - link "Playlists" [ref=f1e86] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e87]: 
    - link "Stats" [ref=f1e89] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e90]: 
    - link "History" [ref=f1e92] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e93]: 
  - contentinfo [ref=f1e95]:
    - generic [ref=f1e96]: Powered by Spotify
    - generic [ref=f1e97]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e98] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1   | import {test, expect} from './fixtures';
  2   | import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3   | import {writeFile} from 'node:fs/promises';
  4   | import type {Page, TestInfo} from '@playwright/test';
  5   | 
  6   | async function measureFeedback(page: Page, info: TestInfo, state: string) {
  7   |   await page.evaluate(() => document.fonts.ready);
  8   |   const samples = [];
  9   |   for (const width of [320, 390, 760, 761, 1440, 1920]) for (const height of [480, 1080]) {
  10  |     await page.setViewportSize({width, height});
  11  |     await expect.poll(() => page.evaluate(() => ({width: innerWidth, compact: matchMedia('(max-width:760px)').matches}))).toEqual({width, compact: width <= 760});
  12  |     await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  13  |     const measured = await page.locator('v2-current-stats-feedback').first().evaluate(host => {
  14  |       const section = host.querySelector('section')!, style = getComputedStyle(section), bounds = section.getBoundingClientRect();
  15  |       const panel = host.querySelector('.loading-panel'), progress = host.querySelector<HTMLImageElement>('.progress');
  16  |       const button = host.querySelector('button'), title = host.querySelector('.title,strong');
  17  |       const titleStyle = title ? getComputedStyle(title) : null;
  18  |       const panelStyle = panel ? getComputedStyle(panel) : null;
  19  |       return {width: bounds.width, padding: style.padding, gap: style.gap, radius: style.borderRadius, font: style.fontSize, line: style.lineHeight,
  20  |         titleFont: titleStyle?.fontSize, titleLine: titleStyle?.lineHeight, titleWeight: titleStyle?.fontWeight,
  21  |         panel: panelStyle ? {padding: panelStyle.padding, gap: panelStyle.gap, border: panelStyle.borderTopWidth} : null,
  22  |         progress: progress ? {width: progress.getBoundingClientRect().width, height: progress.getBoundingClientRect().height, naturalWidth: progress.naturalWidth, naturalHeight: progress.naturalHeight, animation: getComputedStyle(progress).animationName} : null,
  23  |         buttonHeight: button?.getBoundingClientRect().height ?? null,
  24  |         skeletons: host.querySelectorAll('.skeleton-row').length,
  25  |         overflow: document.documentElement.scrollWidth - innerWidth,
  26  |         contentWidth: document.querySelector('.v2-page')!.getBoundingClientRect().width};
  27  |     });
  28  |     samples.push({width, height, ...measured});
  29  |     await writeFile(info.outputPath(`${state}-geometry.json`),JSON.stringify(samples,null,2));
  30  |     expect(measured.width).toBe(measured.contentWidth);
  31  |     expect(measured.padding).toBe('16px'); expect(measured.gap).toBe('12px'); expect(measured.radius).toBe('18px');
  32  |     expect(measured.font).toBe('14px'); expect(measured.line).toBe('20px');
  33  |     expect(measured.titleFont).toBe('14px'); expect(measured.titleLine).toBe('20px'); expect(measured.titleWeight).toBe('600');
  34  |     expect(measured.overflow).toBeLessThanOrEqual(1);
  35  |     if (state === 'loading') {
  36  |       expect(measured.panel).toEqual({padding:'24px', gap:'16px', border:'1px'}); expect(measured.skeletons).toBe(3);
  37  |       expect(measured.progress).toMatchObject({width:20, naturalWidth:20, animation:'none'});
  38  |       // SVG fractional intrinsic height is quantized to browser layout units (1/60 or 1/64px).
> 39  |       expect(Math.abs(measured.progress!.height - 19.7753)).toBeLessThanOrEqual(1/60); expect(measured.progress!.naturalHeight).toBe(20);
      |                                                                                                                                 ^ Error: expect(received).toBe(expected) // Object.is equality
  40  |     } else { expect(measured.panel).toBeNull(); expect(measured.skeletons).toBe(0); }
  41  |     expect(measured.buttonHeight).toBe(state === 'unavailable' ? 44 : null);
  42  |     if (height === 1080 && [390,1440].includes(width)) await page.locator('v2-current-stats-feedback').first().screenshot({path:info.outputPath(`${state}-${width}.png`)});
  43  |   }
  44  |   await writeFile(info.outputPath(`${state}-geometry.json`),JSON.stringify(samples,null,2));
  45  | }
  46  | 
  47  | for (const motion of ['no-preference', 'reduce'] as const) {
  48  |   test(`cold Spotify failure differs from empty rankings and offers recovery (${motion})`, async ({page}) => {
  49  |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  50  |     await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page); await seedAuthenticatedBrowser(page);
  51  |     let failed = true;
  52  |     await page.route('https://api.spotify.com/v1/me/top/artists?*', route => failed
  53  |       ? route.fulfill({status: 503, headers: {'Retry-After': '0'}, json: {error: {status: 503, message: 'Isolated current Stats failure'}}})
  54  |       : route.fulfill({json: {items: [{id: 'recovered-artist', name: 'Recovered artist', genres: ['pop'], images: []}], total: 1}}));
  55  |     await page.goto('/new/stats');
  56  |     const main = page.getByRole('main');
  57  |     await expect(main.getByRole('alert')).toBeVisible({timeout: 12_000});
  58  |     await expect(main.getByRole('heading', {name: 'No top songs found', exact: true})).toHaveCount(0);
  59  |     await expect(main.locator('v2-stats-ranking-row')).toHaveCount(0);
  60  |     failed = false;
  61  |     await main.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  62  |     await expect(main.getByText('Test Song', {exact: true})).toBeVisible();
  63  |     await expect(main.getByRole('heading', {name:'Top songs', exact:true})).toBeFocused();
  64  |     await expect(main.getByRole('alert')).toHaveCount(0); await expectNoBlockingAxeViolations(page);
  65  |   });
  66  | }
  67  | 
  68  | test('successful empty Spotify responses produce an empty state without a failure alert', async ({page}) => {
  69  |   await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z')); await mockSpotify(page); await seedAuthenticatedBrowser(page);
  70  |   await page.route('https://api.spotify.com/v1/me/top/**', route => route.fulfill({json: {items: [], total: 0}}));
  71  |   await page.goto('/new/stats'); const main = page.getByRole('main');
  72  |   await expect(main.getByRole('heading', {name: 'No top songs found', exact: true})).toBeVisible();
  73  |   await expect(main.getByRole('alert')).toHaveCount(0); await expectNoBlockingAxeViolations(page);
  74  | });
  75  | 
  76  | for (const shared of [false,true]) for (const motion of ['no-preference','reduce'] as const) {
  77  |   test(`current feedback responsive loading/failure/empty and same-range recovery shared=${shared} (${motion})`, async ({page}, info) => {
  78  |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z')); await page.emulateMedia({reducedMotion:motion});
  79  |     await mockSpotify(page); await seedAuthenticatedBrowser(page);
  80  |     let release!:()=>void; const gate=new Promise<void>(resolve=>release=resolve); let recovered=false;
  81  |     const requests:unknown[]=[];
  82  |     if (shared) await page.route('**/rest/v1/rpc/get_shared_stats_snapshot',async route=>{
  83  |       requests.push(route.request().postDataJSON()); await gate;
  84  |       return recovered ? route.fulfill({json:{ownerUserId:'shared-owner',ownerDisplayName:'Alex',snapshotDate:'2026-10-04',topTracks:[],topArtists:[],topGenres:[]}})
  85  |         : route.fulfill({status:403,json:{message:'Isolated sharing permission failure'}});
  86  |     });
  87  |     else await page.route('https://api.spotify.com/v1/me/top/**',async route=>{
  88  |       await gate; return recovered ? route.fulfill({json:{items:[],total:0}}) : route.fulfill({status:403,json:{error:{status:403,message:'Isolated Spotify failure'}}});
  89  |     });
  90  |     await page.goto(shared?'/new/stats/shared-owner':'/new/stats');
  91  |     const main=page.getByRole('main');
  92  |     await expect(main.locator('[role="status"][aria-busy="true"]')).toBeVisible();
  93  |     await measureFeedback(page,info,'loading'); await expectNoBlockingAxeViolations(page);
  94  |     release(); await expect(main.getByRole('alert')).toBeVisible();
  95  |     await measureFeedback(page,info,'unavailable'); await expectNoBlockingAxeViolations(page);
  96  |     if(shared) await expect(main.getByRole('button',{name:/Compare dates|History|Create playlist/})).toHaveCount(0);
  97  |     recovered=true; await main.getByRole('button',{name:'Retry',exact:true}).press('Enter');
  98  |     await expect(main.getByRole('heading',{name:'No top songs found',exact:true})).toBeVisible();
  99  |     await measureFeedback(page,info,'empty'); await expectNoBlockingAxeViolations(page);
  100 |     if(shared) expect(requests).toEqual([{p_owner_user_id:'shared-owner',p_range:'short_term'},{p_owner_user_id:'shared-owner',p_range:'short_term'}]);
  101 |   });
  102 | }
  103 | 
```