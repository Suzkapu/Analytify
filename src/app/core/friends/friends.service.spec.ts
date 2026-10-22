import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {DESIGN_V2_FRIENDS_BACKEND_READY, FriendsService} from './friends.service';

function setup(ready = true) {
  let actor: string | null = 'actor-A';
  const rpc = vi.fn().mockResolvedValue({data: [], error: null});
  const signals: AbortSignal[] = [];
  const client = {
    auth: {getSession: vi.fn(async () => ({data: {session: actor ? {user: {id: actor}} : null}, error: null}))},
    rpc: vi.fn((name: string, args: unknown) => ({abortSignal: (signal: AbortSignal) => {
      signals.push(signal); return rpc(name, args);
    }}))
  };
  const getClient = vi.fn(async () => client);
  TestBed.configureTestingModule({providers: [
    {provide: SpotifyAuthService, useValue: {getSupabaseUserId: () => actor, hasCloudIdentity: () => !!actor}},
    {provide: SupabaseService, useValue: {getClient}},
    {provide: DESIGN_V2_FRIENDS_BACKEND_READY, useValue: ready}
  ]});
  return {service: TestBed.inject(FriendsService), lifecycle: TestBed.inject(SessionLifecycleService),
    rpc, client, getClient, signals, switchActor: (value: string | null) => actor = value};
}

describe('Friends guarded service boundary', () => {
  it('does not initialize a shared backend before an isolated Friends environment is explicitly enabled', async () => {
    const {service, getClient} = setup(false);
    await expect(service.listFriends()).rejects.toThrow('isolated');
    expect(getClient).not.toHaveBeenCalled();
  });

  it('lists only the actor-bound page and preserves a successful empty result', async () => {
    const {service, rpc, signals} = setup();
    await expect(service.listFriends(50, 100)).resolves.toEqual([]);
    expect(rpc).toHaveBeenCalledExactlyOnceWith('list_friends', {p_limit: 50, p_offset: 100});
    expect(signals[0].aborted).toBe(false);
  });

  it.each([[0, 0], [101, 0], [1, -1], [1.5, 0], [10, NaN]])('rejects invalid page %j/%j before requesting data', async (limit, offset) => {
    const {service, getClient} = setup();
    await expect(service.listRequests(limit, offset)).rejects.toThrow('page');
    expect(getClient).not.toHaveBeenCalled();
  });

  it('keeps creation retry secrets stable without putting them in an inbox response or persistent storage', async () => {
    const {service, rpc} = setup();
    const token = service.createClaimToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    rpc.mockResolvedValueOnce({data: null, error: new Error('timeout')})
      .mockResolvedValueOnce({data: {id: 'invite-A', status: 'pending', createdAt: '2026-10-11T00:00:00Z'}, error: null});
    await expect(service.createInvitation(token)).rejects.toThrow('timeout');
    await expect(service.createInvitation(token)).resolves.toEqual({id: 'invite-A', status: 'pending', createdAt: '2026-10-11T00:00:00Z'});
    expect(rpc.mock.calls).toEqual([
      ['create_friend_invitation', {p_claim_token: token}],
      ['create_friend_invitation', {p_claim_token: token}]
    ]);
  });

  it('receives without accepting, then retries the exact declined decision by saved request identity', async () => {
    const {service, rpc} = setup();
    const token = 'a'.repeat(64);
    rpc.mockResolvedValueOnce({data: {id: 'request-A', inviterUserId: 'sender', displayName: 'Friend', imageUrl: ''}, error: null});
    await expect(service.receiveInvitation(token)).resolves.toEqual({id: 'request-A', inviterUserId: 'sender', displayName: 'Friend', imageUrl: ''});
    rpc.mockResolvedValue({data: {id: 'request-A', status: 'declined', isConnected: false}, error: null});
    await service.respondToRequest('request-A', false);
    await service.respondToRequest('request-A', false);
    expect(rpc.mock.calls).toEqual([
      ['receive_friend_invitation', {p_claim_token: token}],
      ['respond_friend_request', {p_invitation_id: 'request-A', p_accept: false}],
      ['respond_friend_request', {p_invitation_id: 'request-A', p_accept: false}]
    ]);
  });

  it('uses separate membership/invitation operations without calling any private-data grant service', async () => {
    const {service, rpc} = setup();
    rpc.mockResolvedValue({data: null, error: null});
    await service.revokeInvitation('invite-A');
    await service.removeFriend('friend-B', 'version-A');
    expect(rpc.mock.calls).toEqual([
      ['revoke_friend_invitation', {p_invitation_id: 'invite-A'}],
      ['remove_friend', {p_friend_user_id: 'friend-B', p_connection_version: 'version-A'}]
    ]);
  });

  it('does not interpret a denied or malformed inventory as successfully empty', async () => {
    const {service, rpc} = setup();
    rpc.mockResolvedValueOnce({data: [{userId: 'foreign'}], error: new Error('denied')});
    await expect(service.listFriends()).rejects.toThrow('denied');
    rpc.mockResolvedValueOnce({data: null, error: null});
    await expect(service.listFriends()).rejects.toThrow('response');
    rpc.mockResolvedValueOnce({data: [{userId: 'friend', displayName: 17, imageUrl: '', connectedAt: 'now'}], error: null});
    await expect(service.listFriends()).rejects.toThrow('response');
  });

  it('rejects a session mismatch before sending a friend operation', async () => {
    const {service, client, rpc} = setup();
    client.auth.getSession.mockResolvedValueOnce({data: {session: {user: {id: 'foreign'}}}, error: null});
    await expect(service.listInvitations()).rejects.toThrow('account');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('drops a result from the previous actor even if the transport ignores cancellation', async () => {
    const {service, rpc, switchActor, lifecycle, signals} = setup();
    let finish!: (value: unknown) => void;
    rpc.mockImplementationOnce(() => new Promise(resolve => finish = resolve));
    const pending = service.listFriends();
    await vi.waitFor(() => expect(rpc).toHaveBeenCalledOnce());
    switchActor('actor-B');
    const draining = lifecycle.invalidateAndDrain();
    expect(signals[0].aborted).toBe(true);
    finish({data: [], error: null});
    await expect(pending).rejects.toThrow('account');
    await draining;
    await expect(service.listFriends()).resolves.toEqual([]);
  });

  it('blocks logged-out actors and malformed bearer tokens without initializing the client', async () => {
    const {service, getClient, switchActor} = setup();
    await expect(service.receiveInvitation('bad')).rejects.toThrow('token');
    switchActor(null);
    await expect(service.listFriends()).rejects.toThrow('Spotify');
    expect(getClient).not.toHaveBeenCalled();
  });
});
