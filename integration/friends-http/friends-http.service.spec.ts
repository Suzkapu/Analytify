import {Injector} from '@angular/core';
import {createClient, type Session, type SupabaseClient} from '@supabase/supabase-js';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {DESIGN_V2_FRIENDS_BACKEND_READY, FriendsService} from '@core/friends/friends.service';

interface ContractContext {
  origin: string;
  fixtureNonce: string;
  anonToken: string;
  actors: Array<{id: string; session: Session}>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {resolve = yes;});
  return {promise, resolve};
}

// This suite belongs to the dedicated disposable-stack runner. It fails closed
// outside that runner instead of adding a skipped test to the frontend suite.
const encodedContext = process.env['ANALYTIFY_FRIEND_HTTP_CONTEXT'];
if (!encodedContext) throw new Error('Run this contract through the isolated Friends HTTP runner.');
const context = JSON.parse(encodedContext) as ContractContext;
const origin = new URL(context.origin);
if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port || origin.username || origin.password
  || origin.pathname !== '/' || origin.search || origin.hash || context.actors.length !== 3 || !/^[a-f0-9]{64}$/.test(context.fixtureNonce)) {
  throw new Error('Friends Angular contract requires the owned loopback fixture.');
}

const requests: string[] = [];
let delayedDelivery: {path: string; reached: ReturnType<typeof deferred<number>>; release: ReturnType<typeof deferred<void>>} | undefined;
const clients = context.actors.map(({id, session}, index) => {
  if (session.user.id !== id || !/^\d{8}-\d{4}-4\d{3}-8\d{3}-\d{12}$/.test(id)) throw new Error('Invalid synthetic actor fixture.');
  const key = `isolated-friends-angular-${index}`;
  const values = new Map([[key, JSON.stringify(session)]]);
  return createClient(context.origin, context.anonToken, {
    auth: {storageKey: key, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storage: {getItem: name => values.get(name) ?? null, setItem: (name, value) => {values.set(name, value);}, removeItem: name => {values.delete(name);}}},
    global: {fetch: async (input, init = {}) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.origin !== origin.origin || !url.pathname.startsWith('/rest/v1/')) throw new Error('External or Auth transport is forbidden in this contract.');
      requests.push(url.pathname);
      const response = await fetch(input, {...init, signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(8000)])});
      const held = delayedDelivery;
      if (held?.path === url.pathname) {
        delayedDelivery = undefined;
        held.reached.resolve(response.status);
        await held.release.promise;
      }
      return response;
    }}
  });
});

const injectors: Array<ReturnType<typeof Injector.create>> = [];
beforeAll(async () => {
  // A safe metadata challenge rejects a stale/misdirected loopback context
  // before the suite can invoke any business mutation against that address.
  const response = await fetch(`${context.origin}/_analytify_friends_fixture`, {signal: AbortSignal.timeout(3000)});
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({fixture: 'analytify-disposable-friends-http', nonce: context.fixtureNonce});
});
function actor(index: number, options: {clientReady?: Promise<SupabaseClient>; backendReady?: boolean} = {}) {
  let currentIndex = index;
  const id = context.actors[index].id;
  const client: SupabaseClient = clients[index];
  const injector = Injector.create({providers: [FriendsService, SessionLifecycleService,
    {provide: SpotifyAuthService, useValue: {getSupabaseUserId: () => context.actors[currentIndex].id, hasCloudIdentity: () => true}},
    {provide: SupabaseService, useValue: {getClient: async () => options.clientReady ? await options.clientReady : clients[currentIndex]}},
    {provide: DESIGN_V2_FRIENDS_BACKEND_READY, useValue: options.backendReady ?? true}]});
  injectors.push(injector);
  return {id, client, service: injector.get(FriendsService), lifecycle: injector.get(SessionLifecycleService),
    switchActor: (nextIndex: number) => {if (!context.actors[nextIndex]) throw new Error('Invalid synthetic actor.'); currentIndex = nextIndex;}};
}

