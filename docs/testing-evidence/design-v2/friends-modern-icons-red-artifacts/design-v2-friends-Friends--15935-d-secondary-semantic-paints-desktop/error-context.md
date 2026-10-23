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

- Expected  - 3
+ Received  + 3

  Object {
-   "addPeople": "rgb(162, 173, 166)",
-   "addPlus": "rgb(162, 173, 166)",
+   "addPeople": "rgb(245, 247, 245)",
+   "addPlus": "rgb(245, 247, 245)",
    "readyPeople": "rgb(6, 19, 11)",
-   "readyPlus": "rgb(162, 173, 166)",
+   "readyPlus": "rgb(245, 247, 245)",
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
  - main "Add a friend content" [active] [ref=f1e48]:
    - generic [ref=f1e52]:
      - generic [ref=f1e54]:
        - generic [ref=f1e55]:
          - heading "Add a friend" [level=1] [ref=f1e56]
          - button "Back" [ref=f1e57] [cursor=pointer]
        - paragraph [ref=f1e58]: Share your invitation link or let a friend scan your QR code.
      - generic [ref=f1e59]:
        - navigation "Friends navigation" [ref=f1e60]:
          - link "Friends" [ref=f1e61] [cursor=pointer]:
            - /url: /new/friends
          - link "Invitations" [ref=f1e63] [cursor=pointer]:
            - /url: /new/friends/invitations
        - link "Add friend" [ref=f1e65] [cursor=pointer]:
          - /url: /new/friends/add
        - alert [ref=f1e68]:
          - heading "Your change could not be confirmed" [level=3] [ref=f1e69]
          - paragraph [ref=f1e70]: Retry the same request to confirm the result. Your invitation stays private and does not share listening data.
          - button "Retry" [ref=f1e71] [cursor=pointer]
  - text:   
  - contentinfo [ref=f1e73]:
    - generic [ref=f1e74]: Powered by Spotify
    - generic [ref=f1e75]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e76] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  20  |   let failReceive = !revokedToken;
  21  |   let createAttempts = 0;
  22  |   let friendsReads = 0;
  23  |   let releaseFriendsRead: (() => void) | undefined;
  24  |   let releaseResponse: (() => void) | undefined;
  25  |   let authLogouts = 0;
  26  |   let releaseLogout: (() => void) | undefined;
  27  |   let revokeDuringConfirmation = false;
  28  |   let releaseInbox: (() => void) | undefined;
  29  |   const unexpected: string[] = []; const runtimeErrors: string[] = [];
  30  |   page.on('pageerror', error => runtimeErrors.push(error.message));
  31  |   await page.route('http://127.0.0.1:54321/**', async route => {
  32  |     const path = new URL(route.request().url()).pathname;
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
  118 |   const paints = {readyPeople, readyPlus, addPeople, addPlus};
  119 |   await writeFile(info.outputPath('friends-icon-paints.json'), JSON.stringify(paints, null, 2));
> 120 |   expect(paints).toEqual({readyPeople: 'rgb(6, 19, 11)', readyPlus: 'rgb(162, 173, 166)', addPeople: 'rgb(162, 173, 166)', addPlus: 'rgb(162, 173, 166)'});
      |                  ^ Error: expect(received).toEqual(expected) // deep equality
  121 |   expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(1);
  122 |   expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  123 | });
  124 | 
  125 | test('Friends ready content preserves canonical card geometry during resizing', async ({page}, info) => {
  126 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce', undefined, ['Suzkapu', 'Daniel_P', 'Alex']);
  127 |   await expect(panel.locator('.friend-row')).toHaveCount(3);
  128 |   await expectNativeTransitionsSettled(page);
  129 |   const envelope = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-row-current-canonical.json', 'utf8'));
  130 |   const canonical = JSON.parse(envelope.content.find((item: {type: string}) => item.type === 'text').text);
  131 |   const pointerCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-touch-canonical.json', 'utf8'));
  132 |   const tabCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-parity-ready-tab-sizing.json', 'utf8'));
  133 |   const samples = [];
  134 |   for (const width of [1440, 390, 320]) for (const height of [480, 1000]) {
  135 |     await page.setViewportSize({width, height});
  136 |     const sample = await panel.evaluate(element => ({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  137 |       coarsePointer: matchMedia('(pointer: coarse)').matches,
  138 |       tabs: [...element.querySelectorAll<HTMLElement>('.friends-tabs a')].map(tab => ({width: tab.getBoundingClientRect().width,
  139 |         height: tab.getBoundingClientRect().height, paddingLeft: parseFloat(getComputedStyle(tab).paddingLeft)})),
  140 |       rows: [...element.querySelectorAll('.friend-row')].map(row => {
  141 |         const bounds = row.getBoundingClientRect();
  142 |         const action = row.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
  143 |         const actionBounds = action.getBoundingClientRect();
  144 |         return {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
  145 |           action: {width: actionBounds.width, height: actionBounds.height, borderColor: getComputedStyle(action).borderColor}};
  146 |       })}));
  147 |     samples.push(sample);
  148 |   }
  149 |   for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
  150 |     await page.setViewportSize(viewport);
  151 |     await page.evaluate(() => document.fonts.ready);
  152 |     await panel.screenshot({path: info.outputPath(`candidate-friends-ready-${name}.png`), animations: 'disabled', scale: 'css'});
  153 |     await expect(panel).toHaveScreenshot(`friends-ready-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  154 |   }
  155 |   await writeFile(info.outputPath('friends-ready-geometry.json'), JSON.stringify({canonical, pointerVariants: pointerCanonical.variants, samples}, null, 2));
  156 |   for (const sample of samples) {
  157 |     const reference = canonical.find((item: {viewport: string}) => item.viewport === (sample.width <= 760 ? 'mobile' : 'desktop'));
  158 |     const pointerReference = pointerCanonical.variants.find((item: {variants: {State: string; Pointer: string}}) =>
  159 |       item.variants.State === 'Default' && item.variants.Pointer === (sample.coarsePointer ? 'Coarse' : 'Fine'));
  160 |     expect(sample.scrollWidth).toBeLessThanOrEqual(sample.width);
  161 |     const tabReference = sample.width === 1440 ? tabCanonical.desktop : tabCanonical.mobile;
  162 |     for (const [index, tab] of sample.tabs.entries()) {
  163 |       expect(tab.height).toBe(tabReference.children[index].height);
  164 |       expect(tab.paddingLeft).toBe(tabReference.children[index].paddingLeft);
  165 |       const expectedWidth = tabReference.children[index].width - (sample.width === 320 ? 35 : 0);
  166 |       expect(tab.width).toBe(expectedWidth);
  167 |     }
  168 |     for (const [index, row] of sample.rows.entries()) {
  169 |       expect(row.height).toBe(pointerReference.height);
  170 |       expect(row.action.width).toBe(pointerReference.action[0].width);
  171 |       expect(row.action.height).toBe(pointerReference.action[0].height);
  172 |       expect(row.action.borderColor).toBe('rgb(107, 125, 113)');
  173 |       expect(row.width).toBe(sample.width === 320 ? 288 : reference.rows[0].width);
  174 |       if (index) expect(row.y - sample.rows[index - 1].y - sample.rows[index - 1].height).toBe(reference.gap);
  175 |     }
  176 |   }
  177 |   await expectNoBlockingAxeViolations(page);
  178 |   expect(writes).toEqual([]); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  179 | });
  180 | 
  181 | test('Friends secondary content has deterministic canonical visual candidates', async ({page}, info) => {
  182 |   await page.addInitScript(() => {
  183 |     const original = crypto.getRandomValues.bind(crypto);
  184 |     let sequence = 0;
  185 |     Object.defineProperty(crypto, 'getRandomValues', {value: (array: Uint8Array) => {
  186 |       if (!(array instanceof Uint8Array) || array.length !== 32) return original(array);
  187 |       sequence++;
  188 |       array.forEach((_, index) => {array[index] = (sequence * 37 + index) % 256;});
  189 |       return array;
  190 |     }});
  191 |   });
  192 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce');
  193 |   const controls = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-controls-canonical.json', 'utf8'));
  194 |   const frameIds: Record<string, readonly string[]> = {add: ['192:11619', '192:11744'], invitations: ['192:11835', '192:11960'], review: ['192:12051', '192:12176']};
  195 |   const capture = async (state: string) => {
  196 |     await expectNativeTransitionsSettled(page);
  197 |     await page.evaluate(() => document.fonts.ready);
  198 |     for (const [name, viewport] of [['desktop', {width: 1440, height: 1000}], ['mobile', {width: 390, height: 1000}]] as const) {
  199 |       await page.setViewportSize(viewport);
  200 |       await page.mouse.move(0, 0);
  201 |       const reference = controls.screens.find((screen: {id: string}) => screen.id === frameIds[state][name === 'desktop' ? 0 : 1]);
  202 |       const tabs = await panel.locator('.friends-tabs a').evaluateAll(elements => elements.map(element => ({width: element.getBoundingClientRect().width,
  203 |         paddingLeft: parseFloat(getComputedStyle(element).paddingLeft)})));
  204 |       expect.soft(tabs).toEqual(reference.children.map((child: {width: number; paddingLeft: number}) => ({width: child.width, paddingLeft: child.paddingLeft})));
  205 |       if (state === 'invitations') {
  206 |         const revoke = panel.getByRole('button', {name: 'Revoke', exact: true});
  207 |         await expect.soft(revoke).toHaveCSS('background-color', 'rgb(24, 32, 25)');
  208 |         await expect.soft(revoke).toHaveCSS('border-color', 'rgb(255, 116, 125)');
  209 |       }
  210 |       await expectNoBlockingAxeViolations(page);
  211 |       expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  212 |       await panel.screenshot({path: info.outputPath(`candidate-friends-${state}-${name}.png`), animations: 'disabled', scale: 'css'});
  213 |       await expect(panel).toHaveScreenshot(`friends-${state}-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  214 |     }
  215 |   };
  216 |   await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  217 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  218 |   await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  219 |   await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  220 |   await panel.getByRole('button', {name: 'Create new invitation', exact: true}).click();
```