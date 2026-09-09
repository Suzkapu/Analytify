import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { ParticipantSpotifyService } from '@core/compare-room/participant-spotify.service';
import { PlaylistShareAutoSyncService } from './playlist-share-auto-sync.service';
import { PlaylistSharingService } from './playlist-sharing.service';
import { SessionLifecycleService } from '@core/auth/session-lifecycle.service';

describe('PlaylistShareAutoSyncService', () => {
    let service: PlaylistShareAutoSyncService;
    let auth: any;
    let sharing: any;
    let spotify: any;
    let realtimeChange: (() => void) | null;

    beforeEach(() => {
        auth = {
            isAuthenticated: vi.fn().mockName("SpotifyAuthService.isAuthenticated"),
            ensureInitialSync: vi.fn().mockName("SpotifyAuthService.ensureInitialSync"),
            getSupabaseUserId: vi.fn().mockName("SpotifyAuthService.getSupabaseUserId"),
            getUserId: vi.fn().mockName("SpotifyAuthService.getUserId"),
            getAccessToken: vi.fn().mockName("SpotifyAuthService.getAccessToken"),
            isTokenExpired: vi.fn().mockName("SpotifyAuthService.isTokenExpired"),
            refreshToken: vi.fn().mockName("SpotifyAuthService.refreshToken"),
            logout$: new Subject<void>()
        };
        sharing = {
            listReceivedShares: vi.fn().mockName("PlaylistSharingService.listReceivedShares"),
            listReceivedDownloads: vi.fn().mockName("PlaylistSharingService.listReceivedDownloads"),
            loadShare: vi.fn().mockName("PlaylistSharingService.loadShare"),
            claimDownloadSync: vi.fn().mockName("PlaylistSharingService.claimDownloadSync"),
            completeDownloadSync: vi.fn().mockName("PlaylistSharingService.completeDownloadSync"),
            releaseDownloadSync: vi.fn().mockName("PlaylistSharingService.releaseDownloadSync"),
            subscribeToShareChanges: vi.fn().mockName("PlaylistSharingService.subscribeToShareChanges")
        };
        realtimeChange = null;
        spotify = {
            syncPlaylist: vi.fn().mockName("ParticipantSpotifyService.syncPlaylist")
        };
        auth.isAuthenticated.mockReturnValue(true);
        auth.ensureInitialSync.mockResolvedValue(undefined);
        auth.getSupabaseUserId.mockReturnValue('supabase-user');
        auth.getUserId.mockReturnValue('spotify-user');
        auth.getAccessToken.mockReturnValue('spotify-token');
        auth.isTokenExpired.mockReturnValue(false);
        sharing.listReceivedShares.mockResolvedValue([]);
        sharing.listReceivedDownloads.mockResolvedValue([]);
        sharing.claimDownloadSync.mockResolvedValue('lease-token');
        sharing.completeDownloadSync.mockResolvedValue(true);
        sharing.releaseDownloadSync.mockResolvedValue(undefined);
        sharing.subscribeToShareChanges.mockImplementation((callback: () => void) => {
            realtimeChange = callback;
            return () => undefined;
        });

        TestBed.configureTestingModule({
            providers: [
                PlaylistShareAutoSyncService,
                { provide: SpotifyAuthService, useValue: auth },
                { provide: PlaylistSharingService, useValue: sharing },
                { provide: ParticipantSpotifyService, useValue: spotify }
            ]
        });
        service = TestBed.inject(PlaylistShareAutoSyncService);
    });

    it('leaves background source publication exclusively to the server worker', async () => {
        await service.syncNow();

        expect(sharing.listReceivedShares).toHaveBeenCalled();
    });

    it('does not subscribe or query without an explicit cloud identity', async () => {
        auth.getSupabaseUserId.mockReturnValue(null);

        service.start();
        await service.syncNow();

        expect(sharing.subscribeToShareChanges).not.toHaveBeenCalled();
        expect(auth.ensureInitialSync).not.toHaveBeenCalled();
        expect(sharing.listReceivedShares).not.toHaveBeenCalled();
        expect(sharing.listReceivedDownloads).not.toHaveBeenCalled();
    });

    it('automatically updates an existing recipient Spotify copy without creating another playlist', async () => {
        sharing.listReceivedShares.mockResolvedValue([share(3)]);
        sharing.listReceivedDownloads.mockResolvedValue([download(2)]);
        sharing.loadShare.mockResolvedValue({
            share: share(3),
            tracks: [track('new-song')],
            download: download(2),
            viewerRole: 'recipient'
        });
        spotify.syncPlaylist.mockResolvedValue({
            success: true,
            playlistName: 'Shared party',
            playlistId: 'existing-playlist',
            playlistUrl: 'spotify-url',
            addedTracks: 1
        });
        const update = vi.fn().mockName('update');
        service.spotifyUpdates$.subscribe(update);

        await service.syncNow();

        expect(spotify.syncPlaylist).toHaveBeenCalledWith(
            'spotify-token', 'existing-playlist', 'spotify-url', 'Shared party · from Owner',
            expect.stringContaining('Share ID: received-share'), [track('new-song')], expect.any(AbortSignal),
            { operationId: 'shared:received-share', accountId: 'spotify-user', fingerprint: 'shared:received-share' }
        );
        expect(sharing.claimDownloadSync).toHaveBeenCalledWith('received-share', 3, 2);
        expect(sharing.completeDownloadSync).toHaveBeenCalledWith('received-share', 3, 2, 'lease-token', 'existing-playlist', 'spotify-url');
        expect(update).toHaveBeenCalledWith({ shareId: 'received-share', revision: 3, success: true });
    });

    it('does not create a Spotify playlist for a received share that was never downloaded', async () => {
        sharing.listReceivedShares.mockResolvedValue([share(3)]);
        sharing.listReceivedDownloads.mockResolvedValue([]);

        await service.syncNow();

        expect(sharing.loadShare).not.toHaveBeenCalled();
        expect(spotify.syncPlaylist).not.toHaveBeenCalled();
    });

    it('does not call Spotify when another writer owns the destination lease', async () => {
        sharing.listReceivedShares.mockResolvedValue([share(3)]);
        sharing.listReceivedDownloads.mockResolvedValue([download(2)]);
        sharing.loadShare.mockResolvedValue({
            share: share(3), tracks: [track('new-song')], download: download(2), viewerRole: 'recipient'
        });
        sharing.claimDownloadSync.mockResolvedValue(null);

        await service.syncNow();

        expect(spotify.syncPlaylist).not.toHaveBeenCalled();
        expect(sharing.completeDownloadSync).not.toHaveBeenCalled();
    });

    it('ignores account A Spotify completion after teardown starts account B', async () => {
        sharing.listReceivedShares.mockResolvedValue([share(3)]);
        sharing.listReceivedDownloads.mockResolvedValue([download(2)]);
        sharing.loadShare.mockResolvedValue({
            share: share(3), tracks: [track('new-song')], download: download(2), viewerRole: 'recipient'
        });
        let resolveSpotify!: (result: any) => void;
        spotify.syncPlaylist.mockReturnValue(new Promise(resolve => resolveSpotify = resolve));

        const syncA = service.syncNow();
        while (!(vi.mocked(spotify.syncPlaylist).mock.calls.length > 0))
            await Promise.resolve();
        const teardownA = TestBed.inject(SessionLifecycleService).invalidateAndDrain();
        resolveSpotify({
            success: true, playlistId: 'existing-playlist', playlistUrl: 'spotify-url',
            playlistName: 'Shared party', addedTracks: 1
        });
        await Promise.all([syncA, teardownA]);

        expect(sharing.completeDownloadSync).not.toHaveBeenCalled();
        expect(sharing.releaseDownloadSync).toHaveBeenCalledWith('received-share', 'lease-token');
    });

    it('reacts to realtime changes with recipient sync only so owner publication cannot loop', async () => {
        service.start();
        await (service as any).syncPromise;
        sharing.listReceivedShares.mockClear();

        realtimeChange?.();
        await (service as any).syncPromise;

        expect(sharing.listReceivedShares).toHaveBeenCalledTimes(1);
        service.stop();
    });

    function share(revision: number) {
        return {
            id: 'received-share', ownerUserId: 'owner', recipientUserId: 'recipient', sourcePlaylistId: 'source',
            playlistName: 'Shared party', playlistDescription: '', playlistImageUrl: '', ownerDisplayName: 'Owner',
            ownerImageUrl: '', recipientDisplayName: 'Recipient', trackCount: 1, revision,
            createdAt: 'now', updatedAt: 'now', acceptedAt: 'now', revokedAt: null
        };
    }

    function download(appliedRevision: number) {
        return {
            shareId: 'received-share', spotifyPlaylistId: 'existing-playlist', spotifyPlaylistUrl: 'spotify-url',
            appliedRevision, updatedAt: 'before'
        };
    }

    function track(id: string) {
        return {
            id, uri: `spotify:track:${id}`, name: id, artists: [{ id: 'artist', name: 'Artist' }],
            albumName: '', imageUrl: '', spotifyUrl: '', playlistIndex: 1
        };
    }
});
