# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Desktop sidebar keeps geometry and mobile independence (reduce)
- Location: e2e/design-v2-navigation.spec.ts:22:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 256
Received: 98
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - complementary "Desktop sidebar" [ref=f1e7]:
    - generic [ref=f1e9]:
      - button "Collapse navigation sidebar" [expanded] [active] [ref=f1e10] [cursor=pointer]:
        - generic [ref=f1e11]: Analytify
      - navigation "All destinations" [ref=f1e12]:
        - generic [ref=f1e13]:
          - paragraph [ref=f1e14]: Library
          - link "Playlists" [ref=f1e15] [cursor=pointer]:
            - /url: /new/playlists
            - generic [aria-hidden] [ref=f1e16]: 
        - generic [ref=f1e18]:
          - paragraph [ref=f1e19]: Listening
          - link "Stats" [ref=f1e20] [cursor=pointer]:
            - /url: /new/stats
            - generic [aria-hidden] [ref=f1e21]: 
          - link "History" [ref=f1e23] [cursor=pointer]:
            - /url: /new/history
            - generic [aria-hidden] [ref=f1e24]: 
        - generic [ref=f1e26]:
          - paragraph [ref=f1e27]: Social
          - link "Friends" [ref=f1e28] [cursor=pointer]:
            - /url: /new/friends
            - generic [aria-hidden] [ref=f1e29]: 
          - link "Song Leagues" [ref=f1e31] [cursor=pointer]:
            - /url: /new/song-league
            - generic [aria-hidden] [ref=f1e32]: 
          - link "Private Sharing" [ref=f1e34] [cursor=pointer]:
            - /url: /new/shared-playlists
            - generic [aria-hidden] [ref=f1e35]: 
        - generic [ref=f1e37]:
          - paragraph [ref=f1e38]: Tools
          - link "Compare playlists" [ref=f1e39] [cursor=pointer]:
            - /url: /new/compare-room
            - generic [aria-hidden] [ref=f1e40]: 
      - link "Settings" [ref=f1e42] [cursor=pointer]:
        - /url: /new/settings/account
        - generic [ref=f1e44]: B
        - generic [ref=f1e45]:
          - strong [ref=f1e46]: Browser test user
          - generic [ref=f1e47]: Settings
  - banner [ref=f1e48]:
    - generic [ref=f1e49]:
      - link "Analytify playlists" [ref=f1e50] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e51]: Analytify
      - text:   
      - generic [ref=f1e52]:
        - button "Open navigation menu" [ref=f1e53] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e54]: 
          - generic [ref=f1e55]: Menu
        - button "Open account and data settings" [ref=f1e56] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e57]: 
  - main "Settings content" [ref=f1e58]:
    - generic "Settings" [ref=f1e60]:
      - generic [ref=f1e61]:
        - generic [ref=f1e63]:
          - heading "Settings" [level=1] [ref=f1e65]
          - paragraph [ref=f1e66]: Manage your account, notifications, updates and saved data.
        - navigation "Settings sections" [ref=f1e69]:
          - link "Account" [ref=f1e70] [cursor=pointer]:
            - /url: /new/settings/account
            - generic [aria-hidden] [ref=f1e71]: 
          - link "Notifications" [ref=f1e73] [cursor=pointer]:
            - /url: /new/settings/notifications
            - generic [aria-hidden] [ref=f1e74]: 
          - link "Updates" [ref=f1e76] [cursor=pointer]:
            - /url: /new/settings/updates
            - generic [aria-hidden] [ref=f1e77]: 
          - link "Data" [ref=f1e79] [cursor=pointer]:
            - /url: /new/settings/data
            - generic [aria-hidden] [ref=f1e80]: 
          - text: 
        - region [ref=f1e84]:
          - heading "Bottom navigation" [level=2] [ref=f1e85]
          - paragraph [ref=f1e86]: Choose up to five shortcuts. Choose none to hide the bar. Changes apply immediately; the Menu button always stays available.
          - status [ref=f1e87]: 3 of 5 shortcuts selected
          - generic "Bottom navigation shortcuts" [ref=f1e88]:
            - button "Playlists" [pressed] [ref=f1e90] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e91]: 
            - button "Stats" [pressed] [ref=f1e94] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e95]: 
            - button "History" [pressed] [ref=f1e98] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e99]: 
            - button "Friends" [ref=f1e102] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e103]: 
            - button "Song Leagues" [ref=f1e106] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e107]: 
            - button "Private Sharing" [ref=f1e110] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e111]: 
            - button "Compare" [ref=f1e114] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e115]: 
  - text:   
  - contentinfo [ref=f1e117]:
    - generic [ref=f1e118]: Powered by Spotify
    - generic [ref=f1e119]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e120] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  1   | import {test, expect} from './fixtures';
  2   | import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3   | import {observeNativeTransitions, expectNativeTransitionsSettled} from './helpers/native-transitions';
  4   | import {writeFile} from 'node:fs/promises';
  5   | import type {Page} from '@playwright/test';
  6   | 
  7   | async function prepareNavigation(page: Page, motion: 'no-preference' | 'reduce') {
  8   |   await observeNativeTransitions(page); await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
  9   |   const unexpected: string[] = [], errors: string[] = [];
  10  |   page.on('pageerror', error => errors.push(error.message));
  11  |   await page.route('http://127.0.0.1:54321/**', route => {
  12  |     const name = new URL(route.request().url()).pathname.split('/').at(-1);
  13  |     if (name === 'get_public_site_settings') return route.fulfill({json: {}});
  14  |     if (name === 'is_app_admin') return route.fulfill({json: false});
  15  |     unexpected.push(route.request().url()); return route.abort('blockedbyclient');
  16  |   });
  17  |   await seedAuthenticatedBrowser(page);
  18  |   return {unexpected, errors};
  19  | }
  20  | 
  21  | for (const motion of ['no-preference', 'reduce'] as const) {
  22  |   test(`Desktop sidebar keeps geometry and mobile independence (${motion})`, async ({page}, info) => {
  23  |     const {unexpected, errors} = await prepareNavigation(page, motion);
  24  |     await page.setViewportSize({width: 1440, height: 900});
  25  |     await page.goto('/new/settings/navigation');
  26  |     await expect(page.getByRole('status').filter({hasText: /^3 of 5 shortcuts selected$/})).toBeVisible();
  27  |     const sidebar = page.getByRole('complementary', {name: 'Desktop sidebar'});
  28  |     const geometry = [];
  29  |     for (const width of [761, 1024, 1440, 1920]) {
  30  |       for (const height of [480, 900]) {
  31  |         await page.setViewportSize({width, height});
  32  |         for (const compact of [false, true]) {
  33  |           const toggle = sidebar.getByRole('button', {name: compact ? 'Collapse navigation sidebar' : 'Expand navigation sidebar', exact: true});
  34  |           if (await toggle.count()) await toggle.press('Enter');
  35  |           const currentToggle = sidebar.getByRole('button', {name: compact ? 'Expand navigation sidebar' : 'Collapse navigation sidebar', exact: true});
  36  |           await expect(currentToggle).toHaveAttribute('aria-expanded', compact ? 'false' : 'true');
  37  |           for (const name of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists', 'Settings']) {
  38  |             await expect(sidebar.getByRole('link', {name, exact: true})).toHaveCount(1);
  39  |           }
  40  |           const sample = await sidebar.evaluate(element => {
  41  |             const box = element.getBoundingClientRect(), panel = element.querySelector('.navigation-panel')!;
  42  |             const profile = element.querySelector('.drawer-profile')!.getBoundingClientRect();
  43  |             const group = element.querySelector('.navigation-groups')!;
  44  |             const icon = element.querySelector('.drawer-link i')!.getBoundingClientRect();
  45  |             const logo = element.querySelector('.drawer-brand img')!.getBoundingClientRect();
  46  |             const surface = getComputedStyle(panel, '::before');
  47  |             return {width: innerWidth, height: innerHeight, sidebarWidth: box.width, sidebarHeight: box.height, x: box.x, y: box.y,
  48  |               profileBottom: profile.bottom, profileHeight: profile.height, profileWidth: profile.width,
  49  |               iconCenter: icon.x + icon.width / 2, logoCenter: logo.x + logo.width / 2,
  50  |               listHeight: group.clientHeight, listScroll: group.scrollHeight, listOverflow: getComputedStyle(group).overflowY,
  51  |               surfaceWidth: Number.parseFloat(surface.width), surfaceTop: surface.top,
  52  |               contentLeft: document.querySelector('main')!.getBoundingClientRect().left,
  53  |               overflow: document.documentElement.scrollWidth - innerWidth};
  54  |           });
> 55  |           expect(sample.sidebarWidth).toBe(compact ? 98 : 256); expect(sample.sidebarHeight).toBe(height);
      |                                       ^ Error: expect(received).toBe(expected) // Object.is equality
  56  |           expect(sample.x).toBe(0); expect(sample.y).toBe(0); expect(sample.profileHeight).toBe(72);
  57  |           expect(sample.profileWidth).toBe(compact ? 48 : 206); expect(sample.profileBottom).toBe(height - 25);
  58  |           expect(sample.iconCenter).toBe(49); expect(sample.logoCenter).toBe(49);
  59  |           expect(sample.surfaceWidth).toBe(compact ? 82 : 240); expect(sample.surfaceTop).toBe('10px');
  60  |           expect(sample.contentLeft).toBeGreaterThanOrEqual(sample.sidebarWidth); expect(sample.overflow).toBeLessThanOrEqual(1);
  61  |           expect(sample.listOverflow).toBe('auto'); if (height === 480) expect(sample.listScroll).toBeGreaterThan(sample.listHeight);
  62  |           geometry.push({...sample, compact});
  63  |         }
  64  |       }
  65  |     }
  66  |     await page.setViewportSize({width: 1440, height: 900});
  67  |     await sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true}).press('Enter');
  68  |     await sidebar.screenshot({path: info.outputPath('sidebar-expanded.png'), animations: 'disabled'});
  69  |     await sidebar.getByRole('button', {name: 'Collapse navigation sidebar', exact: true}).press('Space');
  70  |     await sidebar.screenshot({path: info.outputPath('sidebar-compact.png'), animations: 'disabled'});
  71  |     await expectNoBlockingAxeViolations(page);
  72  |     await page.setViewportSize({width: 390, height: 900}); await expect(sidebar).toBeHidden();
  73  |     await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
  74  |     const dialog = page.getByRole('dialog', {name: 'Navigation menu', exact: true});
  75  |     await expect(dialog.locator('.drawer-identity')).toBeVisible(); await expect(dialog.locator('.panel--compact')).toHaveCount(0);
  76  |     await page.keyboard.press('Escape');
  77  |     await page.setViewportSize({width: 1440, height: 900});
  78  |     await expect(sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true})).toHaveAttribute('aria-expanded', 'false');
  79  |     await expectNativeTransitionsSettled(page);
  80  |     await writeFile(info.outputPath('sidebar-native.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  81  |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  82  |   });
  83  |   test(`Device shortcut read and write recovery (${motion})`, async ({page}, info) => {
  84  |     await page.addInitScript(() => {
  85  |       const faults = {readFailures: 1, writeFailures: 1, failedReads: 0, failedWrites: 0,
  86  |         writes: [] as {key: string; value: unknown}[]};
  87  |       Object.assign(window, {analytifyPreferenceFaults: faults});
  88  |       const get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put;
  89  |       IDBObjectStore.prototype.get = function(this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
  90  |         if (typeof key === 'string' && key.startsWith('design-v2:mobile-shortcuts:') && faults.readFailures > 0) {
  91  |           faults.readFailures--; faults.failedReads++;
  92  |           throw new DOMException('Synthetic device read failure', 'UnknownError');
  93  |         }
  94  |         return get.call(this, key);
  95  |       };
  96  |       IDBObjectStore.prototype.put = function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
  97  |         const entry = value as {key?: unknown; value?: unknown};
  98  |         if (typeof entry?.key === 'string' && entry.key.startsWith('design-v2:mobile-shortcuts:')) {
  99  |           faults.writes.push({key: entry.key, value: entry.value});
  100 |           if (faults.writeFailures > 0) {
  101 |             faults.writeFailures--; faults.failedWrites++;
  102 |             throw new DOMException('Synthetic device quota failure', 'QuotaExceededError');
  103 |           }
  104 |         }
  105 |         return key === undefined ? put.call(this, value) : put.call(this, value, key);
  106 |       };
  107 |     });
  108 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  109 |     await page.setViewportSize({width: 600, height: 900});
  110 |     await page.goto('/new/settings/navigation');
  111 |     const panel = page.locator('v2-settings-navigation-preferences');
  112 |     const choices = panel.locator('.shortcut-choice');
  113 |     const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
  114 |     const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
  115 |     const geometry = [];
  116 |     const measureFeedback = async () => {
  117 |       const sample = await panel.locator('v2-inline-status section').evaluate(element => {
  118 |         const rect = element.getBoundingClientRect();
  119 |         const style = (selector: string) => {
  120 |           const node = element.querySelector(selector)!, box = node.getBoundingClientRect(), css = getComputedStyle(node);
  121 |           return {width: box.width, height: box.height, fontSize: css.fontSize, fontWeight: css.fontWeight, lineHeight: css.lineHeight};
  122 |         };
  123 |         return {viewport: innerWidth, width: rect.width, height: rect.height, right: rect.right,
  124 |           title: style('strong'), description: style('p'), action: style('button'), icon: style('.pi-sync')};
  125 |       });
  126 |       expect(sample.right).toBeLessThanOrEqual(sample.viewport);
  127 |       expect(sample.title).toMatchObject({fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
  128 |       expect(sample.description).toMatchObject({fontSize: '14px', fontWeight: '400', lineHeight: '20px'});
  129 |       expect(sample.action).toMatchObject({width: 260, height: 48, fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
  130 |       expect(sample.icon).toMatchObject({width: 18, height: 18, fontSize: '18px'});
  131 |       if (sample.viewport === 600) expect(sample).toMatchObject({width: 576, height: 138});
  132 |       geometry.push(sample);
  133 |     };
  134 |     await expect(panel.getByRole('alert')).toContainText('Navigation preferences could not be loaded');
  135 |     await expect(panel.getByRole('button', {name: 'Retry', exact: true}).locator('.pi-sync')).toHaveCount(1);
  136 |     await measureFeedback();
  137 |     await page.setViewportSize({width: 320, height: 480}); await measureFeedback();
  138 |     await page.setViewportSize({width: 600, height: 900});
  139 |     await expect(choices).toHaveCount(7);
  140 |     for (const button of await choices.all()) await expect(button).toBeDisabled();
  141 |     await expect(bar).toHaveCount(0);
  142 |     await expectNoBlockingAxeViolations(page);
  143 |     await panel.screenshot({path: info.outputPath('navigation-read-error.png'), animations: 'disabled'});
  144 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  145 |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  146 |     const friends = panel.getByRole('button', {name: 'Friends', exact: true});
  147 |     await expect(friends).toBeEnabled(); await friends.press('Enter');
  148 |     await expect(panel.getByRole('alert')).toContainText('Navigation changes could not be saved');
  149 |     await expect(panel.getByRole('button', {name: 'Retry', exact: true}).locator('.pi-sync')).toHaveCount(1);
  150 |     await measureFeedback();
  151 |     await page.setViewportSize({width: 320, height: 480}); await measureFeedback();
  152 |     await page.setViewportSize({width: 600, height: 900});
  153 |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  154 |     await expect(friends).toHaveAttribute('aria-pressed', 'false');
  155 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History']);
```