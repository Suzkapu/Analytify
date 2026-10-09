# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-insights.spec.ts >> Insights long names and controls reflow across the release matrix and enlarged text
- Location: e2e/design-v2-insights.spec.ts:71:5

# Error details

```
Error: expect(received).toBeCloseTo(expected, precision)

Expected: 70.1667
Received: 70.1666259765625

Expected precision:    4
Expected difference: < 0.00005
Received difference:   0.0000740234375058435
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
              - button "4 weeks" [pressed] [ref=f1e41] [cursor=pointer]
              - button "6 months" [ref=f1e43] [cursor=pointer]
              - button "1 year" [ref=f1e45] [cursor=pointer]
          - generic [ref=f1e47]:
            - paragraph [ref=f1e48]: Category
            - group "Ranking category" [ref=f1e49]:
              - button "Songs" [pressed] [ref=f1e50] [cursor=pointer]
              - button "Artists" [ref=f1e53] [cursor=pointer]
              - button "Genres" [ref=f1e56] [cursor=pointer]
        - group "Search rankings" [ref=f1e60]:
          - generic [ref=f1e62]:
            - generic [ref=f1e63]: Search songs or artists
            - generic [ref=f1e64]:
              - generic [aria-hidden]: 
              - searchbox "Search songs or artists" [ref=f1e65]
          - button "Compare dates" [ref=f1e66] [cursor=pointer]
          - switch "Search past rankings" [ref=f1e69] [cursor=pointer]
        - generic [ref=f1e74]:
          - group "Rank 1. Unchanged" [ref=f1e75]:
            - generic [aria-hidden] [ref=f1e76]: "1"
            - generic [aria-hidden] [ref=f1e77]: —
          - button "Open A very long song title with an extended edition and featured artists A very long song title with an extended edition and featured artists A very long song title with an extended edition and featured artists A very long song title with an extended edition and featured artists on Spotify" [disabled] [ref=f1e78]:
            - img "A very long song title with an extended edition and featured artists A very long song title with an extended edition and featured artists A very long song title with an extended edition and featured artists A very long song title with an extended edition and featured artists cover" [ref=f1e79]
          - generic [ref=f1e80]:
            - strong [ref=f1e81]: A very long song title with an extended edition and featured artists A very long song title with an extended edition and featured artists A very long song title with an extended edition and featured artists A very long song title with an extended edition and featured artists
            - generic [ref=f1e82]: A long artist name A long artist name A long artist name A long artist name A long artist name
          - button "View position history for A very long song title with an extended edition and featured artists A very long song title with an extended edition and featured artists A very long song title with an extended edition and featured artists A very long song title with an extended edition and featured artists" [ref=f1e83] [cursor=pointer]: History
        - button " Create playlist" [ref=f1e84] [cursor=pointer]:
          - generic [ref=f1e85]: 
          - text: Create playlist
  - text:   
  - contentinfo [ref=f1e86]:
    - generic [ref=f1e87]: Powered by Spotify
    - generic [ref=f1e88]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e89] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  3   | import {
  4   |   expectNoBlockingAxeViolations,
  5   |   mockSpotify,
  6   |   seedAuthenticatedBrowser
  7   | } from './helpers/authenticated-browser';
  8   | 
  9   | test.beforeEach(async ({page}) => {
  10  |   await mockSpotify(page);
  11  |   await seedAuthenticatedBrowser(page);
  12  | });
  13  | 
  14  | test('v2 Stats exposes labeled independent controls and keyboard category tabs', async ({page}) => {
  15  |   await page.goto('/new/stats');
  16  |   await expect(page.getByRole('main', {name: 'Your Top Listening content'})).toBeVisible();
  17  |   await expect(page.getByRole('group', {name: 'Ranking period'})).toBeVisible();
  18  | 
  19  |   const songs = page.getByRole('button', {name: 'Songs'});
  20  |   await expect(songs).toHaveAttribute('aria-pressed', 'true');
  21  |   await expect(page.getByRole('searchbox', {name: 'Search songs or artists'})).toBeVisible();
  22  |   const songHistory = page.getByRole('button', {name: 'View position history for Test Song'});
  23  |   await expect(songHistory).toBeVisible();
  24  |   await songHistory.press('Space');
  25  |   await expect(page.getByRole('dialog')).toBeVisible();
  26  |   await page.keyboard.press('Escape');
  27  |   await expect(songHistory).toBeFocused();
  28  |   await expect(page.locator('.v2-ranking-row[role="button"]')).toHaveCount(0);
  29  |   await songs.press('ArrowRight');
  30  |   await expect(page.getByRole('button', {name: 'Artists'})).toHaveAttribute('aria-pressed', 'true');
  31  |   await expect(page.getByRole('searchbox', {name: 'Search artists'})).toBeVisible();
  32  |   const artistHistory = page.getByRole('button', {name: 'View position history for Test Artist'});
  33  |   await artistHistory.press('Enter');
  34  |   await expect(page.getByRole('dialog')).toBeVisible();
  35  |   await page.keyboard.press('Escape');
  36  |   await expect(artistHistory).toBeFocused();
  37  |   await expect(page.getByRole('button', {name: 'Open Test Artist on Spotify'})).toBeVisible();
  38  |   await expect(page.locator('.v2-ranked-artist[role="button"]')).toHaveCount(0);
  39  | 
  40  |   const historical = page.getByRole('switch', {name: 'Search past rankings'});
  41  |   await expect(historical).toHaveAttribute('aria-checked', 'false');
  42  |   await historical.click();
  43  |   await expect(historical).toHaveAttribute('aria-checked', 'true');
  44  |   await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  45  |   await expectNoBlockingAxeViolations(page);
  46  | });
  47  | 
  48  | test('v2 Recently Played groups dates without chart-like position numbers', async ({page}) => {
  49  |   await page.goto('/new/history');
  50  |   await expect(page.getByRole('main', {name: 'Recently Played content'})).toBeVisible();
  51  |   await expect(page.getByRole('heading', {name: 'Today'})).toBeVisible({timeout: 15_000});
  52  |   await expect(page.getByRole('heading', {name: 'Yesterday'})).toBeVisible();
  53  |   await expect(page.getByText('Played today')).toBeVisible();
  54  |   const chronologyLabels = await page.locator('.v2-history-row time').allTextContents();
  55  |   expect(chronologyLabels.every(label => !label.includes('#'))).toBe(true);
  56  |   await expect(page.locator('time[datetime]')).toHaveCount(2);
  57  |   await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  58  |   await expectNoBlockingAxeViolations(page);
  59  | });
  60  | 
  61  | test('v2 Insights reflows at 320 CSS pixels', async ({page}) => {
  62  |   await page.setViewportSize({width: 320, height: 800});
  63  |   for (const path of ['/stats', '/history']) {
  64  |     await page.goto('/new' + path);
  65  |     await expect(page.locator('.v2-page')).toBeVisible({timeout: 15_000});
  66  |     const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  67  |     expect(overflow, `${path} should not overflow horizontally`).toBeLessThanOrEqual(1);
  68  |   }
  69  | });
  70  | 
  71  | test('Insights long names and controls reflow across the release matrix and enlarged text', async ({page}, testInfo) => {
  72  |   const title = 'A very long song title with an extended edition and featured artists '.repeat(4);
  73  |   await page.route('https://api.spotify.com/v1/me/top/tracks?*', route => route.fulfill({json: {
  74  |     items: [{id: 'long-track', name: title,
  75  |       artists: [{id: 'artist-1', name: 'A long artist name '.repeat(5)}],
  76  |       album: {id: 'album-1', name: 'Test Album', images: []}, duration_ms: 180000}], total: 1
  77  |   }}));
  78  |   const matrix = [320, 375, 430, 500, 768, 1024, 1440].map(width => ({width, fontSize: '100%'}));
  79  |   matrix.push({width: 320, fontSize: '200%'}, {width: 768, fontSize: '200%'});
  80  |   const evidence: unknown[] = [];
  81  |   for (const path of ['/stats', '/history']) {
  82  |     await page.goto('/new' + path);
  83  |     await expect(page.locator('.v2-page')).toBeVisible();
  84  |     for (const {width, fontSize} of matrix) {
  85  |       await page.setViewportSize({width, height: 900});
  86  |       await page.evaluate(size => { document.documentElement.style.fontSize = size; }, fontSize);
  87  |       const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  88  |       expect(overflow, `${path} at ${width}px/${fontSize}`).toBeLessThanOrEqual(1);
  89  |       if (path === '/stats') {
  90  |         const history = page.getByRole('button', {name: `View position history for ${title.trim()}`});
  91  |         await expect(history).toBeVisible();
  92  |         const box = await history.boundingBox();
  93  |         const target = await history.evaluate(element => {
  94  |           const style = getComputedStyle(element);
  95  |           return {width: parseFloat(style.width), height: parseFloat(style.height),
  96  |             layoutWidth: (element as HTMLElement).offsetWidth, layoutHeight: (element as HTMLElement).offsetHeight};
  97  |         });
  98  |         expect(target.width).toBeGreaterThanOrEqual(44);
  99  |         expect(target.height).toBeGreaterThanOrEqual(44);
  100 |         expect(target.layoutWidth).toBeGreaterThanOrEqual(44);
  101 |         expect(target.layoutHeight).toBeGreaterThanOrEqual(44);
  102 |         // Gecko's screen projection can differ from integer layout by about 3e-5px.
> 103 |         expect(box!.width).toBeCloseTo(target.width, 4);
      |                            ^ Error: expect(received).toBeCloseTo(expected, precision)
  104 |         expect(box!.height).toBeCloseTo(target.height, 4);
  105 |         await expect(page.getByRole('searchbox', {name: 'Search songs or artists'})).toBeVisible();
  106 |       } else {
  107 |         await expect(page.getByText('Played today', {exact: true})).toBeVisible();
  108 |       }
  109 |       evidence.push({path, width, fontSize, overflow});
  110 |     }
  111 |     await page.evaluate(() => { document.documentElement.style.fontSize = '100%'; });
  112 |   }
  113 |   await testInfo.attach('insights-reflow-matrix.json', {
  114 |     body: JSON.stringify({project: testInfo.project.name,
  115 |       scope: 'CSS viewport and text enlargement, not browser zoom or manual screen-reader evidence', evidence}, null, 2),
  116 |     contentType: 'application/json'
  117 |   });
  118 | });
  119 | 
  120 | test('ranking history keyboard focus remains visible and meets non-text contrast', async ({page}, testInfo) => {
  121 |   await page.goto('/new/stats');
  122 |   const history = page.getByRole('button', {name: 'View position history for Test Song'});
  123 |   await expect(history).toBeVisible();
  124 |   const unfocusedBorder=await history.evaluate(element=>getComputedStyle(element).borderTopColor);
  125 |   await page.keyboard.press('Tab');
  126 |   await history.focus();
  127 |   await expect(history).toHaveCSS('border-top-color','rgb(159, 255, 200)');
  128 |   await expect(history).toHaveCSS('background-color','rgb(18, 24, 20)');
  129 |   const evidence = await history.evaluate(element => {
  130 |     const style = getComputedStyle(element);
  131 |     const row = element.closest('.v2-ranking-row')!;
  132 |     const background = getComputedStyle(row).backgroundColor;
  133 |     const rgba = (color: string) => {
  134 |       const values = color.match(/[\d.]+/g)!.map(Number);
  135 |       return [values[0], values[1], values[2], values[3] ?? 1];
  136 |     };
  137 |     const bg = rgba(background);
  138 |     const indicator = rgba(style.borderTopColor);
  139 |     const adjacent=[bg,rgba(style.backgroundColor)];
  140 |     const luminance = (channels: number[]) => channels.slice(0, 3).map(channel => channel / 255)
  141 |       .map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4)
  142 |       .reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0);
  143 |     const contrasts=adjacent.map(background=>{
  144 |       const painted=indicator.slice(0,3).map((channel,index)=>channel*indicator[3]+background[index]*(1-indicator[3]));
  145 |       const a=luminance(painted),b=luminance(background);
  146 |       return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  147 |     });
  148 |     const bounds = element.getBoundingClientRect(), container = row.getBoundingClientRect();
  149 |     return {visible: element.matches(':focus-visible'), style: style.borderTopStyle,
  150 |       color:style.borderTopColor,outline:style.outlineStyle,
  151 |       width: parseFloat(style.borderTopWidth), backgroundAlpha: bg[3],
  152 |       buttonAlpha:adjacent[1][3],contrasts,
  153 |       fits: bounds.left >= container.left && bounds.right <= container.right
  154 |         && bounds.top >= container.top && bounds.bottom <= container.bottom};
  155 |   });
  156 |   expect(evidence.visible).toBe(true);
  157 |   expect(evidence.style).not.toBe('none');
  158 |   expect(evidence.width).toBeGreaterThanOrEqual(2);
  159 |   expect(evidence.backgroundAlpha).toBe(1);
  160 |   expect(evidence.color).not.toBe(unfocusedBorder);
  161 |   expect(evidence.outline).toBe('none');
  162 |   expect(evidence.buttonAlpha).toBe(1);
  163 |   for(const contrast of evidence.contrasts) expect(contrast).toBeGreaterThanOrEqual(3);
  164 |   expect(evidence.fits).toBe(true);
  165 |   const evidencePath=testInfo.outputPath('ranking-focus-contrast.json');
  166 |   await writeFile(evidencePath,JSON.stringify({scope:'canonical inside-border focus against opaque button and row surfaces',
  167 |     project:testInfo.project.name,evidence},null,2)+'\n');
  168 |   await testInfo.attach('ranking-focus-contrast.json',{path:evidencePath,contentType:'application/json'});
  169 | });
  170 | 
```