import { afterEach, beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { ComparePlaylist } from './compare-room.models';
import { ComparePlaylistSourceService } from './compare-playlist-source.service';
import { PlaylistLoaderService } from '@core/sync/playlist-loader/playlist-loader.service';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';

describe('ComparePlaylistSourceService', () => {
    let service: ComparePlaylistSourceService;
    let http: HttpTestingController;
    let values: Record<string, string>;
    let auth: any;
    let playlistLoader: any;

    beforeEach(() => {
        values = {};
        auth = {
            ensureInitialSync: vi.fn().mockName("SpotifyAuthService.ensureInitialSync"),
            isBackupActive: vi.fn().mockName("SpotifyAuthService.isBackupActive")
        };
        auth.ensureInitialSync.mockResolvedValue(undefined);
        auth.isBackupActive.mockReturnValue(false);
        playlistLoader = {
            recordPlaylistMetadata: vi.fn().mockName("PlaylistLoaderService.recordPlaylistMetadata"),
            reconcilePlaylistIfDirty: vi.fn().mockName("PlaylistLoaderService.reconcilePlaylistIfDirty"),
            sourceManifestKey: vi.fn().mockName("PlaylistLoaderService.sourceManifestKey")
        };
        playlistLoader.reconcilePlaylistIfDirty.mockResolvedValue(true);
        playlistLoader.sourceManifestKey.mockImplementation((userId: string, playlistId: string) => `${userId}_${playlistId}_SourceManifest`);

        TestBed.configureTestingModule({
            imports: [],
            providers: [
                { provide: SpotifyAuthService, useValue: auth },
                { provide: PlaylistLoaderService, useValue: playlistLoader },
                {
                    provide: StorageService,
                    useValue: {
                        initFromDB: () => Promise.resolve(),
                        getItem: (key: string) => values[key] ?? null,
                        restoreItemsFromCloud: vi.fn().mockName('restoreItemsFromCloud').mockResolvedValue(0)
                    }
                },
                provideHttpClient(withXhr(), withInterceptorsFromDi()),
                provideHttpClientTesting()
            ]
        });
        service = TestBed.inject(ComparePlaylistSourceService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('lists the main profile playlists from the local cache without waiting for cloud or Spotify', async () => {
        values['main-user_playlists'] = JSON.stringify([
            { id: 'fav', name: 'Favourite Tracks', tracks: { total: 4200 } },
            {
                id: 'party',
                name: 'Party',
                images: [{ url: 'party.jpg' }],
                tracks: { total: 750 },
                owner: { id: 'main-user', display_name: 'Main user' }
            },
            {
                id: 'shared-copy',
                name: 'Shared with me',
                images: [],
                tracks: {total: 12},
                owner: {id: 'friend', display_name: 'Friend'}
            }
        ]);

        const result = await service.loadMainPlaylists('host-token', 'main-user');

        expect(result.map(playlist => playlist.id)).toEqual(['fav', 'party', 'shared-copy']);
        expect(result.map(playlist => playlist.total)).toEqual([4200, 750, 12]);
        expect(auth.ensureInitialSync).not.toHaveBeenCalled();
        http.expectNone(() => true);
    });

    it('loads a large main-profile playlist entirely from the local cache', async () => {
        const cachedTracks = Array.from({ length: 1000 }, (_, index) => ({
            id: `track-${index}`,
            name: `Track ${index}`,
            artists: [{ id: 'artist', name: 'Artist' }],
            playlist_index: index + 1
        }));
        values['main-user_large-playlist'] = JSON.stringify([{ id: 'artist', tracks: cachedTracks }]);
        const playlist: ComparePlaylist = {
            id: 'large-playlist',
            name: 'Large playlist',
            imageUrl: '',
            total: cachedTracks.length,
            ownerName: 'Main user'
        };

        const result = await service.loadMainTracks(playlist, 'host-token', 'main-user');

        expect(result.source).toBe('local');
        expect(result.tracks.length).toBe(1000);
        expect(result.tracks[999].uri).toBe('spotify:track:track-999');
        expect(auth.ensureInitialSync).not.toHaveBeenCalled();
        http.expectNone(() => true);
    });

    it('always loads a linked public playlist read-only from Spotify instead of account cache', async () => {
        values['main-user_37i9dQZF1DXcBWIGoYBM5M'] = JSON.stringify([{tracks: [{id: 'stale'}]}]);
        const playlist: ComparePlaylist = {
            id: '37i9dQZF1DXcBWIGoYBM5M', name: 'Linked mix', imageUrl: '', total: 0,
            ownerName: 'Curator', isPublicLink: true
        };
        const loading = service.loadMainTracks(playlist, 'host-token', 'main-user');
        const request = http.expectOne(req => req.url.includes('/playlists/37i9dQZF1DXcBWIGoYBM5M/items'));
        expect(request.request.method).toBe('GET');
        request.flush({total: 0, items: []});

        await expect(loading).resolves.toEqual({tracks: [], source: 'spotify'});
        expect(playlistLoader.recordPlaylistMetadata).not.toHaveBeenCalled();
        expect(auth.ensureInitialSync).not.toHaveBeenCalled();
    });

    it('uses the hydrated Supabase cache before requesting playlist tracks from Spotify', async () => {
        auth.ensureInitialSync.mockImplementation(async () => {
            values['main-user_cloud-playlist'] = JSON.stringify([{
                    id: 'artist',
                    tracks: [{
                            id: 'cloud-track',
                            name: 'Cloud track',
                            artists: [{ id: 'artist', name: 'Artist' }]
                        }]
                }]);
        });
        const playlist: ComparePlaylist = {
            id: 'cloud-playlist',
            name: 'Cloud playlist',
            imageUrl: '',
            total: 1,
            ownerName: 'Main user'
        };

        const result = await service.loadMainTracks(playlist, 'host-token', 'main-user');

        expect(result.source).toBe('cloud');
        expect(result.tracks.map(track => track.id)).toEqual(['cloud-track']);
        http.expectNone(() => true);
    });

    it('combines multiple cached playlists and removes duplicate tracks', async () => {
        values['main-user_first'] = JSON.stringify([{ tracks: [
                    { id: 'a', name: 'A', artists: [{ id: 'artist', name: 'Artist' }] },
                    { id: 'shared', name: 'Shared', artists: [{ id: 'artist', name: 'Artist' }] }
                ] }]);
        values['main-user_second'] = JSON.stringify([{ tracks: [
                    { id: 'shared', name: 'Shared', artists: [{ id: 'artist', name: 'Artist' }] },
                    { id: 'b', name: 'B', artists: [{ id: 'artist', name: 'Artist' }] }
                ] }]);

        const result = await service.loadMainSelection([
            { id: 'first', name: 'First', imageUrl: '', total: 2, ownerName: '' },
            { id: 'second', name: 'Second', imageUrl: '', total: 2, ownerName: '' }
        ], 'host-token', 'main-user');

        expect(result.source).toBe('local');
        expect(result.tracks.map(track => track.id)).toEqual(['a', 'shared', 'b']);
        http.expectNone(() => true);
    });
});
