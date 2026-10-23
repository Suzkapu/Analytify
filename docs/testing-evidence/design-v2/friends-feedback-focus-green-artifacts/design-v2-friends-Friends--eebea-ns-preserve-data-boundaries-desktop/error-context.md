# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends cold loading, keyboard retry and busy decisions preserve data boundaries
- Location: e2e/design-v2-friends.spec.ts:283:5

# Error details

```
Error: expect(locator).toBeFocused() failed

Locator:  locator('v2-friends-page').locator('v2-friends-feedback').getByRole('status')
Expected: focused
Received: inactive
Timeout:  5000ms

Call log:
  - Expect "toBeFocused" locator('v2-friends-page').locator('v2-friends-feedback').getByRole('status') with timeout 5000ms
  - waiting for locator('v2-friends-page').locator('v2-friends-feedback').getByRole('status')
    14 × locator resolved to <section role="status" class="feedback" aria-busy="true" aria-live="polite" _ngcontent-ng-c3529466589="">…</section>
       - unexpected value "inactive"

```

```yaml
- status:
  - heading "Loading friends…" [level=3]
  - paragraph: Your friends and incoming requests will appear here.
```

# Test source

```ts
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
> 309 |     await expect(feedback.getByRole('status')).toBeFocused();
      |                                                ^ Error: expect(locator).toBeFocused() failed
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
  340 | for (const motion of ['no-preference', 'reduce'] as const) {
  341 |   test(`Friends removal dialog responsive geometry (${motion})`, async ({page}, info) => {
  342 |     const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, motion);
  343 |     await expect(panel.locator('.friend-row')).toHaveCount(1);
  344 |     await expectNativeTransitionsSettled(page);
  345 |     const manage = panel.getByRole('button', {name: 'Manage friend Suzkapu'});
  346 |     await manage.press('Enter'); await panel.getByRole('menuitem', {name: 'Remove friend'}).press('Enter');
  347 |     const dialog = panel.getByRole('dialog', {name: 'Remove Suzkapu?'});
  348 |     await expect(dialog).toBeVisible();
  349 |     if (motion === 'reduce') {
  350 |       await expect(panel.locator('.confirmation-layer')).toHaveCSS('animation-name', 'none');
  351 |       expect(await panel.locator('.confirmation-layer').evaluate(element => element.getAnimations().length)).toBe(0);
  352 |     } else {
  353 |       await expect(panel.locator('.confirmation-layer')).toHaveCSS('animation-duration', '0.15s');
  354 |     }
  355 |     await expect(dialog.locator('.icon.trash')).toHaveCount(1);
  356 |     await expect(dialog.getByRole('button')).toHaveText(['Remove friend', 'Cancel']);
  357 |     await expect(dialog).toHaveAccessibleDescription('Removes this person from your friends. You can send a new friend request later.');
  358 |     await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  359 |     await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', {name: 'Remove friend', exact: true})).toBeFocused();
  360 |     await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  361 |     const geometry = [];
  362 |     for (const height of [480, 1000]) for (const width of [320, 360, 390, 767, 768, 1024, 1440, 1920]) {
  363 |       await page.setViewportSize({width, height});
  364 |       await expect(dialog).toBeVisible();
  365 |       const sample = await dialog.evaluate(element => {
  366 |         const rect = element.getBoundingClientRect();
  367 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
  368 |           backdropFilter: getComputedStyle(document.querySelector('.confirmation-backdrop')!).backdropFilter};
  369 |       });
  370 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  371 |       expect(sample.x).toBeGreaterThanOrEqual(0); expect(sample.right).toBeLessThanOrEqual(width);
  372 |       expect(sample.y).toBeGreaterThanOrEqual(0); expect(sample.bottom).toBeLessThanOrEqual(height);
  373 |       expect(sample.right - sample.x).toBe(272);
  374 |       expect(sample.backdropFilter).toBe('blur(12px)'); geometry.push(sample);
  375 |     }
  376 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(manage).toBeFocused();
  377 |     expect(writes).toHaveLength(0);
  378 |     await expectNoBlockingAxeViolations(page);
  379 |     await writeFile(info.outputPath('friends-removal-geometry.json'), JSON.stringify({motion, geometry}, null, 2));
  380 |     expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  381 |   });
  382 |   test(`Friends invitations and responsive geometry (${motion})`, async ({page}, info) => {
  383 |     const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, motion);
  384 |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  385 |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toBeVisible();
  386 |     await expectNativeTransitionsSettled(page);
  387 |     await expectNoBlockingAxeViolations(page);
  388 |     await panel.getByRole('button', {name: 'Decline', exact: true}).press('Enter');
  389 |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toHaveCount(0);
  390 |     expect(writes).toEqual([{name: 'respond_friend_request', body: {p_invitation_id: '44444444-4444-4444-8444-444444444444', p_accept: false}}]);
  391 |     await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  392 |     const qr = panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'});
  393 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  394 |     await expect(panel.getByRole('button', {name: 'Retry', exact: true}).locator('.sync')).toHaveCSS('width', '18px');
  395 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  396 |     await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  397 |     await expect(qr).toHaveCount(0);
  398 |     const consumedCreations = writes.filter(write => write.name === 'create_friend_invitation');
  399 |     expect(consumedCreations).toHaveLength(2);
  400 |     expect(consumedCreations[1].body).toEqual(consumedCreations[0].body);
  401 |     await expectNoBlockingAxeViolations(page);
  402 |     await panel.screenshot({path: info.outputPath('friends-owner-inactive.png'), animations: 'disabled'});
  403 |     await panel.getByRole('button', {name: 'Create new invitation', exact: true}).press('Enter');
  404 |     await expect(qr).toBeVisible();
  405 |     await expect(qr).toHaveJSProperty('naturalWidth', 176); await expect(qr).toHaveJSProperty('naturalHeight', 176);
  406 |     const copy = panel.getByRole('button', {name: 'Copy link', exact: true});
  407 |     await expect(copy).toHaveCSS('font-size', '14px');
  408 |     await expect(copy).toHaveCSS('font-weight', '600');
  409 |     await expect(copy).toHaveCSS('line-height', '20px');
```