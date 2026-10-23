# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends secondary content has deterministic canonical visual candidates
- Location: e2e/design-v2-friends.spec.ts:164:5

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('v2-friends-page')
  6814 pixels (ratio 0.02 of all image pixels) are different.

  Snapshot: friends-add-desktop.png

Call log:
  - Expect "toHaveScreenshot(friends-add-desktop.png)" locator('v2-friends-page') with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('v2-friends-page')
    - locator resolved to <v2-friends-page _nghost-ng-c798132010="">…</v2-friends-page>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 6814 pixels (ratio 0.02 of all image pixels) are different.
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
  - 6814 pixels (ratio 0.02 of all image pixels) are different.

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
  - main "Add a friend content" [active] [ref=f1e48]:
    - generic [ref=f1e52]:
      - generic [ref=f1e54]:
        - generic [ref=f1e55]:
          - heading "Add a friend" [level=1] [ref=f1e56]
          - button "Back" [ref=f1e57] [cursor=pointer]
        - paragraph [ref=f1e58]: Share your invitation link or let a friend scan your QR code.
      - generic [ref=f1e59]:
        - navigation "Friends navigation" [ref=f1e60]:
          - link "Friends" [ref=f1e61] [cursor=pointer]:
            - /url: /new/friends
          - link "Invitations" [ref=f1e63] [cursor=pointer]:
            - /url: /new/friends/invitations
        - link "Add friend" [ref=f1e65] [cursor=pointer]:
          - /url: /new/friends/add
        - generic [ref=f1e67]:
          - generic [ref=f1e68]:
            - img "Scan to open this single-person friend invitation" [ref=f1e70]
            - generic [ref=f1e71]:
              - heading "Browser test user" [level=2] [ref=f1e72]
              - paragraph [ref=f1e73]: Scan to add me on Analytify.
          - heading "Your invitation link" [level=2] [ref=f1e74]
          - paragraph [ref=f1e75]: http://127.0.0.1:4214/new/friends/invite/4a4b4c4d4e4f505152535455565758595a5b5c5d5e5f60616263646566676869
          - button "Copy link" [ref=f1e76] [cursor=pointer]
          - paragraph [ref=f1e78]: One person · Revoke while pending
  - text:   
  - contentinfo [ref=f1e79]:
    - generic [ref=f1e80]: Powered by Spotify
    - generic [ref=f1e81]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e82] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  96  |     const exp = Math.floor(Date.now() / 1000) + 3600;
  97  |     const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  98  |     localStorage.setItem('sb-127-auth-token', JSON.stringify({access_token: `${encode({alg: 'HS256', typ: 'JWT'})}.${encode({sub: actorId, role: 'authenticated', exp})}.fixture-signature`, refresh_token: 'synthetic-refresh-only', token_type: 'bearer', expires_at: exp, expires_in: 3600, user: {id: actorId, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}}));
  99  |   }, actor);
  100 |   await page.goto(revokedToken ? '/new/friends/invite/' + revokedToken : '/new/friends');
  101 |   const panel = page.locator('v2-friends-page');
  102 |   return {panel, writes, unexpected, runtimeErrors, counters: () => ({authLogouts, friendsReads}),
  103 |     friendsReadWaiting: () => !!releaseFriendsRead, releaseFriendsRead: () => releaseFriendsRead?.(),
  104 |     responseWaiting: () => !!releaseResponse, releaseResponse: () => releaseResponse?.(),
  105 |     inboxRelease: () => releaseInbox, releaseInbox: () => releaseInbox?.(), releaseLogout: () => releaseLogout?.()};
  106 | }
  107 | 
  108 | test('Friends ready content preserves canonical card geometry during resizing', async ({page}, info) => {
  109 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce', undefined, ['Suzkapu', 'Daniel_P', 'Alex']);
  110 |   await expect(panel.locator('.friend-row')).toHaveCount(3);
  111 |   await expectNativeTransitionsSettled(page);
  112 |   const envelope = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-row-current-canonical.json', 'utf8'));
  113 |   const canonical = JSON.parse(envelope.content.find((item: {type: string}) => item.type === 'text').text);
  114 |   const pointerCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-touch-canonical.json', 'utf8'));
  115 |   const tabCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-parity-ready-tab-sizing.json', 'utf8'));
  116 |   const samples = [];
  117 |   for (const width of [1440, 390, 320]) for (const height of [480, 1000]) {
  118 |     await page.setViewportSize({width, height});
  119 |     const sample = await panel.evaluate(element => ({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  120 |       coarsePointer: matchMedia('(pointer: coarse)').matches,
  121 |       tabs: [...element.querySelectorAll<HTMLElement>('.friends-tabs a')].map(tab => ({width: tab.getBoundingClientRect().width,
  122 |         height: tab.getBoundingClientRect().height, paddingLeft: parseFloat(getComputedStyle(tab).paddingLeft)})),
  123 |       rows: [...element.querySelectorAll('.friend-row')].map(row => {
  124 |         const bounds = row.getBoundingClientRect();
  125 |         const action = row.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
  126 |         const actionBounds = action.getBoundingClientRect();
  127 |         return {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
  128 |           action: {width: actionBounds.width, height: actionBounds.height, borderColor: getComputedStyle(action).borderColor}};
  129 |       })}));
  130 |     samples.push(sample);
  131 |   }
  132 |   for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
  133 |     await page.setViewportSize(viewport);
  134 |     await page.evaluate(() => document.fonts.ready);
  135 |     await panel.screenshot({path: info.outputPath(`candidate-friends-ready-${name}.png`), animations: 'disabled', scale: 'css'});
  136 |     await expect(panel).toHaveScreenshot(`friends-ready-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  137 |   }
  138 |   await writeFile(info.outputPath('friends-ready-geometry.json'), JSON.stringify({canonical, pointerVariants: pointerCanonical.variants, samples}, null, 2));
  139 |   for (const sample of samples) {
  140 |     const reference = canonical.find((item: {viewport: string}) => item.viewport === (sample.width <= 760 ? 'mobile' : 'desktop'));
  141 |     const pointerReference = pointerCanonical.variants.find((item: {variants: {State: string; Pointer: string}}) =>
  142 |       item.variants.State === 'Default' && item.variants.Pointer === (sample.coarsePointer ? 'Coarse' : 'Fine'));
  143 |     expect(sample.scrollWidth).toBeLessThanOrEqual(sample.width);
  144 |     const tabReference = sample.width === 1440 ? tabCanonical.desktop : tabCanonical.mobile;
  145 |     for (const [index, tab] of sample.tabs.entries()) {
  146 |       expect(tab.height).toBe(tabReference.children[index].height);
  147 |       expect(tab.paddingLeft).toBe(tabReference.children[index].paddingLeft);
  148 |       const expectedWidth = tabReference.children[index].width - (sample.width === 320 ? 35 : 0);
  149 |       expect(tab.width).toBe(expectedWidth);
  150 |     }
  151 |     for (const [index, row] of sample.rows.entries()) {
  152 |       expect(row.height).toBe(pointerReference.height);
  153 |       expect(row.action.width).toBe(pointerReference.action[0].width);
  154 |       expect(row.action.height).toBe(pointerReference.action[0].height);
  155 |       expect(row.action.borderColor).toBe('rgb(107, 125, 113)');
  156 |       expect(row.width).toBe(sample.width === 320 ? 288 : reference.rows[0].width);
  157 |       if (index) expect(row.y - sample.rows[index - 1].y - sample.rows[index - 1].height).toBe(reference.gap);
  158 |     }
  159 |   }
  160 |   await expectNoBlockingAxeViolations(page);
  161 |   expect(writes).toEqual([]); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  162 | });
  163 | 
  164 | test('Friends secondary content has deterministic canonical visual candidates', async ({page}, info) => {
  165 |   await page.addInitScript(() => {
  166 |     const original = crypto.getRandomValues.bind(crypto);
  167 |     let sequence = 0;
  168 |     Object.defineProperty(crypto, 'getRandomValues', {value: (array: Uint8Array) => {
  169 |       if (!(array instanceof Uint8Array) || array.length !== 32) return original(array);
  170 |       sequence++;
  171 |       array.forEach((_, index) => {array[index] = (sequence * 37 + index) % 256;});
  172 |       return array;
  173 |     }});
  174 |   });
  175 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce');
  176 |   const controls = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-controls-canonical.json', 'utf8'));
  177 |   const frameIds: Record<string, readonly string[]> = {add: ['192:11619', '192:11744'], invitations: ['192:11835', '192:11960'], review: ['192:12051', '192:12176']};
  178 |   const capture = async (state: string) => {
  179 |     await expectNativeTransitionsSettled(page);
  180 |     await page.evaluate(() => document.fonts.ready);
  181 |     for (const [name, viewport] of [['desktop', {width: 1440, height: 1000}], ['mobile', {width: 390, height: 1000}]] as const) {
  182 |       await page.setViewportSize(viewport);
  183 |       await page.mouse.move(0, 0);
  184 |       const reference = controls.screens.find((screen: {id: string}) => screen.id === frameIds[state][name === 'desktop' ? 0 : 1]);
  185 |       const tabs = await panel.locator('.friends-tabs a').evaluateAll(elements => elements.map(element => ({width: element.getBoundingClientRect().width,
  186 |         paddingLeft: parseFloat(getComputedStyle(element).paddingLeft)})));
  187 |       expect.soft(tabs).toEqual(reference.children.map((child: {width: number; paddingLeft: number}) => ({width: child.width, paddingLeft: child.paddingLeft})));
  188 |       if (state === 'invitations') {
  189 |         const revoke = panel.getByRole('button', {name: 'Revoke', exact: true});
  190 |         await expect.soft(revoke).toHaveCSS('background-color', 'rgb(24, 32, 25)');
  191 |         await expect.soft(revoke).toHaveCSS('border-color', 'rgb(255, 116, 125)');
  192 |       }
  193 |       await expectNoBlockingAxeViolations(page);
  194 |       expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  195 |       await panel.screenshot({path: info.outputPath(`candidate-friends-${state}-${name}.png`), animations: 'disabled', scale: 'css'});
> 196 |       await expect(panel).toHaveScreenshot(`friends-${state}-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
      |                           ^ Error: expect(locator).toHaveScreenshot(expected) failed
  197 |     }
  198 |   };
  199 |   await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  200 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  201 |   await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  202 |   await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  203 |   await panel.getByRole('button', {name: 'Create new invitation', exact: true}).click();
  204 |   await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  205 |   await capture('add');
  206 |   await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  207 |   await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  208 |   await capture('invitations');
  209 |   await page.goto('/new/friends/invite/' + 'b'.repeat(64));
  210 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  211 |   await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  212 |   await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  213 |   await capture('review');
  214 |   expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  215 |   expect(writes.filter(write => write.name === 'respond_friend_request')).toEqual([]);
  216 |   expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  217 | });
  218 | 
  219 | test('Friends invitation navigation recovers during immediate viewport resizing', async ({page}, info) => {
  220 |   await page.setViewportSize({width: 1920, height: 1000});
  221 |   const {panel, unexpected, runtimeErrors} = await setupFriends(page, 'no-preference');
  222 |   try {
  223 |     await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  224 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  225 |     await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  226 |     await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  227 |     await panel.getByRole('button', {name: 'Create new invitation', exact: true}).click();
  228 |     await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  229 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  230 |     await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  231 |     await page.setViewportSize({width: 1440, height: 900});
  232 |     await page.setViewportSize({width: 390, height: 900});
  233 |     await expectNativeTransitionsSettled(page);
  234 |     await panel.getByRole('link', {name: 'View link & QR'}).click();
  235 |     await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  236 |     await expectNativeTransitionsSettled(page);
  237 |     expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  238 |   } finally {
  239 |     const probe = await page.evaluate(() => (window as unknown as {analytifyNativeTransitionProbe: unknown}).analytifyNativeTransitionProbe);
  240 |     await writeFile(info.outputPath('friends-resize-transition-probe.json'), JSON.stringify(probe, null, 2));
  241 |   }
  242 | });
  243 | 
  244 | test('Friends empty content preserves canonical geometry and starts only an explicit invitation', async ({page}, info) => {
  245 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce', undefined, []);
  246 |   const card = panel.locator('.empty-friends');
  247 |   const action = card.getByRole('link', {name: 'Add your first friend', exact: true});
  248 |   await expect(card.getByRole('heading', {name: 'Your friends will appear here.', exact: true})).toBeVisible();
  249 |   await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toBeVisible();
  250 |   const samples = [];
  251 |   for (const width of [1440, 390, 320]) for (const height of [480, 1000]) {
  252 |     await page.setViewportSize({width, height});
  253 |     await action.scrollIntoViewIfNeeded();
  254 |     const sample = await card.evaluate(element => {
  255 |       const bounds = element.getBoundingClientRect(), action = element.querySelector('a')!, button = action.getBoundingClientRect();
  256 |       const heading = getComputedStyle(element.querySelector('h2')!);
  257 |       return {viewportWidth: innerWidth, viewportHeight: innerHeight, width: bounds.width, height: bounds.height,
  258 |         actionWidth: button.width, actionHeight: button.height, fontSize: heading.fontSize, lineHeight: heading.lineHeight,
  259 |         reachable: document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2)?.closest('a') === action,
  260 |         scrollWidth: document.documentElement.scrollWidth};
  261 |     });
  262 |     expect(sample.width).toBe(width === 1440 ? 1120 : width - 32);
  263 |     expect(sample.height).toBeGreaterThanOrEqual(122);
  264 |     if (width !== 320) expect(sample.height).toBe(122);
  265 |     expect(sample.actionWidth).toBe(sample.width - 34); expect(sample.actionHeight).toBe(48);
  266 |     expect(sample.fontSize).toBe('20px'); expect(sample.lineHeight).toBe('28px');
  267 |     expect(sample.reachable).toBe(true); expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  268 |     samples.push(sample);
  269 |   }
  270 |   for (const [name, width] of [['desktop', 1440], ['mobile', 390]] as const) {
  271 |     await page.setViewportSize({width, height: 1000});
  272 |     await card.screenshot({path: info.outputPath(`candidate-friends-empty-${name}.png`), animations: 'disabled', scale: 'css'});
  273 |     await expect(card).toHaveScreenshot(`friends-empty-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  274 |   }
  275 |   await writeFile(info.outputPath('friends-empty-geometry.json'), JSON.stringify(samples, null, 2));
  276 |   await expectNoBlockingAxeViolations(page); expect(writes).toEqual([]);
  277 |   await action.click(); await expect(page).toHaveURL(/\/new\/friends\/add$/);
  278 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  279 |   expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(1);
  280 |   expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  281 | });
  282 | 
  283 | test('Friends cold loading, keyboard retry and busy decisions preserve data boundaries', async ({page}, info) => {
  284 |   const fixture = await setupFriends(page, 'reduce', undefined, undefined, [], {holdInitialReads: true, holdResponse: true});
  285 |   const {panel, writes, unexpected, runtimeErrors} = fixture;
  286 |   const focus = async () => page.evaluate(() => ({tag: document.activeElement?.tagName,
  287 |     text: document.activeElement?.textContent?.trim().slice(0, 100), id: document.activeElement?.id}));
  288 |   const focusSamples = [];
  289 |   try {
  290 |     await expect.poll(fixture.friendsReadWaiting).toBe(true);
  291 |     const feedback = panel.locator('v2-friends-feedback');
  292 |     await expect(feedback.getByRole('status')).toContainText('Loading friends…');
  293 |     await expect(feedback.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  294 |     await expect(panel.locator('.friend-row, .empty-friends, .request')).toHaveCount(0);
  295 |     expect(writes).toEqual([]);
  296 |     await feedback.screenshot({path: info.outputPath('friends-feedback-loading.png'), animations: 'disabled'});
```