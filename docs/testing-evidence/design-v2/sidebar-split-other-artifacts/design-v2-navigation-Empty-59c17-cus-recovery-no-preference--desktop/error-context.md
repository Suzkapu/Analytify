# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Empty shortcut persistence, reachable menu and focus recovery (no-preference)
- Location: e2e/design-v2-navigation.spec.ts:279:7

# Error details

```
Error: expect(locator).toHaveAttribute(expected) failed

Locator:  locator('v2-settings-navigation-preferences').getByRole('button', { name: 'Playlists', exact: true })
Expected: "false"
Received: "true"
Timeout:  5000ms

Call log:
  - Expect "toHaveAttribute" locator('v2-settings-navigation-preferences').getByRole('button', { name: 'Playlists', exact: true }) with timeout 5000ms
  - waiting for locator('v2-settings-navigation-preferences').getByRole('button', { name: 'Playlists', exact: true })
    14 × locator resolved to <button type="button" aria-pressed="true" class="shortcut-choice" _ngcontent-ng-c2842143387="">…</button>
       - unexpected value "true"

```

```yaml
- button "Playlists" [pressed]
```

# Test source

```ts
  194 |     expect(faults.failedReads).toBe(1); expect(faults.failedWrites).toBe(1);
  195 |     expect(faults.writes).toHaveLength(2); expect(faults.writes[1]).toEqual(faults.writes[0]);
  196 |     expect(faults.writes[1].value).toBe('["playlists","stats","history","friends"]');
  197 |     const saved = await page.evaluate(() => new Promise<{key: string; value: string}[]>((resolve, reject) => {
  198 |       const open = indexedDB.open('AnalytifyDB', 4);
  199 |       open.onerror = () => reject(open.error);
  200 |       open.onsuccess = () => {
  201 |         const db = open.result, entries: {key: string; value: string}[] = [];
  202 |         const tx = db.transaction(['appData', 'featureData'], 'readonly');
  203 |         for (const store of ['appData', 'featureData']) {
  204 |           const read = tx.objectStore(store).getAll();
  205 |           read.onsuccess = () => entries.push(...read.result.filter(item => item.key.startsWith('design-v2:mobile-shortcuts:')));
  206 |         }
  207 |         tx.onabort = () => {db.close(); reject(tx.error);};
  208 |         tx.oncomplete = () => {db.close(); resolve(entries);};
  209 |       };
  210 |     }));
  211 |     expect(saved).toEqual([faults.writes[1]]);
  212 |     await expectNativeTransitionsSettled(page);
  213 |     await writeFile(info.outputPath('navigation-recovery.json'), JSON.stringify({motion, geometry, faults, saved, unexpected, errors}, null, 2));
  214 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  215 |   });
  216 |   test(`Device shortcut limits, responsive geometry and five-choice persistence (${motion})`, async ({page}, info) => {
  217 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  218 |     await page.goto('/new/settings/navigation');
  219 |     const panel = page.locator('v2-settings-navigation-preferences');
  220 |     const choice = (name: string) => panel.getByRole('button', {name, exact: true});
  221 |     const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
  222 |     const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
  223 |     await expect(panel.getByRole('heading', {name: 'Bottom navigation'})).toBeVisible();
  224 |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  225 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History']);
  226 |     await choice('Friends').press('Enter');
  227 |     await expect(count).toHaveText('4 of 5 shortcuts selected');
  228 |     await expect(choice('Song Leagues')).toBeEnabled();
  229 |     await choice('Song Leagues').press('Enter');
  230 |     await expect(count).toHaveText('5 of 5 shortcuts selected');
  231 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']);
  232 |     await expect(bar.locator('a').filter({hasText: 'Friends'})).toHaveAttribute('href', '/new/friends');
  233 |     await expect(choice('Private Sharing')).toBeEnabled();
  234 |     await choice('Private Sharing').press('Enter');
  235 |     await expect(panel.getByText('Five shortcuts selected. Remove one before adding another.', {exact: true})).toBeVisible();
  236 |     await expect(choice('Private Sharing')).toHaveAttribute('aria-pressed', 'false');
  237 |     const geometry = [];
  238 |     for (const height of [480, 1000]) for (const width of [320, 390, 760, 768, 1440]) {
  239 |       await page.setViewportSize({width, height});
  240 |       const responsiveFrame = await navigationRenderState(page);
  241 |       const sample = await panel.evaluate(element => {
  242 |         const buttons = [...element.querySelectorAll<HTMLButtonElement>('.shortcut-choice')].map(button => {
  243 |           const rect = button.getBoundingClientRect(), css = getComputedStyle(button);
  244 |           const icon = button.querySelector('i')!, label = button.querySelector('span')!;
  245 |           return {label: label.textContent, left: rect.left, right: rect.right, height: rect.height, fontSize: css.fontSize,
  246 |             iconHeight: icon.getBoundingClientRect().height, labelHeight: label.getBoundingClientRect().height,
  247 |             padding: css.padding, gap: css.gap, lineHeight: css.lineHeight, width: rect.width,
  248 |             transition: css.transitionDuration, transitionProperty: css.transitionProperty};
  249 |         });
  250 |         const nav = document.querySelector('.v2-mobile-nav')!;
  251 |         const rect = nav.getBoundingClientRect();
  252 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, buttons,
  253 |           bar: {visible: getComputedStyle(nav).display !== 'none', left: rect.left, right: rect.right, bottom: rect.bottom,
  254 |             rows: new Set([...nav.querySelectorAll('a')].map(link => Math.round(link.getBoundingClientRect().top))).size}};
  255 |       });
  256 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  257 |       for (const button of sample.buttons) {
  258 |         expect(button.left).toBeGreaterThanOrEqual(0); expect(button.right).toBeLessThanOrEqual(width);
  259 |         expect(button.height, JSON.stringify({viewport: {width: sample.width, height: sample.height}, button})).toBe(48); expect(button.fontSize).toBe('12px');
  260 |         if (motion === 'reduce') expect(button.transitionProperty).toBe('none');
  261 |       }
  262 |       expect(sample.bar.visible).toBe(width <= 760);
  263 |       if (sample.bar.visible) {
  264 |         await expect(bar.getByRole('link', {name: 'Friends', exact: true})).toBeVisible();
  265 |         expect(sample.bar.rows).toBe(1); expect(sample.bar.left).toBeGreaterThanOrEqual(0);
  266 |         expect(sample.bar.right).toBeLessThanOrEqual(width); expect(sample.bar.bottom).toBeLessThanOrEqual(height);
  267 |       }
  268 |       geometry.push({...sample, responsiveFrame});
  269 |     }
  270 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  271 |     await expectNoBlockingAxeViolations(page);
  272 |     await page.reload();
  273 |     await expect(count).toHaveText('5 of 5 shortcuts selected');
  274 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']);
  275 |     await expectNativeTransitionsSettled(page);
  276 |     await writeFile(info.outputPath('navigation-choice-geometry.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  277 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  278 |   });
  279 |   test(`Empty shortcut persistence, reachable menu and focus recovery (${motion})`, async ({page}, info) => {
  280 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  281 |     await page.goto('/new/settings/navigation');
  282 |     const panel = page.locator('v2-settings-navigation-preferences');
  283 |     const choice = (name: string) => panel.getByRole('button', {name, exact: true});
  284 |     const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
  285 |     const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
  286 |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  287 |     await choice('Friends').press('Enter');
  288 |     await expect(choice('Song Leagues')).toBeEnabled();
  289 |     await choice('Song Leagues').press('Enter');
  290 |     await expect(count).toHaveText('5 of 5 shortcuts selected');
  291 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  292 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']) {
  293 |       await choice(label).press('Enter');
> 294 |       await expect(choice(label)).toHaveAttribute('aria-pressed', 'false');
      |                                   ^ Error: expect(locator).toHaveAttribute(expected) failed
  295 |       await expect(choice(label)).toBeEnabled();
  296 |     }
  297 |     await expect(count).toHaveText('0 of 5 shortcuts selected');
  298 |     await expect(bar).toHaveCount(0);
  299 |     await page.reload();
  300 |     await expect(count).toHaveText('0 of 5 shortcuts selected');
  301 |     await expect(bar).toHaveCount(0);
  302 |     const menu = page.getByRole('button', {name: 'Open navigation menu', exact: true});
  303 |     await menu.press('Enter');
  304 |     const dialog = page.getByRole('dialog', {name: 'Navigation menu', exact: true});
  305 |     await expect(dialog).toBeVisible();
  306 |     await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  307 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists', 'Settings']) {
  308 |       await expect(dialog.getByRole('link', {name: label, exact: true})).toHaveCount(1);
  309 |     }
  310 |     const drawerGeometry = [];
  311 |     for (const width of [320, 390, 600, 768, 1024, 1440]) {
  312 |       for (const height of [480, 900]) {
  313 |         await page.setViewportSize({width, height});
  314 |         const sample = await dialog.evaluate(element => {
  315 |           const box = element.getBoundingClientRect();
  316 |           const profile = element.querySelector('.drawer-profile')!.getBoundingClientRect();
  317 |           const groups = element.querySelector('.navigation-groups')!;
  318 |           return {width: innerWidth, height: innerHeight, x: box.x, y: box.y, drawerWidth: box.width,
  319 |             drawerHeight: box.height, profileBottom: profile.bottom, profileHeight: profile.height,
  320 |             listBottom: groups.getBoundingClientRect().bottom, listHeight: groups.clientHeight,
  321 |             listScroll: groups.scrollHeight, overflow: getComputedStyle(groups).overflowY,
  322 |             animation: getComputedStyle(element).animationName};
  323 |         });
  324 |         expect(sample.x).toBe(0); expect(sample.y).toBe(0);
  325 |         expect(sample.drawerWidth).toBe(Math.min(width, 320)); expect(sample.drawerHeight).toBe(height);
  326 |         expect(sample.profileBottom).toBe(height - 17); expect(sample.profileHeight).toBe(72);
  327 |         expect(sample.listBottom).toBeLessThanOrEqual(sample.profileBottom - 72 - 16);
  328 |         expect(sample.overflow).toBe('auto');
  329 |         if (height === 480) expect(sample.listScroll).toBeGreaterThan(sample.listHeight);
  330 |         if (motion === 'reduce') expect(sample.animation).toBe('none');
  331 |         drawerGeometry.push(sample);
  332 |       }
  333 |     }
  334 |     await page.setViewportSize({width: 390, height: 900});
  335 |     await dialog.getByRole('link', {name: 'Settings', exact: true}).focus();
  336 |     await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', {name: 'Close navigation menu', exact: true})).toBeFocused();
  337 |     await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('link', {name: 'Settings', exact: true})).toBeFocused();
  338 |     await expectNoBlockingAxeViolations(page);
  339 |     await dialog.screenshot({path: info.outputPath('navigation-drawer.png'), animations: 'disabled'});
  340 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(menu).toBeFocused();
  341 |     await choice('Friends').press('Enter');
  342 |     await expect(count).toHaveText('1 of 5 shortcuts selected');
  343 |     await expect(choice('Friends')).toBeEnabled();
  344 |     await expect(panel.getByText('Saving navigation preferences', {exact: true})).toHaveCount(0);
  345 |     await page.reload();
  346 |     await expect(count).toHaveText('1 of 5 shortcuts selected');
  347 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Friends']);
  348 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  349 |     await page.evaluate(() => document.fonts.ready);
  350 |     await panel.screenshot({path: info.outputPath('navigation-selected.png'), animations: 'disabled'});
  351 |     await writeFile(info.outputPath('navigation-native.json'), JSON.stringify({motion, drawerGeometry, unexpected, errors}, null, 2));
  352 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  353 |   });
  354 | }
  355 | 
```