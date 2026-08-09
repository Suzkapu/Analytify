import { TestBed } from '@angular/core/testing';
import { EMPTY, filter, firstValueFrom, of, take } from 'rxjs';
import { PlaylistLoaderService, PlaylistLoadTask } from './playlist-loader.service';
import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';
import {
  buildPlaylistSourceManifest,
  sourceEntriesFromSpotify
} from './playlist-source-manifest';

describe('PlaylistLoaderService', () => {
  let service: PlaylistLoaderService;
  let storageValues: Record<string, string>;
  let spotify: jasmine.SpyObj<SpotifyDataService>;

  beforeEach(() => {
    storageValues = {};
    spotify = jasmine.createSpyObj<SpotifyDataService>('SpotifyDataService', [
      'getFavTracks',
      'getSinglePlaylist',
      'getAllTracksFromPlaylist',
      'getPlaylistMetadata'
    ]);
    TestBed.configureTestingModule({
      providers: [
        PlaylistLoaderService,
        { provide: SpotifyDataService, useValue: spotify },
        {
          provide: StorageService,
          useValue: {
            getItem: (key: string) => storageValues[key] ?? null,
            setItem: (key: string, value: string) => storageValues[key] = value,
            removeItem: (key: string) => delete storageValues[key]
          }
        },
        { provide: SpotifyAuthService, useValue: { logout$: EMPTY, isBackupActive: () => false } },
        { provide: SupabaseService, useValue: {loadArtistsByIds: () => Promise.resolve([])} },
        {
          provide: PlaylistSharingService,
          useValue: {refreshActiveSharesFromCache: jasmine.createSpy().and.resolveTo(0)}
        }
      ]
    });
    service = TestBed.inject(PlaylistLoaderService);
  });

  it('rejects a severely incomplete legacy playlist cache', () => {
    const artists = [{
      id: 'artist',
      tracks: Array.from({ length: 30 }, (_, index) => ({ id: `track-${index}` }))
    }];

    expect(service.isCachedPlaylistComplete(artists, 5000, null)).toBeFalse();
  });

  it('accepts a completed cache whose consistency marker matches its data', () => {
    const artists = [{
      id: 'artist',
      tracks: Array.from({ length: 4975 }, (_, index) => ({ id: `track-${index}` }))
    }];

    expect(service.isCachedPlaylistComplete(artists, 5000, 4975)).toBeTrue();
  });

  it('keeps the cautious source-total tolerance for legacy caches without a marker', () => {
    const artists = [{
      id: 'artist',
      tracks: Array.from({ length: 4975 }, (_, index) => ({ id: `track-${index}` }))
    }];

    expect(service.isCachedPlaylistComplete(artists, 5000, null)).toBeTrue();
  });

  it('does not invalidate track data merely because artist images are absent', () => {
    const artists = [{id: 'artist', tracks: [{id: 'track'}]}];

    expect(service.isCachedPlaylistComplete(artists, 1, 1)).toBeTrue();
  });

  it('trusts an exact completed-cache marker when Spotify includes duplicate or unavailable entries', () => {
    const artists = [{
      id: 'artist',
      tracks: Array.from({ length: 80 }, (_, index) => ({ id: `track-${index}` }))
    }];

    expect(service.isCachedPlaylistComplete(artists, 100, 80)).toBeTrue();
  });

  it('does not accept an empty marked cache when Spotify reports playlist entries', () => {
    expect(service.isCachedPlaylistComplete([], 10, 0)).toBeFalse();
  });

  it('rejects a cache whose consistency marker does not match its data', () => {
    const artists = [{
      id: 'artist',
      tracks: Array.from({ length: 30 }, (_, index) => ({ id: `track-${index}` }))
    }];

    expect(service.isCachedPlaylistComplete(artists, 5000, 5000)).toBeFalse();
  });

  it('uses the playlist-list total to expose a partial detail cache', () => {
    storageValues['user_playlists'] = JSON.stringify([
      { id: 'playlist', tracks: { total: 5000 } }
    ]);

    expect(service.resolveExpectedPlaylistTotal('user', 'playlist', 30)).toBe(5000);
  });

  it('counts duplicate tracks only once across artists', () => {
    const artists = [
      { tracks: [{ id: 'shared' }, { id: 'first' }, { id: null }] },
      { tracks: [{ id: 'shared' }, { id: 'second' }] }
    ];

    expect(service.countUniqueTracks(artists)).toBe(3);
  });

  it('uses the largest known liked-songs total and tolerates malformed playlist data', () => {
    storageValues['user_fav_Amount'] = '250';
    storageValues['user_playlists'] = '{not-json';

    expect(service.resolveExpectedPlaylistTotal('user', 'fav', 100)).toBe(250);
  });

  it('reuses the active task instead of starting a duplicate Spotify load', () => {
    const trigger = spyOn<any>(service, 'triggerApiLoad').and.stub();

    const first = service.startLoadingTask('user', 'playlist');
    const second = service.startLoadingTask('user', 'playlist');

    expect(second).toBe(first);
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('runs the incremental liked-songs check at most once per session', () => {
    storageValues['user_fav'] = JSON.stringify([{ id: 'artist', tracks: [{ id: 'track' }] }]);
    storageValues['user_fav_SourceManifest'] = sourceManifestJson('fav', [spotifyEntry('track', '2026-08-01T00:00:00Z')]);
    const trigger = spyOn<any>(service, 'triggerApiLoad').and.stub();

    const first = service.startNewFavouriteTracksCheck('user');
    service.clearLoadingTask('fav');
    const second = service.startNewFavouriteTracksCheck('user');

    expect(first?.mode).toBe('incremental-new-only');
    expect(second).toBeNull();
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('allows an explicit Liked Songs refresh after the automatic session check', () => {
    storageValues['user_fav'] = JSON.stringify([{ id: 'artist', tracks: [{ id: 'track' }] }]);
    storageValues['user_fav_SourceManifest'] = sourceManifestJson('fav', [spotifyEntry('track', '2026-08-01T00:00:00Z')]);
    const trigger = spyOn<any>(service, 'triggerApiLoad').and.stub();

    service.startNewFavouriteTracksCheck('user');
    service.clearLoadingTask('fav');
    const forced = service.startNewFavouriteTracksCheck('user', true);

    expect(forced?.mode).toBe('incremental-new-only');
    expect(trigger).toHaveBeenCalledTimes(2);
  });

  it('publishes and persists complete tracks before optional artist enrichment finishes', () => {
    const task = new PlaylistLoadTask('playlist');
    task.isLoadingTracks = true;
    task.isRefreshing = true;
    task.totalTracks = 1;
    task.sourceEntries = sourceEntriesFromSpotify([
      spotifyEntry('track', '2026-08-01T00:00:00Z')
    ]);
    const artists = [{
      id: 'artist',
      name: 'Artist',
      images: [],
      tracks: [{ id: 'track', name: 'Track' }]
    }];
    const persist = spyOn<any>(service, 'setSessionStorage').and.stub();
    spyOn<any>(service, 'hydrateArtistDetailsFromSupabase')
      .and.returnValue(new Promise<void>(() => {}));

    (service as any).finishTrackLoading(task, artists, [], 'user');

    expect(task.artists).toBe(artists);
    expect(task.isLoadingTracks).toBeFalse();
    expect(task.isRefreshing).toBeFalse();
    expect(task.hasDataChanges).toBeTrue();
    expect(persist).toHaveBeenCalledWith(task, 'user', true);
    expect(task.progress$.value.artists).toBe(artists);
  });

  it('soft-pulls only a new Liked Songs prefix when the raw totals reconcile', async () => {
    seedLikedSongs(['old-1', 'old-2', 'old-3']);
    const remoteItems = [
      spotifyEntry('new-1', '2026-08-05T00:00:00Z'),
      spotifyEntry('new-2', '2026-08-04T00:00:00Z'),
      spotifyEntry('old-1', '2026-08-03T00:00:00Z'),
      spotifyEntry('old-2', '2026-08-02T00:00:00Z'),
      spotifyEntry('old-3', '2026-08-01T00:00:00Z')
    ];
    spotify.getFavTracks.and.returnValue(of({total: remoteItems.length, items: remoteItems}));

    const task = service.startNewFavouriteTracksCheck('user', true)!;
    await completed(task);

    expect(spotify.getFavTracks).toHaveBeenCalledOnceWith(0, 50);
    expect(cachedTrackIds('user_fav')).toEqual(['new-1', 'new-2', 'old-1', 'old-2', 'old-3']);
    const manifest = JSON.parse(storageValues['user_fav_SourceManifest']);
    expect(manifest.sourceTotal).toBe(5);
    expect(manifest.uniqueUsableTrackCount).toBe(5);
    expect(JSON.parse(storageValues['user_fav_SourceState']).dirty).toBeFalse();
  });

  it('falls back to exact pagination when an addition hides a removal', async () => {
    seedLikedSongs(['old-1', 'old-2', 'old-3', 'removed']);
    const remoteItems = [
      spotifyEntry('new-1', '2026-08-05T00:00:00Z'),
      spotifyEntry('old-1', '2026-08-04T00:00:00Z'),
      spotifyEntry('old-2', '2026-08-03T00:00:00Z'),
      spotifyEntry('old-3', '2026-08-02T00:00:00Z')
    ];
    spotify.getFavTracks.and.returnValue(of({total: remoteItems.length, items: remoteItems}));

    const task = service.startNewFavouriteTracksCheck('user', true)!;
    await completed(task);

    expect(spotify.getFavTracks).toHaveBeenCalledTimes(2);
    expect(cachedTrackIds('user_fav')).toEqual(['new-1', 'old-1', 'old-2', 'old-3']);
    expect(cachedTrackIds('user_fav')).not.toContain('removed');
    expect(task.mode).toBe('full');
  });

  it('falls back to exact pagination when songs were only removed', async () => {
    seedLikedSongs(['kept-1', 'kept-2', 'kept-3', 'removed']);
    const remoteItems = [
      spotifyEntry('kept-1', '2026-08-04T00:00:00Z'),
      spotifyEntry('kept-2', '2026-08-03T00:00:00Z'),
      spotifyEntry('kept-3', '2026-08-02T00:00:00Z')
    ];
    spotify.getFavTracks.and.returnValue(of({total: remoteItems.length, items: remoteItems}));

    const task = service.startNewFavouriteTracksCheck('user', true)!;
    await completed(task);

    expect(spotify.getFavTracks).toHaveBeenCalledTimes(2);
    expect(cachedTrackIds('user_fav')).toEqual(['kept-1', 'kept-2', 'kept-3']);
    expect(JSON.parse(storageValues['user_fav_SourceManifest']).sourceTotal).toBe(3);
  });

  it('keeps the previous cache when a playlist snapshot changes during pagination', async () => {
    storageValues['user_playlist'] = JSON.stringify([{id: 'artist', tracks: [{id: 'cached'}]}]);
    const first = spotifyEntry('first', '2026-08-02T00:00:00Z');
    const second = spotifyEntry('second', '2026-08-01T00:00:00Z');
    spotify.getSinglePlaylist.and.returnValue(of({
      id: 'playlist',
      name: 'Playlist',
      snapshot_id: 'snapshot-before',
      tracks: {total: 2, items: [first]}
    }));
    spotify.getAllTracksFromPlaylist.and.returnValue(of({total: 2, items: [second]}));
    spotify.getPlaylistMetadata.and.returnValue(of({
      snapshot_id: 'snapshot-after',
      items: {total: 2}
    }));

    const task = service.startLoadingTask('user', 'playlist', true, true);
    const progress = await completed(task);

    expect(progress.error?.message).toContain('changed while it was being synchronized');
    expect(JSON.parse(storageValues['user_playlist'])[0].tracks[0].id).toBe('cached');
    expect(storageValues['user_playlist_SourceManifest']).toBeUndefined();
  });

  it('marks a changed playlist snapshot dirty and trusts an unchanged snapshot', () => {
    const entries = [spotifyEntry('track', '2026-08-01T00:00:00Z')];
    storageValues['user_playlist'] = JSON.stringify([{id: 'artist', tracks: [{id: 'track'}]}]);
    storageValues['user_playlist_Amount'] = '1';
    storageValues['user_playlist_SourceManifest'] = sourceManifestJson('playlist', entries, 'snapshot-one');

    service.recordPlaylistMetadata('user', {
      id: 'playlist',
      items: {total: 1},
      snapshot_id: 'snapshot-one'
    });
    expect(service.isPlaylistSourceDirty('user', 'playlist')).toBeFalse();
    expect(storageValues['user_playlist_lastUpdated']).toBeDefined();

    service.recordPlaylistMetadata('user', {
      id: 'playlist',
      items: {total: 1},
      snapshot_id: 'snapshot-two'
    });
    expect(service.isPlaylistSourceDirty('user', 'playlist')).toBeTrue();
  });

  function seedLikedSongs(ids: string[]): void {
    const entries = ids.map((id, index) =>
      spotifyEntry(id, `2026-08-${String(ids.length - index).padStart(2, '0')}T00:00:00Z`)
    );
    storageValues['user_fav'] = JSON.stringify([{
      id: 'artist',
      name: 'Artist',
      images: [{url: 'artist.jpg'}],
      tracks: ids.map((id, index) => ({
        id,
        name: id,
        artists: [{id: 'artist', name: 'Artist'}],
        playlist_index: index + 1
      }))
    }]);
    storageValues['user_fav_Amount'] = String(ids.length);
    storageValues['user_fav_CachedTrackCount'] = String(ids.length);
    storageValues['user_fav_SourceManifest'] = sourceManifestJson('fav', entries);
    storageValues['user_fav_SourceState'] = JSON.stringify({
      version: 1,
      dirty: true,
      reason: 'total-changed',
      observedTotal: ids.length,
      observedSnapshotId: null,
      checkedAt: Date.now()
    });
  }

  function sourceManifestJson(
    playlistId: string,
    entries: any[],
    snapshotId: string | null = null
  ): string {
    const manifest = buildPlaylistSourceManifest(
      playlistId,
      entries.length,
      sourceEntriesFromSpotify(entries),
      new Set(entries.map(entry => entry.track?.id).filter(Boolean)).size,
      snapshotId
    );
    if (!manifest) throw new Error('Test manifest could not be created.');
    return JSON.stringify(manifest);
  }

  function spotifyEntry(id: string, addedAt: string): any {
    return {
      added_at: addedAt,
      is_local: false,
      track: {
        id,
        uri: `spotify:track:${id}`,
        name: id,
        type: 'track',
        artists: [{id: 'artist', name: 'Artist'}]
      }
    };
  }

  function cachedTrackIds(key: string): string[] {
    const artists = JSON.parse(storageValues[key] || '[]');
    return artists
      .flatMap((artist: any) => artist.tracks || [])
      .sort((left: any, right: any) => left.playlist_index - right.playlist_index)
      .map((track: any) => track.id);
  }

  async function completed(task: PlaylistLoadTask): Promise<any> {
    return firstValueFrom(task.progress$.pipe(
      filter(progress => progress.isComplete),
      take(1)
    ));
  }
});
