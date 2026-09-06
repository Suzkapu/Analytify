import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';

import {AdminService} from '@core/admin/admin.service';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {PlaylistShareAutoSyncService} from '@core/sharing/playlist-share-auto-sync.service';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {PushNotificationService} from '@core/notifications/push-notification.service';
import {HeaderComponent} from './header.component';
import {of, throwError} from 'rxjs';

describe('HeaderComponent entry points', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let backupActive: boolean;
  let storageService: jasmine.SpyObj<StorageService>;
  let spotifyDataService: jasmine.SpyObj<SpotifyDataService>;
  let statsSharing: jasmine.SpyObj<StatsSharingService>;

  beforeEach(() => {
    backupActive = true;
    storageService = jasmine.createSpyObj<StorageService>('StorageService', ['getItem', 'setItem', 'removeItem']);
    storageService.getItem.and.returnValue('cached-avatar.jpg');
    spotifyDataService = jasmine.createSpyObj<SpotifyDataService>('SpotifyDataService', ['getCurrentUser']);
    spotifyDataService.getCurrentUser.and.returnValue(of({images: []}));
    statsSharing = jasmine.createSpyObj<StatsSharingService>('StatsSharingService', [
      'getDiscoverability', 'setDiscoverability'
    ]);
    statsSharing.getDiscoverability.and.resolveTo(false);
    statsSharing.setDiscoverability.and.callFake(async enabled => enabled);
    TestBed.configureTestingModule({
      declarations: [HeaderComponent],
      providers: [
        {
          provide: SpotifyAuthService,
          useValue: {
            isSyncing: false,
            syncProgress: 0,
            getUserId: () => 'registered-user',
            getSupabaseUserId: () => null,
            isBackupActive: () => backupActive,
            hasCloudIdentity: () => true,
            hasScheduledSpotifyAccess: () => false
          }
        },
        {provide: StorageService, useValue: storageService},
        {provide: SupabaseService, useValue: {}},
        {provide: SpotifyDataService, useValue: spotifyDataService},
        {provide: PlaylistShareAutoSyncService, useValue: {start: jasmine.createSpy('start')}},
        {provide: StatsSharingService, useValue: statsSharing},
        {
          provide: PushNotificationService,
          useValue: {
            loadSettings: jasmine.createSpy('loadSettings').and.resolveTo({
              supported: true, installedPwa: true, permission: 'granted',
              deviceSubscribed: true, songLeagueEnabled: true,
              songLeagueSongAddedEnabled: false, songLeagueMember: true,
              statsAccessRequestsEnabled: true,
              active: true, songAddedActive: false, statsAccessActive: true
            }),
            setSongLeagueEnabled: jasmine.createSpy('setSongLeagueEnabled'),
            setSongLeagueSongAddedEnabled: jasmine.createSpy('setSongLeagueSongAddedEnabled'),
            setStatsAccessRequestsEnabled: jasmine.createSpy('setStatsAccessRequestsEnabled')
          }
        },
        {provide: AdminService, useValue: {isAdmin: () => Promise.resolve(false)}},
        {provide: Router, useValue: {url: '/playlists', navigate: jasmine.createSpy('navigate')}}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('does not offer personal Spotify app setup in the authenticated profile dropdown', () => {
    component.showSettingsDropdown = true;
    fixture.detectChanges();

    const menu = fixture.nativeElement.querySelector('.user-profile-container .profile-settings-dropdown') as HTMLElement;
    expect(menu.textContent).not.toContain('personal Spotify app');
    expect(menu.querySelector('.pi-key')).toBeNull();
  });

  it('keeps a transiently failing avatar cached for a later retry', async () => {
    component.profilePicUrl = 'https://cdn.example/avatar.jpg';
    spotifyDataService.getCurrentUser.and.returnValue(throwError(() => ({status: 504})));
    storageService.removeItem.calls.reset();

    component.onProfileImageError(504);
    await fixture.whenStable();

    expect(component.profilePicUrl).toBeNull();
    expect(storageService.removeItem).not.toHaveBeenCalledWith('registered-user_profile_pic');
    expect(storageService.setItem).not.toHaveBeenCalledWith('registered-user_profile_pic', '');
  });

  it('recovers from a transient 504 when the provider returns a fresh URL', async () => {
    component.profilePicUrl = 'https://expired.example/avatar.jpg';
    spotifyDataService.getCurrentUser.and.returnValue(of({
      id: 'public-profile-id',
      images: [{url: 'https://cdn.example/current-avatar.jpg'}]
    }));

    component.onProfileImageError(504);
    await fixture.whenStable();

    expect(component.profilePicUrl).toBe('https://cdn.example/current-avatar.jpg');
    expect(storageService.setItem).toHaveBeenCalledWith(
      'registered-user_spotify_profile_id',
      'public-profile-id',
      false
    );
  });

  it('refreshes an expired cached avatar before displaying it', async () => {
    const expired = JSON.stringify({
      url: 'https://cdn.example/expired.jpg', source: 'spotify', expiresAt: Date.now() - 1,
      absent: false, retryCount: 0, nextRetryAt: 0
    });
    storageService.getItem.and.callFake(key => key.endsWith('_profile_pic_metadata')
      ? expired
      : key.endsWith('_profile_pic') ? 'https://cdn.example/expired.jpg' : null);
    spotifyDataService.getCurrentUser.and.returnValue(of({
      images: [{url: 'https://cdn.example/refreshed.jpg'}]
    }));

    await component.loadUserProfile();

    expect(component.profilePicUrl).toBe('https://cdn.example/refreshed.jpg');
  });

  it('caches a confirmed missing avatar after a 404 without retrying Spotify', () => {
    component.profilePicUrl = 'https://cdn.example/missing.jpg';
    spotifyDataService.getCurrentUser.calls.reset();

    component.onProfileImageError(404);

    expect(storageService.removeItem).toHaveBeenCalledWith('registered-user_profile_pic');
    expect(spotifyDataService.getCurrentUser).not.toHaveBeenCalled();
    const metadataCall = storageService.setItem.calls.all().find(call =>
      call.args[0] === 'registered-user_profile_pic_metadata');
    expect(JSON.parse(metadataCall?.args[1] as string).absent).toBeTrue();
  });

  it('uses the quiet fallback while offline without attempting a provider refresh', () => {
    component.profilePicUrl = 'https://cdn.example/offline.jpg';
    spotifyDataService.getCurrentUser.calls.reset();
    const online = spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);

    component.onProfileImageError();

    expect(component.profilePicUrl).toBeNull();
    expect(storageService.removeItem).not.toHaveBeenCalledWith('registered-user_profile_pic');
    expect(spotifyDataService.getCurrentUser).not.toHaveBeenCalled();
    online.and.callThrough();
  });

  it('stops retrying after the bounded retry limit', async () => {
    const exhausted = JSON.stringify({
      url: 'https://cdn.example/failing.jpg', source: 'spotify', expiresAt: Date.now() - 1,
      absent: false, retryCount: 3, nextRetryAt: 0
    });
    storageService.getItem.and.callFake(key => key.endsWith('_profile_pic_metadata')
      ? exhausted
      : key.endsWith('_profile_pic') ? 'https://cdn.example/failing.jpg' : null);
    spotifyDataService.getCurrentUser.and.returnValue(throwError(() => ({status: 504})));
    spotifyDataService.getCurrentUser.calls.reset();

    await component.loadUserProfile(true);

    expect(spotifyDataService.getCurrentUser).toHaveBeenCalledTimes(1);
    const retryWrites = storageService.setItem.calls.all().filter(call =>
      call.args[0] === 'registered-user_profile_pic_metadata'
      && JSON.parse(call.args[1] as string).nextRetryAt > 0);
    expect(retryWrites.length).toBe(0);
  });

  it('recovers from a previously cached empty avatar by loading Spotify again', async () => {
    storageService.getItem.and.returnValue('');
    spotifyDataService.getCurrentUser.and.returnValue(of({
      images: [{url: 'https://cdn.example/recovered-avatar.jpg'}]
    }));

    await component.loadUserProfile();

    expect(spotifyDataService.getCurrentUser).toHaveBeenCalled();
    expect(component.profilePicUrl).toBe('https://cdn.example/recovered-avatar.jpg');
    expect(storageService.setItem).toHaveBeenCalledWith(
      'registered-user_profile_pic',
      'https://cdn.example/recovered-avatar.jpg'
    );
  });

  it('keeps Compare Room available from the authenticated workspace menu', () => {
    component.showWorkspaceDropdown = true;
    fixture.detectChanges();

    const links = Array.from(
      fixture.nativeElement.querySelectorAll('.workspace-launcher-dropdown a.workspace-launcher-item')
    ) as HTMLAnchorElement[];
    const compareLink = links.find(link => link.textContent?.includes('Compare playlists')) || null;
    expect(compareLink).not.toBeNull();
    expect(compareLink?.textContent).toContain('Compare playlists');
  });

  it('labels the sharing workspace for both playlists and approved stats', () => {
    component.showWorkspaceDropdown = true;
    fixture.detectChanges();

    const links = Array.from(
      fixture.nativeElement.querySelectorAll('.workspace-launcher-dropdown a.workspace-launcher-item')
    ) as HTMLAnchorElement[];
    const sharingLink = links.find(link => link.textContent?.includes('Private sharing')) || null;
    expect(sharingLink).not.toBeNull();
    expect(sharingLink?.textContent).toContain('playlists');
    expect(sharingLink?.textContent).toContain('stats');
    expect(sharingLink?.textContent).not.toContain('Shared playlists');
  });

  it('keeps the top Stats button pointed at the current user profile', () => {
    const statsLink = Array.from(fixture.nativeElement.querySelectorAll('.header-nav a'))
      .find((link: any) => link.textContent?.trim() === 'Stats') as HTMLAnchorElement | undefined;

    expect(statsLink).toBeDefined();
    expect(statsLink?.getAttribute('routerlink')).toBe('/stats');
  });

  it('keeps Private sharing available when Cloud Backup is off', () => {
    backupActive = false;
    component.showWorkspaceDropdown = true;
    fixture.detectChanges();

    const sharingLink = Array.from(
      fixture.nativeElement.querySelectorAll('.workspace-launcher-dropdown a.workspace-launcher-item')
    ).find((link: any) => link.textContent?.includes('Private sharing')) as HTMLAnchorElement | undefined;
    expect(sharingLink).toBeDefined();
    expect(sharingLink?.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('opens an extensible notification manager from Data & account', async () => {
    component.showSettingsDropdown = true;
    fixture.detectChanges();

    const button = Array.from(fixture.nativeElement.querySelectorAll('.profile-settings-dropdown button'))
      .find((item: any) => item.textContent?.includes('Notifications')) as HTMLButtonElement;
    expect(button).toBeDefined();

    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('.notification-settings-modal') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('Song League');
    expect(dialog.textContent).toContain('New Song League picks');
    expect(dialog.textContent).toContain('Stats access requests');
    expect(dialog.querySelectorAll('.notification-category-row').length).toBe(3);
    const songPickRow = Array.from(dialog.querySelectorAll('.notification-category-row'))
      .find((row: any) => row.textContent?.includes('New Song League picks')) as HTMLElement | undefined;
    expect(songPickRow?.querySelector('.notification-category-icon .pi-volume-up')).not.toBeNull();
  });

  it('keeps Stats discoverability separate and off until explicitly enabled', async () => {
    await fixture.whenStable();
    component.showSettingsDropdown = true;
    fixture.detectChanges();
    const toggle = fixture.nativeElement.querySelector(
      'input[aria-label="Allow Stats access requests"]'
    ) as HTMLInputElement;
    expect(toggle.checked).toBeFalse();

    toggle.checked = true;
    toggle.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(statsSharing.setDiscoverability).toHaveBeenCalledOnceWith(true);
    expect(component.statsDiscoverable).toBeTrue();
  });
});
