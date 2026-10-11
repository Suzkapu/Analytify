# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-notifications.spec.ts >> Notifications save independently of this device (no-preference, height 1000)
- Location: e2e/design-v2-settings-notifications.spec.ts:7:9

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false

Call Log:
- Timeout 5000ms exceeded while waiting on the predicate
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
  - main "Settings content" [ref=f1e27]:
    - generic "Settings" [ref=f1e29]:
      - generic [ref=f1e30]:
        - generic [ref=f1e32]:
          - heading "Settings" [level=1] [ref=f1e34]
          - paragraph [ref=f1e35]: Manage your account, notifications, updates and saved data.
        - navigation "Settings sections" [ref=f1e38]:
          - link "Account" [ref=f1e39] [cursor=pointer]:
            - /url: /new/settings/account
            - generic [aria-hidden] [ref=f1e40]: 
          - link "Notifications" [ref=f1e42] [cursor=pointer]:
            - /url: /new/settings/notifications
            - generic [aria-hidden] [ref=f1e43]: 
          - link "Updates" [ref=f1e45] [cursor=pointer]:
            - /url: /new/settings/updates
            - generic [aria-hidden] [ref=f1e46]: 
          - link "Data" [ref=f1e48] [cursor=pointer]:
            - /url: /new/settings/data
            - generic [aria-hidden] [ref=f1e49]: 
          - text: 
        - region "Notification settings" [ref=f1e53]:
          - generic [ref=f1e54]:
            - strong [ref=f1e55]: Notifications are unavailable
            - paragraph [ref=f1e56]: Use a supported browser or install Analytify on this device.
          - link "How to install app" [ref=f1e58] [cursor=pointer]:
            - /url: /new/settings/install
            - generic [aria-hidden] [ref=f1e60]: 
          - generic [ref=f1e62] [cursor=pointer]:
            - generic [ref=f1e63]:
              - strong [ref=f1e64]: Song League pick window
              - generic [ref=f1e65]: Remind me when weekly picks open.
            - switch "Song League pick window" [checked] [ref=f1e67]
          - generic [ref=f1e69] [cursor=pointer]:
            - generic [ref=f1e70]:
              - strong [ref=f1e71]: New Song League pick
              - generic [ref=f1e72]: Notify me when someone submits a song.
            - switch "New Song League pick" [ref=f1e74]
          - generic [ref=f1e76] [cursor=pointer]:
            - generic [ref=f1e77]:
              - strong [ref=f1e78]: Stats access requests
              - generic [ref=f1e79]: Notify me when someone asks to view my stats.
            - switch "Stats access requests" [ref=f1e81]
          - paragraph [ref=f1e82]: Category preferences save automatically. Device permission is separate.
          - status [ref=f1e83]
  - text:   
  - contentinfo [ref=f1e84]:
    - generic [ref=f1e85]: Powered by Spotify
    - generic [ref=f1e86]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e87] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1  | import {test, expect} from './fixtures';
  2  | import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3  | import {writeFile} from 'node:fs/promises';
  4  | 
  5  | for (const motion of ['no-preference', 'reduce'] as const) {
  6  |   for (const height of [480, 1000]) {
  7  |     test(`Notifications save independently of this device (${motion}, height ${height})`, async ({page}, info) => {
  8  |       await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
  9  |       await page.route('**/rest/v1/users?**', route => route.fulfill({json: null}));
  10 |       await page.route('**/rest/v1/rpc/get_public_site_settings', route => route.fulfill({json: {}}));
  11 |       await page.route('**/rest/v1/rpc/is_app_admin', route => route.fulfill({json: false}));
  12 |       let statsEnabled = false; let failSave = true; let holdSave: (() => void) | undefined;
  13 |       const writes: unknown[] = []; const unexpected: string[] = []; const transitionErrors: string[] = []; const expectedSaveFailures: string[] = [];
  14 |       page.on('console', message => {
  15 |         if (message.location().url.endsWith('/rpc/set_notification_preference') && /server responded with a status of 500/.test(message.text())) expectedSaveFailures.push(message.text());
  16 |         else if (message.type() === 'error' || /DOM update timed out|Transition was aborted|TimeoutError/.test(message.text())) transitionErrors.push(message.text());
  17 |       });
  18 |       page.on('pageerror', error => {transitionErrors.push(error.message);});
  19 |       page.on('request', request => {if (request.url().includes('upsert_push_subscription') || request.url().includes('/functions/v1/')) unexpected.push(request.url());});
  20 |       await page.route('**/rest/v1/rpc/get_notification_settings', route => route.fulfill({json: [{song_league_enabled: true,
  21 |         song_league_song_added_enabled: false, song_league_member: true, stats_access_requests_enabled: statsEnabled,
  22 |         device_registered: false, registered_device_count: 0}]}));
  23 |       await page.route('**/rest/v1/rpc/set_notification_preference', async route => {
  24 |         const body = route.request().postDataJSON(); writes.push(body);
  25 |         if (failSave) {failSave = false; return route.fulfill({status: 500, json: {message: 'Preference save failed'}});}
  26 |         await new Promise<void>(resolve => {holdSave = resolve;});
  27 |         statsEnabled = body.p_enabled; await route.fulfill({json: null});
  28 |       });
  29 |       await seedAuthenticatedBrowser(page, {cloudIdentity: true}); await page.goto('/new/settings/notifications');
  30 |       const panel = page.locator('v2-settings-notifications'); const stats = panel.getByRole('switch', {name: 'Stats access requests'});
  31 |       await expect(stats).toBeVisible(); await expect(stats).not.toBeChecked();
  32 |       // The dev build intentionally has no enabled service worker: actual unsupported state.
  33 |       await expect(panel.getByText('Notifications are unavailable', {exact: true})).toBeVisible();
  34 |       await expect(panel.getByRole('button', {name: 'Enable notifications'})).toHaveCount(0);
  35 |       await stats.press('Space'); await expect(panel.getByRole('alert')).toHaveText('Preference save failed');
  36 |       await expect(stats).not.toBeChecked(); await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  37 |       await expect(panel.getByRole('alert')).toHaveCount(0); await stats.press('Space');
  38 |       await expect(stats).toBeDisabled(); await expect(stats).not.toBeChecked();
> 39 |       await expect.poll(() => !!holdSave).toBe(true); holdSave!();
     |                                           ^ Error: expect(received).toBe(expected) // Object.is equality
  40 |       await expect(stats).toBeChecked(); await expect(stats).toBeEnabled();
  41 |       expect(writes).toEqual([{p_category: 'stats_access_requests', p_enabled: true}, {p_category: 'stats_access_requests', p_enabled: true}]);
  42 |       await expectNoBlockingAxeViolations(page);
  43 |       const geometry = [];
  44 |       for (const width of [320, 360, 390, 760, 768, 1024, 1440, 1920]) {
  45 |         await page.setViewportSize({width, height}); await stats.scrollIntoViewIfNeeded(); await stats.click({trial: true});
  46 |         const sample = await stats.evaluate(element => {
  47 |           const box = element.getBoundingClientRect(); const row = element.closest('label')!.getBoundingClientRect();
  48 |           const images = [...element.closest('label')!.querySelectorAll('img')].map(image => {
  49 |             const bounds = image.getBoundingClientRect(); return {src: image.getAttribute('src'), width: bounds.width, height: bounds.height, loaded: image.complete && image.naturalWidth > 0};
  50 |           });
  51 |           const allImages = [...element.closest('v2-settings-notifications')!.querySelectorAll('img')].map(image => {const b=image.getBoundingClientRect();return {src:image.getAttribute('src'),width:b.width,height:b.height,loaded:image.complete&&image.naturalWidth>0};});
  52 |           return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, allImages,
  53 |             target: {width: box.width, height: box.height, right: box.right}, row: {left: row.left, right: row.right}, images};
  54 |         });
  55 |         expect(sample.scrollWidth).toBeLessThanOrEqual(width); expect(sample.target).toEqual({width: 48, height: 56, right: expect.any(Number)});
  56 |         expect(sample.row.left).toBeGreaterThanOrEqual(0); expect(sample.row.right).toBeLessThanOrEqual(width);
  57 |         expect(sample.images.map(image => [image.width, image.height, image.loaded])).toEqual([[20, 20, true], [48, 24, true]]);
  58 |         expect(sample.allImages).toHaveLength(7);
  59 |         for (const image of sample.allImages) {
  60 |           const size=image.src?.includes('switch-')?[48,24]:[20,20];
  61 |           expect([image.width,image.height,image.loaded]).toEqual([...size,true]);
  62 |         }
  63 |         geometry.push(sample);
  64 |       }
  65 |       await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  66 |       await page.evaluate(async () => {await document.fonts.ready;});
  67 |       await panel.screenshot({path: info.outputPath('notifications.png'), animations: 'disabled'});
  68 |       await page.screenshot({path: info.outputPath('notifications-page.png'), fullPage: true, animations: 'disabled'});
  69 |       await panel.getByRole('link', {name: 'How to install app'}).press('Enter');
  70 |       await expect(page).toHaveURL(/\/new\/settings\/install$/); const guide = page.locator('v2-settings-install');
  71 |       await expect(guide.locator('article')).toHaveCount(5); await expect(guide.getByRole('heading', {level: 1})).toHaveText('Install Analytify');
  72 |       await expectNoBlockingAxeViolations(page); await guide.screenshot({path: info.outputPath('install.png')});
  73 |       await page.screenshot({path: info.outputPath('install-page.png'), fullPage: true, animations: 'disabled'});
  74 |       await guide.getByRole('button', {name: 'Back', exact: true}).press('Enter');
  75 |       await expect(page).toHaveURL(/\/new\/settings\/notifications$/); await expect(stats).toBeChecked();
  76 |       expect(unexpected).toEqual([]);
  77 |       expect(transitionErrors).toEqual([]); expect(expectedSaveFailures.length).toBeLessThanOrEqual(1);
  78 |       await writeFile(info.outputPath('notification-workflow.json'), JSON.stringify({motion, height, geometry, writes, unexpected, transitionErrors, expectedSaveFailures}, null, 2));
  79 |     });
  80 |   }
  81 | }
  82 | 
```