# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends invitations and responsive geometry (reduce)
- Location: e2e/design-v2-friends.spec.ts:205:7

# Error details

```
Error: expect(locator).toHaveCSS(expected) failed

Locator:  locator('v2-friends-page').locator('.confirmation-layer')
Expected: "0s"
Received: "1e-05s"
Timeout:  5000ms

Call log:
  - Expect "toHaveCSS" locator('v2-friends-page').locator('.confirmation-layer') with timeout 5000ms
  - waiting for locator('v2-friends-page').locator('.confirmation-layer')
    14 × locator resolved to <div class="confirmation-layer" _ngcontent-ng-c1345351098="">…</div>
       - unexpected value "1e-05s"

```

```yaml
- dialog "Remove Suzkapu?":
  - heading "Remove Suzkapu?" [level=2]
  - paragraph: Removes this person from your friends. You can send a new friend request later.
  - button "Remove friend"
  - button "Cancel"
```

# Test source

```ts
  118 |     await page.setViewportSize(viewport);
  119 |     await page.evaluate(() => document.fonts.ready);
  120 |     await panel.screenshot({path: info.outputPath(`candidate-friends-ready-${name}.png`), animations: 'disabled', scale: 'css'});
  121 |     await expect(panel).toHaveScreenshot(`friends-ready-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  122 |   }
  123 |   await writeFile(info.outputPath('friends-ready-geometry.json'), JSON.stringify({canonical, pointerVariants: pointerCanonical.variants, samples}, null, 2));
  124 |   for (const sample of samples) {
  125 |     const reference = canonical.find((item: {viewport: string}) => item.viewport === (sample.width <= 760 ? 'mobile' : 'desktop'));
  126 |     const pointerReference = pointerCanonical.variants.find((item: {variants: {State: string; Pointer: string}}) =>
  127 |       item.variants.State === 'Default' && item.variants.Pointer === (sample.coarsePointer ? 'Coarse' : 'Fine'));
  128 |     expect(sample.scrollWidth).toBeLessThanOrEqual(sample.width);
  129 |     const tabReference = sample.width === 1440 ? tabCanonical.desktop : tabCanonical.mobile;
  130 |     for (const [index, tab] of sample.tabs.entries()) {
  131 |       expect(tab.height).toBe(tabReference.children[index].height);
  132 |       expect(tab.paddingLeft).toBe(tabReference.children[index].paddingLeft);
  133 |       const expectedWidth = tabReference.children[index].width - (sample.width === 320 ? 35 : 0);
  134 |       expect(tab.width).toBe(expectedWidth);
  135 |     }
  136 |     for (const [index, row] of sample.rows.entries()) {
  137 |       expect(row.height).toBe(pointerReference.height);
  138 |       expect(row.action.width).toBe(pointerReference.action[0].width);
  139 |       expect(row.action.height).toBe(pointerReference.action[0].height);
  140 |       expect(row.action.borderColor).toBe('rgb(107, 125, 113)');
  141 |       expect(row.width).toBe(sample.width === 320 ? 288 : reference.rows[0].width);
  142 |       if (index) expect(row.y - sample.rows[index - 1].y - sample.rows[index - 1].height).toBe(reference.gap);
  143 |     }
  144 |   }
  145 |   await expectNoBlockingAxeViolations(page);
  146 |   expect(writes).toEqual([]); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  147 | });
  148 | 
  149 | test('Friends secondary content has deterministic canonical visual candidates', async ({page}, info) => {
  150 |   await page.addInitScript(() => {
  151 |     const original = crypto.getRandomValues.bind(crypto);
  152 |     let sequence = 0;
  153 |     Object.defineProperty(crypto, 'getRandomValues', {value: (array: Uint8Array) => {
  154 |       if (!(array instanceof Uint8Array) || array.length !== 32) return original(array);
  155 |       sequence++;
  156 |       array.forEach((_, index) => {array[index] = (sequence * 37 + index) % 256;});
  157 |       return array;
  158 |     }});
  159 |   });
  160 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce');
  161 |   const controls = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-controls-canonical.json', 'utf8'));
  162 |   const frameIds: Record<string, readonly string[]> = {add: ['192:11619', '192:11744'], invitations: ['192:11835', '192:11960'], review: ['192:12051', '192:12176']};
  163 |   const capture = async (state: string) => {
  164 |     await expectNativeTransitionsSettled(page);
  165 |     await page.evaluate(() => document.fonts.ready);
  166 |     for (const [name, viewport] of [['desktop', {width: 1440, height: 1000}], ['mobile', {width: 390, height: 1000}]] as const) {
  167 |       await page.setViewportSize(viewport);
  168 |       await page.mouse.move(0, 0);
  169 |       const reference = controls.screens.find((screen: {id: string}) => screen.id === frameIds[state][name === 'desktop' ? 0 : 1]);
  170 |       const tabs = await panel.locator('.friends-tabs a').evaluateAll(elements => elements.map(element => ({width: element.getBoundingClientRect().width,
  171 |         paddingLeft: parseFloat(getComputedStyle(element).paddingLeft)})));
  172 |       expect.soft(tabs).toEqual(reference.children.map((child: {width: number; paddingLeft: number}) => ({width: child.width, paddingLeft: child.paddingLeft})));
  173 |       if (state === 'invitations') {
  174 |         const revoke = panel.getByRole('button', {name: 'Revoke', exact: true});
  175 |         await expect.soft(revoke).toHaveCSS('background-color', 'rgb(24, 32, 25)');
  176 |         await expect.soft(revoke).toHaveCSS('border-color', 'rgb(255, 116, 125)');
  177 |       }
  178 |       await expectNoBlockingAxeViolations(page);
  179 |       expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  180 |       await panel.screenshot({path: info.outputPath(`candidate-friends-${state}-${name}.png`), animations: 'disabled', scale: 'css'});
  181 |       await expect(panel).toHaveScreenshot(`friends-${state}-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  182 |     }
  183 |   };
  184 |   await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  185 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  186 |   await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  187 |   await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  188 |   await panel.getByRole('button', {name: 'Create new invitation', exact: true}).click();
  189 |   await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  190 |   await capture('add');
  191 |   await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  192 |   await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  193 |   await capture('invitations');
  194 |   await page.goto('/new/friends/invite/' + 'b'.repeat(64));
  195 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  196 |   await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  197 |   await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  198 |   await capture('review');
  199 |   expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  200 |   expect(writes.filter(write => write.name === 'respond_friend_request')).toEqual([]);
  201 |   expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  202 | });
  203 | 
  204 | for (const motion of ['no-preference', 'reduce'] as const) {
  205 |   test(`Friends invitations and responsive geometry (${motion})`, async ({page}, info) => {
  206 |     const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, motion);
  207 |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  208 |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toBeVisible();
  209 |     await expectNativeTransitionsSettled(page);
  210 |     await expectNoBlockingAxeViolations(page);
  211 |     await panel.getByRole('button', {name: 'Decline', exact: true}).press('Enter');
  212 |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toHaveCount(0);
  213 |     expect(writes).toEqual([{name: 'respond_friend_request', body: {p_invitation_id: '44444444-4444-4444-8444-444444444444', p_accept: false}}]);
  214 |     const manage = panel.getByRole('button', {name: 'Manage friend Suzkapu'});
  215 |     await manage.press('Enter'); await panel.getByRole('menuitem', {name: 'Remove friend'}).press('Enter');
  216 |     const dialog = panel.getByRole('dialog', {name: 'Remove Suzkapu?'});
  217 |     await expect(dialog).toBeVisible();
> 218 |     await expect(panel.locator('.confirmation-layer')).toHaveCSS('animation-duration', motion === 'reduce' ? '0s' : '0.15s');
      |                                                        ^ Error: expect(locator).toHaveCSS(expected) failed
  219 |     await expect(dialog.locator('.icon.trash')).toHaveCount(1);
  220 |     await expect(dialog.getByRole('button')).toHaveText(['Remove friend', 'Cancel']);
  221 |     await expect(dialog).toHaveAccessibleDescription('Removes this person from your friends. You can send a new friend request later.');
  222 |     await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  223 |     await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', {name: 'Remove friend', exact: true})).toBeFocused();
  224 |     await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  225 |     const geometry = [];
  226 |     for (const height of [480, 1000]) for (const width of [320, 360, 390, 767, 768, 1024, 1440, 1920]) {
  227 |       await page.setViewportSize({width, height});
  228 |       await expect(dialog).toBeVisible();
  229 |       const sample = await dialog.evaluate(element => {
  230 |         const rect = element.getBoundingClientRect();
  231 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
  232 |           backdropFilter: getComputedStyle(document.querySelector('.confirmation-backdrop')!).backdropFilter};
  233 |       });
  234 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  235 |       expect(sample.x).toBeGreaterThanOrEqual(0); expect(sample.right).toBeLessThanOrEqual(width);
  236 |       expect(sample.y).toBeGreaterThanOrEqual(0); expect(sample.bottom).toBeLessThanOrEqual(height);
  237 |       expect(sample.right - sample.x).toBe(272);
  238 |       expect(sample.backdropFilter).toBe('blur(12px)'); geometry.push(sample);
  239 |     }
  240 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(manage).toBeFocused();
  241 |     expect(writes).toHaveLength(1);
  242 |     if (info.project.name === 'mobile') await page.setViewportSize({width: 390, height: 900});
  243 |     await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  244 |     const qr = panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'});
  245 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  246 |     await expect(panel.getByRole('button', {name: 'Retry', exact: true}).locator('.sync')).toHaveCSS('width', '18px');
  247 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  248 |     await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  249 |     await expect(qr).toHaveCount(0);
  250 |     const consumedCreations = writes.filter(write => write.name === 'create_friend_invitation');
  251 |     expect(consumedCreations).toHaveLength(2);
  252 |     expect(consumedCreations[1].body).toEqual(consumedCreations[0].body);
  253 |     await expectNoBlockingAxeViolations(page);
  254 |     await panel.screenshot({path: info.outputPath('friends-owner-inactive.png'), animations: 'disabled'});
  255 |     await panel.getByRole('button', {name: 'Create new invitation', exact: true}).press('Enter');
  256 |     await expect(qr).toBeVisible();
  257 |     await expect(qr).toHaveJSProperty('naturalWidth', 176); await expect(qr).toHaveJSProperty('naturalHeight', 176);
  258 |     const copy = panel.getByRole('button', {name: 'Copy link', exact: true});
  259 |     await expect(copy).toHaveCSS('font-size', '14px');
  260 |     await expect(copy).toHaveCSS('font-weight', '600');
  261 |     await expect(copy).toHaveCSS('line-height', '20px');
  262 |     await expect.soft(panel.locator('.qr-identity .identity')).toHaveCSS('gap', '12px');
  263 |     const creations = writes.filter(write => write.name === 'create_friend_invitation');
  264 |     expect(creations).toHaveLength(3); expect(creations[2].body.p_claim_token).toMatch(/^[a-f0-9]{64}$/);
  265 |     expect(creations[2].body.p_claim_token).not.toBe(creations[0].body.p_claim_token);
  266 |     const expectedUrl = `http://127.0.0.1:4214/new/friends/invite/${creations[2].body.p_claim_token}`;
  267 |     await expect(panel.locator('.invitation-url')).toHaveText(expectedUrl);
  268 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  269 |     await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  270 |     for (const width of [1440, 390]) {
  271 |       await page.setViewportSize({width, height: 900});
  272 |       const actions = await panel.locator('.friends-card .actions').evaluate(element => [...element.children].map(child => child.getBoundingClientRect().width));
  273 |       expect.soft(actions).toEqual(width === 1440 ? [180, 112] : [160, 112]);
  274 |     }
  275 |     await panel.getByRole('link', {name: 'View link & QR'}).click(); await expect(qr).toBeVisible();
  276 |     expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  277 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  278 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  279 |     await page.evaluate(() => document.fonts.ready);
  280 |     await panel.screenshot({path: info.outputPath('friends-add.png'), animations: 'disabled'});
  281 |     const incomingToken = 'b'.repeat(64);
  282 |     await page.goto('/new/friends/invite/' + incomingToken);
  283 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  284 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  285 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  286 |     await expect.soft(panel.locator('.friends-card > p')).toHaveCSS('font-size', '16px');
  287 |     await expect.soft(panel.locator('.friends-card > p')).toHaveCSS('line-height', '24px');
  288 |     for (const width of [1440, 390]) {
  289 |       await page.setViewportSize({width, height: 900});
  290 |       const actions = await panel.locator('.friends-card .actions').evaluate(element => [...element.children].map(child => child.getBoundingClientRect().width));
  291 |       expect.soft(actions).toEqual(width === 1440 ? [200, 120] : [155, 157]);
  292 |     }
  293 |     expect(writes.filter(write => write.name === 'receive_friend_invitation').map(write => write.body))
  294 |       .toEqual([{p_claim_token: incomingToken}, {p_claim_token: incomingToken}]);
  295 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(1);
  296 |     await expectNoBlockingAxeViolations(page);
  297 |     await panel.screenshot({path: info.outputPath('friends-review-recovered.png'), animations: 'disabled'});
  298 |     const accept = motion === 'no-preference';
  299 |     await panel.getByRole('button', {name: accept ? 'Accept' : 'Decline', exact: true}).press('Enter');
  300 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toHaveCount(0);
  301 |     await expect(panel.getByRole('status')).toContainText(accept ? 'Friend request accepted' : 'Friend request declined');
  302 |     const actionStyle = await panel.getByRole('button', {name: 'View friends', exact: true}).evaluate(element => {
  303 |       const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
  304 |       return {width: rect.width, height: rect.height, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight};
  305 |     });
  306 |     expect(actionStyle).toEqual({width: 260, height: 48, fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
  307 |     expect(writes.at(-1)).toEqual({name: 'respond_friend_request', body: {p_invitation_id: '77777777-7777-4777-8777-777777777777', p_accept: accept}});
  308 |     await expectNoBlockingAxeViolations(page);
  309 |     await panel.screenshot({path: info.outputPath('friends-outcome.png'), animations: 'disabled'});
  310 |     await panel.getByRole('button', {name: 'View friends', exact: true}).press('Enter');
  311 |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  312 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(2);
  313 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  314 |     await expect(panel.locator('.invitation-icon')).toHaveCSS('background-color', 'rgb(6, 19, 11)');
  315 |     const revoke = panel.getByRole('button', {name: 'Revoke', exact: true});
  316 |     await revoke.press('Enter');
  317 |     const revokeDialog = panel.getByRole('dialog', {name: 'Revoke friend invitation?', exact: true});
  318 |     await expect(revokeDialog).toHaveAccessibleDescription('Disables this invitation’s private link and QR code. Existing friendships are unchanged.');
```