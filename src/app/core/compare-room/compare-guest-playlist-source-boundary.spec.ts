import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {CompareGuestPlaylistSourceService} from './compare-guest-playlist-source.service';
import {ComparePlaylist} from './compare-room.models';
import {TRANSIENT_SPOTIFY_REQUEST} from './spotify-request-context';

describe('Guest comparison source through actual Spotify HTTP and normalization', () => {
  let source: CompareGuestPlaylistSourceService;
  let http: HttpTestingController;
  let values: Map<string, string>;
  let storage: any;
  let cloud: any;
  const api = 'https://api.spotify.com/v1';
  const list = (id = 'mix', total = 1): ComparePlaylist => ({id, name: id, total, imageUrl: '', ownerName: 'Guest'});
  const song = (id: string) => ({id, name: `Song ${id}`, artists: [{id: 'artist', name: 'Artist'}]});
  const cached = (ids = ['cached']) => JSON.stringify([{tracks: ids.map(song)}]);
  beforeEach(() => {
    vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(new Date(2026, 9, 23, 12));
    values = new Map();
    storage = {initFromDB: vi.fn().mockResolvedValue(undefined), hydrateItems: vi.fn().mockResolvedValue(undefined),
      getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn(), removeItem: vi.fn()};
    cloud = {getClient: vi.fn(async () => ({auth: {getSession: async () => ({data: {session: null}})}})),
      loadUserProfile: vi.fn().mockResolvedValue(null), checkBackupActive: vi.fn().mockResolvedValue(false), loadUserCache: vi.fn().mockResolvedValue([])};
    TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting(),
      {provide: StorageService, useValue: storage}, {provide: SupabaseService, useValue: cloud}]});
    source = TestBed.inject(CompareGuestPlaylistSourceService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {http.verify(); expect(storage.setItem).not.toHaveBeenCalled(); expect(storage.removeItem).not.toHaveBeenCalled(); vi.useRealTimers(); vi.restoreAllMocks();});
  function local(id = 'guest') {values.set('spotifyUserId', id);}
  function cloudIdentity(profile: any = {verified_spotify_id: 'guest'}, metadata: any = {provider_id: 'guest'}, active = true) {
    cloud.getClient.mockResolvedValue({auth: {getSession: async () => ({data: {session: {user: {id: 'cloud-guest', user_metadata: metadata}}}})}});
    cloud.loadUserProfile.mockResolvedValue(profile); cloud.checkBackupActive.mockResolvedValue(active);
  }
  function localTracks(raw = cached(), count: string | null = '1', timestamp: string | null = String(Date.now()), id = 'mix') {
    values.set(`guest_${id}`, raw);
    if (count !== null) values.set(`guest_${id}_CachedTrackCount`, count);
    if (timestamp !== null) values.set(`guest_${id}_lastUpdated`, timestamp);
  }
  async function request(path: string) {
    return vi.waitFor(() => {
      const match = http.match(api + path); expect(match).toHaveLength(1);
      expect(match[0].request.headers.get('Authorization')).toBe('Bearer guest-token');
      expect(match[0].request.context.get(TRANSIENT_SPOTIFY_REQUEST)).toBe(true);
      return match[0];
    });
  }
  async function deny(path: string) {(await request(path)).flush({error: {message: 'isolated denied'}}, {status: 403, statusText: 'Forbidden'});}

  it('paginates authorized playlists and retains owned/collaborative choices plus Liked Songs without fetching its count', async () => {
    const pending = source.loadPlaylists('guest-token', 'guest');
    (await request('/me/playlists?limit=50&offset=0')).flush({items: [{id: 'owned', owner: {id: 'guest'}, name: 'Owned'}, {id: 'foreign', owner: {id: 'host'}}], total: 3});
    (await request('/me/playlists?limit=50&offset=2')).flush({items: [{id: 'shared', owner: {id: 'friend'}, collaborative: true, name: 'Shared'}], total: 3});
    const result = await pending;
    expect(result.source).toBe('spotify'); expect(result.playlists.map(item => item.id)).toEqual(['fav', 'owned', 'shared']);
    expect(result.playlists[0]).toMatchObject({isLikedSongs: true, total: 0});
    http.expectNone(api + '/me/tracks?limit=1');
    expect(cloud.loadUserCache).not.toHaveBeenCalled();
  });

  it('fetches paginated Liked Songs using the transient guest token and removes episodes/duplicates', async () => {
    const pending = source.loadTracks({...list('fav'), isLikedSongs: true}, 'guest-token', 'guest');
    (await request('/me/tracks?limit=50&offset=0')).flush({items: [{track: song('a')}, {track: {...song('episode'), type: 'episode'}}], total: 4});
    (await request('/me/tracks?limit=50&offset=2')).flush({items: [{track: song('a')}, {item: song('b')}], total: 4});
    expect((await pending).tracks.map(item => [item.id, item.playlistIndex])).toEqual([['a', 1], ['b', 4]]);
  });

  it('uses fresh local cache belonging to the authorized profile including development suffixes', async () => {
    local('guest_dev'); values.set('guest_dev_playlists', JSON.stringify([{id: 'fav', tracks: {total: 3}}])); values.set('guest_dev_playlists_lastUpdated', String(Date.now()));
    const result = await source.loadPlaylists('guest-token', 'guest');
    expect(result.source).toBe('local'); expect(result.playlists[0]).toMatchObject({id: 'fav', isLikedSongs: true, total: 3});
    expect(storage.hydrateItems).toHaveBeenCalledWith(['guest_dev_playlists']); expect(cloud.loadUserCache).not.toHaveBeenCalled(); http.expectNone(() => true);
  });

  it.each(['{broken', '{}', '[]', '[null]'])('falls back from unusable cached playlist metadata to actual Spotify (%s)', async raw => {
    local(); values.set('guest_playlists', raw); values.set('guest_playlists_lastUpdated', String(Date.now()));
    const pending = source.loadPlaylists('guest-token', 'guest');
    (await request('/me/playlists?limit=50&offset=0')).flush({items: [], total: 0});
    expect((await pending).playlists).toMatchObject([{id: 'fav', isLikedSongs: true}]);
  });

  it('uses only the verified guest cloud identity and the requested playlist keys', async () => {
    local('host'); cloudIdentity({spotify_id: 'legacy', verified_spotify_id: 'guest_dev'}, {provider_id: 'wrong'});
    cloud.loadUserCache.mockResolvedValue([{key: 'guest_dev_playlists', value: JSON.stringify([{id: 'cloud', name: 'Cloud'}])}, {key: 'guest_dev_playlists_lastUpdated', value: String(Date.now())}]);
    const result = await source.loadPlaylists('guest-token', 'guest');
    expect(result.source).toBe('cloud'); expect(result.playlists.map(item => item.id)).toEqual(['cloud']);
    expect(cloud.checkBackupActive).toHaveBeenCalledWith('cloud-guest'); expect(cloud.loadUserCache).toHaveBeenCalledWith('cloud-guest', ['guest_dev_playlists', 'guest_dev_playlists_lastUpdated']);
  });

  it.each([null, {spotify_id: 'guest'}])('uses matching hosted metadata or legacy verified profile when no canonical verified ID exists (%j)', async profile => {
    cloudIdentity(profile); cloud.loadUserCache.mockResolvedValue([{key: 'guest_playlists', value: JSON.stringify([{id: 'cloud'}])}, {key: 'guest_playlists_lastUpdated', value: String(Date.now())}]);
    expect((await source.loadPlaylists('guest-token', 'guest')).source).toBe('cloud');
  });

  it('permits matching local cache while refusing a different hosted account cloud cache', async () => {
    local(); cloudIdentity({verified_spotify_id: 'host'}, {provider_id: 'host'});
    values.set('guest_playlists', JSON.stringify([{id: 'local'}])); values.set('guest_playlists_lastUpdated', String(Date.now()));
    expect((await source.loadPlaylists('guest-token', 'guest')).source).toBe('local');
    expect(cloud.checkBackupActive).not.toHaveBeenCalled(); expect(cloud.loadUserCache).not.toHaveBeenCalled();
  });

  it('does not read cloud data when backup consent is disabled', async () => {
    cloudIdentity(null, {provider_id: 'guest'}, false);
    const pending = source.loadPlaylists('guest-token', 'guest');
    (await request('/me/playlists?limit=50&offset=0')).flush({items: [], total: 0}); await pending;
    expect(cloud.loadUserCache).not.toHaveBeenCalled();
  });

  it('uses the server-verified guest account when hosted OAuth metadata is absent', async () => {
    cloudIdentity({verified_spotify_id: 'guest'}, null);
    cloud.loadUserCache.mockResolvedValue([{key: 'guest_playlists', value: JSON.stringify([{id: 'verified-mix'}])}, {key: 'guest_playlists_lastUpdated', value: String(Date.now())}]);
    expect(await source.loadPlaylists('guest-token', 'guest')).toMatchObject({source: 'cloud', playlists: [{id: 'verified-mix'}]});
  });

  it.each(['playlists', 'tracks'])('surfaces denied Spotify access when consented cloud backup contains no matching %s cache', async kind => {
    local(); cloudIdentity();
    const pending = kind === 'playlists' ? source.loadPlaylists('guest-token', 'guest') : source.loadTracks(list(), 'guest-token', 'guest');
    const rejected = expect(pending).rejects.toMatchObject({status: 403});
    await deny(kind === 'playlists' ? '/me/playlists?limit=50&offset=0' : '/playlists/mix/items?limit=50&offset=0'); await rejected;
    expect(cloud.loadUserCache).toHaveBeenCalledOnce();
  });

  it('reuses normalized fresh cloud tracks when an older backup omitted its cached-count metadata', async () => {
    cloudIdentity(); cloud.loadUserCache.mockResolvedValue([{key: 'guest_mix', value: cached(['cloud-without-count'])}, {key: 'guest_mix_lastUpdated', value: String(Date.now())}]);
    expect(await source.loadTracks(list(), 'guest-token', 'guest')).toMatchObject({source: 'cloud', tracks: [{id: 'cloud-without-count'}]});
    http.expectNone(() => true);
  });

  it.each(['local', 'cloud'] as const)('recovers from denied Spotify playlist reads using stale %s metadata', async origin => {
    local(); const data = JSON.stringify([{id: origin, name: 'Offline mix'}]);
    if (origin === 'local') values.set('guest_playlists', data);
    else {cloudIdentity(); cloud.loadUserCache.mockResolvedValue([{key: 'guest_playlists', value: data}]);}
    const pending = source.loadPlaylists('guest-token', 'guest'); await deny('/me/playlists?limit=50&offset=0');
    expect(await pending).toMatchObject({source: origin, playlists: [{id: origin}]});
  });

  it('propagates Spotify permission failure without returning unrelated account data', async () => {
    local('host'); values.set('host_playlists', JSON.stringify([{id: 'private-host'}]));
    const pending = source.loadPlaylists('guest-token', 'guest'); const rejected = expect(pending).rejects.toMatchObject({status: 403});
    await deny('/me/playlists?limit=50&offset=0'); await rejected;
  });

  it.each([null, '{invalid', '-1', '"1"', 'null'])('accepts a normalized nonempty local cache when stored count is unavailable/invalid (%s)', async count => {
    local(); localTracks(cached(), count);
    expect(await source.loadTracks(list(), 'guest-token', 'guest')).toMatchObject({source: 'local', tracks: [{id: 'cached', uri: 'spotify:track:cached'}]});
    http.expectNone(() => true);
  });

  it.each(['{invalid', '{}'])('rejects unusable track cache data rather than publishing it (%s)', async raw => {
    local(); localTracks(raw);
    const pending = source.loadTracks(list(), 'guest-token', 'guest');
    (await request('/playlists/mix/items?limit=50&offset=0')).flush({items: [{track: song('live')}], total: 1});
    expect(await pending).toMatchObject({source: 'spotify', tracks: [{id: 'live'}]});
  });

  it('uses an empty cache only for a known empty playlist', async () => {
    local(); localTracks('[]', '0');
    expect(await source.loadTracks(list('mix', 0), 'guest-token', 'guest')).toEqual({source: 'local', tracks: []});
  });

  it('refuses incomplete cache as a fallback after denied Spotify access', async () => {
    local(); localTracks(cached(), '2');
    const pending = source.loadTracks(list('mix', 2), 'guest-token', 'guest'); const rejected = expect(pending).rejects.toMatchObject({status: 403});
    await deny('/playlists/mix/items?limit=50&offset=0'); await rejected;
  });

  it('uses complete stale local data when cloud cache is incomplete and Spotify denies access', async () => {
    local(); localTracks(cached(['local']), '1', '1'); cloudIdentity();
    cloud.loadUserCache.mockResolvedValue([{key: 'guest_mix', value: cached(['cloud-partial'])}, {key: 'guest_mix_CachedTrackCount', value: '2'}]);
    const pending = source.loadTracks(list('mix', 2), 'guest-token', 'guest'); await deny('/playlists/mix/items?limit=50&offset=0');
    expect(await pending).toMatchObject({source: 'local', tracks: [{id: 'local'}]});
  });

  it.each([null, 'not-a-timestamp', '1'])('uses stale complete cloud tracks only after Spotify fails (%s)', async timestamp => {
    cloudIdentity(); const rows = [{key: 'guest_mix', value: cached(['cloud'])}, {key: 'guest_mix_CachedTrackCount', value: '1'}];
    if (timestamp !== null) rows.push({key: 'guest_mix_lastUpdated', value: timestamp}); cloud.loadUserCache.mockResolvedValue(rows);
    const pending = source.loadTracks(list(), 'guest-token', 'guest'); await deny('/playlists/mix/items?limit=50&offset=0');
    expect(await pending).toMatchObject({source: 'cloud', tracks: [{id: 'cloud'}]});
  });

  it.each([{now: [0, 30], updated: [22, 1], fresh: true}, {now: [1, 0], updated: [22, 23], fresh: false}, {now: [1, 0], updated: [23, 1], fresh: true}])('uses the local 01:00 refresh cutoff without expiring yesterday before midnight rollover ($now)', async ({now, updated, fresh}) => {
    vi.setSystemTime(new Date(2026, 9, 23, now[0], now[1])); local();
    localTracks(cached(), '1', String(new Date(2026, 9, updated[0], updated[1]).getTime()));
    const pending = source.loadTracks(list(), 'guest-token', 'guest');
    if (!fresh) (await request('/playlists/mix/items?limit=50&offset=0')).flush({items: [], total: 0});
    expect((await pending).source).toBe(fresh ? 'local' : 'spotify');
  });

  it('does not return a partial network selection if a later page is denied', async () => {
    const pending = source.loadSelection([list()], 'guest-token', 'guest'); const rejected = expect(pending).rejects.toMatchObject({status: 403});
    (await request('/playlists/mix/items?limit=50&offset=0')).flush({items: [{track: song('first-page')}], total: 2});
    await deny('/playlists/mix/items?limit=50&offset=1'); await rejected;
  });

  it('never falls back to account caches when a formerly public URL becomes unavailable', async () => {
    local(); localTracks();
    const pending = source.loadTracks({...list(), isPublicLink: true}, 'guest-token', 'guest'); const rejected = expect(pending).rejects.toMatchObject({status: 403});
    await deny('/playlists/mix/items?limit=50&offset=0'); await rejected;
    expect(storage.initFromDB).not.toHaveBeenCalled(); expect(cloud.getClient).not.toHaveBeenCalled();
  });

  it('combines cached selections in playlist order and reports cloud when any selected input came from cloud', async () => {
    local(); localTracks(cached(['same', 'local']), '2', String(Date.now()), 'one'); cloudIdentity();
    cloud.loadUserCache.mockResolvedValue([{key: 'guest_two', value: cached(['same', 'cloud'])}, {key: 'guest_two_CachedTrackCount', value: '2'}, {key: 'guest_two_lastUpdated', value: String(Date.now())}]);
    const result = await source.loadSelection([list('one', 2), list('two', 2)], 'guest-token', 'guest');
    expect(result.source).toBe('cloud'); expect(result.tracks.map(item => item.id)).toEqual(['same', 'local', 'cloud']);
  });

  it('returns an empty local result for no selection without requesting account data', async () => {
    expect(await source.loadSelection([], 'guest-token', 'guest')).toEqual({tracks: [], source: 'local'});
    expect(storage.initFromDB).not.toHaveBeenCalled();
  });
});
