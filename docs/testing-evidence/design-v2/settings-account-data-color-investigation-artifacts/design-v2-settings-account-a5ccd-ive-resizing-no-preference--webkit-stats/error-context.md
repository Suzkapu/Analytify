# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-settings-account-data.spec.ts >> Settings Account and Data preserve consent across live resizing (no-preference)
- Location: e2e/design-v2-settings-account-data.spec.ts:6:7

# Error details

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  locator('v2-settings-account').getByRole('link', { name: 'Spotify connection' })
Expected: "rgb(29, 185, 84)"
Received: "rgb(53, 231, 131)"
Timeout:  5000ms

Call log:
  - Expect "toHaveCSS" locator('v2-settings-account').getByRole('link', { name: 'Spotify connection' }) with timeout 5000ms
  - waiting for locator('v2-settings-account').getByRole('link', { name: 'Spotify connection' })
    13 × locator resolved to <a target="_blank" rel="noopener noreferrer" class="v2-destination-row" _ngcontent-ng-c3948713666="" href="https://www.spotify.com/account/apps/">…</a>
       - unexpected value "rgb(53, 231, 131)"

```

```yaml
- link "Spotify connection":
  - /url: https://www.spotify.com/account/apps/
```

# Test source

```ts
  1  | import {test, expect} from './fixtures';
  2  | import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3  | import {writeFile} from 'node:fs/promises';
  4  | 
  5  | for (const motion of ['no-preference', 'reduce'] as const) {
  6  |   test(`Settings Account and Data preserve consent across live resizing (${motion})`, async ({page}, info) => {
  7  |     await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
  8  |     await page.route('**/rest/v1/users?**', route => route.request().method() === 'GET'
  9  |       ? route.fulfill({json: null}) : route.abort('blockedbyclient'));
  10 |     const destructiveRequests: string[] = [];
  11 |     page.on('request', request => {
  12 |       const url = new URL(request.url());
  13 |       if (request.method() === 'DELETE' || url.pathname.endsWith('/logout')) destructiveRequests.push(url.pathname);
  14 |     });
  15 |     await seedAuthenticatedBrowser(page, {cloudIdentity: true}); await page.goto('/new/settings/account');
  16 |     const panel = page.locator('v2-settings-account');
  17 |     await expect(panel.getByRole('heading', {name: 'Browser test user'})).toBeVisible();
  18 |     const spotify = panel.getByRole('link', {name: 'Spotify connection'});
  19 |     await expect(spotify).toHaveAttribute('href', 'https://www.spotify.com/account/apps/');
  20 |     await expect(spotify).toHaveAttribute('target', '_blank'); await expect(spotify).toHaveAttribute('rel', 'noopener noreferrer');
  21 |     await spotify.focus(); await expect(spotify).toBeFocused();
> 22 |     await expect(spotify).toHaveCSS('border-top-color', 'rgb(29, 185, 84)');
     |                           ^ Error: expect(locator).toHaveCSS(expected) failed
  23 |     await expectNoBlockingAxeViolations(page);
  24 |     const geometry = [];
  25 |     for (const width of [320, 390, 760, 768, 1024, 1440, 1920]) {
  26 |       for (const height of [480, 1000]) {
  27 |         await page.setViewportSize({width, height});
  28 |         await expect(page.locator('nav[aria-label="Settings sections"] [aria-current="page"]')).toHaveCount(1);
  29 |         const logout = panel.getByRole('button', {name: 'Log out', exact: true});
  30 |         await logout.scrollIntoViewIfNeeded();
  31 |         const sample = await logout.evaluate(element => {
  32 |           const rect = element.getBoundingClientRect();
  33 |           const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  34 |           return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  35 |             button: {x: rect.x, y: rect.y, width: rect.width, height: rect.height}, reachable: !!target && element.contains(target)};
  36 |         });
  37 |         expect(sample.scrollWidth).toBeLessThanOrEqual(width); expect(sample.button.height).toBeGreaterThanOrEqual(48);
  38 |         expect(sample.button.x).toBeGreaterThanOrEqual(0); expect(sample.button.x + sample.button.width).toBeLessThanOrEqual(width);
  39 |         expect(sample.reachable).toBe(true); geometry.push(sample);
  40 |       }
  41 |     }
  42 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  43 |     await panel.screenshot({path: info.outputPath('settings-account.png')});
  44 |     await page.getByRole('link', {name: 'Data', exact: true}).press('Enter');
  45 |     const data = page.locator('v2-settings-data'); await expect(data.getByRole('heading', {name: 'Data & privacy'})).toBeVisible();
  46 |     await expect(page.locator('nav[aria-label="Settings sections"] [aria-current="page"]')).toHaveAccessibleName('Data');
  47 |     await expectNoBlockingAxeViolations(page); await data.screenshot({path: info.outputPath('settings-data.png')});
  48 |     const backup = data.getByRole('switch', {name: 'Cloud Backup'});
  49 |     await expect(backup).not.toBeChecked(); await backup.press('Space');
  50 |     await expect(backup).not.toBeChecked(); await expect(page.getByRole('alertdialog')).toBeVisible();
  51 |     await page.keyboard.press('Escape'); await expect(page.getByRole('alertdialog')).toHaveCount(0);
  52 |     await data.getByRole('button', {name: 'Clear data', exact: true}).press('Enter');
  53 |     await expect(page.getByRole('alertdialog', {name: 'What would you like to clear?', exact: true})).toBeVisible();
  54 |     await page.keyboard.press('Escape'); await expect(page.getByRole('alertdialog')).toHaveCount(0);
  55 |     await expect(page).toHaveURL(/\/new\/settings\/data$/); expect(destructiveRequests).toEqual([]);
  56 |     await writeFile(info.outputPath('settings-account-data.json'), JSON.stringify({motion, geometry, destructiveRequests}, null, 2));
  57 |   });
  58 | }
  59 | 
```