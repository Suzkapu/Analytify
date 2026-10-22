# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends ready content preserves canonical card geometry during resizing
- Location: e2e/design-v2-friends.spec.ts:90:5

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: 12
Received: 16
```

# Page snapshot

```yaml
- generic [ref=f2e5]:
  - link "Skip to main content" [ref=f2e6] [cursor=pointer]:
    - /url: "#v2-main-content"
  - text:       
  - banner [ref=f2e7]:
    - generic [ref=f2e8]:
      - link "Analytify playlists" [ref=f2e9] [cursor=pointer]:
        - /url: /new/playlists
        - generic [ref=f2e10]: Analytify
      - button "Open navigation menu" [ref=f2e12] [cursor=pointer]:
        - generic [aria-hidden] [ref=f2e13]: 
        - generic [ref=f2e14]: Menu
  - main "Your friends content" [ref=f2e15]:
    - generic [ref=f2e19]:
      - generic [ref=f2e21]:
        - heading "Your friends" [level=1] [ref=f2e23]
        - paragraph [ref=f2e24]: Share playlists, invite friends and discover music together.
      - generic [ref=f2e25]:
        - navigation "Friends navigation" [ref=f2e26]:
          - link "Friends" [ref=f2e27] [cursor=pointer]:
            - /url: /new/friends
          - link "Invitations" [ref=f2e29] [cursor=pointer]:
            - /url: /new/friends/invitations
            - generic [aria-hidden] [ref=f2e30]: 
            - text: Invitations
        - link "Add friend" [ref=f2e31] [cursor=pointer]:
          - /url: /new/friends/add
        - region "Friend request from Paulzgi" [ref=f2e33]:
          - heading "Friend request from Paulzgi" [level=2] [ref=f2e34]
          - generic [ref=f2e35]:
            - button "Accept" [ref=f2e36] [cursor=pointer]
            - button "Decline" [ref=f2e38] [cursor=pointer]:
              - generic [aria-hidden] [ref=f2e39]: 
              - text: Decline
        - article [ref=f2e40]:
          - generic [aria-hidden] [ref=f2e41]: S
          - generic [ref=f2e42]:
            - heading "Suzkapu" [level=2] [ref=f2e43]
            - paragraph [ref=f2e44]: Connected
          - button "Manage friend Suzkapu" [ref=f2e47] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e48]: 
        - article [ref=f2e49]:
          - generic [aria-hidden] [ref=f2e50]: D
          - generic [ref=f2e51]:
            - heading "Daniel_P" [level=2] [ref=f2e52]
            - paragraph [ref=f2e53]: Connected
          - button "Manage friend Daniel_P" [ref=f2e56] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e57]: 
        - article [ref=f2e58]:
          - generic [aria-hidden] [ref=f2e59]: A
          - generic [ref=f2e60]:
            - heading "Alex" [level=2] [ref=f2e61]
            - paragraph [ref=f2e62]: Connected
          - button "Manage friend Alex" [ref=f2e65] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e66]: 
        - paragraph [ref=f2e67]: Friendship does not grant access to your playlists or listening data. You choose what to share.
  - navigation "Primary navigation" [ref=f2e68]:
    - link "Playlists" [ref=f2e69] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f2e70]: 
    - link "Stats" [ref=f2e72] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f2e73]: 
    - link "History" [ref=f2e75] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f2e76]: 
  - contentinfo [ref=f2e78]:
    - generic [ref=f2e79]: Powered by Spotify
    - generic [ref=f2e80]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e81] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  23  |   const unexpected: string[] = []; const runtimeErrors: string[] = [];
  24  |   page.on('pageerror', error => runtimeErrors.push(error.message));
  25  |   await page.route('http://127.0.0.1:54321/**', async route => {
  26  |     const path = new URL(route.request().url()).pathname;
  27  |     if (path === '/auth/v1/user') return route.fulfill({json: {id: actor, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}});
  28  |     if (path === '/auth/v1/logout') {
  29  |       authLogouts++;
  30  |       await new Promise<void>(resolve => {releaseLogout = resolve;});
  31  |       return route.fulfill({status: 204, body: ''});
  32  |     }
  33  |     if (path === '/rest/v1/users') return route.fulfill({json: null});
  34  |     const name = path.split('/').at(-1)!;
  35  |     if (name === 'get_public_site_settings') return route.fulfill({json: {}});
  36  |     if (name === 'is_app_admin') return route.fulfill({json: false});
  37  |     if (name === 'list_friends') return route.fulfill({json: friends});
  38  |     if (name === 'list_friend_requests') {
  39  |       if (revokeDuringConfirmation) {
  40  |         await new Promise<void>(resolve => {releaseInbox = resolve;});
  41  |         revokeDuringConfirmation = false;
  42  |         requests = [];
  43  |       }
  44  |       return route.fulfill({json: requests});
  45  |     }
  46  |     if (name === 'list_friend_invitations') return route.fulfill({json: invitations});
  47  |     const body = route.request().postDataJSON();
  48  |     if (name === 'receive_friend_invitation') {
  49  |       writes.push({name, body});
  50  |       if (failReceive) {
  51  |         failReceive = false;
  52  |         return route.fulfill({status: 503, json: {message: 'Synthetic transport interruption'}});
  53  |       }
  54  |       const incoming = {requestId: '77777777-7777-4777-8777-777777777777', inviterUserId: '66666666-6666-4666-8666-666666666666', displayName: 'Incoming friend', imageUrl: '', createdAt: '2026-10-12'};
  55  |       requests = [incoming];
  56  |       if (revokedToken) revokeDuringConfirmation = true;
  57  |       return route.fulfill({json: {id: incoming.requestId, inviterUserId: incoming.inviterUserId, displayName: incoming.displayName, imageUrl: ''}});
  58  |     }
  59  |     if (name === 'respond_friend_request') {
  60  |       writes.push({name, body}); requests = [];
  61  |       return route.fulfill({json: {id: body.p_invitation_id, status: body.p_accept ? 'accepted' : 'declined', isConnected: body.p_accept}});
  62  |     }
  63  |     if (name === 'create_friend_invitation') {
  64  |       writes.push({name, body});
  65  |       createAttempts++;
  66  |       if (createAttempts === 1) return route.fulfill({status: 503, json: {message: 'Synthetic unconfirmed creation'}});
  67  |       const invitation = {id: '55555555-5555-4555-8555-555555555555', status: createAttempts === 2 ? 'accepted' : 'pending', createdAt: '2026-10-12'};
  68  |       invitations = [invitation]; return route.fulfill({json: invitation});
  69  |     }
  70  |     if (name === 'revoke_friend_invitation') {
  71  |       writes.push({name, body}); invitations = []; return route.fulfill({json: null});
  72  |     }
  73  |     if (name === 'remove_friend') {
  74  |       writes.push({name, body}); friends = []; return route.fulfill({json: null});
  75  |     }
  76  |     unexpected.push(`${route.request().method()} ${path}`); return route.abort('blockedbyclient');
  77  |   });
  78  |   await seedAuthenticatedBrowser(page, {cloudIdentity: true});
  79  |   await page.evaluate(actorId => {
  80  |     const exp = Math.floor(Date.now() / 1000) + 3600;
  81  |     const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  82  |     localStorage.setItem('sb-127-auth-token', JSON.stringify({access_token: `${encode({alg: 'HS256', typ: 'JWT'})}.${encode({sub: actorId, role: 'authenticated', exp})}.fixture-signature`, refresh_token: 'synthetic-refresh-only', token_type: 'bearer', expires_at: exp, expires_in: 3600, user: {id: actorId, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}}));
  83  |   }, actor);
  84  |   await page.goto(revokedToken ? '/new/friends/invite/' + revokedToken : '/new/friends');
  85  |   const panel = page.locator('v2-friends-page');
  86  |   return {panel, writes, unexpected, runtimeErrors, counters: () => ({authLogouts}),
  87  |     inboxRelease: () => releaseInbox, releaseInbox: () => releaseInbox?.(), releaseLogout: () => releaseLogout?.()};
  88  | }
  89  | 
  90  | test('Friends ready content preserves canonical card geometry during resizing', async ({page}, info) => {
  91  |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce');
  92  |   const friends = ['Suzkapu', 'Daniel_P', 'Alex'].map((displayName, index) => ({
  93  |     userId: `${index + 2}2222222-2222-4222-8222-222222222222`, displayName, imageUrl: '', connectedAt: '2026-10-11',
  94  |     connectionVersion: `${index + 3}3333333-3333-4333-8333-333333333333`
  95  |   }));
  96  |   await page.route('http://127.0.0.1:54321/rest/v1/rpc/list_friends', route => route.fulfill({json: friends}));
  97  |   await page.reload();
  98  |   await expect(panel.locator('.friend-row')).toHaveCount(3);
  99  |   await expectNativeTransitionsSettled(page);
  100 |   const envelope = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-row-current-canonical.json', 'utf8'));
  101 |   const canonical = JSON.parse(envelope.content.find((item: {type: string}) => item.type === 'text').text);
  102 |   const samples = [];
  103 |   for (const width of [1440, 390, 320]) for (const height of [480, 1000]) {
  104 |     await page.setViewportSize({width, height});
  105 |     const sample = await panel.evaluate(element => ({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  106 |       rows: [...element.querySelectorAll('.friend-row')].map(row => {
  107 |         const bounds = row.getBoundingClientRect();
  108 |         return {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height};
  109 |       })}));
  110 |     samples.push(sample);
  111 |   }
  112 |   for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
  113 |     await page.setViewportSize(viewport);
  114 |     await panel.screenshot({path: info.outputPath(`candidate-friends-ready-${name}.png`), animations: 'disabled', scale: 'css'});
  115 |   }
  116 |   await writeFile(info.outputPath('friends-ready-geometry.json'), JSON.stringify({canonical, samples}, null, 2));
  117 |   for (const sample of samples) {
  118 |     const reference = canonical.find((item: {viewport: string}) => item.viewport === (sample.width <= 760 ? 'mobile' : 'desktop'));
  119 |     expect(sample.scrollWidth).toBeLessThanOrEqual(sample.width);
  120 |     for (const [index, row] of sample.rows.entries()) {
  121 |       expect(row.height).toBe(reference.rows[0].height);
  122 |       expect(row.width).toBe(sample.width === 320 ? 288 : reference.rows[0].width);
> 123 |       if (index) expect(row.y - sample.rows[index - 1].y - sample.rows[index - 1].height).toBe(reference.gap);
      |                                                                                           ^ Error: expect(received).toBe(expected) // Object.is equality
  124 |     }
  125 |   }
  126 |   await expectNoBlockingAxeViolations(page);
  127 |   expect(writes).toEqual([]); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  128 | });
  129 | 
  130 | for (const motion of ['no-preference', 'reduce'] as const) {
  131 |   test(`Friends invitations and responsive geometry (${motion})`, async ({page}, info) => {
  132 |     const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, motion);
  133 |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  134 |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toBeVisible();
  135 |     await expectNativeTransitionsSettled(page);
  136 |     await expectNoBlockingAxeViolations(page);
  137 |     await panel.getByRole('button', {name: 'Decline', exact: true}).press('Enter');
  138 |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toHaveCount(0);
  139 |     expect(writes).toEqual([{name: 'respond_friend_request', body: {p_invitation_id: '44444444-4444-4444-8444-444444444444', p_accept: false}}]);
  140 |     const manage = panel.getByRole('button', {name: 'Manage friend Suzkapu'});
  141 |     await manage.press('Enter'); await panel.getByRole('menuitem', {name: 'Remove friend'}).press('Enter');
  142 |     const dialog = panel.getByRole('dialog', {name: 'Remove Suzkapu?'});
  143 |     await expect(dialog).toBeVisible();
  144 |     await expect(dialog.getByRole('button')).toHaveText(['Remove friend', 'Cancel']);
  145 |     await expect(dialog).toHaveAccessibleDescription('Removes this person from your friends. You can send a new friend request later.');
  146 |     await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  147 |     await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', {name: 'Remove friend', exact: true})).toBeFocused();
  148 |     await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  149 |     const geometry = [];
  150 |     for (const height of [480, 1000]) for (const width of [320, 360, 390, 767, 768, 1024, 1440, 1920]) {
  151 |       await page.setViewportSize({width, height});
  152 |       await expect(dialog).toBeVisible();
  153 |       const sample = await dialog.evaluate(element => {
  154 |         const rect = element.getBoundingClientRect();
  155 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
  156 |           backdropFilter: getComputedStyle(document.querySelector('.confirmation-backdrop')!).backdropFilter};
  157 |       });
  158 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  159 |       expect(sample.x).toBeGreaterThanOrEqual(0); expect(sample.right).toBeLessThanOrEqual(width);
  160 |       expect(sample.y).toBeGreaterThanOrEqual(0); expect(sample.bottom).toBeLessThanOrEqual(height);
  161 |       expect(sample.backdropFilter).toBe('blur(12px)'); geometry.push(sample);
  162 |     }
  163 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(manage).toBeFocused();
  164 |     expect(writes).toHaveLength(1);
  165 |     if (info.project.name === 'mobile') await page.setViewportSize({width: 390, height: 900});
  166 |     await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  167 |     const qr = panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'});
  168 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  169 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  170 |     await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  171 |     await expect(qr).toHaveCount(0);
  172 |     const consumedCreations = writes.filter(write => write.name === 'create_friend_invitation');
  173 |     expect(consumedCreations).toHaveLength(2);
  174 |     expect(consumedCreations[1].body).toEqual(consumedCreations[0].body);
  175 |     await expectNoBlockingAxeViolations(page);
  176 |     await panel.screenshot({path: info.outputPath('friends-owner-inactive.png'), animations: 'disabled'});
  177 |     await panel.getByRole('button', {name: 'Create new invitation', exact: true}).press('Enter');
  178 |     await expect(qr).toBeVisible();
  179 |     await expect(qr).toHaveJSProperty('naturalWidth', 176); await expect(qr).toHaveJSProperty('naturalHeight', 176);
  180 |     const copy = panel.getByRole('button', {name: 'Copy link', exact: true});
  181 |     await expect(copy).toHaveCSS('font-size', '14px');
  182 |     await expect(copy).toHaveCSS('font-weight', '600');
  183 |     await expect(copy).toHaveCSS('line-height', '20px');
  184 |     const creations = writes.filter(write => write.name === 'create_friend_invitation');
  185 |     expect(creations).toHaveLength(3); expect(creations[2].body.p_claim_token).toMatch(/^[a-f0-9]{64}$/);
  186 |     expect(creations[2].body.p_claim_token).not.toBe(creations[0].body.p_claim_token);
  187 |     const expectedUrl = `http://127.0.0.1:4214/new/friends/invite/${creations[2].body.p_claim_token}`;
  188 |     await expect(panel.locator('.invitation-url')).toHaveText(expectedUrl);
  189 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  190 |     await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  191 |     await panel.getByRole('link', {name: 'View link & QR'}).click(); await expect(qr).toBeVisible();
  192 |     expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  193 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  194 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  195 |     await page.evaluate(() => document.fonts.ready);
  196 |     await panel.screenshot({path: info.outputPath('friends-add.png'), animations: 'disabled'});
  197 |     const incomingToken = 'b'.repeat(64);
  198 |     await page.goto('/new/friends/invite/' + incomingToken);
  199 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  200 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  201 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  202 |     expect(writes.filter(write => write.name === 'receive_friend_invitation').map(write => write.body))
  203 |       .toEqual([{p_claim_token: incomingToken}, {p_claim_token: incomingToken}]);
  204 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(1);
  205 |     await expectNoBlockingAxeViolations(page);
  206 |     await panel.screenshot({path: info.outputPath('friends-review-recovered.png'), animations: 'disabled'});
  207 |     const accept = motion === 'no-preference';
  208 |     await panel.getByRole('button', {name: accept ? 'Accept' : 'Decline', exact: true}).press('Enter');
  209 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toHaveCount(0);
  210 |     await expect(panel.getByRole('status')).toContainText(accept ? 'Friend request accepted' : 'Friend request declined');
  211 |     const actionStyle = await panel.getByRole('button', {name: 'View friends', exact: true}).evaluate(element => {
  212 |       const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
  213 |       return {width: rect.width, height: rect.height, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight};
  214 |     });
  215 |     expect(actionStyle).toEqual({width: 260, height: 48, fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
  216 |     expect(writes.at(-1)).toEqual({name: 'respond_friend_request', body: {p_invitation_id: '77777777-7777-4777-8777-777777777777', p_accept: accept}});
  217 |     await expectNoBlockingAxeViolations(page);
  218 |     await panel.screenshot({path: info.outputPath('friends-outcome.png'), animations: 'disabled'});
  219 |     await panel.getByRole('button', {name: 'View friends', exact: true}).press('Enter');
  220 |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  221 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(2);
  222 |     await expectNativeTransitionsSettled(page);
  223 |     await writeFile(info.outputPath('friends-native.json'), JSON.stringify({motion, geometry, writeNames: writes.map(write => write.name), unexpected, runtimeErrors}, null, 2));
```