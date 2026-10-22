# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends native workflow and responsive recovery (no-preference)
- Location: e2e/design-v2-friends.spec.ts:7:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('v2-friends-page').getByText('Friend request from Paulzgi', { exact: true })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" locator('v2-friends-page').getByText('Friend request from Paulzgi', { exact: true }) with timeout 5000ms
  - waiting for locator('v2-friends-page').getByText('Friend request from Paulzgi', { exact: true })

```

```yaml
- link "Skip to main content":
  - /url: "#v2-main-content"
- banner:
  - link "Analytify playlists":
    - /url: /new/playlists
    - text: Analytify
  - navigation "Main navigation":
    - link "Playlists":
      - /url: /new/playlists
    - link "Stats":
      - /url: /new/stats
    - link "History":
      - /url: /new/history
  - button "Open More tools": More
  - button "Open account and data settings"
- main "Your friends content":
  - heading "Your friends" [level=1]
  - paragraph: Share playlists, invite friends and discover music together.
  - navigation "Friends navigation":
    - link "Friends":
      - /url: /new/friends
    - link "Invitations":
      - /url: /new/friends/invitations
  - link "Add friend":
    - /url: /new/friends/add
  - alert:
    - heading "Friends could not be loaded" [level=3]
    - paragraph: Retry to load your friends and requests. No friend action is available until your account is confirmed.
    - button "Retry"
- contentinfo:
  - text: Powered by Spotify Artwork and metadata belong to their owners.
  - link "Legal & privacy":
    - /url: /new/legal
