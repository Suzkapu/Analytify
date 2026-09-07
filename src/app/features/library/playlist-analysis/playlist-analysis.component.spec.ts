import { beforeEach, describe, expect, it, vi } from "vitest";
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { EMPTY, Subject } from 'rxjs';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { PlaylistLoaderService } from '@core/sync/playlist-loader/playlist-loader.service';
import { PlaylistAnalysisComponent } from './playlist-analysis.component';

describe('PlaylistAnalysisComponent', () => {
    let component: PlaylistAnalysisComponent;
    let fixture: ComponentFixture<PlaylistAnalysisComponent>;

    beforeEach(() => {
        TestBed.configureTestingModule({
            declarations: [PlaylistAnalysisComponent],
            providers: [
                { provide: ActivatedRoute, useValue: { params: EMPTY } },
                { provide: Router, useValue: { navigate: vi.fn().mockName('navigate') } },
                { provide: SpotifyAuthService, useValue: { isAuthenticated: () => false } },
                { provide: StorageService, useValue: {} },
                { provide: PlaylistLoaderService, useValue: {} }
            ],
            schemas: [NO_ERRORS_SCHEMA]
        });
        fixture = TestBed.createComponent(PlaylistAnalysisComponent);
        component = fixture.componentInstance;
    });

    it('uses the shared page shell and themed analysis cards', () => {
        component.isLoading = false;
        component.playlistName = 'Road Trip';
        component.uniqueTracksCount = 42;
        component.totalDurationFormatted = '2 hr 8 min';
        component.averageDurationFormatted = '3:03';
        component.uniqueArtistsCount = 18;
        component.uniqueAlbumsCount = 24;
        component.explicitCount = 7;
        component.topArtists = [{ id: 'artist-1', name: 'Artist One', count: 4 }];
        component.topAlbums = [{ name: 'Album One', count: 3 }];
        fixture.detectChanges();

        const element = fixture.nativeElement as HTMLElement;
        expect(element.querySelector('.analysis-page > .page-shell')).not.toBeNull();
        expect(element.querySelector('.page-shell > .page-back-row')).not.toBeNull();
        expect(element.querySelectorAll('app-metric-card').length).toBe(6);
        expect(element.querySelectorAll('.frequency-sections > .column-card').length).toBe(2);
        expect(element.querySelector('.frequency-sections app-section-heading[title="Top artists"]')).not.toBeNull();
        expect(element.querySelector('.frequency-sections')?.textContent).toContain('Artist One');
        expect(element.querySelector('.frequency-sections app-section-heading[title="Top albums"]')).not.toBeNull();
        expect(element.querySelector('.frequency-sections')?.textContent).toContain('Album One');
        expect(element.querySelectorAll('.analysis-sections > .column-card').length).toBe(2);
    });

    it('shows an indeterminate loading state before a playlist total is known', () => {
        fixture.detectChanges();

        const element = fixture.nativeElement as HTMLElement;
        expect(component.isLoading).toBe(true);
        expect(element.querySelector('.analysis-loading')).not.toBeNull();
        expect(element.textContent).toContain('Finding cached playlist data…');
        expect(element.querySelector('.metrics-grid')).toBeNull();
    });

    it('counts unique artists and albums without duplicating collaborative tracks', () => {
        const sharedTrack = {
            id: 'track-1',
            name: 'Together',
            duration_ms: 180000,
            artists: [
                { id: 'artist-1', name: 'One' },
                { id: 'artist-2', name: 'Two' }
            ],
            album: { id: 'album-1', name: 'First', release_date: '2020-01-01' }
        };
        component.artists = [
            { id: 'artist-1', name: 'One', tracks: [sharedTrack] },
            { id: 'artist-2', name: 'Two', tracks: [sharedTrack] },
            {
                id: 'artist-3',
                name: 'Three',
                tracks: [{
                        id: 'track-2',
                        name: 'Solo',
                        duration_ms: 200000,
                        artists: [{ id: 'artist-3', name: 'Three' }],
                        album: { id: 'album-2', name: 'Second', release_date: '2024-01-01' }
                    }]
            }
        ];

        component.runAnalysis();

        expect(component.uniqueTracksCount).toBe(2);
        expect(component.uniqueArtistsCount).toBe(3);
        expect(component.uniqueAlbumsCount).toBe(2);
    });

    it('builds the same top-artist, top-album, and explicit summary as shared playlists', () => {
        component.artists = [
            {
                id: 'artist-1', name: 'One', tracks: [
                    {
                        id: 'track-1', name: 'Together', duration_ms: 180000, explicit: false,
                        artists: [{ id: 'artist-1', name: 'One' }, { id: 'artist-2', name: 'Two' }],
                        album: { id: 'album-1', name: 'First', release_date: '2020-01-01' }
                    },
                    {
                        id: 'track-2', name: 'Again', duration_ms: 200000, explicit: true,
                        artists: [{ id: 'artist-1', name: 'One' }],
                        album: { id: 'album-1', name: 'First', release_date: '2020-01-01' }
                    }
                ]
            },
            {
                id: 'artist-2', name: 'Two', tracks: [{
                        id: 'track-1', name: 'Together', duration_ms: 180000, explicit: false,
                        artists: [{ id: 'artist-1', name: 'One' }, { id: 'artist-2', name: 'Two' }],
                        album: { id: 'album-1', name: 'First', release_date: '2020-01-01' }
                    }]
            },
            {
                id: 'artist-3', name: 'Three', tracks: [{
                        id: 'track-3', name: 'Solo', duration_ms: 220000, explicit: false,
                        artists: [{ id: 'artist-3', name: 'Three' }],
                        album: { id: 'album-2', name: 'Second', release_date: '2024-01-01' }
                    }]
            }
        ];

        component.runAnalysis();

        expect(component.explicitCount).toBe(1);
        expect(component.topArtists).toEqual([
            { id: 'artist-1', name: 'One', count: 2 },
            { id: 'artist-2', name: 'Two', count: 1 },
            { id: 'artist-3', name: 'Three', count: 1 }
        ]);
        expect(component.topAlbums).toEqual([
            { name: 'First', count: 2 },
            { name: 'Second', count: 1 }
        ]);
    });

    it('starts the first playlist load without waiting for broad cloud hydration', async () => {
        const params = new Subject<Record<string, string>>();
        let finishInitialSync!: () => void;
        const initialSync = new Promise<void>(resolve => finishInitialSync = resolve);
        const auth = {
            isAuthenticated: () => true,
            ensureInitialSync: () => initialSync
        };

        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            declarations: [PlaylistAnalysisComponent],
            providers: [
                { provide: ActivatedRoute, useValue: { params } },
                { provide: Router, useValue: { navigate: vi.fn().mockName('navigate') } },
                { provide: SpotifyAuthService, useValue: auth },
                { provide: StorageService, useValue: {} },
                { provide: PlaylistLoaderService, useValue: {} }
            ],
            schemas: [NO_ERRORS_SCHEMA]
        });
        const firstOpenFixture = TestBed.createComponent(PlaylistAnalysisComponent);
        const firstOpenComponent = firstOpenFixture.componentInstance;
        const load = vi.spyOn(firstOpenComponent, 'loadPlaylistData').mockResolvedValue(undefined);
        firstOpenFixture.detectChanges();

        params.next({ id: 'playlist' });
        await Promise.resolve();

        expect(load).toHaveBeenCalledTimes(1);
        finishInitialSync();
    });

    it('detaches playlist A progress as soon as the route changes to playlist B', async () => {
        const params = new Subject<Record<string, string>>();
        const playlistAProgress = new Subject<any>();
        let finishPlaylistBRestore!: () => void;
        const playlistBRestore = new Promise<void>(resolve => finishPlaylistBRestore = resolve);
        const storage = {
            getItem: vi.fn().mockName("StorageService.getItem"),
            removeItem: vi.fn().mockName("StorageService.removeItem"),
            restoreItemsFromCloud: vi.fn().mockName("StorageService.restoreItemsFromCloud")
        };
        storage.getItem.mockReturnValue(null);
        storage.restoreItemsFromCloud.mockReturnValue(playlistBRestore.then(() => 0));
        const loader = {
            getLoadingTask: vi.fn().mockName("PlaylistLoaderService.getLoadingTask"),
            readSourceManifest: vi.fn().mockName("PlaylistLoaderService.readSourceManifest"),
            isPlaylistSourceDirty: vi.fn().mockName("PlaylistLoaderService.isPlaylistSourceDirty"),
            resolveExpectedPlaylistTotal: vi.fn().mockName("PlaylistLoaderService.resolveExpectedPlaylistTotal"),
            isCachedPlaylistComplete: vi.fn().mockName("PlaylistLoaderService.isCachedPlaylistComplete"),
            sourceManifestKey: vi.fn().mockName("PlaylistLoaderService.sourceManifestKey"),
            startLoadingTask: vi.fn().mockName("PlaylistLoaderService.startLoadingTask"),
            startNewFavouriteTracksCheck: vi.fn().mockName("PlaylistLoaderService.startNewFavouriteTracksCheck"),
            clearLoadingTask: vi.fn().mockName("PlaylistLoaderService.clearLoadingTask")
        };
        loader.getLoadingTask.mockImplementation(id => id === 'playlist-a'
            ? { mode: 'full', progress$: playlistAProgress } as any
            : undefined);
        loader.readSourceManifest.mockReturnValue(null);
        loader.isPlaylistSourceDirty.mockReturnValue(false);
        loader.resolveExpectedPlaylistTotal.mockImplementation((_userId, _playlistId, total) => total);
        loader.isCachedPlaylistComplete.mockReturnValue(false);
        loader.sourceManifestKey.mockImplementation((_userId, playlistId) => `manifest_${playlistId}`);

        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            declarations: [PlaylistAnalysisComponent],
            providers: [
                { provide: ActivatedRoute, useValue: { params } },
                { provide: Router, useValue: { navigate: vi.fn().mockName('navigate') } },
                {
                    provide: SpotifyAuthService,
                    useValue: {
                        isAuthenticated: () => false,
                        getUserId: () => 'user',
                        isBackupActive: () => true
                    }
                },
                { provide: StorageService, useValue: storage },
                { provide: PlaylistLoaderService, useValue: loader }
            ],
            schemas: [NO_ERRORS_SCHEMA]
        });
        const routeFixture = TestBed.createComponent(PlaylistAnalysisComponent);
        const routeComponent = routeFixture.componentInstance;
        routeFixture.detectChanges();

        params.next({ id: 'playlist-a' });
        params.next({ id: 'playlist-b' });
        await Promise.resolve();
        expect(playlistAProgress.observers.length).toBe(0);
        playlistAProgress.next({
            isLoadingTracks: false,
            isLoadingArtists: false,
            isRefreshing: false,
            loadedTracksCount: 1,
            totalTracks: 1,
            loadedArtistsDetailsCount: 1,
            totalUniqueArtists: 1,
            playlistName: 'Playlist A',
            cooldownMessage: '',
            artists: [],
            isComplete: true
        });

        expect(routeComponent.playlistId).toBe('playlist-b');
        expect(routeComponent.playlistName).not.toBe('Playlist A');
        expect(loader.clearLoadingTask).not.toHaveBeenCalledWith('playlist-b');

        finishPlaylistBRestore();
        routeFixture.destroy();
    });

    it('ignores playlist A cloud restoration after playlist B has taken over', async () => {
        const params = new Subject<Record<string, string>>();
        let finishPlaylistARestore!: () => void;
        let finishPlaylistBRestore!: () => void;
        const playlistARestore = new Promise<void>(resolve => finishPlaylistARestore = resolve);
        const playlistBRestore = new Promise<void>(resolve => finishPlaylistBRestore = resolve);
        const storage = {
            getItem: vi.fn().mockName("StorageService.getItem"),
            removeItem: vi.fn().mockName("StorageService.removeItem"),
            restoreItemsFromCloud: vi.fn().mockName("StorageService.restoreItemsFromCloud")
        };
        storage.getItem.mockReturnValue(null);
        storage.restoreItemsFromCloud.mockImplementation(keys => (keys[0].endsWith('_playlist-a') ? playlistARestore : playlistBRestore).then(() => 0));
        const loader = {
            getLoadingTask: vi.fn().mockName("PlaylistLoaderService.getLoadingTask"),
            readSourceManifest: vi.fn().mockName("PlaylistLoaderService.readSourceManifest"),
            isPlaylistSourceDirty: vi.fn().mockName("PlaylistLoaderService.isPlaylistSourceDirty"),
            resolveExpectedPlaylistTotal: vi.fn().mockName("PlaylistLoaderService.resolveExpectedPlaylistTotal"),
            isCachedPlaylistComplete: vi.fn().mockName("PlaylistLoaderService.isCachedPlaylistComplete"),
            sourceManifestKey: vi.fn().mockName("PlaylistLoaderService.sourceManifestKey"),
            startLoadingTask: vi.fn().mockName("PlaylistLoaderService.startLoadingTask"),
            startNewFavouriteTracksCheck: vi.fn().mockName("PlaylistLoaderService.startNewFavouriteTracksCheck"),
            clearLoadingTask: vi.fn().mockName("PlaylistLoaderService.clearLoadingTask")
        };
        loader.getLoadingTask.mockReturnValue(undefined);
        loader.readSourceManifest.mockReturnValue(null);
        loader.isPlaylistSourceDirty.mockReturnValue(false);
        loader.resolveExpectedPlaylistTotal.mockImplementation((_userId, _playlistId, total) => total);
        loader.isCachedPlaylistComplete.mockReturnValue(false);
        loader.sourceManifestKey.mockImplementation((_userId, playlistId) => `manifest_${playlistId}`);
        loader.startLoadingTask.mockReturnValue({ mode: 'full', progress$: EMPTY } as any);

        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
            declarations: [PlaylistAnalysisComponent],
            providers: [
                { provide: ActivatedRoute, useValue: { params } },
                { provide: Router, useValue: { navigate: vi.fn().mockName('navigate') } },
                {
                    provide: SpotifyAuthService,
                    useValue: {
                        isAuthenticated: () => false,
                        getUserId: () => 'user',
                        isBackupActive: () => true
                    }
                },
                { provide: StorageService, useValue: storage },
                { provide: PlaylistLoaderService, useValue: loader }
            ],
            schemas: [NO_ERRORS_SCHEMA]
        });
        const routeFixture = TestBed.createComponent(PlaylistAnalysisComponent);
        const routeComponent = routeFixture.componentInstance;
        routeFixture.detectChanges();

        params.next({ id: 'playlist-a' });
        params.next({ id: 'playlist-b' });
        finishPlaylistBRestore();
        await expect(waitFor(() => vi.mocked(loader.startLoadingTask).mock.calls.length === 1)).resolves.not.toThrow();
        expect(loader.startLoadingTask).toHaveBeenCalledTimes(1);
        expect(vi.mocked(loader.startLoadingTask).mock.lastCall![1]).toBe('playlist-b');

        finishPlaylistARestore();
        await Promise.resolve();
        await Promise.resolve();

        expect(routeComponent.playlistId).toBe('playlist-b');
        expect(loader.startLoadingTask).toHaveBeenCalledTimes(1);
        routeFixture.destroy();
    });
});

async function waitFor(predicate: () => boolean): Promise<void> {
    const deadline = Date.now() + 1000;
    while (!predicate()) {
        if (Date.now() >= deadline)
            throw new Error('Timed out waiting for playlist load');
        await new Promise(resolve => setTimeout(resolve, 0));
    }
}
