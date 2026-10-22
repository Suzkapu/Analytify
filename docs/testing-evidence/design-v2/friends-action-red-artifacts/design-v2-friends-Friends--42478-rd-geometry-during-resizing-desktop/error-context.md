# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends ready content preserves canonical card geometry during resizing
- Location: e2e/design-v2-friends.spec.ts:93:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 88
Received: 44
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
            - generic [aria-hidden] [ref=f1e30]: 
            - text: Invitations
        - link "Add friend" [ref=f1e31] [cursor=pointer]:
          - /url: /new/friends/add
        - region "Friend request from Paulzgi" [ref=f1e33]:
          - heading "Friend request from Paulzgi" [level=2] [ref=f1e34]
          - generic [ref=f1e35]:
            - button "Accept" [ref=f1e36] [cursor=pointer]
            - button "Decline" [ref=f1e38] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e39]: 
              - text: Decline
        - generic [ref=f1e40]:
          - article [ref=f1e41]:
            - generic [aria-hidden] [ref=f1e42]: S
            - generic [ref=f1e43]:
              - heading "Suzkapu" [level=2] [ref=f1e44]
              - paragraph [ref=f1e45]: Connected
            - button "Manage friend Suzkapu" [ref=f1e48] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e49]: 
          - article [ref=f1e50]:
            - generic [aria-hidden] [ref=f1e51]: D
            - generic [ref=f1e52]:
              - heading "Daniel_P" [level=2] [ref=f1e53]
              - paragraph [ref=f1e54]: Connected
            - button "Manage friend Daniel_P" [ref=f1e57] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e58]: 
          - article [ref=f1e59]:
            - generic [aria-hidden] [ref=f1e60]: A
            - generic [ref=f1e61]:
              - heading "Alex" [level=2] [ref=f1e62]
              - paragraph [ref=f1e63]: Connected
            - button "Manage friend Alex" [ref=f1e66] [cursor=pointer]:
              - generic [aria-hidden] [ref=f1e67]: 
        - paragraph [ref=f1e68]: Friendship does not grant access to your playlists or listening data. You choose what to share.
  - navigation "Primary navigation" [ref=f1e69]:
    - link "Playlists" [ref=f1e70] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e71]: 
    - link "Stats" [ref=f1e73] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e74]: 
    - link "History" [ref=f1e76] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e77]: 
  - contentinfo [ref=f1e79]:
    - generic [ref=f1e80]: Powered by Spotify
    - generic [ref=f1e81]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e82] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  26  |   const unexpected: string[] = []; const runtimeErrors: string[] = [];
  27  |   page.on('pageerror', error => runtimeErrors.push(error.message));
  28  |   await page.route('http://127.0.0.1:54321/**', async route => {
  29  |     const path = new URL(route.request().url()).pathname;
  30  |     if (path === '/auth/v1/user') return route.fulfill({json: {id: actor, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}});
  31  |     if (path === '/auth/v1/logout') {
  32  |       authLogouts++;
  33  |       await new Promise<void>(resolve => {releaseLogout = resolve;});
  34  |       return route.fulfill({status: 204, body: ''});
  35  |     }
  36  |     if (path === '/rest/v1/users') return route.fulfill({json: null});
  37  |     const name = path.split('/').at(-1)!;
  38  |     if (name === 'get_public_site_settings') return route.fulfill({json: {}});
  39  |     if (name === 'is_app_admin') return route.fulfill({json: false});
  40  |     if (name === 'list_friends') return route.fulfill({json: friends});
  41  |     if (name === 'list_friend_requests') {
  42  |       if (revokeDuringConfirmation) {
  43  |         await new Promise<void>(resolve => {releaseInbox = resolve;});
  44  |         revokeDuringConfirmation = false;
  45  |         requests = [];
  46  |       }
  47  |       return route.fulfill({json: requests});
  48  |     }
  49  |     if (name === 'list_friend_invitations') return route.fulfill({json: invitations});
  50  |     const body = route.request().postDataJSON();
  51  |     if (name === 'receive_friend_invitation') {
  52  |       writes.push({name, body});
  53  |       if (failReceive) {
  54  |         failReceive = false;
  55  |         return route.fulfill({status: 503, json: {message: 'Synthetic transport interruption'}});
  56  |       }
  57  |       const incoming = {requestId: '77777777-7777-4777-8777-777777777777', inviterUserId: '66666666-6666-4666-8666-666666666666', displayName: 'Incoming friend', imageUrl: '', createdAt: '2026-10-12'};
  58  |       requests = [incoming];
  59  |       if (revokedToken) revokeDuringConfirmation = true;
  60  |       return route.fulfill({json: {id: incoming.requestId, inviterUserId: incoming.inviterUserId, displayName: incoming.displayName, imageUrl: ''}});
  61  |     }
  62  |     if (name === 'respond_friend_request') {
  63  |       writes.push({name, body}); requests = [];
  64  |       return route.fulfill({json: {id: body.p_invitation_id, status: body.p_accept ? 'accepted' : 'declined', isConnected: body.p_accept}});
  65  |     }
  66  |     if (name === 'create_friend_invitation') {
  67  |       writes.push({name, body});
  68  |       createAttempts++;
  69  |       if (createAttempts === 1) return route.fulfill({status: 503, json: {message: 'Synthetic unconfirmed creation'}});
  70  |       const invitation = {id: '55555555-5555-4555-8555-555555555555', status: createAttempts === 2 ? 'accepted' : 'pending', createdAt: '2026-10-12'};
  71  |       invitations = [invitation]; return route.fulfill({json: invitation});
  72  |     }
  73  |     if (name === 'revoke_friend_invitation') {
  74  |       writes.push({name, body}); invitations = []; return route.fulfill({json: null});
  75  |     }
  76  |     if (name === 'remove_friend') {
  77  |       writes.push({name, body}); friends = []; return route.fulfill({json: null});
  78  |     }
  79  |     unexpected.push(`${route.request().method()} ${path}`); return route.abort('blockedbyclient');
  80  |   });
  81  |   await seedAuthenticatedBrowser(page, {cloudIdentity: true});
  82  |   await page.evaluate(actorId => {
  83  |     const exp = Math.floor(Date.now() / 1000) + 3600;
  84  |     const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  85  |     localStorage.setItem('sb-127-auth-token', JSON.stringify({access_token: `${encode({alg: 'HS256', typ: 'JWT'})}.${encode({sub: actorId, role: 'authenticated', exp})}.fixture-signature`, refresh_token: 'synthetic-refresh-only', token_type: 'bearer', expires_at: exp, expires_in: 3600, user: {id: actorId, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}}));
  86  |   }, actor);
  87  |   await page.goto(revokedToken ? '/new/friends/invite/' + revokedToken : '/new/friends');
  88  |   const panel = page.locator('v2-friends-page');
  89  |   return {panel, writes, unexpected, runtimeErrors, counters: () => ({authLogouts}),
  90  |     inboxRelease: () => releaseInbox, releaseInbox: () => releaseInbox?.(), releaseLogout: () => releaseLogout?.()};
  91  | }
  92  | 
  93  | test('Friends ready content preserves canonical card geometry during resizing', async ({page}, info) => {
  94  |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce', undefined, ['Suzkapu', 'Daniel_P', 'Alex']);
  95  |   await expect(panel.locator('.friend-row')).toHaveCount(3);
  96  |   await expectNativeTransitionsSettled(page);
  97  |   const envelope = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-row-current-canonical.json', 'utf8'));
  98  |   const canonical = JSON.parse(envelope.content.find((item: {type: string}) => item.type === 'text').text);
  99  |   const pointerCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-touch-canonical.json', 'utf8'));
  100 |   const samples = [];
  101 |   for (const width of [1440, 390, 320]) for (const height of [480, 1000]) {
  102 |     await page.setViewportSize({width, height});
  103 |     const sample = await panel.evaluate(element => ({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  104 |       coarsePointer: matchMedia('(pointer: coarse)').matches,
  105 |       rows: [...element.querySelectorAll('.friend-row')].map(row => {
  106 |         const bounds = row.getBoundingClientRect();
  107 |         const action = row.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
  108 |         const actionBounds = action.getBoundingClientRect();
  109 |         return {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
  110 |           action: {width: actionBounds.width, height: actionBounds.height, borderColor: getComputedStyle(action).borderColor}};
  111 |       })}));
  112 |     samples.push(sample);
  113 |   }
  114 |   for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
  115 |     await page.setViewportSize(viewport);
  116 |     await panel.screenshot({path: info.outputPath(`candidate-friends-ready-${name}.png`), animations: 'disabled', scale: 'css'});
  117 |   }
  118 |   await writeFile(info.outputPath('friends-ready-geometry.json'), JSON.stringify({canonical, pointerVariants: pointerCanonical.variants, samples}, null, 2));
  119 |   for (const sample of samples) {
  120 |     const reference = canonical.find((item: {viewport: string}) => item.viewport === (sample.width <= 760 ? 'mobile' : 'desktop'));
  121 |     const pointerReference = pointerCanonical.variants.find((item: {variants: {State: string; Pointer: string}}) =>
  122 |       item.variants.State === 'Default' && item.variants.Pointer === (sample.coarsePointer ? 'Coarse' : 'Fine'));
  123 |     expect(sample.scrollWidth).toBeLessThanOrEqual(sample.width);
  124 |     for (const [index, row] of sample.rows.entries()) {
  125 |       expect(row.height).toBe(pointerReference.height);
> 126 |       expect(row.action.width).toBe(pointerReference.action[0].width);
      |                                ^ Error: expect(received).toBe(expected) // Object.is equality
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
  191 |     const creations = writes.filter(write => write.name === 'create_friend_invitation');
  192 |     expect(creations).toHaveLength(3); expect(creations[2].body.p_claim_token).toMatch(/^[a-f0-9]{64}$/);
  193 |     expect(creations[2].body.p_claim_token).not.toBe(creations[0].body.p_claim_token);
  194 |     const expectedUrl = `http://127.0.0.1:4214/new/friends/invite/${creations[2].body.p_claim_token}`;
  195 |     await expect(panel.locator('.invitation-url')).toHaveText(expectedUrl);
  196 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  197 |     await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  198 |     await panel.getByRole('link', {name: 'View link & QR'}).click(); await expect(qr).toBeVisible();
  199 |     expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  200 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  201 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  202 |     await page.evaluate(() => document.fonts.ready);
  203 |     await panel.screenshot({path: info.outputPath('friends-add.png'), animations: 'disabled'});
  204 |     const incomingToken = 'b'.repeat(64);
  205 |     await page.goto('/new/friends/invite/' + incomingToken);
  206 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  207 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  208 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  209 |     expect(writes.filter(write => write.name === 'receive_friend_invitation').map(write => write.body))
  210 |       .toEqual([{p_claim_token: incomingToken}, {p_claim_token: incomingToken}]);
  211 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(1);
  212 |     await expectNoBlockingAxeViolations(page);
  213 |     await panel.screenshot({path: info.outputPath('friends-review-recovered.png'), animations: 'disabled'});
  214 |     const accept = motion === 'no-preference';
  215 |     await panel.getByRole('button', {name: accept ? 'Accept' : 'Decline', exact: true}).press('Enter');
  216 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toHaveCount(0);
  217 |     await expect(panel.getByRole('status')).toContainText(accept ? 'Friend request accepted' : 'Friend request declined');
  218 |     const actionStyle = await panel.getByRole('button', {name: 'View friends', exact: true}).evaluate(element => {
  219 |       const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
  220 |       return {width: rect.width, height: rect.height, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight};
  221 |     });
  222 |     expect(actionStyle).toEqual({width: 260, height: 48, fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
  223 |     expect(writes.at(-1)).toEqual({name: 'respond_friend_request', body: {p_invitation_id: '77777777-7777-4777-8777-777777777777', p_accept: accept}});
  224 |     await expectNoBlockingAxeViolations(page);
  225 |     await panel.screenshot({path: info.outputPath('friends-outcome.png'), animations: 'disabled'});
  226 |     await panel.getByRole('button', {name: 'View friends', exact: true}).press('Enter');
```