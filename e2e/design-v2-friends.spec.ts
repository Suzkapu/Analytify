import {test, expect} from './fixtures';
import {mockSpotify, seedAuthenticatedBrowser, expectNoBlockingAxeViolations} from './helpers/authenticated-browser';
import {observeNativeTransitions, expectNativeTransitionsSettled, expectNativeNavigationRecovery} from './helpers/native-transitions';
import {readFile, writeFile} from 'node:fs/promises';

import type {Locator, Page, TestInfo} from '@playwright/test';

async function captureFriendsFeedback(page: Page, feedback: Locator, info: TestInfo, state: string, parentInset = 0): Promise<void> {
  const geometry = [];
  const {references} = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-feedback-responsive-canonical.json', 'utf8')) as {
    references: {state: string; width: number; height: number; texts: {text: string}[]}[]
  };
  for (const [name, viewport] of [['wide', {width: 1440, height: 1000}], ['reference', {width: 608 + parentInset, height: 1000}], ['mobile', {width: 390 + parentInset, height: 1000}]] as const) {
    await page.setViewportSize(viewport);
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready);
    await expect(feedback).toBeVisible();
    const sample = await feedback.locator('section').evaluate(element => {
      const bounds = element.getBoundingClientRect(), style = getComputedStyle(element);
      return {width: bounds.width, height: bounds.height, padding: style.padding, gap: style.gap,
        borderColor: style.borderColor, borderWidth: style.borderWidth, background: style.backgroundColor,
        fontSize: style.fontSize, lineHeight: style.lineHeight,
        actions: [...element.querySelectorAll('button')].map(button => {
          const rect = button.getBoundingClientRect();
          return {label: button.textContent?.trim(), width: rect.width, height: rect.height};
        })};
    });
    expect(sample.width).toBe(name === 'wide' ? 1120 - parentInset : name === 'reference' ? 576 : 358);
    expect(sample.padding).toBe('16px'); expect(sample.gap).toBe('8px');
    expect(sample.borderColor).toBe('rgb(119, 184, 255)'); expect(sample.borderWidth).toBe('1px');
    expect(sample.background).toBe('rgb(24, 32, 25)');
    expect(sample.fontSize).toBe('14px'); expect(sample.lineHeight).toBe('20px');
    if (name !== 'wide') {
      const canonical = references.find(reference => reference.width === sample.width && reference.state.replace('State=', '').toLowerCase().replaceAll(' ', '-') === state);
      expect(canonical, `${state} canonical reference at ${sample.width}px`).toBeDefined();
      expect(sample.height).toBe(canonical!.height);
      const actionText = canonical!.texts[2]?.text;
      expect(sample.actions).toEqual(actionText ? [{label: actionText, width: 260, height: 48}] : []);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (name !== 'wide') {
      await feedback.screenshot({path: info.outputPath(`candidate-friends-feedback-${state}-${name}.png`), animations: 'disabled', scale: 'css'});
      await expect(feedback).toHaveScreenshot(`friends-feedback-${state}-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
    }
    await expectNoBlockingAxeViolations(page);
    geometry.push({viewport: name, ...sample});
  }
  await writeFile(info.outputPath(`friends-feedback-${state}-geometry.json`), JSON.stringify(geometry, null, 2));
}

async function setupFriends(page: Page, motion: 'no-preference' | 'reduce', revokedToken?: string, friendNames?: readonly string[], initialInvitations: {id: string; status: string; createdAt: string}[] = [], controls: {holdInitialReads?: boolean; holdResponse?: boolean; failConfirmingRead?: boolean; unverifiedPersonalConnection?: boolean} = {}) {
  await observeNativeTransitions(page);
  await page.emulateMedia({reducedMotion: motion}); await mockSpotify(page);
  const actor = 'de111111-1111-4111-8111-111111111111';
  const friend = {userId: '22222222-2222-4222-8222-222222222222', displayName: 'Suzkapu', imageUrl: '', connectedAt: '2026-10-11', connectionVersion: '33333333-3333-4333-8333-333333333333'};
  let friends = friendNames ? friendNames.map((displayName, index) => ({...friend, displayName,
    userId: `${index + 2}2222222-2222-4222-8222-222222222222`,
    connectionVersion: `${index + 3}3333333-3333-4333-8333-333333333333`
  })) : [friend];
  let requests = [{requestId: '44444444-4444-4444-8444-444444444444', inviterUserId: friend.userId, displayName: 'Paulzgi', imageUrl: '', createdAt: '2026-10-11'}];
  let invitations = [...initialInvitations];
  const writes: {name: string; body: Record<string, unknown>}[] = [];
  let failReceive = !revokedToken;
  let createAttempts = 0;
  let friendsReads = 0;
  const inventoryReads: string[] = [];
  let releaseFriendsRead: (() => void) | undefined;
  let releaseResponse: (() => void) | undefined;
  let authLogouts = 0;
  let releaseLogout: (() => void) | undefined;
  let revokeDuringConfirmation = false;
  let releaseInbox: (() => void) | undefined;
  const unexpected: string[] = []; const runtimeErrors: string[] = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.route('http://127.0.0.1:54321/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/auth/v1/user') return route.fulfill({json: {id: actor, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}});
    if (path === '/auth/v1/logout') {
      authLogouts++;
      await new Promise<void>(resolve => {releaseLogout = resolve;});
      return route.fulfill({status: 204, body: ''});
    }
    if (path === '/rest/v1/users') return route.fulfill({json: null});
    const name = path.split('/').at(-1)!;
    if (name === 'get_public_site_settings') return route.fulfill({json: {}});
    if (name === 'is_app_admin') return route.fulfill({json: false});
    if (name === 'list_friends') {
      inventoryReads.push(name);
      const read = ++friendsReads;
      if (controls.failConfirmingRead && read === 2) return route.fulfill({status: 503, json: {message: 'Synthetic acknowledged-action inventory failure'}});
      if (controls.failConfirmingRead && read === 3) {
        await new Promise<void>(resolve => {releaseFriendsRead = resolve;});
        releaseFriendsRead = undefined;
      }
      if (controls.holdInitialReads && read <= 2) {
        await new Promise<void>(resolve => {releaseFriendsRead = resolve;});
        releaseFriendsRead = undefined;
        if (read === 1) return route.fulfill({status: 503, json: {message: 'Synthetic cold inventory interruption'}});
      }
      return route.fulfill({json: friends});
    }
    if (name === 'list_friend_requests') {
      inventoryReads.push(name);
      if (revokeDuringConfirmation) {
        await new Promise<void>(resolve => {releaseInbox = resolve;});
        revokeDuringConfirmation = false;
        requests = [];
      }
      return route.fulfill({json: requests});
    }
    if (name === 'list_friend_invitations') {inventoryReads.push(name); return route.fulfill({json: invitations});}
    const body = route.request().postDataJSON();
    if (name === 'receive_friend_invitation') {
      writes.push({name, body});
      if (failReceive) {
        failReceive = false;
        return route.fulfill({status: 503, json: {message: 'Synthetic transport interruption'}});
      }
      const incoming = {requestId: '77777777-7777-4777-8777-777777777777', inviterUserId: '66666666-6666-4666-8666-666666666666', displayName: 'Incoming friend', imageUrl: '', createdAt: '2026-10-12'};
      requests = [incoming];
      if (revokedToken) revokeDuringConfirmation = true;
      return route.fulfill({json: {id: incoming.requestId, inviterUserId: incoming.inviterUserId, displayName: incoming.displayName, imageUrl: ''}});
    }
    if (name === 'respond_friend_request') {
      writes.push({name, body});
      if (controls.holdResponse) await new Promise<void>(resolve => {releaseResponse = resolve;});
      requests = [];
      return route.fulfill({json: {id: body.p_invitation_id, status: body.p_accept ? 'accepted' : 'declined', isConnected: body.p_accept}});
    }
    if (name === 'create_friend_invitation') {
      writes.push({name, body});
      createAttempts++;
      if (createAttempts === 1) return route.fulfill({status: 503, json: {message: 'Synthetic unconfirmed creation'}});
      const invitation = {id: '55555555-5555-4555-8555-555555555555', status: createAttempts === 2 ? 'accepted' : 'pending', createdAt: '2026-10-12'};
      invitations = [invitation]; return route.fulfill({json: invitation});
    }
    if (name === 'revoke_friend_invitation') {
      writes.push({name, body}); invitations = []; return route.fulfill({json: null});
    }
    if (name === 'remove_friend') {
      writes.push({name, body}); friends = []; return route.fulfill({json: null});
    }
    unexpected.push(`${route.request().method()} ${path}`); return route.abort('blockedbyclient');
  });
  await seedAuthenticatedBrowser(page, {cloudIdentity: true});
  if (controls.unverifiedPersonalConnection) await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('AnalytifyDB', 4);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result, transaction = db.transaction('appData', 'readwrite'), store = transaction.objectStore('appData');
        store.put({key: 'spotifyConnectionMode', value: 'personal_pkce'});
        store.delete('collaborationIdentityReady'); store.delete('cloudIdentityReady');
        transaction.oncomplete = () => {db.close(); resolve();};
        transaction.onerror = () => reject(transaction.error);
      };
    });
  });
  await page.evaluate(actorId => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const encode = (value: object) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
    localStorage.setItem('sb-127-auth-token', JSON.stringify({access_token: `${encode({alg: 'HS256', typ: 'JWT'})}.${encode({sub: actorId, role: 'authenticated', exp})}.fixture-signature`, refresh_token: 'synthetic-refresh-only', token_type: 'bearer', expires_at: exp, expires_in: 3600, user: {id: actorId, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}}}));
  }, actor);
  await page.goto(revokedToken ? '/friends/invite/' + revokedToken : '/friends');
  const panel = page.locator('v2-friends-page');
  return {panel, writes, unexpected, runtimeErrors, counters: () => ({authLogouts, friendsReads, inventoryReads: [...inventoryReads]}),
    friendsReadWaiting: () => !!releaseFriendsRead, releaseFriendsRead: () => releaseFriendsRead?.(),
    responseWaiting: () => !!releaseResponse, releaseResponse: () => releaseResponse?.(),
    inboxRelease: () => releaseInbox, releaseInbox: () => releaseInbox?.(), releaseLogout: () => releaseLogout?.()};
}

test('Friends uncertain creation and terminal owner feedback require explicit recovery', async ({page}, info) => {
  const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce');
  await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  const feedback = panel.locator('v2-friends-feedback');
  await expect(feedback.getByRole('alert')).toContainText('Your change could not be confirmed');
  await expect(panel.locator('.invitation-url, .qr-slot img')).toHaveCount(0);
  await captureFriendsFeedback(page, feedback, info, 'change-error');
  await feedback.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  await expect(feedback.getByRole('status')).toContainText('Your invitation is no longer active');
  await expect(panel.locator('.invitation-url, .qr-slot img')).toHaveCount(0);
  await captureFriendsFeedback(page, feedback, info, 'owner-unavailable');
  const attempts = writes.filter(write => write.name === 'create_friend_invitation');
  expect(attempts).toHaveLength(2); expect(attempts[1].body).toEqual(attempts[0].body);
  await feedback.getByRole('button', {name: 'Create new invitation', exact: true}).press('Enter');
  await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
});

for (const accept of [true, false]) test(`Friends confirmed ${accept ? 'accepted' : 'declined'} feedback stays request-owned`, async ({page}, info) => {
  const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce');
  // Finish the initial authenticated route before a full-document invite visit.
  // Otherwise WebKit reports canceled startup reads as access-control page errors.
  await expect(panel.getByText('Suzkapu', {exact: true})).toBeVisible();
  await page.goto('/friends/invite/' + 'b'.repeat(64));
  await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  await panel.getByRole('button', {name: accept ? 'Accept' : 'Decline', exact: true}).press('Enter');
  const state = accept ? 'accepted' : 'declined', feedback = panel.locator('v2-friends-feedback');
  await expect(feedback.getByRole('status')).toContainText(`Friend request ${state}`);
  await expect(panel.getByRole('button', {name: 'Accept', exact: true})).toHaveCount(0);
  await expect(panel.getByRole('button', {name: 'Decline', exact: true})).toHaveCount(0);
  await captureFriendsFeedback(page, feedback, info, state);
  await feedback.getByRole('button', {name: 'View friends', exact: true}).press('Enter');
  await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
  await expect(panel.getByText('Suzkapu', {exact: true})).toBeVisible();
  expect(writes.filter(write => write.name === 'respond_friend_request')).toEqual([{name: 'respond_friend_request', body: {p_invitation_id: '77777777-7777-4777-8777-777777777777', p_accept: accept}}]);
  expect(writes.some(write => write.name === 'remove_friend' || write.name === 'revoke_friend_invitation')).toBe(false);
  expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
});

test('Friends acknowledged decision retries only the failed inventory while showing cached content', async ({page}, info) => {
  const fixture = await setupFriends(page, 'reduce', undefined, undefined, [], {failConfirmingRead: true});
  const {panel, writes, unexpected, runtimeErrors} = fixture;
  const request = panel.getByRole('region', {name: 'Friend request from Paulzgi', exact: true});
  await request.getByRole('button', {name: 'Accept', exact: true}).press('Enter');
  const feedback = panel.locator('v2-friends-feedback');
  await expect(feedback.getByRole('alert')).toContainText('Friends could not be loaded');
  try {
    await feedback.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
    await expect.poll(fixture.friendsReadWaiting).toBe(true);
    await expect(feedback.getByRole('status')).toContainText('Refreshing friends…');
    await expect(panel.locator('.friend-row')).toHaveCount(1); await expect(request).toBeVisible();
    await expect(request.getByRole('button', {name: 'Accept', exact: true})).toBeDisabled();
    await expect(request.getByRole('button', {name: 'Decline', exact: true})).toBeDisabled();
    await captureFriendsFeedback(page, feedback, info, 'refreshing');
  } finally {fixture.releaseFriendsRead();}
  await expect(request).toHaveCount(0); await expect(panel.locator('.friend-row')).toHaveCount(1);
  await expect(feedback).toHaveCount(0);
  expect(fixture.counters().friendsReads).toBe(3);
  expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(1);
  expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
});

test('Friends saved invitation explains unavailable session link without revealing a secret', async ({page}, info) => {
  const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce', undefined, undefined,
    [{id: '55555555-5555-4555-8555-555555555555', status: 'pending', createdAt: '2026-10-12'}]);
  await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  await expect(panel.getByRole('button', {name: 'View link & QR', exact: true})).toBeDisabled();
  await expect(panel.locator('.invitation-url, .qr-slot img')).toHaveCount(0);
  const feedback = panel.locator('.pending-invitation v2-friends-feedback');
  await expect(feedback.getByRole('status')).toContainText('Link unavailable in this session');
  await captureFriendsFeedback(page, feedback, info, 'link-unavailable', 34);
  await expect(panel.getByRole('button', {name: 'Revoke', exact: true})).toBeEnabled();
  expect(writes).toEqual([]); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
});

test('Friends invitation revoked before confirming read shows unavailable feedback', async ({page}, info) => {
  const fixture = await setupFriends(page, 'reduce', 'd'.repeat(64));
  const {panel, writes, unexpected, runtimeErrors} = fixture;
  try {await expect.poll(() => typeof fixture.inboxRelease()).toBe('function');} finally {fixture.releaseInbox();}
  const feedback = panel.locator('v2-friends-feedback');
  await expect(feedback.getByRole('alert')).toContainText('This invitation is unavailable');
  await captureFriendsFeedback(page, feedback, info, 'unavailable');
  await expect(panel.getByRole('button', {name: 'Accept', exact: true})).toHaveCount(0);
  await expect(panel.getByRole('button', {name: 'Retry', exact: true})).toHaveCount(0);
  expect(writes.filter(write => write.name === 'receive_friend_invitation')).toHaveLength(1);
  expect(writes.filter(write => write.name === 'respond_friend_request')).toEqual([]);
  expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
});

test('Friends unverified personal connection is gated before private inventory access', async ({page}) => {
  const {panel, writes, unexpected, runtimeErrors, counters} = await setupFriends(page, 'reduce', undefined, undefined, [], {unverifiedPersonalConnection: true});
  await expect(page).toHaveURL(/\/spotify\/cloud-access\?/);
  expect(new URL(page.url()).searchParams.get('returnUrl')).toBe('/friends');
  await expect(page.getByRole('heading', {name: 'Enable this workspace feature', exact: true})).toBeVisible();
  await expect(panel).toHaveCount(0);
  expect(counters().inventoryReads).toEqual([]); expect(writes).toEqual([]);
  await page.getByRole('button', {name: 'Not now', exact: true}).press('Enter');
  await expect(page).toHaveURL(/\/playlists$/); await expect(panel).toHaveCount(0);
  expect(counters().inventoryReads).toEqual([]); expect(writes).toEqual([]);
  expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
});

test('Friends action icons retain canonical active and secondary semantic paints', async ({page}, info) => {
  const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce');
  await expect(panel.locator('.friend-row')).toHaveCount(1);
  const glyphPaint = (selector: string) => panel.locator(selector).evaluate(element => getComputedStyle(element, '::before').backgroundColor);
  const readyPeople = await glyphPaint('.friends-tabs .people');
  const readyPlus = await glyphPaint('.add-friend .plus');
  await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  const addPeople = await glyphPaint('.friends-tabs .people');
  const addPlus = await glyphPaint('.add-friend .plus');
  await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
  await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  await panel.getByRole('button', {name: 'Create new invitation', exact: true}).press('Enter');
  await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  const copy = await glyphPaint('.copy-icon');
  await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  const viewQr = await glyphPaint('.pending-invitation .qr-icon');
  const revokeTrash = await glyphPaint('.pending-invitation .trash');
  await panel.getByRole('link', {name: 'Friends', exact: true}).click();
  await panel.getByRole('button', {name: 'Manage friend Suzkapu', exact: true}).press('Enter');
  await panel.getByRole('menuitem', {name: 'Remove friend', exact: true}).press('Enter');
  const confirmationTrash = await glyphPaint('.confirmation .trash');
  await page.keyboard.press('Escape'); await expect(panel.getByRole('dialog')).toHaveCount(0);
  const paints = {readyPeople, readyPlus, addPeople, addPlus, copy, viewQr, revokeTrash, confirmationTrash};
  await writeFile(info.outputPath('friends-icon-paints.json'), JSON.stringify(paints, null, 2));
  expect(paints).toEqual({readyPeople: 'rgb(6, 19, 11)', readyPlus: 'rgb(162, 173, 166)', addPeople: 'rgb(162, 173, 166)', addPlus: 'rgb(162, 173, 166)', copy: 'rgb(6, 19, 11)', viewQr: 'rgb(162, 173, 166)', revokeTrash: 'rgb(255, 116, 125)', confirmationTrash: 'rgb(162, 173, 166)'});
  expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  expect(writes.some(write => write.name === 'remove_friend' || write.name === 'revoke_friend_invitation')).toBe(false);
  expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
});

test('Friends ready content preserves canonical card geometry during resizing', async ({page}, info) => {
  const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce', undefined, ['Suzkapu', 'Daniel_P', 'Alex']);
  await expect(panel.locator('.friend-row')).toHaveCount(3);
  await expectNativeTransitionsSettled(page);
  const envelope = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-row-current-canonical.json', 'utf8'));
  const canonical = JSON.parse(envelope.content.find((item: {type: string}) => item.type === 'text').text);
  const pointerCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-touch-canonical.json', 'utf8'));
  const tabCanonical = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-parity-ready-tab-sizing.json', 'utf8'));
  const samples = [];
  for (const width of [1440, 390, 320]) for (const height of [480, 1000]) {
    await page.setViewportSize({width, height});
    const sample = await panel.evaluate(element => ({width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth,
      coarsePointer: matchMedia('(pointer: coarse)').matches,
      tabs: [...element.querySelectorAll<HTMLElement>('.friends-tabs a')].map(tab => ({width: tab.getBoundingClientRect().width,
        height: tab.getBoundingClientRect().height, paddingLeft: parseFloat(getComputedStyle(tab).paddingLeft)})),
      rows: [...element.querySelectorAll('.friend-row')].map(row => {
        const bounds = row.getBoundingClientRect();
        const action = row.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
        const actionBounds = action.getBoundingClientRect();
        return {x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height,
          action: {width: actionBounds.width, height: actionBounds.height, borderColor: getComputedStyle(action).borderColor}};
      })}));
    samples.push(sample);
  }
  for (const [name, viewport] of [['desktop', {width: 1440, height: 810}], ['mobile', {width: 390, height: 867}]] as const) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => document.fonts.ready);
    await panel.screenshot({path: info.outputPath(`candidate-friends-ready-${name}.png`), animations: 'disabled', scale: 'css'});
    await expect(panel).toHaveScreenshot(`friends-ready-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  }
  await writeFile(info.outputPath('friends-ready-geometry.json'), JSON.stringify({canonical, pointerVariants: pointerCanonical.variants, samples}, null, 2));
  for (const sample of samples) {
    const reference = canonical.find((item: {viewport: string}) => item.viewport === (sample.width <= 760 ? 'mobile' : 'desktop'));
    const pointerReference = pointerCanonical.variants.find((item: {variants: {State: string; Pointer: string}}) =>
      item.variants.State === 'Default' && item.variants.Pointer === (sample.coarsePointer ? 'Coarse' : 'Fine'));
    expect(sample.scrollWidth).toBeLessThanOrEqual(sample.width);
    const tabReference = sample.width === 1440 ? tabCanonical.desktop : tabCanonical.mobile;
    for (const [index, tab] of sample.tabs.entries()) {
      expect(tab.height).toBe(tabReference.children[index].height);
      expect(tab.paddingLeft).toBe(tabReference.children[index].paddingLeft);
      const expectedWidth = tabReference.children[index].width - (sample.width === 320 ? 35 : 0);
      expect(tab.width).toBe(expectedWidth);
    }
    for (const [index, row] of sample.rows.entries()) {
      expect(row.height).toBe(pointerReference.height);
      expect(row.action.width).toBe(pointerReference.action[0].width);
      expect(row.action.height).toBe(pointerReference.action[0].height);
      expect(row.action.borderColor).toBe('rgb(107, 125, 113)');
      expect(row.width).toBe(sample.width === 320 ? 288 : reference.rows[0].width);
      if (index) expect(row.y - sample.rows[index - 1].y - sample.rows[index - 1].height).toBe(reference.gap);
    }
  }
  await expectNoBlockingAxeViolations(page);
  expect(writes).toEqual([]); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
});

