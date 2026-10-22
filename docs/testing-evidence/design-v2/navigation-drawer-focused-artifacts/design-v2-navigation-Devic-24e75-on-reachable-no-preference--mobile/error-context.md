# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-navigation.spec.ts >> Device shortcuts persist and keep navigation reachable (no-preference)
- Location: e2e/design-v2-navigation.spec.ts:127:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 0
Received: -131.00155639648438
```

# Page snapshot

```yaml
- generic [ref=f2e5]:
  - link [aria-hidden] [ref=f2e6] [cursor=pointer]:
    - /url: "#v2-main-content"
    - text: Skip to main content
  - banner [aria-hidden] [ref=f2e7]:
    - generic [ref=f2e8]:
      - text:   
      - generic [ref=f2e9]: Settings
      - generic [ref=f2e11]:
        - button [expanded] [ref=f2e12] [cursor=pointer]:
          - generic [aria-hidden] [ref=f2e13]: 
          - generic [ref=f2e14]: Menu
        - button [ref=f2e15] [cursor=pointer]:
          - generic [aria-hidden] [ref=f2e16]: 
  - main [aria-hidden] [ref=f2e17]:
    - generic [ref=f2e20]:
      - heading [level=1] [ref=f2e24]: Settings
      - navigation [ref=f2e27]:
        - link [ref=f2e28] [cursor=pointer]:
          - /url: /new/settings/account
          - generic [aria-hidden] [ref=f2e29]: 
          - generic [ref=f2e30]: Account
        - link [ref=f2e31] [cursor=pointer]:
          - /url: /new/settings/notifications
          - generic [aria-hidden] [ref=f2e32]: 
          - generic [ref=f2e33]: Alerts
        - link [ref=f2e34] [cursor=pointer]:
          - /url: /new/settings/updates
          - generic [aria-hidden] [ref=f2e35]: 
          - generic [ref=f2e36]: Updates
        - link [ref=f2e37] [cursor=pointer]:
          - /url: /new/settings/data
          - generic [aria-hidden] [ref=f2e38]: 
          - generic [ref=f2e39]: Data
        - link [ref=f2e40] [cursor=pointer]:
          - /url: /new/settings/navigation
          - generic [aria-hidden] [ref=f2e41]: 
          - generic [ref=f2e42]: Navigation
      - region [ref=f2e45]:
        - heading [level=2] [ref=f2e46]: Bottom navigation
        - paragraph [ref=f2e47]: Choose up to five shortcuts. Choose none to hide the bar. Changes apply immediately; the Menu button always stays available.
        - status [ref=f2e48]: 0 of 5 shortcuts selected
        - generic [ref=f2e49]:
          - button [ref=f2e51] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e52]: 
            - generic [ref=f2e53]: Playlists
          - button [ref=f2e55] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e56]: 
            - generic [ref=f2e57]: Stats
          - button [ref=f2e59] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e60]: 
            - generic [ref=f2e61]: History
          - button [ref=f2e63] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e64]: 
            - generic [ref=f2e65]: Friends
          - button [ref=f2e67] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e68]: 
            - generic [ref=f2e69]: Song Leagues
          - button [ref=f2e71] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e72]: 
            - generic [ref=f2e73]: Private Sharing
          - button [ref=f2e75] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e76]: 
            - generic [ref=f2e77]: Compare
  - contentinfo [aria-hidden] [ref=f2e78]:
    - generic [ref=f2e79]: Powered by Spotify
    - generic [ref=f2e80]: Artwork and metadata belong to their owners.
    - link [ref=f2e81] [cursor=pointer]:
      - /url: /new/legal
      - text: Legal & privacy
  - generic [ref=f2e83]:
    - button [aria-hidden] [ref=f2e84] [cursor=pointer]
    - dialog "Navigation menu" [ref=f2e85]:
      - button "Close navigation menu" [active] [ref=f2e86] [cursor=pointer]:
        - generic [ref=f2e87]: Analytify
      - navigation "All destinations" [ref=f2e88]:
        - generic [ref=f2e89]:
          - paragraph [ref=f2e90]: Library
          - link "Playlists" [ref=f2e91] [cursor=pointer]:
            - /url: /new/playlists
            - generic [aria-hidden] [ref=f2e92]: 
        - generic [ref=f2e94]:
          - paragraph [ref=f2e95]: Listening
          - link "Stats" [ref=f2e96] [cursor=pointer]:
            - /url: /new/stats
            - generic [aria-hidden] [ref=f2e97]: 
          - link "History" [ref=f2e99] [cursor=pointer]:
            - /url: /new/history
            - generic [aria-hidden] [ref=f2e100]: 
        - generic [ref=f2e102]:
          - paragraph [ref=f2e103]: Social
          - link "Friends" [ref=f2e104] [cursor=pointer]:
            - /url: /new/friends
            - generic [aria-hidden] [ref=f2e105]: 
          - link "Song Leagues" [ref=f2e107] [cursor=pointer]:
            - /url: /new/song-league
            - generic [aria-hidden] [ref=f2e108]: 
          - link "Private Sharing" [ref=f2e110] [cursor=pointer]:
            - /url: /new/shared-playlists
            - generic [aria-hidden] [ref=f2e111]: 
        - generic [ref=f2e113]:
          - paragraph [ref=f2e114]: Tools
          - link "Compare playlists" [ref=f2e115] [cursor=pointer]:
            - /url: /new/compare-room
            - generic [aria-hidden] [ref=f2e116]: 
      - link "Settings" [ref=f2e118] [cursor=pointer]:
        - /url: /new/settings/account
        - generic [ref=f2e120]: B
        - generic [ref=f2e121]:
          - strong [ref=f2e122]: Browser test user
          - generic [ref=f2e123]: Settings
