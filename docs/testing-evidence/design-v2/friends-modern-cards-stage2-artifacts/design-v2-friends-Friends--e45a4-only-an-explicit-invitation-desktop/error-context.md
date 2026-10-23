# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends empty content preserves canonical geometry and starts only an explicit invitation
- Location: e2e/design-v2-friends.spec.ts:244:5

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('v2-friends-page').locator('.empty-friends')
  1017 pixels (ratio 0.03 of all image pixels) are different.

  Snapshot: friends-empty-mobile.png

Call log:
  - Expect "toHaveScreenshot(friends-empty-mobile.png)" locator('v2-friends-page').locator('.empty-friends') with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('v2-friends-page').locator('.empty-friends')
    - locator resolved to <section role="status" _ngcontent-ng-c798132010="" class="friends-card empty-friends">…</section>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 1017 pixels (ratio 0.03 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('v2-friends-page').locator('.empty-friends')
    - locator resolved to <section role="status" _ngcontent-ng-c798132010="" class="friends-card empty-friends">…</section>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - 1017 pixels (ratio 0.03 of all image pixels) are different.

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
  - main "Your friends content" [ref=f1e15]:
    - generic [ref=f1e19]:
      - generic [ref=f1e21]:
        - heading "Your friends" [level=1] [ref=f1e23]
        - paragraph [ref=f1e24]: Share playlists, invite friends and discover music together.
      - generic [ref=f1e25]:
        - navigation "Friends navigation" [ref=f1e26]:
          - link "Friends" [ref=f1e27] [cursor=pointer]:
            - /url: /new/friends
          - link "Invitations" [ref=f1e29] [cursor=pointer]:
            - /url: /new/friends/invitations
        - link "Add friend" [ref=f1e31] [cursor=pointer]:
          - /url: /new/friends/add
        - region "Friend request from Paulzgi" [ref=f1e33]:
          - heading "Friend request from Paulzgi" [level=2] [ref=f1e34]
          - generic [ref=f1e35]:
            - button "Accept" [ref=f1e36] [cursor=pointer]
            - button "Decline" [ref=f1e38] [cursor=pointer]
        - status [ref=f1e40]:
          - heading "Your friends will appear here." [level=2] [ref=f1e41]
          - link "Add your first friend" [ref=f1e42] [cursor=pointer]:
            - /url: /new/friends/add
        - paragraph [ref=f1e44]: Friendship does not grant access to your playlists or listening data. You choose what to share.
  - navigation "Primary navigation" [ref=f1e45]:
    - link "Playlists" [ref=f1e46] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e47]: 
    - link "Stats" [ref=f1e49] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e50]: 
    - link "History" [ref=f1e52] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e53]: 
  - contentinfo [ref=f1e55]:
    - generic [ref=f1e56]: Powered by Spotify
    - generic [ref=f1e57]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e58] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
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
  196 |       await expect(panel).toHaveScreenshot(`friends-${state}-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
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
> 273 |     await expect(card).toHaveScreenshot(`friends-empty-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
      |                        ^ Error: expect(locator).toHaveScreenshot(expected) failed
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
  297 |     fixture.releaseFriendsRead();
  298 |     const retry = feedback.getByRole('button', {name: 'Retry', exact: true});
  299 |     await expect(feedback.getByRole('alert')).toContainText('Friends could not be loaded');
  300 |     await expect(panel.locator('.empty-friends')).toHaveCount(0);
  301 |     await retry.focus(); await expect(retry).toBeFocused();
  302 |     await expectNoBlockingAxeViolations(page);
  303 |     await feedback.screenshot({path: info.outputPath('friends-feedback-load-error.png'), animations: 'disabled'});
  304 |     await retry.press('Enter');
  305 |     await expect.poll(fixture.friendsReadWaiting).toBe(true);
  306 |     await expect(feedback.getByRole('status')).toContainText('Loading friends…');
  307 |     await expect(retry).toHaveCount(0);
  308 |     focusSamples.push({state: 'retry-pending', focus: await focus()});
  309 |     await expect(feedback.getByRole('status')).toBeFocused();
  310 |     fixture.releaseFriendsRead();
  311 |     const request = panel.getByRole('region', {name: 'Friend request from Paulzgi', exact: true});
  312 |     await expect(request).toBeVisible(); await expect(panel.locator('.friend-row')).toHaveCount(1);
  313 |     focusSamples.push({state: 'retry-recovered', focus: await focus()});
  314 |     await expect(page.locator('#v2-main-content')).toBeFocused();
  315 |     expect(fixture.counters().friendsReads).toBe(2); expect(writes).toEqual([]);
  316 |     const accept = request.getByRole('button', {name: 'Accept', exact: true});
  317 |     await accept.press('Enter'); await expect.poll(fixture.responseWaiting).toBe(true);
  318 |     await expect(feedback.getByRole('status')).toContainText('Updating your request…');
  319 |     await expect(feedback.getByRole('status')).toBeFocused();
  320 |     await expect(feedback.getByRole('status')).toHaveAttribute('aria-busy', 'true');
  321 |     await expect(request.getByRole('button', {name: 'Accept', exact: true})).toBeDisabled();
  322 |     await expect(request.getByRole('button', {name: 'Decline', exact: true})).toBeDisabled();
  323 |     await expect(panel.locator('.friend-row')).toHaveCount(1);
  324 |     await page.keyboard.press('Enter');
  325 |     expect(writes).toEqual([{name: 'respond_friend_request', body: {p_invitation_id: '44444444-4444-4444-8444-444444444444', p_accept: true}}]);
  326 |     await feedback.screenshot({path: info.outputPath('friends-feedback-busy.png'), animations: 'disabled'});
  327 |     await expectNoBlockingAxeViolations(page);
  328 |     fixture.releaseResponse(); await expect(request).toHaveCount(0);
  329 |     await expect(panel.locator('.friend-row')).toHaveCount(1);
  330 |     focusSamples.push({state: 'decision-confirmed', focus: await focus()});
  331 |     await expect(page.locator('#v2-main-content')).toBeFocused();
  332 |     await expectNativeTransitionsSettled(page);
  333 |     expect(writes).toHaveLength(1); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  334 |   } finally {
  335 |     fixture.releaseFriendsRead(); fixture.releaseResponse();
  336 |     await writeFile(info.outputPath('friends-feedback-focus.json'), JSON.stringify(focusSamples, null, 2));
  337 |   }
  338 | });
  339 | 
  340 | test('Friends pending decision does not steal deliberately moved keyboard focus', async ({page}, info) => {
  341 |   const fixture = await setupFriends(page, 'reduce', undefined, undefined, [], {holdResponse: true});
  342 |   const {panel, writes, unexpected, runtimeErrors} = fixture;
  343 |   const request = panel.getByRole('region', {name: 'Friend request from Paulzgi', exact: true});
  344 |   await expect(request).toBeVisible();
  345 |   try {
  346 |     await request.getByRole('button', {name: 'Accept', exact: true}).press('Enter');
  347 |     await expect.poll(fixture.responseWaiting).toBe(true);
  348 |     await expect(panel.locator('v2-friends-feedback').getByRole('status')).toBeFocused();
  349 |     const add = panel.getByRole('link', {name: 'Add friend', exact: true});
  350 |     await add.focus(); await expect(add).toBeFocused();
  351 |     fixture.releaseResponse(); await expect(request).toHaveCount(0);
  352 |     await expect(add).toBeFocused();
  353 |     expect(writes).toHaveLength(1); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  354 |     await writeFile(info.outputPath('friends-focus-user-owned.json'), JSON.stringify({focused: await add.evaluate(element => document.activeElement === element), writeCount: writes.length}));
  355 |   } finally {fixture.releaseResponse();}
  356 | });
  357 | 
  358 | test('Friends confirmation typography matches canonical after font readiness', async ({page}, info) => {
  359 |   const {panel} = await setupFriends(page, 'reduce', undefined, undefined,
  360 |     [{id: '55555555-5555-4555-8555-555555555555', status: 'pending', createdAt: '2026-10-12'}]);
  361 |   await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  362 |   await panel.getByRole('button', {name: 'Revoke', exact: true}).press('Enter');
  363 |   const dialog = panel.getByRole('dialog', {name: 'Revoke friend invitation?', exact: true});
  364 |   const measure = () => dialog.evaluate(element => {
  365 |     const body = element.querySelector('p')!, style = getComputedStyle(body);
  366 |     const canvas = document.createElement('canvas').getContext('2d')!;
  367 |     canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  368 |     return {dialogWidth: element.getBoundingClientRect().width, dialogHeight: element.getBoundingClientRect().height,
  369 |       bodyWidth: body.getBoundingClientRect().width, bodyHeight: body.getBoundingClientRect().height,
  370 |       font: style.font, fontFamily: style.fontFamily, fontWeight: style.fontWeight, fontSize: style.fontSize,
  371 |       lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, wordSpacing: style.wordSpacing,
  372 |       fontVariationSettings: style.fontVariationSettings, fontKerning: style.fontKerning,
  373 |       canonicalFirstLineWidth: canvas.measureText('Disables this invitation’s private').width,
```