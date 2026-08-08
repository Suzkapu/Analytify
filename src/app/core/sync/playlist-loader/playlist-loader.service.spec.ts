import { TestBed } from '@angular/core/testing';
import { EMPTY } from 'rxjs';
import { PlaylistLoaderService, PlaylistLoadTask } from './playlist-loader.service';
import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';

describe('PlaylistLoaderService', () => {
  let service: PlaylistLoaderService;
  let storageValues: Record<string, string>;

  beforeEach(() => {
    storageValues = {};
    TestBed.configureTestingModule({
      providers: [
        PlaylistLoaderService,
        { provide: SpotifyDataService, useValue: {} },
        {
          provide: StorageService,
          useValue: { getItem: (key: string) => storageValues[key] ?? null }
        },
        { provide: SpotifyAuthService, useValue: { logout$: EMPTY, isBackupActive: () => true } },
        { provide: SupabaseService, useValue: {} },
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
});
