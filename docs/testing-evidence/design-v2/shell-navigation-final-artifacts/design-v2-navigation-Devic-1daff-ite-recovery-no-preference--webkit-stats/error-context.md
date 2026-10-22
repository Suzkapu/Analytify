# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Device shortcut read and write recovery (no-preference)
- Location: e2e/design-v2-navigation.spec.ts:201:7

# Error details

```
Error: expect(received).toMatchObject(expected)

- Expected  - 1
+ Received  + 1

  Object {
    "fontSize": "14px",
    "fontWeight": "600",
    "height": 48,
    "lineHeight": "20px",
-   "width": 260,
+   "width": 254,
  }
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - text:       
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - link "Analytify playlists" [ref=f1e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e10]: Analytify
      - button "Open navigation menu" [ref=f1e12] [cursor=pointer]:
        - generic [aria-hidden] [ref=f1e13]: 
        - generic [ref=f1e14]: Menu
  - main "Settings content" [ref=f1e15]:
    - generic "Settings" [ref=f1e17]:
      - generic [ref=f1e18]:
        - heading "Settings" [level=1] [ref=f1e22]
        - navigation "Settings sections" [ref=f1e25]:
          - link "Account" [ref=f1e26] [cursor=pointer]:
            - /url: /new/settings/account
            - generic [aria-hidden] [ref=f1e27]: 
          - link "Notifications" [ref=f1e29] [cursor=pointer]:
            - /url: /new/settings/notifications
            - generic [aria-hidden] [ref=f1e30]: 
            - generic [ref=f1e31]: Alerts
          - link "Updates" [ref=f1e32] [cursor=pointer]:
            - /url: /new/settings/updates
            - generic [aria-hidden] [ref=f1e33]: 
          - link "Data" [ref=f1e35] [cursor=pointer]:
            - /url: /new/settings/data
            - generic [aria-hidden] [ref=f1e36]: 
          - link "Navigation" [ref=f1e38] [cursor=pointer]:
            - /url: /new/settings/navigation
            - generic [aria-hidden] [ref=f1e39]: 
        - region [ref=f1e43]:
          - heading "Bottom navigation" [level=2] [ref=f1e44]
          - paragraph [ref=f1e45]: Choose up to five shortcuts. Choose none to hide the bar. Changes apply immediately; the Menu button always stays available.
          - alert [ref=f1e47]:
            - strong [ref=f1e48]: Navigation preferences could not be loaded
            - paragraph [ref=f1e49]: Saved shortcuts could not be read. Retry before changing your selection.
            - button "Retry" [ref=f1e50] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e51]: 
              - text: Retry
          - generic "Bottom navigation shortcuts" [ref=f1e52]:
            - button "Playlists" [disabled] [ref=f1e54]:
              - generic [aria-hidden] [ref=f1e55]: 
            - button "Stats" [disabled] [ref=f1e58]:
              - generic [aria-hidden] [ref=f1e59]: 
            - button "History" [disabled] [ref=f1e62]:
              - generic [aria-hidden] [ref=f1e63]: 
            - button "Friends" [disabled] [ref=f1e66]:
              - generic [aria-hidden] [ref=f1e67]: 
            - button "Song Leagues" [disabled] [ref=f1e70]:
              - generic [aria-hidden] [ref=f1e71]: 
            - button "Private Sharing" [disabled] [ref=f1e74]:
              - generic [aria-hidden] [ref=f1e75]: 
            - button "Compare" [disabled] [ref=f1e78]:
              - generic [aria-hidden] [ref=f1e79]: 
  - contentinfo [ref=f1e81]:
    - generic [ref=f1e82]: Powered by Spotify
    - generic [ref=f1e83]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e84] [cursor=pointer]:
      - /url: /new/legal
      - text:  Legal & privacy
```

# Test source