for (const visualState of ['add', 'invitations', 'review']) test(`Friends secondary ${visualState} content has deterministic canonical visual candidates`, async ({page}, info) => {
  await page.addInitScript(() => {
    const original = crypto.getRandomValues.bind(crypto);
    let sequence = 0;
    Object.defineProperty(crypto, 'getRandomValues', {value: (array: Uint8Array) => {
      if (!(array instanceof Uint8Array) || array.length !== 32) return original(array);
      sequence++;
      array.forEach((_, index) => {array[index] = (sequence * 37 + index) % 256;});
      return array;
    }});
  });
  const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce');
  const controls = JSON.parse(await readFile('docs/testing-evidence/design-v2/friends-secondary-controls-canonical.json', 'utf8'));
  const frameIds: Record<string, readonly string[]> = {add: ['192:11619', '192:11744'], invitations: ['192:11835', '192:11960'], review: ['192:12051', '192:12176']};
  const capture = async (state: string) => {
    await expectNativeTransitionsSettled(page);
    await page.evaluate(() => document.fonts.ready);
    for (const [name, viewport] of [['desktop', {width: 1440, height: 1000}], ['mobile', {width: 390, height: 1000}]] as const) {
      await page.setViewportSize(viewport);
      await page.mouse.move(0, 0);
      const reference = controls.screens.find((screen: {id: string}) => screen.id === frameIds[state][name === 'desktop' ? 0 : 1]);
      const tabs = await panel.locator('.friends-tabs a').evaluateAll(elements => elements.map(element => ({width: element.getBoundingClientRect().width,
        paddingLeft: parseFloat(getComputedStyle(element).paddingLeft)})));
      expect.soft(tabs).toEqual(reference.children.map((child: {width: number; paddingLeft: number}) => ({width: child.width, paddingLeft: child.paddingLeft})));
      if (state === 'invitations') {
        const revoke = panel.getByRole('button', {name: 'Revoke', exact: true});
        await expect.soft(revoke).toHaveCSS('background-color', 'rgb(24, 32, 25)');
        await expect.soft(revoke).toHaveCSS('border-color', 'rgb(255, 116, 125)');
      }
      await expectNoBlockingAxeViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await panel.screenshot({path: info.outputPath(`candidate-friends-${state}-${name}.png`), animations: 'disabled', scale: 'css'});
      await expect(panel).toHaveScreenshot(`friends-${state}-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
    }
  };
  await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
  await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
  await panel.getByRole('button', {name: 'Create new invitation', exact: true}).click();
  await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
  // Root publication changes both the displayed URL and the QR payload.
  await expect(panel.locator('.invitation-url')).toHaveText(new URL('/friends/invite/' +
    Array.from({length: 32}, (_, index) => ((2 * 37 + index) % 256).toString(16).padStart(2, '0')).join(''), page.url()).href);
  if (visualState === 'add') await capture('add');
  await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
  if (visualState === 'invitations') await capture('invitations');
  await page.goto('/friends/invite/' + 'b'.repeat(64));
  await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  await panel.getByRole('button', {name: 'Retry', exact: true}).click();
  await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
  if (visualState === 'review') await capture('review');
  expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
  expect(writes.filter(write => write.name === 'respond_friend_request')).toEqual([]);
  expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
});

test('Friends invitation navigation recovers during immediate viewport resizing', async ({page}, info) => {
  await page.setViewportSize({width: 1920, height: 1000});
  const {panel, unexpected, runtimeErrors} = await setupFriends(page, 'no-preference');
  try {
    await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
    await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
    await panel.getByRole('button', {name: 'Retry', exact: true}).click();
    await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
    await panel.getByRole('button', {name: 'Create new invitation', exact: true}).click();
    await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
    await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
    await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
    await page.setViewportSize({width: 1440, height: 900});
    await page.setViewportSize({width: 390, height: 900});
    await expectNativeTransitionsSettled(page);
    await panel.getByRole('link', {name: 'View link & QR'}).click();
    await expect(panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'})).toBeVisible();
    await expectNativeTransitionsSettled(page);
    expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  } finally {
    const probe = await page.evaluate(() => (window as unknown as {analytifyNativeTransitionProbe: unknown}).analytifyNativeTransitionProbe);
    await writeFile(info.outputPath('friends-resize-transition-probe.json'), JSON.stringify(probe, null, 2));
  }
});

test('Friends empty content preserves canonical geometry and starts only an explicit invitation', async ({page}, info) => {
  const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, 'reduce', undefined, []);
  const card = panel.locator('.empty-friends');
  const action = card.getByRole('link', {name: 'Add your first friend', exact: true});
  await expect(card.getByRole('heading', {name: 'Your friends will appear here.', exact: true})).toBeVisible();
  await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toBeVisible();
  const samples = [];
  for (const width of [1440, 390, 320]) for (const height of [480, 1000]) {
    await page.setViewportSize({width, height});
    await action.scrollIntoViewIfNeeded();
    const sample = await card.evaluate(element => {
      const bounds = element.getBoundingClientRect(), action = element.querySelector('a')!, button = action.getBoundingClientRect();
      const heading = getComputedStyle(element.querySelector('h2')!);
      return {viewportWidth: innerWidth, viewportHeight: innerHeight, width: bounds.width, height: bounds.height,
        actionWidth: button.width, actionHeight: button.height, fontSize: heading.fontSize, lineHeight: heading.lineHeight,
        reachable: document.elementFromPoint(button.x + button.width / 2, button.y + button.height / 2)?.closest('a') === action,
        scrollWidth: document.documentElement.scrollWidth};
    });
    expect(sample.width).toBe(width === 1440 ? 1120 : width - 32);
    expect(sample.height).toBeGreaterThanOrEqual(122);
    if (width !== 320) expect(sample.height).toBe(122);
    expect(sample.actionWidth).toBe(sample.width - 34); expect(sample.actionHeight).toBe(48);
    expect(sample.fontSize).toBe('20px'); expect(sample.lineHeight).toBe('28px');
    expect(sample.reachable).toBe(true); expect(sample.scrollWidth).toBeLessThanOrEqual(width);
    samples.push(sample);
  }
  for (const [name, width] of [['desktop', 1440], ['mobile', 390]] as const) {
    await page.setViewportSize({width, height: 1000});
    await card.screenshot({path: info.outputPath(`candidate-friends-empty-${name}.png`), animations: 'disabled', scale: 'css'});
    await expect(card).toHaveScreenshot(`friends-empty-${name}.png`, {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
  }
  await writeFile(info.outputPath('friends-empty-geometry.json'), JSON.stringify(samples, null, 2));
  await expectNoBlockingAxeViolations(page); expect(writes).toEqual([]);
  await action.click(); await expect(page).toHaveURL(/\/friends\/add$/);
  await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
  expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(1);
  expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
});

test('Friends cold loading, keyboard retry and busy decisions preserve data boundaries', async ({page}, info) => {
  const fixture = await setupFriends(page, 'reduce', undefined, undefined, [], {holdInitialReads: true, holdResponse: true});
  const {panel, writes, unexpected, runtimeErrors} = fixture;
  const focus = async () => page.evaluate(() => ({tag: document.activeElement?.tagName,
    text: document.activeElement?.textContent?.trim().slice(0, 100), id: document.activeElement?.id}));
  const focusSamples = [];
  try {
    await expect.poll(fixture.friendsReadWaiting).toBe(true);
    const feedback = panel.locator('v2-friends-feedback');
    await expect(feedback.getByRole('status')).toContainText('Loading friends…');
    await expect(feedback.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    await expect(panel.locator('.friend-row, .empty-friends, .request')).toHaveCount(0);
    expect(writes).toEqual([]);
    await captureFriendsFeedback(page, feedback, info, 'loading');
    fixture.releaseFriendsRead();
    const retry = feedback.getByRole('button', {name: 'Retry', exact: true});
    await expect(feedback.getByRole('alert')).toContainText('Friends could not be loaded');
    await expect(panel.locator('.empty-friends')).toHaveCount(0);
    const retryBounds = await retry.boundingBox();
    await panel.getByRole('link', {name: 'Add friend', exact: true}).focus();
    await page.keyboard.press('Tab'); await expect(retry).toBeFocused();
    const retryFocus = await retry.evaluate(element => {
      const style = getComputedStyle(element);
      return {visible: element.matches(':focus-visible'), width: style.outlineWidth,
        offset: style.outlineOffset, color: style.outlineColor, style: style.outlineStyle};
    });
    expect(retryFocus).toEqual({visible: true, width: '2px', offset: '-2px', color: 'rgb(159, 255, 200)', style: 'solid'});
    expect(await retry.boundingBox()).toEqual(retryBounds);
    await writeFile(info.outputPath('friends-retry-focus-paint.json'), JSON.stringify(retryFocus, null, 2));
    await expectNoBlockingAxeViolations(page);
    await captureFriendsFeedback(page, feedback, info, 'load-error');
    await retry.press('Enter');
    await expect.poll(fixture.friendsReadWaiting).toBe(true);
    await expect(feedback.getByRole('status')).toContainText('Loading friends…');
    await expect(retry).toHaveCount(0);
    focusSamples.push({state: 'retry-pending', focus: await focus()});
    await expect(feedback.getByRole('status')).toBeFocused();
    fixture.releaseFriendsRead();
    const request = panel.getByRole('region', {name: 'Friend request from Paulzgi', exact: true});
    await expect(request).toBeVisible(); await expect(panel.locator('.friend-row')).toHaveCount(1);
    focusSamples.push({state: 'retry-recovered', focus: await focus()});
    await expect(page.locator('#v2-main-content')).toBeFocused();
    expect(fixture.counters().friendsReads).toBe(2); expect(writes).toEqual([]);
    const accept = request.getByRole('button', {name: 'Accept', exact: true});
    await accept.press('Enter'); await expect.poll(fixture.responseWaiting).toBe(true);
    await expect(feedback.getByRole('status')).toContainText('Updating your request…');
    await expect(feedback.getByRole('status')).toBeFocused();
    await expect(feedback.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    await expect(request.getByRole('button', {name: 'Accept', exact: true})).toBeDisabled();
    await expect(request.getByRole('button', {name: 'Decline', exact: true})).toBeDisabled();
    await expect(panel.locator('.friend-row')).toHaveCount(1);
    await page.keyboard.press('Enter');
    expect(writes).toEqual([{name: 'respond_friend_request', body: {p_invitation_id: '44444444-4444-4444-8444-444444444444', p_accept: true}}]);
    await captureFriendsFeedback(page, feedback, info, 'busy');
    await expectNoBlockingAxeViolations(page);
    fixture.releaseResponse(); await expect(request).toHaveCount(0);
    await expect(panel.locator('.friend-row')).toHaveCount(1);
    focusSamples.push({state: 'decision-confirmed', focus: await focus()});
    await expect(page.locator('#v2-main-content')).toBeFocused();
    await expectNativeTransitionsSettled(page);
    expect(writes).toHaveLength(1); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  } finally {
    fixture.releaseFriendsRead(); fixture.releaseResponse();
    await writeFile(info.outputPath('friends-feedback-focus.json'), JSON.stringify(focusSamples, null, 2));
  }
});

test('Friends pending decision does not steal deliberately moved keyboard focus', async ({page}, info) => {
  const fixture = await setupFriends(page, 'reduce', undefined, undefined, [], {holdResponse: true});
  const {panel, writes, unexpected, runtimeErrors} = fixture;
  const request = panel.getByRole('region', {name: 'Friend request from Paulzgi', exact: true});
  await expect(request).toBeVisible();
  try {
    await request.getByRole('button', {name: 'Accept', exact: true}).press('Enter');
    await expect.poll(fixture.responseWaiting).toBe(true);
    await expect(panel.locator('v2-friends-feedback').getByRole('status')).toBeFocused();
    const add = panel.getByRole('link', {name: 'Add friend', exact: true});
    await add.focus(); await expect(add).toBeFocused();
    fixture.releaseResponse(); await expect(request).toHaveCount(0);
    await expect(add).toBeFocused();
    expect(writes).toHaveLength(1); expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
    await writeFile(info.outputPath('friends-focus-user-owned.json'), JSON.stringify({focused: await add.evaluate(element => document.activeElement === element), writeCount: writes.length}));
  } finally {fixture.releaseResponse();}
});

test('Friends confirmation typography and keyboard focus match canonical after font readiness', async ({page}, info) => {
  const {panel} = await setupFriends(page, 'reduce', undefined, undefined,
    [{id: '55555555-5555-4555-8555-555555555555', status: 'pending', createdAt: '2026-10-12'}]);
  await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
  await panel.getByRole('link', {name: 'Add friend', exact: true}).focus();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', {name: 'Revoke', exact: true})).toBeFocused();
  await page.keyboard.press('Enter');
  const dialog = panel.getByRole('dialog', {name: 'Revoke friend invitation?', exact: true});
  const measure = () => dialog.evaluate(element => {
    const body = element.querySelector('p')!, style = getComputedStyle(body);
    const canvas = document.createElement('canvas').getContext('2d')!;
    canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    return {dialogWidth: element.getBoundingClientRect().width, dialogHeight: element.getBoundingClientRect().height,
      bodyWidth: body.getBoundingClientRect().width, bodyHeight: body.getBoundingClientRect().height,
      font: style.font, fontFamily: style.fontFamily, fontWeight: style.fontWeight, fontSize: style.fontSize,
      lineHeight: style.lineHeight, letterSpacing: style.letterSpacing, wordSpacing: style.wordSpacing,
      fontVariationSettings: style.fontVariationSettings, fontKerning: style.fontKerning,
      canonicalFirstLineWidth: canvas.measureText('Disables this invitation’s private').width,
      fontsStatus: document.fonts.status, variableReady: document.fonts.check('400 16px "Outfit Variable"'),
      faces: [...document.fonts].map(face => ({family: face.family, weight: face.weight, status: face.status}))};
  });
  const before = await measure();
  await page.evaluate(() => document.fonts.ready);
  const after = await measure();
  await writeFile(info.outputPath('friends-dialog-font-metrics.json'), JSON.stringify({before, after}, null, 2));
  await dialog.screenshot({path: info.outputPath('friends-dialog-font-ready.png'), animations: 'disabled', scale: 'css'});
  expect(after.dialogWidth).toBe(272); expect(after.bodyWidth).toBe(222);
  expect(after.fontSize).toBe('16px'); expect(after.lineHeight).toBe('24px');
  expect(after.dialogHeight).toBe(322); expect(after.bodyHeight).toBe(72);
  const cancel = dialog.getByRole('button', {name: 'Cancel', exact: true});
  await expect(cancel).toBeFocused();
  const focusPaint = await cancel.evaluate(element => {
    const style = getComputedStyle(element);
    return {visible: element.matches(':focus-visible'), width: style.outlineWidth,
      offset: style.outlineOffset, color: style.outlineColor, style: style.outlineStyle};
  });
  await writeFile(info.outputPath('friends-dialog-focus-paint.json'), JSON.stringify(focusPaint, null, 2));
  expect(focusPaint).toEqual({visible: true, width: '2px', offset: '-2px', color: 'rgb(159, 255, 200)', style: 'solid'});
});

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`Friends removal dialog responsive geometry (${motion})`, async ({page}, info) => {
    const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, motion);
    await expect(panel.locator('.friend-row')).toHaveCount(1);
    await expectNativeTransitionsSettled(page);
    const manage = panel.getByRole('button', {name: 'Manage friend Suzkapu'});
    await manage.press('Enter'); await panel.getByRole('menuitem', {name: 'Remove friend'}).press('Enter');
    const dialog = panel.getByRole('dialog', {name: 'Remove Suzkapu?'});
    await expect(dialog).toBeVisible();
    if (motion === 'reduce') {
      await expect(panel.locator('.confirmation-layer')).toHaveCSS('animation-name', 'none');
      expect(await panel.locator('.confirmation-layer').evaluate(element => element.getAnimations().length)).toBe(0);
    } else {
      await expect(panel.locator('.confirmation-layer')).toHaveCSS('animation-duration', '0.15s');
    }
    await expect(dialog.locator('.icon.trash')).toHaveCount(1);
    await expect(dialog.getByRole('button')).toHaveText(['Remove friend', 'Cancel']);
    await expect(dialog).toHaveAccessibleDescription('Removes this person from your friends. You can send a new friend request later.');
    await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
    await page.keyboard.press('Tab'); await expect(dialog.getByRole('button', {name: 'Remove friend', exact: true})).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
    await dialog.screenshot({path: info.outputPath('candidate-friends-remove-dialog.png'), animations: 'disabled', scale: 'css'});
    if (motion === 'reduce') await expect(dialog).toHaveScreenshot('friends-remove-dialog.png', {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
    const geometry = [];
    for (const height of [480, 1000]) for (const width of [320, 360, 390, 767, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({width, height});
      await expect(dialog).toBeVisible();
      const sample = await dialog.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return {width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom,
          backdropFilter: getComputedStyle(document.querySelector('.confirmation-backdrop')!).backdropFilter};
      });
      expect(sample.scrollWidth).toBeLessThanOrEqual(width);
      expect(sample.x).toBeGreaterThanOrEqual(0); expect(sample.right).toBeLessThanOrEqual(width);
      expect(sample.y).toBeGreaterThanOrEqual(0); expect(sample.bottom).toBeLessThanOrEqual(height);
      expect(sample.right - sample.x).toBe(272);
      expect(sample.bottom - sample.y).toBe(294);
      expect(sample.backdropFilter).toBe('blur(12px)'); geometry.push(sample);
    }
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(manage).toBeFocused();
    expect(writes).toHaveLength(0);
    await manage.press('Enter'); await panel.getByRole('menuitem', {name: 'Remove friend'}).press('Enter');
    await dialog.getByRole('button', {name: 'Remove friend', exact: true}).press('Enter');
    await expect(dialog).toHaveCount(0); await expect(panel.locator('.friend-row')).toHaveCount(0);
    await expect(page.locator('#v2-main-content')).toBeFocused();
    await expect(panel.getByRole('region', {name: 'Friend request from Paulzgi', exact: true})).toBeVisible();
    expect(writes).toEqual([{name: 'remove_friend', body: {p_friend_user_id: '22222222-2222-4222-8222-222222222222', p_connection_version: '33333333-3333-4333-8333-333333333333'}}]);
    await expectNoBlockingAxeViolations(page);
    await writeFile(info.outputPath('friends-removal-geometry.json'), JSON.stringify({motion, geometry}, null, 2));
    expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  });
  test(`Friends invitations and responsive geometry (${motion})`, async ({page}, info) => {
    const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, motion);
    await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
    await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toBeVisible();
    await expectNativeTransitionsSettled(page);
    await expectNoBlockingAxeViolations(page);
    await panel.getByRole('button', {name: 'Decline', exact: true}).press('Enter');
    await expect(panel.getByText('Friend request from Paulzgi', {exact: true})).toHaveCount(0);
    expect(writes).toEqual([{name: 'respond_friend_request', body: {p_invitation_id: '44444444-4444-4444-8444-444444444444', p_accept: false}}]);
    await panel.getByRole('link', {name: 'Add friend', exact: true}).click();
    const qr = panel.getByRole('img', {name: 'Scan to open this single-person friend invitation'});
    await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
    await expect(panel.getByRole('button', {name: 'Retry', exact: true}).locator('.sync')).toHaveCSS('width', '18px');
    await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
    await expect(panel.getByRole('status')).toContainText('Your invitation is no longer active');
    await expect(qr).toHaveCount(0);
    const consumedCreations = writes.filter(write => write.name === 'create_friend_invitation');
    expect(consumedCreations).toHaveLength(2);
    expect(consumedCreations[1].body).toEqual(consumedCreations[0].body);
    await expectNoBlockingAxeViolations(page);
    await panel.screenshot({path: info.outputPath('friends-owner-inactive.png'), animations: 'disabled'});
    await panel.getByRole('button', {name: 'Create new invitation', exact: true}).press('Enter');
    await expect(qr).toBeVisible();
    await expect(qr).toHaveJSProperty('naturalWidth', 176); await expect(qr).toHaveJSProperty('naturalHeight', 176);
    const copy = panel.getByRole('button', {name: 'Copy link', exact: true});
    await expect(copy).toHaveCSS('font-size', '14px');
    await expect(copy).toHaveCSS('font-weight', '600');
    await expect(copy).toHaveCSS('line-height', '20px');
    await expect.soft(panel.locator('.qr-identity .identity')).toHaveCSS('gap', '12px');
    const creations = writes.filter(write => write.name === 'create_friend_invitation');
    expect(creations).toHaveLength(3); expect(creations[2].body.p_claim_token).toMatch(/^[a-f0-9]{64}$/);
    expect(creations[2].body.p_claim_token).not.toBe(creations[0].body.p_claim_token);
    const expectedUrl = `http://127.0.0.1:4214/friends/invite/${creations[2].body.p_claim_token}`;
    await expect(panel.locator('.invitation-url')).toHaveText(expectedUrl);
    await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
    await expect(panel.getByRole('link', {name: 'View link & QR'})).toBeVisible();
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 900});
      const actions = await panel.locator('.friends-card .actions').evaluate(element => [...element.children].map(child => child.getBoundingClientRect().width));
      expect.soft(actions).toEqual(width === 1440 ? [180, 112] : [160, 112]);
    }
    await panel.getByRole('link', {name: 'View link & QR'}).click(); await expect(qr).toBeVisible();
    expect(writes.filter(write => write.name === 'create_friend_invitation')).toHaveLength(3);
    await expectNativeTransitionsSettled(page); await expectNoBlockingAxeViolations(page);
    await page.setViewportSize({width: info.project.name === 'mobile' ? 390 : 1440, height: 900});
    await page.evaluate(() => document.fonts.ready);
    await panel.screenshot({path: info.outputPath('friends-add.png'), animations: 'disabled'});
    const incomingToken = 'b'.repeat(64);
    await page.goto('/friends/invite/' + incomingToken);
    await expect(panel.getByRole('alert')).toContainText('could not be confirmed');
    await panel.getByRole('button', {name: 'Retry', exact: true}).press('Enter');
    await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toBeVisible();
    await expect.soft(panel.locator('.friends-card > p')).toHaveCSS('font-size', '16px');
    await expect.soft(panel.locator('.friends-card > p')).toHaveCSS('line-height', '24px');
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 900});
      const actions = await panel.locator('.friends-card .actions').evaluate(element => [...element.children].map(child => child.getBoundingClientRect().width));
      expect.soft(actions).toEqual(width === 1440 ? [200, 120] : [155, 157]);
    }
    expect(writes.filter(write => write.name === 'receive_friend_invitation').map(write => write.body))
      .toEqual([{p_claim_token: incomingToken}, {p_claim_token: incomingToken}]);
    expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(1);
    await expectNoBlockingAxeViolations(page);
    await panel.screenshot({path: info.outputPath('friends-review-recovered.png'), animations: 'disabled'});
    const accept = motion === 'no-preference';
    await panel.getByRole('button', {name: accept ? 'Accept' : 'Decline', exact: true}).press('Enter');
    await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toHaveCount(0);
    await expect(panel.getByRole('status')).toContainText(accept ? 'Friend request accepted' : 'Friend request declined');
    const actionStyle = await panel.getByRole('button', {name: 'View friends', exact: true}).evaluate(element => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return {width: rect.width, height: rect.height, fontSize: style.fontSize, fontWeight: style.fontWeight, lineHeight: style.lineHeight};
    });
    expect(actionStyle).toEqual({width: 260, height: 48, fontSize: '14px', fontWeight: '600', lineHeight: '20px'});
    expect(writes.at(-1)).toEqual({name: 'respond_friend_request', body: {p_invitation_id: '77777777-7777-4777-8777-777777777777', p_accept: accept}});
    await expectNoBlockingAxeViolations(page);
    await panel.screenshot({path: info.outputPath('friends-outcome.png'), animations: 'disabled'});
    await panel.getByRole('button', {name: 'View friends', exact: true}).press('Enter');
    await expect(panel.getByRole('heading', {name: 'Your friends', exact: true})).toBeVisible();
    expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(2);
    await expectNativeTransitionsSettled(page);
    await writeFile(info.outputPath('friends-native.json'), JSON.stringify({motion, writeNames: writes.map(write => write.name), unexpected, runtimeErrors}, null, 2));
    expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  });
  test(`Friends owner revocation confirmation (${motion})`, async ({page}, info) => {
    const {panel, writes, unexpected, runtimeErrors} = await setupFriends(page, motion, undefined, undefined,
      [{id: '55555555-5555-4555-8555-555555555555', status: 'pending', createdAt: '2026-10-12'}]);
    await panel.getByRole('link', {name: 'Invitations', exact: true}).click();
    await expect(panel.locator('.invitation-icon')).toHaveCSS('background-color', 'rgb(6, 19, 11)');
    const revoke = panel.getByRole('button', {name: 'Revoke', exact: true});
    await panel.getByRole('link', {name: 'Add friend', exact: true}).focus();
    await page.keyboard.press('Tab'); await expect(revoke).toBeFocused();
    await page.keyboard.press('Enter');
    const revokeDialog = panel.getByRole('dialog', {name: 'Revoke friend invitation?', exact: true});
    await expect(revokeDialog).toHaveAccessibleDescription('Disables this invitation’s private link and QR code. Existing friendships are unchanged.');
    await expect(revokeDialog.getByRole('button')).toHaveText(['Revoke invitation', 'Cancel']);
    await expect(revokeDialog.locator('.icon.trash')).toHaveCount(0);
    await expect(revokeDialog.getByRole('button', {name: 'Revoke invitation', exact: true})).toHaveCSS('background-color', 'rgb(24, 32, 25)');
    await expect(revokeDialog.getByRole('button', {name: 'Revoke invitation', exact: true})).toHaveCSS('border-color', 'rgb(255, 116, 125)');
    await expect(revokeDialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
    expect(writes.filter(write => write.name === 'revoke_friend_invitation')).toEqual([]);
    await revokeDialog.screenshot({path: info.outputPath('candidate-friends-revoke-dialog.png'), animations: 'disabled', scale: 'css'});
    if (motion === 'reduce') await expect(revokeDialog).toHaveScreenshot('friends-revoke-dialog.png', {animations: 'disabled', scale: 'css', threshold: .1, maxDiffPixels: 0});
    const revokeGeometry = [];
    for (const width of [320, 390, 768, 1440]) for (const height of [480, 1000]) {
      await page.setViewportSize({width, height});
      const sample = await revokeDialog.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return {width: innerWidth, height: innerHeight, x: bounds.x, y: bounds.y, right: bounds.right, bottom: bounds.bottom,
          scrollWidth: document.documentElement.scrollWidth, backdropFilter: getComputedStyle(document.querySelector('.confirmation-backdrop')!).backdropFilter};
      });
      expect(sample.x).toBeGreaterThanOrEqual(0); expect(sample.y).toBeGreaterThanOrEqual(0);
      expect(sample.right).toBeLessThanOrEqual(width); expect(sample.bottom).toBeLessThanOrEqual(height);
      expect(sample.right - sample.x).toBe(272);
      expect(sample.bottom - sample.y).toBe(322);
      expect(sample.scrollWidth).toBeLessThanOrEqual(width); expect(sample.backdropFilter).toBe('blur(12px)');
      revokeGeometry.push(sample);
    }
    await expectNoBlockingAxeViolations(page);
    await page.keyboard.press('Tab'); await expect(revokeDialog.getByRole('button', {name: 'Revoke invitation', exact: true})).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(revokeDialog.getByRole('button', {name: 'Cancel', exact: true})).toBeFocused();
    await page.keyboard.press('Escape'); await expect(revokeDialog).toHaveCount(0); await expect(revoke).toBeFocused();
    expect(writes.filter(write => write.name === 'revoke_friend_invitation')).toEqual([]);
    await revoke.press('Enter'); await revokeDialog.getByRole('button', {name: 'Cancel', exact: true}).press('Enter');
    await expect(revoke).toBeFocused(); expect(writes.filter(write => write.name === 'revoke_friend_invitation')).toEqual([]);
    await revoke.press('Enter'); await revokeDialog.getByRole('button', {name: 'Revoke invitation', exact: true}).press('Enter');
    await expect(revokeDialog).toHaveCount(0); await expect(revoke).toHaveCount(0);
    await expect(page.locator('#v2-main-content')).toBeFocused();
    expect(writes.filter(write => write.name === 'revoke_friend_invitation')).toEqual([{name: 'revoke_friend_invitation', body: {p_invitation_id: '55555555-5555-4555-8555-555555555555'}}]);
    await panel.getByRole('link', {name: 'Friends', exact: true}).click();
    await expect(panel.getByText('Suzkapu', {exact: true})).toBeVisible();
    await expectNativeTransitionsSettled(page);
    await writeFile(info.outputPath('friends-revocation-native.json'), JSON.stringify({motion, revokeGeometry, writes, unexpected, runtimeErrors}, null, 2));
    expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  });
  test(`Friends confirming-read revocation and session exit (${motion})`, async ({page}, info) => {
    // The sender revokes after receive succeeds but before the confirming inbox read.
    const revokedToken = 'd'.repeat(64);
    const {panel, writes, unexpected, runtimeErrors, counters, inboxRelease, releaseInbox, releaseLogout} = await setupFriends(page, motion, revokedToken);
    try {
      await expect.poll(() => typeof inboxRelease()).toBe('function');
      await expect(panel.getByRole('status')).toContainText('Updating your request');
      await expect(panel.getByRole('button', {name: 'Accept', exact: true})).toHaveCount(0);
      await expect(panel.getByRole('button', {name: 'Decline', exact: true})).toHaveCount(0);
    } finally {releaseInbox();}
    await expect(panel.getByRole('alert')).toContainText('This invitation is unavailable');
    await expect(panel.getByRole('button', {name: 'Retry', exact: true})).toHaveCount(0);
    await expect(panel.getByRole('heading', {name: 'Incoming friend wants to be your friend', exact: true})).toHaveCount(0);
    await expectNativeTransitionsSettled(page);
    await expectNoBlockingAxeViolations(page);
    expect(writes.filter(write => write.name === 'receive_friend_invitation' && write.body['p_claim_token'] === revokedToken)).toHaveLength(1);
    expect(writes.filter(write => write.name === 'respond_friend_request')).toHaveLength(0);
    await panel.screenshot({path: info.outputPath('friends-review-revoked.png'), animations: 'disabled'});
    // Canonical account actions live in Settings. Leaving Friends must destroy
    // its secret state; Back during a held real SDK signout must stay protected.
    if ((page.viewportSize()?.width ?? 0) > 760) {
      await page.getByRole('complementary', {name: 'Desktop sidebar'}).getByRole('link', {name: 'Settings', exact: true}).press('Enter');
    } else {
      await page.getByRole('button', {name: 'Open navigation menu', exact: true}).press('Enter');
      await page.getByRole('dialog', {name: 'Navigation menu', exact: true}).getByRole('link', {name: 'Settings', exact: true}).press('Enter');
    }
    await expect(page).toHaveURL(/\/settings\/account$/);
    await expect(panel).toHaveCount(0);
    await page.getByRole('button', {name: 'Log out', exact: true}).press('Enter');
    try {
      await expect.poll(() => counters().authLogouts).toBe(1);
      await page.goBack();
      await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);
      await expect(panel.locator('.invitation-url, .qr-slot img, .friend-row')).toHaveCount(0);
    } finally {releaseLogout();}
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);
    await expect(panel.locator('.invitation-url, .qr-slot img')).toHaveCount(0);
    expect(counters().authLogouts).toBe(1);
    await page.goBack();
    await expect(page).toHaveURL(/\/login(?:[/?#]|$)/);
    await expect(panel.locator('.invitation-url, .qr-slot img')).toHaveCount(0);
    expect(counters().authLogouts).toBe(1);
    try {await expectNativeNavigationRecovery(page);}
    finally {
      const transitions = await page.evaluate(() => (window as unknown as {analytifyNativeTransitionProbe: unknown}).analytifyNativeTransitionProbe);
      await writeFile(info.outputPath('friends-transitions.json'), JSON.stringify(transitions, null, 2));
    }
    await writeFile(info.outputPath('friends-session.json'), JSON.stringify({motion, ...counters(), writeNames: writes.map(write => write.name), unexpected, runtimeErrors}, null, 2));
    expect(unexpected).toEqual([]); expect(runtimeErrors).toEqual([]);
  });
}
