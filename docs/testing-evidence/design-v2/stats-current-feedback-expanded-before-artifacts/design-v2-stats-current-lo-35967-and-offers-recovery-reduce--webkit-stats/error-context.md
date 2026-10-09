# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-current-load.spec.ts >> cold Spotify failure differs from empty rankings and offers recovery (reduce)
- Location: e2e/design-v2-stats-current-load.spec.ts:46:7

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  getByRole('main').getByRole('heading', { name: 'Top songs', exact: true })
Expected: focused
Received: inactive
Timeout:  5000ms

Call log:
  - Expect "toBeFocused" getByRole('main').getByRole('heading', { name: 'Top songs', exact: true }) with timeout 5000ms
  - waiting for getByRole('main').getByRole('heading', { name: 'Top songs', exact: true })
    14 × locator resolved to <h2 _ngcontent-ng-c1299352168="" class="stats-results-heading">Top songs</h2>
       - unexpected value "inactive"

```

```yaml
- heading "Top songs" [level=2]
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
  37  |       expect(measured.progress!.height).toBeCloseTo(19.7753,2); expect(measured.progress!.naturalHeight).toBe(20);
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
> 61  |     await expect(main.getByRole('heading', {name:'Top songs', exact:true})).toBeFocused();
      |                                                                             ^ Error: expect(locator).toBeFocused() failed
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