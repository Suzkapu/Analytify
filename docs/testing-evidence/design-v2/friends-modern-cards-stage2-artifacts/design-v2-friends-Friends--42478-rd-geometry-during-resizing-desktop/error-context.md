# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends ready content preserves canonical card geometry during resizing
- Location: e2e/design-v2-friends.spec.ts:108:5

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('v2-friends-page')
  6576 pixels (ratio 0.03 of all image pixels) are different.

  Snapshot: friends-ready-mobile.png

Call log:
  - Expect "toHaveScreenshot(friends-ready-mobile.png)" locator('v2-friends-page') with timeout 5000ms
    - verifying given screenshot expectation
  - waiting for locator('v2-friends-page')
    - locator resolved to <v2-friends-page _nghost-ng-c798132010="">…</v2-friends-page>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - 6576 pixels (ratio 0.03 of all image pixels) are different.
  - waiting 100ms before taking screenshot
  - waiting for locator('v2-friends-page')
    - locator resolved to <v2-friends-page _nghost-ng-c798132010="">…</v2-friends-page>
  - taking element screenshot
    - disabled all CSS animations
  - waiting for fonts to load...
  - fonts loaded
  - attempting scroll into view action
    - waiting for element to be stable
  - captured a stable screenshot
  - 6576 pixels (ratio 0.03 of all image pixels) are different.

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
        - link "Add friend" [ref=f1e31] [cursor=pointer]:
          - /url: /new/friends/add
        - region "Friend request from Paulzgi" [ref=f1e33]:
          - heading "Friend request from Paulzgi" [level=2] [ref=f1e34]
          - generic [ref=f1e35]:
            - button "Accept" [ref=f1e36] [cursor=pointer]
            - button "Decline" [ref=f1e38] [cursor=pointer]
        - generic [ref=f1e39]:
          - article [ref=f1e40]:
            - generic [aria-hidden] [ref=f1e41]: S
            - generic [ref=f1e42]:
              - heading "Suzkapu" [level=2] [ref=f1e43]
              - paragraph [ref=f1e44]: Connected
            - button "Manage friend Suzkapu" [ref=f1e47] [cursor=pointer]
          - article [ref=f1e48]:
            - generic [aria-hidden] [ref=f1e49]: D
            - generic [ref=f1e50]:
              - heading "Daniel_P" [level=2] [ref=f1e51]
              - paragraph [ref=f1e52]: Connected
            - button "Manage friend Daniel_P" [ref=f1e55] [cursor=pointer]
          - article [ref=f1e56]:
            - generic [aria-hidden] [ref=f1e57]: A
            - generic [ref=f1e58]:
              - heading "Alex" [level=2] [ref=f1e59]
              - paragraph [ref=f1e60]: Connected
            - button "Manage friend Alex" [ref=f1e63] [cursor=pointer]
        - paragraph [ref=f1e64]: Friendship does not grant access to your playlists or listening data. You choose what to share.
  - navigation "Primary navigation" [ref=f1e65]:
    - link "Playlists" [ref=f1e66] [cursor=pointer]:
      - /url: /new/playlists
      - generic [aria-hidden] [ref=f1e67]: 
    - link "Stats" [ref=f1e69] [cursor=pointer]:
      - /url: /new/stats
      - generic [aria-hidden] [ref=f1e70]: 
    - link "History" [ref=f1e72] [cursor=pointer]:
      - /url: /new/history
      - generic [aria-hidden] [ref=f1e73]: 
  - contentinfo [ref=f1e75]:
    - generic [ref=f1e76]: Powered by Spotify
    - generic [ref=f1e77]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f1e78] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
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
  108 | test('Friends ready content preserves canonical card geometry during resizing', async ({page}, info) => {
  109 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce', undefined, ['Suzkapu', 'Daniel_P', 'Alex']);
  110 |   await expect(panel.locator('.friend-row')).toHaveCount(3);
  111 |   await expectNativeTransitionsSettled(page);
  112 |   const envelope = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-row-current-canonical.json', 'utf8'));
  113 |   const canonical = JSON.parse(envelope.content.find((item: {type: string}) => item.type === 'text').text);
  114 |   const pointerCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-touch-canonical.json', 'utf8'));
  115 |   const tabCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-parity-ready-tab-sizing.json', 'utf8'));
  116 |   const samples = [];
  117 |   for (const width of [1440, 390, 320]) for (const height of [480, 1000]) {
  118 |     await page.setViewportSize({width, height});
  119 |     const sample = await panel.evaluate(element => ({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
  120 |       coarsePointer: matchMedia('(pointer: coarse)').matches,
  121 |       tabs: [...element.querySelectorAll<HTMLElement>('.friends-tabs a')].map(tab => ({width: tab.getBoundingClientRect().width,
  122 |         height: tab.getBoundingClientRect().height, paddingLeft: parseFloat(getComputedStyle(tab).paddingLeft)})),
  123 |       rows: [...element.querySelectorAll('.friend-row')].map(row => {
  124 |         const bounds = row.getBoundingClientRect();
  125 |         const action = row.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
  126 |         const actionBounds = action.getBoundingClientRect();
  127 |         return {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
  128 |           action: {width: actionBounds.width, height: actionBounds.height, borderColor: getComputedStyle(action).borderColor}};
  129 |       })}));
  130 |     samples.push(sample);
  131 |   }
  132 |   for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
  133 |     await page.setViewportSize(viewport);
  134 |     await page.evaluate(() => document.fonts.ready);
  135 |     await panel.screenshot({path: info.outputPath(`candidate-friends-ready-${name}.png`), animations: 'disabled', scale: 'css'});
> 136 |     await expect(panel).toHaveScreenshot(`friends-ready-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
      |                         ^ Error: expect(locator).toHaveScreenshot(expected) failed
  137 |   }
  138 |   await writeFile(info.outputPath('friends-ready-geometry.json'), JSON.stringify({canonical, pointerVariants: pointerCanonical.variants, samples}, null, 2));
  139 |   for (const sample of samples) {
  140 |     const reference = canonical.find((item: {viewport: string}) => item.viewport === (sample.width <= 760 ? 'mobile' : 'desktop'));
  141 |     const pointerReference = pointerCanonical.variants.find((item: {variants: {State: string; Pointer: string}}) =>
  142 |       item.variants.State === 'Default' && item.variants.Pointer === (sample.coarsePointer ? 'Coarse' : 'Fine'));
  143 |     expect(sample.scrollWidth).toBeLessThanOrEqual(sample.width);
  144 |     const tabReference = sample.width === 1440 ? tabCanonical.desktop : tabCanonical.mobile;
  145 |     for (const [index, tab] of sample.tabs.entries()) {
  146 |       expect(tab.height).toBe(tabReference.children[index].height);
  147 |       expect(tab.paddingLeft).toBe(tabReference.children[index].paddingLeft);
  148 |       const expectedWidth = tabReference.children[index].width - (sample.width === 320 ? 35 : 0);
  149 |       expect(tab.width).toBe(expectedWidth);
  150 |     }
  151 |     for (const [index, row] of sample.rows.entries()) {
  152 |       expect(row.height).toBe(pointerReference.height);
  153 |       expect(row.action.width).toBe(pointerReference.action[0].width);
  154 |       expect(row.action.height).toBe(pointerReference.action[0].height);
  155 |       expect(row.action.borderColor).toBe('rgb(107, 125, 113)');
  156 |       expect(row.width).toBe(sample.width === 320 ? 288 : reference.rows[0].width);
  157 |       if (index) expect(row.y - sample.rows[index - 1].y - sample.rows[index - 1].height).toBe(reference.gap);
  158 |     }
  159 |   }
  160 |   await expectNoBlockingAxeViolations(page);
  161 |   expect(writes).toEqual([]); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  162 | });
  163 | 
  164 | test('Friends secondary content has deterministic canonical visual candidates', async ({page}, info) => {
  165 |   await page.addInitScript(() => {
  166 |     const original = crypto.getRandomValues.bind(crypto);
  167 |     let sequence = 0;
  168 |     Object.defineProperty(crypto, 'getRandomValues', {value: (array: Uint8Array) => {
  169 |       if (!(array instanceof Uint8Array) || array.length !== 32) return original(array);
  170 |       sequence++;
  171 |       array.forEach((_, index) => {array[index] = (sequence * 37 + index) % 256;});
  172 |       return array;
  173 |     }});
  174 |   });
  175 |   const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce');
  176 |   const controls = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-controls-canonical.json', 'utf8'));
  177 |   const frameIds: Record<string, readonly string[]> = {add: ['192:11619', '192:11744'], invitations: ['192:11835', '192:11960'], review: ['192:12051', '192:12176']};
  178 |   const capture = async (state: string) => {
  179 |     await expectNativeTransitionsSettled(page);
  180 |     await page.evaluate(() => document.fonts.ready);
  181 |     for (const [name, viewport] of [['desktop', {width: 1440, height: 1000}], ['mobile', {width: 390, height: 1000}]] as const) {
  182 |       await page.setViewportSize(viewport);
  183 |       await page.mouse.move(0, 0);
  184 |       const reference = controls.screens.find((screen: {id: string}) => screen.id === frameIds[state][name === 'desktop' ? 0 : 1]);
  185 |       const tabs = await panel.locator('.friends-tabs a').evaluateAll(elements => elements.map(element => ({width: element.getBoundingClientRect().width,
  186 |         paddingLeft: parseFloat(getComputedStyle(element).paddingLeft)})));
  187 |       expect.soft(tabs).toEqual(reference.children.map((child: {width: number; paddingLeft: number}) => ({width: child.width, paddingLeft: child.paddingLeft})));
  188 |       if (state === 'invitations') {
  189 |         const revoke = panel.getByRole('button', {name: 'Revoke', exact: true});
  190 |         await expect.soft(revoke).toHaveCSS('background-color', 'rgb(24, 32, 25)');
  191 |         await expect.soft(revoke).toHaveCSS('border-color', 'rgb(255, 116, 125)');
  192 |       }
  193 |       await expectNoBlockingAxeViolations(page);
  194 |       expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  195 |       await panel.screenshot({path: info.outputPath(`candidate-friends-${state}-${name}.png`), animations: 'disabled', scale: 'css'});
  196 |       await expect(panel).toHaveScreenshot(`friends-${state}-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  197 |     }
  198 |   };
  199 |   await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  200 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  201 |   await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  202 |   await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  203 |   await panel.getByRole('button', {name: 'Create new invitation', exact: true}).click();
  204 |   await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  205 |   await capture('add');
  206 |   await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  207 |   await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  208 |   await capture('invitations');
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
```