```

# Test source

```ts
  1   | import {test, expect} from './fixtures';
  2   | import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
  3   | import {observeNativeTransitions, expectNativeTransitionsSettled} from './helpers/native-transitions';
  4   | import {writeFile} from 'node:fs/promises';
  5   | 
  6   | for (const motion of ['no-preference', 'reduce'] as const) {
  7   |   test(`Friends native workflow and responsive recovery (${motion})`, async ({page}, info) => {
  8   |     await observeNativeTransitions(page);
  9   |     await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
  10  |     const actor = '11111111-1111-4111-8111-111111111111';
  11  |     const friend = {userId: '22222222-2222-4222-8222-222222222222', displayName: 'Suzkapu', imageUrl: '', connectedAt: '2026-10-11', connectionVersion: '33333333-3333-4333-8333-333333333333'};
  12  |     let friends = [friend];
  13  |     let requests = [{requestId: '44444444-4444-4444-8444-444444444444', inviterUserId: friend.userId, displayName: 'Paulzgi', imageUrl: '', createdAt: '2026-10-11'}];
  14  |     let invitations: {id: string; status: string; createdAt: string}[] = [];
  15  |     const writes: {name: string; body: Record<string, unknown>}[] = [];
  16  |     const unexpected: string[] = []; const runtimeErrors: string[] = [];
  17  |     page.on('pageerror', error => runtimeErrors.push(error.message));
  18  |     await page.route('http://127.0.0.1:54321/**', async route => {
  19  |       const path = new URL(route.request().url()).pathname;
  20  |       if (path === '/auth/v1/user') return route.fulfill({json: {id: actor, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}});
  21  |       if (path === '/rest/v1/users') return route.fulfill({json: null});
  22  |       const name = path.split('/').at(-1)!;
  23  |       if (name === 'get_public_site_settings') return route.fulfill({json: {}});
  24  |       if (name === 'is_app_admin') return route.fulfill({json: false});
  25  |       if (name === 'list_friends') return route.fulfill({json: friends});
  26  |       if (name === 'list_friend_requests') return route.fulfill({json: requests});
  27  |       if (name === 'list_friend_invitations') return route.fulfill({json: invitations});
  28  |       const body = route.request().postDataJSON();
  29  |       if (name === 'respond_friend_request') {
  30  |         writes.push({name, body}); requests = [];
  31  |         return route.fulfill({json: {id: body.p_invitation_id, status: body.p_accept ? 'accepted' : 'declined', isConnected: body.p_accept}});
  32  |       }
  33  |       if (name === 'create_friend_invitation') {
  34  |         writes.push({name, body});
  35  |         const invitation = {id: '55555555-5555-4555-8555-555555555555', status: 'pending', createdAt: '2026-10-12'};
  36  |         invitations = [invitation]; return route.fulfill({json: invitation});
  37  |       }
  38  |       if (name === 'revoke_friend_invitation') {
  39  |         writes.push({name, body}); invitations = []; return route.fulfill({json: null});
  40  |       }
  41  |       if (name === 'remove_friend') {
  42  |         writes.push({name, body}); friends = []; return route.fulfill({json: null});
  43  |       }
  44  |       unexpected.push(`${route.request().method()} ${path}`); return route.abort('blockedbyclient');
  45  |     });
  46  |     await seedAuthenticatedBrowser(page, {cloudIdentity: true});
  47  |     await page.evaluate(actorId => {
  48  |       const exp = Math.floor(Date.now() / 1000) + 3600;
  49  |       const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  50  |       localStorage.setItem('sb-127-auth-token', JSON.stringify({access_token: `${encode({alg: 'HS256', typ: 'JWT'})}.${encode({sub: actorId, role: 'authenticated', exp})}.fixture-signature`, refresh_token: 'synthetic-refresh-only', token_type: 'bearer', expires_at: exp, expires_in: 3600, user: {id: actorId, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}}));
  51  |     }, actor);
  52  |     await page.goto('/new/friends');
  53  |     const panel = page.locator('v2-friends-page');
  54  |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
> 55  |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toBeVisible();
      |                                                                                 ^ Error: expect(locator).toBeVisible() failed
  56  |     await expectNativeTransitionsSettled(page);
  57  |     await expectNoBlockingAxeViolations(page);
  58  |     await panel.getByRole('button', {name: 'Decline', exact: true}).press('Enter');
  59  |     await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toHaveCount(0);
  60  |     expect(writes).toEqual([{name: 'respond_friend_request', body: {p_invitation_id: '44444444-4444-4444-8444-444444444444', p_accept: false}}]);
  61  |     const manage = panel.getByRole('button', {name: 'Manage friend Suzkapu'});
  62  |     await manage.press('Enter'); await panel.getByRole('menuitem', {name: 'Remove friend'}).press('Enter');
  63  |     const dialog = panel.getByRole('dialog', {name: 'Remove Suzkapu?'});
  64  |     await expect(dialog).toBeVisible();
  65  |     await expect(dialog.getByRole('button')).toHaveText(['Remove friend', 'Cancel']);
  66  |     await expect(dialog.getByRole('button', {name: 'Remove friend', exact: true})).toBeFocused();
  67  |     await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
  68  |     const geometry = [];
  69  |     for (const height of [480, 1000]) for (const width of [320, 360, 390, 767, 768, 1024, 1440, 1920]) {
  70  |       await page.setViewportSize({width, height});
  71  |       await expect(dialog).toBeVisible();
  72  |       const sample = await dialog.evaluate(element => {
  73  |         const rect = element.getBoundingClientRect();
  74  |         return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
  75  |           backdropFilter: getComputedStyle(document.querySelector('.confirmation-backdrop')!).backdropFilter};
  76  |       });
  77  |       expect(sample.scrollWidth).toBeLessThanOrEqual(width);
  78  |       expect(sample.x).toBeGreaterThanOrEqual(0); expect(sample.right).toBeLessThanOrEqual(width);
  79  |       expect(sample.y).toBeGreaterThanOrEqual(0); expect(sample.bottom).toBeLessThanOrEqual(height);
  80  |       expect(sample.backdropFilter).toBe('blur(12px)'); geometry.push(sample);
  81  |     }
  82  |     await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(manage).toBeFocused();
  83  |     expect(writes).toHaveLength(1);
  84  |     await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  85  |     const qr = panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'});
  86  |     await expect(qr).toBeVisible();
  87  |     await expect(qr).toHaveJSProperty('naturalWidth', 176); await expect(qr).toHaveJSProperty('naturalHeight', 176);
  88  |     expect(writes[1].name).toBe('create_friend_invitation'); expect(writes[1].body.p_claim_token).toMatch(/^[a-f0-9]{64}$/);
  89  |     const expectedUrl = `http://127.0.0.1:4214/new/friends/invite/${writes[1].body.p_claim_token}`;
  90  |     await expect(panel.locator('.invitation-url')).toHaveText(expectedUrl);
  91  |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  92  |     await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  93  |     await panel.getByRole('link', {name: 'View link & QR'}).click(); await expect(qr).toBeVisible();
  94  |     expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(1);
  95  |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  96  |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  97  |     await page.evaluate(() => document.fonts.ready);
  98  |     await panel.screenshot({path: info.outputPath('friends-add.png'), animations: 'disabled'});
  99  |     await writeFile(info.outputPath('friends-native.json'), JSON.stringify({motion, geometry, writeNames: writes.map(write => write.name), unexpected, runtimeErrors}, null, 2));
  100 |     expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  101 |   });
  102 | }
  103 | 
```