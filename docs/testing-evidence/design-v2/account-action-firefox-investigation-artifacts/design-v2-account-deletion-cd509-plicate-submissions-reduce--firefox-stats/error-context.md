# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-account-deletion.spec.ts >> cloud deletion preserves failure recovery and blocks duplicate submissions (reduce)
- Location: e2e/design-v2-account-deletion.spec.ts:6:7

# Error details

```
Error: expect(page).toHaveURL(expected) failed

Expected pattern: /\/new\/login$/
Received string:  "http://127.0.0.1:4200/new/stats"
Timeout: 5000ms

Call log:
  - Expect "toHaveURL" with timeout 5000ms
    14 × locator resolved to <html lang="en">…</html>
       - unexpected value "http://127.0.0.1:4200/new/stats"

```

```yaml
- alertdialog "Delete cloud data and leave shared features?":
  - heading "Delete cloud data and leave shared features?" [level=2]
  - paragraph: Your cloud backup, snapshots, scheduled Spotify access, notification devices, shares, stats access, and league memberships will be permanently removed. You will be logged out.
  - button "Back" [disabled]
  - button "Delete cloud data" [disabled]
```

# Test source

```ts
  1  | import {test, expect} from './fixtures';
  2  | import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3  | import {writeFile} from 'node:fs/promises';
  4  | 
  5  | for (const motion of ['no-preference', 'reduce'] as const) {
  6  |   test(`cloud deletion preserves failure recovery and blocks duplicate submissions (${motion})`, async ({page}, info) => {
  7  |     await page.emulateMedia({reducedMotion: motion});
  8  |     await mockSpotify(page);
  9  |     const requests: {method: string; table: string; actor: string | null}[] = [];
  10 |     let release!: () => void;
  11 |     const held = new Promise<void>(resolve => {release = resolve;});
  12 |     await page.route('**/rest/v1/users?**', async route => {
  13 |       if (route.request().method() !== 'DELETE') return route.abort('blockedbyclient');
  14 |       const url = new URL(route.request().url());
  15 |       requests.push({method: 'DELETE', table: url.pathname, actor: url.searchParams.get('id')});
  16 |       if (requests.length === 1) {
  17 |         await held;
  18 |         await route.fulfill({status: 403, json: {code: '42501', message: 'Isolated deletion denied'}});
  19 |       } else await route.fulfill({status: 204, body: ''});
  20 |     });
  21 |     await seedAuthenticatedBrowser(page, {cloudIdentity: true});
  22 |     await page.goto('/new/stats');
  23 |     await expect(page.locator('.v2-ranking-list strong')).toHaveText('Test Song');
  24 |     const trigger = page.getByRole('button', {name: 'Open account and data settings', exact: true});
  25 |     await trigger.press('Enter');
  26 |     await page.getByRole('button', {name: 'Clear data', exact: true}).press('Enter');
  27 |     await page.getByRole('button', {name: /Delete cloud data and leave shared features/}).press('Enter');
  28 |     const dialog = page.getByRole('alertdialog', {name: 'Delete cloud data and leave shared features?', exact: true});
  29 |     const remove = dialog.getByRole('button', {name: 'Delete cloud data', exact: true});
  30 |     await remove.press('Enter');
  31 |     await expect.poll(() => requests.length).toBe(1);
  32 |     await expect(remove).toBeDisabled();
  33 |     await expect(dialog.getByRole('button', {name: 'Back', exact: true})).toBeDisabled();
  34 |     await remove.dispatchEvent('click');
  35 |     expect(requests).toEqual([{method: 'DELETE', table: '/rest/v1/users', actor: 'eq.de111111-1111-4111-8111-111111111111'}]);
  36 |     await expect(page).toHaveURL(/\/new\/stats$/);
  37 |     release();
  38 |     await expect(dialog.getByRole('alert')).toContainText('Some steps may already have completed');
  39 |     await expect(remove).toBeEnabled();
  40 |     await expectNoBlockingAxeViolations(page);
  41 |     await dialog.screenshot({path: info.outputPath('deletion-recovery.png')});
  42 |     await remove.press('Enter');
> 43 |     await expect(page).toHaveURL(/\/new\/login$/);
     |                        ^ Error: expect(page).toHaveURL(expected) failed
  44 |     await expect(page.locator('app-login-page')).toBeVisible();
  45 |     expect(requests).toHaveLength(2);
  46 |     expect(requests[1]).toEqual(requests[0]);
  47 |     await expect(dialog).toHaveCount(0);
  48 |     await writeFile(info.outputPath('deletion-contract.json'), JSON.stringify({requests, motion, finalPath: new URL(page.url()).pathname}, null, 2));
  49 |   });
  50 | }
  51 | 
```