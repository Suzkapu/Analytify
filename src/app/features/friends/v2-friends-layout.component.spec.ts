import {Component, inject} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {By} from '@angular/platform-browser';
import {describe, expect, it, vi} from 'vitest';
import {Subject} from 'rxjs';
import {FriendsService} from '@core/friends/friends.service';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {V2FriendsLayoutComponent} from './v2-friends-layout.component';
import {V2FriendsController} from './v2-friends.controller';

@Component({standalone: true, template: '<h1>Friends child</h1>'})
class FriendsChild {readonly controller = inject(V2FriendsController);}
@Component({standalone: true, template: '<h1>Outside Friends</h1>'})
class OutsideFriends {}
function routedChild(harness: RouterTestingHarness): FriendsChild {
  return harness.routeDebugElement!.query(By.directive(FriendsChild)).componentInstance as FriendsChild;
}

async function setup() {
  const invitation = {id: 'invitation', status: 'pending', createdAt: '2026-10-12'};
  const backend = {
    listFriends: vi.fn().mockResolvedValue([]), listRequests: vi.fn().mockResolvedValue([]),
    listInvitations: vi.fn().mockResolvedValue([invitation]),
    createClaimToken: vi.fn(() => 'a'.repeat(64)), createInvitation: vi.fn().mockResolvedValue(invitation)
  };
  TestBed.configureTestingModule({providers: [
    provideRouter([{path: 'friends', component: V2FriendsLayoutComponent, children: [
      {path: '', component: FriendsChild}, {path: 'invitations', component: FriendsChild}
    ]}, {path: 'outside', component: OutsideFriends}]),
    {provide: FriendsService, useValue: backend},
    {provide: SpotifyAuthService, useValue: {sessionExiting: () => false, logout$: new Subject<void>(), getUserId: () => 'spotify', getSupabaseUserId: () => 'actor', hasCloudIdentity: () => true}}
  ]});
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/friends', V2FriendsLayoutComponent);
  const child = routedChild(harness);
  await child.controller.reload();
  return {harness, controller: child.controller, backend, invitation};
}

describe('Friends layout route ownership', () => {
  it('preserves the same controller and confirmed invitation across child tabs', async () => {
    const {harness, controller, backend} = await setup();
    await controller.createInvitation();
    const confirmed = controller.createdInvitation();
    await harness.navigateByUrl('/friends/invitations', V2FriendsLayoutComponent);
    const invitations = routedChild(harness);
    expect(invitations.controller).toBe(controller);
    expect(invitations.controller.createdInvitation()).toEqual(confirmed);
    await harness.navigateByUrl('/friends', V2FriendsLayoutComponent);
    const friends = routedChild(harness);
    expect(friends.controller).toBe(controller);
    expect(backend.createInvitation).toHaveBeenCalledOnce();
  });

  it('discards an in-flight secret on departure and isolates the reopened feature', async () => {
    const {harness, controller, backend, invitation} = await setup();
    let resolve!: (value: typeof invitation) => void;
    backend.createInvitation.mockImplementationOnce(() => new Promise(done => {resolve = done;}));
    const pending = controller.createInvitation();
    expect(controller.feedback()).toBe('busy');
    await harness.navigateByUrl('/outside', OutsideFriends);
    expect(controller.inventory()).toBeNull();
    await harness.navigateByUrl('/friends', V2FriendsLayoutComponent);
    const reopened = routedChild(harness);
    expect(reopened.controller).not.toBe(controller);
    await reopened.controller.reload();
    resolve(invitation); await pending;
    expect(controller.createdInvitation()).toBeNull();
    expect(reopened.controller.createdInvitation()).toBeNull();
    expect(reopened.controller.canAct()).toBe(true);
  });
});
