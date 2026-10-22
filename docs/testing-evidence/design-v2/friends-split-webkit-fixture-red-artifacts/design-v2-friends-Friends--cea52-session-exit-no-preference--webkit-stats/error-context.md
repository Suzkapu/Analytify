# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: design-v2-friends.spec.ts >> Friends confirming-read revocation and session exit (no-preference)
- Location: e2e/design-v2-friends.spec.ts:188:7

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
  - banner [ref=f2e7]:
    - link "Analytify playlists" [ref=f2e9] [cursor=pointer]:
      - /url: /new/playlists
      - generic [ref=f2e10]: Analytify
  - main "Sign in content" [active] [ref=f2e11]:
    - region [ref=f2e14]:
      - generic [ref=f2e15]:
        - generic [ref=f2e16]: Your Spotify library
        - heading "Explore your playlists." [level=1] [ref=f2e17]
        - paragraph [ref=f2e18]: Browse, search, share, and organize your Spotify playlists.
        - list "Analytify features" [ref=f2e19]:
          - listitem [ref=f2e20]:
            - generic [aria-hidden] [ref=f2e21]: 
            - generic [ref=f2e22]:
              - strong [ref=f2e23]: Your Spotify library
              - text: with fast playlist and song search
          - listitem [ref=f2e24]:
            - generic [aria-hidden] [ref=f2e25]: 
            - generic [ref=f2e26]:
              - strong [ref=f2e27]: Useful playlist tools
              - text: for summaries, merging, and sharing
          - listitem [ref=f2e28]:
            - generic [aria-hidden] [ref=f2e29]: 
            - generic [ref=f2e30]:
              - strong [ref=f2e31]: Stored on this device
              - text: unless a feature needs the cloud
      - article [ref=f2e32]:
        - generic [ref=f2e33]:
          - link "Analytify home" [ref=f2e34] [cursor=pointer]:
            - /url: /new/
            - generic [ref=f2e35]: Analytify
          - generic [ref=f2e36]: Welcome to Analytify
          - heading "Connect your Spotify account" [level=2] [ref=f2e37]
          - paragraph [ref=f2e38]: Sign in to load your Spotify library and playlists.
          - paragraph [ref=f2e39]: Spotify will be asked for your profile, saved songs, playlists, top songs and artists, and recently played songs. Analytify requests playlist write access only for playlist copies you choose to create. It never reads your password or payment details.
        - generic [ref=f2e40]:
          - generic [ref=f2e41] [cursor=pointer]:
            - checkbox "I agree to the Terms and acknowledge the Privacy Notice." [checked] [ref=f2e42]
            - generic [ref=f2e43]:
              - text: I agree to the
              - link "Terms" [ref=f2e44]:
                - /url: /new/legal#terms
              - text: and acknowledge the
              - link "Privacy Notice" [ref=f2e45]:
                - /url: /new/legal#privacy
              - text: .
          - group [ref=f2e46]:
            - generic "Terms version" [ref=f2e47] [cursor=pointer]
          - button "Continue with Spotify" [ref=f2e48] [cursor=pointer]
          - button "Advanced options" [ref=f2e52] [cursor=pointer]:
            - generic [aria-hidden] [ref=f2e54]: 
        - paragraph [ref=f2e55]:
          - generic [aria-hidden] [ref=f2e56]: 
          - text: Analytify never asks for your Spotify Client Secret. Personal-app sessions stay local unless you explicitly enable cloud features.
  - contentinfo [ref=f2e57]:
    - generic [ref=f2e58]: Powered by Spotify
    - generic [ref=f2e59]: Artwork and metadata belong to their owners.
    - link "Legal & privacy" [ref=f2e60] [cursor=pointer]:
      - /url: /new/legal
