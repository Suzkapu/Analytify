# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends secondary content has deterministic canonical visual candidates
- Location: e2e/design-v2-friends.spec.ts:181:5

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('v2-friends-page')
  5916 pixels (ratio 0.02 of all image pixels) are different.

  Snapshot: friends-invitations-desktop.png

Call log:
  - Expect "toHaveScreenshot(friends-invitations-desktop.png)" locator('v2-friends-page') with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('v2-friends-page')
    - locator resolved to <v2-friends-page _nghost-ng-c798132010="">…</v2-friends-page>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 5916 pixels (ratio 0.02 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('v2-friends-page')
    - locator resolved to <v2-friends-page _nghost-ng-c798132010="">…</v2-friends-page>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - 5916 pixels (ratio 0.02 of all image pixels) are different.

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
  - main "Friend invitations content" [active] [ref=f1e48]:
    - generic [ref=f1e52]:
      - generic [ref=f1e54]:
        - generic [ref=f1e55]:
          - heading "Friend invitations" [level=1] [ref=f1e56]
          - button "Back" [ref=f1e57] [cursor=pointer]
        - paragraph [ref=f1e58]: Manage pending invitations. Revoking one disables both its link and QR code.
      - generic [ref=f1e59]:
        - navigation "Friends navigation" [ref=f1e60]:
          - link "Friends" [ref=f1e61] [cursor=pointer]:
            - /url: /new/friends
          - link "Invitations" [ref=f1e63] [cursor=pointer]:
            - /url: /new/friends/invitations
        - link "Add friend" [ref=f1e65] [cursor=pointer]:
          - /url: /new/friends/add
        - generic [ref=f1e67]:
          - heading "Your friend invitation" [level=2] [ref=f1e68]
          - paragraph [ref=f1e69]: Link + QR · One person · Pending
          - generic [ref=f1e70]:
            - link "View link & QR" [ref=f1e71] [cursor=pointer]:
              - /url: /new/friends/add
            - button "Revoke" [ref=f1e73] [cursor=pointer]
        - paragraph [ref=f1e75]: Revoking an invitation does not remove existing friends.
  - text:   
  - contentinfo [ref=f1e76]:
    - generic [ref=f1e77]: Powered by Spotify
    - generic [ref=f1e78]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e79] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  113 |   const readyPlus = await glyphPaint('.add-friend .plus');
  114 |   await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  115 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  116 |   const addPeople = await glyphPaint('.friends-tabs .people');
  117 |   const addPlus = await glyphPaint('.add-friend .plus');
  118 |   const paints = {readyPeople, readyPlus, addPeople, addPlus};
  119 |   await writeFile(info.outputPath('friends-icon-paints.json'), JSON.stringify(paints, null, 2));
  120 |   expect(paints).toEqual({readyPeople: 'rgb(6, 19, 11)', readyPlus: 'rgb(162, 173, 166)', addPeople: 'rgb(162, 173, 166)', addPlus: 'rgb(162, 173, 166)'});
  121 |   expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(1);
  122 |   expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  123 | });
  124 | 
  125 | test('Friends ready content preserves canonical card geometry during resizing', async ({page}, info) => {
  126 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce', undefined, ['Suzkapu', 'Daniel_P', 'Alex']);
  127 |   await expect(panel.locator('.friend-row')).toHaveCount(3);
  128 |   await expectNativeTransitionsSettled(page);
  129 |   const envelope = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-row-current-canonical.json', 'utf8'));
  130 |   const canonical = JSON.parse(envelope.content.find((item: {type: string}) => item.type === 'text').text);
  131 |   const pointerCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-touch-canonical.json', 'utf8'));
  132 |   const tabCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-parity-ready-tab-sizing.json', 'utf8'));
  133 |   const samples = [];
  134 |   for (const width of [1440, 390, 320]) for (const height of [480, 1000]) {
  135 |     await page.setViewportSize({width, height});
  136 |     const sample = await panel.evaluate(element => ({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  137 |       coarsePointer: matchMedia('(pointer: coarse)').matches,
  138 |       tabs: [...element.querySelectorAll<HTMLElement>('.friends-tabs a')].map(tab => ({width: tab.getBoundingClientRect().width,
  139 |         height: tab.getBoundingClientRect().height, paddingLeft: parseFloat(getComputedStyle(tab).paddingLeft)})),
  140 |       rows: [...element.querySelectorAll('.friend-row')].map(row => {
  141 |         const bounds = row.getBoundingClientRect();
  142 |         const action = row.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
  143 |         const actionBounds = action.getBoundingClientRect();
  144 |         return {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
  145 |           action: {width: actionBounds.width, height: actionBounds.height, borderColor: getComputedStyle(action).borderColor}};
  146 |       })}));
  147 |     samples.push(sample);
  148 |   }
  149 |   for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
  150 |     await page.setViewportSize(viewport);
  151 |     await page.evaluate(() => document.fonts.ready);
  152 |     await panel.screenshot({path: info.outputPath(`candidate-friends-ready-${name}.png`), animations: 'disabled', scale: 'css'});
  153 |     await expect(panel).toHaveScreenshot(`friends-ready-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  154 |   }
  155 |   await writeFile(info.outputPath('friends-ready-geometry.json'), JSON.stringify({canonical, pointerVariants: pointerCanonical.variants, samples}, null, 2));
  156 |   for (const sample of samples) {
  157 |     const reference = canonical.find((item: {viewport: string}) => item.viewport === (sample.width <= 760 ? 'mobile' : 'desktop'));
  158 |     const pointerReference = pointerCanonical.variants.find((item: {variants: {State: string; Pointer: string}}) =>
  159 |       item.variants.State === 'Default' && item.variants.Pointer === (sample.coarsePointer ? 'Coarse' : 'Fine'));
  160 |     expect(sample.scrollWidth).toBeLessThanOrEqual(sample.width);
  161 |     const tabReference = sample.width === 1440 ? tabCanonical.desktop : tabCanonical.mobile;
  162 |     for (const [index, tab] of sample.tabs.entries()) {
  163 |       expect(tab.height).toBe(tabReference.children[index].height);
  164 |       expect(tab.paddingLeft).toBe(tabReference.children[index].paddingLeft);
  165 |       const expectedWidth = tabReference.children[index].width - (sample.width === 320 ? 35 : 0);
  166 |       expect(tab.width).toBe(expectedWidth);
  167 |     }
  168 |     for (const [index, row] of sample.rows.entries()) {
  169 |       expect(row.height).toBe(pointerReference.height);
  170 |       expect(row.action.width).toBe(pointerReference.action[0].width);
  171 |       expect(row.action.height).toBe(pointerReference.action[0].height);
  172 |       expect(row.action.borderColor).toBe('rgb(107, 125, 113)');
  173 |       expect(row.width).toBe(sample.width === 320 ? 288 : reference.rows[0].width);
  174 |       if (index) expect(row.y - sample.rows[index - 1].y - sample.rows[index - 1].height).toBe(reference.gap);
  175 |     }
  176 |   }
  177 |   await expectNoBlockingAxeViolations(page);
  178 |   expect(writes).toEqual([]); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  179 | });
  180 | 
  181 | test('Friends secondary content has deterministic canonical visual candidates', async ({page}, info) => {
  182 |   await page.addInitScript(() => {
  183 |     const original = crypto.getRandomValues.bind(crypto);
  184 |     let sequence = 0;
  185 |     Object.defineProperty(crypto, 'getRandomValues', {value: (array: Uint8Array) => {
  186 |       if (!(array instanceof Uint8Array) || array.length !== 32) return original(array);
  187 |       sequence++;
  188 |       array.forEach((_, index) => {array[index] = (sequence * 37 + index) % 256;});
  189 |       return array;
  190 |     }});
  191 |   });
  192 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce');
  193 |   const controls = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-controls-canonical.json', 'utf8'));
  194 |   const frameIds: Record<string, readonly string[]> = {add: ['192:11619', '192:11744'], invitations: ['192:11835', '192:11960'], review: ['192:12051', '192:12176']};
  195 |   const capture = async (state: string) => {
  196 |     await expectNativeTransitionsSettled(page);
  197 |     await page.evaluate(() => document.fonts.ready);
  198 |     for (const [name, viewport] of [['desktop', {width: 1440, height: 1000}], ['mobile', {width: 390, height: 1000}]] as const) {
  199 |       await page.setViewportSize(viewport);
  200 |       await page.mouse.move(0, 0);
  201 |       const reference = controls.screens.find((screen: {id: string}) => screen.id === frameIds[state][name === 'desktop' ? 0 : 1]);
  202 |       const tabs = await panel.locator('.friends-tabs a').evaluateAll(elements => elements.map(element => ({width: element.getBoundingClientRect().width,
  203 |         paddingLeft: parseFloat(getComputedStyle(element).paddingLeft)})));
  204 |       expect.soft(tabs).toEqual(reference.children.map((child: {width: number; paddingLeft: number}) => ({width: child.width, paddingLeft: child.paddingLeft})));
  205 |       if (state === 'invitations') {
  206 |         const revoke = panel.getByRole('button', {name: 'Revoke', exact: true});
  207 |         await expect.soft(revoke).toHaveCSS('background-color', 'rgb(24, 32, 25)');
  208 |         await expect.soft(revoke).toHaveCSS('border-color', 'rgb(255, 116, 125)');
  209 |       }
  210 |       await expectNoBlockingAxeViolations(page);
  211 |       expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  212 |       await panel.screenshot({path: info.outputPath(`candidate-friends-${state}-${name}.png`), animations: 'disabled', scale: 'css'});
> 213 |       await expect(panel).toHaveScreenshot(`friends-${state}-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
      |                           ^ Error: expect(locator).toHaveScreenshot(expected) failed
  214 |     }
  215 |   };
  216 |   await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  217 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  218 |   await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  219 |   await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  220 |   await panel.getByRole('button', {name: 'Create new invitation', exact: true}).click();
  221 |   await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  222 |   await capture('add');
  223 |   await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  224 |   await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  225 |   await capture('invitations');
  226 |   await page.goto('/new/friends/invite/' + 'b'.repeat(64));
  227 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  228 |   await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  229 |   await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  230 |   await capture('review');
  231 |   expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  232 |   expect(writes.filter(write => write.name === 'respond_friend_request')).toEqual([]);
  233 |   expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  234 | });
  235 | 
  236 | test('Friends invitation navigation recovers during immediate viewport resizing', async ({page}, info) => {
  237 |   await page.setViewportSize({width: 1920, height: 1000});
  238 |   const {panel, unexpected, runtimeErrors} = await setupFriends(page, 'no-preference');
  239 |   try {
  240 |     await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  241 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  242 |     await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  243 |     await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  244 |     await panel.getByRole('button', {name: 'Create new invitation', exact: true}).click();
  245 |     await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  246 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  247 |     await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  248 |     await page.setViewportSize({width: 1440, height: 900});
  249 |     await page.setViewportSize({width: 390, height: 900});
  250 |     await expectNativeTransitionsSettled(page);
  251 |     await panel.getByRole('link', {name: 'View link & QR'}).click();
  252 |     await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  253 |     await expectNativeTransitionsSettled(page);
  254 |     expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  255 |   } finally {
  256 |     const probe = await page.evaluate(() => (window as unknown as {analytifyNativeTransitionProbe: unknown}).analytifyNativeTransitionProbe);
  257 |     await writeFile(info.outputPath('friends-resize-transition-probe.json'), JSON.stringify(probe, null, 2));
  258 |   }
  259 | });
  260 | 
  261 | test('Friends empty content preserves canonical geometry and starts only an explicit invitation', async ({page}, info) => {
  262 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce', undefined, []);
  263 |   const card = panel.locator('.empty-friends');
  264 |   const action = card.getByRole('link', {name: 'Add your first friend', exact: true});
  265 |   await expect(card.getByRole('heading', {name: 'Your friends will appear here.', exact: true})).toBeVisible();
  266 |   await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toBeVisible();
  267 |   const samples = [];
  268 |   for (const width of [1440, 390, 320]) for (const height of [480, 1000]) {
  269 |     await page.setViewportSize({width, height});
  270 |     await action.scrollIntoViewIfNeeded();
  271 |     const sample = await card.evaluate(element => {
  272 |       const bounds = element.getBoundingClientRect(), action = element.querySelector('a')!, button = action.getBoundingClientRect();
  273 |       const heading = getComputedStyle(element.querySelector('h2')!);
  274 |       return {viewportWidth: innerWidth, viewportHeight: innerHeight, width: bounds.width, height: bounds.height,
  275 |         actionWidth: button.width, actionHeight: button.height, fontSize: heading.fontSize, lineHeight: heading.lineHeight,
  276 |         reachable: document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2)?.closest('a') === action,
  277 |         scrollWidth: document.documentElement.scrollWidth};
  278 |     });
  279 |     expect(sample.width).toBe(width === 1440 ? 1120 : width - 32);
  280 |     expect(sample.height).toBeGreaterThanOrEqual(122);
  281 |     if (width !== 320) expect(sample.height).toBe(122);
  282 |     expect(sample.actionWidth).toBe(sample.width - 34); expect(sample.actionHeight).toBe(48);
  283 |     expect(sample.fontSize).toBe('20px'); expect(sample.lineHeight).toBe('28px');
  284 |     expect(sample.reachable).toBe(true); expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  285 |     samples.push(sample);
  286 |   }
  287 |   for (const [name, width] of [['desktop', 1440], ['mobile', 390]] as const) {
  288 |     await page.setViewportSize({width, height: 1000});
  289 |     await card.screenshot({path: info.outputPath(`candidate-friends-empty-${name}.png`), animations: 'disabled', scale: 'css'});
  290 |     await expect(card).toHaveScreenshot(`friends-empty-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  291 |   }
  292 |   await writeFile(info.outputPath('friends-empty-geometry.json'), JSON.stringify(samples, null, 2));
  293 |   await expectNoBlockingAxeViolations(page); expect(writes).toEqual([]);
  294 |   await action.click(); await expect(page).toHaveURL(/\/new\/friends\/add$/);
  295 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  296 |   expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(1);
  297 |   expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  298 | });
  299 | 
  300 | test('Friends cold loading, keyboard retry and busy decisions preserve data boundaries', async ({page}, info) => {
  301 |   const fixture = await setupFriends(page, 'reduce', undefined, undefined, [], {holdInitialReads: true, holdResponse: true});
  302 |   const {panel, writes, unexpected, runtimeErrors} = fixture;
  303 |   const focus = async () => page.evaluate(() => ({tag: document.activeElement?.tagName,
  304 |     text: document.activeElement?.textContent?.trim().slice(0, 100), id: document.activeElement?.id}));
  305 |   const focusSamples = [];
  306 |   try {
  307 |     await expect.poll(fixture.friendsReadWaiting).toBe(true);
  308 |     const feedback = panel.locator('v2-friends-feedback');
  309 |     await expect(feedback.getByRole('status')).toContainText('Loading friends…');
  310 |     await expect(feedback.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  311 |     await expect(panel.locator('.friend-row, .empty-friends, .request')).toHaveCount(0);
  312 |     expect(writes).toEqual([]);
  313 |     await feedback.screenshot({path: info.outputPath('friends-feedback-loading.png'), animations: 'disabled'});
```