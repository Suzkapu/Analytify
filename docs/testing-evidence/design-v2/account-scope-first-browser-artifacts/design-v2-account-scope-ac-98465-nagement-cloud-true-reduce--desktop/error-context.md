# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-account-scope.spec.ts >> account retains settings and excludes blocked management (cloud=true, reduce)
- Location: e2e/design-v2-account-scope.spec.ts:6:7

# Error details

```
Error: expect(received).toBeLessThanOrEqual(expected)

Expected: <= 480
Received:    608.828125
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link [aria-hidden] [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
    - text: Skip to main content
  - banner [aria-hidden] [ref=f1e7]:
    - generic [ref=f1e8]:
      - link [ref=f1e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e10]: Analytify
      - navigation [ref=f1e11]:
        - link [ref=f1e12] [cursor=pointer]:
          - /url: /new/playlists
          - generic [aria-hidden] [ref=f1e13]: 
          - generic [ref=f1e14]: Playlists
        - link [ref=f1e15] [cursor=pointer]:
          - /url: /new/stats
          - generic [aria-hidden] [ref=f1e16]: 
          - generic [ref=f1e17]: Stats
        - link [ref=f1e18] [cursor=pointer]:
          - /url: /new/history
          - generic [aria-hidden] [ref=f1e19]: 
          - generic [ref=f1e20]: History
      - generic [ref=f1e21]:
        - button [ref=f1e22] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e23]: 
          - generic [ref=f1e24]: More
        - button [expanded] [ref=f1e25] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e26]: 
  - main [aria-hidden] [ref=f1e27]:
    - generic [ref=f1e30]:
      - generic [ref=f1e32]:
        - heading [level=1] [ref=f1e34]: Your top listening
        - paragraph [ref=f1e35]: Your songs, artists and genres, ranked over time.
      - generic [ref=f1e36]:
        - region [ref=f1e37]:
          - generic [ref=f1e38]:
            - paragraph [ref=f1e39]: Period
            - group [ref=f1e40]:
              - button [pressed] [ref=f1e41] [cursor=pointer]:
                - generic [ref=f1e42]: 4 weeks
              - button [ref=f1e43] [cursor=pointer]:
                - generic [ref=f1e44]: 6 months
              - button [ref=f1e45] [cursor=pointer]:
                - generic [ref=f1e46]: 1 year
          - generic [ref=f1e47]:
            - paragraph [ref=f1e48]: Category
            - group [ref=f1e49]:
              - button [pressed] [ref=f1e50] [cursor=pointer]:
                - generic [ref=f1e52]: Songs
              - button [ref=f1e53] [cursor=pointer]:
                - generic [ref=f1e55]: Artists
              - button [ref=f1e56] [cursor=pointer]:
                - generic [ref=f1e58]: Genres
        - group [ref=f1e60]:
          - generic [ref=f1e62]:
            - generic [ref=f1e63]: Search songs or artists
            - searchbox [ref=f1e65]
          - button [ref=f1e66] [cursor=pointer]: Compare dates
          - switch [ref=f1e69] [cursor=pointer]:
            - generic [ref=f1e70]: Search past rankings
        - region [ref=f1e73]:
          - heading [level=2] [ref=f1e74]: Top songs
          - generic [ref=f1e76]:
            - group [ref=f1e77]:
              - generic [aria-hidden] [ref=f1e78]: "1"
              - generic [aria-hidden] [ref=f1e79]: —
            - button [disabled] [ref=f1e80]
            - generic [ref=f1e82]:
              - strong [ref=f1e83]: Test Song
              - generic [ref=f1e84]: Test Artist
            - button [ref=f1e85] [cursor=pointer]: History
          - button [ref=f1e87] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e88]: 
            - text: Create playlist from these songs
  - text:   
  - contentinfo [aria-hidden] [ref=f1e89]:
    - generic [ref=f1e90]: Powered by Spotify
    - generic [ref=f1e91]: Artwork and metadata belong to their owners.
    - link [ref=f1e92] [cursor=pointer]:
      - /url: /new/legal
      - text: Legal & privacy
  - generic [ref=f1e93]:
    - button [aria-hidden] [ref=f1e94] [cursor=pointer]
    - dialog [ref=f1e95]:
      - generic [ref=f1e96]:
        - generic [aria-hidden] [ref=f1e98]: 
        - generic [ref=f1e99]:
          - text: Account & data
          - heading "Browser test user" [level=2] [ref=f1e100]
        - button "Close account settings" [active] [ref=f1e101] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e102]: 
      - paragraph [ref=f1e103]: Manage your account, data, privacy, and automatic features.
      - generic [ref=f1e104]:
        - generic [ref=f1e105] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e106]: 
          - generic [ref=f1e107]: Cloud Backup
          - switch "Cloud Backup" [ref=f1e108]
        - button "Notifications" [ref=f1e109] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e110]: 
        - button "Automatic updates" [ref=f1e112] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e113]: 
        - button "Log out" [ref=f1e115] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e116]: 
        - link "Privacy notice" [ref=f1e118] [cursor=pointer]:
          - /url: /new/legal#privacy
          - generic [aria-hidden] [ref=f1e119]: 
        - link "Manage Spotify access" [ref=f1e121] [cursor=pointer]:
          - /url: https://www.spotify.com/account/apps/
          - generic [aria-hidden] [ref=f1e122]: 
        - button "Clear data" [ref=f1e124] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e125]: 
```

