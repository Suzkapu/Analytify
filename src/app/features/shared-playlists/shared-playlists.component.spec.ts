import { beforeEach, describe, expect, it, type Mock, type MockedObject, vi } from "vitest";
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RouterTestingModule } from '@angular/router/testing';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { ComparePlaylistSourceService } from '@core/compare-room/compare-playlist-source.service';
import { PlaylistSharingService } from '@core/sharing/playlist-sharing.service';
import { StatsSharingService } from '@core/sharing/stats-sharing.service';
import { SharedPlaylistsComponent } from './shared-playlists.component';
import { PlaylistShareAutoSyncService } from '@core/sharing/playlist-share-auto-sync.service';

describe('SharedPlaylistsComponent', () => {
    let fixture: ComponentFixture<SharedPlaylistsComponent>;
    let component: SharedPlaylistsComponent;
    let sharing: any;
    let auth: any;
    let source: any;
    let statsSharing: any;
    let unsubscribe: Mock;
    let startAutoSync: Mock;

    beforeEach(() => {
        sharing = {
            listReceivedShares: vi.fn().mockName("PlaylistSharingService.listReceivedShares"),
            listOwnedShares: vi.fn().mockName("PlaylistSharingService.listOwnedShares"),
            subscribeToShareChanges: vi.fn().mockName("PlaylistSharingService.subscribeToShareChanges"),
            createShare: vi.fn().mockName("PlaylistSharingService.createShare"),
            refreshShare: vi.fn().mockName("PlaylistSharingService.refreshShare"),
            revokeShare: vi.fn().mockName("PlaylistSharingService.revokeShare")
        };
        auth = {
            isBackupActive: vi.fn().mockName("SpotifyAuthService.isBackupActive"),
            getAccessToken: vi.fn().mockName("SpotifyAuthService.getAccessToken"),
            isTokenExpired: vi.fn().mockName("SpotifyAuthService.isTokenExpired"),
            refreshToken: vi.fn().mockName("SpotifyAuthService.refreshToken"),
            getUserId: vi.fn().mockName("SpotifyAuthService.getUserId")
        };
        source = {
            loadMainPlaylists: vi.fn().mockName("ComparePlaylistSourceService.loadMainPlaylists"),
            loadMainTracks: vi.fn().mockName("ComparePlaylistSourceService.loadMainTracks")
        };
        statsSharing = {
            listAvailableUsers: vi.fn().mockName("StatsSharingService.listAvailableUsers"),
            listAccessRequests: vi.fn().mockName("StatsSharingService.listAccessRequests"),
            subscribeToAccessChanges: vi.fn().mockName("StatsSharingService.subscribeToAccessChanges"),
            requestAccess: vi.fn().mockName("StatsSharingService.requestAccess"),
            createAccessInvite: vi.fn().mockName("StatsSharingService.createAccessInvite"),
            respondToRequest: vi.fn().mockName("StatsSharingService.respondToRequest"),
            revokeAccess: vi.fn().mockName("StatsSharingService.revokeAccess"),
            blockUser: vi.fn().mockName("StatsSharingService.blockUser"),
            reportUser: vi.fn().mockName("StatsSharingService.reportUser")
        };
        unsubscribe = vi.fn().mockName('unsubscribe');
        startAutoSync = vi.fn().mockName('start');
        sharing.listReceivedShares.mockResolvedValue([]);
        sharing.listOwnedShares.mockResolvedValue([]);
        sharing.subscribeToShareChanges.mockReturnValue(unsubscribe);
        sharing.createShare.mockResolvedValue({
            shareId: 'share-id',
            claimToken: 'token',
            claimUrl: 'https://analytify.app/shared-playlists/claim/token'
        });
        auth.isBackupActive.mockReturnValue(true);
        auth.getAccessToken.mockReturnValue('access-token');
        auth.isTokenExpired.mockReturnValue(false);
        auth.getUserId.mockReturnValue('spotify-user');
        source.loadMainPlaylists.mockResolvedValue([{
                id: 'party',
                name: 'Party',
                description: 'Party songs',
                imageUrl: 'party.jpg',
                total: 1,
                ownerName: 'Owner',
                isLikedSongs: false
            }]);
        source.loadMainTracks.mockResolvedValue({ source: 'local', tracks: [track('song')] });
        statsSharing.listAvailableUsers.mockResolvedValue([]);
        statsSharing.listAccessRequests.mockResolvedValue([]);
        statsSharing.subscribeToAccessChanges.mockReturnValue(vi.fn().mockName('unsubscribeStats'));
        statsSharing.requestAccess.mockResolvedValue('request-id');
        statsSharing.createAccessInvite.mockResolvedValue({
            inviteId: 'invite-id',
            claimToken: 'stats-token',
            claimUrl: 'https://analytify.app/shared-playlists/stats-request/stats-token'
        });
        statsSharing.respondToRequest.mockResolvedValue(undefined);
        statsSharing.revokeAccess.mockResolvedValue(undefined);
        statsSharing.blockUser.mockResolvedValue(undefined);
        statsSharing.reportUser.mockResolvedValue(undefined);

        TestBed.configureTestingModule({
            declarations: [SharedPlaylistsComponent],
            imports: [FormsModule, RouterTestingModule],
            providers: [
                { provide: PlaylistSharingService, useValue: sharing },
                { provide: SpotifyAuthService, useValue: auth },
                { provide: ComparePlaylistSourceService, useValue: source },
                { provide: StatsSharingService, useValue: statsSharing },
                { provide: PlaylistShareAutoSyncService, useValue: { start: startAutoSync } }
            ],
            schemas: [NO_ERRORS_SCHEMA]
        });
        fixture = TestBed.createComponent(SharedPlaylistsComponent);
        component = fixture.componentInstance;
    });

    it('starts recipient auto-sync only when the sharing workspace is entered', async () => {
        expect(startAutoSync).not.toHaveBeenCalled();
        fixture.detectChanges();
        await fixture.whenStable();
        expect(startAutoSync).toHaveBeenCalledTimes(1);
    });

    it('keeps stats requests available but blocks playlist publishing without Cloud Backup', async () => {
        auth.isBackupActive.mockReturnValue(false);

        fixture.detectChanges();
        await fixture.whenStable();

        expect(sharing.listReceivedShares).toHaveBeenCalled();
        expect(sharing.listOwnedShares).toHaveBeenCalled();
        expect(statsSharing.listAccessRequests).toHaveBeenCalled();
        expect(fixture.nativeElement.querySelector('.open-share-menu-button')).not.toBeNull();
        await component.openShareDialog();
        fixture.detectChanges();
        const choices = Array.from(fixture.nativeElement.querySelectorAll('.share-mode-picker button')) as HTMLButtonElement[];
        expect(choices[0].disabled).toBe(true);
        expect(choices[0].textContent).toContain('Requires Cloud Backup');
        expect(choices[1].disabled).toBe(false);
        await component.selectShareMode('playlist');
        expect(source.loadMainPlaylists).not.toHaveBeenCalled();
    });

    it('grays out snapshot refresh with an explanation but keeps revoke available when backup is off', async () => {
        auth.isBackupActive.mockReturnValue(false);
        sharing.listOwnedShares.mockResolvedValue([{
                id: 'share-id', sourcePlaylistId: 'party', playlistName: 'Party', playlistDescription: '',
                playlistImageUrl: '', ownerDisplayName: 'Owner', recipientDisplayName: 'Friend',
                trackCount: 1, revision: 1, revokedAt: null
            } as any]);

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const actions = Array.from(fixture.nativeElement.querySelectorAll('.owner-share-actions button')) as HTMLButtonElement[];
        const refresh = actions.find(button => button.textContent?.includes('Refresh snapshot'));
        const revoke = actions.find(button => button.textContent?.includes('Revoke access'));
        expect(refresh?.disabled).toBe(true);
        expect(refresh?.title).toContain('Enable Cloud Backup');
        expect(revoke?.disabled).toBe(false);
    });

    it('defensively refuses snapshot refresh without loading or publishing Spotify data', async () => {
        auth.isBackupActive.mockReturnValue(false);

        await component.refreshShare({ id: 'share-id', playlistName: 'Party' } as any);

        expect(component.errorMessage).toContain('Enable Cloud Backup');
        expect(source.loadMainPlaylists).not.toHaveBeenCalled();
        expect(source.loadMainTracks).not.toHaveBeenCalled();
        expect(sharing.refreshShare).not.toHaveBeenCalled();
    });

    it('titles the page for both playlist and stats sharing', async () => {
        fixture.detectChanges();
        await fixture.whenStable();

        const heading = fixture.nativeElement.querySelector('h1') as HTMLElement;
        expect(heading.textContent?.trim()).toBe('Private sharing');
        expect(fixture.nativeElement.textContent).toContain('playlist');
        expect(fixture.nativeElement.textContent).toContain('stats');
    });

    it('starts playlist and stats sharing loads in parallel', async () => {
        let resolveReceived!: (shares: any[]) => void;
        let resolveOwned!: (shares: any[]) => void;
        let resolveRequests!: (requests: any[]) => void;
        sharing.listReceivedShares.mockReturnValue(new Promise(resolve => resolveReceived = resolve));
        sharing.listOwnedShares.mockReturnValue(new Promise(resolve => resolveOwned = resolve));
        statsSharing.listAccessRequests.mockReturnValue(new Promise(resolve => resolveRequests = resolve));

        const reload = component.reload();

        expect(sharing.listReceivedShares).toHaveBeenCalledTimes(1);
        expect(sharing.listOwnedShares).toHaveBeenCalledTimes(1);
        expect(statsSharing.listAccessRequests).toHaveBeenCalledTimes(1);

        resolveReceived([]);
        resolveOwned([]);
        resolveRequests([]);
        await reload;
    });

    it('selects and publishes the playlist from the sharing menu', async () => {
        await component.openShareDialog();
        await component.selectShareMode('playlist');
        component.selectedPlaylistId = 'party';

        await component.createShareLink();

        expect(source.loadMainTracks).toHaveBeenCalledWith(expect.objectContaining({ id: 'party' }), 'access-token', 'spotify-user');
        expect(sharing.createShare).toHaveBeenCalledWith(expect.objectContaining({
            sourcePlaylistId: 'party',
            playlistName: 'Party',
            playlistDescription: 'Party songs'
        }));
        expect(component.shareLink).toContain('/shared-playlists/claim/token');
    });

    it('lets a user select stats access and request one registered user', async () => {
        statsSharing.listAvailableUsers.mockResolvedValue([{
                userId: 'owner-id', displayName: 'Stats Owner', imageUrl: '',
                requestId: null, requestStatus: null
            }]);

        await component.openShareDialog();
        await component.selectShareMode('stats');
        component.availableStatsUsers = [{
                userId: 'owner-id', displayName: 'Stats Owner', imageUrl: '', requestId: null, requestStatus: null
            }];
        component.selectedStatsOwnerId = 'owner-id';
        await component.requestStatsAccess();

        expect(statsSharing.requestAccess).toHaveBeenCalledTimes(1);

        expect(statsSharing.requestAccess).toHaveBeenCalledWith('owner-id');
        expect(component.successMessage).toContain('Stats Owner');
    });

    it('uses a themed stats-user picker with readable request states', async () => {
        statsSharing.listAvailableUsers.mockResolvedValue([
            { userId: 'available', displayName: 'New listener', imageUrl: '', requestId: null, requestStatus: null },
            { userId: 'approved', displayName: 'Already sharing', imageUrl: '', requestId: 'request', requestStatus: 'approved' }
        ]);
        await component.openShareDialog();
        await component.selectShareMode('stats');
        component.availableStatsUsers = [
            { userId: 'available', displayName: 'New listener', imageUrl: '', requestId: null, requestStatus: null },
            { userId: 'approved', displayName: 'Already sharing', imageUrl: '', requestId: 'request', requestStatus: 'approved' }
        ];
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('.stats-user-picker select')).toBeNull();
        (fixture.nativeElement.querySelector('.stats-user-picker-trigger') as HTMLButtonElement).click();
        component.availableStatsUsers = [
            { userId: 'available', displayName: 'New listener', imageUrl: '', requestId: null, requestStatus: null },
            { userId: 'approved', displayName: 'Already sharing', imageUrl: '', requestId: 'request', requestStatus: 'approved' }
        ];
        fixture.detectChanges();
        const options = Array.from(fixture.nativeElement.querySelectorAll('.stats-user-picker-option')) as HTMLButtonElement[];

        expect(options[1].disabled).toBe(true);
        expect(options[1].textContent).toContain('Already shared');
        options[0].click();
        fixture.detectChanges();
        expect(component.selectedStatsOwnerId).toBe('available');
        expect(fixture.nativeElement.querySelector('.stats-user-picker-menu')).toBeNull();
    });

    it('searches registered users inside a viewport overlay without expanding the modal', async () => {
        vi.useFakeTimers();
        statsSharing.listAvailableUsers.mockResolvedValue([
            { userId: 'one', displayName: 'Alice Listener', imageUrl: '', requestId: null, requestStatus: null },
            { userId: 'two', displayName: 'Bob Beats', imageUrl: '', requestId: null, requestStatus: null }
        ]);
        await component.openShareDialog();
        await component.selectShareMode('stats');
        fixture.detectChanges();

        (fixture.nativeElement.querySelector('.stats-user-picker-trigger') as HTMLButtonElement).click();
        fixture.detectChanges();
        const menu = fixture.nativeElement.querySelector('.stats-user-picker-menu') as HTMLElement;
        expect(getComputedStyle(menu).position).toBe('fixed');

        component.onStatsUserSearchChange('bob');
        vi.advanceTimersByTime(300);
        await Promise.resolve();
        await Promise.resolve();
        fixture.detectChanges();
        const options = Array.from(menu.querySelectorAll('.stats-user-picker-option')) as HTMLElement[];
        expect(options.length).toBe(1);
        expect(options[0].textContent).toContain('Bob Beats');
        expect(statsSharing.listAvailableUsers).toHaveBeenCalledTimes(1);
        expect(statsSharing.listAvailableUsers).toHaveBeenCalledWith('bob');
        vi.useRealTimers();
    });

    it('creates a private link that opens the recipient stats consent flow', async () => {
        await component.openShareDialog();
        await component.selectShareMode('stats');

        await component.createStatsRequestLink();
        fixture.detectChanges();

        expect(statsSharing.createAccessInvite).toHaveBeenCalledTimes(1);
        expect(component.statsRequestLink).toContain('/shared-playlists/stats-request/stats-token');
        expect(fixture.nativeElement.querySelector('[aria-label="Private stats request link"]')).not.toBeNull();
        expect(fixture.nativeElement.textContent).toContain('accept or decline window');
    });

    it('blocks and reports a Stats requester through the custom privacy dialog', async () => {
        const request = {
            id: 'request-id', ownerUserId: 'me', viewerUserId: 'viewer-id', ownerDisplayName: 'Me',
            ownerImageUrl: '', viewerDisplayName: 'Spam viewer', viewerImageUrl: '', status: 'pending',
            requestedAt: 'now', respondedAt: null, revokedAt: null, updatedAt: 'now', viewerRole: 'owner'
        } as any;
        component.openStatsModeration(request);
        component.moderationReason = 'Repeated unwanted requests';

        await component.blockStatsUser(true);

        expect(statsSharing.reportUser).toHaveBeenCalledTimes(1);

        expect(statsSharing.reportUser).toHaveBeenCalledWith('viewer-id', 'Repeated unwanted requests');
        expect(component.moderationRequest).toBeNull();
        expect(component.successMessage).toContain('blocked and reported');
    });

    it('opens a custom consent popup for the oldest pending request and records agreement', async () => {
        statsSharing.listAccessRequests.mockResolvedValue([{
                id: 'request-id', ownerUserId: 'me', viewerUserId: 'viewer-id',
                ownerDisplayName: 'Me', ownerImageUrl: '', viewerDisplayName: 'Viewer', viewerImageUrl: '',
                status: 'pending', requestedAt: '2026-09-01T10:00:00Z', respondedAt: null,
                revokedAt: null, updatedAt: '2026-09-01T10:00:00Z', viewerRole: 'owner'
            }]);

        await component.ngOnInit();
        expect(component.consentRequest?.viewerDisplayName).toBe('Viewer');

        await component.respondToStatsRequest(true);

        expect(statsSharing.respondToRequest).toHaveBeenCalledTimes(1);

        expect(statsSharing.respondToRequest).toHaveBeenCalledWith('request-id', true);
        expect(component.consentRequest).toBeNull();
    });

    it('keeps a failed consent request visible and reports the RPC error inside the popup', async () => {
        const request = {
            id: 'request-id', ownerUserId: 'me', viewerUserId: 'viewer-id',
            ownerDisplayName: 'Me', ownerImageUrl: '', viewerDisplayName: 'Viewer', viewerImageUrl: '',
            status: 'pending', requestedAt: '2026-09-01T10:00:00Z', respondedAt: null,
            revokedAt: null, updatedAt: '2026-09-01T10:00:00Z', viewerRole: 'owner'
        } as const;
        statsSharing.listAccessRequests.mockResolvedValue([request]);
        statsSharing.respondToRequest.mockRejectedValue(new Error('The request could not be saved.'));
        await component.ngOnInit();

        await component.respondToStatsRequest(true);
        fixture.detectChanges();

        expect(component.consentRequest?.id).toBe('request-id');
        expect(fixture.nativeElement.querySelector('.consent-modal [role="alert"]')?.textContent)
            .toContain('The request could not be saved.');
    });

    it('uses a custom confirmation dialog before either side revokes a stats grant', async () => {
        const request = {
            id: 'request-id', ownerDisplayName: 'Owner', viewerDisplayName: 'Viewer',
            viewerRole: 'owner', status: 'approved'
        } as any;

        component.openStatsRevocation(request);
        fixture.detectChanges();

        const dialog = fixture.nativeElement.querySelector('.stats-revoke-modal') as HTMLElement;
        expect(dialog.textContent).toContain('Stop sharing with Viewer?');
        expect(statsSharing.revokeAccess).not.toHaveBeenCalled();

        await component.confirmStatsRevocation();

        expect(statsSharing.revokeAccess).toHaveBeenCalledTimes(1);

        expect(statsSharing.revokeAccess).toHaveBeenCalledWith('request-id');
        expect(component.statsRevocationRequest).toBeNull();
    });

    it('shows approved stats as the real stats route and labels access management as Requests', async () => {
        statsSharing.listAccessRequests.mockResolvedValue([{
                id: 'request-id', ownerUserId: 'owner-id', viewerUserId: 'viewer-id',
                ownerDisplayName: 'Stats Owner', ownerImageUrl: '', viewerDisplayName: 'Viewer', viewerImageUrl: '',
                status: 'approved', requestedAt: '2026-09-01T10:00:00Z', respondedAt: '2026-09-01T11:00:00Z',
                revokedAt: null, updatedAt: '2026-09-01T11:00:00Z', viewerRole: 'viewer'
            }]);

        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();

        const statsLink = fixture.nativeElement.querySelector('.stats-user-card') as HTMLAnchorElement;
        expect(statsLink.getAttribute('href')).toBe('/stats/owner-id');
        expect(fixture.nativeElement.textContent).toContain('Requests');
        expect(fixture.nativeElement.textContent).not.toContain('Per-user consent');
    });

    it('refreshes an existing shared playlist with its newest track snapshot', async () => {
        sharing.refreshShare.mockResolvedValue(4);
        const share = {
            id: 'share-id', sourcePlaylistId: 'party', playlistName: 'Old party',
            playlistDescription: 'Keep this description', playlistImageUrl: 'old.jpg',
            ownerDisplayName: 'Owner', trackCount: 1, revision: 3
        } as any;

        await component.refreshShare(share);

        expect(source.loadMainTracks).toHaveBeenCalledWith(expect.objectContaining({ id: 'party' }), 'access-token', 'spotify-user');
        expect(sharing.refreshShare).toHaveBeenCalledWith('share-id', 3, expect.objectContaining({
            sourcePlaylistId: 'party',
            playlistName: 'Party',
            playlistDescription: 'Keep this description',
            playlistImageUrl: 'party.jpg'
        }));
        expect(component.successMessage).toContain('revision 4');
    });

    it('does not revoke a playlist when its owner cancels the confirmation', async () => {
        vi.spyOn(window, 'confirm').mockReturnValue(false);

        await component.revokeShare({
            id: 'share-id', playlistName: 'Party', recipientDisplayName: 'Friend'
        } as any);

        expect(sharing.revokeShare).not.toHaveBeenCalled();
        expect(component.busyShareId).toBe('');
    });

    it('includes the owner in a received playlist name', () => {
        expect(component.receivedPlaylistName({
            playlistName: 'Party',
            ownerDisplayName: 'Simon'
        } as any)).toBe('Party · from Simon');
    });

    it('subscribes for live list updates and cleans up the channel', async () => {
        await component.ngOnInit();

        expect(sharing.subscribeToShareChanges).toHaveBeenCalledWith(expect.any(Function));
        component.ngOnDestroy();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('does not open a realtime channel when the page closes during its initial load', async () => {
        let finishLoad!: (shares: any[]) => void;
        sharing.listReceivedShares.mockReturnValue(new Promise(resolve => finishLoad = resolve));

        const initialization = component.ngOnInit();
        component.ngOnDestroy();
        finishLoad([]);
        await initialization;

        expect(sharing.subscribeToShareChanges).not.toHaveBeenCalled();
        expect(statsSharing.subscribeToAccessChanges).not.toHaveBeenCalled();
    });

    function track(id: string) {
        return {
            id,
            uri: `spotify:track:${id}`,
            name: id,
            artists: [{ id: 'artist', name: 'Artist' }],
            albumName: '',
            imageUrl: '',
            spotifyUrl: '',
            playlistIndex: 1
        };
    }
});