```

# Test source

```ts
  128 |     await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  129 |     const qr = panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'});
  130 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  131 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  132 |     await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  133 |     await expect(qr).toHaveCount(0);
  134 |     const consumedCreations = writes.filter(write => write.name === 'create_friend_invitation');
  135 |     expect(consumedCreations).toHaveLength(2);
  136 |     expect(consumedCreations[1].body).toEqual(consumedCreations[0].body);
  137 |     await expectNoBlockingAxeViolations(page);
  138 |     await panel.screenshot({path: info.outputPath('friends-owner-inactive.png'), animations: 'disabled'});
  139 |     await panel.getByRole('button', {name: 'Create new invitation', exact: true}).press('Enter');
  140 |     await expect(qr).toBeVisible();
  141 |     await expect(qr).toHaveJSProperty('naturalWidth', 176); await expect(qr).toHaveJSProperty('naturalHeight', 176);
  142 |     const copy = panel.getByRole('button', {name: 'Copy link', exact: true});
  143 |     await expect(copy).toHaveCSS('font-size', '14px');
  144 |     await expect(copy).toHaveCSS('font-weight', '600');
  145 |     await expect(copy).toHaveCSS('line-height', '20px');
  146 |     const creations = writes.filter(write => write.name === 'create_friend_invitation');
  147 |     expect(creations).toHaveLength(3); expect(creations[2].body.p_claim_token).toMatch(/^[a-f0-9]{64}$/);
  148 |     expect(creations[2].body.p_claim_token).not.toBe(creations[0].body.p_claim_token);
  149 |     const expectedUrl = `http://127.0.0.1:4214/new/friends/invite/${creations[2].body.p_claim_token}`;
  150 |     await expect(panel.locator('.invitation-url')).toHaveText(expectedUrl);
  151 |     await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  152 |     await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  153 |     await panel.getByRole('link', {name: 'View link & QR'}).click(); await expect(qr).toBeVisible();
  154 |     expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  155 |     await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
  156 |     await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
  157 |     await page.evaluate(() => document.fonts.ready);
  158 |     await panel.screenshot({path: info.outputPath('friends-add.png'), animations: 'disabled'});
  159 |     const incomingToken = 'b'.repeat(64);
  160 |     await page.goto('/new/friends/invite/' + incomingToken);
  161 |     await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  162 |     await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  163 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  164 |     expect(writes.filter(write => write.name === 'receive_friend_invitation').map(write => write.body))
  165 |       .toEqual([{p_claim_token: incomingToken}, {p_claim_token: incomingToken}]);
  166 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(1);
  167 |     await expectNoBlockingAxeViolations(page);
  168 |     await panel.screenshot({path: info.outputPath('friends-review-recovered.png'), animations: 'disabled'});
  169 |     const accept = motion === 'no-preference';
  170 |     await panel.getByRole('button', {name: accept ? 'Accept' : 'Decline', exact: true}).press('Enter');
  171 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toHaveCount(0);
  172 |     await expect(panel.getByRole('status')).toContainText(accept ? 'Friend request accepted' : 'Friend request declined');
  173 |     const actionStyle = await panel.getByRole('button', {name: 'View friends', exact: true}).evaluate(element => {
  174 |       const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
  175 |       return {width: rect.width, height: rect.height, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight};
  176 |     });
  177 |     expect(actionStyle).toEqual({width: 260, height: 48, fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
  178 |     expect(writes.at(-1)).toEqual({name: 'respond_friend_request', body: {p_invitation_id: '77777777-7777-4777-8777-777777777777', p_accept: accept}});
  179 |     await expectNoBlockingAxeViolations(page);
  180 |     await panel.screenshot({path: info.outputPath('friends-outcome.png'), animations: 'disabled'});
  181 |     await panel.getByRole('button', {name: 'View friends', exact: true}).press('Enter');
  182 |     await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  183 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(2);
  184 |     await expectNativeTransitionsSettled(page);
  185 |     await writeFile(info.outputPath('friends-native.json'), JSON.stringify({motion, geometry, writeNames: writes.map(write => write.name), unexpected, runtimeErrors}, null, 2));
  186 |     expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  187 |   });
  188 |   test(`Friends confirming-read revocation and session exit (${motion})`, async ({page}, info) => {
  189 |     const {panel, writes, unexpected, runtimeErrors, counters, inboxRelease, releaseInbox, releaseLogout, revokeNextReceive} = await setupFriends(page, motion);
  190 |     // The sender revokes after receive succeeds but before the confirming inbox read.
  191 |     const revokedToken = 'd'.repeat(64);
  192 |     await revokeNextReceive();
  193 |     await page.goto('/new/friends/invite/' + revokedToken);
  194 |     try {
  195 |       await expect.poll(() => typeof inboxRelease()).toBe('function');
  196 |       await expect(panel.getByRole('status')).toContainText('Updating your request');
  197 |       await expect(panel.getByRole('button', {name: 'Accept', exact: true})).toHaveCount(0);
  198 |       await expect(panel.getByRole('button', {name: 'Decline', exact: true})).toHaveCount(0);
  199 |     } finally {releaseInbox();}
  200 |     await expect(panel.getByRole('alert')).toContainText('This invitation is unavailable');
  201 |     await expect(panel.getByRole('button', {name: 'Retry', exact: true})).toHaveCount(0);
  202 |     await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toHaveCount(0);
  203 |     await expectNativeTransitionsSettled(page);
  204 |     await expectNoBlockingAxeViolations(page);
  205 |     expect(writes.filter(write => write.name === 'receive_friend_invitation' && write.body['p_claim_token'] === revokedToken)).toHaveLength(1);
  206 |     expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(0);
  207 |     await panel.screenshot({path: info.outputPath('friends-review-revoked.png'), animations: 'disabled'});
  208 |     await page.getByRole('button', {name: 'Open account and data settings', exact: true}).press('Enter');
  209 |     await page.getByRole('button', {name: 'Log out', exact: true}).press('Enter');
  210 |     try {
  211 |       await expect.poll(() => counters().authLogouts).toBe(1);
  212 |       await expect(panel.getByRole('alert')).toContainText('Confirm your Spotify account');
  213 |       await expect(panel.locator('.invitation-url, .qr-slot img, .friend-row')).toHaveCount(0);
  214 |     } finally {releaseLogout();}
  215 |     await expect(page).toHaveURL(/\/new\/login(?:[/?#]|$)/);
  216 |     await expect(panel.locator('.invitation-url, .qr-slot img')).toHaveCount(0);
  217 |     expect(counters().authLogouts).toBe(1);
  218 |     await page.goBack();
  219 |     await expect(page).toHaveURL(/\/new\/login(?:[/?#]|$)/);
  220 |     await expect(panel.locator('.invitation-url, .qr-slot img')).toHaveCount(0);
  221 |     expect(counters().authLogouts).toBe(1);
  222 |     try {await expectNativeNavigationRecovery(page);}
  223 |     finally {
  224 |       const transitions = await page.evaluate(() => (window as unknown as {analytifyNativeTransitionProbe: unknown}).analytifyNativeTransitionProbe);
  225 |       await writeFile(info.outputPath('friends-transitions.json'), JSON.stringify(transitions, null, 2));
  226 |     }
  227 |     await writeFile(info.outputPath('friends-session.json'), JSON.stringify({motion, ...counters(), writeNames: writes.map(write => write.name), unexpected, runtimeErrors}, null, 2));
> 228 |     expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
      |                                                           ^ Error: expect(received).toEqual(expected) // deep equality
  229 |   });
  230 | }
  231 | 
```