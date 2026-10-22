import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filter, firstValueFrom, of, Subject, take, throwError } from 'rxjs';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import { PlaylistLoaderService, PlaylistLoadTask } from './playlist-loader.service';
import { buildPlaylistSourceManifest, sourceEntriesFromSpotify } from './playlist-source-manifest';

function entry(id: string, artistId = 'artist', addedAt = '2026-10-01T00:00:00Z') {
  return { added_at: addedAt, track: { id, name: id, type: 'track', artists: [{ id: artistId, name: artistId }] } };
}
const completed = (task: PlaylistLoadTask) => firstValueFrom(task.progress$.pipe(filter(progress => progress.isComplete), take(1)));

describe('Playlist incremental source and durable recovery boundaries', () => {
  let values: Map<string, string>;
  let service: PlaylistLoaderService;
  let logout: Subject<void>;
  let spotify: { getFavTracks: ReturnType<typeof vi.fn>; getSinglePlaylist: ReturnType<typeof vi.fn>; getPlaylistMetadata: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    values = new Map();
    logout = new Subject();
    spotify = { getFavTracks: vi.fn(), getSinglePlaylist: vi.fn(), getPlaylistMetadata: vi.fn() };
    service = new PlaylistLoaderService(spotify as unknown as SpotifyDataService, {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key)
    } as unknown as StorageService, { logout$: logout } as unknown as SpotifyAuthService,
    { loadArtistsByIds: async () => [] } as unknown as SupabaseService);
  });
  afterEach(() => { service.clearAllTasks(); logout.complete(); });

  function seedLiked() {
    const entries = [entry('old-1'), entry('old-2'), entry('old-3')];
    const manifest = buildPlaylistSourceManifest('fav', 3, sourceEntriesFromSpotify(entries), 3, null)!;
    values.set('user_fav', JSON.stringify([{ id: 'artist', name: 'artist', images: [{ url: 'retained.jpg' }], tracks: entries.map((item, index) => ({ ...item.track, playlist_index: index + 1 })) }]));
    values.set('user_fav_Amount', '3');
    values.set('user_fav_SourceManifest', JSON.stringify(manifest));
    return entries;
  }
  function markDirty(id = 'fav') {
    values.set(`user_${id}_SourceState`, JSON.stringify({ version: 1, dirty: true, reason: 'total-changed', observedTotal: 3, observedSnapshotId: null, checkedAt: 1 }));
  }
  function persistedIds() {
    return JSON.parse(values.get('user_fav')!).flatMap((artist: { tracks: { id: string; playlist_index: number }[] }) => artist.tracks)
      .sort((a: {playlist_index: number}, b: {playlist_index: number}) => a.playlist_index - b.playlist_index).map((track: {id: string}) => track.id);
  }

  it('continues a new-only prefix across page boundaries then shifts cached source positions exactly once', async () => {
    const cached = seedLiked();
    const newItems = Array.from({ length: 51 }, (_, index) => entry(`new-${index}`, index === 0 ? 'new-artist' : 'artist'));
    spotify.getFavTracks.mockReturnValueOnce(of({ total: 54, items: newItems.slice(0, 50) }))
      .mockReturnValueOnce(of({ total: 54, items: [...newItems.slice(50), ...cached] }));
    const task = service.startNewFavouriteTracksCheck('user')!;
    expect((await completed(task)).error).toBeNull();
    expect(task.mode).toBe('incremental-new-only');
    expect(spotify.getFavTracks.mock.calls).toEqual([[0, 50], [50, 50]]);
    expect(persistedIds()).toEqual([...newItems.map(item => item.track.id), 'old-1', 'old-2', 'old-3']);
    const artists = JSON.parse(values.get('user_fav')!);
    expect(artists.find((artist: {id: string}) => artist.id === 'artist').images).toEqual([{ url: 'retained.jpg' }]);
    expect(service.readSourceManifest('user', 'fav')).toMatchObject({ sourceTotal: 54, uniqueUsableTrackCount: 54 });
    expect(service.readSourceManifest('user', 'fav')!.entries.map(item => item.position)).toEqual(Array.from({length: 54}, (_, i) => i));
  });

  it('clears all formerly saved songs when the incremental source authoritatively becomes empty', async () => {
    seedLiked(); markDirty();
    spotify.getFavTracks.mockReturnValue(of({ total: 0, items: [] }));
    expect(await service.reconcilePlaylistIfDirty('user', 'fav')).toBe(true);
    expect(values.get('user_fav')).toBe('[]');
    expect(service.readSourceManifest('user', 'fav')).toMatchObject({ sourceTotal: 0, entries: [], uniqueUsableTrackCount: 0 });
    expect(service.isPlaylistSourceDirty('user', 'fav')).toBe(false);
    expect(service.getLoadingTask('fav')).toBeUndefined();
  });

  it.each([
    ['missing total', { items: [entry('untrusted')] }],
    ['negative total', { total: -1, items: [] }],
    ['missing timestamp', { total: 4, items: [entry('new', 'artist', '')] }],
    ['invalid timestamp', { total: 4, items: [entry('new', 'artist', 'invalid')] }],
    ['ascending timestamps', { total: 4, items: [entry('new', 'artist', '2026-10-01T00:00:00Z'), entry('newer', 'artist', '2026-10-02T00:00:00Z')] }],
    ['no cached overlap', { total: 1, items: [entry('replacement')] }],
    ['removed cached prefix', { total: 2, items: [entry('old-2'), entry('old-3')] }],
    ['increased total without enough additions', { total: 5, items: [entry('new'), entry('old-1'), entry('old-2'), entry('old-3')] }]
  ])('uses an exact full refresh when incremental proof fails: %s', async (_name, response) => {
    seedLiked();
    spotify.getFavTracks.mockReturnValueOnce(of(response)).mockReturnValueOnce(of({ total: 1, items: [entry('exact')] }));
    const task = service.startNewFavouriteTracksCheck('user')!;
    expect((await completed(task)).error).toBeNull();
    expect(task.mode).toBe('full');
    expect(spotify.getFavTracks.mock.calls).toEqual([[0, 50], [0, 50]]);
    expect(persistedIds()).toEqual(['exact']);
    expect(service.readSourceManifest('user', 'fav')).toMatchObject({ sourceTotal: 1, uniqueUsableTrackCount: 1 });
  });

  it('preserves all durable metadata on an incremental transport failure and allows an explicit retry', async () => {
    const cached = seedLiked(); markDirty();
    const before = new Map(values);
    spotify.getFavTracks.mockReturnValueOnce(throwError(() => new Error('rate limited'))).mockReturnValueOnce(of({ total: 3, items: cached }));
    const failed = service.startNewFavouriteTracksCheck('user')!;
    expect((await completed(failed)).error.message).toBe('rate limited');
    expect(values).toEqual(before);
    expect(await service.reconcilePlaylistIfDirty('user', 'fav')).toBe(false);
    expect(service.getLoadingTask('fav')).toBeUndefined();
    expect(await service.reconcilePlaylistIfDirty('user', 'fav')).toBe(true);
    expect(persistedIds()).toEqual(['old-1', 'old-2', 'old-3']);
    expect(service.isPlaylistSourceDirty('user', 'fav')).toBe(false);
  });

  it.each(['{broken', JSON.stringify({ version: 9, complete: true, entries: [] }), JSON.stringify({ version: 1, complete: true, playlistId: 'fav', sourceTotal: 3, entries: [] })])('migrates an unusable persisted source manifest with one exact load', async raw => {
    seedLiked();
    values.set('user_fav_SourceManifest', raw);
    expect(service.readSourceManifest('user', 'fav')).toBeNull();
    spotify.getFavTracks.mockReturnValue(of({ total: 1, items: [entry('fresh')] }));
    const task = service.startNewFavouriteTracksCheck('user')!;
    expect((await completed(task)).error).toBeNull();
    expect(task.mode).toBe('full');
    expect(persistedIds()).toEqual(['fresh']);
    expect(service.readSourceManifest('user', 'fav')!.entries[0].trackId).toBe('fresh');
  });

  it.each(['{broken', 'null', JSON.stringify({ version: 2, dirty: true, observedTotal: 1, checkedAt: 1 }), JSON.stringify({ version: 1, dirty: 'yes', observedTotal: 1, checkedAt: 1 })])('does not start a source request from an untrusted dirty-state envelope', async raw => {
    values.set('user_fav_SourceState', raw);
    expect(service.isPlaylistSourceDirty('user', 'fav')).toBe(false);
    expect(await service.reconcilePlaylistIfDirty('user', 'fav')).toBe(true);
    expect(spotify.getFavTracks).not.toHaveBeenCalled();
  });

  it('reports an unreconcilable dirty Liked Songs source without cached artists', async () => {
    markDirty();
    expect(await service.reconcilePlaylistIfDirty('user', 'fav')).toBe(false);
    expect(spotify.getFavTracks).not.toHaveBeenCalled();
    expect(service.isPlaylistSourceDirty('user', 'fav')).toBe(true);
  });

  it('resolves a dirty playlist only after its complete source is committed and releases its task', async () => {
    markDirty('playlist');
    const source = new Subject<any>();
    spotify.getSinglePlaylist.mockReturnValue(source);
    const result = service.reconcilePlaylistIfDirty('user', 'playlist');
    expect(service.getLoadingTask('playlist')!.progress$.value.isComplete).toBe(false);
    expect(service.isPlaylistSourceDirty('user', 'playlist')).toBe(true);
    source.next({ name: 'Current', tracks: { total: 1, items: [entry('fresh')] } });
    source.complete();
    expect(await result).toBe(true);
    expect(service.getLoadingTask('playlist')).toBeUndefined();
    expect(JSON.parse(values.get('user_playlist')!)[0].tracks[0].id).toBe('fresh');
    expect(service.isPlaylistSourceDirty('user', 'playlist')).toBe(false);
  });
  it.each(['favourite first page', 'playlist first page', 'playlist metadata verification'])('preserves the prior complete payload on %s failure and reconciles on retry', async boundary => {
    const favourite = boundary === 'favourite first page';
    const id = favourite ? 'fav' : 'playlist';
    if (favourite) seedLiked();
    else values.set('user_playlist', JSON.stringify([{ id: 'artist', tracks: [{ id: 'previous' }] }]));
    markDirty(id);
    const before = new Map(values);
    const failure = throwError(() => new Error('isolated transport failed'));
    if (favourite) {
      // No valid source manifest means the initial refresh follows the exact migration path.
      values.delete('user_fav_SourceManifest');
      before.delete('user_fav_SourceManifest');
      spotify.getFavTracks.mockReturnValueOnce(failure).mockReturnValueOnce(of({ total: 1, items: [entry('recovered')] }));
    } else if (boundary === 'playlist first page') {
      spotify.getSinglePlaylist.mockReturnValueOnce(failure).mockReturnValueOnce(of({ name: 'Recovered', tracks: { total: 1, items: [entry('recovered')] } }));
    } else {
      spotify.getSinglePlaylist.mockReturnValue(of({ name: 'Recovered', snapshot_id: 'same', tracks: { total: 1, items: [entry('recovered')] } }));
      spotify.getPlaylistMetadata.mockReturnValueOnce(failure).mockReturnValueOnce(of({ snapshot_id: 'same', items: { total: 1 } }));
    }
    expect(await service.reconcilePlaylistIfDirty('user', id)).toBe(false);
    expect(values).toEqual(before);
    expect(service.getLoadingTask(id)).toBeUndefined();
    expect(await service.reconcilePlaylistIfDirty('user', id)).toBe(true);
    expect(JSON.parse(values.get(`user_${id}`)!)[0].tracks[0].id).toBe('recovered');
    expect(service.isPlaylistSourceDirty('user', id)).toBe(false);
    expect(service.getLoadingTask(id)).toBeUndefined();
  });

});
