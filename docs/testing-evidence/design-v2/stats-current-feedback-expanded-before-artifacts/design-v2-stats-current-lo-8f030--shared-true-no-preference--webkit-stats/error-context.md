# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-current-load.spec.ts >> current feedback responsive loading/failure/empty and same-range recovery shared=true (no-preference)
- Location: e2e/design-v2-stats-current-load.spec.ts:75:7

# Error details

```
Error: expect(received).toBeCloseTo(expected, precision)

Expected: 19.7753
Received: 19.765625

Expected precision:    2
Expected difference: < 0.005
Received difference:   0.009675000000001432
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - text:   
      - generic [ref=f1e9]: Shared Top Listening
      - generic [ref=f1e11]:
        - button "Open More tools" [ref=f1e12] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e13]: 
          - generic [ref=f1e14]: More
        - button "Open account and data settings" [ref=f1e15] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e16]: 
  - main "Shared Top Listening content" [ref=f1e17]:
    - generic [ref=f1e20]:
      - generic [ref=f1e23]:
        - heading "Shared · Listening stats" [level=1] [ref=f1e24]
        - button "Back" [ref=f1e25] [cursor=pointer]
      - generic [ref=f1e26]:
        - region "Statistics controls" [ref=f1e27]:
          - generic [ref=f1e28]:
            - paragraph [ref=f1e29]: Period
            - group "Ranking period" [ref=f1e30]:
              - button "4 weeks" [pressed] [ref=f1e31] [cursor=pointer]
              - button "6 months" [ref=f1e33] [cursor=pointer]
              - button "1 year" [ref=f1e35] [cursor=pointer]
          - generic [ref=f1e37]:
            - paragraph [ref=f1e38]: Category
            - group "Ranking category" [ref=f1e39]:
              - button "Songs" [pressed] [ref=f1e40] [cursor=pointer]
              - button "Artists" [ref=f1e43] [cursor=pointer]
              - button "Genres" [ref=f1e46] [cursor=pointer]
        - group "Search rankings" [ref=f1e50]:
          - generic [ref=f1e52]:
            - generic [ref=f1e53]: Search songs or artists
            - generic [ref=f1e54]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f1e55]
        - status [ref=f1e57]:
          - generic [ref=f1e58]:
            - paragraph [ref=f1e59]:
              - strong [ref=f1e60]: Loading shared Spotify insights…
            - paragraph [ref=f1e61]: This read-only snapshot will appear when the range is ready.
  - navigation "Primary navigation" [ref=f1e78]:
    - link "Playlists" [ref=f1e79] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e80]: 
    - link "Stats" [ref=f1e82] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e83]: 
    - link "History" [ref=f1e85] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e86]: 
  - contentinfo [ref=f1e88]:
    - generic [ref=f1e89]: Powered by Spotify
    - generic [ref=f1e90]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e91] [cursor=pointer]:
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
  29  |     expect(measured.width).toBe(measured.contentWidth);
  30  |     expect(measured.padding).toBe('16px'); expect(measured.gap).toBe('12px'); expect(measured.radius).toBe('18px');
  31  |     expect(measured.font).toBe('14px'); expect(measured.line).toBe('20px');
  32  |     expect(measured.titleFont).toBe('14px'); expect(measured.titleLine).toBe('20px'); expect(measured.titleWeight).toBe('600');
  33  |     expect(measured.overflow).toBeLessThanOrEqual(1);
  34  |     if (state === 'loading') {
  35  |       expect(measured.panel).toEqual({padding:'24px', gap:'16px', border:'1px'}); expect(measured.skeletons).toBe(3);
  36  |       expect(measured.progress).toMatchObject({width:20, naturalWidth:20, animation:'none'});
> 37  |       expect(measured.progress!.height).toBeCloseTo(19.7753,2); expect(measured.progress!.naturalHeight).toBe(20);
      |                                         ^ Error: expect(received).toBeCloseTo(expected, precision)
  38  |     } else { expect(measured.panel).toBeNull(); expect(measured.skeletons).toBe(0); }
  39  |     expect(measured.buttonHeight).toBe(state === 'unavailable' ? 44 : null);
  40  |     if (height === 1080 && [390,1440].includes(width)) await page.locator('v2-current-stats-feedback').first().screenshot({path:info.outputPath(`${state}-${width}.png`)});
  41  |   }
  42  |   await writeFile(info.outputPath(`${state}-geometry.json`),JSON.stringify(samples,null,2));
  43  | }
  44  | 
  45  | for (const motion of ['no-preference', 'reduce'] as const) {
  46  |   test(`cold Spotify failure differs from empty rankings and offers recovery (${motion})`, async ({page}) => {
  47  |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  48  |     await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page); await seedAuthenticatedBrowser(page);
  49  |     let failed = true;
  50  |     await page.route('https://api.spotify.com/v1/me/top/artists?*', route => failed
  51  |       ? route.fulfill({status: 503, headers: {'Retry-After': '0'}, json: {error: {status: 503, message: 'Isolated current Stats failure'}}})
  52  |       : route.fulfill({json: {items: [{id: 'recovered-artist', name: 'Recovered artist', genres: ['pop'], images: []}], total: 1}}));
  53  |     await page.goto('/new/stats');
  54  |     const main = page.getByRole('main');
  55  |     await expect(main.getByRole('alert')).toBeVisible({timeout: 12_000});
  56  |     await expect(main.getByRole('heading', {name: 'No top songs found', exact: true})).toHaveCount(0);
  57  |     await expect(main.locator('v2-stats-ranking-row')).toHaveCount(0);
  58  |     failed = false;
  59  |     await main.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  60  |     await expect(main.getByText('Test Song', {exact: true})).toBeVisible();
  61  |     await expect(main.getByRole('heading', {name:'Top songs', exact:true})).toBeFocused();
  62  |     await expect(main.getByRole('alert')).toHaveCount(0); await expectNoBlockingAxeViolations(page);
  63  |   });
  64  | }
  65  | 
  66  | test('successful empty Spotify responses produce an empty state without a failure alert', async ({page}) => {
  67  |   await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z')); await mockSpotify(page); await seedAuthenticatedBrowser(page);
  68  |   await page.route('https://api.spotify.com/v1/me/top/**', route => route.fulfill({json: {items: [], total: 0}}));
  69  |   await page.goto('/new/stats'); const main = page.getByRole('main');
  70  |   await expect(main.getByRole('heading', {name: 'No top songs found', exact: true})).toBeVisible();
  71  |   await expect(main.getByRole('alert')).toHaveCount(0); await expectNoBlockingAxeViolations(page);
  72  | });
  73  | 
  74  | for (const shared of [false,true]) for (const motion of ['no-preference','reduce'] as const) {
  75  |   test(`current feedback responsive loading/failure/empty and same-range recovery shared=${shared} (${motion})`, async ({page}, info) => {
  76  |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z')); await page.emulateMedia({reducedMotion:motion});
  77  |     await mockSpotify(page); await seedAuthenticatedBrowser(page);
  78  |     let release!:()=>void; const gate=new Promise<void>(resolve=>release=resolve); let recovered=false;
  79  |     const requests:unknown[]=[];
  80  |     if (shared) await page.route('**/rest/v1/rpc/get_shared_stats_snapshot',async route=>{
  81  |       requests.push(route.request().postDataJSON()); await gate;
  82  |       return recovered ? route.fulfill({json:{ownerUserId:'shared-owner',ownerDisplayName:'Alex',snapshotDate:'2026-10-04',topTracks:[],topArtists:[],topGenres:[]}})
  83  |         : route.fulfill({status:403,json:{message:'Isolated sharing permission failure'}});
  84  |     });
  85  |     else await page.route('https://api.spotify.com/v1/me/top/**',async route=>{
  86  |       await gate; return recovered ? route.fulfill({json:{items:[],total:0}}) : route.fulfill({status:403,json:{error:{status:403,message:'Isolated Spotify failure'}}});
  87  |     });
  88  |     await page.goto(shared?'/new/stats/shared-owner':'/new/stats');
  89  |     const main=page.getByRole('main');
  90  |     await expect(main.locator('[role="status"][aria-busy="true"]')).toBeVisible();
  91  |     await measureFeedback(page,info,'loading'); await expectNoBlockingAxeViolations(page);
  92  |     release(); await expect(main.getByRole('alert')).toBeVisible();
  93  |     await measureFeedback(page,info,'unavailable'); await expectNoBlockingAxeViolations(page);
  94  |     if(shared) await expect(main.getByRole('button',{name:/Compare dates|History|Create playlist/})).toHaveCount(0);
  95  |     recovered=true; await main.getByRole('button',{name:'Retry',exact:true}).press('Enter');
  96  |     await expect(main.getByRole('heading',{name:'No top songs found',exact:true})).toBeVisible();
  97  |     await measureFeedback(page,info,'empty'); await expectNoBlockingAxeViolations(page);
  98  |     if(shared) expect(requests).toEqual([{p_owner_user_id:'shared-owner',p_range:'short_term'},{p_owner_user_id:'shared-owner',p_range:'short_term'}]);
  99  |   });
  100 | }
  101 | 
```