# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-quality.spec.ts >> mobile fixed navigation does not obscure the last task region
- Location: e2e/design-v2-quality.spec.ts:80:5

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 564
Received:    770.0833129882812
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - text:   
      - generic [ref=f1e9]: Your Playlists
      - generic [ref=f1e11]:
        - button "Open More tools" [ref=f1e12] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e13]: 
          - generic [ref=f1e14]: More
        - button "Open account and data settings" [ref=f1e15] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e16]: 
  - main "Your Playlists content" [ref=f1e17]:
    - generic "Your playlists" [ref=f1e19]:
      - generic [ref=f1e20]:
        - generic [ref=f1e21]:
          - generic [ref=f1e22]:
            - paragraph [ref=f1e23]: Your Spotify library
            - heading "Your playlists" [level=1] [ref=f1e24]
            - paragraph [ref=f1e25]: Open a playlist, search its songs, or see a quick summary.
          - generic "Page actions" [ref=f1e26]:
            - generic "2 playlists" [ref=f1e27]
        - group "Playlist controls" [ref=f1e30]:
          - generic [ref=f1e32]:
            - generic [ref=f1e33]: Search playlists
            - generic [ref=f1e34]:
              - generic [aria-hidden]: 
              - searchbox "Search your playlists" [ref=f1e35]
          - 'button "Song count: default order" [ref=f1e36] [cursor=pointer]':
            - generic [ref=f1e37]: 
            - text: "Song count: default order"
        - region "Your playlists" [ref=f1e39]:
          - generic [ref=f1e40]:
            - link "Open Favourite Tracks on Spotify" [ref=f1e41] [cursor=pointer]:
              - /url: ""
              - img "Favourite Tracks cover" [ref=f1e42]
            - generic [ref=f1e43]:
              - heading "Favourite Tracks" [level=2] [ref=f1e44]
              - paragraph [ref=f1e45]: 0 songs
            - generic [ref=f1e46]:
              - link " Open" [ref=f1e47] [cursor=pointer]:
                - /url: /new/songs/fav
                - generic [ref=f1e48]: 
                - text: Open
              - link " Analyze" [ref=f1e49] [cursor=pointer]:
                - /url: /new/analysis/fav
                - generic [ref=f1e50]: 
                - text: Analyze
          - generic [ref=f1e51]:
            - link "Open Test Playlist on Spotify" [ref=f1e52] [cursor=pointer]:
              - /url: ""
              - img "Test Playlist cover" [ref=f1e53]
            - generic [ref=f1e54]:
              - heading "Test Playlist" [level=2] [ref=f1e55]
              - paragraph [ref=f1e56]: 1 song
            - generic [ref=f1e57]:
              - link " Open" [ref=f1e58] [cursor=pointer]:
                - /url: /new/songs/playlist-1
                - generic [ref=f1e59]: 
                - text: Open
              - link " Analyze" [ref=f1e60] [cursor=pointer]:
                - /url: /new/analysis/playlist-1
                - generic [ref=f1e61]: 
                - text: Analyze
  - navigation "Primary navigation" [ref=f1e62]:
    - link "Playlists" [ref=f1e63] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e64]: 
    - link "Stats" [ref=f1e66] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e67]: 
    - link "History" [ref=f1e69] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e70]: 
  - contentinfo [ref=f1e72]:
    - generic [ref=f1e73]: Powered by Spotify
    - generic [ref=f1e74]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e75] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1   | import {expect, test} from './fixtures';
  2   | import {
  3   |   expectNoBlockingAxeViolations,
  4   |   mockSpotify,
  5   |   seedAuthenticatedBrowser
  6   | } from './helpers/authenticated-browser';
  7   | 
  8   | const widths = [320, 375, 430, 500, 768, 1024, 1440] as const;
  9   | 
  10  | test('decorative icons use a non-blocking loaded font face', async ({page}) => {
  11  |   await page.goto('/new/login');
  12  |   await expect(page.locator('.pi:visible').first()).toBeVisible();
  13  |   const faces = await page.evaluate(async () => {
  14  |     const icon = document.querySelector('.pi')!;
  15  |     const family = getComputedStyle(icon).fontFamily;
  16  |     if (family.replace(/["']/g, '') !== 'AnalytifyIcons') throw new Error(`Unexpected icon face: ${family}`);
  17  |     await document.fonts.load(`16px ${family}`);
  18  |     return [...document.fonts].filter(face => face.family.replace(/["']/g, '') === 'AnalytifyIcons'
  19  |       && face.status === 'loaded').map(face => ({display: face.display, status: face.status}));
  20  |   });
  21  |   expect(faces.length).toBeGreaterThan(0);
  22  |   expect(faces.every(face => face.display === 'swap')).toBe(true);
  23  | });
  24  | 
  25  | test.beforeEach(async ({page}) => {
  26  |   await mockSpotify(page);
  27  |   await seedAuthenticatedBrowser(page, {cloudIdentity: true});
  28  | });
  29  | 
  30  | test('the temporary /new compatibility URL resolves to the canonical route', async ({page}) => {
  31  |   await page.goto('/new/playlists?source=bookmark#library');
  32  |   await expect(page).toHaveURL(/\/playlists\?source=bookmark#library$/);
  33  |   await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
  34  | });
  35  | 
  36  | test('the shared shell and representative dense content reflow at every release width', async ({page}) => {
  37  |   await page.goto('/new/playlists');
  38  |   await expect(page.getByRole('heading', {name: 'Your playlists', exact: true})).toBeVisible();
  39  |   for (const width of widths) {
  40  |     await page.setViewportSize({width, height: 900});
  41  |     const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  42  |     expect(overflow, `${width}px must not overflow horizontally`).toBeLessThanOrEqual(1);
  43  |     await expect(page.locator('app-design-v2-shell')).toHaveCount(1);
  44  |   }
  45  | });
  46  | 
  47  | test('200% text enlargement preserves the primary task and does not create horizontal overflow', async ({page}) => {
  48  |   await page.setViewportSize({width: 768, height: 900});
  49  |   await page.goto('/new/playlists');
  50  |   await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  51  |   await expect(page.getByRole('searchbox', {name: 'Search your playlists'})).toBeVisible();
  52  |   const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  53  |   expect(overflow).toBeLessThanOrEqual(1);
  54  | });
  55  | 
  56  | test('notification and automatic-update sheets restore focus and remain accessible', async ({page}) => {
  57  |   await page.goto('/new/playlists');
  58  |   const account = page.getByRole('button', {name: 'Open account and data settings'});
  59  |   await account.click();
  60  | 
  61  |   const notifications = page.getByRole('button', {name: 'Notifications'});
  62  |   await notifications.focus();
  63  |   await notifications.press('Enter');
  64  |   await expect(page.getByRole('dialog', {name: 'Notifications'})).toBeVisible();
  65  |   expect(await page.getByRole('dialog', {name: 'Notifications'}).locator('.pi:not([aria-hidden="true"])').count()).toBe(0);
  66  |   await expectNoBlockingAxeViolations(page);
  67  |   await page.keyboard.press('Escape');
  68  |   await expect(account).toBeFocused();
  69  | 
  70  |   await account.click();
  71  |   const automaticUpdates = page.getByRole('button', {name: 'Automatic updates'});
  72  |   await automaticUpdates.focus();
  73  |   await automaticUpdates.press('Enter');
  74  |   await expect(page.getByRole('dialog', {name: 'Automatic updates'})).toBeVisible();
  75  |   await expectNoBlockingAxeViolations(page);
  76  |   await page.keyboard.press('Escape');
  77  |   await expect(account).toBeFocused();
  78  | });
  79  | 
  80  | test('mobile fixed navigation does not obscure the last task region', async ({page}) => {
  81  |   await page.setViewportSize({width: 320, height: 640});
  82  |   await page.goto('/new/playlists');
  83  |   const card = page.locator('.v2-playlist-card').last();
  84  |   await expect(card).toBeVisible();
  85  |   await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  86  |   const cardBox = await card.boundingBox();
  87  |   const navBox = await page.getByRole('navigation', {name: 'Primary navigation'}).boundingBox();
  88  |   expect(cardBox).not.toBeNull();
  89  |   expect(navBox).not.toBeNull();
> 90  |   expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(navBox!.y);
      |                                        ^ Error: expect(received).toBeLessThanOrEqual(expected)
  91  | });
  92  | 
  93  | test('populated schedule sheets retain reachable 44px controls at narrow and enlarged-text sizes', async ({page}) => {
  94  |   const tasks = ['listening_history', 'stats_short_term', 'stats_medium_term', 'stats_long_term',
  95  |     'song_league_playlists', 'shared_playlists'].map(task_key => ({
  96  |     task_key, optional_enabled: true, feature_required: task_key.endsWith('playlists'),
  97  |     effective_active: true, reasons: ['Required by the features you use'],
  98  |     editable: !task_key.endsWith('playlists'), interval_value: 60, interval_unit: 'minutes',
  99  |     minimum_interval_minutes: 60, policy_available: true
  100 |   }));
  101 |   await page.route('**/rest/v1/rpc/get_my_sync_task_status', route => route.fulfill({json: tasks}));
  102 |   for (const [width, fontSize] of [[320, '100%'], [768, '200%']] as const) {
  103 |     await page.setViewportSize({width, height: 800});
  104 |     await page.goto('/new/playlists');
  105 |     await page.evaluate(size => { document.documentElement.style.fontSize = size; }, fontSize);
  106 |     const account = page.getByRole('button', {name: 'Open account and data settings'});
  107 |     await account.click();
  108 |     await page.getByRole('button', {name: 'Automatic updates', exact: true}).click();
  109 |     const dialog = page.getByRole('dialog', {name: 'Automatic updates'});
  110 |     await expect(dialog.locator('.sync-task-row')).toHaveCount(6);
  111 |     await dialog.getByRole('button', {name: /^Listening history/}).click();
  112 |     const close = dialog.getByRole('button', {name: 'Close automatic updates'});
  113 |     for (const control of [close, dialog.getByRole('spinbutton', {name: 'Every'}), dialog.getByRole('combobox', {name: 'Unit'})]) {
  114 |       // The sheet scales in on entry. Measure its settled touch target, not an
  115 |       // intermediate animation frame (which depends on CI rendering speed).
  116 |       await expect.poll(async () => (await control.boundingBox())?.width ?? 0).toBeGreaterThanOrEqual(44);
  117 |       await expect.poll(async () => (await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  118 |       const box = await control.boundingBox();
  119 |       expect(box).not.toBeNull();
  120 |       expect(box!.width).toBeGreaterThanOrEqual(44);
  121 |       expect(box!.height).toBeGreaterThanOrEqual(44);
  122 |     }
  123 |     const body = dialog.locator('.settings-sheet-body');
  124 |     await body.evaluate(element => { element.scrollTop = element.scrollHeight; });
  125 |     const closeBox = await close.boundingBox();
  126 |     expect(closeBox!.y).toBeGreaterThanOrEqual(0);
  127 |     expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(800);
  128 |     const hidden = await close.evaluate(element => {
  129 |       const box = element.getBoundingClientRect();
  130 |       return !element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  131 |     });
  132 |     expect(hidden).toBe(false);
  133 |     expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  134 |     await expectNoBlockingAxeViolations(page);
  135 |     await close.press('Enter');
  136 |     await expect(dialog).toHaveCount(0);
  137 |     await expect(account).toBeFocused();
  138 |   }
  139 | });
  140 | 
```