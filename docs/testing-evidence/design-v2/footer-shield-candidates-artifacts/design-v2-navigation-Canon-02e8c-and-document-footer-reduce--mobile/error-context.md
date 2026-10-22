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
  495 pixels (ratio 0.01 of all image pixels) are different.

  Snapshot: shell-footer-desktop.png

Call log:
  - Expect "toHaveScreenshot(shell-footer-desktop.png)" getByRole('contentinfo') with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for getByRole('contentinfo')
    - locator resolved to <footer class="v2-footer" _ngcontent-ng-c1778716678="">…</footer>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 495 pixels (ratio 0.01 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for getByRole('contentinfo')
    - locator resolved to <footer class="v2-footer" _ngcontent-ng-c1778716678="">…</footer>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - 495 pixels (ratio 0.01 of all image pixels) are different.

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
```

# Test source

```ts
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
  101 |           shield: getComputedStyle(document.querySelector('.v2-footer .v2-footer-shield')!).display,
  102 |           shieldSlot: box('.v2-footer .v2-footer-shield'), shieldImage: box('.v2-footer .v2-footer-shield img'),
  103 |           shieldAsset: (() => {const img = document.querySelector('.v2-footer .v2-footer-shield img') as HTMLImageElement;
  104 |             return {loaded: img.complete && img.naturalWidth === 20 && img.naturalHeight === 20, src: img.getAttribute('src'), alt: img.alt};})()};
  105 |       });
  106 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  107 |       expect(sample.heading.x).toBe(mobile ? 16 : 256 + 32);
  108 |       expect(sample.heading.y).toBe(mobile ? 72 + 16 : 32);
  109 |       expect(sample.profile.y - sample.tabs.bottom).toBe(mobile ? 12 : 16);
  110 |       expect(sample.footer.y).toBeGreaterThanOrEqual(sample.body.bottom + 16);
  111 |       expect(sample.footer.bottom).toBe(sample.documentHeight - (mobile ? 86 : 0));
  112 |       expect(sample.footer).toMatchObject({background: 'rgba(0, 0, 0, 0)', borderTop: '0px', paddingLeft: mobile ? '16px' : '40px', paddingRight: mobile ? '16px' : '40px'});
  113 |       expect(sample.caption).toMatchObject({fontSize: '14px', lineHeight: '20px', fontWeight: '400', height: 20});
  114 |       expect(sample.legal).toMatchObject({width: mobile ? 129 : 160, height: 48, fontSize: '14px', lineHeight: '20px', fontWeight: '600', whiteSpace: 'nowrap'});
  115 |       if (!mobile && width >= 1024) expect(sample.footer.height).toBe(48);
  116 |       if (mobile) {
  117 |         expect(sample.header).toMatchObject({height: 72, y: 0});
  118 |         expect(sample.logo).toMatchObject({width: 32, height: 32, x: 16});
  119 |         expect(sample.brand).toMatchObject({fontSize: '20px', lineHeight: '28px', fontWeight: '600'});
  120 |         expect(sample.menu).toMatchObject({width: 100, height: 48});
  121 |         expect(sample.shield).toBe('none');
  122 |       } else {
  123 |         expect(sample.shield).not.toBe('none');
  124 |         expect(sample.shieldSlot).toMatchObject({width: 18, height: 18});
  125 |         expect(sample.shieldImage).toMatchObject({width: 20, height: 20});
  126 |         expect(sample.shieldAsset).toEqual({loaded: true, src: 'assets/design-v2/footer-shield.svg', alt: ''});
  127 |       }
  128 |       geometry.push(sample);
  129 |     }
  130 |     await page.setViewportSize({width: 1440, height: 1000});
  131 |     await page.screenshot({path: info.outputPath('shell-desktop.png'), fullPage: true, animations: 'disabled'});
  132 |     // Component baselines were individually inspected against canonical Figma;
  133 |     // the review ledger records their hashes. Full-page parity remains open.
  134 |     // Match candidate capture's native device scale explicitly; screenshot assertions otherwise default to CSS pixels.
  135 |     const visual = {animations: 'disabled' as const, scale: 'device' as const, style: '.ambient-dots {transform:none !important;}'};
  136 |     if (motion === 'reduce') {
  137 |       // Capture every candidate before any assertion so an intentional backdrop
  138 |       // change can be reviewed per component without automatic baseline updates.
  139 |       await page.getByRole('contentinfo').screenshot({...visual, path: info.outputPath('candidate-footer-desktop.png')});
  140 |       await page.setViewportSize({width: 390, height: 900});
  141 |       await page.locator('.v2-header').screenshot({...visual, path: info.outputPath('candidate-header-mobile.png')});
  142 |       await page.getByRole('contentinfo').screenshot({...visual, path: info.outputPath('candidate-footer-mobile.png')});
  143 |       await page.setViewportSize({width: 1440, height: 1000});
> 144 |       await expect(page.getByRole('contentinfo')).toHaveScreenshot('shell-footer-desktop.png', visual);
      |                                                   ^ Error: expect(locator).toHaveScreenshot(expected) failed
  145 |     }
  146 |     await page.setViewportSize({width: 390, height: 900});
  147 |     await page.screenshot({path: info.outputPath('shell-mobile.png'), fullPage: true, animations: 'disabled'});
  148 |     if (motion === 'reduce') {
  149 |       await expect(page.locator('.v2-header')).toHaveScreenshot('shell-header-mobile.png', visual);
  150 |       await expect(page.getByRole('contentinfo')).toHaveScreenshot('shell-footer-mobile.png', visual);
  151 |     }
  152 |     const menu = page.getByRole('button', {name: 'Open navigation menu', exact: true});
  153 |     await menu.focus(); await expect(menu).toHaveCSS('outline-color', 'rgb(159, 255, 200)');
  154 |     await menu.press('Space');
  155 |     await expect(page.getByRole('dialog', {name: 'Navigation menu', exact: true})).toBeVisible();
  156 |     await page.keyboard.press('Escape'); await expect(menu).toBeFocused();
  157 |     await page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true}).focus();
  158 |     await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toBeFocused();
  159 |     await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toHaveCSS('outline-color', 'rgb(159, 255, 200)');
  160 |     await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toHaveCSS('border-color', 'rgb(53, 231, 131)');
  161 |     await expectNoBlockingAxeViolations(page); await expectNativeTransitionsSettled(page);
  162 |     await writeFile(info.outputPath('shell-geometry.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  163 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  164 |   });
  165 |   test(`Desktop sidebar keeps geometry and mobile independence (${motion})`, async ({page}, info) => {
  166 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  167 |     await page.setViewportSize({width: 1440, height: 900});
  168 |     await page.goto('/new/settings/navigation');
  169 |     await expect(page.getByRole('status').filter({hasText: /^3 of 5 shortcuts selected$/})).toBeVisible();
  170 |     const sidebar = page.getByRole('complementary', {name: 'Desktop sidebar'});
  171 |     if (motion === 'reduce') {
  172 |       await expect(page.locator('.design-v2')).toHaveCSS('transition-property', 'none');
  173 |       await expect(sidebar).toHaveCSS('transition-property', 'none');
  174 |     }
  175 |     const geometry = [];
  176 |     for (const width of [761, 1024, 1440, 1920]) {
  177 |       for (const height of [480, 900]) {
  178 |         await page.setViewportSize({width, height});
  179 |         for (const compact of [false, true]) {
  180 |           const toggle = sidebar.getByRole('button', {name: compact ? 'Collapse navigation sidebar' : 'Expand navigation sidebar', exact: true});
  181 |           if (await toggle.count()) await toggle.press('Enter');
  182 |           const currentToggle = sidebar.getByRole('button', {name: compact ? 'Expand navigation sidebar' : 'Collapse navigation sidebar', exact: true});
  183 |           await expect(currentToggle).toHaveAttribute('aria-expanded', compact ? 'false' : 'true');
  184 |           const responsiveFrame = await navigationRenderState(page);
  185 |           // All destinations stay accessible in both modes; collect them in one
  186 |           // browser round trip at each size rather than eight separate queries.
  187 |           expect(await sidebar.getByRole('link').evaluateAll(links => links.map(link =>
  188 |             link.getAttribute('aria-label') ?? link.textContent?.trim()))).toEqual([
  189 |             'Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists', 'Settings',
  190 |           ]);
  191 |           const sample = await sidebar.evaluate(element => {
  192 |             const box = element.getBoundingClientRect(), panel = element.querySelector('.navigation-panel')!;
  193 |             const profile = element.querySelector('.drawer-profile')!.getBoundingClientRect();
  194 |             const group = element.querySelector('.navigation-groups')!;
  195 |             const icon = element.querySelector('.drawer-link i')!.getBoundingClientRect();
  196 |             const logo = element.querySelector('.drawer-brand img')!.getBoundingClientRect();
  197 |             const surface = getComputedStyle(panel, '::before');
  198 |             return {width: innerWidth, height: innerHeight, sidebarWidth: box.width, sidebarHeight: box.height, x: box.x, y: box.y,
  199 |               profileBottom: profile.bottom, profileHeight: profile.height, profileWidth: profile.width,
  200 |               iconCenter: icon.x + icon.width / 2, logoCenter: logo.x + logo.width / 2,
  201 |               listHeight: group.clientHeight, listScroll: group.scrollHeight, listOverflow: getComputedStyle(group).overflowY,
  202 |               surfaceWidth: Number.parseFloat(surface.width), surfaceTop: surface.top,
  203 |               contentLeft: document.querySelector('main')!.getBoundingClientRect().left,
  204 |               overflow: document.documentElement.scrollWidth - innerWidth};
  205 |           });
  206 |           expect(sample.sidebarWidth).toBe(compact ? 98 : 256); expect(sample.sidebarHeight).toBe(height);
  207 |           expect(sample.x).toBe(0); expect(sample.y).toBe(0); expect(sample.profileHeight).toBe(72);
  208 |           expect(sample.profileWidth).toBe(compact ? 48 : 206); expect(sample.profileBottom).toBe(height - 25);
  209 |           expect(sample.iconCenter).toBe(49); expect(sample.logoCenter).toBe(49);
  210 |           expect(sample.surfaceWidth).toBe(compact ? 82 : 240); expect(sample.surfaceTop).toBe('10px');
  211 |           expect(sample.contentLeft).toBeGreaterThanOrEqual(sample.sidebarWidth); expect(sample.overflow).toBeLessThanOrEqual(1);
  212 |           expect(sample.listOverflow).toBe('auto'); if (height === 480) expect(sample.listScroll).toBeGreaterThan(sample.listHeight);
  213 |           geometry.push({...sample, compact, responsiveFrame});
  214 |         }
  215 |       }
  216 |     }
  217 |     await page.setViewportSize({width: 1440, height: 900});
  218 |     await sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true}).press('Enter');
  219 |     await sidebar.screenshot({path: info.outputPath('sidebar-expanded.png'), animations: 'disabled'});
  220 |     await sidebar.getByRole('button', {name: 'Collapse navigation sidebar', exact: true}).press('Space');
  221 |     await sidebar.screenshot({path: info.outputPath('sidebar-compact.png'), animations: 'disabled'});
  222 |     await expectNoBlockingAxeViolations(page);
  223 |     await page.setViewportSize({width: 390, height: 900}); await expect(sidebar).toBeHidden();
  224 |     await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
  225 |     const dialog = page.getByRole('dialog', {name: 'Navigation menu', exact: true});
  226 |     await expect(dialog.locator('.drawer-identity')).toBeVisible(); await expect(dialog.locator('.panel--compact')).toHaveCount(0);
  227 |     await page.keyboard.press('Escape');
  228 |     await page.setViewportSize({width: 1440, height: 900});
  229 |     await expect(sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true})).toHaveAttribute('aria-expanded', 'false');
  230 |     await expectNativeTransitionsSettled(page);
  231 |     await writeFile(info.outputPath('sidebar-native.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  232 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  233 |   });
  234 |   test(`Device shortcut read and write recovery (${motion})`, async ({page}, info) => {
  235 |     await page.addInitScript(() => {
  236 |       const faults = {readFailures: 1, writeFailures: 1, failedReads: 0, failedWrites: 0,
  237 |         writes: [] as {key: string; value: unknown}[]};
  238 |       Object.assign(window, {analytifyPreferenceFaults: faults});
  239 |       const get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put;
  240 |       IDBObjectStore.prototype.get = function(this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
  241 |         if (typeof key === 'string' && key.startsWith('design-v2:mobile-shortcuts:') && faults.readFailures > 0) {
  242 |           faults.readFailures--; faults.failedReads++;
  243 |           throw new DOMException('Synthetic device read failure', 'UnknownError');
  244 |         }
```