# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-composition.spec.ts >> Stats content composition preserves owner workflows (reduce)
- Location: e2e/design-v2-stats-composition.spec.ts:9:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 28
Received: 36
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 36
Received: 44
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 12
Received: 16
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 12
Received: 16
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 36
Received: 28
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 44
Received: 36
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 16
Received: 12
```

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 16
Received: 12
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - link "Analytify playlists" [ref=f1e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e10]: Analytify
      - navigation "Main navigation" [ref=f1e11]:
        - link "Playlists" [ref=f1e12] [cursor=pointer]:
          - /url: /new/playlists
          - generic [aria-hidden] [ref=f1e13]: 
        - link "Stats" [ref=f1e15] [cursor=pointer]:
          - /url: /new/stats
          - generic [aria-hidden] [ref=f1e16]: 
        - link "History" [ref=f1e18] [cursor=pointer]:
          - /url: /new/history
          - generic [aria-hidden] [ref=f1e19]: 
      - generic [ref=f1e21]:
        - button "Open More tools" [ref=f1e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e23]: 
          - generic [ref=f1e24]: More
        - button "Open account and data settings" [ref=f1e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e26]: 
  - main "Your Top Listening content" [ref=f1e27]:
    - generic [ref=f1e30]:
      - generic [ref=f1e32]:
        - heading "Your top listening" [level=1] [ref=f1e34]
        - paragraph [ref=f1e35]: Your songs, artists and genres, ranked over time.
      - generic [ref=f1e36]:
        - region "Statistics controls" [ref=f1e37]:
          - generic [ref=f1e38]:
            - paragraph [ref=f1e39]: Period
            - group "Ranking period" [ref=f1e40]:
              - button "4 weeks" [ref=f1e41] [cursor=pointer]
              - button "6 months" [ref=f1e43] [cursor=pointer]
              - button "1 year" [pressed] [ref=f1e45] [cursor=pointer]
          - generic [ref=f1e47]:
            - paragraph [ref=f1e48]: Category
            - group "Ranking category" [ref=f1e49]:
              - button "Songs" [ref=f1e50] [cursor=pointer]
              - button "Artists" [ref=f1e53] [cursor=pointer]
              - button "Genres" [pressed] [ref=f1e56] [cursor=pointer]
        - group "Search rankings" [ref=f1e60]:
          - generic [ref=f1e62]:
            - generic [ref=f1e63]: Search genres
            - generic [ref=f1e64]:
              - generic [aria-hidden]: 
              - searchbox "Search genres" [active] [ref=f1e65]
          - button "Compare dates" [ref=f1e66] [cursor=pointer]
          - switch "Search past rankings" [ref=f1e69] [cursor=pointer]
        - region "Rankings" [ref=f1e73]:
          - heading "Top genres" [level=2] [ref=f1e74]
          - group "Genre shares" [ref=f1e76]:
            - generic [aria-hidden] [ref=f1e77]:
              - generic [ref=f1e78]: Genre
              - generic [ref=f1e79]:
                - generic [ref=f1e80]: 0%
                - generic [ref=f1e81]: 20%
                - generic [ref=f1e82]: 40%
                - generic [ref=f1e83]: 60%
                - generic [ref=f1e84]: 80%
                - generic [ref=f1e85]: 100%
              - generic [ref=f1e86]: Share
            - generic [ref=f1e87]:
              - strong [ref=f1e89]: 1. pop
              - 'img "pop: 100%" [ref=f1e90]'
              - generic [ref=f1e92]: 100%
              - button "View position history for pop" [ref=f1e93] [cursor=pointer]:
                - generic [aria-hidden] [ref=f1e94]: 
                - text: History
  - text:   
  - contentinfo [ref=f1e95]:
    - generic [ref=f1e96]: Powered by Spotify
    - generic [ref=f1e97]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e98] [cursor=pointer]:
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
  25  |     if (shared) { await page.goto('/new/stats'); await expect(page.getByRole('heading', {name: 'Your top listening', exact: true})).toBeVisible(); }
  26  |     await page.goto(shared ? '/new/stats/shared-owner' : '/new/stats');
  27  |     const main = page.getByRole('main');
  28  |     await expect(main.locator('v2-stats-ranking-row')).toHaveCount(1);
  29  |     await page.evaluate(() => document.fonts.ready);
  30  |     expect.soft(await main.getByRole('button', {name: 'Back', exact: true}).count()).toBe(shared ? 1 : 0);
  31  |     const evidence = [];
  32  |     for (const width of [320,390,760,761,1440,1920]) for (const height of [480,1080]) {
  33  |       await page.setViewportSize({width, height});
  34  |       const measured = await main.evaluate(element => {
  35  |         const heading = element.querySelector('h1')!, header = heading.closest('header')!;
  36  |         const description = element.querySelector('.v2-page__description')!;
  37  |         const sections = element.querySelector('.v2-page__sections')!, controls = element.querySelector('.stats-choice-controls')!;
  38  |         const titleStyle = getComputedStyle(heading), descriptionStyle = getComputedStyle(description);
  39  |         const headerBox = header.getBoundingClientRect(), controlBox = controls.getBoundingClientRect();
  40  |         const categoryHeading = element.querySelector('.stats-results-heading');
  41  |         const headingStyle = categoryHeading ? getComputedStyle(categoryHeading) : null;
  42  |         const resultGroup = element.querySelector('.stats-resolved-results');
  43  |         const back = element.querySelector<HTMLButtonElement>('.v2-page__back'), backImage = back?.querySelector('img');
  44  |         const create = element.querySelector<HTMLButtonElement>('.stats-create-playlist'), actionGroup = element.querySelector('.stats-playlist-action');
  45  |         const actionBox = create?.getBoundingClientRect(), groupBox = actionGroup?.getBoundingClientRect();
  46  |         return {title: heading.textContent, fontSize: parseFloat(titleStyle.fontSize), lineHeight: parseFloat(titleStyle.lineHeight), letterSpacing: titleStyle.letterSpacing,
  47  |           eyebrow: element.querySelector('.v2-page__eyebrow')?.textContent ?? '',
  48  |           description: description.textContent, descriptionVisible: description.getBoundingClientRect().height > 0,
  49  |           descriptionFont: parseFloat(descriptionStyle.fontSize), descriptionLine: parseFloat(descriptionStyle.lineHeight),
  50  |           headingToControls: controlBox.top - headerBox.bottom, contentGap: parseFloat(getComputedStyle(sections).rowGap),
  51  |           categoryHeading: categoryHeading?.textContent?.trim() ?? '', categoryFont: headingStyle ? parseFloat(headingStyle.fontSize) : null,
  52  |           categoryLine: headingStyle ? parseFloat(headingStyle.lineHeight) : null, resultGap: resultGroup ? parseFloat(getComputedStyle(resultGroup).rowGap) : null,
  53  |           back: back ? {width: back.offsetWidth, height: back.offsetHeight, imageWidth: backImage?.width, imageHeight: backImage?.height, naturalWidth: backImage?.naturalWidth, naturalHeight: backImage?.naturalHeight} : null,
  54  |           create: create && actionBox && groupBox ? {label: create.textContent?.trim(), width: create.offsetWidth, height: create.offsetHeight,
  55  |             centered: Math.abs((actionBox.left + actionBox.right) / 2 - (groupBox.left + groupBox.right) / 2) <= 1 / 60,
  56  |             icon: create.querySelector('i')?.className, iconWidth: create.querySelector('i')?.getBoundingClientRect().width} : null,
  57  |           overflow: document.documentElement.scrollWidth - innerWidth};
  58  |       });
  59  |       evidence.push({width, height, ...measured});
  60  |       const evidencePath = testInfo.outputPath('stats-content-composition.json');
  61  |       await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
  62  |       if (height === 1080 && [390,1440].includes(width)) await main.locator('.v2-page').screenshot({path: testInfo.outputPath(`stats-content-${width}.png`), animations: 'disabled'});
  63  |       expect.soft(measured.title).toBe(shared ? 'Alex · Listening stats' : 'Your top listening');
  64  |       expect.soft(measured.eyebrow).toBe('');
  65  |       expect.soft(measured.fontSize).toBe(width <= 760 ? 28 : 36);
  66  |       expect.soft(measured.lineHeight).toBe(width <= 760 ? 36 : 44);
  67  |       expect.soft(measured.letterSpacing).toBe('normal');
  68  |       expect.soft(measured.descriptionVisible).toBe(width > 760);
  69  |       expect.soft(measured.description).toBe(shared ? 'Read-only listening snapshot · Refreshed 4 October' : 'Your songs, artists and genres, ranked over time.');
  70  |       expect.soft(measured.descriptionFont).toBe(16);
  71  |       expect.soft(measured.descriptionLine).toBe(24);
  72  |       expect.soft(measured.headingToControls).toBe(width <= 760 ? 12 : 16);
> 73  |       expect.soft(measured.contentGap).toBe(width <= 760 ? 12 : 16);
      |                                        ^ Error: expect(received).toBe(expected) // Object.is equality
  74  |       expect.soft(measured.categoryHeading).toBe('Top songs');
  75  |       expect.soft(measured.categoryFont).toBe(20); expect.soft(measured.categoryLine).toBe(28); expect.soft(measured.resultGap).toBe(16);
  76  |       expect.soft(measured.back).toEqual(shared ? {width: 92, height: 44, imageWidth: 18, imageHeight: 18, naturalWidth: 18, naturalHeight: 18} : null);
  77  |       expect.soft(measured.create).toEqual(shared ? null : {label: 'Create playlist from these songs', width: 240, height: 48, centered: true, icon: 'pi pi-list', iconWidth: 18});
  78  |       expect.soft(measured.overflow).toBeLessThanOrEqual(1);
  79  |     }
  80  |     await testInfo.attach('stats-content-composition.json', {path: testInfo.outputPath('stats-content-composition.json'), contentType: 'application/json'});
  81  |     for (const [label, range] of periods) {
  82  |       await page.getByRole('group', {name: 'Ranking period'}).getByRole('button', {name: label, exact: true}).click();
  83  |       for (const category of categories) {
  84  |         await page.getByRole('group', {name: 'Ranking category'}).getByRole('button', {name: category, exact: true}).click();
  85  |         const expectedName = shared ? `${category === 'Songs' ? 'Shared Song' : category === 'Artists' ? 'Shared Artist' : 'Shared genre'} ${range}` : category === 'Songs' ? 'Test Song' : category === 'Artists' ? 'Test Artist' : 'pop';
  86  |         await expect(main.getByText(expectedName, {exact: category !== 'Genres'}).first()).toBeVisible();
  87  |         expect.soft(await main.evaluate(element => element.querySelector('.stats-results-heading')?.textContent ?? '')).toBe(`Top ${category.toLowerCase()}`);
  88  |         if (shared) {
  89  |           await expect(main.getByRole('button', {name: /View position history|Compare dates|Create playlist/})).toHaveCount(0);
  90  |           await expect(main.getByRole('switch', {name: 'Search past rankings'})).toHaveCount(0);
  91  |         }
  92  |         const search = main.getByRole('searchbox');
  93  |         await search.fill('definitely missing');
  94  |         await expect(main.getByRole('heading', {name: category === 'Songs' ? 'No top songs found' : category === 'Artists' ? 'No top artists found' : 'No genre data found', exact: true})).toBeVisible();
  95  |         await search.fill('');
  96  |         await expect(main.getByText(expectedName, {exact: category !== 'Genres'}).first()).toBeVisible();
  97  |       }
  98  |     }
  99  |     if (shared) expect(sharedRequests).toEqual(periods.map(([,p_range]) => ({p_owner_user_id: 'shared-owner', p_range})));
  100 |     await expectNoBlockingAxeViolations(page);
  101 |     if (shared) {
  102 |       await main.getByRole('button', {name: 'Back', exact: true}).press('Enter');
  103 |       await expect(page).toHaveURL(/\/new\/stats$/);
  104 |       await expect(page.getByRole('heading', {name: 'Your top listening', exact: true})).toBeVisible();
  105 |     }
  106 |   });
  107 | }
  108 | 
  109 | for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  110 |   test(`shared range loading, permission failure and recovery replace stale rankings (${reducedMotion})`, async ({page}) => {
  111 |     await page.clock.setFixedTime(new Date('2026-10-06T12:00:00Z'));
  112 |     await page.emulateMedia({reducedMotion});
  113 |     await mockSpotify(page); await seedAuthenticatedBrowser(page);
  114 |     let releaseMedium!: () => void;
  115 |     const mediumReady = new Promise<void>(resolve => releaseMedium = resolve);
  116 |     let longCalls = 0;
  117 |     await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**', async route => {
  118 |       if (new URL(route.request().url()).pathname !== '/rest/v1/rpc/get_shared_stats_snapshot') return route.fulfill({json: []});
  119 |       const range = route.request().postDataJSON().p_range;
  120 |       if (range === 'medium_term') await mediumReady;
  121 |       if (range === 'long_term' && ++longCalls === 1) return route.fulfill({status: 403, json: {message: 'Permission denied for the isolated shared range.'}});
  122 |       return route.fulfill({json: {ownerUserId: 'shared-owner', ownerDisplayName: 'Alex', snapshotDate: '2026-10-04',
  123 |         topTracks: [{id: 'shared-song', name: `Shared Song ${range}`, artists: [], album: {images: []}}], topArtists: [], topGenres: []}});
  124 |     });
  125 |     await page.goto('/new/stats/shared-owner');
  126 |     const main = page.getByRole('main'), period = page.getByRole('group', {name: 'Ranking period'});
  127 |     await expect(main.getByText('Shared Song short_term', {exact: true})).toBeVisible();
  128 |     await period.getByRole('button', {name: '6 months', exact: true}).click();
  129 |     await expect(main.getByRole('heading', {name: 'Loading shared Spotify insights…', exact: true})).toBeVisible();
  130 |     await expect(main.getByText('Shared Song short_term', {exact: true})).toHaveCount(0);
  131 |     await expect(main.locator('.stats-results-heading')).toHaveCount(0);
  132 |     releaseMedium();
  133 |     await expect(main.getByText('Shared Song medium_term', {exact: true})).toBeVisible();
  134 |     await expect(main.getByRole('heading', {name: 'Loading shared Spotify insights…', exact: true})).toHaveCount(0);
  135 |     await period.getByRole('button', {name: '1 year', exact: true}).click();
  136 |     await expect(main.getByRole('heading', {name: 'Shared stats unavailable', exact: true})).toBeVisible();
  137 |     await expect(main.getByRole('alert')).toContainText('Permission denied');
  138 |     await expect(main.getByText('Shared Song medium_term', {exact: true})).toHaveCount(0);
  139 |     await expect(main.locator('.stats-results-heading')).toHaveCount(0);
  140 |     await period.getByRole('button', {name: '6 months', exact: true}).click();
  141 |     await expect(main.getByText('Shared Song medium_term', {exact: true})).toBeVisible();
  142 |     await period.getByRole('button', {name: '1 year', exact: true}).click();
  143 |     await expect(main.getByText('Shared Song long_term', {exact: true})).toBeVisible();
  144 |     await expect(main.getByRole('alert')).toHaveCount(0);
  145 |     await expect(main.getByRole('heading', {name: 'Top songs', exact: true})).toBeVisible();
  146 |     await expect(main.getByRole('button', {name: /View position history|Compare dates|Create playlist/})).toHaveCount(0);
  147 |     expect(longCalls).toBe(2);
  148 |     await expectNoBlockingAxeViolations(page);
  149 |   });
  150 | }
  151 | 
```