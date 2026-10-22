import {TestBed} from '@angular/core/testing';
import {describe, expect, it, vi} from 'vitest';
import {Subject} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {FriendsService} from '@core/friends/friends.service';
import {V2FriendsController} from './v2-friends.controller';

const friend = {userId: 'friend-A', displayName: 'Friend A', imageUrl: '', connectedAt: '2026-10-11', connectionVersion: 'version-A'};
const request = {requestId: 'request-A', inviterUserId: 'sender-A', displayName: 'Sender', imageUrl: '', createdAt: '2026-10-11'};
const invitation = {id: 'invite-A', status: 'pending', createdAt: '2026-10-11'};
function setup() {
  let actor = 'actor-A';
  let exiting = false;
  const logout = new Subject<void>();
  const backend = {
    listFriends: vi.fn().mockResolvedValue([friend]), listRequests: vi.fn().mockResolvedValue([request]),
    listInvitations: vi.fn().mockResolvedValue([invitation]), createClaimToken: vi.fn(() => 'a'.repeat(64)),
    createInvitation: vi.fn().mockResolvedValue(invitation),
    receiveInvitation: vi.fn().mockResolvedValue({id: 'request-A', inviterUserId: 'sender-A', displayName: 'Sender', imageUrl: ''}),
    respondToRequest: vi.fn().mockResolvedValue({id: 'request-A', status: 'accepted', isConnected: true}),
    revokeInvitation: vi.fn().mockResolvedValue(undefined), removeFriend: vi.fn().mockResolvedValue(undefined)
  };
  TestBed.configureTestingModule({providers: [V2FriendsController,
    {provide: FriendsService, useValue: backend},
    {provide: SpotifyAuthService, useValue: {sessionExiting: () => exiting, logout$: logout, getSupabaseUserId: () => actor, getUserId: () => actor,
      hasCloudIdentity: () => !!actor}}]});
  return {controller: TestBed.inject(V2FriendsController), backend, logout,
    setExiting: (value: boolean) => exiting = value,
    lifecycle: TestBed.inject(SessionLifecycleService), switchActor: (value: string) => actor = value};
}

