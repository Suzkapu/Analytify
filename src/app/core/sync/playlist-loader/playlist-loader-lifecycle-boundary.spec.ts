import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { filter, firstValueFrom, of, Subject, take, throwError } from 'rxjs';
import { PlaylistLoaderService, PlaylistLoadTask } from './playlist-loader.service';
import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function entry(id: string) {
  return { added_at: '2026-10-01T00:00:00Z', track: {
    id, name: id, type: 'track', artists: [{ id: 'artist', name: 'Artist' }]
  } };
}
const completed = (task: PlaylistLoadTask) => firstValueFrom(task.progress$.pipe(filter(value => value.isComplete), take(1)));

describe('Playlist loading lifecycle boundaries', () => {
  let service: PlaylistLoaderService;
  let values: Map<string, string>;
  let logout: Subject<void>;
  let spotify: { getSinglePlaylist: ReturnType<typeof vi.fn>; getAllTracksFromPlaylist: ReturnType<typeof vi.fn>; getPlaylistMetadata: ReturnType<typeof vi.fn>; getFavTracks: ReturnType<typeof vi.fn> };
  let profiles: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    values = new Map();
    logout = new Subject<void>();
    spotify = { getSinglePlaylist: vi.fn(), getAllTracksFromPlaylist: vi.fn(), getPlaylistMetadata: vi.fn(), getFavTracks: vi.fn() };
    profiles = vi.fn().mockResolvedValue([]);
    service = new PlaylistLoaderService(
      spotify as unknown as SpotifyDataService,
      { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } as unknown as StorageService,
      { logout$: logout } as unknown as SpotifyAuthService,
      { loadArtistsByIds: profiles } as unknown as SupabaseService
    );
  });
  afterEach(() => { service.clearAllTasks(); logout.complete(); });

  it('does not restore a logged-out account cache when optional artist hydration settles late', async () => {
    const hydration = deferred<any[]>();
    profiles.mockReturnValue(hydration.promise);
    spotify.getSinglePlaylist.mockReturnValue(of({ name: 'Before logout', tracks: { total: 1, items: [entry('old')] } }));
    const task = service.startLoadingTask('account-a', 'playlist');
    expect(task.progress$.value.isLoadingTracks).toBe(false);
    expect(values.has('account-a_playlist')).toBe(true);
    logout.next();
    values.clear();
    hydration.resolve([{ id: 'artist', images: [{ url: 'late.jpg' }] }]);
    await hydration.promise;
    await Promise.resolve();
    expect(service.getLoadingTask('playlist')).toBeUndefined();
    expect([...values]).toEqual([]);
  });

  it('does not overwrite a replacement task cache when an older artist hydration finishes', async () => {
    const oldHydration = deferred<any[]>();
    profiles.mockReturnValueOnce(oldHydration.promise).mockResolvedValue([]);
    spotify.getSinglePlaylist.mockReturnValueOnce(of({ name: 'Old', tracks: { total: 1, items: [entry('old')] } }))
      .mockReturnValueOnce(of({ name: 'New', tracks: { total: 1, items: [entry('new')] } }));
    service.startLoadingTask('user', 'playlist');
    service.clearLoadingTask('playlist');
    const replacement = service.startLoadingTask('user', 'playlist');
    await completed(replacement);
    const committed = new Map(values);
    oldHydration.resolve([{ id: 'artist', images: [{ url: 'stale.jpg' }] }]);
    await oldHydration.promise;
    await Promise.resolve();
    expect(values).toEqual(committed);
    expect(service.getLoadingTask('playlist')).toBe(replacement);
  });

  it('settles a dirty reconciliation as unsuccessful when logout cancels its pending source request', async () => {
    values.set('user_playlist_SourceState', JSON.stringify({ version: 1, dirty: true, reason: 'total-changed', observedTotal: 1, observedSnapshotId: null, checkedAt: 1 }));
    const request = new Subject<any>();
    spotify.getSinglePlaylist.mockReturnValue(request);
    let result: boolean | undefined;
    void service.reconcilePlaylistIfDirty('user', 'playlist').then(value => { result = value; });
    expect(request.observed).toBe(true);
    logout.next();
    await Promise.resolve();
    await Promise.resolve();
    expect(request.observed).toBe(false);
    expect(result).toBe(false);
  });

  it('cancels every pending page on logout and never publishes subsequent emissions', () => {
    const first = new Subject<any>();
    const page = new Subject<any>();
    spotify.getSinglePlaylist.mockReturnValue(first);
    spotify.getAllTracksFromPlaylist.mockReturnValue(page);
    const task = service.startLoadingTask('user', 'playlist');
    first.next({ name: 'Playlist', tracks: { total: 2, items: [entry('first')] } });
    expect(page.observed).toBe(true);
    logout.next();
    const progress = task.progress$.value;
    expect(first.observed).toBe(false);
    expect(page.observed).toBe(false);
    page.next({ items: [entry('late')] });
    expect(task.progress$.value).toBe(progress);
    expect(values.size).toBe(0);
  });

  it('preserves the previous complete cache if any concurrent page fails and supports an explicit retry', async () => {
    values.set('user_playlist', JSON.stringify([{ id: 'artist', tracks: [{ id: 'cached' }] }]));
    const previous = values.get('user_playlist');
    spotify.getSinglePlaylist.mockReturnValue(of({ name: 'Playlist', tracks: { total: 2, items: [entry('first')] } }));
    spotify.getAllTracksFromPlaylist.mockReturnValueOnce(throwError(() => new Error('network interrupted')))
      .mockReturnValueOnce(of({ items: [entry('second')] }));
    const failed = service.startLoadingTask('user', 'playlist', true);
    expect((await completed(failed)).error.message).toBe('network interrupted');
    expect(values.get('user_playlist')).toBe(previous);
    expect(values.has('user_playlist_SourceManifest')).toBe(false);
    service.clearLoadingTask('playlist');
    const retried = service.startLoadingTask('user', 'playlist', true);
    expect((await completed(retried)).error).toBeNull();
    expect(JSON.parse(values.get('user_playlist')!)[0].tracks.map((track: {id: string}) => track.id)).toEqual(['first', 'second']);
    expect(service.isPlaylistSourceDirty('user', 'playlist')).toBe(false);
  });
  it('applies out-of-order page arrivals in source order and persists a complete manifest', async () => {
    const page1 = new Subject<any>();
    const page2 = new Subject<any>();
    spotify.getSinglePlaylist.mockReturnValue(of({ name: 'Ordered', tracks: { total: 101, items: [entry('first')] } }));
    spotify.getAllTracksFromPlaylist.mockImplementation((_id: string, offset: number) => offset === 1 ? page1 : page2);
    const task = service.startLoadingTask('user', 'playlist');
    page2.next({ items: Array.from({ length: 50 }, (_, i) => entry(`track-${i + 51}`)) });
    page2.complete();
    expect(values.has('user_playlist')).toBe(false);
    expect(task.progress$.value.loadedTracksCount).toBe(51);
    page1.next({ items: Array.from({ length: 50 }, (_, i) => entry(`track-${i + 1}`)) });
    page1.complete();
    expect((await completed(task)).error).toBeNull();
    const artists = JSON.parse(values.get('user_playlist')!);
    expect(artists[0].tracks.map((track: {id: string}) => track.id)).toEqual(['first', ...Array.from({ length: 100 }, (_, i) => `track-${i + 1}`)]);
    expect(artists[0].tracks.map((track: {playlist_index: number}) => track.playlist_index)).toEqual(Array.from({ length: 101 }, (_, i) => i + 1));
    const manifest = service.readSourceManifest('user', 'playlist')!;
    expect(manifest.sourceTotal).toBe(101);
    expect(manifest.entries.map(value => value.position)).toEqual(Array.from({ length: 101 }, (_, i) => i));
  });

  it.each([
    ['empty remaining page', { items: [] }, 'empty playlist page'],
    ['short remaining page', { items: [entry('second')] }, '2 source entries while reporting 3']
  ])('refuses a partial source cache after an %s', async (_name, response, message) => {
    values.set('user_playlist', 'previous complete payload');
    spotify.getSinglePlaylist.mockReturnValue(of({ name: 'Playlist', tracks: { total: 3, items: [entry('first')] } }));
    spotify.getAllTracksFromPlaylist.mockReturnValue(of(response));
    const task = service.startLoadingTask('user', 'playlist', true);
    const progress = await completed(task);
    expect(progress.error.message).toContain(message);
    expect(progress.isLoadingTracks).toBe(false);
    expect(progress.isLoadingArtists).toBe(false);
    expect(progress.isRefreshing).toBe(false);
    expect(values.get('user_playlist')).toBe('previous complete payload');
    expect(service.readSourceManifest('user', 'playlist')).toBeNull();
  });

  it('rejects a changed Liked Songs total during pagination without replacing its cache', async () => {
    values.set('user_fav', 'previous complete payload');
    spotify.getFavTracks.mockReturnValueOnce(of({ total: 2, items: [entry('first')] }))
      .mockReturnValueOnce(of({ total: 3, items: [entry('second')] }));
    const task = service.startLoadingTask('user', 'fav', true);
    expect((await completed(task)).error.message).toContain('Liked Songs changed');
    expect(values.get('user_fav')).toBe('previous complete payload');
    expect(values.has('user_fav_SourceManifest')).toBe(false);
  });

  it('records raw duplicates, local and unavailable entries without inventing usable tracks', async () => {
    const items = [entry('shared'), entry('shared'), { ...entry('local'), is_local: true }, { added_at: '2026-10-01T00:00:00Z', track: null }];
    spotify.getSinglePlaylist.mockReturnValue(of({ name: 'Mixed', tracks: { total: 4, items } }));
    const task = service.startLoadingTask('user', 'playlist');
    await completed(task);
    const manifest = service.readSourceManifest('user', 'playlist')!;
    expect(manifest).toMatchObject({ sourceTotal: 4, uniqueUsableTrackCount: 1, duplicateOccurrenceCount: 1, localCount: 1, unavailableCount: 1 });
    expect(JSON.parse(values.get('user_playlist')!)[0].tracks.map((track: {id: string}) => track.id)).toEqual(['shared']);
    expect(service.isCachedPlaylistComplete(task.artists, 4, 1, manifest)).toBe(true);
    expect(service.isCachedPlaylistComplete([], 4, 0, manifest)).toBe(false);
  });

  it('publishes complete tracks before artist profiles then preserves enriched safe cache fields', async () => {
    const hydration = deferred<any[]>();
    profiles.mockReturnValue(hydration.promise);
    const track = entry('track');
    Object.assign(track.track, { explicit: true, duration_ms: 1234, external_urls: { spotify: 'https://open.spotify.com/track/track' }, album: {
      id: 'album', name: 'Album', images: [{ url: 'cover.jpg' }, { url: 'extra.jpg' }], release_date: '2026',
      artists: [{ id: 'album-artist', name: 'Album artist', secret: 'discard' }], external_urls: { spotify: 'https://open.spotify.com/album/album' }, secret: 'discard'
    }, secret: 'discard' });
    spotify.getSinglePlaylist.mockReturnValue(of({ name: 'Rich', snapshot_id: 'same', tracks: { total: 1, items: [track] } }));
    spotify.getPlaylistMetadata.mockReturnValue(of({ snapshot_id: 'same', tracks: { total: 1 } }));
    const task = service.startLoadingTask('user', 'playlist');
    expect(task.progress$.value).toMatchObject({ isLoadingTracks: false, isLoadingArtists: true, isComplete: false });
    expect(values.has('user_playlist')).toBe(true);
    hydration.resolve([{ id: null }, { id: 'artist', images: [{ url: 'artist.jpg' }, { url: 'extra.jpg' }], external_urls: { spotify: 'https://open.spotify.com/artist/artist' } }]);
    expect((await completed(task)).loadedArtistsDetailsCount).toBe(1);
    const [artist] = JSON.parse(values.get('user_playlist')!);
    expect(artist.images).toEqual([{ url: 'artist.jpg' }]);
    expect(artist.external_urls).toEqual({ spotify: 'https://open.spotify.com/artist/artist' });
    expect(artist.tracks[0]).toMatchObject({ explicit: true, duration_ms: 1234, album: { id: 'album', images: [{ url: 'cover.jpg' }], artists: [{ id: 'album-artist', name: 'Album artist' }] } });
    expect(artist.tracks[0].secret).toBeUndefined();
    expect(artist.tracks[0].album.secret).toBeUndefined();
    expect(service.readSourceManifest('user', 'playlist')!.snapshotId).toBe('same');
  });

  it('finishes and persists a genuinely empty playlist without requesting optional profiles', async () => {
    spotify.getSinglePlaylist.mockReturnValue(of({ name: 'Empty', tracks: { total: 0, items: [] } }));
    const task = service.startLoadingTask('user', 'playlist');
    expect((await completed(task)).artists).toEqual([]);
    expect(profiles).not.toHaveBeenCalled();
    expect(values.get('user_playlist')).toBe('[]');
    expect(service.isCachedPlaylistComplete([], 0, 0, service.readSourceManifest('user', 'playlist'))).toBe(true);
  });

  it('does not refresh a clean source during reconciliation', async () => {
    expect(await service.reconcilePlaylistIfDirty('user', 'playlist')).toBe(true);
    expect(spotify.getSinglePlaylist).not.toHaveBeenCalled();
    expect(values.size).toBe(0);
  });

  it.each([null, '{invalid', '{}', '42'])('declines automatic Liked Songs refresh for unusable cached artists: %s', raw => {
    if (raw !== null) values.set('user_fav', raw);
    expect(service.startNewFavouriteTracksCheck('user')).toBeNull();
    expect(spotify.getFavTracks).not.toHaveBeenCalled();
    expect(service.getLoadingTask('fav')).toBeUndefined();
  });

  it('marks portfolio source changes without treating malformed list entries as playlists', () => {
    service.recordPortfolioMetadata('user', [null, {}, { id: 'changed', name: ' Renamed ', items: { total: 2 }, snapshotId: 'new' }, { id: 'total-only', total: 3 }, { id: 'fav', tracks: { total: 4 } }], [
      null, { id: 'changed', tracks: { total: 2 }, snapshot_id: 'old' }, { id: 'total-only', total: 2 }, { id: 'fav', tracks: { total: 3 } }
    ]);
    expect(service.isPlaylistSourceDirty('user', 'changed')).toBe(true);
    expect(JSON.parse(values.get('user_changed_SourceState')!)).toMatchObject({ reason: 'snapshot-changed', observedSnapshotId: 'new', observedTotal: 2 });
    expect(JSON.parse(values.get('user_total-only_SourceState')!).reason).toBe('total-changed');
    expect(JSON.parse(values.get('user_fav_SourceState')!).reason).toBe('total-changed');
    expect(values.get('user_changed_Name')).toBe(JSON.stringify(' Renamed '));
    expect([...values.keys()].some(key => key.includes('undefined'))).toBe(false);
    const before = new Map(values);
    service.recordPortfolioMetadata('user', null as unknown as any[], {} as any[]);
    service.recordPlaylistMetadata('user', null);
    expect(values).toEqual(before);
  });

  it.each([
    ['{broken', '{broken'],
    ['-5', '42'],
    ['"wrong"', 'null']
  ])('uses neutral pending metadata when durable amount/name are unusable', (amount, name) => {
    values.set('user_playlist_Amount', amount);
    values.set('user_playlist_Name', name);
    spotify.getSinglePlaylist.mockReturnValue(new Subject());
    const task = service.startLoadingTask('user', 'playlist');
    expect(task.progress$.value.totalTracks).toBe(0);
    expect(task.progress$.value.playlistName).toBe('');
  });

  it('handles malformed list totals without discarding a valid detail total', () => {
    values.set('user_playlists', JSON.stringify({ id: 'playlist', tracks: { total: 99 } }));
    expect(service.resolveExpectedPlaylistTotal('user', 'playlist', 12)).toBe(12);
    values.set('user_playlists', JSON.stringify([null, { id: 'playlist', tracks: { total: -4 } }]));
    expect(service.resolveExpectedPlaylistTotal('user', 'playlist', Number.NaN)).toBe(0);
    expect(service.isCachedPlaylistComplete({} as any[], 0, null)).toBe(false);
    expect(service.isCachedPlaylistComplete([], Number.NaN, null)).toBe(false);
    expect(service.isCachedPlaylistComplete([], -1, null)).toBe(false);
    expect(service.isCachedPlaylistComplete([{ tracks: [{ id: 'track' }] }], 0, null)).toBe(false);
  });

  it.each(['single', 'all'])('preserves a successor started by an earlier cancellation observer during %s task clearing', async mode => {
    values.set('user_playlist_SourceState', JSON.stringify({ version: 1, dirty: true, reason: 'total-changed', observedTotal: 1, observedSnapshotId: null, checkedAt: 1 }));
    spotify.getSinglePlaylist.mockImplementation(() => new Subject());
    const old = service.startLoadingTask('user', 'playlist');
    let successor: PlaylistLoadTask | undefined;
    const observer = old.progress$.subscribe(progress => {
      if (progress.isComplete && progress.error?.name === 'AbortError' && !successor) {
        successor = service.startLoadingTask('user', 'playlist');
      }
    });
    let outcome: boolean | undefined;
    void service.reconcilePlaylistIfDirty('user', 'playlist').then(result => { outcome = result; });
    if (mode === 'single') service.clearLoadingTask('playlist');
    else service.clearAllTasks();
    await Promise.resolve();
    await Promise.resolve();
    observer.unsubscribe();
    expect(successor).toBeDefined();
    expect(successor).not.toBe(old);
    expect(service.getLoadingTask('playlist')).toBe(successor);
    expect(successor!.progress$.value.isComplete).toBe(false);
    expect(outcome).toBe(false);
  });

  it.each([null, new Error('original failure')])('preserves completed task progress when released: %s', error => {
    const task = new PlaylistLoadTask('done');
    task.isComplete = true;
    task.error = error;
    task.emitUpdate();
    const completedProgress = task.progress$.value;
    task.cancel();
    task.cancel();
    expect(task.progress$.value).toBe(completedProgress);
    expect(task.error).toBe(error);
  });

});
