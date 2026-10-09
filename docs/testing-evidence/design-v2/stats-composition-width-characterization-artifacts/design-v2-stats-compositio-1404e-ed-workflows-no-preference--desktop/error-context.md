# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-composition.spec.ts >> Stats content composition preserves shared workflows (no-preference)
- Location: e2e/design-v2-stats-composition.spec.ts:9:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 320
Received: 288
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 320
Received: 288
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 390
Received: 358
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 390
Received: 358
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 760
Received: 728
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 760
Received: 728
```

# Page snapshot

```yaml
- generic [ref=f3e5]:
  - link "Skip to main content" [ref=f3e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f3e7]:
    - generic [ref=f3e8]:
      - link "Analytify playlists" [ref=f3e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f3e10]: Analytify
      - navigation "Main navigation" [ref=f3e11]:
        - link "Playlists" [ref=f3e12] [cursor=pointer]:
          - /url: /new/playlists
          - generic [aria-hidden] [ref=f3e13]: 
        - link "Stats" [ref=f3e15] [cursor=pointer]:
          - /url: /new/stats
          - generic [aria-hidden] [ref=f3e16]: 
        - link "History" [ref=f3e18] [cursor=pointer]:
          - /url: /new/history
          - generic [aria-hidden] [ref=f3e19]: 
      - generic [ref=f3e21]:
        - button "Open More tools" [ref=f3e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f3e23]: 
          - generic [ref=f3e24]: More
        - button "Open account and data settings" [ref=f3e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f3e26]: 
  - main "Your Top Listening content" [ref=f3e27]:
    - generic [ref=f3e30]:
      - generic [ref=f3e32]:
        - heading "Your top listening" [level=1] [ref=f3e34]
        - paragraph [ref=f3e35]: Your songs, artists and genres, ranked over time.
      - generic [ref=f3e36]:
        - region "Statistics controls" [ref=f3e37]:
          - generic [ref=f3e38]:
            - paragraph [ref=f3e39]: Period
            - group "Ranking period" [ref=f3e40]:
              - button "4 weeks" [pressed] [ref=f3e41] [cursor=pointer]
              - button "6 months" [ref=f3e43] [cursor=pointer]
              - button "1 year" [ref=f3e45] [cursor=pointer]
          - generic [ref=f3e47]:
            - paragraph [ref=f3e48]: Category
            - group "Ranking category" [ref=f3e49]:
              - button "Songs" [pressed] [ref=f3e50] [cursor=pointer]
              - button "Artists" [ref=f3e53] [cursor=pointer]
              - button "Genres" [ref=f3e56] [cursor=pointer]
        - group "Search rankings" [ref=f3e60]:
          - generic [ref=f3e62]:
            - generic [ref=f3e63]: Search songs or artists
            - generic [ref=f3e64]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f3e65]
          - button "Compare dates" [ref=f3e66] [cursor=pointer]
          - switch "Search past rankings" [ref=f3e69] [cursor=pointer]
        - region "Rankings" [ref=f3e73]:
          - heading "Top songs" [level=2] [ref=f3e74]
          - generic [ref=f3e76]:
            - group "Rank 1. Unchanged" [ref=f3e77]:
              - generic [aria-hidden] [ref=f3e78]: "1"
              - generic [aria-hidden] [ref=f3e79]: —
            - button "Open Test Song on Spotify" [disabled] [ref=f3e80]:
              - img "Test Song cover" [ref=f3e81]
            - generic [ref=f3e82]:
              - strong [ref=f3e83]: Test Song
              - generic [ref=f3e84]: Test Artist
            - button "View position history for Test Song" [ref=f3e85] [cursor=pointer]: History
          - button "Create playlist from these songs" [ref=f3e87] [cursor=pointer]:
            - generic [aria-hidden] [ref=f3e88]: 
            - text: Create playlist from these songs
  - text:   
  - contentinfo [ref=f3e89]:
    - generic [ref=f3e90]: Powered by Spotify
    - generic [ref=f3e91]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f3e92] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1   | import {writeFile} from 'node:fs/promises';
  2   | import {test, expect} from './fixtures';
  3   | import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
  4   | 
  5   | const categories = ['Songs', 'Artists', 'Genres'] as const;
  6   | const periods = [['4 weeks', 'short_term'], ['6 months', 'medium_term'], ['1 year', 'long_term']] as const;
  7   | 
  8   | for (const shared of [false, true]) for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  9   |   test(`Stats content composition preserves ${shared ? 'shared' : 'owner'} workflows (${reducedMotion})`, async ({page}, testInfo) => {
  10  |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  11  |     await page.emulateMedia({reducedMotion});
  12  |     await mockSpotify(page);
  13  |     await seedAuthenticatedBrowser(page);
  14  |     const sharedRequests: unknown[] = [];
  15  |     await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**', route => {
  16  |       if (new URL(route.request().url()).pathname === '/rest/v1/rpc/get_shared_stats_snapshot') {
  17  |         const body = route.request().postDataJSON(); sharedRequests.push(body);
  18  |         return route.fulfill({json: {ownerUserId: 'shared-owner', ownerDisplayName: 'Alex', snapshotDate: '2026-10-04',
  19  |           topTracks: [{id: 'shared-song', name: `Shared Song ${body.p_range}`, artists: [{name: 'Shared Artist'}], album: {images: []}, external_urls: {spotify: 'https://open.spotify.com/track/shared-song'}}],
  20  |           topArtists: [{id: 'shared-artist', name: `Shared Artist ${body.p_range}`, images: [], external_urls: {spotify: 'https://open.spotify.com/artist/shared-artist'}}],
  21  |           topGenres: [{name: `Shared genre ${body.p_range}`, weight: 100}]}});
  22  |       }
  23  |       return route.fulfill({json: []});
  24  |     });
  25  |     if (shared) { await page.goto('/new/stats'); await expect(page.getByRole('heading', {name: 'Your top listening', exact: true})).toBeVisible(); await expect(page.getByRole('main').getByText('Test Song', {exact: true})).toBeVisible(); }
  26  |     await page.goto(shared ? '/new/stats/shared-owner' : '/new/stats');
  27  |     const main = page.getByRole('main');
  28  |     await expect(main.locator('v2-stats-ranking-row')).toHaveCount(1);
  29  |     await page.evaluate(() => document.fonts.ready);
  30  |     expect.soft(await main.getByRole('button', {name: 'Back', exact: true}).count()).toBe(shared ? 1 : 0);
  31  |     const evidence = [];
  32  |     for (const width of [320,390,760,761,1440,1920]) for (const height of [480,1080]) {
  33  |       await page.setViewportSize({width, height});
  34  |       await expect.poll(() => page.evaluate(() => ({width: innerWidth, compact: matchMedia('(max-width: 760px)').matches}))).toEqual({width, compact: width <= 760});
  35  |       await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  36  |       const measured = await main.evaluate(element => {
  37  |         const heading = element.querySelector('h1')!, header = heading.closest('header')!;
  38  |         const description = element.querySelector('.v2-page__description')!;
  39  |         const sections = element.querySelector('.v2-page__sections')!, controls = element.querySelector('.stats-choice-controls')!;
  40  |         const titleStyle = getComputedStyle(heading), descriptionStyle = getComputedStyle(description);
  41  |         const headerBox = header.getBoundingClientRect(), controlBox = controls.getBoundingClientRect();
  42  |         const categoryHeading = element.querySelector('.stats-results-heading');
  43  |         const headingStyle = categoryHeading ? getComputedStyle(categoryHeading) : null;
  44  |         const resultGroup = element.querySelector('.stats-resolved-results');
  45  |         const back = element.querySelector<HTMLButtonElement>('.v2-page__back'), backImage = back?.querySelector('img');
  46  |         const create = element.querySelector<HTMLButtonElement>('.stats-create-playlist'), actionGroup = element.querySelector('.stats-playlist-action');
  47  |         const actionBox = create?.getBoundingClientRect(), groupBox = actionGroup?.getBoundingClientRect();
  48  |         return {title: heading.textContent, fontSize: parseFloat(titleStyle.fontSize), lineHeight: parseFloat(titleStyle.lineHeight), letterSpacing: titleStyle.letterSpacing,
  49  |           eyebrow: element.querySelector('.v2-page__eyebrow')?.textContent ?? '',
  50  |           description: description.textContent, descriptionVisible: description.getBoundingClientRect().height > 0,
  51  |           descriptionFont: parseFloat(descriptionStyle.fontSize), descriptionLine: parseFloat(descriptionStyle.lineHeight),
  52  |           headingToControls: controlBox.top - headerBox.bottom, contentGap: parseFloat(getComputedStyle(sections).rowGap),
  53  |           categoryHeading: categoryHeading?.textContent?.trim() ?? '', categoryFont: headingStyle ? parseFloat(headingStyle.fontSize) : null,
  54  |           categoryLine: headingStyle ? parseFloat(headingStyle.lineHeight) : null, resultGap: resultGroup ? parseFloat(getComputedStyle(resultGroup).rowGap) : null,
  55  |           back: back ? {width: back.offsetWidth, height: back.offsetHeight, imageWidth: backImage?.width, imageHeight: backImage?.height, naturalWidth: backImage?.naturalWidth, naturalHeight: backImage?.naturalHeight} : null,
  56  |           create: create && actionBox && groupBox ? {label: create.textContent?.trim(), width: create.offsetWidth, height: create.offsetHeight,
  57  |             centered: Math.abs((actionBox.left + actionBox.right) / 2 - (groupBox.left + groupBox.right) / 2) <= 1 / 60,
  58  |             icon: create.querySelector('i')?.className, iconWidth: create.querySelector('i')?.getBoundingClientRect().width} : null,
  59  |           pageWidth: element.querySelector('.v2-page')!.getBoundingClientRect().width, availableWidth: element.getBoundingClientRect().width,
  60  |           overflow: document.documentElement.scrollWidth - innerWidth};
  61  |       });
  62  |       evidence.push({width, height, ...measured});
  63  |       const evidencePath = testInfo.outputPath('stats-content-composition.json');
  64  |       await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  65  |       if (height === 1080 && [390,1440].includes(width)) await main.locator('.v2-page').screenshot({path: testInfo.outputPath(`stats-content-${width}.png`), animations: 'disabled'});
  66  |       expect.soft(measured.title).toBe(shared ? 'Alex · Listening stats' : 'Your top listening');
  67  |       expect.soft(measured.eyebrow).toBe('');
  68  |       expect.soft(measured.fontSize).toBe(width <= 760 ? 28 : 36);
  69  |       expect.soft(measured.lineHeight).toBe(width <= 760 ? 36 : 44);
  70  |       expect.soft(measured.letterSpacing).toBe('normal');
  71  |       expect.soft(measured.descriptionVisible).toBe(width > 760);
  72  |       expect.soft(measured.description).toBe(shared ? 'Read-only listening snapshot · Refreshed 4 October' : 'Your songs, artists and genres, ranked over time.');
  73  |       expect.soft(measured.descriptionFont).toBe(16);
  74  |       expect.soft(measured.descriptionLine).toBe(24);
  75  |       expect.soft(measured.headingToControls).toBe(width <= 760 ? 12 : 16);
  76  |       expect.soft(measured.contentGap).toBe(width <= 760 ? 12 : 16);
  77  |       expect.soft(measured.categoryHeading).toBe('Top songs');
  78  |       expect.soft(measured.categoryFont).toBe(20); expect.soft(measured.categoryLine).toBe(28); expect.soft(measured.resultGap).toBe(16);
  79  |       expect.soft(measured.back).toEqual(shared ? {width: 92, height: 44, imageWidth: 18, imageHeight: 18, naturalWidth: 18, naturalHeight: 18} : null);
  80  |       expect.soft(measured.create).toEqual(shared ? null : {label: 'Create playlist from these songs', width: 240, height: 48, centered: true, icon: 'pi pi-list', iconWidth: 18});
> 81  |       expect.soft(measured.pageWidth).toBe(Math.min(measured.availableWidth, 1120));
      |                                       ^ Error: expect(received).toBe(expected) // Object.is equality
  82  |       expect.soft(measured.overflow).toBeLessThanOrEqual(1);
  83  |     }
  84  |     await testInfo.attach('stats-content-composition.json', {path: testInfo.outputPath('stats-content-composition.json'), contentType: 'application/json'});
  85  |     for (const [label, range] of periods) {
  86  |       await page.getByRole('group', {name: 'Ranking period'}).getByRole('button', {name: label, exact: true}).click();
  87  |       for (const category of categories) {
  88  |         await page.getByRole('group', {name: 'Ranking category'}).getByRole('button', {name: category, exact: true}).click();
  89  |         const expectedName = shared ? `${category === 'Songs' ? 'Shared Song' : category === 'Artists' ? 'Shared Artist' : 'Shared genre'} ${range}` : category === 'Songs' ? 'Test Song' : category === 'Artists' ? 'Test Artist' : 'pop';
  90  |         await expect(main.getByText(expectedName, {exact: category !== 'Genres'}).first()).toBeVisible();
  91  |         expect.soft(await main.evaluate(element => element.querySelector('.stats-results-heading')?.textContent ?? '')).toBe(`Top ${category.toLowerCase()}`);
  92  |         if (shared) {
  93  |           await expect(main.getByRole('button', {name: /View position history|Compare dates|Create playlist/})).toHaveCount(0);
  94  |           await expect(main.getByRole('switch', {name: 'Search past rankings'})).toHaveCount(0);
  95  |         }
  96  |         const search = main.getByRole('searchbox');
  97  |         await search.fill('definitely missing');
  98  |         await expect(main.getByRole('heading', {name: category === 'Songs' ? 'No top songs found' : category === 'Artists' ? 'No top artists found' : 'No genre data found', exact: true})).toBeVisible();
  99  |         await search.fill('');
  100 |         await expect(main.getByText(expectedName, {exact: category !== 'Genres'}).first()).toBeVisible();
  101 |       }
  102 |     }
  103 |     if (shared) expect(sharedRequests).toEqual(periods.map(([,p_range]) => ({p_owner_user_id: 'shared-owner', p_range})));
  104 |     await expectNoBlockingAxeViolations(page);
  105 |     if (shared) {
  106 |       await main.getByRole('button', {name: 'Back', exact: true}).press('Enter');
  107 |       await expect(page).toHaveURL(/\/new\/stats$/);
  108 |       await expect(page.getByRole('heading', {name: 'Your top listening', exact: true})).toBeVisible();
  109 |       await expect(page.getByRole('main').getByText('Test Song', {exact: true})).toBeVisible();
  110 |     }
  111 |   });
  112 | }
  113 | 
  114 | for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  115 |   test(`shared range loading, permission failure and recovery replace stale rankings (${reducedMotion})`, async ({page}) => {
  116 |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  117 |     await page.emulateMedia({reducedMotion});
  118 |     await mockSpotify(page); await seedAuthenticatedBrowser(page);
  119 |     let releaseMedium!: () => void;
  120 |     const mediumReady = new Promise<void>(resolve => releaseMedium = resolve);
  121 |     let longCalls = 0;
  122 |     await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**', async route => {
  123 |       if (new URL(route.request().url()).pathname !== '/rest/v1/rpc/get_shared_stats_snapshot') return route.fulfill({json: []});
  124 |       const range = route.request().postDataJSON().p_range;
  125 |       if (range === 'medium_term') await mediumReady;
  126 |       if (range === 'long_term' && ++longCalls === 1) return route.fulfill({status: 403, json: {message: 'Permission denied for the isolated shared range.'}});
  127 |       return route.fulfill({json: {ownerUserId: 'shared-owner', ownerDisplayName: 'Alex', snapshotDate: '2026-10-04',
  128 |         topTracks: [{id: 'shared-song', name: `Shared Song ${range}`, artists: [], album: {images: []}}], topArtists: [], topGenres: []}});
  129 |     });
  130 |     await page.goto('/new/stats/shared-owner');
  131 |     const main = page.getByRole('main'), period = page.getByRole('group', {name: 'Ranking period'});
  132 |     await expect(main.getByText('Shared Song short_term', {exact: true})).toBeVisible();
  133 |     await period.getByRole('button', {name: '6 months', exact: true}).click();
  134 |     await expect(main.getByRole('heading', {name: 'Loading shared Spotify insights…', exact: true})).toBeVisible();
  135 |     await expect(main.getByText('Shared Song short_term', {exact: true})).toHaveCount(0);
  136 |     await expect(main.locator('.stats-results-heading')).toHaveCount(0);
  137 |     releaseMedium();
  138 |     await expect(main.getByText('Shared Song medium_term', {exact: true})).toBeVisible();
  139 |     await expect(main.getByRole('heading', {name: 'Loading shared Spotify insights…', exact: true})).toHaveCount(0);
  140 |     await period.getByRole('button', {name: '1 year', exact: true}).click();
  141 |     await expect(main.getByRole('heading', {name: 'Shared stats unavailable', exact: true})).toBeVisible();
  142 |     await expect(main.getByRole('alert')).toContainText('Permission denied');
  143 |     await expect(main.getByText('Shared Song medium_term', {exact: true})).toHaveCount(0);
  144 |     await expect(main.locator('.stats-results-heading')).toHaveCount(0);
  145 |     await period.getByRole('button', {name: '6 months', exact: true}).click();
  146 |     await expect(main.getByText('Shared Song medium_term', {exact: true})).toBeVisible();
  147 |     await period.getByRole('button', {name: '1 year', exact: true}).click();
  148 |     await expect(main.getByText('Shared Song long_term', {exact: true})).toBeVisible();
  149 |     await expect(main.getByRole('alert')).toHaveCount(0);
  150 |     await expect(main.getByRole('heading', {name: 'Top songs', exact: true})).toBeVisible();
  151 |     await expect(main.getByRole('button', {name: /View position history|Compare dates|Create playlist/})).toHaveCount(0);
  152 |     expect(longCalls).toBe(2);
  153 |     await expectNoBlockingAxeViolations(page);
  154 |   });
  155 | }
  156 | 
```