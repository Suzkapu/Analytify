# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends confirmation typography matches canonical after font readiness
- Location: e2e/design-v2-friends.spec.ts:358:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 322
Received: 346
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link [aria-hidden] [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
    - text: Skip to main content
  - complementary [aria-hidden] [ref=f1e7]:
    - generic [ref=f1e9]:
      - button [expanded] [ref=f1e10] [cursor=pointer]:
        - generic [ref=f1e11]: Analytify
      - navigation [ref=f1e12]:
        - generic [ref=f1e13]:
          - paragraph [ref=f1e14]: Library
          - link [ref=f1e15] [cursor=pointer]:
            - /url: /new/playlists
            - generic [aria-hidden] [ref=f1e16]: 
            - generic [ref=f1e17]: Playlists
        - generic [ref=f1e18]:
          - paragraph [ref=f1e19]: Listening
          - link [ref=f1e20] [cursor=pointer]:
            - /url: /new/stats
            - generic [aria-hidden] [ref=f1e21]: 
            - generic [ref=f1e22]: Stats
          - link [ref=f1e23] [cursor=pointer]:
            - /url: /new/history
            - generic [aria-hidden] [ref=f1e24]: 
            - generic [ref=f1e25]: History
        - generic [ref=f1e26]:
          - paragraph [ref=f1e27]: Social
          - link [ref=f1e28] [cursor=pointer]:
            - /url: /new/friends
            - generic [aria-hidden] [ref=f1e29]: 
            - generic [ref=f1e30]: Friends
          - link [ref=f1e31] [cursor=pointer]:
            - /url: /new/song-league
            - generic [aria-hidden] [ref=f1e32]: 
            - generic [ref=f1e33]: Song Leagues
          - link [ref=f1e34] [cursor=pointer]:
            - /url: /new/shared-playlists
            - generic [aria-hidden] [ref=f1e35]: 
            - generic [ref=f1e36]: Private Sharing
        - generic [ref=f1e37]:
          - paragraph [ref=f1e38]: Tools
          - link [ref=f1e39] [cursor=pointer]:
            - /url: /new/compare-room
            - generic [aria-hidden] [ref=f1e40]: 
            - generic [ref=f1e41]: Compare playlists
      - link [ref=f1e42] [cursor=pointer]:
        - /url: /new/settings/account
        - generic [ref=f1e44]: B
        - generic [ref=f1e45]:
          - strong [ref=f1e46]: Browser test user
          - generic [ref=f1e47]: Settings
  - text: 
  - main "Friend invitations content" [ref=f1e48]:
    - generic [ref=f1e50]:
      - generic [ref=f1e52]:
        - generic [ref=f1e54]:
          - generic [ref=f1e55]:
            - heading [level=1] [ref=f1e56]: Friend invitations
            - button [ref=f1e57] [cursor=pointer]: Back
          - paragraph [ref=f1e58]: Manage pending invitations. Revoking one disables both its link and QR code.
        - generic [ref=f1e59]:
          - navigation [ref=f1e60]:
            - link [ref=f1e61] [cursor=pointer]:
              - /url: /new/friends
              - text: Friends
            - link [ref=f1e63] [cursor=pointer]:
              - /url: /new/friends/invitations
              - text: Invitations
          - link [ref=f1e65] [cursor=pointer]:
            - /url: /new/friends/add
            - text: Add friend
          - generic [ref=f1e67]:
            - heading [level=2] [ref=f1e68]: Your friend invitation
            - paragraph [ref=f1e69]: Link + QR · One person · Pending
            - generic [ref=f1e70]:
              - button [disabled] [ref=f1e71]: View link & QR
              - button [ref=f1e73] [cursor=pointer]: Revoke
            - status [ref=f1e76]:
              - heading [level=3] [ref=f1e77]: Link unavailable in this session
              - paragraph [ref=f1e78]: This invitation was created in another session. You can revoke it and create a new invitation to share from here.
          - paragraph [ref=f1e79]: Revoking an invitation does not remove existing friends.
      - generic [ref=f1e80]:
        - button [aria-hidden] [ref=f1e81] [cursor=pointer]
        - dialog [ref=f1e82]:
          - heading "Revoke friend invitation?" [level=2] [ref=f1e83]
          - paragraph [ref=f1e84]: Disables this invitation’s private link and QR code. Existing friendships are unchanged.
          - button "Revoke invitation" [ref=f1e85] [cursor=pointer]
          - button "Cancel" [active] [ref=f1e86] [cursor=pointer]
  - text:   
  - contentinfo [aria-hidden] [ref=f1e87]:
    - generic [ref=f1e88]: Powered by Spotify
    - generic [ref=f1e89]: Artwork and metadata belong to their owners.
    - link [ref=f1e90] [cursor=pointer]:
      - /url: /new/legal
      - text: Legal & privacy
```

# Test source

```ts
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
  374 |       fontsStatus: document.fonts.status, variableReady: document.fonts.check('400 16px "Outfit Variable"'),
  375 |       faces: [...document.fonts].map(face => ({family: face.family, weight: face.weight, status: face.status}))};
  376 |   });
  377 |   const before = await measure();
  378 |   await page.evaluate(() => document.fonts.ready);
  379 |   const after = await measure();
  380 |   await writeFile(info.outputPath('friends-dialog-font-metrics.json'), JSON.stringify({before, after}, null, 2));
  381 |   await dialog.screenshot({path: info.outputPath('friends-dialog-font-ready.png'), animations: 'disabled', scale: 'css'});
  382 |   expect(after.dialogWidth).toBe(272); expect(after.bodyWidth).toBe(222);
  383 |   expect(after.fontSize).toBe('16px'); expect(after.lineHeight).toBe('24px');
