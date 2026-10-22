# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Canonical app header, gutters and document footer (reduce)
- Location: e2e/design-v2-navigation.spec.ts:75:7

# Error details

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  getByRole('contentinfo').getByRole('link', { name: 'Legal & privacy', exact: true })
Expected: "rgb(159, 255, 200)"
Received: "rgba(50, 223, 120, 0.48)"
Timeout:  5000ms

Call log:
  - Expect "toHaveCSS" getByRole('contentinfo').getByRole('link', { name: 'Legal & privacy', exact: true }) with timeout 5000ms
  - waiting for getByRole('contentinfo').getByRole('link', { name: 'Legal & privacy', exact: true })
    14 × locator resolved to <a href="/new/legal" v2button="tertiary" _ngcontent-ng-c1467389000="" class="v2-button v2-button--tertiary">…</a>
       - unexpected value "rgba(50, 223, 120, 0.48)"

```

```yaml
- link "Legal & privacy":
  - /url: /new/legal
```

# Test source

```ts
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
  124 |     // Capture candidates only. Every image must be inspected against canonical
  125 |     // Figma before any visual baseline is added; full-page parity remains open.
  126 |     const visual = {animations: 'disabled' as const, style: '.ambient-dots {transform:none !important;}'};
  127 |     if (motion === 'reduce') await page.getByRole('contentinfo').screenshot({...visual, path: info.outputPath('candidate-footer-desktop.png')});
  128 |     await page.setViewportSize({width: 390, height: 900});
  129 |     await page.screenshot({path: info.outputPath('shell-mobile.png'), fullPage: true, animations: 'disabled'});
  130 |     if (motion === 'reduce') {
  131 |       await page.locator('.v2-header').screenshot({...visual, path: info.outputPath('candidate-header-mobile.png')});
  132 |       await page.getByRole('contentinfo').screenshot({...visual, path: info.outputPath('candidate-footer-mobile.png')});
  133 |     }
  134 |     await page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true}).focus();
  135 |     await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toBeFocused();
