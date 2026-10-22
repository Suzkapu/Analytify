# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Canonical app header, gutters and document footer (reduce)
- Location: e2e/design-v2-navigation.spec.ts:75:7

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: getByRole('contentinfo')
  Expected an image 2368px by 96px, received 1184px by 48px. 166955 pixels (ratio 0.74 of all image pixels) are different.

  Snapshot: shell-footer-desktop.png

Call log:
  - Expect "toHaveScreenshot(shell-footer-desktop.png)" getByRole('contentinfo') with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for getByRole('contentinfo')
    - locator resolved to <footer class="v2-footer" _ngcontent-ng-c1467389000="">…</footer>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - Expected an image 2368px by 96px, received 1184px by 48px. 166955 pixels (ratio 0.74 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for getByRole('contentinfo')
    - locator resolved to <footer class="v2-footer" _ngcontent-ng-c1467389000="">…</footer>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - Expected an image 2368px by 96px, received 1184px by 48px. 166955 pixels (ratio 0.74 of all image pixels) are different.

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
        - region "Account settings" [ref=f1e74]:
          - generic [ref=f1e75]:
            - generic [aria-hidden] [ref=f1e76]: B
            - generic [ref=f1e77]:
              - heading "Browser test user" [level=2] [ref=f1e78]
              - paragraph [ref=f1e79]: Manage your Spotify connection and account.
          - link "Spotify connection" [ref=f1e81] [cursor=pointer]:
            - /url: https://www.spotify.com/account/apps/
            - generic [aria-hidden] [ref=f1e82]: 
            - generic [aria-hidden] [ref=f1e84]: 
          - link "Legal & privacy" [ref=f1e86] [cursor=pointer]:
            - /url: /new/legal
            - generic [aria-hidden] [ref=f1e87]: 
            - generic [aria-hidden] [ref=f1e89]: 
          - button "Log out" [ref=f1e90] [cursor=pointer]:
            - generic [aria-hidden] [ref=f1e91]: 
            - text: Log out
  - text:   
  - contentinfo [ref=f1e92]:
    - generic [ref=f1e93]: Powered by Spotify
    - generic [ref=f1e94]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e95] [cursor=pointer]:
      - /url: /new/legal
      - generic [aria-hidden] [ref=f1e96]: 
      - text: Legal & privacy
```

# Test source

```ts
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
  88  |       } else await expect(header).toBeHidden();
  89  |       await expect(page.getByRole('button', {name: 'Open account and data settings', exact: true})).toHaveCount(0);
  90  |       const sample = await page.evaluate(() => {
  91  |         const box = (selector: string) => {
  92  |           const element = document.querySelector(selector)!, rect = element.getBoundingClientRect(), css = getComputedStyle(element);
  93  |           return {x: rect.x, y: rect.y + scrollY, width: rect.width, height: rect.height, bottom: rect.bottom + scrollY,
  94  |             paddingLeft: css.paddingLeft, paddingRight: css.paddingRight, fontSize: css.fontSize, fontWeight: css.fontWeight,
  95  |             lineHeight: css.lineHeight, whiteSpace: css.whiteSpace, background: css.backgroundColor, borderTop: css.borderTopWidth};
  96  |         };
  97  |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  98  |           documentHeight: document.documentElement.scrollHeight, header: box('.v2-header'), logo: box('.v2-brand img'),
  99  |           brand: box('.v2-brand'), menu: box('.v2-tools-button'), heading: box('main h1'), main: box('main'),
  100 |           body: box('.v2-page'), tabs: box('.v2-settings-navigation'), profile: box('.v2-settings-profile'), footer: box('.v2-footer'), legal: box('.v2-footer a'), caption: box('.v2-footer > span'),
  101 |           shield: getComputedStyle(document.querySelector('.v2-footer .pi-shield')!).display};
  102 |       });
  103 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  104 |       expect(sample.heading.x).toBe(mobile ? 16 : 256 + 32);
  105 |       expect(sample.heading.y).toBe(mobile ? 72 + 16 : 32);
  106 |       expect(sample.profile.y - sample.tabs.bottom).toBe(mobile ? 12 : 16);
  107 |       expect(sample.footer.y).toBeGreaterThanOrEqual(sample.body.bottom + 16);
  108 |       expect(sample.footer.bottom).toBe(sample.documentHeight - (mobile ? 86 : 0));
  109 |       expect(sample.footer).toMatchObject({background: 'rgba(0, 0, 0, 0)', borderTop: '0px', paddingLeft: mobile ? '16px' : '40px', paddingRight: mobile ? '16px' : '40px'});
  110 |       expect(sample.caption).toMatchObject({fontSize: '14px', lineHeight: '20px', fontWeight: '400', height: 20});
  111 |       expect(sample.legal).toMatchObject({width: mobile ? 129 : 160, height: 48, fontSize: '14px', lineHeight: '20px', fontWeight: '600', whiteSpace: 'nowrap'});
  112 |       if (!mobile && width >= 1024) expect(sample.footer.height).toBe(48);
  113 |       if (mobile) {
  114 |         expect(sample.header).toMatchObject({height: 72, y: 0});
  115 |         expect(sample.logo).toMatchObject({width: 32, height: 32, x: 16});
  116 |         expect(sample.brand).toMatchObject({fontSize: '20px', lineHeight: '28px', fontWeight: '600'});
  117 |         expect(sample.menu).toMatchObject({width: 100, height: 48});
  118 |         expect(sample.shield).toBe('none');
  119 |       } else expect(sample.shield).not.toBe('none');
  120 |       geometry.push(sample);
  121 |     }
  122 |     await page.setViewportSize({width: 1440, height: 1000});
  123 |     await page.screenshot({path: info.outputPath('shell-desktop.png'), fullPage: true, animations: 'disabled'});
  124 |     // Component baselines were individually inspected against canonical Figma;
  125 |     // the review ledger records their hashes. Full-page parity remains open.
  126 |     const visual = {animations: 'disabled' as const, style: '.ambient-dots {transform:none !important;}'};