> 384 |   expect(after.dialogHeight).toBe(322); expect(after.bodyHeight).toBe(72);
      |                              ^ Error: expect(received).toBe(expected) // Object.is equality
  385 | });
  386 | 
  387 | for (const motion of ['no-preference', 'reduce'] as const) {
  388 |   test(`Friends removal dialog responsive geometry (${motion})`, async ({page}, info) => {
  389 |     const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, motion);
  390 |     await expect(panel.locator('.friend-row')).toHaveCount(1);
  391 |     await expectNativeTransitionsSettled(page);
  392 |     const manage = panel.getByRole('button', {name: 'Manage friend Suzkapu'});
  393 |     await manage.press('Enter'); await panel.getByRole('menuitem', {name: 'Remove friend'}).press('Enter');
  394 |     const dialog = panel.getByRole('dialog', {name: 'Remove Suzkapu?'});
  395 |     await expect(dialog).toBeVisible();
  396 |     if (motion === 'reduce') {
  397 |       await expect(panel.locator('.confirmation-layer')).toHaveCSS('animation-name', 'none');
  398 |       expect(await panel.locator('.confirmation-layer').evaluate(element => element.getAnimations().length)).toBe(0);
  399 |     } else {
  400 |       await expect(panel.locator('.confirmation-layer')).toHaveCSS('animation-duration', '0.15s');
  401 |     }
  402 |     await expect(dialog.locator('.icon.trash')).toHaveCount(1);
  403 |     await expect(dialog.getByRole('button')).toHaveText(['Remove friend', 'Cancel']);
  404 |     await expect(dialog).toHaveAccessibleDescription('Removes this person from your friends. You can send a new friend request later.');
  405 |     await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  406 |     await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', {name: 'Remove friend', exact: true})).toBeFocused();
  407 |     await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  408 |     await dialog.screenshot({path: info.outputPath('candidate-friends-remove-dialog.png'), animations: 'disabled', scale: 'css'});
  409 |     const geometry = [];
  410 |     for (const height of [480, 1000]) for (const width of [320, 360, 390, 767, 768, 1024, 1440, 1920]) {
  411 |       await page.setViewportSize({width, height});
  412 |       await expect(dialog).toBeVisible();
  413 |       const sample = await dialog.evaluate(element => {
  414 |         const rect = element.getBoundingClientRect();
  415 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
  416 |           backdropFilter: getComputedStyle(document.querySelector('.confirmation-backdrop')!).backdropFilter};
  417 |       });
  418 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  419 |       expect(sample.x).toBeGreaterThanOrEqual(0); expect(sample.right).toBeLessThanOrEqual(width);
  420 |       expect(sample.y).toBeGreaterThanOrEqual(0); expect(sample.bottom).toBeLessThanOrEqual(height);
  421 |       expect(sample.right - sample.x).toBe(272);
  422 |       expect(sample.backdropFilter).toBe('blur(12px)'); geometry.push(sample);
  423 |     }
  424 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(manage).toBeFocused();
  425 |     expect(writes).toHaveLength(0);
  426 |     await manage.press('Enter'); await panel.getByRole('menuitem', {name: 'Remove friend'}).press('Enter');
  427 |     await dialog.getByRole('button', {name: 'Remove friend', exact: true}).press('Enter');
  428 |     await expect(dialog).toHaveCount(0); await expect(panel.locator('.friend-row')).toHaveCount(0);
  429 |     await expect(page.locator('#v2-main-content')).toBeFocused();
  430 |     await expect(panel.getByRole('region', {name: 'Friend request from Paulzgi', exact: true})).toBeVisible();
  431 |     expect(writes).toEqual([{name: 'remove_friend', body: {p_friend_user_id: '22222222-2222-4222-8222-222222222222', p_connection_version: '33333333-3333-4333-8333-333333333333'}}]);
  432 |     await expectNoBlockingAxeViolations(page);
  433 |     await writeFile(info.outputPath('friends-removal-geometry.json'), JSON.stringify({motion, geometry}, null, 2));
  434 |     expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  435 |   });
  436 |   test(`Friends invitations and responsive geometry (${motion})`, async ({page}, info) => {
  437 |     const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, motion);
  438 |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  439 |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toBeVisible();
  440 |     await expectNativeTransitionsSettled(page);
  441 |     await expectNoBlockingAxeViolations(page);
  442 |     await panel.getByRole('button', {name: 'Decline', exact: true}).press('Enter');
  443 |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toHaveCount(0);
  444 |     expect(writes).toEqual([{name: 'respond_friend_request', body: {p_invitation_id: '44444444-4444-4444-8444-444444444444', p_accept: false}}]);
  445 |     await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  446 |     const qr = panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'});
  447 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  448 |     await expect(panel.getByRole('button', {name: 'Retry', exact: true}).locator('.sync')).toHaveCSS('width', '18px');
  449 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  450 |     await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  451 |     await expect(qr).toHaveCount(0);
  452 |     const consumedCreations = writes.filter(write => write.name === 'create_friend_invitation');
  453 |     expect(consumedCreations).toHaveLength(2);
  454 |     expect(consumedCreations[1].body).toEqual(consumedCreations[0].body);
  455 |     await expectNoBlockingAxeViolations(page);
  456 |     await panel.screenshot({path: info.outputPath('friends-owner-inactive.png'), animations: 'disabled'});
  457 |     await panel.getByRole('button', {name: 'Create new invitation', exact: true}).press('Enter');
  458 |     await expect(qr).toBeVisible();
  459 |     await expect(qr).toHaveJSProperty('naturalWidth', 176); await expect(qr).toHaveJSProperty('naturalHeight', 176);
  460 |     const copy = panel.getByRole('button', {name: 'Copy link', exact: true});
  461 |     await expect(copy).toHaveCSS('font-size', '14px');
  462 |     await expect(copy).toHaveCSS('font-weight', '600');
  463 |     await expect(copy).toHaveCSS('line-height', '20px');
  464 |     await expect.soft(panel.locator('.qr-identity .identity')).toHaveCSS('gap', '12px');
  465 |     const creations = writes.filter(write => write.name === 'create_friend_invitation');
  466 |     expect(creations).toHaveLength(3); expect(creations[2].body.p_claim_token).toMatch(/^[a-f0-9]{64}$/);
  467 |     expect(creations[2].body.p_claim_token).not.toBe(creations[0].body.p_claim_token);
  468 |     const expectedUrl = `http://127.0.0.1:4214/new/friends/invite/${creations[2].body.p_claim_token}`;
  469 |     await expect(panel.locator('.invitation-url')).toHaveText(expectedUrl);
  470 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  471 |     await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  472 |     for (const width of [1440, 390]) {
  473 |       await page.setViewportSize({width, height: 900});
  474 |       const actions = await panel.locator('.friends-card .actions').evaluate(element => [...element.children].map(child => child.getBoundingClientRect().width));
  475 |       expect.soft(actions).toEqual(width === 1440 ? [180, 112] : [160, 112]);
  476 |     }
  477 |     await panel.getByRole('link', {name: 'View link & QR'}).click(); await expect(qr).toBeVisible();
  478 |     expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  479 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  480 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  481 |     await page.evaluate(() => document.fonts.ready);
  482 |     await panel.screenshot({path: info.outputPath('friends-add.png'), animations: 'disabled'});
  483 |     const incomingToken = 'b'.repeat(64);
  484 |     await page.goto('/new/friends/invite/' + incomingToken);
```