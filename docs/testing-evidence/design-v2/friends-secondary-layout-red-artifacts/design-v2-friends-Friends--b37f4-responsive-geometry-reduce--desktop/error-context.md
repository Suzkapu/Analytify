# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends invitations and responsive geometry (reduce)
- Location: e2e/design-v2-friends.spec.ts:138:7

# Error details

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  locator('v2-friends-page').locator('.qr-identity .identity')
Expected: "12px"
Received: "4px"
Timeout:  5000ms

Call log:
  - Expect "soft toHaveCSS" locator('v2-friends-page').locator('.qr-identity .identity') with timeout 5000ms
  - waiting for locator('v2-friends-page').locator('.qr-identity .identity')
    14 × locator resolved to <div class="identity" _ngcontent-ng-c965801823="">…</div>
       - unexpected value "4px"

```

```yaml
- heading "Browser test user" [level=2]
- paragraph: Scan to add me on Analytify.
```

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 2

  Array [
-   180,
-   112,
+   153,
+   109,
  ]
```

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 2

  Array [
-   160,
-   112,
+   153,
+   109,
  ]
```

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  locator('v2-friends-page').locator('.friends-card > p')
Expected: "16px"
Received: "14px"
Timeout:  5000ms

Call log:
  - Expect "soft toHaveCSS" locator('v2-friends-page').locator('.friends-card > p') with timeout 5000ms
  - waiting for locator('v2-friends-page').locator('.friends-card > p')
    14 × locator resolved to <p _ngcontent-ng-c965801823="">You can share playlists and invite each other aft…</p>
       - unexpected value "14px"

```

```yaml
- paragraph: You can share playlists and invite each other after accepting. Your listening data stays private until you choose to share it.
```

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  locator('v2-friends-page').locator('.friends-card > p')
Expected: "24px"
Received: "20px"
Timeout:  5000ms

Call log:
  - Expect "soft toHaveCSS" locator('v2-friends-page').locator('.friends-card > p') with timeout 5000ms
  - waiting for locator('v2-friends-page').locator('.friends-card > p')
    14 × locator resolved to <p _ngcontent-ng-c965801823="">You can share playlists and invite each other aft…</p>
       - unexpected value "20px"

```

```yaml
- paragraph: You can share playlists and invite each other after accepting. Your listening data stays private until you choose to share it.
```

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 2

  Array [
-   200,
-   120,
+   107,
+   107,
  ]
```

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 2

  Array [
-   155,
-   157,
+   107,
+   107,
  ]