```ts
  147 |           const toggle = sidebar.getByRole('button', {name: compact ? 'Collapse navigation sidebar' : 'Expand navigation sidebar', exact: true});
  148 |           if (await toggle.count()) await toggle.press('Enter');
  149 |           const currentToggle = sidebar.getByRole('button', {name: compact ? 'Expand navigation sidebar' : 'Collapse navigation sidebar', exact: true});
  150 |           await expect(currentToggle).toHaveAttribute('aria-expanded', compact ? 'false' : 'true');
  151 |           const responsiveFrame = await navigationRenderState(page);
  152 |           // All destinations stay accessible in both modes; collect them in one
  153 |           // browser round trip at each size rather than eight separate queries.
  154 |           expect(await sidebar.getByRole('link').evaluateAll(links => links.map(link =>
  155 |             link.getAttribute('aria-label') ?? link.textContent?.trim()))).toEqual([
  156 |             'Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists', 'Settings',
  157 |           ]);
  158 |           const sample = await sidebar.evaluate(element => {
  159 |             const box = element.getBoundingClientRect(), panel = element.querySelector('.navigation-panel')!;
  160 |             const profile = element.querySelector('.drawer-profile')!.getBoundingClientRect();
  161 |             const group = element.querySelector('.navigation-groups')!;
  162 |             const icon = element.querySelector('.drawer-link i')!.getBoundingClientRect();
  163 |             const logo = element.querySelector('.drawer-brand img')!.getBoundingClientRect();
  164 |             const surface = getComputedStyle(panel, '::before');
  165 |             return {width: innerWidth, height: innerHeight, sidebarWidth: box.width, sidebarHeight: box.height, x: box.x, y: box.y,
  166 |               profileBottom: profile.bottom, profileHeight: profile.height, profileWidth: profile.width,
  167 |               iconCenter: icon.x + icon.width / 2, logoCenter: logo.x + logo.width / 2,
  168 |               listHeight: group.clientHeight, listScroll: group.scrollHeight, listOverflow: getComputedStyle(group).overflowY,
  169 |               surfaceWidth: Number.parseFloat(surface.width), surfaceTop: surface.top,
  170 |               contentLeft: document.querySelector('main')!.getBoundingClientRect().left,
  171 |               overflow: document.documentElement.scrollWidth - innerWidth};
  172 |           });
  173 |           expect(sample.sidebarWidth).toBe(compact ? 98 : 256); expect(sample.sidebarHeight).toBe(height);
  174 |           expect(sample.x).toBe(0); expect(sample.y).toBe(0); expect(sample.profileHeight).toBe(72);
  175 |           expect(sample.profileWidth).toBe(compact ? 48 : 206); expect(sample.profileBottom).toBe(height - 25);
  176 |           expect(sample.iconCenter).toBe(49); expect(sample.logoCenter).toBe(49);
  177 |           expect(sample.surfaceWidth).toBe(compact ? 82 : 240); expect(sample.surfaceTop).toBe('10px');
  178 |           expect(sample.contentLeft).toBeGreaterThanOrEqual(sample.sidebarWidth); expect(sample.overflow).toBeLessThanOrEqual(1);
  179 |           expect(sample.listOverflow).toBe('auto'); if (height === 480) expect(sample.listScroll).toBeGreaterThan(sample.listHeight);
  180 |           geometry.push({...sample, compact, responsiveFrame});
  181 |         }
  182 |       }
  183 |     }
  184 |     await page.setViewportSize({width: 1440, height: 900});
  185 |     await sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true}).press('Enter');
  186 |     await sidebar.screenshot({path: info.outputPath('sidebar-expanded.png'), animations: 'disabled'});
  187 |     await sidebar.getByRole('button', {name: 'Collapse navigation sidebar', exact: true}).press('Space');
  188 |     await sidebar.screenshot({path: info.outputPath('sidebar-compact.png'), animations: 'disabled'});
  189 |     await expectNoBlockingAxeViolations(page);
  190 |     await page.setViewportSize({width: 390, height: 900}); await expect(sidebar).toBeHidden();
  191 |     await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
  192 |     const dialog = page.getByRole('dialog', {name: 'Navigation menu', exact: true});
  193 |     await expect(dialog.locator('.drawer-identity')).toBeVisible(); await expect(dialog.locator('.panel--compact')).toHaveCount(0);
  194 |     await page.keyboard.press('Escape');
  195 |     await page.setViewportSize({width: 1440, height: 900});
  196 |     await expect(sidebar.getByRole('button', {name: 'Expand navigation sidebar', exact: true})).toHaveAttribute('aria-expanded', 'false');
  197 |     await expectNativeTransitionsSettled(page);
  198 |     await writeFile(info.outputPath('sidebar-native.json'), JSON.stringify({motion, geometry, unexpected, errors}, null, 2));
  199 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  200 |   });
  201 |   test(`Device shortcut read and write recovery (${motion})`, async ({page}, info) => {
  202 |     await page.addInitScript(() => {
  203 |       const faults = {readFailures: 1, writeFailures: 1, failedReads: 0, failedWrites: 0,
  204 |         writes: [] as {key: string; value: unknown}[]};
  205 |       Object.assign(window, {analytifyPreferenceFaults: faults});
  206 |       const get = IDBObjectStore.prototype.get, put = IDBObjectStore.prototype.put;
  207 |       IDBObjectStore.prototype.get = function(this: IDBObjectStore, key: IDBValidKey | IDBKeyRange) {
  208 |         if (typeof key === 'string' && key.startsWith('design-v2:mobile-shortcuts:') && faults.readFailures > 0) {
  209 |           faults.readFailures--; faults.failedReads++;
  210 |           throw new DOMException('Synthetic device read failure', 'UnknownError');
  211 |         }
  212 |         return get.call(this, key);
  213 |       };
  214 |       IDBObjectStore.prototype.put = function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
  215 |         const entry = value as {key?: unknown; value?: unknown};
  216 |         if (typeof entry?.key === 'string' && entry.key.startsWith('design-v2:mobile-shortcuts:')) {
  217 |           faults.writes.push({key: entry.key, value: entry.value});
  218 |           if (faults.writeFailures > 0) {
  219 |             faults.writeFailures--; faults.failedWrites++;
  220 |             throw new DOMException('Synthetic device quota failure', 'QuotaExceededError');
  221 |           }
  222 |         }
  223 |         return key === undefined ? put.call(this, value) : put.call(this, value, key);
  224 |       };
  225 |     });
  226 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  227 |     await page.setViewportSize({width: 600, height: 900});
  228 |     await page.goto('/new/settings/navigation');
  229 |     const panel = page.locator('v2-settings-navigation-preferences');
  230 |     const choices = panel.locator('.shortcut-choice');
  231 |     const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
  232 |     const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
  233 |     const geometry = [];
  234 |     const measureFeedback = async () => {
  235 |       const sample = await panel.locator('v2-inline-status section').evaluate(element => {
  236 |         const rect = element.getBoundingClientRect();
  237 |         const style = (selector: string) => {
  238 |           const node = element.querySelector(selector)!, box = node.getBoundingClientRect(), css = getComputedStyle(node);
  239 |           return {width: box.width, height: box.height, fontSize: css.fontSize, fontWeight: css.fontWeight, lineHeight: css.lineHeight};
  240 |         };
  241 |         return {viewport: innerWidth, width: rect.width, height: rect.height, right: rect.right,
  242 |           title: style('strong'), description: style('p'), action: style('button'), icon: style('.pi-sync')};
  243 |       });
  244 |       expect(sample.right).toBeLessThanOrEqual(sample.viewport);
  245 |       expect(sample.title).toMatchObject({fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
  246 |       expect(sample.description).toMatchObject({fontSize: '14px', fontWeight: '400', lineHeight: '20px'});
> 247 |       expect(sample.action).toMatchObject({width: 260, height: 48, fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
      |                             ^ Error: expect(received).toMatchObject(expected)
  248 |       expect(sample.icon).toMatchObject({width: 18, height: 18, fontSize: '18px'});
  249 |       if (sample.viewport === 600) expect(sample).toMatchObject({width: 568, height: 138});
  250 |       geometry.push(sample);
  251 |     };
  252 |     await expect(panel.getByRole('alert')).toContainText('Navigation preferences could not be loaded');
  253 |     await expect(panel.getByRole('button', {name: 'Retry', exact: true}).locator('.pi-sync')).toHaveCount(1);
  254 |     await measureFeedback();
  255 |     await page.setViewportSize({width: 320, height: 480}); await measureFeedback();
  256 |     await page.setViewportSize({width: 600, height: 900});
  257 |     await expect(choices).toHaveCount(7);
  258 |     for (const button of await choices.all()) await expect(button).toBeDisabled();
  259 |     await expect(bar).toHaveCount(0);
  260 |     await expectNoBlockingAxeViolations(page);
  261 |     await panel.screenshot({path: info.outputPath('navigation-read-error.png'), animations: 'disabled'});
  262 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  263 |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  264 |     const friends = panel.getByRole('button', {name: 'Friends', exact: true});
  265 |     await expect(friends).toBeEnabled(); await friends.press('Enter');
  266 |     await expect(panel.getByRole('alert')).toContainText('Navigation changes could not be saved');
  267 |     await expect(panel.getByRole('button', {name: 'Retry', exact: true}).locator('.pi-sync')).toHaveCount(1);
  268 |     await measureFeedback();
  269 |     await page.setViewportSize({width: 320, height: 480}); await measureFeedback();
  270 |     await page.setViewportSize({width: 600, height: 900});
  271 |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  272 |     await expect(friends).toHaveAttribute('aria-pressed', 'false');
  273 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History']);
  274 |     await expectNoBlockingAxeViolations(page);
  275 |     await panel.screenshot({path: info.outputPath('navigation-write-error.png'), animations: 'disabled'});
  276 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  277 |     await expect(friends).toBeEnabled();
  278 |     await expect(friends).toHaveAttribute('aria-pressed', 'true');
  279 |     await expect(count).toHaveText('4 of 5 shortcuts selected');
  280 |     await expect(panel.getByRole('alert')).toHaveCount(0);
  281 |     const faults = await page.evaluate(() => (window as unknown as {analytifyPreferenceFaults: {
  282 |       failedReads: number; failedWrites: number; writes: {key: string; value: unknown}[]
  283 |     }}).analytifyPreferenceFaults);
  284 |     expect(faults.failedReads).toBe(1); expect(faults.failedWrites).toBe(1);
  285 |     expect(faults.writes).toHaveLength(2); expect(faults.writes[1]).toEqual(faults.writes[0]);
  286 |     expect(faults.writes[1].value).toBe('["playlists","stats","history","friends"]');
  287 |     const saved = await page.evaluate(() => new Promise<{key: string; value: string}[]>((resolve, reject) => {
  288 |       const open = indexedDB.open('AnalytifyDB', 4);
  289 |       open.onerror = () => reject(open.error);
  290 |       open.onsuccess = () => {
  291 |         const db = open.result, entries: {key: string; value: string}[] = [];
  292 |         const tx = db.transaction(['appData', 'featureData'], 'readonly');
  293 |         for (const store of ['appData', 'featureData']) {
  294 |           const read = tx.objectStore(store).getAll();
  295 |           read.onsuccess = () => entries.push(...read.result.filter(item => item.key.startsWith('design-v2:mobile-shortcuts:')));
  296 |         }
  297 |         tx.onabort = () => {db.close(); reject(tx.error);};
  298 |         tx.oncomplete = () => {db.close(); resolve(entries);};
  299 |       };
  300 |     }));
  301 |     expect(saved).toEqual([faults.writes[1]]);
  302 |     await expectNativeTransitionsSettled(page);
  303 |     await writeFile(info.outputPath('navigation-recovery.json'), JSON.stringify({motion, geometry, faults, saved, unexpected, errors}, null, 2));
  304 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  305 |   });
  306 |   test(`Device shortcut limits, responsive geometry and five-choice persistence (${motion})`, async ({page}, info) => {
  307 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  308 |     await page.goto('/new/settings/navigation');
  309 |     const panel = page.locator('v2-settings-navigation-preferences');
  310 |     const choice = (name: string) => panel.getByRole('button', {name, exact: true});
  311 |     const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
  312 |     const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
  313 |     await expect(panel.getByRole('heading', {name: 'Bottom navigation'})).toBeVisible();
  314 |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  315 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History']);
  316 |     await choice('Friends').press('Enter');
  317 |     await expect(count).toHaveText('4 of 5 shortcuts selected');
  318 |     await expect(choice('Song Leagues')).toBeEnabled();
  319 |     await choice('Song Leagues').press('Enter');
  320 |     await expect(count).toHaveText('5 of 5 shortcuts selected');
  321 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']);
  322 |     await expect(bar.locator('a').filter({hasText: 'Friends'})).toHaveAttribute('href', '/new/friends');
  323 |     await expect(choice('Private Sharing')).toBeEnabled();
  324 |     await choice('Private Sharing').press('Enter');
  325 |     await expect(panel.getByText('Five shortcuts selected. Remove one before adding another.', {exact: true})).toBeVisible();
  326 |     await expect(choice('Private Sharing')).toHaveAttribute('aria-pressed', 'false');
  327 |     const geometry = [];
  328 |     for (const height of [480, 1000]) for (const width of [320, 390, 760, 768, 1440]) {
  329 |       await page.setViewportSize({width, height});
  330 |       const responsiveFrame = await navigationRenderState(page);
  331 |       const sample = await panel.evaluate(element => {
  332 |         const buttons = [...element.querySelectorAll<HTMLButtonElement>('.shortcut-choice')].map(button => {
  333 |           const rect = button.getBoundingClientRect(), css = getComputedStyle(button);
  334 |           const icon = button.querySelector('i')!, label = button.querySelector('span')!;
  335 |           return {label: label.textContent, left: rect.left, right: rect.right, height: rect.height, fontSize: css.fontSize,
  336 |             iconHeight: icon.getBoundingClientRect().height, labelHeight: label.getBoundingClientRect().height,
  337 |             padding: css.padding, gap: css.gap, lineHeight: css.lineHeight, width: rect.width,
  338 |             transition: css.transitionDuration, transitionProperty: css.transitionProperty};
  339 |         });
  340 |         const nav = document.querySelector('.v2-mobile-nav')!;
  341 |         const rect = nav.getBoundingClientRect();
  342 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, buttons,
  343 |           bar: {visible: getComputedStyle(nav).display !== 'none', left: rect.left, right: rect.right, bottom: rect.bottom,
  344 |             rows: new Set([...nav.querySelectorAll('a')].map(link => Math.round(link.getBoundingClientRect().top))).size}};
  345 |       });
  346 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  347 |       for (const button of sample.buttons) {
```