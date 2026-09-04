import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';

import {AdminService} from '@core/admin/admin.service';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {PlaylistShareAutoSyncService} from '@core/sharing/playlist-share-auto-sync.service';
import {PushNotificationService} from '@core/notifications/push-notification.service';
import {HeaderComponent} from './header.component';
import {of} from 'rxjs';

describe('HeaderComponent entry points', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let backupActive: boolean;
  let storageService: jasmine.SpyObj<StorageService>;
  let spotifyDataService: jasmine.SpyObj<SpotifyDataService>;

  beforeEach(() => {
    backupActive = true;
    storageService = jasmine.createSpyObj<StorageService>('StorageService', ['getItem', 'setItem', 'removeItem']);
    storageService.getItem.and.returnValue('cached-avatar.jpg');
    spotifyDataService = jasmine.createSpyObj<SpotifyDataService>('SpotifyDataService', ['getCurrentUser']);
    spotifyDataService.getCurrentUser.and.returnValue(of({images: []}));
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
            isBackupActive: () => backupActive
          }
        },
        {provide: StorageService, useValue: storageService},
        {provide: SupabaseService, useValue: {}},
        {provide: SpotifyDataService, useValue: spotifyDataService},
        {provide: PlaylistShareAutoSyncService, useValue: {start: jasmine.createSpy('start')}},
        {
          provide: PushNotificationService,
          useValue: {
            loadSettings: jasmine.createSpy('loadSettings').and.resolveTo({
              supported: true, installedPwa: true, permission: 'granted',
              deviceSubscribed: true, songLeagueEnabled: true, active: true
            }),
            setSongLeagueEnabled: jasmine.createSpy('setSongLeagueEnabled')
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

  it('does not poison the avatar cache when the image fails to load', () => {
    component.profilePicUrl = 'https://cdn.example/avatar.jpg';

    component.onProfileImageError();

    expect(component.profilePicUrl).toBeNull();
    expect(storageService.removeItem).toHaveBeenCalledOnceWith('registered-user_profile_pic');
    expect(storageService.setItem).not.toHaveBeenCalledWith('registered-user_profile_pic', '');
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
    expect(dialog.querySelectorAll('.notification-category-row').length).toBe(1);
  });
});
