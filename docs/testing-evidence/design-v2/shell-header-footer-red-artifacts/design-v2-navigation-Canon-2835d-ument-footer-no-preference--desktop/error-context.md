# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Canonical app header, gutters and document footer (no-preference)
- Location: e2e/design-v2-navigation.spec.ts:75:7

# Error details

```
Error: expect(locator).toBeHidden() failed

Locator:  locator('.v2-header')
Expected: hidden
Received: visible
Timeout:  5000ms

Call log:
  - Expect "toBeHidden" locator('.v2-header') with timeout 5000ms
  - waiting for locator('.v2-header')
    14 × locator resolved to <header class="v2-header" _ngcontent-ng-c2817084706="">…</header>
       - unexpected value "visible"

```

```yaml
- banner:
  - link "Analytify playlists":
    - /url: /new/playlists
    - text: Analytify
  - button "Open navigation menu": Menu
  - button "Open account and data settings"
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
  9   | async function navigationRenderState(page: Page) {
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
  42  |   test(`Settings account and data actions stay reachable (${motion})`, async ({page}, info) => {
  43  |     const {unexpected, errors} = await prepareNavigation(page, motion);
  44  |     for (const width of [1440, 390]) {
  45  |       await page.setViewportSize({width, height: 900});
  46  |       await page.goto('/new/settings/navigation');
  47  |       await expect(page.getByRole('status').filter({hasText: /^3 of 5 shortcuts selected$/})).toBeVisible();
  48  |       if (width > 760) {
  49  |         await page.getByRole('complementary', {name: 'Desktop sidebar'}).getByRole('link', {name: 'Settings', exact: true}).press('Enter');
  50  |       } else {
  51  |         await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
  52  |         await page.getByRole('dialog', {name: 'Navigation menu', exact: true}).getByRole('link', {name: 'Settings', exact: true}).press('Enter');
  53  |       }
  54  |       await expect(page).toHaveURL(/\/new\/settings\/account$/);
  55  |       const account = page.getByRole('region', {name: 'Account settings'});
  56  |       await expect(account.getByRole('button', {name: 'Log out', exact: true})).toBeVisible();
  57  |       await expect(account.getByRole('link', {name: 'Spotify connection'})).toHaveAttribute('href', 'https://www.spotify.com/account/apps/');
  58  |       await expect(account.getByRole('link', {name: 'Spotify connection'})).toHaveAttribute('rel', 'noopener noreferrer');
  59  |       await expect(account.getByRole('link', {name: 'Legal & privacy'})).toHaveAttribute('href', '/new/legal');
  60  |       await page.getByRole('navigation', {name: 'Settings sections'}).getByRole('link', {name: 'Data', exact: true}).press('Enter');
  61  |       await expect(page.getByRole('switch', {name: 'Cloud Backup', exact: true})).toBeVisible();
  62  |       await page.getByRole('button', {name: 'Clear data', exact: true}).press('Enter');
  63  |       const dialog = page.getByRole('alertdialog', {name: 'What would you like to clear?'});
  64  |       await expect(dialog.getByRole('button', {name: 'Clear this browser and log out'})).toBeVisible();
  65  |       await expect(dialog.getByRole('button', {name: 'Delete cloud data and leave shared features'})).toBeVisible();
  66  |       await dialog.getByRole('button', {name: 'Cancel', exact: true}).press('Enter');
  67  |       await expect(dialog).toHaveCount(0);
  68  |       await expect(page.getByRole('button', {name: 'Clear data', exact: true})).toBeFocused();
  69  |       await expectNoBlockingAxeViolations(page);
  70  |     }
  71  |     await expectNativeTransitionsSettled(page);
  72  |     await writeFile(info.outputPath('settings-access.json'), JSON.stringify({motion, unexpected, errors}, null, 2));
  73  |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  74  |   });
  75  |   test(`Canonical app header, gutters and document footer (${motion})`, async ({page}, info) => {
  76  |     const {unexpected, errors} = await prepareNavigation(page, motion);
  77  |     await page.goto('/new/settings/account');
  78  |     await expect(page.getByRole('region', {name: 'Account settings'})).toBeVisible();
  79  |     const geometry = [];
  80  |     for (const width of [1440, 1920, 1024, 768, 761, 760, 390, 360, 320]) for (const height of [480, 1000]) {
  81  |       await page.setViewportSize({width, height});
  82  |       await page.evaluate(() => window.scrollTo(0, 0));
  83  |       const mobile = width <= 760;
  84  |       const header = page.locator('.v2-header');
  85  |       if (mobile) {
  86  |         await expect(header.getByRole('link', {name: 'Analytify playlists'})).toBeVisible();
  87  |         await expect(header.getByRole('button', {name: 'Open navigation menu', exact: true})).toBeVisible();
> 88  |       } else await expect(header).toBeHidden();
      |                                   ^ Error: expect(locator).toBeHidden() failed
  89  |       await expect(page.getByRole('button', {name: 'Open account and data settings', exact: true})).toHaveCount(0);
  90  |       const sample = await page.evaluate(() => {
  91  |         const box = (selector: string) => {
  92  |           const element = document.querySelector(selector)!, rect = element.getBoundingClientRect(), css = getComputedStyle(element);
  93  |           return {x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height, bottom: rect.bottom + scrollY,
  94  |             paddingLeft: css.paddingLeft, paddingRight: css.paddingRight, fontSize: css.fontSize, fontWeight: css.fontWeight,
  95  |             lineHeight: css.lineHeight, background: css.backgroundColor, borderTop: css.borderTopWidth};
  96  |         };
  97  |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  98  |           documentHeight: document.documentElement.scrollHeight, header: box('.v2-header'), logo: box('.v2-brand img'),
  99  |           brand: box('.v2-brand'), menu: box('.v2-tools-button'), heading: box('main h1'), main: box('main'),
  100 |           body: box('.v2-page'), footer: box('.v2-footer'), legal: box('.v2-footer a'), caption: box('.v2-footer > span'),
  101 |           shield: getComputedStyle(document.querySelector('.v2-footer .pi-shield')!).display};
  102 |       });
  103 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  104 |       expect(sample.heading.x).toBe(mobile ? 16 : 256 + 32);
  105 |       expect(sample.heading.y).toBe(mobile ? 72 + 16 : 32);
  106 |       expect(sample.footer.y).toBeGreaterThanOrEqual(sample.body.bottom + 16);
  107 |       expect(sample.footer.bottom).toBe(sample.documentHeight - (mobile ? 86 : 0));
  108 |       expect(sample.footer).toMatchObject({background: 'rgba(0, 0, 0, 0)', borderTop: '0px', paddingLeft: mobile ? '16px' : '40px', paddingRight: mobile ? '16px' : '40px'});
  109 |       expect(sample.caption).toMatchObject({fontSize: '14px', lineHeight: '20px', fontWeight: '400'});
  110 |       expect(sample.legal).toMatchObject({width: mobile ? 129 : 160, height: 48, fontSize: '14px', lineHeight: '20px', fontWeight: '600'});
  111 |       if (!mobile && width >= 1024) expect(sample.footer.height).toBe(48);
  112 |       if (mobile) {
  113 |         expect(sample.header).toMatchObject({height: 72, y: 0});
  114 |         expect(sample.logo).toMatchObject({width: 32, height: 32, x: 16});
  115 |         expect(sample.brand).toMatchObject({fontSize: '20px', lineHeight: '28px', fontWeight: '600'});
  116 |         expect(sample.menu).toMatchObject({width: 100, height: 48});
  117 |         expect(sample.shield).toBe('none');
  118 |       } else expect(sample.shield).not.toBe('none');
  119 |       geometry.push(sample);
  120 |     }
  121 |     await page.setViewportSize({width: 1440, height: 1000});
  122 |     await page.screenshot({path: info.outputPath('shell-desktop.png'), fullPage: true, animations: 'disabled'});
  123 |     await page.setViewportSize({width: 390, height: 900});
  124 |     await page.screenshot({path: info.outputPath('shell-mobile.png'), fullPage: true, animations: 'disabled'});
  125 |     await page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true}).focus();
  126 |     await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toBeFocused();
  127 |     await expectNoBlockingAxeViolations(page); await expectNativeTransitionsSettled(page);
  128 |     await writeFile(info.outputPath('shell-geometry.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  129 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  130 |   });
  131 |   test(`Desktop sidebar keeps geometry and mobile independence (${motion})`, async ({page}, info) => {
  132 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  133 |     await page.setViewportSize({width: 1440, height: 900});
  134 |     await page.goto('/new/settings/navigation');
  135 |     await expect(page.getByRole('status').filter({hasText: /^3 of 5 shortcuts selected$/})).toBeVisible();
  136 |     const sidebar = page.getByRole('complementary', {name: 'Desktop sidebar'});
  137 |     if (motion === 'reduce') {
  138 |       await expect(page.locator('.design-v2')).toHaveCSS('transition-property', 'none');
  139 |       await expect(sidebar).toHaveCSS('transition-property', 'none');
  140 |     }
  141 |     const geometry = [];
  142 |     for (const width of [761, 1024, 1440, 1920]) {
  143 |       for (const height of [480, 900]) {
  144 |         await page.setViewportSize({width, height});
  145 |         for (const compact of [false, true]) {
  146 |           const toggle = sidebar.getByRole('button', {name: compact ? 'Collapse navigation sidebar' : 'Expand navigation sidebar', exact: true});
  147 |           if (await toggle.count()) await toggle.press('Enter');
  148 |           const currentToggle = sidebar.getByRole('button', {name: compact ? 'Expand navigation sidebar' : 'Collapse navigation sidebar', exact: true});
  149 |           await expect(currentToggle).toHaveAttribute('aria-expanded', compact ? 'false' : 'true');
  150 |           const responsiveFrame = await navigationRenderState(page);
  151 |           // All destinations stay accessible in both modes; collect them in one
  152 |           // browser round trip at each size rather than eight separate queries.
  153 |           expect(await sidebar.getByRole('link').evaluateAll(links => links.map(link =>
  154 |             link.getAttribute('aria-label') ?? link.textContent?.trim()))).toEqual([
  155 |             'Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists', 'Settings',
  156 |           ]);
  157 |           const sample = await sidebar.evaluate(element => {
  158 |             const box = element.getBoundingClientRect(), panel = element.querySelector('.navigation-panel')!;
  159 |             const profile = element.querySelector('.drawer-profile')!.getBoundingClientRect();
  160 |             const group = element.querySelector('.navigation-groups')!;
  161 |             const icon = element.querySelector('.drawer-link i')!.getBoundingClientRect();
  162 |             const logo = element.querySelector('.drawer-brand img')!.getBoundingClientRect();
  163 |             const surface = getComputedStyle(panel, '::before');
  164 |             return {width: innerWidth, height: innerHeight, sidebarWidth: box.width, sidebarHeight: box.height, x: box.x, y: box.y,
  165 |               profileBottom: profile.bottom, profileHeight: profile.height, profileWidth: profile.width,
  166 |               iconCenter: icon.x + icon.width / 2, logoCenter: logo.x + logo.width / 2,
  167 |               listHeight: group.clientHeight, listScroll: group.scrollHeight, listOverflow: getComputedStyle(group).overflowY,
  168 |               surfaceWidth: Number.parseFloat(surface.width), surfaceTop: surface.top,
  169 |               contentLeft: document.querySelector('main')!.getBoundingClientRect().left,
  170 |               overflow: document.documentElement.scrollWidth - innerWidth};
  171 |           });
  172 |           expect(sample.sidebarWidth).toBe(compact ? 98 : 256); expect(sample.sidebarHeight).toBe(height);
  173 |           expect(sample.x).toBe(0); expect(sample.y).toBe(0); expect(sample.profileHeight).toBe(72);
  174 |           expect(sample.profileWidth).toBe(compact ? 48 : 206); expect(sample.profileBottom).toBe(height - 25);
  175 |           expect(sample.iconCenter).toBe(49); expect(sample.logoCenter).toBe(49);
  176 |           expect(sample.surfaceWidth).toBe(compact ? 82 : 240); expect(sample.surfaceTop).toBe('10px');
  177 |           expect(sample.contentLeft).toBeGreaterThanOrEqual(sample.sidebarWidth); expect(sample.overflow).toBeLessThanOrEqual(1);
  178 |           expect(sample.listOverflow).toBe('auto'); if (height === 480) expect(sample.listScroll).toBeGreaterThan(sample.listHeight);
  179 |           geometry.push({...sample, compact, responsiveFrame});
  180 |         }
  181 |       }
  182 |     }
  183 |     await page.setViewportSize({width: 1440, height: 900});
  184 |     await sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true}).press('Enter');
  185 |     await sidebar.screenshot({path: info.outputPath('sidebar-expanded.png'), animations: 'disabled'});
  186 |     await sidebar.getByRole('button', {name: 'Collapse navigation sidebar', exact: true}).press('Space');
  187 |     await sidebar.screenshot({path: info.outputPath('sidebar-compact.png'), animations: 'disabled'});
  188 |     await expectNoBlockingAxeViolations(page);
```