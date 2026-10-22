# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Device shortcuts persist and keep navigation reachable (reduce)
- Location: e2e/design-v2-navigation.spec.ts:7:7

# Error details

```
Error: expect(locator).toHaveText(expected) failed

Locator:  locator('v2-settings-navigation-preferences').getByRole('status').filter({ hasText: /^\d of 5 shortcuts selected$/ })
Expected: "1 of 5 shortcuts selected"
Received: "0 of 5 shortcuts selected"
Timeout:  5000ms

Call log:
  - Expect "toHaveText" locator('v2-settings-navigation-preferences').getByRole('status').filter({ hasText: /^\d of 5 shortcuts selected$/ }) with timeout 5000ms
  - waiting for locator('v2-settings-navigation-preferences').getByRole('status').filter({ hasText: /^\d of 5 shortcuts selected$/ })
    12 × locator resolved to <p role="status" _ngcontent-ng-c4099037600="">0 of 5 shortcuts selected</p>
       - unexpected value "0 of 5 shortcuts selected"

```

```yaml
- status: 0 of 5 shortcuts selected
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
  32 |     await expect(bar.locator('a').filter({hasText: 'Friends'})).toHaveAttribute('href', '/new/friends');
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
  57 |       expect(sample.bar.visible).toBe(width <= 760);
  58 |       if (sample.bar.visible) {
  59 |         await expect(bar.getByRole('link', {name: 'Friends', exact: true})).toBeVisible();
  60 |         expect(sample.bar.rows).toBe(1); expect(sample.bar.left).toBeGreaterThanOrEqual(0);
  61 |         expect(sample.bar.right).toBeLessThanOrEqual(width); expect(sample.bar.bottom).toBeLessThanOrEqual(height);
  62 |       }
  63 |       geometry.push(sample);
  64 |     }
  65 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  66 |     await expectNoBlockingAxeViolations(page);
  67 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']) {
  68 |       await choice(label).press('Enter');
  69 |       await expect(choice(label)).toHaveAttribute('aria-pressed', 'false');
  70 |       await expect(choice(label)).toBeEnabled();
  71 |     }
  72 |     await expect(count).toHaveText('0 of 5 shortcuts selected');
  73 |     await expect(bar).toHaveCount(0);
  74 |     await page.reload();
  75 |     await expect(count).toHaveText('0 of 5 shortcuts selected');
  76 |     await expect(bar).toHaveCount(0);
  77 |     const menu = page.getByRole('button', {name: 'Open More tools', exact: true});
  78 |     await menu.press('Enter');
  79 |     const dialog = page.getByRole('dialog', {name: 'More', exact: true});
  80 |     await expect(dialog).toBeVisible();
  81 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare Room', 'Settings']) {
  82 |       await expect(dialog.getByRole('link', {name: label, exact: true})).toHaveCount(1);
  83 |     }
  84 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(menu).toBeFocused();
  85 |     await choice('Friends').press('Enter');
  86 |     await expect(count).toHaveText('1 of 5 shortcuts selected');
  87 |     await page.reload();
> 88 |     await expect(count).toHaveText('1 of 5 shortcuts selected');
     |                         ^ Error: expect(locator).toHaveText(expected) failed
  89 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Friends']);
  90 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  91 |     await page.evaluate(() => document.fonts.ready);
  92 |     await panel.screenshot({path: info.outputPath('navigation-selected.png'), animations: 'disabled'});
  93 |     await writeFile(info.outputPath('navigation-native.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  94 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  95 |   });
  96 | }
  97 | 
```