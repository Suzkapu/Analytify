# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Navigation preferences match canonical section typography and responsive layout
- Location: e2e/design-v2-navigation.spec.ts:41:5

# Error details

```
Error: expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 1

  Object {
    "fontSize": "20px",
    "fontWeight": "600",
    "height": 24,
-   "lineHeight": "28px",
+   "lineHeight": "24px",
    "overflow": false,
  }
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - complementary "Desktop sidebar" [ref=f1e7]:
    - generic [ref=f1e9]:
      - button "Collapse navigation sidebar" [expanded] [ref=f1e10] [cursor=pointer]:
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
  - text: 
  - main "Settings content" [ref=f1e48]:
    - generic "Settings" [ref=f1e50]:
      - generic [ref=f1e51]:
        - generic [ref=f1e53]:
          - heading "Settings" [level=1] [ref=f1e55]
          - paragraph [ref=f1e56]: Manage your account, notifications, updates and saved data.
        - navigation "Settings sections" [ref=f1e59]:
          - link "Account" [ref=f1e60] [cursor=pointer]:
            - /url: /new/settings/account
            - generic [aria-hidden] [ref=f1e61]: 
          - link "Notifications" [ref=f1e63] [cursor=pointer]:
            - /url: /new/settings/notifications
            - generic [aria-hidden] [ref=f1e64]: 
          - link "Updates" [ref=f1e66] [cursor=pointer]:
            - /url: /new/settings/updates
            - generic [aria-hidden] [ref=f1e67]: 
          - link "Data" [ref=f1e69] [cursor=pointer]:
            - /url: /new/settings/data
            - generic [aria-hidden] [ref=f1e70]: 
          - text: 
        - region [ref=f1e74]:
          - heading "Bottom navigation" [level=2] [ref=f1e75]
          - paragraph [ref=f1e76]: Choose up to five shortcuts. Choose none to hide the bar. Changes apply immediately; the Menu button always stays available.
          - status [ref=f1e77]: 3 of 5 shortcuts selected
          - generic "Bottom navigation shortcuts" [ref=f1e78]:
            - button "Playlists" [pressed] [ref=f1e80] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e81]: 
            - button "Stats" [pressed] [ref=f1e84] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e85]: 
            - button "History" [pressed] [ref=f1e88] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e89]: 
            - button "Friends" [ref=f1e92] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e93]: 
            - button "Song Leagues" [ref=f1e96] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e97]: 
            - button "Private Sharing" [ref=f1e100] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e101]: 
            - button "Compare" [ref=f1e104] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e105]: 
  - text:   
  - contentinfo [ref=f1e107]:
    - generic [ref=f1e108]: Powered by Spotify
    - generic [ref=f1e109]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e110] [cursor=pointer]:
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
  41  | test('Navigation preferences match canonical section typography and responsive layout', async ({page}, info) => {
  42  |   const {unexpected, errors} = await prepareNavigation(page, 'reduce');
  43  |   await page.goto('/new/settings/navigation');
  44  |   const panel = page.locator('v2-settings-navigation-preferences');
  45  |   await expect(panel.getByRole('status')).toHaveText('3 of 5 shortcuts selected');
  46  |   const samples = [];
  47  |   for (const width of [1440, 390, 320]) {
  48  |     await page.setViewportSize({width, height: 867});
  49  |     const sample = await panel.evaluate(element => {
  50  |       const heading = element.querySelector('h2')!, css = getComputedStyle(heading);
  51  |       const bounds = heading.getBoundingClientRect();
  52  |       return {width: innerWidth, fontSize: css.fontSize, fontWeight: css.fontWeight, lineHeight: css.lineHeight,
  53  |         height: bounds.height, overflow: document.documentElement.scrollWidth > innerWidth};
  54  |     });
  55  |     // Canonical688:41748 uses Section20/600/28 in a24px text box.
  56  |     // The reference is external to the implementation's component stylesheet.
> 57  |     expect(sample).toMatchObject({fontSize: '20px', fontWeight: '600', lineHeight: '28px', height: 24, overflow: false});
      |                    ^ Error: expect(received).toMatchObject(expected)
  58  |     samples.push(sample);
  59  |   }
  60  |   for (const [name, width] of [['desktop', 1440], ['mobile', 390]] as const) {
  61  |     await page.setViewportSize({width, height: 867});
  62  |     await panel.screenshot({path: info.outputPath(`candidate-navigation-preferences-${name}.png`), animations: 'disabled', scale: 'css'});
  63  |   }
  64  |   await writeFile(info.outputPath('navigation-section-typography.json'), JSON.stringify({samples, unexpected, errors}, null, 2));
  65  |   expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  66  | });
  67  | 
  68  | for (const motion of ['no-preference', 'reduce'] as const) {
  69  |   test(`Settings account and data actions stay reachable (${motion})`, async ({page}, info) => {
  70  |     const {unexpected, errors} = await prepareNavigation(page, motion);
  71  |     for (const width of [1440, 390]) {
  72  |       await page.setViewportSize({width, height: 900});
  73  |       await page.goto('/new/settings/navigation');
  74  |       await expect(page.getByRole('status').filter({hasText: /^3 of 5 shortcuts selected$/})).toBeVisible();
  75  |       if (width > 760) {
  76  |         await page.getByRole('complementary', {name: 'Desktop sidebar'}).getByRole('link', {name: 'Settings', exact: true}).press('Enter');
  77  |       } else {
  78  |         await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
  79  |         await page.getByRole('dialog', {name: 'Navigation menu', exact: true}).getByRole('link', {name: 'Settings', exact: true}).press('Enter');
  80  |       }
  81  |       await expect(page).toHaveURL(/\/new\/settings\/account$/);
  82  |       const account = page.getByRole('region', {name: 'Account settings'});
  83  |       await expect(account.getByRole('button', {name: 'Log out', exact: true})).toBeVisible();
  84  |       await expect(account.getByRole('link', {name: 'Spotify connection'})).toHaveAttribute('href', 'https://www.spotify.com/account/apps/');
  85  |       await expect(account.getByRole('link', {name: 'Spotify connection'})).toHaveAttribute('rel', 'noopener noreferrer');
  86  |       await expect(account.getByRole('link', {name: 'Legal & privacy'})).toHaveAttribute('href', '/new/legal');
  87  |       await page.getByRole('navigation', {name: 'Settings sections'}).getByRole('link', {name: 'Data', exact: true}).press('Enter');
  88  |       await expect(page.getByRole('switch', {name: 'Cloud Backup', exact: true})).toBeVisible();
  89  |       await page.getByRole('button', {name: 'Clear data', exact: true}).press('Enter');
  90  |       const dialog = page.getByRole('alertdialog', {name: 'What would you like to clear?'});
  91  |       await expect(dialog.getByRole('button', {name: 'Clear this browser and log out'})).toBeVisible();
  92  |       await expect(dialog.getByRole('button', {name: 'Delete cloud data and leave shared features'})).toBeVisible();
  93  |       await dialog.getByRole('button', {name: 'Cancel', exact: true}).press('Enter');
  94  |       await expect(dialog).toHaveCount(0);
  95  |       await expect(page.getByRole('button', {name: 'Clear data', exact: true})).toBeFocused();
  96  |       await expectNoBlockingAxeViolations(page);
  97  |     }
  98  |     await expectNativeTransitionsSettled(page);
  99  |     await writeFile(info.outputPath('settings-access.json'), JSON.stringify({motion, unexpected, errors}, null, 2));
  100 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  101 |   });
  102 |   test(`Canonical app header, gutters and document footer (${motion})`, async ({page}, info) => {
  103 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  104 |     await page.goto('/new/settings/account');
  105 |     await expect(page.getByRole('region', {name: 'Account settings'})).toBeVisible();
  106 |     const geometry = [];
  107 |     for (const width of [1440, 1920, 1024, 768, 761, 760, 390, 360, 320]) for (const height of [480, 1000]) {
  108 |       await page.setViewportSize({width, height});
  109 |       await page.evaluate(() => window.scrollTo(0, 0));
  110 |       const mobile = width <= 760;
  111 |       const header = page.locator('.v2-header');
  112 |       if (mobile) {
  113 |         await expect(header.getByRole('link', {name: 'Analytify playlists'})).toBeVisible();
  114 |         await expect(header.getByRole('button', {name: 'Open navigation menu', exact: true})).toBeVisible();
  115 |       } else await expect(header).toBeHidden();
  116 |       await expect(page.getByRole('button', {name: 'Open account and data settings', exact: true})).toHaveCount(0);
  117 |       const sample = await page.evaluate(() => {
  118 |         const box = (selector: string) => {
  119 |           const element = document.querySelector(selector)!, rect = element.getBoundingClientRect(), css = getComputedStyle(element);
  120 |           return {x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height, bottom: rect.bottom + scrollY,
  121 |             paddingLeft: css.paddingLeft, paddingRight: css.paddingRight, fontSize: css.fontSize, fontWeight: css.fontWeight,
  122 |             lineHeight: css.lineHeight, whiteSpace: css.whiteSpace, background: css.backgroundColor, borderTop: css.borderTopWidth};
  123 |         };
  124 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  125 |           documentHeight: document.documentElement.scrollHeight, header: box('.v2-header'), logo: box('.v2-brand img'),
  126 |           brand: box('.v2-brand'), menu: box('.v2-tools-button'), heading: box('main h1'), main: box('main'),
  127 |           body: box('.v2-page'), tabs: box('.v2-settings-navigation'), profile: box('.v2-settings-profile'), footer: box('.v2-footer'), legal: box('.v2-footer a'), caption: box('.v2-footer > span'),
  128 |           shield: getComputedStyle(document.querySelector('.v2-footer .v2-footer-shield')!).display,
  129 |           shieldSlot: box('.v2-footer .v2-footer-shield'), shieldImage: box('.v2-footer .v2-footer-shield img'),
  130 |           shieldAsset: (() => {const img = document.querySelector('.v2-footer .v2-footer-shield img') as HTMLImageElement;
  131 |             return {loaded: img.complete && img.naturalWidth === 20 && img.naturalHeight === 20, src: img.getAttribute('src'), alt: img.alt};})()};
  132 |       });
  133 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  134 |       expect(sample.heading.x).toBe(mobile ? 16 : 256 + 32);
  135 |       expect(sample.heading.y).toBe(mobile ? 72 + 16 : 32);
  136 |       expect(sample.profile.y - sample.tabs.bottom).toBe(mobile ? 12 : 16);
  137 |       expect(sample.footer.y).toBeGreaterThanOrEqual(sample.body.bottom + 16);
  138 |       expect(sample.footer.bottom).toBe(sample.documentHeight - (mobile ? 86 : 0));
  139 |       expect(sample.footer).toMatchObject({background: 'rgba(0, 0, 0, 0)', borderTop: '0px', paddingLeft: mobile ? '16px' : '40px', paddingRight: mobile ? '16px' : '40px'});
  140 |       expect(sample.caption).toMatchObject({fontSize: '14px', lineHeight: '20px', fontWeight: '400', height: 20});
  141 |       expect(sample.legal).toMatchObject({width: mobile ? 129 : 160, height: 48, fontSize: '14px', lineHeight: '20px', fontWeight: '600', whiteSpace: 'nowrap'});
  142 |       if (!mobile && width >= 1024) expect(sample.footer.height).toBe(48);
  143 |       if (mobile) {
  144 |         expect(sample.header).toMatchObject({height: 72, y: 0});
  145 |         expect(sample.logo).toMatchObject({width: 32, height: 32, x: 16});
  146 |         expect(sample.brand).toMatchObject({fontSize: '20px', lineHeight: '28px', fontWeight: '600'});
  147 |         expect(sample.menu).toMatchObject({width: 100, height: 48});
  148 |         expect(sample.shield).toBe('none');
  149 |       } else {
  150 |         expect(sample.shield).not.toBe('none');
  151 |         expect(sample.shieldSlot).toMatchObject({width: 18, height: 18});
  152 |         expect(sample.shieldImage).toMatchObject({width: 20, height: 20});
  153 |         expect(sample.shieldAsset).toEqual({loaded: true, src: 'assets/design-v2/footer-shield.svg', alt: ''});
  154 |       }
  155 |       geometry.push(sample);
  156 |     }
  157 |     await page.setViewportSize({width: 1440, height: 1000});
```