import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ActivatedRoute, Router} from '@angular/router';
import {EMPTY, Subject} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {PlaylistLoaderService, PlaylistLoadTask} from '@core/sync/playlist-loader/playlist-loader.service';
import {PlaylistAnalysisController} from './playlist-analysis.controller';

const dataset = (id: string) => [{id: 'artist', name: 'Artist', tracks: [{id, duration_ms: 180000,
  artists: [{id: 'artist', name: 'Artist'}], album: {id: 'album', name: 'Album', release_date: '2024'}}]}];

describe('Playlist analysis cache and loader boundaries', () => {
  const controllers: PlaylistAnalysisController[] = [];
  beforeEach(() => vi.useFakeTimers({toFake: ['Date']}));
  afterEach(() => {
    controllers.forEach(controller => controller.ngOnDestroy());
    controllers.length = 0;
    vi.useRealTimers();
  });

  function setup(backup = false) {
    vi.setSystemTime(new Date(2026, 9, 24, 12));
    const values = new Map<string, string>();
    const params = new Subject<Record<string, string>>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => values.delete(key),
      hydrateItems: vi.fn(async (): Promise<void> => undefined),
      restoreItemsFromCloud: vi.fn(async () => 0)
    };
    const auth = {logout$: EMPTY, isAuthenticated: () => false, getUserId: () => 'user',
      isBackupActive: () => backup};
    const loader = new PlaylistLoaderService({} as SpotifyDataService, storage as unknown as StorageService,
      auth as unknown as SpotifyAuthService, {} as SupabaseService);
    const task = new PlaylistLoadTask('playlist');
    const start = vi.spyOn(loader, 'startLoadingTask').mockReturnValue(task);
    const controller = new PlaylistAnalysisController({params} as unknown as ActivatedRoute,
      auth as unknown as SpotifyAuthService, {} as Router, storage as unknown as StorageService, loader);
    controllers.push(controller);
    controller.ngOnInit();
    const seed = (id = 'playlist', updated = Date.now()) => {
      values.set(`user_${id}`, JSON.stringify(dataset(`${id}-track`)));
      values.set(`user_${id}_Name`, JSON.stringify(`Saved ${id}`));
      values.set(`user_${id}_Amount`, '1');
      values.set(`user_${id}_CachedTrackCount`, '1');
      values.set(`user_${id}_lastUpdated`, String(updated));
    };
    const open = async (id = 'playlist') => {
      params.next({id});
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    };
    return {values, params, storage, loader, controller, task, start, seed, open};
  }

  it('uses a complete current cache without starting Spotify or cloud work', async () => {
    const h = setup(true);
    h.seed();
    await h.open();
    expect(h.controller.playlistName).toBe('Saved playlist');
    expect(h.controller.uniqueTracksCount).toBe(1);
    expect(h.controller.totalDurationFormatted).toBe('3 min 0 sec');
    expect(h.controller.isLoading).toBe(false);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.storage.restoreItemsFromCloud).not.toHaveBeenCalled();
  });

  it('restores a missing cache from cloud before considering Spotify', async () => {
    const h = setup(true);
    h.storage.restoreItemsFromCloud.mockImplementation(async () => {h.seed(); return 6;});
    await h.open();
    expect(h.controller.uniqueTracksCount).toBe(1);
    expect(h.controller.playlistName).toBe('Saved playlist');
    expect(h.controller.isLoading).toBe(false);
    expect(h.start).not.toHaveBeenCalled();
    expect(h.storage.restoreItemsFromCloud).toHaveBeenCalledWith(expect.arrayContaining([
      'user_playlist', 'user_playlist_CachedTrackCount', 'user_playlist_SourceManifest'
    ]), expect.any(Function));
  });

  it('keeps expired statistics visible while fresh loader progress replaces them on completion', async () => {
    const h = setup();
    h.seed('playlist', new Date(2026, 9, 23, 23).getTime());
    await h.open();
    expect(h.start).toHaveBeenCalledWith('user', 'playlist', true, true);
    h.task.isRefreshing = true;
    h.task.playlistName = 'Refreshing playlist';
    h.task.emitUpdate();
    expect(h.controller.isRefreshing).toBe(true);
    expect(h.controller.uniqueTracksCount).toBe(1);
    h.values.set('user_playlist', JSON.stringify(dataset('replacement')));
    h.task.isComplete = true;
    h.task.emitUpdate();
    expect(h.controller.artists[0].tracks[0].id).toBe('replacement');
    expect(h.controller.isRefreshing).toBe(false);
    expect(h.controller.isLoading).toBe(false);
  });

  it('detects incomplete detail data using the independently refreshed playlist inventory', async () => {
    const h = setup();
    h.seed();
    h.values.delete('user_playlist_CachedTrackCount');
    h.values.set('user_playlists', JSON.stringify([{id: 'playlist', tracks: {total: 100}}]));
    await h.open();
    expect(h.start).toHaveBeenCalledWith('user', 'playlist', true, true);
    expect(h.controller.uniqueTracksCount).toBe(1);
  });

  it('reuses an active background task and its cached statistics without a duplicate request', async () => {
    const h = setup();
    h.seed();
    vi.spyOn(h.loader, 'getLoadingTask').mockReturnValue(h.task);
    await h.open();
    expect(h.controller.uniqueTracksCount).toBe(1);
    h.task.loadedTracksCount = 7;
    h.task.totalTracks = 9;
    h.task.playlistName = 'Active playlist';
    h.task.emitUpdate();
    expect(h.controller.loadedTracksCount).toBe(7);
    expect(h.controller.totalTracks).toBe(9);
    expect(h.controller.playlistName).toBe('Active playlist');
    expect(h.start).not.toHaveBeenCalled();
  });

  it('recovers malformed artist JSON through the loader instead of showing invalid statistics', async () => {
    const h = setup();
    h.seed();
    h.values.set('user_playlist', '{broken');
    await h.open();
    expect(h.start).toHaveBeenCalledWith('user', 'playlist', false, true);
    expect(h.controller.uniqueTracksCount).toBe(0);
    h.values.set('user_playlist', JSON.stringify(dataset('recovered')));
    h.task.isComplete = true;
    h.task.emitUpdate();
    expect(h.controller.uniqueTracksCount).toBe(1);
    expect(h.controller.artists[0].tracks[0].id).toBe('recovered');
  });

  it('does not begin a request when deferred hydration finishes after destruction', async () => {
    const h = setup();
    let release!: () => void;
    h.storage.hydrateItems.mockReturnValue(new Promise<void>(resolve => release = resolve));
    await h.open();
    h.controller.ngOnDestroy();
    release();
    await Promise.resolve();
    expect(h.start).not.toHaveBeenCalled();
    expect(h.controller.uniqueTracksCount).toBe(0);
  });

  it('uses the previous daily cutoff before 1am and expires data strictly before the new cutoff', () => {
    const h = setup();
    vi.setSystemTime(new Date(2026, 9, 24, 0, 59));
    expect(h.controller.isCacheExpired(String(new Date(2026, 9, 23, 1).getTime()))).toBe(false);
    vi.setSystemTime(new Date(2026, 9, 24, 1));
    expect(h.controller.isCacheExpired(String(new Date(2026, 9, 23, 1).getTime()))).toBe(true);
    expect(h.controller.isCacheExpired(String(Date.now()))).toBe(false);
    expect(h.controller.isCacheExpired('corrupt')).toBe(true);
    expect(h.controller.isCacheExpired(null)).toBe(true);
  });
});