> 127 |     if (motion === 'reduce') await expect(page.getByRole('contentinfo')).toHaveScreenshot('shell-footer-desktop.png', visual);
      |                                                                          ^ Error: expect(locator).toHaveScreenshot(expected) failed
  128 |     await page.setViewportSize({width: 390, height: 900});
  129 |     await page.screenshot({path: info.outputPath('shell-mobile.png'), fullPage: true, animations: 'disabled'});
  130 |     if (motion === 'reduce') {
  131 |       await expect(page.locator('.v2-header')).toHaveScreenshot('shell-header-mobile.png', visual);
  132 |       await expect(page.getByRole('contentinfo')).toHaveScreenshot('shell-footer-mobile.png', visual);
  133 |     }
  134 |     const menu = page.getByRole('button', {name: 'Open navigation menu', exact: true});
  135 |     await menu.focus(); await expect(menu).toHaveCSS('outline-color', 'rgb(159, 255, 200)');
  136 |     await menu.press('Space');
  137 |     await expect(page.getByRole('dialog', {name: 'Navigation menu', exact: true})).toBeVisible();
  138 |     await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
  139 |     await page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true}).focus();
  140 |     await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toBeFocused();
  141 |     await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toHaveCSS('outline-color', 'rgb(159, 255, 200)');
  142 |     await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toHaveCSS('border-color', 'rgb(53, 231, 131)');
  143 |     await expectNoBlockingAxeViolations(page); await expectNativeTransitionsSettled(page);
  144 |     await writeFile(info.outputPath('shell-geometry.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  145 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  146 |   });
  147 |   test(`Desktop sidebar keeps geometry and mobile independence (${motion})`, async ({page}, info) => {
  148 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  149 |     await page.setViewportSize({width: 1440, height: 900});
  150 |     await page.goto('/new/settings/navigation');
  151 |     await expect(page.getByRole('status').filter({hasText: /^3 of 5 shortcuts selected$/})).toBeVisible();
  152 |     const sidebar = page.getByRole('complementary', {name: 'Desktop sidebar'});
  153 |     if (motion === 'reduce') {
  154 |       await expect(page.locator('.design-v2')).toHaveCSS('transition-property', 'none');
  155 |       await expect(sidebar).toHaveCSS('transition-property', 'none');
  156 |     }
  157 |     const geometry = [];
  158 |     for (const width of [761, 1024, 1440, 1920]) {
  159 |       for (const height of [480, 900]) {
  160 |         await page.setViewportSize({width, height});
  161 |         for (const compact of [false, true]) {
  162 |           const toggle = sidebar.getByRole('button', {name: compact ? 'Collapse navigation sidebar' : 'Expand navigation sidebar', exact: true});
  163 |           if (await toggle.count()) await toggle.press('Enter');
  164 |           const currentToggle = sidebar.getByRole('button', {name: compact ? 'Expand navigation sidebar' : 'Collapse navigation sidebar', exact: true});
  165 |           await expect(currentToggle).toHaveAttribute('aria-expanded', compact ? 'false' : 'true');
  166 |           const responsiveFrame = await navigationRenderState(page);
  167 |           // All destinations stay accessible in both modes; collect them in one
  168 |           // browser round trip at each size rather than eight separate queries.
  169 |           expect(await sidebar.getByRole('link').evaluateAll(links => links.map(link =>
  170 |             link.getAttribute('aria-label') ?? link.textContent?.trim()))).toEqual([
  171 |             'Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists', 'Settings',
  172 |           ]);
  173 |           const sample = await sidebar.evaluate(element => {
  174 |             const box = element.getBoundingClientRect(), panel = element.querySelector('.navigation-panel')!;
  175 |             const profile = element.querySelector('.drawer-profile')!.getBoundingClientRect();
  176 |             const group = element.querySelector('.navigation-groups')!;
  177 |             const icon = element.querySelector('.drawer-link i')!.getBoundingClientRect();
  178 |             const logo = element.querySelector('.drawer-brand img')!.getBoundingClientRect();
  179 |             const surface = getComputedStyle(panel, '::before');
  180 |             return {width: innerWidth, height: innerHeight, sidebarWidth: box.width, sidebarHeight: box.height, x: box.x, y: box.y,
  181 |               profileBottom: profile.bottom, profileHeight: profile.height, profileWidth: profile.width,
  182 |               iconCenter: icon.x + icon.width / 2, logoCenter: logo.x + logo.width / 2,
  183 |               listHeight: group.clientHeight, listScroll: group.scrollHeight, listOverflow: getComputedStyle(group).overflowY,
  184 |               surfaceWidth: Number.parseFloat(surface.width), surfaceTop: surface.top,
  185 |               contentLeft: document.querySelector('main')!.getBoundingClientRect().left,
  186 |               overflow: document.documentElement.scrollWidth - innerWidth};
  187 |           });
  188 |           expect(sample.sidebarWidth).toBe(compact ? 98 : 256); expect(sample.sidebarHeight).toBe(height);
  189 |           expect(sample.x).toBe(0); expect(sample.y).toBe(0); expect(sample.profileHeight).toBe(72);
  190 |           expect(sample.profileWidth).toBe(compact ? 48 : 206); expect(sample.profileBottom).toBe(height - 25);
  191 |           expect(sample.iconCenter).toBe(49); expect(sample.logoCenter).toBe(49);
  192 |           expect(sample.surfaceWidth).toBe(compact ? 82 : 240); expect(sample.surfaceTop).toBe('10px');
  193 |           expect(sample.contentLeft).toBeGreaterThanOrEqual(sample.sidebarWidth); expect(sample.overflow).toBeLessThanOrEqual(1);
  194 |           expect(sample.listOverflow).toBe('auto'); if (height === 480) expect(sample.listScroll).toBeGreaterThan(sample.listHeight);
  195 |           geometry.push({...sample, compact, responsiveFrame});
  196 |         }
  197 |       }
  198 |     }
  199 |     await page.setViewportSize({width: 1440, height: 900});
  200 |     await sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true}).press('Enter');
  201 |     await sidebar.screenshot({path: info.outputPath('sidebar-expanded.png'), animations: 'disabled'});
  202 |     await sidebar.getByRole('button', {name: 'Collapse navigation sidebar', exact: true}).press('Space');
  203 |     await sidebar.screenshot({path: info.outputPath('sidebar-compact.png'), animations: 'disabled'});
  204 |     await expectNoBlockingAxeViolations(page);
  205 |     await page.setViewportSize({width: 390, height: 900}); await expect(sidebar).toBeHidden();
  206 |     await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
  207 |     const dialog = page.getByRole('dialog', {name: 'Navigation menu', exact: true});
  208 |     await expect(dialog.locator('.drawer-identity')).toBeVisible(); await expect(dialog.locator('.panel--compact')).toHaveCount(0);
  209 |     await page.keyboard.press('Escape');
  210 |     await page.setViewportSize({width: 1440, height: 900});
  211 |     await expect(sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true})).toHaveAttribute('aria-expanded', 'false');
  212 |     await expectNativeTransitionsSettled(page);
  213 |     await writeFile(info.outputPath('sidebar-native.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  214 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  215 |   });
  216 |   test(`Device shortcut read and write recovery (${motion})`, async ({page}, info) => {
  217 |     await page.addInitScript(() => {
  218 |       const faults = {readFailures: 1, writeFailures: 1, failedReads: 0, failedWrites: 0,
  219 |         writes: [] as {key: string; value: unknown}[]};
  220 |       Object.assign(window, {analytifyPreferenceFaults: faults});
  221 |       const get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put;
  222 |       IDBObjectStore.prototype.get = function(this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
  223 |         if (typeof key === 'string' && key.startsWith('design-v2:mobile-shortcuts:') && faults.readFailures > 0) {
  224 |           faults.readFailures--; faults.failedReads++;
  225 |           throw new DOMException('Synthetic device read failure', 'UnknownError');
  226 |         }
  227 |         return get.call(this, key);
```