afterAll(async () => {
  delayedDelivery?.release.resolve();
  for (const injector of injectors) injector.destroy();
  await Promise.all(clients.map(client => client.auth.dispose()));
});

describe('real Angular Friends adapter on the disposable HTTP stack', () => {
  it('loads an actual SDK cached session and the actor-owned empty Friends inventory', async () => {
    const owner = actor(0);
    const session = await owner.client.auth.getSession();
    expect(session.error).toBeNull();
    expect(session.data.session?.user.id).toBe(owner.id);
    await expect(owner.service.listFriends()).resolves.toEqual([]);
    expect(requests).toContain('/rest/v1/rpc/list_friends');
    expect(requests.every(path => path.startsWith('/rest/v1/'))).toBe(true);
  });

  it('runs recipient-owned acceptance and versioned removal/reconnection without changing independent grants', async () => {
    const owner = actor(0), recipient = actor(1), outsider = actor(2);
    // The runner snapshots actual independent grant rows around this suite.
    // Authenticated raw-table access is intentionally not granted to this client.
    const token = owner.service.createClaimToken();
    const invitation = await owner.service.createInvitation(token);
    expect(Object.keys(invitation).sort()).toEqual(['createdAt', 'id', 'status']);
    expect(invitation.status).toBe('pending');
    expect(Date.parse(invitation.createdAt)).not.toBeNaN();
    const preview = await recipient.service.receiveInvitation(token);
    expect(Object.keys(preview).sort()).toEqual(['displayName', 'id', 'imageUrl', 'inviterUserId']);
    expect(preview).toMatchObject({id: invitation.id, inviterUserId: owner.id});
    await expect(owner.service.listFriends()).resolves.toEqual([]);
    await expect(recipient.service.listFriends()).resolves.toEqual([]);
    await expect(outsider.service.listRequests()).resolves.toEqual([]);
    const pending = await recipient.service.listRequests();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({requestId: invitation.id, inviterUserId: owner.id});
    expect(Object.keys(pending[0]).sort()).toEqual(['createdAt', 'displayName', 'imageUrl', 'inviterUserId', 'requestId']);
    expect(JSON.stringify([preview, pending, await owner.service.listInvitations()])).not.toContain(token);
    await expect(outsider.service.receiveInvitation(token)).rejects.toMatchObject({code: '22023'});
    await expect(outsider.service.respondToRequest(invitation.id, true)).rejects.toMatchObject({code: '22023'});
    await expect(recipient.service.revokeInvitation(invitation.id)).rejects.toMatchObject({code: '42501'});
    const accepted = await recipient.service.respondToRequest(invitation.id, true);
    expect(accepted).toEqual({id: invitation.id, status: 'accepted', isConnected: true});
    await expect(recipient.service.respondToRequest(invitation.id, true)).resolves.toEqual(accepted);
    const first = await owner.service.listFriends();
    expect(first).toHaveLength(1);
    expect(first[0].userId).toBe(recipient.id);
    expect(Object.keys(first[0]).sort()).toEqual(['connectedAt', 'connectionVersion', 'displayName', 'imageUrl', 'userId']);
    expect((await recipient.service.listFriends()).map(friend => friend.userId)).toEqual([owner.id]);
    await owner.service.removeFriend(recipient.id, first[0].connectionVersion);
    await owner.service.removeFriend(recipient.id, first[0].connectionVersion);
    await expect(owner.service.listFriends()).resolves.toEqual([]);
    await expect(recipient.service.respondToRequest(invitation.id, true)).resolves.toEqual({...accepted, isConnected: false});
    const nextToken = owner.service.createClaimToken();
    const next = await owner.service.createInvitation(nextToken);
    await recipient.service.receiveInvitation(nextToken);
    await recipient.service.respondToRequest(next.id, true);
    const reconnected = (await owner.service.listFriends())[0];
    expect(reconnected.connectionVersion).not.toBe(first[0].connectionVersion);
    await owner.service.removeFriend(recipient.id, first[0].connectionVersion);
    expect((await owner.service.listFriends())[0].connectionVersion).toBe(reconnected.connectionVersion);
    await recipient.service.removeFriend(owner.id, reconnected.connectionVersion);
    await expect(owner.service.listFriends()).resolves.toEqual([]);
    await expect(recipient.service.listFriends()).resolves.toEqual([]);
  });

  it('keeps revoked and declined pending requests unavailable across exact retries', async () => {
    const owner = actor(0), recipient = actor(1);
    const token = owner.service.createClaimToken();
    const invitation = await owner.service.createInvitation(token);
    await recipient.service.receiveInvitation(token);
    await owner.service.revokeInvitation(invitation.id);
    await owner.service.revokeInvitation(invitation.id);
    expect((await recipient.service.listRequests()).some(request => request.requestId === invitation.id)).toBe(false);
    await expect(recipient.service.respondToRequest(invitation.id, true)).rejects.toMatchObject({code: '22023'});
    await expect(owner.service.createInvitation(token)).resolves.toEqual({...invitation, status: 'revoked'});
    const declinedToken = owner.service.createClaimToken();
    const declinedInvitation = await owner.service.createInvitation(declinedToken);
    await recipient.service.receiveInvitation(declinedToken);
    const declined = await recipient.service.respondToRequest(declinedInvitation.id, false);
    expect(declined).toEqual({id: declinedInvitation.id, status: 'declined', isConnected: false});
    await expect(recipient.service.respondToRequest(declinedInvitation.id, false)).resolves.toEqual(declined);
    await expect(recipient.service.respondToRequest(declinedInvitation.id, true)).rejects.toMatchObject({code: '22023'});
    await expect(recipient.service.listRequests()).resolves.toEqual([]);
    await expect(owner.service.listFriends()).resolves.toEqual([]);
  });

  it('requires explicit isolated-backend readiness before any actual transport', async () => {
    const owner = actor(0, {backendReady: false});
    const before = requests.length;
    await expect(owner.service.listFriends()).rejects.toThrow('isolated');
    expect(requests).toHaveLength(before);
  });

  it('cancels at real adapter readiness and recovers in the next same-owner generation', async () => {
    const ready = deferred<SupabaseClient>();
    const owner = actor(0, {clientReady: ready.promise});
    const before = requests.length;
    const old = owner.service.listFriends();
    const rejected = expect(old).rejects.toThrow('account changed');
    await owner.lifecycle.invalidateAndDrain();
    ready.resolve(owner.client);
    await rejected;
    expect(requests).toHaveLength(before);
    await expect(owner.service.listFriends()).resolves.toEqual([]);
    expect(requests).toHaveLength(before + 1);
  });

  it('rejects the previous actor real HTTP result and recovers with the next actual SDK session', async () => {
    const owner = actor(0), recipient = actor(1);
    const invitationToken = owner.service.createClaimToken();
    const invitation = await owner.service.createInvitation(invitationToken);
    await recipient.service.receiveInvitation(invitationToken);
    await recipient.service.respondToRequest(invitation.id, true);
    expect((await owner.service.listFriends()).map(friend => friend.userId)).toEqual([recipient.id]);
    const generation = owner.lifecycle.capture();
    const held = {path: '/rest/v1/rpc/list_friends', reached: deferred<number>(), release: deferred<void>()};
    delayedDelivery = held;
    const old = owner.service.listFriends();
    const rejected = expect(old).rejects.toThrow('account changed');
    try {
      expect(await held.reached.promise).toBe(200);
      owner.switchActor(1);
      const draining = owner.lifecycle.invalidateAndDrain();
      expect(generation.signal.aborted).toBe(true);
      held.release.resolve();
      await Promise.all([draining, rejected]);
    } finally {held.release.resolve(); delayedDelivery = undefined;}
    const current = await owner.service.listFriends();
    expect(current.map(friend => friend.userId)).toEqual([owner.id]);
    await owner.service.removeFriend(owner.id, current[0].connectionVersion);
    await expect(owner.service.listFriends()).resolves.toEqual([]);
  });
});
