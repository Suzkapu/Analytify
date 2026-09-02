import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';

import {AdminService} from '@core/admin/admin.service';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {PlaylistShareAutoSyncService} from '@core/sharing/playlist-share-auto-sync.service';
import {HeaderComponent} from './header.component';

describe('HeaderComponent entry points', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [HeaderComponent],
      providers: [
        {
          provide: SpotifyAuthService,
          useValue: {
            isSyncing: false,
            syncProgress: 0,
            getUserId: () => 'registered-user',
            isBackupActive: () => true
          }
        },
        {provide: StorageService, useValue: {getItem: () => ''}},
        {provide: SupabaseService, useValue: {}},
        {provide: SpotifyDataService, useValue: {}},
        {provide: PlaylistShareAutoSyncService, useValue: {start: jasmine.createSpy('start')}},
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
});
