# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends invitations and responsive geometry (reduce)
- Location: e2e/design-v2-friends.spec.ts:205:7

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 272
Received: 288
```

# Page snapshot

```yaml
- generic [ref=f1e5]:
  - link [aria-hidden] [ref=f1e6] [cursor=pointer]:
    - /url: "#v2-main-content"
    - text: Skip to main content
  - text:       
  - banner [aria-hidden] [ref=f1e7]:
    - generic [ref=f1e8]:
      - link [ref=f1e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f1e10]: Analytify
      - button [ref=f1e12] [cursor=pointer]:
        - generic [aria-hidden] [ref=f1e13]: 
        - generic [ref=f1e14]: Menu
  - main "Your friends content" [ref=f1e15]:
    - generic [ref=f1e17]:
      - generic [ref=f1e19]:
        - generic [ref=f1e21]:
          - heading [level=1] [ref=f1e23]: Your friends
          - paragraph [ref=f1e24]: Share playlists, invite friends and discover music together.
        - generic [ref=f1e25]:
          - navigation [ref=f1e26]:
            - link [ref=f1e27] [cursor=pointer]:
              - /url: /new/friends
              - text: Friends
            - link [ref=f1e29] [cursor=pointer]:
              - /url: /new/friends/invitations
              - text: Invitations
          - link [ref=f1e31] [cursor=pointer]:
            - /url: /new/friends/add
            - text: Add friend
          - article [ref=f1e34]:
            - generic [aria-hidden] [ref=f1e35]: S
            - generic [ref=f1e36]:
              - heading [level=2] [ref=f1e37]: Suzkapu
              - paragraph [ref=f1e38]: Connected
            - button [ref=f1e41] [cursor=pointer]
          - paragraph [ref=f1e42]: Friendship does not grant access to your playlists or listening data. You choose what to share.
      - generic [ref=f1e43]:
        - button [aria-hidden] [ref=f1e44] [cursor=pointer]
        - dialog [ref=f1e45]:
          - heading "Remove Suzkapu?" [level=2] [ref=f1e46]
          - paragraph [ref=f1e47]: Removes this person from your friends. You can send a new friend request later.
          - button "Remove friend" [ref=f1e48] [cursor=pointer]
          - button "Cancel" [active] [ref=f1e50] [cursor=pointer]
  - navigation [aria-hidden] [ref=f1e51]:
    - link [ref=f1e52] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e53]: 
      - generic [ref=f1e54]: Playlists
    - link [ref=f1e55] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e56]: 
      - generic [ref=f1e57]: Stats
    - link [ref=f1e58] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e59]: 
      - generic [ref=f1e60]: History
  - contentinfo [aria-hidden] [ref=f1e61]:
    - generic [ref=f1e62]: Powered by Spotify
    - generic [ref=f1e63]: Artwork and metadata belong to their owners.
    - link [ref=f1e64] [cursor=pointer]:
      - /url: /new/legal
      - text: Legal & privacy
```

# Test source

```ts
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
  218 |     await expect(dialog.getByRole('button')).toHaveText(['Remove friend', 'Cancel']);
  219 |     await expect(dialog).toHaveAccessibleDescription('Removes this person from your friends. You can send a new friend request later.');
  220 |     await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  221 |     await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', {name: 'Remove friend', exact: true})).toBeFocused();
  222 |     await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  223 |     const geometry = [];
  224 |     for (const height of [480, 1000]) for (const width of [320, 360, 390, 767, 768, 1024, 1440, 1920]) {
  225 |       await page.setViewportSize({width, height});
  226 |       await expect(dialog).toBeVisible();
  227 |       const sample = await dialog.evaluate(element => {
  228 |         const rect = element.getBoundingClientRect();
  229 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
  230 |           backdropFilter: getComputedStyle(document.querySelector('.confirmation-backdrop')!).backdropFilter};
  231 |       });
  232 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  233 |       expect(sample.x).toBeGreaterThanOrEqual(0); expect(sample.right).toBeLessThanOrEqual(width);
  234 |       expect(sample.y).toBeGreaterThanOrEqual(0); expect(sample.bottom).toBeLessThanOrEqual(height);
