# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends ready content preserves canonical card geometry during resizing
- Location: e2e/design-v2-friends.spec.ts:125:5

# Error details

```
Error: expect(locator).toHaveScreenshot(expected) failed

Locator: locator('v2-friends-page')
  6617 pixels (ratio 0.03 of all image pixels) are different.

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
  - 6617 pixels (ratio 0.03 of all image pixels) are different.
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
  - 6617 pixels (ratio 0.03 of all image pixels) are different.

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
  120 |   expect(paints).toEqual({readyPeople: 'rgb(6, 19, 11)', readyPlus: 'rgb(162, 173, 166)', addPeople: 'rgb(162, 173, 166)', addPlus: 'rgb(162, 173, 166)'});
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
> 153 |     await expect(panel).toHaveScreenshot(`friends-ready-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
      |                         ^ Error: expect(locator).toHaveScreenshot(expected) failed
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
  221 |   await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  222 |   await capture('add');
  223 |   await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  224 |   await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  225 |   await capture('invitations');
  226 |   await page.goto('/new/friends/invite/' + 'b'.repeat(64));
  227 |   await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  228 |   await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  229 |   await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  230 |   await capture('review');
  231 |   expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  232 |   expect(writes.filter(write => write.name === 'respond_friend_request')).toEqual([]);
  233 |   expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  234 | });
  235 | 
  236 | test('Friends invitation navigation recovers during immediate viewport resizing', async ({page}, info) => {
  237 |   await page.setViewportSize({width: 1920, height: 1000});
  238 |   const {panel, unexpected, runtimeErrors} = await setupFriends(page, 'no-preference');
  239 |   try {
  240 |     await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  241 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  242 |     await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  243 |     await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  244 |     await panel.getByRole('button', {name: 'Create new invitation', exact: true}).click();
  245 |     await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  246 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  247 |     await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  248 |     await page.setViewportSize({width: 1440, height: 900});
  249 |     await page.setViewportSize({width: 390, height: 900});
  250 |     await expectNativeTransitionsSettled(page);
  251 |     await panel.getByRole('link', {name: 'View link & QR'}).click();
  252 |     await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  253 |     await expectNativeTransitionsSettled(page);
```