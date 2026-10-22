# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends ready content preserves canonical card geometry during resizing
- Location: e2e/design-v2-friends.spec.ts:90:5

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 1
+ Received  + 3

- Array []
+ Array [
+   "/api.spotify.com/v1/me due to access control checks.",
+ ]
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
        - generic [ref=f2e40]:
          - article [ref=f2e41]:
            - generic [aria-hidden] [ref=f2e42]: S
            - generic [ref=f2e43]:
              - heading "Suzkapu" [level=2] [ref=f2e44]
              - paragraph [ref=f2e45]: Connected
            - button "Manage friend Suzkapu" [ref=f2e48] [cursor=pointer]:
              - generic [aria-hidden] [ref=f2e49]: 
          - article [ref=f2e50]:
            - generic [aria-hidden] [ref=f2e51]: D
            - generic [ref=f2e52]:
              - heading "Daniel_P" [level=2] [ref=f2e53]
              - paragraph [ref=f2e54]: Connected
            - button "Manage friend Daniel_P" [ref=f2e57] [cursor=pointer]:
              - generic [aria-hidden] [ref=f2e58]: 
          - article [ref=f2e59]:
            - generic [aria-hidden] [ref=f2e60]: A
            - generic [ref=f2e61]:
              - heading "Alex" [level=2] [ref=f2e62]
              - paragraph [ref=f2e63]: Connected
            - button "Manage friend Alex" [ref=f2e66] [cursor=pointer]:
              - generic [aria-hidden] [ref=f2e67]: 
        - paragraph [ref=f2e68]: Friendship does not grant access to your playlists or listening data. You choose what to share.
  - navigation "Primary navigation" [ref=f2e69]:
    - link "Playlists" [ref=f2e70] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f2e71]: 
    - link "Stats" [ref=f2e73] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f2e74]: 
    - link "History" [ref=f2e76] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f2e77]: 
  - contentinfo [ref=f2e79]:
    - generic [ref=f2e80]: Powered by Spotify
    - generic [ref=f2e81]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e82] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
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
  102 |   const pointerCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-touch-canonical.json', 'utf8'));
  103 |   const samples = [];
  104 |   for (const width of [1440, 390, 320]) for (const height of [480, 1000]) {
  105 |     await page.setViewportSize({width, height});
  106 |     const sample = await panel.evaluate(element => ({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  107 |       coarsePointer: matchMedia('(pointer: coarse)').matches,
  108 |       rows: [...element.querySelectorAll('.friend-row')].map(row => {
  109 |         const bounds = row.getBoundingClientRect();
  110 |         return {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height};
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
  126 |       expect(row.width).toBe(sample.width === 320 ? 288 : reference.rows[0].width);
  127 |       if (index) expect(row.y - sample.rows[index - 1].y - sample.rows[index - 1].height).toBe(reference.gap);
  128 |     }
  129 |   }
  130 |   await expectNoBlockingAxeViolations(page);
> 131 |   expect(writes).toEqual([]); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
      |                                                                                     ^ Error: expect(received).toEqual(expected) // deep equality
  132 | });
  133 | 
  134 | for (const motion of ['no-preference', 'reduce'] as const) {
  135 |   test(`Friends invitations and responsive geometry (${motion})`, async ({page}, info) => {
  136 |     const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, motion);
  137 |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  138 |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toBeVisible();
  139 |     await expectNativeTransitionsSettled(page);
  140 |     await expectNoBlockingAxeViolations(page);
  141 |     await panel.getByRole('button', {name: 'Decline', exact: true}).press('Enter');
  142 |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toHaveCount(0);
  143 |     expect(writes).toEqual([{name: 'respond_friend_request', body: {p_invitation_id: '44444444-4444-4444-8444-444444444444', p_accept: false}}]);
  144 |     const manage = panel.getByRole('button', {name: 'Manage friend Suzkapu'});
  145 |     await manage.press('Enter'); await panel.getByRole('menuitem', {name: 'Remove friend'}).press('Enter');
  146 |     const dialog = panel.getByRole('dialog', {name: 'Remove Suzkapu?'});
  147 |     await expect(dialog).toBeVisible();
  148 |     await expect(dialog.getByRole('button')).toHaveText(['Remove friend', 'Cancel']);
  149 |     await expect(dialog).toHaveAccessibleDescription('Removes this person from your friends. You can send a new friend request later.');
  150 |     await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  151 |     await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', {name: 'Remove friend', exact: true})).toBeFocused();
  152 |     await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  153 |     const geometry = [];
  154 |     for (const height of [480, 1000]) for (const width of [320, 360, 390, 767, 768, 1024, 1440, 1920]) {
  155 |       await page.setViewportSize({width, height});
  156 |       await expect(dialog).toBeVisible();
  157 |       const sample = await dialog.evaluate(element => {
  158 |         const rect = element.getBoundingClientRect();
  159 |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
  160 |           backdropFilter: getComputedStyle(document.querySelector('.confirmation-backdrop')!).backdropFilter};
  161 |       });
  162 |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  163 |       expect(sample.x).toBeGreaterThanOrEqual(0); expect(sample.right).toBeLessThanOrEqual(width);
  164 |       expect(sample.y).toBeGreaterThanOrEqual(0); expect(sample.bottom).toBeLessThanOrEqual(height);
  165 |       expect(sample.backdropFilter).toBe('blur(12px)'); geometry.push(sample);
  166 |     }
  167 |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(manage).toBeFocused();
  168 |     expect(writes).toHaveLength(1);
  169 |     if (info.project.name === 'mobile') await page.setViewportSize({width: 390, height: 900});
  170 |     await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  171 |     const qr = panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'});
  172 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  173 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  174 |     await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  175 |     await expect(qr).toHaveCount(0);
  176 |     const consumedCreations = writes.filter(write => write.name === 'create_friend_invitation');
  177 |     expect(consumedCreations).toHaveLength(2);
  178 |     expect(consumedCreations[1].body).toEqual(consumedCreations[0].body);
  179 |     await expectNoBlockingAxeViolations(page);
  180 |     await panel.screenshot({path: info.outputPath('friends-owner-inactive.png'), animations: 'disabled'});
  181 |     await panel.getByRole('button', {name: 'Create new invitation', exact: true}).press('Enter');
  182 |     await expect(qr).toBeVisible();
  183 |     await expect(qr).toHaveJSProperty('naturalWidth', 176); await expect(qr).toHaveJSProperty('naturalHeight', 176);
  184 |     const copy = panel.getByRole('button', {name: 'Copy link', exact: true});
  185 |     await expect(copy).toHaveCSS('font-size', '14px');
  186 |     await expect(copy).toHaveCSS('font-weight', '600');
  187 |     await expect(copy).toHaveCSS('line-height', '20px');
  188 |     const creations = writes.filter(write => write.name === 'create_friend_invitation');
  189 |     expect(creations).toHaveLength(3); expect(creations[2].body.p_claim_token).toMatch(/^[a-f0-9]{64}$/);
  190 |     expect(creations[2].body.p_claim_token).not.toBe(creations[0].body.p_claim_token);
  191 |     const expectedUrl = `http://127.0.0.1:4214/new/friends/invite/${creations[2].body.p_claim_token}`;
  192 |     await expect(panel.locator('.invitation-url')).toHaveText(expectedUrl);
  193 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  194 |     await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  195 |     await panel.getByRole('link', {name: 'View link & QR'}).click(); await expect(qr).toBeVisible();
  196 |     expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  197 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  198 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  199 |     await page.evaluate(() => document.fonts.ready);
  200 |     await panel.screenshot({path: info.outputPath('friends-add.png'), animations: 'disabled'});
  201 |     const incomingToken = 'b'.repeat(64);
  202 |     await page.goto('/new/friends/invite/' + incomingToken);
  203 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  204 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  205 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  206 |     expect(writes.filter(write => write.name === 'receive_friend_invitation').map(write => write.body))
  207 |       .toEqual([{p_claim_token: incomingToken}, {p_claim_token: incomingToken}]);
  208 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(1);
  209 |     await expectNoBlockingAxeViolations(page);
  210 |     await panel.screenshot({path: info.outputPath('friends-review-recovered.png'), animations: 'disabled'});
  211 |     const accept = motion === 'no-preference';
  212 |     await panel.getByRole('button', {name: accept ? 'Accept' : 'Decline', exact: true}).press('Enter');
  213 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toHaveCount(0);
  214 |     await expect(panel.getByRole('status')).toContainText(accept ? 'Friend request accepted' : 'Friend request declined');
  215 |     const actionStyle = await panel.getByRole('button', {name: 'View friends', exact: true}).evaluate(element => {
  216 |       const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
  217 |       return {width: rect.width, height: rect.height, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight};
  218 |     });
  219 |     expect(actionStyle).toEqual({width: 260, height: 48, fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
  220 |     expect(writes.at(-1)).toEqual({name: 'respond_friend_request', body: {p_invitation_id: '77777777-7777-4777-8777-777777777777', p_accept: accept}});
  221 |     await expectNoBlockingAxeViolations(page);
  222 |     await panel.screenshot({path: info.outputPath('friends-outcome.png'), animations: 'disabled'});
  223 |     await panel.getByRole('button', {name: 'View friends', exact: true}).press('Enter');
  224 |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  225 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(2);
  226 |     await expectNativeTransitionsSettled(page);
  227 |     await writeFile(info.outputPath('friends-native.json'), JSON.stringify({motion, geometry, writeNames: writes.map(write => write.name), unexpected, runtimeErrors}, null, 2));
  228 |     expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  229 |   });
  230 |   test(`Friends confirming-read revocation and session exit (${motion})`, async ({page}, info) => {
  231 |     // The sender revokes after receive succeeds but before the confirming inbox read.
```