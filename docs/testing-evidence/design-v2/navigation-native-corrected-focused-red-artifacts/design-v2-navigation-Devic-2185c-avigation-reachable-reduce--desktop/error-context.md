# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Device shortcuts persist and keep navigation reachable (reduce)
- Location: e2e/design-v2-navigation.spec.ts:7:7

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator: getByRole('navigation', { name: 'Primary navigation', exact: true, includeHidden: true }).getByRole('link', { name: 'Friends', exact: true, includeHidden: true })
Expected: "/new/friends"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toHaveAttribute" getByRole('navigation', { name: 'Primary navigation', exact: true, includeHidden: true }).getByRole('link', { name: 'Friends', exact: true, includeHidden: true }) with timeout 5000ms
  - waiting for getByRole('navigation', { name: 'Primary navigation', exact: true, includeHidden: true }).getByRole('link', { name: 'Friends', exact: true, includeHidden: true })

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
  - region "Bottom navigation":
    - heading "Bottom navigation" [level=2]
    - paragraph: Choose up to five shortcuts. Choose none to hide the bar. Changes apply immediately; the Menu button always stays available.
    - status: 5 of 5 shortcuts selected
    - button "Playlists" [pressed]
    - button "Stats" [pressed]
    - button "History" [pressed]
    - button "Friends" [pressed]
    - button "Song Leagues" [pressed]
    - button "Private Sharing"
    - button "Compare"
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
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
  21 |     const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
  22 |     const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
  23 |     await expect(panel.getByRole('heading', {name: 'Bottom navigation'})).toBeVisible();
  24 |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  25 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History']);
  26 |     await choice('Friends').press('Enter');
  27 |     await expect(count).toHaveText('4 of 5 shortcuts selected');
  28 |     await expect(choice('Song Leagues')).toBeEnabled();
  29 |     await choice('Song Leagues').press('Enter');
  30 |     await expect(count).toHaveText('5 of 5 shortcuts selected');
  31 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']);
> 32 |     await expect(bar.getByRole('link', {name: 'Friends', exact: true, includeHidden: true})).toHaveAttribute('href', '/new/friends');
     |                                                                                              ^ Error: expect(locator).toHaveAttribute(expected) failed
  33 |     await expect(choice('Private Sharing')).toBeEnabled();
  34 |     await choice('Private Sharing').press('Enter');
  35 |     await expect(panel.getByText('Five shortcuts selected. Remove one before adding another.', {exact: true})).toBeVisible();
  36 |     await expect(choice('Private Sharing')).toHaveAttribute('aria-pressed', 'false');
  37 |     const geometry = [];
  38 |     for (const height of [480, 1000]) for (const width of [320, 390, 760, 768, 1440]) {
  39 |       await page.setViewportSize({width, height});
  40 |       const sample = await panel.evaluate(element => {
  41 |         const buttons = [...element.querySelectorAll<HTMLButtonElement>('.shortcut-choice')].map(button => {
  42 |           const rect = button.getBoundingClientRect(), css = getComputedStyle(button);
  43 |           return {left: rect.left, right: rect.right, height: rect.height, fontSize: css.fontSize, transition: css.transitionDuration, transitionProperty: css.transitionProperty};
  44 |         });
  45 |         const nav = document.querySelector('.v2-mobile-nav')!;
  46 |         const rect = nav.getBoundingClientRect();
  47 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, buttons,
  48 |           bar: {visible: getComputedStyle(nav).display !== 'none', left: rect.left, right: rect.right, bottom: rect.bottom,
  49 |             rows: new Set([...nav.querySelectorAll('a')].map(link => Math.round(link.getBoundingClientRect().top))).size}};
  50 |       });
  51 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  52 |       for (const button of sample.buttons) {
  53 |         expect(button.left).toBeGreaterThanOrEqual(0); expect(button.right).toBeLessThanOrEqual(width);
  54 |         expect(button.height).toBe(48); expect(button.fontSize).toBe('12px');
  55 |         if (motion === 'reduce') expect(button.transitionProperty).toBe('none');
  56 |       }
  57 |       if (sample.bar.visible) {
  58 |         expect(sample.bar.rows).toBe(1); expect(sample.bar.left).toBeGreaterThanOrEqual(0);
  59 |         expect(sample.bar.right).toBeLessThanOrEqual(width); expect(sample.bar.bottom).toBeLessThanOrEqual(height);
  60 |       }
  61 |       geometry.push(sample);
  62 |     }
  63 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  64 |     await expectNoBlockingAxeViolations(page);
  65 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']) {
  66 |       await choice(label).press('Enter');
  67 |       await expect(choice(label)).toHaveAttribute('aria-pressed', 'false');
  68 |       await expect(choice(label)).toBeEnabled();
  69 |     }
  70 |     await expect(count).toHaveText('0 of 5 shortcuts selected');
  71 |     await expect(bar).toHaveCount(0);
  72 |     await page.reload();
  73 |     await expect(count).toHaveText('0 of 5 shortcuts selected');
  74 |     await expect(bar).toHaveCount(0);
  75 |     const menu = page.getByRole('button', {name: 'Open More tools', exact: true});
  76 |     await menu.press('Enter');
  77 |     const dialog = page.getByRole('dialog', {name: 'More', exact: true});
  78 |     await expect(dialog).toBeVisible();
  79 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare Room', 'Settings']) {
  80 |       await expect(dialog.getByRole('link', {name: label, exact: true})).toHaveCount(1);
  81 |     }
  82 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(menu).toBeFocused();
  83 |     await choice('Friends').press('Enter');
  84 |     await expect(count).toHaveText('1 of 5 shortcuts selected');
  85 |     await page.reload();
  86 |     await expect(count).toHaveText('1 of 5 shortcuts selected');
  87 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Friends']);
  88 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  89 |     await page.evaluate(() => document.fonts.ready);
  90 |     await panel.screenshot({path: info.outputPath('navigation-selected.png'), animations: 'disabled'});
  91 |     await writeFile(info.outputPath('navigation-native.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  92 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  93 |   });
  94 | }
  95 | 
```