> 136 |     await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toHaveCSS('outline-color', 'rgb(159, 255, 200)');
      |                                                                                                           ^ Error: expect(locator).toHaveCSS(expected) failed
  137 |     await expect(page.getByRole('contentinfo').getByRole('link', {name: 'Legal & privacy', exact: true})).toHaveCSS('border-color', 'rgb(53, 231, 131)');
  138 |     await expectNoBlockingAxeViolations(page); await expectNativeTransitionsSettled(page);
  139 |     await writeFile(info.outputPath('shell-geometry.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  140 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  141 |   });
  142 |   test(`Desktop sidebar keeps geometry and mobile independence (${motion})`, async ({page}, info) => {
  143 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  144 |     await page.setViewportSize({width: 1440, height: 900});
  145 |     await page.goto('/new/settings/navigation');
  146 |     await expect(page.getByRole('status').filter({hasText: /^3 of 5 shortcuts selected$/})).toBeVisible();
  147 |     const sidebar = page.getByRole('complementary', {name: 'Desktop sidebar'});
  148 |     if (motion === 'reduce') {
  149 |       await expect(page.locator('.design-v2')).toHaveCSS('transition-property', 'none');
  150 |       await expect(sidebar).toHaveCSS('transition-property', 'none');
  151 |     }
  152 |     const geometry = [];
  153 |     for (const width of [761, 1024, 1440, 1920]) {
  154 |       for (const height of [480, 900]) {
  155 |         await page.setViewportSize({width, height});
  156 |         for (const compact of [false, true]) {
  157 |           const toggle = sidebar.getByRole('button', {name: compact ? 'Collapse navigation sidebar' : 'Expand navigation sidebar', exact: true});
  158 |           if (await toggle.count()) await toggle.press('Enter');
  159 |           const currentToggle = sidebar.getByRole('button', {name: compact ? 'Expand navigation sidebar' : 'Collapse navigation sidebar', exact: true});
  160 |           await expect(currentToggle).toHaveAttribute('aria-expanded', compact ? 'false' : 'true');
  161 |           const responsiveFrame = await navigationRenderState(page);
  162 |           // All destinations stay accessible in both modes; collect them in one
  163 |           // browser round trip at each size rather than eight separate queries.
  164 |           expect(await sidebar.getByRole('link').evaluateAll(links => links.map(link =>
  165 |             link.getAttribute('aria-label') ?? link.textContent?.trim()))).toEqual([
  166 |             'Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists', 'Settings',
  167 |           ]);
  168 |           const sample = await sidebar.evaluate(element => {
  169 |             const box = element.getBoundingClientRect(), panel = element.querySelector('.navigation-panel')!;
  170 |             const profile = element.querySelector('.drawer-profile')!.getBoundingClientRect();
  171 |             const group = element.querySelector('.navigation-groups')!;
  172 |             const icon = element.querySelector('.drawer-link i')!.getBoundingClientRect();
  173 |             const logo = element.querySelector('.drawer-brand img')!.getBoundingClientRect();
  174 |             const surface = getComputedStyle(panel, '::before');
  175 |             return {width: innerWidth, height: innerHeight, sidebarWidth: box.width, sidebarHeight: box.height, x: box.x, y: box.y,
  176 |               profileBottom: profile.bottom, profileHeight: profile.height, profileWidth: profile.width,
  177 |               iconCenter: icon.x + icon.width / 2, logoCenter: logo.x + logo.width / 2,
  178 |               listHeight: group.clientHeight, listScroll: group.scrollHeight, listOverflow: getComputedStyle(group).overflowY,
  179 |               surfaceWidth: Number.parseFloat(surface.width), surfaceTop: surface.top,
  180 |               contentLeft: document.querySelector('main')!.getBoundingClientRect().left,
  181 |               overflow: document.documentElement.scrollWidth - innerWidth};
  182 |           });
  183 |           expect(sample.sidebarWidth).toBe(compact ? 98 : 256); expect(sample.sidebarHeight).toBe(height);
  184 |           expect(sample.x).toBe(0); expect(sample.y).toBe(0); expect(sample.profileHeight).toBe(72);
  185 |           expect(sample.profileWidth).toBe(compact ? 48 : 206); expect(sample.profileBottom).toBe(height - 25);
  186 |           expect(sample.iconCenter).toBe(49); expect(sample.logoCenter).toBe(49);
  187 |           expect(sample.surfaceWidth).toBe(compact ? 82 : 240); expect(sample.surfaceTop).toBe('10px');
  188 |           expect(sample.contentLeft).toBeGreaterThanOrEqual(sample.sidebarWidth); expect(sample.overflow).toBeLessThanOrEqual(1);
  189 |           expect(sample.listOverflow).toBe('auto'); if (height === 480) expect(sample.listScroll).toBeGreaterThan(sample.listHeight);
  190 |           geometry.push({...sample, compact, responsiveFrame});
  191 |         }
  192 |       }
  193 |     }
  194 |     await page.setViewportSize({width: 1440, height: 900});
  195 |     await sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true}).press('Enter');
  196 |     await sidebar.screenshot({path: info.outputPath('sidebar-expanded.png'), animations: 'disabled'});
  197 |     await sidebar.getByRole('button', {name: 'Collapse navigation sidebar', exact: true}).press('Space');
  198 |     await sidebar.screenshot({path: info.outputPath('sidebar-compact.png'), animations: 'disabled'});
  199 |     await expectNoBlockingAxeViolations(page);
  200 |     await page.setViewportSize({width: 390, height: 900}); await expect(sidebar).toBeHidden();
  201 |     await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
  202 |     const dialog = page.getByRole('dialog', {name: 'Navigation menu', exact: true});
  203 |     await expect(dialog.locator('.drawer-identity')).toBeVisible(); await expect(dialog.locator('.panel--compact')).toHaveCount(0);
  204 |     await page.keyboard.press('Escape');
  205 |     await page.setViewportSize({width: 1440, height: 900});
  206 |     await expect(sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true})).toHaveAttribute('aria-expanded', 'false');
  207 |     await expectNativeTransitionsSettled(page);
  208 |     await writeFile(info.outputPath('sidebar-native.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  209 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  210 |   });
  211 |   test(`Device shortcut read and write recovery (${motion})`, async ({page}, info) => {
  212 |     await page.addInitScript(() => {
  213 |       const faults = {readFailures: 1, writeFailures: 1, failedReads: 0, failedWrites: 0,
  214 |         writes: [] as {key: string; value: unknown}[]};
  215 |       Object.assign(window, {analytifyPreferenceFaults: faults});
  216 |       const get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put;
  217 |       IDBObjectStore.prototype.get = function(this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
  218 |         if (typeof key === 'string' && key.startsWith('design-v2:mobile-shortcuts:') && faults.readFailures > 0) {
  219 |           faults.readFailures--; faults.failedReads++;
  220 |           throw new DOMException('Synthetic device read failure', 'UnknownError');
  221 |         }
  222 |         return get.call(this, key);
  223 |       };
  224 |       IDBObjectStore.prototype.put = function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
  225 |         const entry = value as {key?: unknown; value?: unknown};
  226 |         if (typeof entry?.key === 'string' && entry.key.startsWith('design-v2:mobile-shortcuts:')) {
  227 |           faults.writes.push({key: entry.key, value: entry.value});
  228 |           if (faults.writeFailures > 0) {
  229 |             faults.writeFailures--; faults.failedWrites++;
  230 |             throw new DOMException('Synthetic device quota failure', 'QuotaExceededError');
  231 |           }
  232 |         }
  233 |         return key === undefined ? put.call(this, value) : put.call(this, value, key);
  234 |       };
  235 |     });
  236 |     const {unexpected, errors} = await prepareNavigation(page, motion);
```