describe('Friends workflow ownership and recovery', () => {
  it('blocks cached row actions and reloading an account while authentication is exiting', async () => {
    const {controller, backend, setExiting, switchActor} = setup();
    await controller.reload(); setExiting(true);
    expect(controller.inventory()).toBeNull();
    await controller.respond('request-A', true); await controller.reload(); await controller.retry();
    expect(backend.respondToRequest).not.toHaveBeenCalled();
    expect(backend.listFriends).toHaveBeenCalledOnce();
    setExiting(false); switchActor('actor-B');
    backend.listFriends.mockResolvedValue([{...friend, userId: 'friend-B'}]); await controller.reload();
    expect(controller.inventory()?.friends[0].userId).toBe('friend-B');
  });
  it('discards an old receive completion and its retry intent after account replacement', async () => {
    const {controller, backend, switchActor} = setup();
    await controller.reload();
    let finish!: (value: {id: string; inviterUserId: string; displayName: string; imageUrl: string}) => void;
    backend.receiveInvitation.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const receiving = controller.receive('b'.repeat(64));
    switchActor('actor-B');
    expect(controller.preview()).toBeNull();
    expect(controller.answered()).toBeNull();
    await controller.reload();
    finish({id: 'request-A', inviterUserId: 'sender-A', displayName: 'Old sender', imageUrl: ''});
    await receiving;
    expect(controller.preview()).toBeNull();
    expect(controller.feedback()).toBe('');
    await controller.retry();
    expect(backend.receiveInvitation).toHaveBeenCalledExactlyOnceWith('b'.repeat(64));
  });
  it('does not replace the new account inventory with an old failed refresh', async () => {
    const {controller, backend, switchActor} = setup();
    await controller.reload();
    let fail!: (error: Error) => void;
    backend.listFriends.mockImplementationOnce(() => new Promise((_resolve, reject) => {fail = reject;}));
    const refresh = controller.reload();
    switchActor('actor-B');
    backend.listFriends.mockResolvedValueOnce([{...friend, userId: 'friend-B'}]);
    await controller.reload();
    fail(new Error('old account disconnected')); await refresh;
    expect(controller.inventory()?.friends[0].userId).toBe('friend-B');
    expect(controller.feedback()).toBe('');
    expect(controller.canAct()).toBe(true);
  });
  it.each([false, true])('ignores the confirming read after logout (read failure=%s)', async failed => {
    const {controller, backend, logout} = setup();
    await controller.reload();
    let finish!: (value: typeof friend[]) => void, fail!: (error: Error) => void;
    backend.listFriends.mockImplementationOnce(() => new Promise((resolve, reject) => {finish = resolve; fail = reject;}));
    const removing = controller.remove('friend-A', 'version-A');
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    logout.next();
    if (failed) fail(new Error('read disconnected')); else finish([]);
    await removing;
    expect(controller.inventory()).toBeNull();
    expect(controller.preview()).toBeNull();
    expect(controller.answered()).toBeNull();
    expect(controller.feedback()).toBe('profile-required');
    expect(backend.removeFriend).toHaveBeenCalledExactlyOnceWith('friend-A', 'version-A');
  });
  it('clears secrets on the real logout signal before auth storage changes or pending work drains', async () => {
    const {controller, backend, logout} = setup();
    await controller.reload(); await controller.createInvitation();
    let finish!: () => void;
    backend.revokeInvitation.mockImplementationOnce(() => new Promise<void>(resolve => {finish = resolve;}));
    const pending = controller.revoke('invite-A');
    logout.next();
    expect(controller.inventory()).toBeNull();
    expect(controller.createdInvitation()).toBeNull();
    expect(controller.feedback()).toBe('profile-required');
    finish(); await pending;
    expect(controller.inventory()).toBeNull();
    expect(controller.feedback()).toBe('profile-required');
  });
  it('invalidates a revoked review after refresh without disabling unrelated friendship actions', async () => {
    const {controller, backend} = setup();
    await controller.reload(); await controller.receive('b'.repeat(64));
    expect(controller.preview()?.id).toBe('request-A');
    backend.listRequests.mockResolvedValue([]);
    await controller.reload();
    expect(controller.preview()).toBeNull();
    expect(controller.feedback()).toBe('unavailable');
    await controller.respond('request-A', true);
    expect(backend.respondToRequest).not.toHaveBeenCalled();
    await controller.remove('friend-A', 'version-A');
    expect(backend.removeFriend).toHaveBeenCalledExactlyOnceWith('friend-A', 'version-A');
  });
  it('does not publish a received preview when revocation wins the confirming inbox read', async () => {
    const {controller, backend} = setup();
    await controller.reload();
    backend.listRequests.mockResolvedValue([]);
    await controller.receive('b'.repeat(64));
    expect(controller.preview()).toBeNull();
    expect(controller.feedback()).toBe('unavailable');
    await controller.retry();
    expect(backend.receiveInvitation).toHaveBeenCalledExactlyOnceWith('b'.repeat(64));
  });
  it('publishes a consistent inventory only after all reads succeed', async () => {
    const {controller, backend} = setup();
    backend.listRequests.mockRejectedValueOnce(new Error('failed'));
    await controller.reload();
    expect(controller.inventory()).toBeNull();
    expect(controller.feedback()).toBe('load-error');
    expect(controller.canAct()).toBe(false);
    await controller.retry();
    expect(controller.inventory()).toEqual({friends: [friend], requests: [request], invitations: [invitation]});
    expect(controller.canAct()).toBe(true);
  });

  it('retains cached content while refreshing and blocks stale actions after a partial read failure', async () => {
    const {controller, backend} = setup();
    await controller.reload();
    backend.listInvitations.mockRejectedValueOnce(new Error('failed'));
    await controller.reload();
    expect(controller.inventory()?.friends).toEqual([friend]);
    expect(controller.feedback()).toBe('load-error');
    await controller.remove('friend-A');
    expect(backend.removeFriend).not.toHaveBeenCalled();
  });

  it('blocks duplicate clicks and retries the exact decision after an uncertain transport failure', async () => {
    const {controller, backend} = setup();
    await controller.reload();
    let reject!: (error: Error) => void;
    backend.respondToRequest.mockImplementationOnce(() => new Promise((_resolve, fail) => reject = fail));
    const accepting = controller.respond('request-A', true);
    expect(controller.feedback()).toBe('busy');
    await controller.respond('request-A', false);
    expect(backend.respondToRequest).toHaveBeenCalledTimes(1);
    reject(new Error('timeout')); await accepting;
    expect(controller.feedback()).toBe('change-error');
    await controller.respond('request-A', false);
    expect(backend.respondToRequest).toHaveBeenCalledTimes(1);
    await controller.retry();
    expect(backend.respondToRequest.mock.calls).toEqual([['request-A', true], ['request-A', true]]);
    expect(controller.feedback()).toBe('');
  });

  it('retries only the read after an acknowledged removal, never repeats removal after reconnect', async () => {
    const {controller, backend} = setup();
    await controller.reload();
    backend.listFriends.mockRejectedValueOnce(new Error('read failed after commit'));
    await controller.remove('friend-A');
    expect(controller.feedback()).toBe('load-error');
    expect(backend.removeFriend).toHaveBeenCalledExactlyOnceWith('friend-A', 'version-A');
    await controller.retry();
    expect(backend.removeFriend).toHaveBeenCalledTimes(1);
    expect(controller.feedback()).toBe('');
  });

  it('rejects a removal confirmation captured before a refreshed reconnection', async () => {
    const {controller, backend} = setup();
    await controller.reload();
    backend.listFriends.mockResolvedValue([{...friend, connectionVersion: 'version-B'}]);
    await controller.reload();
    await controller.remove('friend-A', 'version-A');
    expect(backend.removeFriend).not.toHaveBeenCalled();
    expect(controller.inventory()?.friends[0].connectionVersion).toBe('version-B');
    await controller.remove('friend-A', 'version-B');
    expect(backend.removeFriend).toHaveBeenCalledExactlyOnceWith('friend-A', 'version-B');
  });

  it('keeps the original connection version when an unconfirmed removal is retried', async () => {
    const {controller, backend} = setup();
    await controller.reload();
    backend.removeFriend.mockRejectedValueOnce(new Error('timeout after possible commit'));
    await controller.remove('friend-A');
    expect(controller.feedback()).toBe('change-error');
    backend.listFriends.mockResolvedValueOnce([{...friend, connectionVersion: 'version-B'}]);
    await controller.retry();
    expect(backend.removeFriend.mock.calls).toEqual([['friend-A', 'version-A'], ['friend-A', 'version-A']]);
    expect(controller.inventory()?.friends[0].connectionVersion).toBe('version-B');
    await controller.remove('friend-A');
    expect(backend.removeFriend).toHaveBeenLastCalledWith('friend-A', 'version-B');
  });

  it('reuses the same creation token after timeout and exposes a link only for a confirmed pending invitation', async () => {
    const {controller, backend} = setup();
    await controller.reload();
    backend.createInvitation.mockRejectedValueOnce(new Error('timeout'));
    await controller.createInvitation();
    expect(controller.createdInvitation()).toBeNull();
    await controller.retry();
    expect(backend.createClaimToken).toHaveBeenCalledOnce();
    expect(backend.createInvitation.mock.calls).toEqual([['a'.repeat(64)], ['a'.repeat(64)]]);
    expect(controller.createdInvitation()).toEqual({invitation, token: 'a'.repeat(64)});
    await controller.revoke('invite-A');
    expect(controller.createdInvitation()).toBeNull();
  });

  it('reserves a received link without accepting and identifies unavailable invitations', async () => {
    const {controller, backend} = setup();
    await controller.reload();
    await controller.receive('a'.repeat(64));
    expect(controller.preview()?.displayName).toBe('Sender');
    expect(backend.respondToRequest).not.toHaveBeenCalled();
    backend.receiveInvitation.mockRejectedValueOnce({code: '22023'});
    await controller.receive('b'.repeat(64));
    expect(controller.preview()).toBeNull();
    expect(controller.feedback()).toBe('unavailable');
    await controller.retry();
    expect(backend.receiveInvitation).toHaveBeenCalledTimes(2);
  });

  it('rejects forged row actions and handles a successful empty inventory', async () => {
    const {controller, backend} = setup();
    backend.listFriends.mockResolvedValue([]); backend.listRequests.mockResolvedValue([]); backend.listInvitations.mockResolvedValue([]);
    await controller.reload();
    await controller.respond('foreign', true); await controller.remove('foreign'); await controller.revoke('foreign');
    expect(controller.inventory()).toEqual({friends: [], requests: [], invitations: []});
    expect(backend.respondToRequest).not.toHaveBeenCalled();
    expect(backend.removeFriend).not.toHaveBeenCalled();
    expect(backend.revokeInvitation).not.toHaveBeenCalled();
  });

  it('reads further pages instead of silently truncating large friend lists', async () => {
    const {controller, backend} = setup();
    backend.listFriends.mockResolvedValueOnce(Array.from({length: 100}, (_, index) => ({...friend, userId: 'friend-' + index})))
      .mockResolvedValueOnce([{...friend, userId: 'last-friend'}]);
    await controller.reload();
    expect(controller.inventory()?.friends).toHaveLength(101);
    expect(backend.listFriends.mock.calls).toEqual([[100, 0], [100, 100]]);
  });

  it('requires a profile and performs no reads when the user has logged out', async () => {
    const {controller, backend, switchActor} = setup();
    switchActor(''); await controller.reload();
    expect(controller.feedback()).toBe('profile-required');
    expect(controller.canAct()).toBe(false);
    expect(backend.listFriends).not.toHaveBeenCalled();
    await controller.receive('a'.repeat(64)); await controller.revoke(invitation.id);
    expect(backend.receiveInvitation).not.toHaveBeenCalled(); expect(backend.revokeInvitation).not.toHaveBeenCalled();
  });

  it('does not dispatch later inventory groups when logout occurs at the first service boundary', async () => {
    const {controller, backend, switchActor} = setup();
    backend.listFriends.mockImplementationOnce(async () => {switchActor(''); return [friend];});
    await controller.reload();
    expect(controller.inventory()).toBeNull();
    expect(backend.listRequests).not.toHaveBeenCalled();
    expect(backend.listInvitations).not.toHaveBeenCalled();
  });

  it('does not restart an uncertain mutation on reload and retries a read after session invalidation', async () => {
    const {controller, backend, lifecycle} = setup();
    await controller.reload();
    backend.revokeInvitation.mockRejectedValueOnce(new Error('connection lost'));
    await controller.revoke(invitation.id);
    await controller.reload();
    expect(backend.listInvitations).toHaveBeenCalledOnce();
    expect(backend.revokeInvitation).toHaveBeenCalledOnce();
    await lifecycle.invalidateAndDrain();
    await controller.retry();
    expect(controller.inventory()).toBeNull();
    expect(backend.revokeInvitation).toHaveBeenCalledOnce();
    await controller.reload();
    expect(controller.canAct()).toBe(true);
  });

  it('never exposes a token when a repeated creation returns a consumed invitation', async () => {
    const {controller, backend} = setup(); await controller.reload();
    backend.createInvitation.mockResolvedValueOnce({...invitation, status: 'accepted'});
    await controller.createInvitation();
    expect(controller.createdInvitation()).toBeNull();
    expect(backend.createClaimToken).toHaveBeenCalledOnce();
    expect(controller.canAct()).toBe(true);
  });

  it('withdraws a confirmed token when refresh reports that it has been revoked elsewhere', async () => {
    const {controller, backend} = setup(); await controller.reload(); await controller.createInvitation();
    expect(controller.createdInvitation()).not.toBeNull();
    backend.listInvitations.mockResolvedValueOnce([{...invitation, status: 'revoked'}]);
    await controller.reload();
    expect(controller.createdInvitation()).toBeNull();
  });

  it('blocks duplicate loading and retry while an inventory read is pending', async () => {
    const {controller, backend} = setup();
    let finish!: (value: unknown) => void;
    backend.listRequests.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
    const loading = controller.reload(); await controller.reload(); await controller.retry();
    expect(backend.listRequests).toHaveBeenCalledOnce();
    expect(controller.canAct()).toBe(false);
    finish([request]); await loading;
    expect(controller.canAct()).toBe(true);
  });

  it('does not leak old-account rows or retry secrets when the account changes during mutation', async () => {
    const {controller, backend, switchActor} = setup();
    await controller.reload();
    let finish!: (value: unknown) => void;
    backend.createInvitation.mockImplementationOnce(() => new Promise(resolve => finish = resolve));
    const creating = controller.createInvitation();
    switchActor('actor-B'); finish(invitation); await creating;
    expect(controller.inventory()).toBeNull();
    expect(controller.createdInvitation()).toBeNull();
    await controller.retry();
    expect(backend.createInvitation).toHaveBeenCalledOnce();
    await controller.reload();
    expect(controller.canAct()).toBe(true);
  });

  it('ignores completion after route destruction', async () => {
    const {controller, backend} = setup();
    let finish!: (value: unknown) => void;
    backend.listFriends.mockImplementationOnce(() => new Promise(resolve => finish = resolve));
    const loading = controller.reload();
    controller.ngOnDestroy(); finish([friend]); await loading;
    expect(controller.inventory()).toBeNull();
    await controller.retry(); await controller.createInvitation();
    expect(backend.createInvitation).not.toHaveBeenCalled();
  });

  it('can load the new actor while old-account work is still pending', async () => {
    const {controller, backend, switchActor} = setup();
    await controller.reload();
    let finish!: (value: unknown) => void;
    backend.createInvitation.mockImplementationOnce(() => new Promise(resolve => finish = resolve));
    const oldCreation = controller.createInvitation();
    switchActor('actor-B');
    backend.listFriends.mockResolvedValueOnce([{...friend, userId: 'friend-B'}]);
    await controller.reload();
    expect(controller.inventory()?.friends[0].userId).toBe('friend-B');
    expect(controller.canAct()).toBe(true);
    finish(invitation); await oldCreation;
    expect(controller.createdInvitation()).toBeNull();
    expect(controller.inventory()?.friends[0].userId).toBe('friend-B');
  });
});