> 235 |       expect(sample.right - sample.x).toBe(272);
      |                                       ^ Error: expect(received).toBe(expected) // Object.is equality
  236 |       expect(sample.backdropFilter).toBe('blur(12px)'); geometry.push(sample);
  237 |     }
  238 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(manage).toBeFocused();
  239 |     expect(writes).toHaveLength(1);
  240 |     if (info.project.name === 'mobile') await page.setViewportSize({width: 390, height: 900});
  241 |     await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  242 |     const qr = panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'});
  243 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  244 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  245 |     await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  246 |     await expect(qr).toHaveCount(0);
  247 |     const consumedCreations = writes.filter(write => write.name === 'create_friend_invitation');
  248 |     expect(consumedCreations).toHaveLength(2);
  249 |     expect(consumedCreations[1].body).toEqual(consumedCreations[0].body);
  250 |     await expectNoBlockingAxeViolations(page);
  251 |     await panel.screenshot({path: info.outputPath('friends-owner-inactive.png'), animations: 'disabled'});
  252 |     await panel.getByRole('button', {name: 'Create new invitation', exact: true}).press('Enter');
  253 |     await expect(qr).toBeVisible();
  254 |     await expect(qr).toHaveJSProperty('naturalWidth', 176); await expect(qr).toHaveJSProperty('naturalHeight', 176);
  255 |     const copy = panel.getByRole('button', {name: 'Copy link', exact: true});
  256 |     await expect(copy).toHaveCSS('font-size', '14px');
  257 |     await expect(copy).toHaveCSS('font-weight', '600');
  258 |     await expect(copy).toHaveCSS('line-height', '20px');
  259 |     await expect.soft(panel.locator('.qr-identity .identity')).toHaveCSS('gap', '12px');
  260 |     const creations = writes.filter(write => write.name === 'create_friend_invitation');
  261 |     expect(creations).toHaveLength(3); expect(creations[2].body.p_claim_token).toMatch(/^[a-f0-9]{64}$/);
  262 |     expect(creations[2].body.p_claim_token).not.toBe(creations[0].body.p_claim_token);
  263 |     const expectedUrl = `http://127.0.0.1:4214/new/friends/invite/${creations[2].body.p_claim_token}`;
  264 |     await expect(panel.locator('.invitation-url')).toHaveText(expectedUrl);
  265 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  266 |     await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  267 |     for (const width of [1440, 390]) {
  268 |       await page.setViewportSize({width, height: 900});
  269 |       const actions = await panel.locator('.friends-card .actions').evaluate(element => [...element.children].map(child => child.getBoundingClientRect().width));
  270 |       expect.soft(actions).toEqual(width === 1440 ? [180, 112] : [160, 112]);
  271 |     }
  272 |     await panel.getByRole('link', {name: 'View link & QR'}).click(); await expect(qr).toBeVisible();
  273 |     expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  274 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  275 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  276 |     await page.evaluate(() => document.fonts.ready);
  277 |     await panel.screenshot({path: info.outputPath('friends-add.png'), animations: 'disabled'});
  278 |     const incomingToken = 'b'.repeat(64);
  279 |     await page.goto('/new/friends/invite/' + incomingToken);
  280 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  281 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  282 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  283 |     await expect.soft(panel.locator('.friends-card > p')).toHaveCSS('font-size', '16px');
  284 |     await expect.soft(panel.locator('.friends-card > p')).toHaveCSS('line-height', '24px');
  285 |     for (const width of [1440, 390]) {
  286 |       await page.setViewportSize({width, height: 900});
  287 |       const actions = await panel.locator('.friends-card .actions').evaluate(element => [...element.children].map(child => child.getBoundingClientRect().width));
  288 |       expect.soft(actions).toEqual(width === 1440 ? [200, 120] : [155, 157]);
  289 |     }
  290 |     expect(writes.filter(write => write.name === 'receive_friend_invitation').map(write => write.body))
  291 |       .toEqual([{p_claim_token: incomingToken}, {p_claim_token: incomingToken}]);
  292 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(1);
  293 |     await expectNoBlockingAxeViolations(page);
  294 |     await panel.screenshot({path: info.outputPath('friends-review-recovered.png'), animations: 'disabled'});
  295 |     const accept = motion === 'no-preference';
  296 |     await panel.getByRole('button', {name: accept ? 'Accept' : 'Decline', exact: true}).press('Enter');
  297 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toHaveCount(0);
  298 |     await expect(panel.getByRole('status')).toContainText(accept ? 'Friend request accepted' : 'Friend request declined');
  299 |     const actionStyle = await panel.getByRole('button', {name: 'View friends', exact: true}).evaluate(element => {
  300 |       const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
  301 |       return {width: rect.width, height: rect.height, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight};
  302 |     });
  303 |     expect(actionStyle).toEqual({width: 260, height: 48, fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
  304 |     expect(writes.at(-1)).toEqual({name: 'respond_friend_request', body: {p_invitation_id: '77777777-7777-4777-8777-777777777777', p_accept: accept}});
  305 |     await expectNoBlockingAxeViolations(page);
  306 |     await panel.screenshot({path: info.outputPath('friends-outcome.png'), animations: 'disabled'});
  307 |     await panel.getByRole('button', {name: 'View friends', exact: true}).press('Enter');
  308 |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  309 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(2);
  310 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  311 |     await expect(panel.locator('.invitation-icon')).toHaveCSS('background-color', 'rgb(6, 19, 11)');
  312 |     const revoke = panel.getByRole('button', {name: 'Revoke', exact: true});
  313 |     await revoke.press('Enter');
  314 |     const revokeDialog = panel.getByRole('dialog', {name: 'Revoke friend invitation?', exact: true});
  315 |     await expect(revokeDialog).toHaveAccessibleDescription('Disables this invitation’s private link and QR code. Existing friendships are unchanged.');
  316 |     await expect(revokeDialog.getByRole('button')).toHaveText(['Revoke invitation', 'Cancel']);
  317 |     await expect(revokeDialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  318 |     expect(writes.filter(write => write.name === 'revoke_friend_invitation')).toEqual([]);
  319 |     const revokeGeometry = [];
  320 |     for (const width of [320, 390, 768, 1440]) for (const height of [480, 1000]) {
  321 |       await page.setViewportSize({width, height});
  322 |       const sample = await revokeDialog.evaluate(element => {
  323 |         const bounds = element.getBoundingClientRect();
  324 |         return {width: innerWidth, height: innerHeight, x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom,
  325 |           scrollWidth: document.documentElement.scrollWidth, backdropFilter: getComputedStyle(document.querySelector('.confirmation-backdrop')!).backdropFilter};
  326 |       });
  327 |       expect(sample.x).toBeGreaterThanOrEqual(0); expect(sample.y).toBeGreaterThanOrEqual(0);
  328 |       expect(sample.right).toBeLessThanOrEqual(width); expect(sample.bottom).toBeLessThanOrEqual(height);
  329 |       expect(sample.right - sample.x).toBe(272);
  330 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width); expect(sample.backdropFilter).toBe('blur(12px)');
  331 |       revokeGeometry.push(sample);
  332 |     }
  333 |     await expectNoBlockingAxeViolations(page);
  334 |     await page.keyboard.press('Tab'); await expect(revokeDialog.getByRole('button', {name: 'Revoke invitation', exact: true})).toBeFocused();
  335 |     await page.keyboard.press('Shift+Tab'); await expect(revokeDialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
```