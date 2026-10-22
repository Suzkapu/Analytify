# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Desktop sidebar keeps geometry and mobile independence (reduce)
- Location: e2e/design-v2-navigation.spec.ts:42:7

# Error details

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  locator('.design-v2')
Expected: "none"
Received: "all"
Timeout:  5000ms

Call log:
  - Expect "toHaveCSS" locator('.design-v2') with timeout 5000ms
  - waiting for locator('.design-v2')
    14 × locator resolved to <div data-chrome="app" data-page="settings" data-ambient="account" data-design-variant="new" _ngcontent-ng-c2817084706="" class="design-v2 has-mobile-shortcuts">…</div>
       - unexpected value "all"

```

```yaml
- link "Skip to main content":
  - /url: "#v2-main-content"
- complementary "Desktop sidebar":
  - button "Collapse navigation sidebar" [expanded]: Analytify
  - navigation "All destinations"
  - link "Settings":
    - /url: /new/settings/account
- banner:
  - link "Analytify playlists":
    - /url: /new/playlists
    - text: Analytify
  - button "Open navigation menu": Menu
  - button "Open account and data settings"
- main "Settings content":
  - heading "Settings" [level=1]
  - paragraph: Manage your account, notifications, updates and saved data.
  - navigation "Settings sections"
  - region "Bottom navigation"
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
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
  7   | // Record ancestor motion as well as tile geometry: a static child can still be
  8   | // squeezed by an unintended transition on its shell.
  9   | async function settleNavigationFrame(page: Page) {
  10  |   return page.evaluate(() => {
  11  |     const measure = () => {
  12  |       const shell = document.querySelector('.design-v2')!, sidebar = document.querySelector('.v2-sidebar');
  13  |       return {width: innerWidth, mobile: matchMedia('(max-width:760px)').matches,
  14  |         shellPadding: getComputedStyle(shell).paddingLeft,
  15  |         shellTransition: getComputedStyle(shell).transitionProperty,
  16  |         sidebarWidth: sidebar?.getBoundingClientRect().width ?? 0,
  17  |         sidebarTransition: sidebar ? getComputedStyle(sidebar).transitionProperty : 'absent',
  18  |         animations: [shell, sidebar].filter((node): node is Element => !!node).flatMap(node =>
  19  |           node.getAnimations().map(animation => ({state: animation.playState,
  20  |             property: 'transitionProperty' in animation ? String(animation.transitionProperty) : 'animation'}))),
  21  |         sidebarDisplay: sidebar ? getComputedStyle(sidebar).display : 'absent'};
  22  |     };
  23  |     return measure();
  24  |   });
  25  | }
  26  | 
  27  | async function prepareNavigation(page: Page, motion: 'no-preference' | 'reduce') {
  28  |   await observeNativeTransitions(page); await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
  29  |   const unexpected: string[] = [], errors: string[] = [];
  30  |   page.on('pageerror', error => errors.push(error.message));
  31  |   await page.route('http://127.0.0.1:54321/**', route => {
  32  |     const name = new URL(route.request().url()).pathname.split('/').at(-1);
  33  |     if (name === 'get_public_site_settings') return route.fulfill({json: {}});
  34  |     if (name === 'is_app_admin') return route.fulfill({json: false});
  35  |     unexpected.push(route.request().url()); return route.abort('blockedbyclient');
  36  |   });
  37  |   await seedAuthenticatedBrowser(page);
  38  |   return {unexpected, errors};
  39  | }
  40  | 
  41  | for (const motion of ['no-preference', 'reduce'] as const) {
  42  |   test(`Desktop sidebar keeps geometry and mobile independence (${motion})`, async ({page}, info) => {
  43  |     const {unexpected, errors} = await prepareNavigation(page, motion);
  44  |     await page.setViewportSize({width: 1440, height: 900});
  45  |     await page.goto('/new/settings/navigation');
  46  |     await expect(page.getByRole('status').filter({hasText: /^3 of 5 shortcuts selected$/})).toBeVisible();
  47  |     const sidebar = page.getByRole('complementary', {name: 'Desktop sidebar'});
  48  |     if (motion === 'reduce') {
> 49  |       await expect(page.locator('.design-v2')).toHaveCSS('transition-property', 'none');
      |                                                ^ Error: expect(locator).toHaveCSS(expected) failed
  50  |       await expect(sidebar).toHaveCSS('transition-property', 'none');
  51  |     }
  52  |     const geometry = [];
  53  |     for (const width of [761, 1024, 1440, 1920]) {
  54  |       for (const height of [480, 900]) {
  55  |         await page.setViewportSize({width, height});
  56  |         for (const compact of [false, true]) {
  57  |           const toggle = sidebar.getByRole('button', {name: compact ? 'Collapse navigation sidebar' : 'Expand navigation sidebar', exact: true});
  58  |           if (await toggle.count()) await toggle.press('Enter');
  59  |           const currentToggle = sidebar.getByRole('button', {name: compact ? 'Expand navigation sidebar' : 'Collapse navigation sidebar', exact: true});
  60  |           await expect(currentToggle).toHaveAttribute('aria-expanded', compact ? 'false' : 'true');
  61  |           const responsiveFrame = await settleNavigationFrame(page);
  62  |           for (const name of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists', 'Settings']) {
  63  |             await expect(sidebar.getByRole('link', {name, exact: true})).toHaveCount(1);
  64  |           }
  65  |           const sample = await sidebar.evaluate(element => {
  66  |             const box = element.getBoundingClientRect(), panel = element.querySelector('.navigation-panel')!;
  67  |             const profile = element.querySelector('.drawer-profile')!.getBoundingClientRect();
  68  |             const group = element.querySelector('.navigation-groups')!;
  69  |             const icon = element.querySelector('.drawer-link i')!.getBoundingClientRect();
  70  |             const logo = element.querySelector('.drawer-brand img')!.getBoundingClientRect();
  71  |             const surface = getComputedStyle(panel, '::before');
  72  |             return {width: innerWidth, height: innerHeight, sidebarWidth: box.width, sidebarHeight: box.height, x: box.x, y: box.y,
  73  |               profileBottom: profile.bottom, profileHeight: profile.height, profileWidth: profile.width,
  74  |               iconCenter: icon.x + icon.width / 2, logoCenter: logo.x + logo.width / 2,
  75  |               listHeight: group.clientHeight, listScroll: group.scrollHeight, listOverflow: getComputedStyle(group).overflowY,
  76  |               surfaceWidth: Number.parseFloat(surface.width), surfaceTop: surface.top,
  77  |               contentLeft: document.querySelector('main')!.getBoundingClientRect().left,
  78  |               overflow: document.documentElement.scrollWidth - innerWidth};
  79  |           });
  80  |           expect(sample.sidebarWidth).toBe(compact ? 98 : 256); expect(sample.sidebarHeight).toBe(height);
  81  |           expect(sample.x).toBe(0); expect(sample.y).toBe(0); expect(sample.profileHeight).toBe(72);
  82  |           expect(sample.profileWidth).toBe(compact ? 48 : 206); expect(sample.profileBottom).toBe(height - 25);
  83  |           expect(sample.iconCenter).toBe(49); expect(sample.logoCenter).toBe(49);
  84  |           expect(sample.surfaceWidth).toBe(compact ? 82 : 240); expect(sample.surfaceTop).toBe('10px');
  85  |           expect(sample.contentLeft).toBeGreaterThanOrEqual(sample.sidebarWidth); expect(sample.overflow).toBeLessThanOrEqual(1);
  86  |           expect(sample.listOverflow).toBe('auto'); if (height === 480) expect(sample.listScroll).toBeGreaterThan(sample.listHeight);
  87  |           geometry.push({...sample, compact, responsiveFrame});
  88  |         }
  89  |       }
  90  |     }
  91  |     await page.setViewportSize({width: 1440, height: 900});
  92  |     await sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true}).press('Enter');
  93  |     await sidebar.screenshot({path: info.outputPath('sidebar-expanded.png'), animations: 'disabled'});
  94  |     await sidebar.getByRole('button', {name: 'Collapse navigation sidebar', exact: true}).press('Space');
  95  |     await sidebar.screenshot({path: info.outputPath('sidebar-compact.png'), animations: 'disabled'});
  96  |     await expectNoBlockingAxeViolations(page);
  97  |     await page.setViewportSize({width: 390, height: 900}); await expect(sidebar).toBeHidden();
  98  |     await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
  99  |     const dialog = page.getByRole('dialog', {name: 'Navigation menu', exact: true});
  100 |     await expect(dialog.locator('.drawer-identity')).toBeVisible(); await expect(dialog.locator('.panel--compact')).toHaveCount(0);
  101 |     await page.keyboard.press('Escape');
  102 |     await page.setViewportSize({width: 1440, height: 900});
  103 |     await expect(sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true})).toHaveAttribute('aria-expanded', 'false');
  104 |     await expectNativeTransitionsSettled(page);
  105 |     await writeFile(info.outputPath('sidebar-native.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  106 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  107 |   });
  108 |   test(`Device shortcut read and write recovery (${motion})`, async ({page}, info) => {
  109 |     await page.addInitScript(() => {
  110 |       const faults = {readFailures: 1, writeFailures: 1, failedReads: 0, failedWrites: 0,
  111 |         writes: [] as {key: string; value: unknown}[]};
  112 |       Object.assign(window, {analytifyPreferenceFaults: faults});
  113 |       const get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put;
  114 |       IDBObjectStore.prototype.get = function(this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
  115 |         if (typeof key === 'string' && key.startsWith('design-v2:mobile-shortcuts:') && faults.readFailures > 0) {
  116 |           faults.readFailures--; faults.failedReads++;
  117 |           throw new DOMException('Synthetic device read failure', 'UnknownError');
  118 |         }
  119 |         return get.call(this, key);
  120 |       };
  121 |       IDBObjectStore.prototype.put = function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
  122 |         const entry = value as {key?: unknown; value?: unknown};
  123 |         if (typeof entry?.key === 'string' && entry.key.startsWith('design-v2:mobile-shortcuts:')) {
  124 |           faults.writes.push({key: entry.key, value: entry.value});
  125 |           if (faults.writeFailures > 0) {
  126 |             faults.writeFailures--; faults.failedWrites++;
  127 |             throw new DOMException('Synthetic device quota failure', 'QuotaExceededError');
  128 |           }
  129 |         }
  130 |         return key === undefined ? put.call(this, value) : put.call(this, value, key);
  131 |       };
  132 |     });
  133 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  134 |     await page.setViewportSize({width: 600, height: 900});
  135 |     await page.goto('/new/settings/navigation');
  136 |     const panel = page.locator('v2-settings-navigation-preferences');
  137 |     const choices = panel.locator('.shortcut-choice');
  138 |     const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
  139 |     const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
  140 |     const geometry = [];
  141 |     const measureFeedback = async () => {
  142 |       const sample = await panel.locator('v2-inline-status section').evaluate(element => {
  143 |         const rect = element.getBoundingClientRect();
  144 |         const style = (selector: string) => {
  145 |           const node = element.querySelector(selector)!, box = node.getBoundingClientRect(), css = getComputedStyle(node);
  146 |           return {width: box.width, height: box.height, fontSize: css.fontSize, fontWeight: css.fontWeight, lineHeight: css.lineHeight};
  147 |         };
  148 |         return {viewport: innerWidth, width: rect.width, height: rect.height, right: rect.right,
  149 |           title: style('strong'), description: style('p'), action: style('button'), icon: style('.pi-sync')};
```