```

# Test source

```ts
  120 |     const reference = canonical.find((item: {viewport: string}) => item.viewport === (sample.width <= 760 ? 'mobile' : 'desktop'));
  121 |     const pointerReference = pointerCanonical.variants.find((item: {variants: {State: string; Pointer: string}}) =>
  122 |       item.variants.State === 'Default' && item.variants.Pointer === (sample.coarsePointer ? 'Coarse' : 'Fine'));
  123 |     expect(sample.scrollWidth).toBeLessThanOrEqual(sample.width);
  124 |     for (const [index, row] of sample.rows.entries()) {
  125 |       expect(row.height).toBe(pointerReference.height);
  126 |       expect(row.action.width).toBe(pointerReference.action[0].width);
  127 |       expect(row.action.height).toBe(pointerReference.action[0].height);
  128 |       expect(row.action.borderColor).toBe('rgb(107, 125, 113)');
  129 |       expect(row.width).toBe(sample.width === 320 ? 288 : reference.rows[0].width);
  130 |       if (index) expect(row.y - sample.rows[index - 1].y - sample.rows[index - 1].height).toBe(reference.gap);
  131 |     }
  132 |   }
  133 |   await expectNoBlockingAxeViolations(page);
  134 |   expect(writes).toEqual([]); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  135 | });
  136 | 
  137 | for (const motion of ['no-preference', 'reduce'] as const) {
  138 |   test(`Friends invitations and responsive geometry (${motion})`, async ({page}, info) => {
  139 |     const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, motion);
  140 |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  141 |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toBeVisible();
  142 |     await expectNativeTransitionsSettled(page);
  143 |     await expectNoBlockingAxeViolations(page);
  144 |     await panel.getByRole('button', {name: 'Decline', exact: true}).press('Enter');
  145 |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toHaveCount(0);
  146 |     expect(writes).toEqual([{name: 'respond_friend_request', body: {p_invitation_id: '44444444-4444-4444-8444-444444444444', p_accept: false}}]);
  147 |     const manage = panel.getByRole('button', {name: 'Manage friend Suzkapu'});
  148 |     await manage.press('Enter'); await panel.getByRole('menuitem', {name: 'Remove friend'}).press('Enter');
  149 |     const dialog = panel.getByRole('dialog', {name: 'Remove Suzkapu?'});
  150 |     await expect(dialog).toBeVisible();
  151 |     await expect(dialog.getByRole('button')).toHaveText(['Remove friend', 'Cancel']);
  152 |     await expect(dialog).toHaveAccessibleDescription('Removes this person from your friends. You can send a new friend request later.');
  153 |     await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  154 |     await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', {name: 'Remove friend', exact: true})).toBeFocused();
  155 |     await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  156 |     const geometry = [];
  157 |     for (const height of [480, 1000]) for (const width of [320, 360, 390, 767, 768, 1024, 1440, 1920]) {
  158 |       await page.setViewportSize({width, height});
  159 |       await expect(dialog).toBeVisible();
  160 |       const sample = await dialog.evaluate(element => {
  161 |         const rect = element.getBoundingClientRect();
  162 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
  163 |           backdropFilter: getComputedStyle(document.querySelector('.confirmation-backdrop')!).backdropFilter};
  164 |       });
  165 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  166 |       expect(sample.x).toBeGreaterThanOrEqual(0); expect(sample.right).toBeLessThanOrEqual(width);
  167 |       expect(sample.y).toBeGreaterThanOrEqual(0); expect(sample.bottom).toBeLessThanOrEqual(height);
  168 |       expect(sample.backdropFilter).toBe('blur(12px)'); geometry.push(sample);
  169 |     }
  170 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(manage).toBeFocused();
  171 |     expect(writes).toHaveLength(1);
  172 |     if (info.project.name === 'mobile') await page.setViewportSize({width: 390, height: 900});
  173 |     await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  174 |     const qr = panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'});
  175 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  176 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  177 |     await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  178 |     await expect(qr).toHaveCount(0);
  179 |     const consumedCreations = writes.filter(write => write.name === 'create_friend_invitation');
  180 |     expect(consumedCreations).toHaveLength(2);
  181 |     expect(consumedCreations[1].body).toEqual(consumedCreations[0].body);
  182 |     await expectNoBlockingAxeViolations(page);
  183 |     await panel.screenshot({path: info.outputPath('friends-owner-inactive.png'), animations: 'disabled'});
  184 |     await panel.getByRole('button', {name: 'Create new invitation', exact: true}).press('Enter');
  185 |     await expect(qr).toBeVisible();
  186 |     await expect(qr).toHaveJSProperty('naturalWidth', 176); await expect(qr).toHaveJSProperty('naturalHeight', 176);
  187 |     const copy = panel.getByRole('button', {name: 'Copy link', exact: true});
  188 |     await expect(copy).toHaveCSS('font-size', '14px');
  189 |     await expect(copy).toHaveCSS('font-weight', '600');
  190 |     await expect(copy).toHaveCSS('line-height', '20px');
  191 |     await expect.soft(panel.locator('.qr-identity .identity')).toHaveCSS('gap', '12px');
  192 |     const creations = writes.filter(write => write.name === 'create_friend_invitation');
  193 |     expect(creations).toHaveLength(3); expect(creations[2].body.p_claim_token).toMatch(/^[a-f0-9]{64}$/);
  194 |     expect(creations[2].body.p_claim_token).not.toBe(creations[0].body.p_claim_token);
  195 |     const expectedUrl = `http://127.0.0.1:4214/new/friends/invite/${creations[2].body.p_claim_token}`;
  196 |     await expect(panel.locator('.invitation-url')).toHaveText(expectedUrl);
  197 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  198 |     await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  199 |     for (const width of [1440, 390]) {
  200 |       await page.setViewportSize({width, height: 900});
  201 |       const actions = await panel.locator('.friends-card .actions').evaluate(element => [...element.children].map(child => child.getBoundingClientRect().width));
  202 |       expect.soft(actions).toEqual(width === 1440 ? [180, 112] : [160, 112]);
  203 |     }
  204 |     await panel.getByRole('link', {name: 'View link & QR'}).click(); await expect(qr).toBeVisible();
  205 |     expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  206 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  207 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  208 |     await page.evaluate(() => document.fonts.ready);
  209 |     await panel.screenshot({path: info.outputPath('friends-add.png'), animations: 'disabled'});
  210 |     const incomingToken = 'b'.repeat(64);
  211 |     await page.goto('/new/friends/invite/' + incomingToken);
  212 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  213 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  214 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  215 |     await expect.soft(panel.locator('.friends-card > p')).toHaveCSS('font-size', '16px');
  216 |     await expect.soft(panel.locator('.friends-card > p')).toHaveCSS('line-height', '24px');
  217 |     for (const width of [1440, 390]) {
  218 |       await page.setViewportSize({width, height: 900});
  219 |       const actions = await panel.locator('.friends-card .actions').evaluate(element => [...element.children].map(child => child.getBoundingClientRect().width));
> 220 |       expect.soft(actions).toEqual(width === 1440 ? [200, 120] : [155, 157]);
      |                            ^ Error: expect(received).toEqual(expected) // deep equality
  221 |     }
  222 |     expect(writes.filter(write => write.name === 'receive_friend_invitation').map(write => write.body))
  223 |       .toEqual([{p_claim_token: incomingToken}, {p_claim_token: incomingToken}]);
  224 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(1);
  225 |     await expectNoBlockingAxeViolations(page);
  226 |     await panel.screenshot({path: info.outputPath('friends-review-recovered.png'), animations: 'disabled'});
  227 |     const accept = motion === 'no-preference';
  228 |     await panel.getByRole('button', {name: accept ? 'Accept' : 'Decline', exact: true}).press('Enter');
  229 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toHaveCount(0);
  230 |     await expect(panel.getByRole('status')).toContainText(accept ? 'Friend request accepted' : 'Friend request declined');
  231 |     const actionStyle = await panel.getByRole('button', {name: 'View friends', exact: true}).evaluate(element => {
  232 |       const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
  233 |       return {width: rect.width, height: rect.height, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight};
  234 |     });
  235 |     expect(actionStyle).toEqual({width: 260, height: 48, fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
  236 |     expect(writes.at(-1)).toEqual({name: 'respond_friend_request', body: {p_invitation_id: '77777777-7777-4777-8777-777777777777', p_accept: accept}});
  237 |     await expectNoBlockingAxeViolations(page);
  238 |     await panel.screenshot({path: info.outputPath('friends-outcome.png'), animations: 'disabled'});
  239 |     await panel.getByRole('button', {name: 'View friends', exact: true}).press('Enter');
  240 |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  241 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(2);
  242 |     await expectNativeTransitionsSettled(page);
  243 |     await writeFile(info.outputPath('friends-native.json'), JSON.stringify({motion, geometry, writeNames: writes.map(write => write.name), unexpected, runtimeErrors}, null, 2));
  244 |     expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  245 |   });
  246 |   test(`Friends confirming-read revocation and session exit (${motion})`, async ({page}, info) => {
  247 |     // The sender revokes after receive succeeds but before the confirming inbox read.
  248 |     const revokedToken = 'd'.repeat(64);
  249 |     const {panel, writes, unexpected, runtimeErrors, counters, inboxRelease, releaseInbox, releaseLogout} = await setupFriends(page, motion, revokedToken);
  250 |     try {
  251 |       await expect.poll(() => typeof inboxRelease()).toBe('function');
  252 |       await expect(panel.getByRole('status')).toContainText('Updating your request');
  253 |       await expect(panel.getByRole('button', {name: 'Accept', exact: true})).toHaveCount(0);
  254 |       await expect(panel.getByRole('button', {name: 'Decline', exact: true})).toHaveCount(0);
  255 |     } finally {releaseInbox();}
  256 |     await expect(panel.getByRole('alert')).toContainText('This invitation is unavailable');
  257 |     await expect(panel.getByRole('button', {name: 'Retry', exact: true})).toHaveCount(0);
  258 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toHaveCount(0);
  259 |     await expectNativeTransitionsSettled(page);
  260 |     await expectNoBlockingAxeViolations(page);
  261 |     expect(writes.filter(write => write.name === 'receive_friend_invitation' && write.body['p_claim_token'] === revokedToken)).toHaveLength(1);
  262 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(0);
  263 |     await panel.screenshot({path: info.outputPath('friends-review-revoked.png'), animations: 'disabled'});
  264 |     // Canonical account actions live in Settings. Leaving Friends must destroy
  265 |     // its secret state; Back during a held real SDK signout must stay protected.
  266 |     if ((page.viewportSize()?.width ?? 0) > 760) {
  267 |       await page.getByRole('complementary', {name: 'Desktop sidebar'}).getByRole('link', {name: 'Settings', exact: true}).press('Enter');
  268 |     } else {
  269 |       await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
  270 |       await page.getByRole('dialog', {name: 'Navigation menu', exact: true}).getByRole('link', {name: 'Settings', exact: true}).press('Enter');
  271 |     }
  272 |     await expect(page).toHaveURL(/\/new\/settings\/account$/);
  273 |     await expect(panel).toHaveCount(0);
  274 |     await page.getByRole('button', {name: 'Log out', exact: true}).press('Enter');
  275 |     try {
  276 |       await expect.poll(() => counters().authLogouts).toBe(1);
  277 |       await page.goBack();
  278 |       await expect(page).toHaveURL(/\/new\/login(?:[/?#]|$)/);
  279 |       await expect(panel.locator('.invitation-url, .qr-slot img, .friend-row')).toHaveCount(0);
  280 |     } finally {releaseLogout();}
  281 |     await expect(page).toHaveURL(/\/new\/login(?:[/?#]|$)/);
  282 |     await expect(panel.locator('.invitation-url, .qr-slot img')).toHaveCount(0);
  283 |     expect(counters().authLogouts).toBe(1);
  284 |     await page.goBack();
  285 |     await expect(page).toHaveURL(/\/new\/login(?:[/?#]|$)/);
  286 |     await expect(panel.locator('.invitation-url, .qr-slot img')).toHaveCount(0);
  287 |     expect(counters().authLogouts).toBe(1);
  288 |     try {await expectNativeNavigationRecovery(page);}
  289 |     finally {
  290 |       const transitions = await page.evaluate(() => (window as unknown as {analytifyNativeTransitionProbe: unknown}).analytifyNativeTransitionProbe);
  291 |       await writeFile(info.outputPath('friends-transitions.json'), JSON.stringify(transitions, null, 2));
  292 |     }
  293 |     await writeFile(info.outputPath('friends-session.json'), JSON.stringify({motion, ...counters(), writeNames: writes.map(write => write.name), unexpected, runtimeErrors}, null, 2));
  294 |     expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  295 |   });
  296 | }
  297 | 
```