# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-composition.spec.ts >> shared range loading, permission failure and recovery replace stale rankings (no-preference)
- Location: e2e/design-v2-stats-composition.spec.ts:115:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('main').getByRole('heading', { name: 'Loading shared Spotify insights…', exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('main').getByRole('heading', { name: 'Loading shared Spotify insights…', exact: true }) with timeout 5000ms
  - waiting for getByRole('main').getByRole('heading', { name: 'Loading shared Spotify insights…', exact: true })

```

```yaml
- link "Skip to main content":
  - /url: "#v2-main-content"
- banner:
  - text: Shared Top Listening
  - button "Open More tools": More
  - button "Open account and data settings"
- main "Shared Top Listening content":
  - heading "Alex · Listening stats" [level=1]
  - button "Back"
  - region "Statistics controls":
    - paragraph: Period
    - group "Ranking period":
      - button "4 weeks"
      - button "6 months" [pressed]
      - button "1 year"
    - paragraph: Category
    - group "Ranking category":
      - button "Songs" [pressed]
      - button "Artists"
      - button "Genres"
  - group "Search rankings":
    - text: Search songs or artists
    - searchbox "Search songs or artists"
  - status:
    - paragraph:
      - strong: Loading shared Spotify insights…
    - paragraph: This read-only snapshot will appear when the range is ready.
- navigation "Primary navigation":
  - link "Playlists":
    - /url: /new/playlists
  - link "Stats":
    - /url: /new/stats
  - link "History":
    - /url: /new/history
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
    - /url: /new/legal
```

# Test source

```ts
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
  81  |       expect.soft(measured.pageWidth).toBe(width <= 760 ? width - 32 : Math.min(measured.availableWidth, 1120));
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
> 134 |     await expect(main.getByRole('heading', {name: 'Loading shared Spotify insights…', exact: true})).toBeVisible();
      |                                                                                                      ^ Error: expect(locator).toBeVisible() failed
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