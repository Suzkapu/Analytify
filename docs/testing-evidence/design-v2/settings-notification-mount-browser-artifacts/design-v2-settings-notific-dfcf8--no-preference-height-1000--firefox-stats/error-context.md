# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-notifications.spec.ts >> Notifications save independently of this device (no-preference, height 1000)
- Location: e2e/design-v2-settings-notifications.spec.ts:7:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/new\/settings\/install$/
Received string:  "http://127.0.0.1:4200/new/settings/notifications"

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    4 × locator resolved to <html lang="en">…</html>
      - unexpected value "http://127.0.0.1:4200/new/settings/notifications"
  - 

```

```yaml
- link "Skip to main content":
  - /url: "#v2-main-content"
- banner:
  - link "Analytify playlists":
    - /url: /new/playlists
    - text: Analytify
  - navigation "Main navigation":
    - link "Playlists":
      - /url: /new/playlists
    - link "Stats":
      - /url: /new/stats
    - link "History":
      - /url: /new/history
  - button "Open More tools": More
  - button "Open account and data settings"
- main "Settings content":
  - heading "Settings" [level=1]
  - paragraph: Manage your account, notifications, updates and saved data.
  - navigation "Settings sections":
    - link "Account":
      - /url: /new/settings/account
    - link "Notifications":
      - /url: /new/settings/notifications
    - link "Updates":
      - /url: /new/settings/updates
    - link "Data":
      - /url: /new/settings/data
  - region "Notification settings":
    - strong: Notifications are unavailable
    - paragraph: Use a supported browser or install Analytify on this device.
    - link "How to install app":
      - /url: /new/settings/install
    - strong: Song League pick window
    - text: Remind me when weekly picks open.
    - switch "Song League pick window" [checked]
    - strong: New Song League pick
    - text: Notify me when someone submits a song.
    - switch "New Song League pick"
    - strong: Stats access requests
    - text: Notify me when someone asks to view my stats.
    - switch "Stats access requests" [checked]
    - paragraph: Category preferences save automatically. Device permission is separate.
    - status: Notification settings saved.
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
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
  10 |       let statsEnabled = false; let failSave = true; let holdSave: (() => void) | undefined;
  11 |       const writes: unknown[] = []; const unexpected: string[] = []; const transitionErrors: string[] = [];
  12 |       page.on('console', message => {if (/DOM update timed out|Transition was aborted|TimeoutError/.test(message.text())) transitionErrors.push(message.text());});
  13 |       page.on('pageerror', error => {transitionErrors.push(error.message);});
  14 |       page.on('request', request => {if (request.url().includes('upsert_push_subscription') || request.url().includes('/functions/v1/')) unexpected.push(request.url());});
  15 |       await page.route('**/rest/v1/rpc/get_notification_settings', route => route.fulfill({json: [{song_league_enabled: true,
  16 |         song_league_song_added_enabled: false, song_league_member: true, stats_access_requests_enabled: statsEnabled,
  17 |         device_registered: false, registered_device_count: 0}]}));
  18 |       await page.route('**/rest/v1/rpc/set_notification_preference', async route => {
  19 |         const body = route.request().postDataJSON(); writes.push(body);
  20 |         if (failSave) {failSave = false; return route.fulfill({status: 500, json: {message: 'Preference save failed'}});}
  21 |         await new Promise<void>(resolve => {holdSave = resolve;});
  22 |         statsEnabled = body.p_enabled; await route.fulfill({json: null});
  23 |       });
  24 |       await seedAuthenticatedBrowser(page, {cloudIdentity: true}); await page.goto('/new/settings/notifications');
  25 |       const panel = page.locator('v2-settings-notifications'); const stats = panel.getByRole('switch', {name: 'Stats access requests'});
  26 |       await expect(stats).toBeVisible(); await expect(stats).not.toBeChecked();
  27 |       // The dev build intentionally has no enabled service worker: actual unsupported state.
  28 |       await expect(panel.getByText('Notifications are unavailable', {exact: true})).toBeVisible();
  29 |       await expect(panel.getByRole('button', {name: 'Enable notifications'})).toHaveCount(0);
  30 |       await stats.press('Space'); await expect(panel.getByRole('alert')).toHaveText('Preference save failed');
  31 |       await expect(stats).not.toBeChecked(); await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  32 |       await expect(panel.getByRole('alert')).toHaveCount(0); await stats.press('Space');
  33 |       await expect(stats).toBeDisabled(); await expect(stats).not.toBeChecked();
  34 |       await expect.poll(() => !!holdSave).toBe(true); holdSave!();
  35 |       await expect(stats).toBeChecked(); await expect(stats).toBeEnabled();
  36 |       expect(writes).toEqual([{p_category: 'stats_access_requests', p_enabled: true}, {p_category: 'stats_access_requests', p_enabled: true}]);
  37 |       await expectNoBlockingAxeViolations(page);
  38 |       const geometry = [];
  39 |       for (const width of [320, 360, 390, 760, 768, 1024, 1440, 1920]) {
  40 |         await page.setViewportSize({width, height}); await stats.scrollIntoViewIfNeeded(); await stats.click({trial: true});
  41 |         const sample = await stats.evaluate(element => {
  42 |           const box = element.getBoundingClientRect(); const row = element.closest('label')!.getBoundingClientRect();
  43 |           const images = [...element.closest('label')!.querySelectorAll('img')].map(image => {
  44 |             const bounds = image.getBoundingClientRect(); return {src: image.getAttribute('src'), width: bounds.width, height: bounds.height, loaded: image.complete && image.naturalWidth > 0};
  45 |           });
  46 |           return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  47 |             target: {width: box.width, height: box.height, right: box.right}, row: {left: row.left, right: row.right}, images};
  48 |         });
  49 |         expect(sample.scrollWidth).toBeLessThanOrEqual(width); expect(sample.target).toEqual({width: 48, height: 56, right: expect.any(Number)});
  50 |         expect(sample.row.left).toBeGreaterThanOrEqual(0); expect(sample.row.right).toBeLessThanOrEqual(width);
  51 |         expect(sample.images.map(image => [image.width, image.height, image.loaded])).toEqual([[20, 20, true], [48, 24, true]]);
  52 |         geometry.push(sample);
  53 |       }
  54 |       await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
> 55 |       await panel.screenshot({path: info.outputPath('notifications.png')});
     |                          ^ Error: expect(page).toHaveURL(expected) failed
  56 |       await panel.getByRole('link', {name: 'How to install app'}).press('Enter');
  57 |       await expect(page).toHaveURL(/\/new\/settings\/install$/); const guide = page.locator('v2-settings-install');
  58 |       await expect(guide.locator('article')).toHaveCount(5); await expect(guide.getByRole('heading', {level: 1})).toHaveText('Install Analytify');
  59 |       await expectNoBlockingAxeViolations(page); await guide.screenshot({path: info.outputPath('install.png')});
  60 |       await guide.getByRole('button', {name: 'Back', exact: true}).press('Enter');
  61 |       await expect(page).toHaveURL(/\/new\/settings\/notifications$/); await expect(stats).toBeChecked();
  62 |       expect(unexpected).toEqual([]);
  63 |       expect(transitionErrors).toEqual([]);
  64 |       await writeFile(info.outputPath('notification-workflow.json'), JSON.stringify({motion, height, geometry, writes, unexpected, transitionErrors}, null, 2));
  65 |     });
  66 |   }
  67 | }
  68 | 
```