# Test source

```ts
  1  | import {test, expect} from './fixtures';
  2  | import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3  | import {writeFile} from 'node:fs/promises';
  4  | 
  5  | for (const cloudIdentity of [false, true]) for (const motion of ['no-preference', 'reduce'] as const) {
  6  |   test(`account retains settings and excludes blocked management (cloud=${cloudIdentity}, ${motion})`, async ({page}, info) => {
  7  |     await page.emulateMedia({reducedMotion: motion});
  8  |     await mockSpotify(page);
  9  |     await seedAuthenticatedBrowser(page, {cloudIdentity});
  10 |     await page.goto('/new/stats');
  11 |     await expect(page.getByRole('status', {name: 'Loading Analytify', exact: true})).toHaveCount(0);
  12 |     await expect(page.locator('.v2-ranking-list strong')).toHaveText('Test Song');
  13 |     const trigger = page.getByRole('button', {name: 'Open account and data settings', exact: true});
  14 |     await trigger.press('Enter');
  15 |     const menu = page.locator('.v2-account-dialog');
  16 |     await expect(menu).toBeVisible();
  17 |     await expect(menu.getByRole('button', {name: 'Blocked users', exact: true})).toHaveCount(0);
  18 |     await expect(menu.getByRole('button', {name: 'Notifications', exact: true})).toBeVisible();
  19 |     await expect(menu.getByRole('button', {name: 'Automatic updates', exact: true})).toHaveCount(cloudIdentity ? 1 : 0);
  20 |     await expect(menu.getByRole('switch', {name: 'Cloud Backup', exact: true})).toBeVisible();
  21 |     await expect(menu.getByRole('link', {name: 'Manage Spotify access', exact: true})).toHaveAttribute('href', 'https://www.spotify.com/account/apps/');
  22 |     await expect(menu.getByRole('link', {name: 'Privacy notice', exact: true})).toHaveAttribute('href', '/new/legal#privacy');
  23 |     await expect(menu.getByRole('button', {name: 'Log out', exact: true})).toBeVisible();
  24 |     const geometry = [];
  25 |     for (const width of [320, 390, 1440]) for (const height of [480, 1080]) {
  26 |       await page.setViewportSize({width, height});
  27 |       const clear = menu.getByRole('button', {name: 'Clear data', exact: true});
  28 |       await clear.scrollIntoViewIfNeeded();
  29 |       const sample = await clear.evaluate(button => {
  30 |         const rect = button.getBoundingClientRect(), dialog = button.closest('[role="dialog"]')!.getBoundingClientRect();
  31 |         return {width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth,
  32 |           left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom,
  33 |           dialogLeft: dialog.left, dialogRight: dialog.right, dialogTop: dialog.top, dialogBottom: dialog.bottom,
  34 |           reachable: document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button') === button};
  35 |       });
  36 |       expect(sample.overflow).toBe(0);
  37 |       expect(sample.dialogLeft).toBeGreaterThanOrEqual(0); expect(sample.dialogRight).toBeLessThanOrEqual(width);
> 38 |       expect(sample.dialogTop).toBeGreaterThanOrEqual(0); expect(sample.dialogBottom).toBeLessThanOrEqual(height);
     |                                                                                       ^ Error: expect(received).toBeLessThanOrEqual(expected)
  39 |       expect(sample.top).toBeGreaterThanOrEqual(sample.dialogTop); expect(sample.bottom).toBeLessThanOrEqual(sample.dialogBottom);
  40 |       expect(sample.reachable).toBe(true); geometry.push(sample);
  41 |       if (height === 480) await menu.screenshot({path: info.outputPath(`account-${width}.png`)});
  42 |     }
  43 |     await expectNoBlockingAxeViolations(page);
  44 |     await menu.getByRole('button', {name: 'Close account settings', exact: true}).focus();
  45 |     await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); await expect(trigger).toBeFocused();
  46 |     await trigger.press('Enter');
  47 |     await menu.getByRole('button', {name: 'Notifications', exact: true}).press('Enter');
  48 |     const notifications = page.getByRole('dialog', {name: 'Notifications', exact: true});
  49 |     await expect(notifications).toBeVisible(); await expect(menu).toHaveCount(0);
  50 |     await expect(notifications.getByRole('button', {name: 'Close notification settings', exact: true})).toBeFocused();
  51 |     await page.keyboard.press('Escape'); await expect(notifications).toHaveCount(0);
  52 |     if (cloudIdentity) {
  53 |       await trigger.press('Enter');
  54 |       await menu.getByRole('button', {name: 'Automatic updates', exact: true}).press('Enter');
  55 |       const updates = page.getByRole('dialog', {name: 'Automatic updates', exact: true});
  56 |       await expect(updates).toBeVisible(); await expect(menu).toHaveCount(0);
  57 |       await expect(updates.getByRole('button', {name: 'Close automatic updates', exact: true})).toBeFocused();
  58 |       await page.keyboard.press('Escape'); await expect(updates).toHaveCount(0);
  59 |     }
  60 |     await writeFile(info.outputPath('account-geometry.json'), JSON.stringify(geometry, null, 2));
  61 |   });
  62 | }
  63 | 
```