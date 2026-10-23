# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends action icons retain canonical active and secondary semantic paints
- Location: e2e/design-v2-friends.spec.ts:108:5

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  - 2
+ Received  + 2

  Object {
    "addPeople": "rgb(162, 173, 166)",
    "addPlus": "rgb(162, 173, 166)",
-   "confirmationTrash": "rgb(162, 173, 166)",
+   "confirmationTrash": "rgb(255, 116, 125)",
    "copy": "rgb(6, 19, 11)",
    "readyPeople": "rgb(6, 19, 11)",
    "readyPlus": "rgb(162, 173, 166)",
    "revokeTrash": "rgb(255, 116, 125)",
-   "viewQr": "rgb(162, 173, 166)",
+   "viewQr": "rgb(245, 247, 245)",
  }
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
  - main "Your friends content" [ref=f1e48]:
    - generic [ref=f1e52]:
      - generic [ref=f1e54]:
        - heading "Your friends" [level=1] [ref=f1e56]
        - paragraph [ref=f1e57]: Share playlists, invite friends and discover music together.
      - generic [ref=f1e58]:
        - navigation "Friends navigation" [ref=f1e59]:
          - link "Friends" [ref=f1e60] [cursor=pointer]:
            - /url: /new/friends
          - link "Invitations" [ref=f1e62] [cursor=pointer]:
            - /url: /new/friends/invitations
        - link "Add friend" [ref=f1e64] [cursor=pointer]:
          - /url: /new/friends/add
        - region "Friend request from Paulzgi" [ref=f1e66]:
          - heading "Friend request from Paulzgi" [level=2] [ref=f1e67]
          - generic [ref=f1e68]:
            - button "Accept" [ref=f1e69] [cursor=pointer]
            - button "Decline" [ref=f1e71] [cursor=pointer]
        - article [ref=f1e73]:
          - generic [aria-hidden] [ref=f1e74]: S
          - generic [ref=f1e75]:
            - heading "Suzkapu" [level=2] [ref=f1e76]
            - paragraph [ref=f1e77]: Connected
          - button "Manage friend Suzkapu" [active] [ref=f1e80] [cursor=pointer]
        - paragraph [ref=f1e81]: Friendship does not grant access to your playlists or listening data. You choose what to share.
  - text:   
  - contentinfo [ref=f1e82]:
    - generic [ref=f1e83]: Powered by Spotify
    - generic [ref=f1e84]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e85] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  33  |     if (path === '/auth/v1/user') return route.fulfill({json: {id: actor, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}});
  34  |     if (path === '/auth/v1/logout') {
  35  |       authLogouts++;
  36  |       await new Promise<void>(resolve => {releaseLogout = resolve;});
  37  |       return route.fulfill({status: 204, body: ''});
  38  |     }
  39  |     if (path === '/rest/v1/users') return route.fulfill({json: null});
  40  |     const name = path.split('/').at(-1)!;
  41  |     if (name === 'get_public_site_settings') return route.fulfill({json: {}});
  42  |     if (name === 'is_app_admin') return route.fulfill({json: false});
  43  |     if (name === 'list_friends') {
  44  |       const read = ++friendsReads;
  45  |       if (controls.holdInitialReads && read <= 2) {
  46  |         await new Promise<void>(resolve => {releaseFriendsRead = resolve;});
  47  |         releaseFriendsRead = undefined;
  48  |         if (read === 1) return route.fulfill({status: 503, json: {message: 'Synthetic cold inventory interruption'}});
  49  |       }
  50  |       return route.fulfill({json: friends});
  51  |     }
  52  |     if (name === 'list_friend_requests') {
  53  |       if (revokeDuringConfirmation) {
  54  |         await new Promise<void>(resolve => {releaseInbox = resolve;});
  55  |         revokeDuringConfirmation = false;
  56  |         requests = [];
  57  |       }
  58  |       return route.fulfill({json: requests});
  59  |     }
  60  |     if (name === 'list_friend_invitations') return route.fulfill({json: invitations});
  61  |     const body = route.request().postDataJSON();
  62  |     if (name === 'receive_friend_invitation') {
  63  |       writes.push({name, body});
  64  |       if (failReceive) {
  65  |         failReceive = false;
  66  |         return route.fulfill({status: 503, json: {message: 'Synthetic transport interruption'}});
  67  |       }
  68  |       const incoming = {requestId: '77777777-7777-4777-8777-777777777777', inviterUserId: '66666666-6666-4666-8666-666666666666', displayName: 'Incoming friend', imageUrl: '', createdAt: '2026-10-12'};
  69  |       requests = [incoming];
  70  |       if (revokedToken) revokeDuringConfirmation = true;
  71  |       return route.fulfill({json: {id: incoming.requestId, inviterUserId: incoming.inviterUserId, displayName: incoming.displayName, imageUrl: ''}});
  72  |     }
  73  |     if (name === 'respond_friend_request') {
  74  |       writes.push({name, body});
  75  |       if (controls.holdResponse) await new Promise<void>(resolve => {releaseResponse = resolve;});
  76  |       requests = [];
  77  |       return route.fulfill({json: {id: body.p_invitation_id, status: body.p_accept ? 'accepted' : 'declined', isConnected: body.p_accept}});
  78  |     }
  79  |     if (name === 'create_friend_invitation') {
  80  |       writes.push({name, body});
  81  |       createAttempts++;
  82  |       if (createAttempts === 1) return route.fulfill({status: 503, json: {message: 'Synthetic unconfirmed creation'}});
  83  |       const invitation = {id: '55555555-5555-4555-8555-555555555555', status: createAttempts === 2 ? 'accepted' : 'pending', createdAt: '2026-10-12'};
  84  |       invitations = [invitation]; return route.fulfill({json: invitation});
  85  |     }
  86  |     if (name === 'revoke_friend_invitation') {
  87  |       writes.push({name, body}); invitations = []; return route.fulfill({json: null});
  88  |     }
  89  |     if (name === 'remove_friend') {
  90  |       writes.push({name, body}); friends = []; return route.fulfill({json: null});
  91  |     }
  92  |     unexpected.push(`${route.request().method()} ${path}`); return route.abort('blockedbyclient');
  93  |   });
  94  |   await seedAuthenticatedBrowser(page, {cloudIdentity: true});
  95  |   await page.evaluate(actorId => {
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
  108 | test('Friends action icons retain canonical active and secondary semantic paints', async ({page}, info) => {
  109 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce');
  110 |   await expect(panel.locator('.friend-row')).toHaveCount(1);
  111 |   const glyphPaint = (selector: string) => panel.locator(selector).evaluate(element => getComputedStyle(element, '::before').backgroundColor);
  112 |   const readyPeople = await glyphPaint('.friends-tabs .people');
  113 |   const readyPlus = await glyphPaint('.add-friend .plus');
  114 |   await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  115 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  116 |   const addPeople = await glyphPaint('.friends-tabs .people');
  117 |   const addPlus = await glyphPaint('.add-friend .plus');
  118 |   await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  119 |   await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  120 |   await panel.getByRole('button', {name: 'Create new invitation', exact: true}).press('Enter');
  121 |   await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  122 |   const copy = await glyphPaint('.copy-icon');
  123 |   await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  124 |   const viewQr = await glyphPaint('.pending-invitation .qr-icon');
  125 |   const revokeTrash = await glyphPaint('.pending-invitation .trash');
  126 |   await panel.getByRole('link', {name: 'Friends', exact: true}).click();
  127 |   await panel.getByRole('button', {name: 'Manage friend Suzkapu', exact: true}).press('Enter');
  128 |   await panel.getByRole('menuitem', {name: 'Remove friend', exact: true}).press('Enter');
  129 |   const confirmationTrash = await glyphPaint('.confirmation .trash');
  130 |   await page.keyboard.press('Escape'); await expect(panel.getByRole('dialog')).toHaveCount(0);
  131 |   const paints = {readyPeople, readyPlus, addPeople, addPlus, copy, viewQr, revokeTrash, confirmationTrash};
  132 |   await writeFile(info.outputPath('friends-icon-paints.json'), JSON.stringify(paints, null, 2));
> 133 |   expect(paints).toEqual({readyPeople: 'rgb(6, 19, 11)', readyPlus: 'rgb(162, 173, 166)', addPeople: 'rgb(162, 173, 166)', addPlus: 'rgb(162, 173, 166)', copy: 'rgb(6, 19, 11)', viewQr: 'rgb(162, 173, 166)', revokeTrash: 'rgb(255, 116, 125)', confirmationTrash: 'rgb(162, 173, 166)'});
      |                  ^ Error: expect(received).toEqual(expected) // deep equality
  134 |   expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  135 |   expect(writes.some(write => write.name === 'remove_friend' || write.name === 'revoke_friend_invitation')).toBe(false);
  136 |   expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  137 | });
  138 | 
  139 | test('Friends ready content preserves canonical card geometry during resizing', async ({page}, info) => {
  140 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce', undefined, ['Suzkapu', 'Daniel_P', 'Alex']);
  141 |   await expect(panel.locator('.friend-row')).toHaveCount(3);
  142 |   await expectNativeTransitionsSettled(page);
  143 |   const envelope = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-row-current-canonical.json', 'utf8'));
  144 |   const canonical = JSON.parse(envelope.content.find((item: {type: string}) => item.type === 'text').text);
  145 |   const pointerCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-touch-canonical.json', 'utf8'));
  146 |   const tabCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-parity-ready-tab-sizing.json', 'utf8'));
  147 |   const samples = [];
  148 |   for (const width of [1440, 390, 320]) for (const height of [480, 1000]) {
  149 |     await page.setViewportSize({width, height});
  150 |     const sample = await panel.evaluate(element => ({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  151 |       coarsePointer: matchMedia('(pointer: coarse)').matches,
  152 |       tabs: [...element.querySelectorAll<HTMLElement>('.friends-tabs a')].map(tab => ({width: tab.getBoundingClientRect().width,
  153 |         height: tab.getBoundingClientRect().height, paddingLeft: parseFloat(getComputedStyle(tab).paddingLeft)})),
  154 |       rows: [...element.querySelectorAll('.friend-row')].map(row => {
  155 |         const bounds = row.getBoundingClientRect();
  156 |         const action = row.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
  157 |         const actionBounds = action.getBoundingClientRect();
  158 |         return {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
  159 |           action: {width: actionBounds.width, height: actionBounds.height, borderColor: getComputedStyle(action).borderColor}};
  160 |       })}));
  161 |     samples.push(sample);
  162 |   }
  163 |   for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
  164 |     await page.setViewportSize(viewport);
  165 |     await page.evaluate(() => document.fonts.ready);
  166 |     await panel.screenshot({path: info.outputPath(`candidate-friends-ready-${name}.png`), animations: 'disabled', scale: 'css'});
  167 |     await expect(panel).toHaveScreenshot(`friends-ready-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  168 |   }
  169 |   await writeFile(info.outputPath('friends-ready-geometry.json'), JSON.stringify({canonical, pointerVariants: pointerCanonical.variants, samples}, null, 2));
  170 |   for (const sample of samples) {
  171 |     const reference = canonical.find((item: {viewport: string}) => item.viewport === (sample.width <= 760 ? 'mobile' : 'desktop'));
  172 |     const pointerReference = pointerCanonical.variants.find((item: {variants: {State: string; Pointer: string}}) =>
  173 |       item.variants.State === 'Default' && item.variants.Pointer === (sample.coarsePointer ? 'Coarse' : 'Fine'));
  174 |     expect(sample.scrollWidth).toBeLessThanOrEqual(sample.width);
  175 |     const tabReference = sample.width === 1440 ? tabCanonical.desktop : tabCanonical.mobile;
  176 |     for (const [index, tab] of sample.tabs.entries()) {
  177 |       expect(tab.height).toBe(tabReference.children[index].height);
  178 |       expect(tab.paddingLeft).toBe(tabReference.children[index].paddingLeft);
  179 |       const expectedWidth = tabReference.children[index].width - (sample.width === 320 ? 35 : 0);
  180 |       expect(tab.width).toBe(expectedWidth);
  181 |     }
  182 |     for (const [index, row] of sample.rows.entries()) {
  183 |       expect(row.height).toBe(pointerReference.height);
  184 |       expect(row.action.width).toBe(pointerReference.action[0].width);
  185 |       expect(row.action.height).toBe(pointerReference.action[0].height);
  186 |       expect(row.action.borderColor).toBe('rgb(107, 125, 113)');
  187 |       expect(row.width).toBe(sample.width === 320 ? 288 : reference.rows[0].width);
  188 |       if (index) expect(row.y - sample.rows[index - 1].y - sample.rows[index - 1].height).toBe(reference.gap);
  189 |     }
  190 |   }
  191 |   await expectNoBlockingAxeViolations(page);
  192 |   expect(writes).toEqual([]); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  193 | });
  194 | 
  195 | test('Friends secondary content has deterministic canonical visual candidates', async ({page}, info) => {
  196 |   await page.addInitScript(() => {
  197 |     const original = crypto.getRandomValues.bind(crypto);
  198 |     let sequence = 0;
  199 |     Object.defineProperty(crypto, 'getRandomValues', {value: (array: Uint8Array) => {
  200 |       if (!(array instanceof Uint8Array) || array.length !== 32) return original(array);
  201 |       sequence++;
  202 |       array.forEach((_, index) => {array[index] = (sequence * 37 + index) % 256;});
  203 |       return array;
  204 |     }});
  205 |   });
  206 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce');
  207 |   const controls = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-controls-canonical.json', 'utf8'));
  208 |   const frameIds: Record<string, readonly string[]> = {add: ['192:11619', '192:11744'], invitations: ['192:11835', '192:11960'], review: ['192:12051', '192:12176']};
  209 |   const capture = async (state: string) => {
  210 |     await expectNativeTransitionsSettled(page);
  211 |     await page.evaluate(() => document.fonts.ready);
  212 |     for (const [name, viewport] of [['desktop', {width: 1440, height: 1000}], ['mobile', {width: 390, height: 1000}]] as const) {
  213 |       await page.setViewportSize(viewport);
  214 |       await page.mouse.move(0, 0);
  215 |       const reference = controls.screens.find((screen: {id: string}) => screen.id === frameIds[state][name === 'desktop' ? 0 : 1]);
  216 |       const tabs = await panel.locator('.friends-tabs a').evaluateAll(elements => elements.map(element => ({width: element.getBoundingClientRect().width,
  217 |         paddingLeft: parseFloat(getComputedStyle(element).paddingLeft)})));
  218 |       expect.soft(tabs).toEqual(reference.children.map((child: {width: number; paddingLeft: number}) => ({width: child.width, paddingLeft: child.paddingLeft})));
  219 |       if (state === 'invitations') {
  220 |         const revoke = panel.getByRole('button', {name: 'Revoke', exact: true});
  221 |         await expect.soft(revoke).toHaveCSS('background-color', 'rgb(24, 32, 25)');
  222 |         await expect.soft(revoke).toHaveCSS('border-color', 'rgb(255, 116, 125)');
  223 |       }
  224 |       await expectNoBlockingAxeViolations(page);
  225 |       expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  226 |       await panel.screenshot({path: info.outputPath(`candidate-friends-${state}-${name}.png`), animations: 'disabled', scale: 'css'});
  227 |       await expect(panel).toHaveScreenshot(`friends-${state}-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  228 |     }
  229 |   };
  230 |   await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  231 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  232 |   await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  233 |   await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
```