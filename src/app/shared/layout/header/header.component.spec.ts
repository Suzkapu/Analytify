import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AdminService } from '@core/admin/admin.service';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import { PlaylistShareAutoSyncService } from '@core/sharing/playlist-share-auto-sync.service';
import { StatsSharingService } from '@core/sharing/stats-sharing.service';
import { PushNotificationService } from '@core/notifications/push-notification.service';
import { HeaderComponent } from './header.component';
import { of, throwError } from 'rxjs';

describe('HeaderComponent entry points', () => {
    let component: HeaderComponent;
    let fixture: ComponentFixture<HeaderComponent>;
    let backupActive: boolean;
    let storageService: any;
    let spotifyDataService: any;
    let statsSharing: any;
    let authService: any;
    let supabaseService: any;

    beforeEach(() => {
        backupActive = true;
        storageService = {
            getItem: vi.fn().mockName("StorageService.getItem"),
            setItem: vi.fn().mockName("StorageService.setItem"),
            removeItem: vi.fn().mockName("StorageService.removeItem")
        };
        storageService.getItem.mockReturnValue('cached-avatar.jpg');
        spotifyDataService = {
            getCurrentUser: vi.fn().mockName("SpotifyDataService.getCurrentUser")
        };
        spotifyDataService.getCurrentUser.mockReturnValue(of({ images: [] }));
        statsSharing = {
            getDiscoverability: vi.fn().mockName("StatsSharingService.getDiscoverability"),
            setDiscoverability: vi.fn().mockName("StatsSharingService.setDiscoverability"),
            listBlockedUsers: vi.fn().mockName("StatsSharingService.listBlockedUsers"),
            unblockUser: vi.fn().mockName("StatsSharingService.unblockUser")
        };
        statsSharing.getDiscoverability.mockResolvedValue(false);
        statsSharing.setDiscoverability.mockImplementation(async (enabled: boolean) => enabled);
        statsSharing.listBlockedUsers.mockResolvedValue([]);
        statsSharing.unblockUser.mockResolvedValue(undefined);
        authService = {
            isSyncing: false,
            syncProgress: 0,
            getUserId: () => 'registered-user',
            getSupabaseUserId: () => '68000000-0000-4000-8000-000000000001',
            isBackupActive: () => backupActive,
            isAnonymousCloudIdentity: () => false,
            hasCloudIdentity: () => true,
            hasScheduledSpotifyAccess: () => true,
            logout: vi.fn().mockName('logout').mockResolvedValue(undefined)
        };
        supabaseService = {
            deleteUserProfileData: vi.fn().mockName('deleteUserProfileData').mockResolvedValue(undefined),
            loadUserProfile: vi.fn().mockName('loadUserProfile').mockResolvedValue(null),
            client: { rpc: vi.fn().mockName('rpc').mockResolvedValue({data: [], error: null}) }
        };
        TestBed.configureTestingModule({
            declarations: [HeaderComponent],
            providers: [
                {
                    provide: SpotifyAuthService,
                    useValue: authService
                },
                { provide: StorageService, useValue: storageService },
                { provide: SupabaseService, useValue: supabaseService },
                { provide: SpotifyDataService, useValue: spotifyDataService },
                { provide: PlaylistShareAutoSyncService, useValue: { start: vi.fn().mockName('start') } },
                { provide: StatsSharingService, useValue: statsSharing },
                {
                    provide: PushNotificationService,
                    useValue: {
                        loadSettings: vi.fn().mockName('loadSettings').mockResolvedValue({
                            supported: true, installedPwa: true, permission: 'granted',
                            deviceSubscribed: true, songLeagueEnabled: true,
                            songLeagueSongAddedEnabled: false, songLeagueMember: true,
                            statsAccessRequestsEnabled: true,
                            active: true, songAddedActive: false, statsAccessActive: true
                        }),
                        setSongLeagueEnabled: vi.fn().mockName('setSongLeagueEnabled'),
                        setSongLeagueSongAddedEnabled: vi.fn().mockName('setSongLeagueSongAddedEnabled'),
                        setStatsAccessRequestsEnabled: vi.fn().mockName('setStatsAccessRequestsEnabled')
                    }
                },
                { provide: AdminService, useValue: { isAdmin: () => Promise.resolve(false) } },
                { provide: Router, useValue: { url: '/playlists', navigate: vi.fn().mockName('navigate') } }
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

    it('shows why automatic data tasks are active for the signed-in user', async () => {
        supabaseService.client.rpc.mockResolvedValue({data: [{
            task_key: 'stats_short_term', optional_enabled: false,
            feature_required: true, effective_active: true,
            reasons: ['Active because you are in a Song League']
        }], error: null});

        await component.openSyncTaskStatus();
        fixture.detectChanges();

        expect(supabaseService.client.rpc).toHaveBeenCalledWith('get_my_sync_task_status');
        const modal = fixture.nativeElement.querySelector('[aria-labelledby="sync-task-status-title"]');
        expect(modal.textContent).toContain('Short-term stats');
        expect(modal.textContent).toContain('Active because you are in a Song League');
    });

    it('keeps a transiently failing avatar cached for a later retry', async () => {
        component.profilePicUrl = 'https://cdn.example/avatar.jpg';
        spotifyDataService.getCurrentUser.mockReturnValue(throwError(() => ({ status: 504 })));
        storageService.removeItem.mockClear();

        component.onProfileImageError(504);
        await fixture.whenStable();

        expect(component.profilePicUrl).toBeNull();
        expect(storageService.removeItem).not.toHaveBeenCalledWith('registered-user_profile_pic');
        expect(storageService.setItem).not.toHaveBeenCalledWith('registered-user_profile_pic', '');
    });

    it('recovers from a transient 504 when the provider returns a fresh URL', async () => {
        component.profilePicUrl = 'https://expired.example/avatar.jpg';
        spotifyDataService.getCurrentUser.mockReturnValue(of({
            id: 'public-profile-id',
            images: [{ url: 'https://cdn.example/current-avatar.jpg' }]
        }));

        component.onProfileImageError(504);
        await fixture.whenStable();

        expect(component.profilePicUrl).toBe('https://cdn.example/current-avatar.jpg');
        expect(storageService.setItem).toHaveBeenCalledWith('registered-user_spotify_profile_id', 'public-profile-id', false);
    });

    it('refreshes an expired cached avatar before displaying it', async () => {
        const expired = JSON.stringify({
            url: 'https://cdn.example/expired.jpg', source: 'spotify', expiresAt: Date.now() - 1,
            absent: false, retryCount: 0, nextRetryAt: 0
        });
        storageService.getItem.mockImplementation((key: string) => key.endsWith('_profile_pic_metadata')
            ? expired
            : key.endsWith('_profile_pic') ? 'https://cdn.example/expired.jpg' : null);
        spotifyDataService.getCurrentUser.mockReturnValue(of({
            images: [{ url: 'https://cdn.example/refreshed.jpg' }]
        }));

        await component.loadUserProfile();

        expect(component.profilePicUrl).toBe('https://cdn.example/refreshed.jpg');
    });

    it('caches a confirmed missing avatar after a 404 without retrying Spotify', () => {
        component.profilePicUrl = 'https://cdn.example/missing.jpg';
        spotifyDataService.getCurrentUser.mockClear();
        storageService.setItem.mockClear();

        component.onProfileImageError(404);

        expect(storageService.removeItem).toHaveBeenCalledWith('registered-user_profile_pic');
        expect(spotifyDataService.getCurrentUser).not.toHaveBeenCalled();
        const metadataCall = vi.mocked(storageService.setItem).mock.calls.find((call: any[]) => call[0] === 'registered-user_profile_pic_metadata');
        expect(JSON.parse(metadataCall?.[1] as string).absent).toBe(true);
    });

    it('uses the quiet fallback while offline without attempting a provider refresh', () => {
        component.profilePicUrl = 'https://cdn.example/offline.jpg';
        spotifyDataService.getCurrentUser.mockClear();
        const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

        component.onProfileImageError();

        expect(component.profilePicUrl).toBeNull();
        expect(storageService.removeItem).not.toHaveBeenCalledWith('registered-user_profile_pic');
        expect(spotifyDataService.getCurrentUser).not.toHaveBeenCalled();
        online;
    });

    it('stops retrying after the bounded retry limit', async () => {
        const exhausted = JSON.stringify({
            url: 'https://cdn.example/failing.jpg', source: 'spotify', expiresAt: Date.now() - 1,
            absent: false, retryCount: 3, nextRetryAt: 0
        });
        storageService.getItem.mockImplementation((key: string) => key.endsWith('_profile_pic_metadata')
            ? exhausted
            : key.endsWith('_profile_pic') ? 'https://cdn.example/failing.jpg' : null);
        spotifyDataService.getCurrentUser.mockReturnValue(throwError(() => ({ status: 504 })));
        spotifyDataService.getCurrentUser.mockClear();

        await component.loadUserProfile(true);

        expect(spotifyDataService.getCurrentUser).toHaveBeenCalledTimes(1);
        const retryWrites = vi.mocked(storageService.setItem).mock.calls.filter((call: any[]) => call[0] === 'registered-user_profile_pic_metadata'
            && JSON.parse(call[1] as string).nextRetryAt > 0);
        expect(retryWrites.length).toBe(0);
    });

    it('recovers from a previously cached empty avatar by loading Spotify again', async () => {
        storageService.getItem.mockReturnValue('');
        spotifyDataService.getCurrentUser.mockReturnValue(of({
            images: [{ url: 'https://cdn.example/recovered-avatar.jpg' }]
        }));

        await component.loadUserProfile();

        expect(spotifyDataService.getCurrentUser).toHaveBeenCalled();
        expect(component.profilePicUrl).toBe('https://cdn.example/recovered-avatar.jpg');
        expect(storageService.setItem).toHaveBeenCalledWith('registered-user_profile_pic', 'https://cdn.example/recovered-avatar.jpg');
    });

    it('keeps Compare Room available from the authenticated workspace menu', () => {
        component.showWorkspaceDropdown = true;
        fixture.detectChanges();

        const links = Array.from(fixture.nativeElement.querySelectorAll('.workspace-launcher-dropdown a.workspace-launcher-item')) as HTMLAnchorElement[];
        const compareLink = links.find(link => link.textContent?.includes('Compare playlists')) || null;
        expect(compareLink).not.toBeNull();
        expect(compareLink?.textContent).toContain('Compare playlists');
    });

    it('labels the sharing workspace for both playlists and approved stats', () => {
        component.showWorkspaceDropdown = true;
        fixture.detectChanges();

        const links = Array.from(fixture.nativeElement.querySelectorAll('.workspace-launcher-dropdown a.workspace-launcher-item')) as HTMLAnchorElement[];
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

        const sharingLink = Array.from(fixture.nativeElement.querySelectorAll('.workspace-launcher-dropdown a.workspace-launcher-item')).find((link: any) => link.textContent?.includes('Private sharing')) as HTMLAnchorElement | undefined;
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

    it('lists blocked users and requires confirmation before unblocking', async () => {
        statsSharing.listBlockedUsers.mockResolvedValue([{
            userId: 'blocked-user', displayName: 'Blocked person', imageUrl: '', blockedAt: '2026-09-10T08:00:00Z'
        }]);

        await component.openBlockedUsers();
        await fixture.whenStable();
        fixture.detectChanges();
        const dialog = fixture.nativeElement.querySelector('[aria-labelledby="blocked-users-title"]') as HTMLElement;
        expect(dialog.textContent).toContain('Blocked person');

        const unblockButton = Array.from(dialog.querySelectorAll('button')).find((button: any) => button.textContent.trim() === 'Unblock') as HTMLButtonElement;
        unblockButton.click();
        fixture.detectChanges();
        expect(statsSharing.unblockUser).not.toHaveBeenCalled();
        expect(dialog.textContent).toContain('Previous access stays revoked');

        const confirmButton = Array.from(dialog.querySelectorAll('.blocked-user-confirm button'))
            .find((button: any) => button.textContent.trim() === 'Unblock') as HTMLButtonElement;
        confirmButton.click();
        await fixture.whenStable();
        fixture.detectChanges();
        expect(statsSharing.unblockUser).toHaveBeenCalledWith('blocked-user');
        expect(dialog.textContent).toContain('You have not blocked anyone');
    });

    it('offers scheduled-access removal only through the guided cloud deletion flow', () => {
        component.showSettingsDropdown = true;
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).not.toContain('Remove scheduled Spotify access');

        component.openClearDataModal();
        fixture.detectChanges();
        const dialog = fixture.nativeElement.querySelector('.selection-card') as HTMLElement;
        expect(dialog.textContent).toContain('Delete cloud data and leave shared features');
        expect(dialog.textContent).toContain('schedules only the data required');
        expect(supabaseService.deleteUserProfileData).not.toHaveBeenCalled();
    });

    it('cancels cloud deletion without changing server or local session state', () => {
        component.selectClearDbData();
        component.cancelDbDelete();

        expect(component.showConfirmDbDeleteModal).toBe(false);
        expect(supabaseService.deleteUserProfileData).not.toHaveBeenCalled();
        expect(authService.logout).not.toHaveBeenCalled();
    });

    it('deletes cloud collaboration data before logging out', async () => {
        component.selectClearDbData();
        await component.confirmDbDelete();

        expect(supabaseService.deleteUserProfileData).toHaveBeenCalledWith('68000000-0000-4000-8000-000000000001');
        expect(authService.logout).toHaveBeenCalledTimes(1);
        expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/login']);
        expect(component.showConfirmDbDeleteModal).toBe(false);
    });

    it('keeps the confirmation recoverable when cloud deletion fails', async () => {
        supabaseService.deleteUserProfileData.mockRejectedValueOnce(new Error('database unavailable'));
        component.selectClearDbData();
        await component.confirmDbDelete();

        expect(authService.logout).not.toHaveBeenCalled();
        expect(component.showConfirmDbDeleteModal).toBe(true);
        expect(component.dataDeletionError).toContain('Nothing on this device was changed');
    });

    it('reports a partial failure accurately when deletion succeeds but logout fails', async () => {
        authService.logout.mockRejectedValueOnce(new Error('sign-out unavailable'));
        component.selectClearDbData();
        await component.confirmDbDelete();

        expect(supabaseService.deleteUserProfileData).toHaveBeenCalledTimes(1);
        expect(component.showConfirmDbDeleteModal).toBe(true);
        expect(component.dataDeletionError).toContain('cloud data was deleted');
        expect(TestBed.inject(Router).navigate).not.toHaveBeenCalledWith(['/login']);
    });

    it('keeps Stats discoverability separate and off until explicitly enabled', async () => {
        await fixture.whenStable();
        component.showSettingsDropdown = true;
        fixture.detectChanges();
        const toggle = fixture.nativeElement.querySelector('input[aria-label="Allow Stats access requests"]') as HTMLInputElement;
        expect(toggle.checked).toBe(false);

        toggle.checked = true;
        toggle.dispatchEvent(new Event('change'));
        await fixture.whenStable();

        expect(statsSharing.setDiscoverability).toHaveBeenCalledTimes(1);

        expect(statsSharing.setDiscoverability).toHaveBeenCalledWith(true);
        expect(component.statsDiscoverable).toBe(true);
    });
});
