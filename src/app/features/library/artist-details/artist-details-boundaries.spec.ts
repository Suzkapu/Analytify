import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Subject, of, throwError} from 'rxjs';
import {ArtistDetailsController} from './artist-details.controller';

const artist = (id = 'artist-a', name = 'Artist A') => ({id, name});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {resolve = done; reject = fail;});
  return {promise, resolve, reject};
};

describe('Artist details cache and service boundaries', () => {
  const controllers: ArtistDetailsController[] = [];
  let previousState: unknown;

  beforeEach(() => {
    previousState = history.state;
    history.replaceState({}, '');
    vi.setSystemTime(new Date(2026, 9, 24, 12));
  });

  afterEach(() => {
    controllers.forEach(controller => controller.ngOnDestroy());
    controllers.length = 0;
    history.replaceState(previousState, '');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup(options: {backup?: boolean; userId?: string; playlistId?: string} = {}) {
    const params = new Subject<Record<string, string>>();
    const items = new Map<string, string>();
    const storage = {
      hydrateItems: vi.fn(async (_keys: string[]): Promise<void> => undefined),
      getItem: (key: string) => items.get(key) ?? null,
      setItem: vi.fn((key: string, value: string) => {items.set(key, value);}),
      restoreItemsFromCloud: vi.fn(async (_keys: string[], _canApply: () => boolean): Promise<void> => undefined)
    };
    const spotify = {getSingleArtist: vi.fn((_id: string) => of(artist()))};
    const cloud = {
      loadArtistById: vi.fn(async (_id: string): Promise<ReturnType<typeof artist> | null> => null),
      syncArtists: vi.fn(async (_artists: unknown[]) => undefined)
    };
    const router = {navigate: vi.fn(async () => true)};
    const auth = {getUserId: vi.fn(() => options.userId ?? 'user-a'), isBackupActive: () => options.backup ?? false};
    if (options.playlistId) history.replaceState({playlistId: options.playlistId, tracks: [{id: 'track-a'}]}, '');
    const controller = new ArtistDetailsController({params} as any, spotify as any, router as any,
      auth as any,
      storage as any, cloud as any);
    controllers.push(controller);
    return {controller, params, items, storage, spotify, cloud, router, auth};
  }

  const loaded = async (controller: ArtistDetailsController) => {
    await vi.waitFor(() => expect(controller.isLoadingArtist).toBe(false));
  };

  it('hydrates the account-scoped artist and preserves the originating playlist tracks without remote reads', async () => {
    const f = setup({playlistId: 'playlist-a'});
    f.items.set('user-a_artist_artist-a', JSON.stringify(artist()));
    f.items.set('user-a_artist_artist-a_lastUpdated', String(Date.now()));
    f.params.next({id: 'artist-a'});
    await loaded(f.controller);
    expect(f.controller.artist).toEqual(artist());
    expect(f.controller.tracks).toEqual([{id: 'track-a'}]);
    expect(f.storage.hydrateItems).toHaveBeenCalledWith(['user-a_artist_artist-a', 'user-a_playlist-a']);
    expect(f.cloud.loadArtistById).not.toHaveBeenCalled();
    expect(f.spotify.getSingleArtist).not.toHaveBeenCalled();
  });

  it.each([
    ['malformed JSON', '{', String(new Date(2026, 9, 24, 11).getTime())],
    ['a different artist', JSON.stringify(artist('artist-b')), String(new Date(2026, 9, 24, 11).getTime())],
    ['missing timestamp', JSON.stringify(artist()), null],
    ['malformed timestamp', JSON.stringify(artist()), 'invalid'],
    ['before the daily refresh cutoff', JSON.stringify(artist()), String(new Date(2026, 9, 24, 0, 59, 59).getTime())]
  ])('replaces %s through catalog fallback and persists the recovered artist', async (_reason, value, timestamp) => {
    const f = setup();
    f.items.set('user-a_artist_artist-a', value!);
    if (timestamp !== null) f.items.set('user-a_artist_artist-a_lastUpdated', timestamp!);
    f.cloud.loadArtistById.mockResolvedValue(artist('artist-a', 'Recovered catalog artist'));
    f.params.next({id: 'artist-a'});
    await loaded(f.controller);
    expect(f.controller.artist.name).toBe('Recovered catalog artist');
    expect(JSON.parse(f.items.get('user-a_artist_artist-a')!)).toEqual(f.controller.artist);
    expect(f.items.get('user-a_artist_artist-a_lastUpdated')).toBe(String(Date.now()));
    expect(f.spotify.getSingleArtist).not.toHaveBeenCalled();
  });

  it('keeps yesterday’s post-cutoff cache valid before today’s 01:00 refresh', async () => {
    vi.setSystemTime(new Date(2026, 9, 24, 0, 30));
    const f = setup();
    f.items.set('user-a_artist_artist-a', JSON.stringify(artist()));
    f.items.set('user-a_artist_artist-a_lastUpdated', String(new Date(2026, 9, 23, 1).getTime()));
    f.params.next({id: 'artist-a'});
    await loaded(f.controller);
    expect(f.controller.artist).toEqual(artist());
    expect(f.cloud.loadArtistById).not.toHaveBeenCalled();
  });

  it('uses an artist from the originating playlist cache before cloud or Spotify', async () => {
    const f = setup({playlistId: 'playlist-a', backup: true});
    f.items.set('user-a_playlist-a', JSON.stringify([artist('artist-b'), artist()]));
    f.params.next({id: 'artist-a'});
    await loaded(f.controller);
    expect(f.controller.artist).toEqual(artist());
    expect(f.storage.restoreItemsFromCloud).not.toHaveBeenCalled();
    expect(f.cloud.loadArtistById).not.toHaveBeenCalled();
    expect(f.spotify.getSingleArtist).not.toHaveBeenCalled();
  });

  it.each(['{', '{}', JSON.stringify([artist('artist-b')])])('recovers from an unusable playlist cache %s', async value => {
    const f = setup({playlistId: 'playlist-a'});
    f.items.set('user-a_playlist-a', value);
    f.params.next({id: 'artist-a'});
    await loaded(f.controller);
    expect(f.controller.artist).toEqual(artist());
    expect(f.spotify.getSingleArtist).toHaveBeenCalledWith('artist-a');
  });

  it('uses a valid restored backup before reading the remote catalog', async () => {
    const f = setup({backup: true});
    f.storage.restoreItemsFromCloud.mockImplementation(async () => {
      f.items.set('user-a_artist_artist-a', JSON.stringify(artist()));
      f.items.set('user-a_artist_artist-a_lastUpdated', String(Date.now()));
    });
    f.params.next({id: 'artist-a'});
    await loaded(f.controller);
    expect(f.controller.artist).toEqual(artist());
    expect(f.storage.restoreItemsFromCloud).toHaveBeenCalledWith(
      ['user-a_artist_artist-a', 'user-a_artist_artist-a_lastUpdated'], expect.any(Function));
    expect(f.cloud.loadArtistById).not.toHaveBeenCalled();
  });

  it('keeps Spotify data usable when optional backup persistence fails', async () => {
    const f = setup({backup: true});
    f.cloud.syncArtists.mockRejectedValue(new Error('isolated backup unavailable'));
    f.params.next({id: 'artist-a'});
    await loaded(f.controller);
    expect(f.controller.artist).toEqual(artist());
    expect(f.controller.artistLoadError).toBe('');
    expect(f.cloud.syncArtists).toHaveBeenCalledWith([artist()]);
    expect(JSON.parse(f.items.get('user-a_artist_artist-a')!)).toEqual(artist());
  });

  it('exposes Spotify failure and recovers through the public retry without caching the failure', async () => {
    const f = setup();
    f.spotify.getSingleArtist.mockReturnValueOnce(throwError(() => new Error('isolated Spotify failure')));
    f.params.next({id: 'artist-a'});
    await loaded(f.controller);
    expect(f.controller.artistLoadError).toBe('Artist details could not be loaded.');
    expect(f.controller.artist).toEqual({});
    expect(f.storage.setItem).not.toHaveBeenCalled();
    await f.controller.loadArtistDetails('artist-a');
    expect(f.controller.artist).toEqual(artist());
    expect(f.controller.artistLoadError).toBe('');
    expect(f.spotify.getSingleArtist).toHaveBeenCalledTimes(2);
  });

  it('does not read another account’s cache and uses the anonymous namespace without an account', async () => {
    const f = setup({userId: ''});
    f.items.set('user-a_artist_artist-a', JSON.stringify(artist('artist-a', 'Other account')));
    f.items.set('user-a_artist_artist-a_lastUpdated', String(Date.now()));
    f.params.next({id: 'artist-a'});
    await loaded(f.controller);
    expect(f.controller.artist.name).toBe('Artist A');
    expect(f.storage.hydrateItems).toHaveBeenCalledWith(['anonymous_artist_artist-a']);
    expect(f.items.has('anonymous_artist_artist-a')).toBe(true);
    expect(JSON.parse(f.items.get('user-a_artist_artist-a')!).name).toBe('Other account');
  });

  it('ignores a late hydration after navigating to a different artist', async () => {
    const f = setup();
    const pending = deferred<void>();
    f.storage.hydrateItems.mockReturnValueOnce(pending.promise);
    f.spotify.getSingleArtist.mockImplementation(id => of(artist(id)));
    f.params.next({id: 'artist-a'});
    f.params.next({id: 'artist-b'});
    await loaded(f.controller);
    pending.resolve();
    await pending.promise;
    await Promise.resolve();
    expect(f.controller.artist.id).toBe('artist-b');
    expect(f.cloud.loadArtistById).toHaveBeenCalledExactlyOnceWith('artist-b');
    expect(f.items.has('user-a_artist_artist-a')).toBe(false);
  });

  it('does not let a late Spotify result overwrite the new artist or persist stale metadata', async () => {
    const f = setup();
    const oldResponse = new Subject<ReturnType<typeof artist>>();
    f.spotify.getSingleArtist.mockImplementation(id => id === 'artist-a' ? oldResponse : of(artist(id)));
    f.params.next({id: 'artist-a'});
    await vi.waitFor(() => expect(f.spotify.getSingleArtist).toHaveBeenCalledWith('artist-a'));
    f.params.next({id: 'artist-b'});
    await loaded(f.controller);
    oldResponse.next(artist());
    oldResponse.complete();
    await Promise.resolve();
    expect(f.controller.artist.id).toBe('artist-b');
    expect(f.items.has('user-a_artist_artist-a')).toBe(false);
  });

  it('invalidates pending backup restoration and unsubscribes from route changes on teardown', async () => {
    const f = setup({backup: true});
    const restore = deferred<void>();
    f.storage.restoreItemsFromCloud.mockReturnValue(restore.promise);
    f.params.next({id: 'artist-a'});
    await vi.waitFor(() => expect(f.storage.restoreItemsFromCloud).toHaveBeenCalledOnce());
    const isCurrent = f.storage.restoreItemsFromCloud.mock.calls[0][1];
    expect(isCurrent()).toBe(true);
    f.controller.ngOnDestroy();
    expect(isCurrent()).toBe(false);
    restore.resolve();
    await restore.promise;
    f.params.next({id: 'artist-b'});
    await Promise.resolve();
    expect(f.cloud.loadArtistById).not.toHaveBeenCalled();
    expect(f.spotify.getSingleArtist).not.toHaveBeenCalled();
    expect(f.storage.setItem).not.toHaveBeenCalled();
    expect(f.controller.artist).toEqual({});
  });

  it.each(['catalog', 'hydration', 'backup'] as const)('settles loading with recoverable feedback when %s rejects a retry', async boundary => {
    const f = setup({backup: boundary === 'backup'});
    f.params.next({id: 'artist-a'});
    await loaded(f.controller);
    f.items.clear();
    const failure = new Error(`isolated ${boundary} transport failure`);
    if (boundary === 'catalog') f.cloud.loadArtistById.mockRejectedValueOnce(failure);
    if (boundary === 'hydration') f.storage.hydrateItems.mockRejectedValueOnce(failure);
    if (boundary === 'backup') f.storage.restoreItemsFromCloud.mockRejectedValueOnce(failure);
    // Observe the public retry's settlement without allowing an unhandled rejection
    // to obscure the actual user-visible failure contract.
    await f.controller.loadArtistDetails('artist-a').catch(() => undefined);
    expect(f.controller.isLoadingArtist).toBe(false);
    expect(f.controller.artistLoadError).not.toBe('');
    expect(f.controller.artist).toEqual(artist());
    await f.controller.loadArtistDetails('artist-a');
    expect(f.controller.isLoadingArtist).toBe(false);
    expect(f.controller.artistLoadError).toBe('');
    expect(f.controller.artist).toEqual(artist());
  });


  it('ignores an old catalog failure after a new route has finished loading', async () => {
    const f = setup();
    f.params.next({id: 'artist-a'});
    await loaded(f.controller);
    f.items.clear();
    const oldCatalog = deferred<ReturnType<typeof artist> | null>();
    f.cloud.loadArtistById.mockReturnValueOnce(oldCatalog.promise);
    const retry = f.controller.loadArtistDetails('artist-a');
    await vi.waitFor(() => expect(f.cloud.loadArtistById).toHaveBeenCalledTimes(2));
    f.spotify.getSingleArtist.mockImplementation(id => of(artist(id)));
    f.params.next({id: 'artist-b'});
    await loaded(f.controller);
    oldCatalog.reject(new Error('old request failed'));
    await retry;
    expect(f.controller.artist.id).toBe('artist-b');
    expect(f.controller.isLoadingArtist).toBe(false);
    expect(f.controller.artistLoadError).toBe('');
    expect(f.items.has('user-a_artist_artist-a')).toBe(false);
  });


  it('discards held Spotify data after an account switch and can retry for the replacement account', async () => {
    const f = setup();
    const oldResponse = new Subject<ReturnType<typeof artist>>();
    f.spotify.getSingleArtist.mockReturnValueOnce(oldResponse);
    f.params.next({id: 'artist-a'});
    await vi.waitFor(() => expect(f.spotify.getSingleArtist).toHaveBeenCalledOnce());
    f.auth.getUserId.mockReturnValue('user-b');
    f.items.clear(); // The account boundary cleared the outgoing account's storage.
    oldResponse.next(artist('artist-a', 'Outgoing account response'));
    oldResponse.complete();
    await Promise.resolve();
    expect(f.controller.artist).toEqual({});
    expect(f.storage.setItem).not.toHaveBeenCalled();
    expect(f.items.size).toBe(0);
    f.spotify.getSingleArtist.mockReturnValue(of(artist('artist-a', 'Replacement account response')));
    await f.controller.loadArtistDetails('artist-a');
    expect(f.controller.artist.name).toBe('Replacement account response');
    expect(f.controller.isLoadingArtist).toBe(false);
    expect(f.controller.artistLoadError).toBe('');
    expect(f.items.has('user-a_artist_artist-a')).toBe(false);
    expect(JSON.parse(f.items.get('user-b_artist_artist-a')!).name).toBe('Replacement account response');
  });

});
