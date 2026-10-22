# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Device shortcuts persist and keep navigation reachable (no-preference)
- Location: e2e/design-v2-navigation.spec.ts:7:7

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator: locator('v2-settings-navigation-preferences').getByRole('status')
Expected: "4 of 5 shortcuts selected"
Error: strict mode violation: locator('v2-settings-navigation-preferences').getByRole('status') resolved to 2 elements:
    1) <section role="status" aria-busy="true" class="v2-inline-status" _ngcontent-ng-c1522599058="">…</section> aka getByText('Saving navigation preferencesYour selection applies now. Wait for this device')
    2) <p role="status" _ngcontent-ng-c4099037600="">4 of 5 shortcuts selected</p> aka getByText('of 5 shortcuts selected')

Call log:
  - Expect "toHaveText" locator('v2-settings-navigation-preferences').getByRole('status') with timeout 5000ms
  - waiting for locator('v2-settings-navigation-preferences').getByRole('status')

```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - text:   
      - generic [ref=f1e9]: Settings
      - generic [ref=f1e11]:
        - button "Open More tools" [ref=f1e12] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e13]: 
          - generic [ref=f1e14]: More
        - button "Open account and data settings" [ref=f1e15] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e16]: 
  - main "Settings content" [ref=f1e17]:
    - generic "Settings" [ref=f1e19]:
      - generic [ref=f1e20]:
        - heading "Settings" [level=1] [ref=f1e24]
        - navigation "Settings sections" [ref=f1e27]:
          - link "Account" [ref=f1e28] [cursor=pointer]:
            - /url: /new/settings/account
            - generic [aria-hidden] [ref=f1e29]: 
          - link "Notifications" [ref=f1e31] [cursor=pointer]:
            - /url: /new/settings/notifications
            - generic [aria-hidden] [ref=f1e32]: 
            - generic [ref=f1e33]: Alerts
          - link "Updates" [ref=f1e34] [cursor=pointer]:
            - /url: /new/settings/updates
            - generic [aria-hidden] [ref=f1e35]: 
          - link "Data" [ref=f1e37] [cursor=pointer]:
            - /url: /new/settings/data
            - generic [aria-hidden] [ref=f1e38]: 
          - link "Navigation" [ref=f1e40] [cursor=pointer]:
            - /url: /new/settings/navigation
            - generic [aria-hidden] [ref=f1e41]: 
        - region [ref=f1e45]:
          - heading "Bottom navigation" [level=2] [ref=f1e46]
          - paragraph [ref=f1e47]: Choose up to five shortcuts. Choose none to hide the bar. Changes apply immediately; the Menu button always stays available.
          - status [ref=f1e48]: 4 of 5 shortcuts selected
          - generic "Bottom navigation shortcuts" [ref=f1e49]:
            - button "Playlists" [pressed] [ref=f1e51] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e52]: 
            - button "Stats" [pressed] [ref=f1e55] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e56]: 
            - button "History" [pressed] [ref=f1e59] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e60]: 
            - button "Friends" [pressed] [ref=f1e63] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e64]: 
            - button "Song Leagues" [ref=f1e67] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e68]: 
            - button "Private Sharing" [ref=f1e71] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e72]: 
            - button "Compare" [ref=f1e75] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e76]: 
  - navigation "Primary navigation" [ref=f1e78]:
    - link "Playlists" [ref=f1e79] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e80]: 
    - link "Stats" [ref=f1e82] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e83]: 
    - link "History" [ref=f1e85] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e86]: 
    - link "Friends" [ref=f1e88] [cursor=pointer]:
      - /url: /new/friends
      - generic [aria-hidden] [ref=f1e89]: 
  - contentinfo [ref=f1e91]:
    - generic [ref=f1e92]: Powered by Spotify
    - generic [ref=f1e93]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e94] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1  | import {test, expect} from './fixtures';
  2  | import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3  | import {observeNativeTransitions, expectNativeTransitionsSettled} from './helpers/native-transitions';
  4  | import {writeFile} from 'node:fs/promises';
  5  | 
  6  | for (const motion of ['no-preference', 'reduce'] as const) {
  7  |   test(`Device shortcuts persist and keep navigation reachable (${motion})`, async ({page}, info) => {
  8  |     await observeNativeTransitions(page); await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
  9  |     const unexpected: string[] = [], errors: string[] = [];
  10 |     page.on('pageerror', error => errors.push(error.message));
  11 |     await page.route('http://127.0.0.1:54321/**', route => {
  12 |       const name = new URL(route.request().url()).pathname.split('/').at(-1);
  13 |       if (name === 'get_public_site_settings') return route.fulfill({json: {}});
  14 |       if (name === 'is_app_admin') return route.fulfill({json: false});
  15 |       unexpected.push(route.request().url()); return route.abort('blockedbyclient');
  16 |     });
  17 |     await seedAuthenticatedBrowser(page);
  18 |     await page.goto('/new/settings/navigation');
  19 |     const panel = page.locator('v2-settings-navigation-preferences');
  20 |     const choice = (name: string) => panel.getByRole('button', {name, exact: true});
  21 |     const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true});
  22 |     await expect(panel.getByRole('heading', {name: 'Bottom navigation'})).toBeVisible();
  23 |     await expect(panel.getByRole('status')).toHaveText('3 of 5 shortcuts selected');
  24 |     await expect(bar.getByRole('link')).toHaveText(['Playlists', 'Stats', 'History']);
  25 |     await choice('Friends').press('Enter');
> 26 |     await expect(panel.getByRole('status')).toHaveText('4 of 5 shortcuts selected');
     |                                             ^ Error: expect(locator).toHaveText(expected) failed
  27 |     await choice('Song Leagues').press('Enter');
  28 |     await expect(panel.getByRole('status')).toHaveText('5 of 5 shortcuts selected');
  29 |     await expect(bar.getByRole('link')).toHaveText(['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']);
  30 |     await expect(bar.getByRole('link', {name: 'Friends', exact: true})).toHaveAttribute('href', '/new/friends');
  31 |     await choice('Private Sharing').press('Enter');
  32 |     await expect(panel.getByText('Five shortcuts selected. Remove one before adding another.', {exact: true})).toBeVisible();
  33 |     await expect(choice('Private Sharing')).toHaveAttribute('aria-pressed', 'false');
  34 |     const geometry = [];
  35 |     for (const height of [480, 1000]) for (const width of [320, 390, 760, 768, 1440]) {
  36 |       await page.setViewportSize({width, height});
  37 |       const sample = await panel.evaluate(element => {
  38 |         const buttons = [...element.querySelectorAll<HTMLButtonElement>('.shortcut-choice')].map(button => {
  39 |           const rect = button.getBoundingClientRect(), css = getComputedStyle(button);
  40 |           return {left: rect.left, right: rect.right, height: rect.height, fontSize: css.fontSize, transition: css.transitionDuration};
  41 |         });
  42 |         const nav = document.querySelector('.v2-mobile-nav')!;
  43 |         const rect = nav.getBoundingClientRect();
  44 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, buttons,
  45 |           bar: {visible: getComputedStyle(nav).display !== 'none', left: rect.left, right: rect.right, bottom: rect.bottom,
  46 |             rows: new Set([...nav.querySelectorAll('a')].map(link => Math.round(link.getBoundingClientRect().top))).size}};
  47 |       });
  48 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  49 |       for (const button of sample.buttons) {
  50 |         expect(button.left).toBeGreaterThanOrEqual(0); expect(button.right).toBeLessThanOrEqual(width);
  51 |         expect(button.height).toBe(48); expect(button.fontSize).toBe('12px');
  52 |         if (motion === 'reduce') expect(button.transition).toBe('0s');
  53 |       }
  54 |       if (sample.bar.visible) {
  55 |         expect(sample.bar.rows).toBe(1); expect(sample.bar.left).toBeGreaterThanOrEqual(0);
  56 |         expect(sample.bar.right).toBeLessThanOrEqual(width); expect(sample.bar.bottom).toBeLessThanOrEqual(height);
  57 |       }
  58 |       geometry.push(sample);
  59 |     }
  60 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  61 |     await expectNoBlockingAxeViolations(page);
  62 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']) {
  63 |       await choice(label).press('Enter');
  64 |       await expect(choice(label)).toHaveAttribute('aria-pressed', 'false');
  65 |     }
  66 |     await expect(panel.getByRole('status')).toHaveText('0 of 5 shortcuts selected');
  67 |     await expect(bar).toHaveCount(0);
  68 |     await page.reload();
  69 |     await expect(panel.getByRole('status')).toHaveText('0 of 5 shortcuts selected');
  70 |     await expect(bar).toHaveCount(0);
  71 |     const menu = page.getByRole('button', {name: 'Open More tools', exact: true});
  72 |     await menu.press('Enter');
  73 |     const dialog = page.getByRole('dialog', {name: 'More', exact: true});
  74 |     await expect(dialog).toBeVisible();
  75 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare Room', 'Settings']) {
  76 |       await expect(dialog.getByRole('link', {name: label, exact: true})).toHaveCount(1);
  77 |     }
  78 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(menu).toBeFocused();
  79 |     await choice('Friends').press('Enter');
  80 |     await expect(panel.getByRole('status')).toHaveText('1 of 5 shortcuts selected');
  81 |     await page.reload();
  82 |     await expect(panel.getByRole('status')).toHaveText('1 of 5 shortcuts selected');
  83 |     await expect(bar.getByRole('link')).toHaveText(['Friends']);
  84 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  85 |     await page.evaluate(() => document.fonts.ready);
  86 |     await panel.screenshot({path: info.outputPath('navigation-selected.png'), animations: 'disabled'});
  87 |     await writeFile(info.outputPath('navigation-native.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  88 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  89 |   });
  90 | }
  91 | 
```