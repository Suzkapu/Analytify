import {TestBed} from '@angular/core/testing';
import {provideRouter} from '@angular/router';
import {RouterTestingHarness} from '@angular/router/testing';
import {By} from '@angular/platform-browser';
import {Subject} from 'rxjs';
import {describe, expect, it, vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {FriendsService} from '@core/friends/friends.service';
import {FRIENDS_ROUTES} from './friends.routes';
import {V2FriendsPageComponent} from './v2-friends-page.component';

describe('Friends revocation confirmation after authoritative refresh', () => {
  it.each(['answered', 'absent'] as const)('does not revoke an invitation that becomes %s while its confirmation is open', async outcome => {
    const friend = {userId: 'friend-A', displayName: 'Suzkapu', imageUrl: '',
      connectedAt: '2026-10-11', connectionVersion: 'version-A'};
    const invitation = {id: 'invitation-A', status: 'pending', createdAt: '2026-10-11'};
    const backend = {
      listFriends: vi.fn().mockResolvedValue([friend]),
      listRequests: vi.fn().mockResolvedValue([]),
      listInvitations: vi.fn().mockResolvedValue([invitation]),
      revokeInvitation: vi.fn(), removeFriend: vi.fn()
    };
    TestBed.configureTestingModule({providers: [
      provideRouter([{path: 'friends', children: FRIENDS_ROUTES}]),
      {provide: SpotifyAuthService, useValue: {
        sessionExiting: () => false, logout$: new Subject<void>(),
        getSupabaseUserId: () => 'actor-A', getUserId: () => 'spotify-A', hasCloudIdentity: () => true
      }},
      {provide: FriendsService, useValue: backend}
    ]});
    const harness = await RouterTestingHarness.create('/friends/invitations');
    const settle = async () => {harness.detectChanges(); await harness.fixture.whenStable(); harness.detectChanges();};
    await settle();
    const element = () => harness.routeNativeElement as HTMLElement;
    const page = harness.routeDebugElement!.query(By.directive(V2FriendsPageComponent)).componentInstance as V2FriendsPageComponent;
    const action = (scope: HTMLElement, label: string) => {
      const control = [...scope.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === label);
      expect(control, label).toBeDefined(); return control!;
    };
    action(element(), 'Revoke').click(); await settle();
    const dialog = element().querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Revoke friend invitation?');
    expect(backend.revokeInvitation).not.toHaveBeenCalled();

    backend.listInvitations.mockResolvedValueOnce(outcome === 'absent' ? [] : [{...invitation, status: 'accepted'}]);
    await page.controller.reload(); await settle();
    expect(element().querySelector('[role="dialog"]')).not.toBeNull();
    action(dialog, 'Revoke invitation').click(); await settle();

    expect(element().querySelector('[role="dialog"]')).toBeNull();
    expect(element().querySelector('.pending-invitation')).toBeNull();
    expect(backend.listInvitations).toHaveBeenCalledTimes(2);
    expect(backend.revokeInvitation).not.toHaveBeenCalled();
    expect(backend.removeFriend).not.toHaveBeenCalled();
    await harness.navigateByUrl('/friends'); await settle();
    expect(element().querySelector('.identity h2')?.textContent).toBe('Suzkapu');
    expect(element().querySelector('.identity p')?.textContent).toBe('Connected');
    expect(element().querySelector('[aria-label="Manage friend Suzkapu"]')).not.toBeNull();
    expect(backend.revokeInvitation).not.toHaveBeenCalled();
    expect(backend.removeFriend).not.toHaveBeenCalled();
  });
});
