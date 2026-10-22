# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Device shortcut read and write recovery (no-preference)
- Location: e2e/design-v2-navigation.spec.ts:22:7

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  locator('v2-settings-navigation-preferences').getByRole('button', { name: 'Retry', exact: true }).locator('.pi-sync')
Expected: 1
Received: 0
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" locator('v2-settings-navigation-preferences').getByRole('button', { name: 'Retry', exact: true }).locator('.pi-sync') with timeout 5000ms
  - waiting for locator('v2-settings-navigation-preferences').getByRole('button', { name: 'Retry', exact: true }).locator('.pi-sync')
    14 × locator resolved to 0 elements
       - unexpected value "0"

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
          - alert [ref=f1e49]:
            - strong [ref=f1e50]: Navigation preferences could not be loaded
            - paragraph [ref=f1e51]: Saved shortcuts could not be read. Retry before changing your selection.
            - button "Retry" [ref=f1e52] [cursor=pointer]
          - generic "Bottom navigation shortcuts" [ref=f1e53]:
            - button "Playlists" [disabled] [ref=f1e55]:
              - generic [aria-hidden] [ref=f1e56]: 
            - button "Stats" [disabled] [ref=f1e59]:
              - generic [aria-hidden] [ref=f1e60]: 
            - button "History" [disabled] [ref=f1e63]:
              - generic [aria-hidden] [ref=f1e64]: 
            - button "Friends" [disabled] [ref=f1e67]:
              - generic [aria-hidden] [ref=f1e68]: 
            - button "Song Leagues" [disabled] [ref=f1e71]:
              - generic [aria-hidden] [ref=f1e72]: 
            - button "Private Sharing" [disabled] [ref=f1e75]:
              - generic [aria-hidden] [ref=f1e76]: 
            - button "Compare" [disabled] [ref=f1e79]:
              - generic [aria-hidden] [ref=f1e80]: 
  - contentinfo [ref=f1e82]:
    - generic [ref=f1e83]: Powered by Spotify
    - generic [ref=f1e84]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e85] [cursor=pointer]:
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
  22  |   test(`Device shortcut read and write recovery (${motion})`, async ({page}, info) => {
  23  |     await page.addInitScript(() => {
  24  |       const faults = {readFailures: 1, writeFailures: 1, failedReads: 0, failedWrites: 0,
  25  |         writes: [] as {key: string; value: unknown}[]};
  26  |       Object.assign(window, {analytifyPreferenceFaults: faults});
  27  |       const get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put;
  28  |       IDBObjectStore.prototype.get = function(this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
  29  |         if (typeof key === 'string' && key.startsWith('design-v2:mobile-shortcuts:') && faults.readFailures > 0) {
  30  |           faults.readFailures--; faults.failedReads++;
  31  |           throw new DOMException('Synthetic device read failure', 'UnknownError');
  32  |         }
  33  |         return get.call(this, key);
  34  |       };
  35  |       IDBObjectStore.prototype.put = function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
  36  |         const entry = value as {key?: unknown; value?: unknown};
  37  |         if (typeof entry?.key === 'string' && entry.key.startsWith('design-v2:mobile-shortcuts:')) {
  38  |           faults.writes.push({key: entry.key, value: entry.value});
  39  |           if (faults.writeFailures > 0) {
  40  |             faults.writeFailures--; faults.failedWrites++;
  41  |             throw new DOMException('Synthetic device quota failure', 'QuotaExceededError');
  42  |           }
  43  |         }
  44  |         return key === undefined ? put.call(this, value) : put.call(this, value, key);
  45  |       };
  46  |     });
  47  |     const {unexpected, errors} = await prepareNavigation(page, motion);
  48  |     await page.goto('/new/settings/navigation');
  49  |     const panel = page.locator('v2-settings-navigation-preferences');
  50  |     const choices = panel.locator('.shortcut-choice');
  51  |     const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
  52  |     const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
  53  |     await expect(panel.getByRole('alert')).toContainText('Navigation preferences could not be loaded');
> 54  |     await expect(panel.getByRole('button', {name: 'Retry', exact: true}).locator('.pi-sync')).toHaveCount(1);
      |                                                                                               ^ Error: expect(locator).toHaveCount(expected) failed
  55  |     await expect(choices).toHaveCount(7);
  56  |     for (const button of await choices.all()) await expect(button).toBeDisabled();
  57  |     await expect(bar).toHaveCount(0);
  58  |     await expectNoBlockingAxeViolations(page);
  59  |     await panel.screenshot({path: info.outputPath('navigation-read-error.png'), animations: 'disabled'});
  60  |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  61  |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  62  |     const friends = panel.getByRole('button', {name: 'Friends', exact: true});
  63  |     await expect(friends).toBeEnabled(); await friends.press('Enter');
  64  |     await expect(panel.getByRole('alert')).toContainText('Navigation changes could not be saved');
  65  |     await expect(panel.getByRole('button', {name: 'Retry', exact: true}).locator('.pi-sync')).toHaveCount(1);
  66  |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  67  |     await expect(friends).toHaveAttribute('aria-pressed', 'false');
  68  |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History']);
  69  |     await expectNoBlockingAxeViolations(page);
  70  |     await panel.screenshot({path: info.outputPath('navigation-write-error.png'), animations: 'disabled'});
  71  |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  72  |     await expect(friends).toBeEnabled();
  73  |     await expect(friends).toHaveAttribute('aria-pressed', 'true');
  74  |     await expect(count).toHaveText('4 of 5 shortcuts selected');
  75  |     await expect(panel.getByRole('alert')).toHaveCount(0);
  76  |     const faults = await page.evaluate(() => (window as unknown as {analytifyPreferenceFaults: {
  77  |       failedReads: number; failedWrites: number; writes: {key: string; value: unknown}[]
  78  |     }}).analytifyPreferenceFaults);
  79  |     expect(faults.failedReads).toBe(1); expect(faults.failedWrites).toBe(1);
  80  |     expect(faults.writes).toHaveLength(2); expect(faults.writes[1]).toEqual(faults.writes[0]);
  81  |     expect(faults.writes[1].value).toBe('["playlists","stats","history","friends"]');
  82  |     const saved = await page.evaluate(() => new Promise<{key: string; value: string}[]>((resolve, reject) => {
  83  |       const open = indexedDB.open('AnalytifyDB', 4);
  84  |       open.onerror = () => reject(open.error);
  85  |       open.onsuccess = () => {
  86  |         const db = open.result, entries: {key: string; value: string}[] = [];
  87  |         const tx = db.transaction(['appData', 'featureData'], 'readonly');
  88  |         for (const store of ['appData', 'featureData']) {
  89  |           const read = tx.objectStore(store).getAll();
  90  |           read.onsuccess = () => entries.push(...read.result.filter(item => item.key.startsWith('design-v2:mobile-shortcuts:')));
  91  |         }
  92  |         tx.onabort = () => {db.close(); reject(tx.error);};
  93  |         tx.oncomplete = () => {db.close(); resolve(entries);};
  94  |       };
  95  |     }));
  96  |     expect(saved).toEqual([faults.writes[1]]);
  97  |     await expectNativeTransitionsSettled(page);
  98  |     await writeFile(info.outputPath('navigation-recovery.json'), JSON.stringify({motion, faults, saved, unexpected, errors}, null, 2));
  99  |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  100 |   });
  101 |   test(`Device shortcuts persist and keep navigation reachable (${motion})`, async ({page}, info) => {
  102 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  103 |     await page.goto('/new/settings/navigation');
  104 |     const panel = page.locator('v2-settings-navigation-preferences');
  105 |     const choice = (name: string) => panel.getByRole('button', {name, exact: true});
  106 |     const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
  107 |     const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
  108 |     await expect(panel.getByRole('heading', {name: 'Bottom navigation'})).toBeVisible();
  109 |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  110 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History']);
  111 |     await choice('Friends').press('Enter');
  112 |     await expect(count).toHaveText('4 of 5 shortcuts selected');
  113 |     await expect(choice('Song Leagues')).toBeEnabled();
  114 |     await choice('Song Leagues').press('Enter');
  115 |     await expect(count).toHaveText('5 of 5 shortcuts selected');
  116 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']);
  117 |     await expect(bar.locator('a').filter({hasText: 'Friends'})).toHaveAttribute('href', '/new/friends');
  118 |     await expect(choice('Private Sharing')).toBeEnabled();
  119 |     await choice('Private Sharing').press('Enter');
  120 |     await expect(panel.getByText('Five shortcuts selected. Remove one before adding another.', {exact: true})).toBeVisible();
  121 |     await expect(choice('Private Sharing')).toHaveAttribute('aria-pressed', 'false');
  122 |     const geometry = [];
  123 |     for (const height of [480, 1000]) for (const width of [320, 390, 760, 768, 1440]) {
  124 |       await page.setViewportSize({width, height});
  125 |       const sample = await panel.evaluate(element => {
  126 |         const buttons = [...element.querySelectorAll<HTMLButtonElement>('.shortcut-choice')].map(button => {
  127 |           const rect = button.getBoundingClientRect(), css = getComputedStyle(button);
  128 |           return {left: rect.left, right: rect.right, height: rect.height, fontSize: css.fontSize, transition: css.transitionDuration, transitionProperty: css.transitionProperty};
  129 |         });
  130 |         const nav = document.querySelector('.v2-mobile-nav')!;
  131 |         const rect = nav.getBoundingClientRect();
  132 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, buttons,
  133 |           bar: {visible: getComputedStyle(nav).display !== 'none', left: rect.left, right: rect.right, bottom: rect.bottom,
  134 |             rows: new Set([...nav.querySelectorAll('a')].map(link => Math.round(link.getBoundingClientRect().top))).size}};
  135 |       });
  136 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  137 |       for (const button of sample.buttons) {
  138 |         expect(button.left).toBeGreaterThanOrEqual(0); expect(button.right).toBeLessThanOrEqual(width);
  139 |         expect(button.height).toBe(48); expect(button.fontSize).toBe('12px');
  140 |         if (motion === 'reduce') expect(button.transitionProperty).toBe('none');
  141 |       }
  142 |       expect(sample.bar.visible).toBe(width <= 760);
  143 |       if (sample.bar.visible) {
  144 |         await expect(bar.getByRole('link', {name: 'Friends', exact: true})).toBeVisible();
  145 |         expect(sample.bar.rows).toBe(1); expect(sample.bar.left).toBeGreaterThanOrEqual(0);
  146 |         expect(sample.bar.right).toBeLessThanOrEqual(width); expect(sample.bar.bottom).toBeLessThanOrEqual(height);
  147 |       }
  148 |       geometry.push(sample);
  149 |     }
  150 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  151 |     await expectNoBlockingAxeViolations(page);
  152 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']) {
  153 |       await choice(label).press('Enter');
  154 |       await expect(choice(label)).toHaveAttribute('aria-pressed', 'false');
```