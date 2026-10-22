# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Device shortcuts persist and keep navigation reachable (reduce)
- Location: e2e/design-v2-navigation.spec.ts:188:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 48
Received: 64
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link "Skip to main content" [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - text:       
  - banner [ref=f1e7]:
    - generic [ref=f1e8]:
      - text:   
      - generic [ref=f1e9]: Settings
      - generic [ref=f1e11]:
        - button "Open navigation menu" [ref=f1e12] [cursor=pointer]:
          - generic [aria-hidden] [ref=f1e13]: 
          - generic [ref=f1e14]: Menu
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
          - status [ref=f1e48]: 5 of 5 shortcuts selected
          - status [ref=f1e49]: Five shortcuts selected. Remove one before adding another.
          - generic "Bottom navigation shortcuts" [ref=f1e50]:
            - button "Playlists" [pressed] [ref=f1e52] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e53]: 
            - button "Stats" [pressed] [ref=f1e56] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e57]: 
            - button "History" [pressed] [ref=f1e60] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e61]: 
            - button "Friends" [pressed] [ref=f1e64] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e65]: 
            - button "Song Leagues" [pressed] [ref=f1e68] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e69]: 
            - button "Private Sharing" [active] [ref=f1e72] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e73]: 
            - button "Compare" [ref=f1e76] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e77]: 
  - navigation "Primary navigation" [ref=f1e79]:
    - link "Playlists" [ref=f1e80] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e81]: 
    - link "Stats" [ref=f1e83] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e84]: 
    - link "History" [ref=f1e86] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e87]: 
    - link "Friends" [ref=f1e89] [cursor=pointer]:
      - /url: /new/friends
      - generic [aria-hidden] [ref=f1e90]: 
    - link "Song Leagues" [ref=f1e92] [cursor=pointer]:
      - /url: /new/song-league
      - generic [aria-hidden] [ref=f1e93]: 
  - contentinfo [ref=f1e95]:
    - generic [ref=f1e96]: Powered by Spotify
    - generic [ref=f1e97]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e98] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
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
  156 |     await expectNoBlockingAxeViolations(page);
  157 |     await panel.screenshot({path: info.outputPath('navigation-write-error.png'), animations: 'disabled'});
  158 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  159 |     await expect(friends).toBeEnabled();
  160 |     await expect(friends).toHaveAttribute('aria-pressed', 'true');
  161 |     await expect(count).toHaveText('4 of 5 shortcuts selected');
  162 |     await expect(panel.getByRole('alert')).toHaveCount(0);
  163 |     const faults = await page.evaluate(() => (window as unknown as {analytifyPreferenceFaults: {
  164 |       failedReads: number; failedWrites: number; writes: {key: string; value: unknown}[]
  165 |     }}).analytifyPreferenceFaults);
  166 |     expect(faults.failedReads).toBe(1); expect(faults.failedWrites).toBe(1);
  167 |     expect(faults.writes).toHaveLength(2); expect(faults.writes[1]).toEqual(faults.writes[0]);
  168 |     expect(faults.writes[1].value).toBe('["playlists","stats","history","friends"]');
  169 |     const saved = await page.evaluate(() => new Promise<{key: string; value: string}[]>((resolve, reject) => {
  170 |       const open = indexedDB.open('AnalytifyDB', 4);
  171 |       open.onerror = () => reject(open.error);
  172 |       open.onsuccess = () => {
  173 |         const db = open.result, entries: {key: string; value: string}[] = [];
  174 |         const tx = db.transaction(['appData', 'featureData'], 'readonly');
  175 |         for (const store of ['appData', 'featureData']) {
  176 |           const read = tx.objectStore(store).getAll();
  177 |           read.onsuccess = () => entries.push(...read.result.filter(item => item.key.startsWith('design-v2:mobile-shortcuts:')));
  178 |         }
  179 |         tx.onabort = () => {db.close(); reject(tx.error);};
  180 |         tx.oncomplete = () => {db.close(); resolve(entries);};
  181 |       };
  182 |     }));
  183 |     expect(saved).toEqual([faults.writes[1]]);
  184 |     await expectNativeTransitionsSettled(page);
  185 |     await writeFile(info.outputPath('navigation-recovery.json'), JSON.stringify({motion, geometry, faults, saved, unexpected, errors}, null, 2));
  186 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  187 |   });
  188 |   test(`Device shortcuts persist and keep navigation reachable (${motion})`, async ({page}, info) => {
  189 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  190 |     await page.goto('/new/settings/navigation');
  191 |     const panel = page.locator('v2-settings-navigation-preferences');
  192 |     const choice = (name: string) => panel.getByRole('button', {name, exact: true});
  193 |     const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
  194 |     const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
  195 |     await expect(panel.getByRole('heading', {name: 'Bottom navigation'})).toBeVisible();
  196 |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  197 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History']);
  198 |     await choice('Friends').press('Enter');
  199 |     await expect(count).toHaveText('4 of 5 shortcuts selected');
  200 |     await expect(choice('Song Leagues')).toBeEnabled();
  201 |     await choice('Song Leagues').press('Enter');
  202 |     await expect(count).toHaveText('5 of 5 shortcuts selected');
  203 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']);
  204 |     await expect(bar.locator('a').filter({hasText: 'Friends'})).toHaveAttribute('href', '/new/friends');
  205 |     await expect(choice('Private Sharing')).toBeEnabled();
  206 |     await choice('Private Sharing').press('Enter');
  207 |     await expect(panel.getByText('Five shortcuts selected. Remove one before adding another.', {exact: true})).toBeVisible();
  208 |     await expect(choice('Private Sharing')).toHaveAttribute('aria-pressed', 'false');
  209 |     const geometry = [];
  210 |     for (const height of [480, 1000]) for (const width of [320, 390, 760, 768, 1440]) {
  211 |       await page.setViewportSize({width, height});
  212 |       const sample = await panel.evaluate(element => {
  213 |         const buttons = [...element.querySelectorAll<HTMLButtonElement>('.shortcut-choice')].map(button => {
  214 |           const rect = button.getBoundingClientRect(), css = getComputedStyle(button);
  215 |           return {left: rect.left, right: rect.right, height: rect.height, fontSize: css.fontSize, transition: css.transitionDuration, transitionProperty: css.transitionProperty};
  216 |         });
  217 |         const nav = document.querySelector('.v2-mobile-nav')!;
  218 |         const rect = nav.getBoundingClientRect();
  219 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, buttons,
  220 |           bar: {visible: getComputedStyle(nav).display !== 'none', left: rect.left, right: rect.right, bottom: rect.bottom,
  221 |             rows: new Set([...nav.querySelectorAll('a')].map(link => Math.round(link.getBoundingClientRect().top))).size}};
  222 |       });
  223 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  224 |       for (const button of sample.buttons) {
  225 |         expect(button.left).toBeGreaterThanOrEqual(0); expect(button.right).toBeLessThanOrEqual(width);
> 226 |         expect(button.height).toBe(48); expect(button.fontSize).toBe('12px');
      |                               ^ Error: expect(received).toBe(expected) // Object.is equality
  227 |         if (motion === 'reduce') expect(button.transitionProperty).toBe('none');
  228 |       }
  229 |       expect(sample.bar.visible).toBe(width <= 760);
  230 |       if (sample.bar.visible) {
  231 |         await expect(bar.getByRole('link', {name: 'Friends', exact: true})).toBeVisible();
  232 |         expect(sample.bar.rows).toBe(1); expect(sample.bar.left).toBeGreaterThanOrEqual(0);
  233 |         expect(sample.bar.right).toBeLessThanOrEqual(width); expect(sample.bar.bottom).toBeLessThanOrEqual(height);
  234 |       }
  235 |       geometry.push(sample);
  236 |     }
  237 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  238 |     await expectNoBlockingAxeViolations(page);
  239 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']) {
  240 |       await choice(label).press('Enter');
  241 |       await expect(choice(label)).toHaveAttribute('aria-pressed', 'false');
  242 |       await expect(choice(label)).toBeEnabled();
  243 |     }
  244 |     await expect(count).toHaveText('0 of 5 shortcuts selected');
  245 |     await expect(bar).toHaveCount(0);
  246 |     await page.reload();
  247 |     await expect(count).toHaveText('0 of 5 shortcuts selected');
  248 |     await expect(bar).toHaveCount(0);
  249 |     const menu = page.getByRole('button', {name: 'Open navigation menu', exact: true});
  250 |     await menu.press('Enter');
  251 |     const dialog = page.getByRole('dialog', {name: 'Navigation menu', exact: true});
  252 |     await expect(dialog).toBeVisible();
  253 |     await dialog.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
  254 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists', 'Settings']) {
  255 |       await expect(dialog.getByRole('link', {name: label, exact: true})).toHaveCount(1);
  256 |     }
  257 |     const drawerGeometry = [];
  258 |     for (const width of [320, 390, 600, 768, 1024, 1440]) {
  259 |       for (const height of [480, 900]) {
  260 |         await page.setViewportSize({width, height});
  261 |         const sample = await dialog.evaluate(element => {
  262 |           const box = element.getBoundingClientRect();
  263 |           const profile = element.querySelector('.drawer-profile')!.getBoundingClientRect();
  264 |           const groups = element.querySelector('.navigation-groups')!;
  265 |           return {width: innerWidth, height: innerHeight, x: box.x, y: box.y, drawerWidth: box.width,
  266 |             drawerHeight: box.height, profileBottom: profile.bottom, profileHeight: profile.height,
  267 |             listBottom: groups.getBoundingClientRect().bottom, listHeight: groups.clientHeight,
  268 |             listScroll: groups.scrollHeight, overflow: getComputedStyle(groups).overflowY,
  269 |             animation: getComputedStyle(element).animationName};
  270 |         });
  271 |         expect(sample.x).toBe(0); expect(sample.y).toBe(0);
  272 |         expect(sample.drawerWidth).toBe(Math.min(width, 320)); expect(sample.drawerHeight).toBe(height);
  273 |         expect(sample.profileBottom).toBe(height - 17); expect(sample.profileHeight).toBe(72);
  274 |         expect(sample.listBottom).toBeLessThanOrEqual(sample.profileBottom - 72 - 16);
  275 |         expect(sample.overflow).toBe('auto');
  276 |         if (height === 480) expect(sample.listScroll).toBeGreaterThan(sample.listHeight);
  277 |         if (motion === 'reduce') expect(sample.animation).toBe('none');
  278 |         drawerGeometry.push(sample);
  279 |       }
  280 |     }
  281 |     await page.setViewportSize({width: 390, height: 900});
  282 |     await dialog.getByRole('link', {name: 'Settings', exact: true}).focus();
  283 |     await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', {name: 'Close navigation menu', exact: true})).toBeFocused();
  284 |     await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('link', {name: 'Settings', exact: true})).toBeFocused();
  285 |     await expectNoBlockingAxeViolations(page);
  286 |     await dialog.screenshot({path: info.outputPath('navigation-drawer.png'), animations: 'disabled'});
  287 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(menu).toBeFocused();
  288 |     await choice('Friends').press('Enter');
  289 |     await expect(count).toHaveText('1 of 5 shortcuts selected');
  290 |     await expect(choice('Friends')).toBeEnabled();
  291 |     await expect(panel.getByText('Saving navigation preferences', {exact: true})).toHaveCount(0);
  292 |     await page.reload();
  293 |     await expect(count).toHaveText('1 of 5 shortcuts selected');
  294 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Friends']);
  295 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  296 |     await page.evaluate(() => document.fonts.ready);
  297 |     await panel.screenshot({path: info.outputPath('navigation-selected.png'), animations: 'disabled'});
  298 |     await writeFile(info.outputPath('navigation-native.json'), JSON.stringify({motion, geometry, drawerGeometry, unexpected, errors}, null, 2));
  299 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  300 |   });
  301 | }
  302 | 
```