```

# Test source

```ts
  109 |       const open = indexedDB.open('AnalytifyDB', 4);
  110 |       open.onerror = () => reject(open.error);
  111 |       open.onsuccess = () => {
  112 |         const db = open.result, entries: {key: string; value: string}[] = [];
  113 |         const tx = db.transaction(['appData', 'featureData'], 'readonly');
  114 |         for (const store of ['appData', 'featureData']) {
  115 |           const read = tx.objectStore(store).getAll();
  116 |           read.onsuccess = () => entries.push(...read.result.filter(item => item.key.startsWith('design-v2:mobile-shortcuts:')));
  117 |         }
  118 |         tx.onabort = () => {db.close(); reject(tx.error);};
  119 |         tx.oncomplete = () => {db.close(); resolve(entries);};
  120 |       };
  121 |     }));
  122 |     expect(saved).toEqual([faults.writes[1]]);
  123 |     await expectNativeTransitionsSettled(page);
  124 |     await writeFile(info.outputPath('navigation-recovery.json'), JSON.stringify({motion, geometry, faults, saved, unexpected, errors}, null, 2));
  125 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  126 |   });
  127 |   test(`Device shortcuts persist and keep navigation reachable (${motion})`, async ({page}, info) => {
  128 |     const {unexpected, errors} = await prepareNavigation(page, motion);
  129 |     await page.goto('/new/settings/navigation');
  130 |     const panel = page.locator('v2-settings-navigation-preferences');
  131 |     const choice = (name: string) => panel.getByRole('button', {name, exact: true});
  132 |     const count = panel.getByRole('status').filter({hasText: /^\d of 5 shortcuts selected$/});
  133 |     const bar = page.getByRole('navigation', {name: 'Primary navigation', exact: true, includeHidden: true});
  134 |     await expect(panel.getByRole('heading', {name: 'Bottom navigation'})).toBeVisible();
  135 |     await expect(count).toHaveText('3 of 5 shortcuts selected');
  136 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History']);
  137 |     await choice('Friends').press('Enter');
  138 |     await expect(count).toHaveText('4 of 5 shortcuts selected');
  139 |     await expect(choice('Song Leagues')).toBeEnabled();
  140 |     await choice('Song Leagues').press('Enter');
  141 |     await expect(count).toHaveText('5 of 5 shortcuts selected');
  142 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']);
  143 |     await expect(bar.locator('a').filter({hasText: 'Friends'})).toHaveAttribute('href', '/new/friends');
  144 |     await expect(choice('Private Sharing')).toBeEnabled();
  145 |     await choice('Private Sharing').press('Enter');
  146 |     await expect(panel.getByText('Five shortcuts selected. Remove one before adding another.', {exact: true})).toBeVisible();
  147 |     await expect(choice('Private Sharing')).toHaveAttribute('aria-pressed', 'false');
  148 |     const geometry = [];
  149 |     for (const height of [480, 1000]) for (const width of [320, 390, 760, 768, 1440]) {
  150 |       await page.setViewportSize({width, height});
  151 |       const sample = await panel.evaluate(element => {
  152 |         const buttons = [...element.querySelectorAll<HTMLButtonElement>('.shortcut-choice')].map(button => {
  153 |           const rect = button.getBoundingClientRect(), css = getComputedStyle(button);
  154 |           return {left: rect.left, right: rect.right, height: rect.height, fontSize: css.fontSize, transition: css.transitionDuration, transitionProperty: css.transitionProperty};
  155 |         });
  156 |         const nav = document.querySelector('.v2-mobile-nav')!;
  157 |         const rect = nav.getBoundingClientRect();
  158 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, buttons,
  159 |           bar: {visible: getComputedStyle(nav).display !== 'none', left: rect.left, right: rect.right, bottom: rect.bottom,
  160 |             rows: new Set([...nav.querySelectorAll('a')].map(link => Math.round(link.getBoundingClientRect().top))).size}};
  161 |       });
  162 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  163 |       for (const button of sample.buttons) {
  164 |         expect(button.left).toBeGreaterThanOrEqual(0); expect(button.right).toBeLessThanOrEqual(width);
  165 |         expect(button.height).toBe(48); expect(button.fontSize).toBe('12px');
  166 |         if (motion === 'reduce') expect(button.transitionProperty).toBe('none');
  167 |       }
  168 |       expect(sample.bar.visible).toBe(width <= 760);
  169 |       if (sample.bar.visible) {
  170 |         await expect(bar.getByRole('link', {name: 'Friends', exact: true})).toBeVisible();
  171 |         expect(sample.bar.rows).toBe(1); expect(sample.bar.left).toBeGreaterThanOrEqual(0);
  172 |         expect(sample.bar.right).toBeLessThanOrEqual(width); expect(sample.bar.bottom).toBeLessThanOrEqual(height);
  173 |       }
  174 |       geometry.push(sample);
  175 |     }
  176 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  177 |     await expectNoBlockingAxeViolations(page);
  178 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues']) {
  179 |       await choice(label).press('Enter');
  180 |       await expect(choice(label)).toHaveAttribute('aria-pressed', 'false');
  181 |       await expect(choice(label)).toBeEnabled();
  182 |     }
  183 |     await expect(count).toHaveText('0 of 5 shortcuts selected');
  184 |     await expect(bar).toHaveCount(0);
  185 |     await page.reload();
  186 |     await expect(count).toHaveText('0 of 5 shortcuts selected');
  187 |     await expect(bar).toHaveCount(0);
  188 |     const menu = page.getByRole('button', {name: 'Open navigation menu', exact: true});
  189 |     await menu.press('Enter');
  190 |     const dialog = page.getByRole('dialog', {name: 'Navigation menu', exact: true});
  191 |     await expect(dialog).toBeVisible();
  192 |     for (const label of ['Playlists', 'Stats', 'History', 'Friends', 'Song Leagues', 'Private Sharing', 'Compare playlists', 'Settings']) {
  193 |       await expect(dialog.getByRole('link', {name: label, exact: true})).toHaveCount(1);
  194 |     }
  195 |     const drawerGeometry = [];
  196 |     for (const width of [320, 390, 600, 768, 1024, 1440]) {
  197 |       for (const height of [480, 900]) {
  198 |         await page.setViewportSize({width, height});
  199 |         const sample = await dialog.evaluate(element => {
  200 |           const box = element.getBoundingClientRect();
  201 |           const profile = element.querySelector('.drawer-profile')!.getBoundingClientRect();
  202 |           const groups = element.querySelector('.navigation-groups')!;
  203 |           return {width: innerWidth, height: innerHeight, x: box.x, y: box.y, drawerWidth: box.width,
  204 |             drawerHeight: box.height, profileBottom: profile.bottom, profileHeight: profile.height,
  205 |             listBottom: groups.getBoundingClientRect().bottom, listHeight: groups.clientHeight,
  206 |             listScroll: groups.scrollHeight, overflow: getComputedStyle(groups).overflowY,
  207 |             animation: getComputedStyle(element).animationName};
  208 |         });
> 209 |         expect(sample.x).toBe(0); expect(sample.y).toBe(0);
      |                          ^ Error: expect(received).toBe(expected) // Object.is equality
  210 |         expect(sample.drawerWidth).toBe(Math.min(width, 320)); expect(sample.drawerHeight).toBe(height);
  211 |         expect(sample.profileBottom).toBe(height - 17); expect(sample.profileHeight).toBe(72);
  212 |         expect(sample.listBottom).toBeLessThanOrEqual(sample.profileBottom - 72 - 16);
  213 |         expect(sample.overflow).toBe('auto');
  214 |         if (height === 480) expect(sample.listScroll).toBeGreaterThan(sample.listHeight);
  215 |         if (motion === 'reduce') expect(sample.animation).toBe('none');
  216 |         drawerGeometry.push(sample);
  217 |       }
  218 |     }
  219 |     await page.setViewportSize({width: 390, height: 900});
  220 |     await dialog.getByRole('link', {name: 'Settings', exact: true}).focus();
  221 |     await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', {name: 'Close navigation menu', exact: true})).toBeFocused();
  222 |     await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('link', {name: 'Settings', exact: true})).toBeFocused();
  223 |     await expectNoBlockingAxeViolations(page);
  224 |     await dialog.screenshot({path: info.outputPath('navigation-drawer.png'), animations: 'disabled'});
  225 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(menu).toBeFocused();
  226 |     await choice('Friends').press('Enter');
  227 |     await expect(count).toHaveText('1 of 5 shortcuts selected');
  228 |     await expect(choice('Friends')).toBeEnabled();
  229 |     await expect(panel.getByText('Saving navigation preferences', {exact: true})).toHaveCount(0);
  230 |     await page.reload();
  231 |     await expect(count).toHaveText('1 of 5 shortcuts selected');
  232 |     await expect(bar.getByRole('link', {includeHidden: true})).toHaveText(['Friends']);
  233 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  234 |     await page.evaluate(() => document.fonts.ready);
  235 |     await panel.screenshot({path: info.outputPath('navigation-selected.png'), animations: 'disabled'});
  236 |     await writeFile(info.outputPath('navigation-native.json'), JSON.stringify({motion, geometry, drawerGeometry, unexpected, errors}, null, 2));
  237 |     expect(unexpected).toEqual([]); expect(errors).toEqual([]);
  238 |   });
  239 | }
  240 | 
```