# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-stats-period-controls.spec.ts >> period keyboard changes query the selected range once and category choices reuse its payload
- Location: e2e/design-v2-stats-period-controls.spec.ts:66:5

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  0
+ Received  + 24

@@ -6,19 +6,43 @@
    Object {
      "kind": "tracks",
      "range": "long_term",
    },
    Object {
+     "kind": "tracks",
+     "range": "long_term",
+   },
+   Object {
+     "kind": "tracks",
+     "range": "long_term",
+   },
+   Object {
      "kind": "artists",
+     "range": "medium_term",
+   },
+   Object {
+     "kind": "tracks",
+     "range": "medium_term",
+   },
+   Object {
+     "kind": "tracks",
      "range": "medium_term",
    },
    Object {
      "kind": "tracks",
      "range": "medium_term",
    },
    Object {
      "kind": "artists",
+     "range": "short_term",
+   },
+   Object {
+     "kind": "tracks",
+     "range": "short_term",
+   },
+   Object {
+     "kind": "tracks",
      "range": "short_term",
    },
    Object {
      "kind": "tracks",
      "range": "short_term",
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
        - paragraph [ref=f1e33]: Personal listening
        - heading "Your top listening" [level=1] [ref=f1e34]
        - paragraph [ref=f1e35]: See top songs, artists, and genres, and how their rankings change.
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
              - button "Artists" [active] [pressed] [ref=f1e53] [cursor=pointer]
              - button "Genres" [ref=f1e56] [cursor=pointer]
        - group "Search rankings" [ref=f1e60]:
          - generic [ref=f1e62]:
            - generic [ref=f1e63]: Search artists
            - generic [ref=f1e64]:
              - generic [aria-hidden]: 
              - searchbox "Search artists" [ref=f1e65]
          - button "Compare dates" [ref=f1e66] [cursor=pointer]
          - switch "Search past rankings" [ref=f1e69] [cursor=pointer]
        - generic [ref=f1e74]:
          - group "Rank 1. Unchanged" [ref=f1e75]:
            - generic [aria-hidden] [ref=f1e76]: "1"
            - generic [aria-hidden] [ref=f1e77]: —
          - button "Open Artist long_term on Spotify" [disabled] [ref=f1e78]:
            - img "Artist long_term photo" [ref=f1e79]
          - strong [ref=f1e81]: Artist long_term
          - button "View position history for Artist long_term" [ref=f1e82] [cursor=pointer]: History
  - text:   
  - contentinfo [ref=f1e83]:
    - generic [ref=f1e84]: Powered by Spotify
    - generic [ref=f1e85]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e86] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1   | import {writeFile} from 'node:fs/promises';
  2   | import {test, expect} from './fixtures';
  3   | import {expectNoBlockingAxeViolations, mockSpotify, seedAuthenticatedBrowser} from './helpers/authenticated-browser';
  4   | 
  5   | test.beforeEach(async ({page}) => {
  6   |   await mockSpotify(page);
  7   |   await seedAuthenticatedBrowser(page);
  8   | });
  9   | 
  10  | test('canonical period and category geometry survives breakpoint and short-window resizing', async ({page}, testInfo) => {
  11  |   await page.goto('/new/stats');
  12  |   const row = page.getByRole('region', {name: 'Statistics controls', exact: true});
  13  |   const period = page.getByRole('group', {name: 'Ranking period'});
  14  |   const category = page.getByRole('group', {name: 'Ranking category'});
  15  |   const evidence = [];
  16  |   for (const width of [320, 360, 390, 760, 761, 768, 1024, 1440, 1920]) for (const height of [480, 1000]) {
  17  |     await page.setViewportSize({width, height});
  18  |     const sample = await row.evaluate(element => {
  19  |       const groups = [...element.querySelectorAll('v2-tabs')];
  20  |       return {overflow: document.documentElement.scrollWidth - innerWidth, row: element.getBoundingClientRect().toJSON(),
  21  |         groups: groups.map(group => ({box: group.getBoundingClientRect().toJSON(), caption: group.querySelector('p')!.getBoundingClientRect().toJSON(),
  22  |           buttons: [...group.querySelectorAll('button')].map(button => ({box: button.getBoundingClientRect().toJSON(), font: getComputedStyle(button).fontSize,
  23  |             icon: button.querySelector('img')?.getBoundingClientRect().toJSON(), label: button.querySelector('button > span:last-child')!.getBoundingClientRect().toJSON()}))}))};
  24  |     });
  25  |     expect(sample.overflow).toBeLessThanOrEqual(1);
  26  |     expect(sample.row.height).toBe(width <= 760 ? 160 : 76);
  27  |     for (const group of sample.groups) {
  28  |       expect(group.caption.height).toBe(20);
  29  |       const [first, second, third] = group.buttons;
  30  |       for (const button of group.buttons) {
  31  |         expect(button.box.height).toBe(48);
  32  |         expect(button.box.width).toBeCloseTo(first.box.width, 1);
  33  |         expect(button.box.y - group.caption.bottom).toBeCloseTo(8, 4);
  34  |         expect(button.label.left).toBeGreaterThanOrEqual(button.box.left);
  35  |         expect(button.label.right).toBeLessThanOrEqual(button.box.right);
  36  |         if (button.icon) {
  37  |           expect(button.icon.width).toBe(20); expect(button.icon.height).toBe(20);
  38  |           if (width <= 760) expect(button.label.top).toBeGreaterThanOrEqual(button.icon.bottom);
  39  |           else expect(button.label.left).toBeGreaterThanOrEqual(button.icon.right);
  40  |         }
  41  |       }
  42  |       expect(second.box.x - first.box.right).toBeCloseTo(width <= 760 ? 4 : 8, 1);
  43  |       expect(third.box.x - second.box.right).toBeCloseTo(width <= 760 ? 4 : 8, 1);
  44  |     }
  45  |     if (width <= 760) expect(sample.groups[1].box.y - sample.groups[0].box.bottom).toBeCloseTo(8, 4);
  46  |     else {
  47  |       expect(sample.groups[1].box.x - sample.groups[0].box.right).toBeCloseTo(16, 4);
  48  |       expect(sample.groups[0].box.width).toBeCloseTo(sample.groups[1].box.width, 4);
  49  |     }
  50  |     evidence.push({width, height, ...sample});
  51  |     if ([390, 1440].includes(width)) {
  52  |       await row.evaluate(element => element.scrollIntoView({block: 'center'}));
  53  |       await row.screenshot({path: testInfo.outputPath(`period-category-${width}-${height}.png`), animations: 'disabled'});
  54  |     }
  55  |   }
  56  |   await expect(period.getByRole('button', {name: '4 weeks', exact: true})).toHaveAttribute('aria-pressed', 'true');
  57  |   await expect(category.getByRole('button', {name: 'Songs', exact: true})).toHaveAttribute('aria-pressed', 'true');
  58  |   const loadedIcons = await category.locator('img').evaluateAll(images => images.map(image => ({loaded: (image as HTMLImageElement).complete,
  59  |     width: (image as HTMLImageElement).naturalWidth, height: (image as HTMLImageElement).naturalHeight, src: (image as HTMLImageElement).currentSrc})));
  60  |   expect(loadedIcons).toHaveLength(3);
  61  |   for (const icon of loadedIcons) {expect(icon.loaded).toBe(true); expect(icon.width).toBe(20); expect(icon.height).toBe(20); expect(icon.src).toContain('/new/assets/design-v2/stats-category-');}
  62  |   await expectNoBlockingAxeViolations(page);
  63  |   await writeFile(testInfo.outputPath('period-category-responsive-geometry.json'), JSON.stringify(evidence, null, 2));
  64  | });
  65  | 
  66  | test('period keyboard changes query the selected range once and category choices reuse its payload', async ({page}, testInfo) => {
  67  |   const requests: {kind: string; range: string | null}[] = [];
  68  |   await page.route('https://api.spotify.com/v1/me/top/**', async route => {
  69  |     const url = new URL(route.request().url()), kind = url.pathname.endsWith('tracks') ? 'tracks' : 'artists', range = url.searchParams.get('time_range');
  70  |     requests.push({kind, range});
  71  |     const item = kind === 'tracks' ? {id: `song-${range}`, name: `Song ${range}`, artists: [{name: 'Artist'}], album: {images: []}}
  72  |       : {id: `artist-${range}`, name: `Artist ${range}`, images: [], genres: ['pop']};
  73  |     await route.fulfill({json: {items: [item], total: 1}});
  74  |   });
  75  |   await page.goto('/new/stats');
  76  |   const period = page.getByRole('group', {name: 'Ranking period'});
  77  |   const category = page.getByRole('group', {name: 'Ranking category'});
  78  |   await expect(page.locator('.v2-ranking-list strong')).toHaveText('Song short_term');
  79  |   await period.getByRole('button', {name: '4 weeks', exact: true}).press('ArrowRight');
  80  |   const medium = period.getByRole('button', {name: '6 months', exact: true});
  81  |   await expect(medium).toBeFocused();
  82  |   await expect(medium).toHaveAttribute('aria-pressed', 'true');
  83  |   await expect(page.locator('.v2-ranking-list strong')).toHaveText('Song medium_term');
  84  |   await medium.press('End');
  85  |   const long = period.getByRole('button', {name: '1 year', exact: true});
  86  |   await expect(long).toBeFocused();
  87  |   await expect(page.locator('.v2-ranking-list strong')).toHaveText('Song long_term');
  88  |   await long.press('Space');
  89  |   await category.getByRole('button', {name: 'Songs', exact: true}).press('ArrowRight');
  90  |   const artists = category.getByRole('button', {name: 'Artists', exact: true});
  91  |   await expect(artists).toBeFocused();
  92  |   await expect(artists).toHaveCSS('border-top-width', '2px');
  93  |   await expect(artists).toHaveCSS('border-top-color', 'rgb(53, 231, 131)');
  94  |   await expect(page.locator('.v2-artist-rankings strong')).toHaveText('Artist long_term');
> 95  |   expect(requests.sort((a, b) => `${a.range}:${a.kind}`.localeCompare(`${b.range}:${b.kind}`))).toEqual(
      |                                                                                                 ^ Error: expect(received).toEqual(expected) // deep equality
  96  |     ['long_term', 'medium_term', 'short_term'].flatMap(range => [{kind: 'artists', range}, {kind: 'tracks', range}]));
  97  |   await expectNoBlockingAxeViolations(page);
  98  |   await writeFile(testInfo.outputPath('period-service-requests.json'), JSON.stringify(requests, null, 2));
  99  | });
  100 | 
```