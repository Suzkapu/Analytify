# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-search-switch.spec.ts >> selection follows the native 220ms timeline and responds to reduced motion
- Location: e2e/design-v2-stats-search-switch.spec.ts:98:5

# Error details

```
Error: locator.evaluate: TypeError: undefined is not an object (evaluating 'animation.pause')
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - complementary "Desktop sidebar" [ref=f1e7]:
    - generic [ref=f1e9]:
      - button "Collapse navigation sidebar" [expanded] [ref=f1e10] [cursor=pointer]:
        - generic [ref=f1e11]: Analytify
      - navigation "All destinations" [ref=f1e12]:
        - generic [ref=f1e13]:
          - paragraph [ref=f1e14]: Library
          - link "Playlists" [ref=f1e15] [cursor=pointer]:
            - /url: /new/playlists
            - generic [aria-hidden] [ref=f1e16]: 
        - generic [ref=f1e18]:
          - paragraph [ref=f1e19]: Listening
          - link "Stats" [ref=f1e20] [cursor=pointer]:
            - /url: /new/stats
            - generic [aria-hidden] [ref=f1e21]: 
          - link "History" [ref=f1e23] [cursor=pointer]:
            - /url: /new/history
            - generic [aria-hidden] [ref=f1e24]: 
        - generic [ref=f1e26]:
          - paragraph [ref=f1e27]: Social
          - link "Friends" [ref=f1e28] [cursor=pointer]:
            - /url: /new/friends
            - generic [aria-hidden] [ref=f1e29]: 
          - link "Song Leagues" [ref=f1e31] [cursor=pointer]:
            - /url: /new/song-league
            - generic [aria-hidden] [ref=f1e32]: 
          - link "Private Sharing" [ref=f1e34] [cursor=pointer]:
            - /url: /new/shared-playlists
            - generic [aria-hidden] [ref=f1e35]: 
        - generic [ref=f1e37]:
          - paragraph [ref=f1e38]: Tools
          - link "Compare playlists" [ref=f1e39] [cursor=pointer]:
            - /url: /new/compare-room
            - generic [aria-hidden] [ref=f1e40]: 
      - link "Settings" [ref=f1e42] [cursor=pointer]:
        - /url: /new/settings/account
        - generic [ref=f1e44]: B
        - generic [ref=f1e45]:
          - strong [ref=f1e46]: Browser test user
          - generic [ref=f1e47]: Settings
  - banner [ref=f1e48]:
    - generic [ref=f1e49]:
      - link "Analytify playlists" [ref=f1e50] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e51]: Analytify
      - text:   
      - generic [ref=f1e52]:
        - button "Open navigation menu" [ref=f1e53] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e54]: 
          - generic [ref=f1e55]: Menu
        - button "Open account and data settings" [ref=f1e56] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e57]: 
  - main "Your Top Listening content" [ref=f1e58]:
    - generic [ref=f1e61]:
      - generic [ref=f1e63]:
        - heading "Your top listening" [level=1] [ref=f1e65]
        - paragraph [ref=f1e66]: Your songs, artists and genres, ranked over time.
      - generic [ref=f1e67]:
        - region "Statistics controls" [ref=f1e68]:
          - generic [ref=f1e69]:
            - paragraph [ref=f1e70]: Period
            - group "Ranking period" [ref=f1e71]:
              - button "4 weeks" [pressed] [ref=f1e72] [cursor=pointer]
              - button "6 months" [ref=f1e74] [cursor=pointer]
              - button "1 year" [ref=f1e76] [cursor=pointer]
          - generic [ref=f1e78]:
            - paragraph [ref=f1e79]: Category
            - group "Ranking category" [ref=f1e80]:
              - button "Songs" [pressed] [ref=f1e81] [cursor=pointer]
              - button "Artists" [ref=f1e84] [cursor=pointer]
              - button "Genres" [ref=f1e87] [cursor=pointer]
        - group "Search rankings" [ref=f1e91]:
          - generic [ref=f1e93]:
            - generic [ref=f1e94]: Search songs or artists
            - searchbox "Search songs or artists" [ref=f1e96]
          - button "Compare dates" [ref=f1e97] [cursor=pointer]
          - switch "Search past rankings" [checked] [active] [ref=f1e100] [cursor=pointer]
        - region "Rankings" [ref=f1e104]:
          - heading "Top songs" [level=2] [ref=f1e105]
          - generic [ref=f1e107]:
            - group "Rank 1. Unchanged" [ref=f1e108]:
              - generic [aria-hidden] [ref=f1e109]: "1"
              - generic [aria-hidden] [ref=f1e110]: —
            - button "Open Test Song on Spotify" [disabled] [ref=f1e111]:
              - img "Test Song cover" [ref=f1e112]
            - generic [ref=f1e113]:
              - strong [ref=f1e114]: Test Song
              - generic [ref=f1e115]: Test Artist
            - button "View position history for Test Song" [ref=f1e116] [cursor=pointer]: History
          - button "Create playlist from these songs" [ref=f1e118] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e119]: 
            - text: Create playlist from these songs
  - text:   
  - contentinfo [ref=f1e120]:
    - generic [ref=f1e121]: Powered by Spotify
    - generic [ref=f1e122]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e123] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  10  |   await page.route('https://tmmhylpexbubyznlizfs.supabase.co/**', async route => {
  11  |     const path = new URL(route.request().url()).pathname;
  12  |     if (path === '/rest/v1/rpc/search_past_top_items') {
  13  |       queries.push(route.request().postDataJSON());
  14  |       pending.push(route);
  15  |       return;
  16  |     }
  17  |     return route.fulfill({json: path === '/rest/v1/users' ? {backup_active: true} : []});
  18  |   });
  19  |   await page.evaluate(async () => {
  20  |     await new Promise<void>((resolve, reject) => {
  21  |       const request = indexedDB.open('AnalytifyDB', 4);
  22  |       request.onerror = () => reject(request.error);
  23  |       request.onsuccess = () => {
  24  |         const db = request.result, tx = db.transaction('appData', 'readwrite');
  25  |         tx.objectStore('appData').put({key: 'de111111-1111-4111-8111-111111111111_backup_active', value: 'true'});
  26  |         tx.oncomplete = () => {db.close(); resolve();};
  27  |         tx.onerror = () => reject(tx.error);
  28  |       };
  29  |     });
  30  |   });
  31  |   await page.goto('/new/stats');
  32  |   const search = page.getByRole('searchbox', {name: 'Search songs or artists', exact: true});
  33  |   const toggle = page.getByRole('switch', {name: 'Search past rankings'});
  34  |   await expect(toggle).toHaveAttribute('aria-checked', 'false');
  35  |   await search.fill('Former');
  36  |   await toggle.press('Space');
  37  |   await expect.poll(() => pending.length).toBe(1);
  38  |   expect(queries[0]).toEqual({p_range: 'short_term', p_kind: 'track', p_query: 'Former', p_limit: 20});
  39  |   await expect(page.getByText('Searching saved rankings…', {exact: true})).toBeVisible();
  40  |   await expect(toggle).toBeEnabled();
  41  |   await toggle.press('Enter');
  42  |   await expect(toggle).toHaveAttribute('aria-checked', 'false');
  43  |   const result = [{kind: 'track', item_id: 'former-track', item_name: 'Former favourite', subtitle: 'Old artist', image_url: '', spotify_url: '', best_rank: 2, first_seen: '2026-09-01', last_seen: '2026-09-05', appearances: 2}];
  44  |   await pending[0].fulfill({json: result});
  45  |   await expect(page.locator('.v2-past-results')).toHaveCount(0);
  46  |   await toggle.press('Space');
  47  |   await expect.poll(() => pending.length).toBe(2);
  48  |   await pending[1].fulfill({status: 503, json: {message: 'Search temporarily unavailable'}});
  49  |   await expect(page.getByText('Search temporarily unavailable', {exact: true})).toBeVisible();
  50  |   await toggle.press('Enter');
  51  |   await toggle.press('Space');
  52  |   await expect.poll(() => pending.length).toBe(3);
  53  |   await pending[2].fulfill({json: result});
  54  |   await expect(page.getByRole('button', {name: /Former favourite/})).toBeVisible();
  55  |   await expectNoBlockingAxeViolations(page);
  56  |   await page.screenshot({path: testInfo.outputPath('historical-search-recovered.png'), fullPage: true});
  57  | });
  58  | 
  59  | test('canonical search row keeps touch geometry when resizing short and tall windows', async ({page}, testInfo) => {
  60  |   await mockSpotify(page);
  61  |   await seedAuthenticatedBrowser(page);
  62  |   await page.goto('/new/stats');
  63  |   const group = page.getByRole('group', {name: 'Search rankings', exact: true});
  64  |   const toggle = group.getByRole('switch', {name: 'Search past rankings'});
  65  |   const input = group.getByRole('searchbox');
  66  |   const compare = group.getByRole('button', {name: 'Compare dates'});
  67  |   for (const width of [1440, 390]) for (const height of [480, 1000]) {
  68  |     await page.setViewportSize({width, height});
  69  |     await expect(toggle).toBeVisible();
  70  |     const boxes = await Promise.all([input.boundingBox(), compare.boundingBox(), toggle.boundingBox()]);
  71  |     const [search, dates, past] = boxes.map(box => {expect(box).not.toBeNull(); return box!;});
  72  |     expect(search.height).toBe(48);
  73  |     expect(dates.height).toBe(48);
  74  |     expect(past.height).toBe(48);
  75  |     if (width === 1440) {
  76  |       expect(past.width).toBe(240);
  77  |       expect(dates.x - search.x - search.width).toBeCloseTo(12, 4);
  78  |       expect(past.x - dates.x - dates.width).toBeCloseTo(12, 4);
  79  |       expect(past.y).toBeCloseTo(search.y, 4);
  80  |     } else {
  81  |       expect(search.width).toBe(358);
  82  |       expect(dates.width).toBe(166);
  83  |       expect(past.width).toBe(358);
  84  |       expect(dates.y - search.y - search.height).toBeCloseTo(8, 4);
  85  |       expect(past.y - dates.y - dates.height).toBeCloseTo(8, 4);
  86  |       expect(past.x).toBe(search.x);
  87  |     }
  88  |     await group.evaluate(element => element.scrollIntoView({block: 'center'}));
  89  |     await expect.poll(() => toggle.evaluate(element => {
  90  |       const box = element.getBoundingClientRect();
  91  |       return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  92  |     })).toBe(true);
  93  |     await group.screenshot({path: testInfo.outputPath(`search-row-${width}-${height}.png`), animations: 'disabled'});
  94  |   }
  95  |   await expectNoBlockingAxeViolations(page);
  96  | });
  97  | 
  98  | test('selection follows the native 220ms timeline and responds to reduced motion', async ({page}, testInfo) => {
  99  |   await page.emulateMedia({reducedMotion: 'no-preference'});
  100 |   await mockSpotify(page);
  101 |   await seedAuthenticatedBrowser(page);
  102 |   await page.goto('/new/stats');
  103 |   const toggle = page.getByRole('switch', {name: 'Search past rankings'});
  104 |   await toggle.press('Tab');
  105 |   await toggle.focus();
  106 |   await toggle.press('Space');
  107 |   await expect(toggle).toHaveAttribute('aria-checked', 'true');
  108 |   // Capture native CSS transitions immediately, before Playwright polling can
  109 |   // consume this short timeline. Resume once to prove the native clock runs.
> 110 |   const timing = await toggle.evaluate(element => {
      |                               ^ Error: locator.evaluate: TypeError: undefined is not an object (evaluating 'animation.pause')
  111 |     const thumb = element.querySelector('.thumb')!;
  112 |     const animation = thumb.getAnimations().find(item => (item as CSSTransition).transitionProperty === 'transform')!;
  113 |     animation.pause();
  114 |     animation.currentTime = 55;
  115 |     const matrix = new DOMMatrixReadOnly(getComputedStyle(thumb).transform);
  116 |     const effect = animation.effect!.getTiming();
  117 |     animation.play();
  118 |     return {duration: effect.duration, easing: effect.easing, travel: matrix.m41};
  119 |   });
  120 |   expect(timing.duration).toBe(220);
  121 |   expect(timing.easing).toBe('ease-in-out');
  122 |   expect(timing.travel).toBeCloseTo(1.808, 2);
  123 |   await expect.poll(() => toggle.locator('.thumb').evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41)).toBe(14);
  124 |   await toggle.hover();
  125 |   await page.keyboard.press('Tab');
  126 |   await page.keyboard.press('Shift+Tab');
  127 |   await expect(toggle).toBeFocused();
  128 |   expect(await toggle.evaluate(element => getComputedStyle(element).borderTopColor)).toBe('rgb(159, 255, 200)');
  129 |   await toggle.screenshot({path: testInfo.outputPath('toggle-on-focus.png')});
  130 |   await page.emulateMedia({reducedMotion: 'reduce'});
  131 |   await toggle.press('Space');
  132 |   await expect(toggle).toHaveAttribute('aria-checked', 'false');
  133 |   const reduced = await toggle.locator('.thumb').evaluate(element => ({
  134 |     travel: new DOMMatrixReadOnly(getComputedStyle(element).transform).m41,
  135 |     active: element.getAnimations().length
  136 |   }));
  137 |   expect(reduced).toEqual({travel: 0, active: 0});
  138 | });
  139 | 
```