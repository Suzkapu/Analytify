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

describe('Friends avatar recovery after authoritative refresh', () => {
  it('tries a replacement image URL for the same friend after the original image fails', async () => {
    const originalUrl = 'https://images.example.test/expired-avatar.png';
    const replacementUrl = 'https://images.example.test/current-avatar.png';
    const friend = {userId: 'friend-A', displayName: 'Suzkapu', imageUrl: originalUrl,
      connectedAt: '2026-10-11', connectionVersion: 'version-A'};
    const backend = {
      listFriends: vi.fn().mockResolvedValue([friend]),
      listRequests: vi.fn().mockResolvedValue([]),
      listInvitations: vi.fn().mockResolvedValue([]),
      removeFriend: vi.fn()
    };
    TestBed.configureTestingModule({providers: [
      provideRouter([{path: 'friends', children: FRIENDS_ROUTES}]),
      {provide: SpotifyAuthService, useValue: {
        sessionExiting: () => false, logout$: new Subject<void>(),
        getSupabaseUserId: () => 'actor-A', getUserId: () => 'spotify-A', hasCloudIdentity: () => true
      }},
      {provide: FriendsService, useValue: backend}
    ]});
    const harness = await RouterTestingHarness.create('/friends');
    const settle = async () => {harness.detectChanges(); await harness.fixture.whenStable(); harness.detectChanges();};
    await settle();
    const element = () => harness.routeNativeElement as HTMLElement;
    const page = harness.routeDebugElement!.query(By.directive(V2FriendsPageComponent)).componentInstance as V2FriendsPageComponent;
    const originalImage = element().querySelector<HTMLImageElement>('.avatar img')!;
    expect(originalImage.getAttribute('src')).toBe(originalUrl);
    originalImage.dispatchEvent(new Event('error')); await settle();
    expect(element().querySelector('.avatar img')).toBeNull();
    expect(element().querySelector('.avatar')?.textContent?.trim()).toBe('S');
    expect(element().querySelector('[aria-label="Manage friend Suzkapu"]')).not.toBeNull();

    await page.controller.reload(); await settle();
    expect(element().querySelector('.avatar img')).toBeNull();
    expect(element().querySelector('.avatar')?.textContent?.trim()).toBe('S');

    backend.listFriends.mockResolvedValueOnce([{...friend, imageUrl: replacementUrl}]);
    await page.controller.reload(); await settle();

    expect(backend.listFriends).toHaveBeenCalledTimes(3);
    expect(element().querySelector('.identity h2')?.textContent).toBe('Suzkapu');
    expect(element().querySelector('.identity p')?.textContent).toBe('Connected');
    expect(element().querySelector('[aria-label="Manage friend Suzkapu"]')).not.toBeNull();
    expect(element().querySelector<HTMLImageElement>('.avatar img')?.getAttribute('src')).toBe(replacementUrl);
    expect(backend.removeFriend).not.toHaveBeenCalled();
  });
});
