import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {provideHttpClient} from '@angular/common/http';
import {HttpTestingController, provideHttpClientTesting} from '@angular/common/http/testing';
import {environment} from '@env/environment';
import {StorageService} from '@core/data-access/storage/storage.service';
import {ParticipantSpotifyService, parsePublicSpotifyPlaylistReference} from './participant-spotify.service';
import {TRANSIENT_SPOTIFY_REQUEST} from './spotify-request-context';
import {CompareTrack} from './compare-room.models';

const playlistId = '37i9dQZF1DXcBWIGoYBM5M';
const song = (id = 'a'): CompareTrack => ({id, uri: `spotify:track:${id}`, name: id, artists: [{id: 'artist', name: 'Artist'}], albumName: '', imageUrl: '', spotifyUrl: '', playlistIndex: 1});
const raw = (id = 'a'): any => ({id, name: id, artists: [{id: 'artist', name: 'Artist'}]});
let service: ParticipantSpotifyService;
let http: HttpTestingController;
let disk: Map<string, string>;
const request = (path: string) => http.expectOne(environment.spotifyUrl + path);
const flush = async (path: string, body: any) => {const r = request(path); r.flush(body); await vi.advanceTimersByTimeAsync(0); return r;};
const operation = {accountId: 'account-a', operationId: 'proposal-a', fingerprint: 'content-a'};
const discovery = '/me/playlists?limit=50&offset=0';
beforeEach(() => {
  vi.useFakeTimers();
  disk = new Map();
  TestBed.configureTestingModule({providers: [provideHttpClient(), provideHttpClientTesting(), ParticipantSpotifyService,
    {provide: StorageService, useValue: {getItem: (key: string) => disk.get(key) ?? null, setItem: (key: string, value: string) => disk.set(key, value)}}]});
  service = TestBed.inject(ParticipantSpotifyService);
  http = TestBed.inject(HttpTestingController);
});
afterEach(() => {http.verify(); vi.useRealTimers(); TestBed.resetTestingModule();});

async function createSeed(id = 'saved') {
  const result = service.createPlaylist('fixture-token', 'Name', 'Description', [song()], operation);
  await flush(discovery, {items: [], total: 0});
  await flush('/me/playlists', {id, external_urls: {spotify: `https://open.spotify.com/playlist/${id}`}});
  await flush(`/playlists/${id}/items`, {});
  return result;
}

describe('Participant Spotify public inputs and read contracts', () => {
  it('rejects malformed playlist authority, fragments, ports, credentials and encoded paths', () => {
    for (const value of ['garbage', '', `https://open.spotify.com:444/playlist/${playlistId}`, `https://open.spotify.com/playlist/${playlistId}#x`, `https://user:secret@open.spotify.com/playlist/${playlistId}`, `https://open.spotify.com/playlist/%2f${playlistId}`, `https://open.spotify.com/playlist/short`, `https://open.spotify.com.evil/playlist/${playlistId}`]) expect(() => parsePublicSpotifyPlaylistReference(value)).toThrow();
    expect(parsePublicSpotifyPlaylistReference(`  spotify:playlist:${playlistId}  `)).toBe(playlistId);
  });

  for (const status of [403, 404, 500]) {
    it(`reports public-playlist transport denial ${status} without exposing a mutable playlist`, async () => {
      const pending = service.getPublicPlaylist(`spotify:playlist:${playlistId}`, 'fixture-token');
      const rejection = expect(pending).rejects.toThrow(status === 500 ? 'service unavailable' : 'private, deleted, or unavailable');
      http.expectOne(r => r.url.includes(`/playlists/${playlistId}?`)).flush({error: {message: 'service unavailable'}}, {status, statusText: 'Fixture failure'});
      await rejection;
    });
  }

  for (const invalid of [{id: 'wrong', type: 'playlist', public: true}, {id: playlistId, type: 'album', public: true}, {id: playlistId, type: 'playlist'}, null]) {
    it(`rejects invalid public metadata ${JSON.stringify(invalid)}`, async () => {
      const pending = service.getPublicPlaylist(`spotify:playlist:${playlistId}`, 'fixture-token');
      const rejected = expect(pending).rejects.toThrow('not public');
      http.expectOne(r => r.url.includes(`/playlists/${playlistId}?`)).flush(invalid);
      await rejected;
    });
  }

  it('normalizes sparse public metadata with a canonical fallback destination', async () => {
    const pending = service.getPublicPlaylist(`spotify:playlist:${playlistId}`, 'fixture-token');
    http.expectOne(r => r.url.includes(`/playlists/${playlistId}?`)).flush({id: playlistId, type: 'playlist', public: true});
    expect(await pending).toEqual({id: playlistId, name: 'Untitled playlist', description: '', imageUrl: '', total: 0, ownerName: '', snapshotId: undefined, isPublicLink: true, spotifyUrl: `https://open.spotify.com/playlist/${playlistId}`});
  });

  it('uses isolated participant request context and credentials for profile requests', async () => {
    const pending = service.getProfile('transient-fixture');
    const r = request('/me');
    expect(r.request.context.get(TRANSIENT_SPOTIFY_REQUEST)).toBe(true);
    expect(r.request.headers.get('Authorization')).toBe('Bearer transient-fixture');
    expect(r.request.headers.get('Accept-Language')).toBe('en-GB,en-US;q=0.9,en;q=0.8');
    r.flush({id: 'participant'});
    expect(await pending).toEqual({id: 'participant'});
    expect(disk.size).toBe(0);
  });

  it('paginates own/collaborative playlists by received rows and stops on an empty page', async () => {
    const pending = service.getPlaylists('fixture-token', 'owner');
    await flush(discovery, {total: 50, items: [null, {id: 'owned', owner: {id: 'owner'}}, {id: 'collab', collaborative: true, tracks: {total: 7}}]});
    await flush('/me/playlists?limit=50&offset=3', {total: 50, items: []});
    expect((await pending).map(p => [p.id, p.total])).toEqual([['fav', 0], ['owned', 0], ['collab', 7]]);
  });

  it('treats malformed playlist page items and missing totals as an empty owned source', async () => {
    const pending = service.getPlaylists('fixture-token', 'owner');
    await flush(discovery, {items: {}, total: 'unknown'});
    expect((await pending).map(p => p.id)).toEqual(['fav']);
  });

  it('reads Liked Songs, skips unavailable/episode/incomplete rows and preserves source order after deduplication', async () => {
    const pending = service.getPlaylistTracks({id: 'fav', isLikedSongs: true} as any, 'fixture-token');
    await flush('/me/tracks?limit=50&offset=0', {total: 9, items: [null, {track: {id: 'podcast', type: 'episode'}}, {track: {id: 'unnamed', artists: [{id: 'a', name: 'Artist'}]}}, {track: {id: 'artistless', name: 'Missing artist', artists: [null, {id: 'a'}, {name: 'Artist'}]}}, {track: {...raw('a'), explicit: true, duration_ms: 123, playlist_index: 8, uri: 'spotify:track:a', album: {name: 'Album', release_date: '2020-01-01', images: [{url: 'cover'}]}, external_urls: {spotify: 'https://open.spotify.com/track/a'}}}, {item: raw('a')}, {track: raw('b')}]});
    await flush('/me/tracks?limit=50&offset=7', {items: []});
    expect(await pending).toEqual([{...song('a'), albumName: 'Album', imageUrl: 'cover', spotifyUrl: 'https://open.spotify.com/track/a', playlistIndex: 8, durationMs: 123, explicit: true, releaseDate: '2020-01-01'}, {...song('b'), playlistIndex: 7, durationMs: 0, explicit: false, releaseDate: ''}]);
  });

  it('normalizes persistent cache rows, sorts by playlist position and retains first duplicate', () => {
    expect(service.normalizeCachedTracks([null, {}, {tracks: [null, {id: 'episode', type: 'episode'}, {...raw('b'), playlist_index: 5}, {...raw('a'), playlist_index: 2}, {...raw('a'), playlist_index: 9}]}]).map(t => [t.id, t.playlistIndex, t.uri])).toEqual([['a', 2, 'spotify:track:a'], ['b', 5, 'spotify:track:b']]);
    expect(service.normalizeCachedPlaylists([{id: 'fav', tracks: {total: '3'}}, {id: 'normal', owner: {id: 'owner'}, tracks: {total: '5'}, snapshot_id: 'version'}]).map(p => [p.id, p.total, p.ownerName])).toEqual([['fav', 3, 'Spotify'], ['normal', 5, 'owner']]);
  });

  it('returns no tracks when pagination items are malformed', async () => {
    const pending = service.getPlaylistTracks({id: 'p'} as any, 'fixture-token');
    await flush('/playlists/p/items?limit=50&offset=0', {items: null});
    expect(await pending).toEqual([]);
  });

  it('retries429 only after Retry-After and stops after three retries', async () => {
    const pending = service.getProfile('fixture-token');
    const rejected = expect(pending).rejects.toMatchObject({status: 429});
    for (let i = 0; i < 4; i++) {
      request('/me').flush({message: 'slow down'}, {status: 429, statusText: 'Too Many Requests', headers: {'Retry-After': '1'}});
      await vi.advanceTimersByTimeAsync(999);
      http.expectNone(environment.spotifyUrl + '/me');
      await vi.advanceTimersByTimeAsync(1);
    }
    await rejected;
  });

  it('uses a two-second default429 cooldown, then succeeds', async () => {
    const pending = service.getProfile('fixture-token');
    request('/me').flush({}, {status: 429, statusText: 'Limited'});
    await vi.advanceTimersByTimeAsync(1999);
    http.expectNone(environment.spotifyUrl + '/me');
    await vi.advanceTimersByTimeAsync(1);
    await flush('/me', {id: 'participant'});
    expect(await pending).toEqual({id: 'participant'});
  });
});

describe('Participant playlist save/recovery public contracts', () => {
  it('resolves account identity, creates privately with bounded marked description and clears an empty result', async () => {
    const pending = service.createPlaylist('fixture-token', 'Name', ' '.repeat(2) + 'D'.repeat(400), []);
    await flush('/me', {id: 'account-a'});
    await flush(discovery, {items: []});
    const create = request('/me/playlists');
    expect(create.request.body.description).toHaveLength(300);
    expect(create.request.body.public).toBe(false);
    create.flush({id: 'empty'});
    await vi.advanceTimersByTimeAsync(0);
    const replace = request('/playlists/empty/items');
    expect(replace.request.body).toEqual({uris: []});
    replace.flush({});
    expect(await pending).toMatchObject({success: true, playlistId: 'empty', addedTracks: 0});
  });

  it('rejects missing account identity before creating anything', async () => {
    const pending = service.createPlaylist('fixture-token', 'Name', '', []);
    await flush('/me', {});
    expect(await pending).toMatchObject({success: false, error: 'Spotify did not return an account ID.'});
    http.expectNone(environment.spotifyUrl + '/me/playlists');
  });

  it('rejects an invalid create response without writing result items', async () => {
    const pending = service.createPlaylist('fixture-token', 'Name', '', [], operation);
    await flush(discovery, {items: []});
    await flush('/me/playlists', {});
    expect(await pending).toMatchObject({success: false, error: 'Spotify did not return a playlist ID.'});
    expect(disk.size).toBe(0);
  });

  it('rejects reuse of a content operation with a different fingerprint without changing the saved playlist', async () => {
    await createSeed();
    const before = [...disk];
    const result = await service.createPlaylist('fixture-token', 'Other name', 'Other description', [song('different')], {...operation, fingerprint: 'different-content'});
    expect(result).toMatchObject({success: false, error: 'This playlist operation ID is already associated with different content.'});
    expect([...disk]).toEqual(before);
  });

  for (const serialized of ['broken-json', '{}', '[null,{}, {"operationId":2,"playlistId":"invalid","fingerprint":"x"}]']) {
    it(`recovers invalid disk mappings ${serialized} by normal owned discovery`, async () => {
      // A storage transport may contain invalid retained JSON; its key is obtained
      // from a successful public operation, without calling private mapping code.
      await createSeed();
      const key = [...disk.keys()].find(k => k.startsWith('compare_playlist_operations_'))!;
      disk.set(key, serialized);
      const pending = service.createPlaylist('fixture-token', 'Name', '', [song()], operation);
      await flush(discovery, {items: [], total: 0});
      await flush('/me/playlists', {id: 'replacement'});
      await flush('/playlists/replacement/items', {});
      expect(await pending).toMatchObject({success: true, playlistId: 'replacement'});
      expect(JSON.parse(disk.get(key)!)).toHaveLength(1);
    });
  }

  for (const discovered of [false, true]) {
    it(`recovers a deleted saved playlist using ${discovered ? 'owned rediscovery' : 'one private recreation'}`, async () => {
      const seed = await createSeed();
      const marker = `[Analytify operation:${seed.operationId}]`;
      const pending = service.createPlaylist('fixture-token', 'Name', 'Description', [song()], operation);
      request('/playlists/saved/items').flush({}, {status: 404, statusText: 'Not Found'});
      await vi.advanceTimersByTimeAsync(0);
      await flush(discovery, {items: [{id: 'saved', owner: {id: 'account-a'}, description: marker}, {id: 'other-owner', owner: {id: 'someone-else'}, description: marker}, ...(discovered ? [{id: 'recovered', owner: {id: 'account-a'}, description: marker}] : [])], total: discovered ? 3 : 2});
      if (!discovered) await flush('/me/playlists', {id: 'recovered'});
      await flush('/playlists/recovered/items', {});
      expect(await pending).toMatchObject({success: true, playlistId: 'recovered', recovery: {source: discovered ? 'spotify-discovery' : 'stale-mapping-recreated', stalePlaylistId: 'saved'}});
    });
  }

  it('records completed batch count on append failure and never retries a permission denial', async () => {
    const pending = service.syncPlaylist('fixture-token', 'saved', null, 'Name', '', Array.from({length: 101}, (_, i) => song(String(i))));
    await flush('/playlists/saved', null);
    await flush('/playlists/saved/items', {});
    request('/playlists/saved/items').flush({error: {message: 'Not permitted'}}, {status: 403, statusText: 'Denied'});
    expect(await pending).toMatchObject({success: false, playlistId: 'saved', addedTracks: 100, error: 'Not permitted'});
  });

  it('cancels a rate-limited metadata retry before any repeated mutation', async () => {
    const controller = new AbortController();
    const pending = service.syncPlaylist('fixture-token', 'saved', null, 'Name', '', [song()], controller.signal);
    request('/playlists/saved').flush({}, {status: 429, statusText: 'Limited', headers: {'Retry-After': '5'}});
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toMatchObject({success: false, addedTracks: 0});
  });

  it('creates an unassociated sync result privately and rejects missing IDs', async () => {
    const pending = service.syncPlaylist('fixture-token', null, null, 'Name', '', []);
    const create = request('/me/playlists');
    expect(create.request.body).toEqual({name: 'Name', description: '', public: false});
    create.flush({});
    expect(await pending).toMatchObject({success: false, error: 'Spotify did not return a playlist ID.'});
  });

  it('returns the HTTP status fallback when Spotify supplies no error detail', async () => {
    const pending = service.syncPlaylist('fixture-token', 'saved', null, 'Name', '', []);
    request('/playlists/saved').flush({}, {status: 500, statusText: 'Failure'});
    expect(await pending).toMatchObject({success: false, error: 'Spotify returned 500.'});
  });
});


describe('Participant sync operation and metadata recovery boundaries', () => {
  it('creates a new associated sync result privately and reuses its metadata on later revisions', async () => {
    const pending = service.syncPlaylist('fixture-token', null, null, 'Name', '', [song()], undefined, operation);
    await flush(discovery, {items: [], total: 0});
    const create = request('/me/playlists');
    expect(create.request.body.description).toMatch(/^\[Analytify operation:[0-9a-f]{16}\]$/);
    create.flush({id: 'synced', external_urls: {spotify: 'https://open.spotify.com/playlist/synced'}});
    await vi.advanceTimersByTimeAsync(0);
    await flush('/playlists/synced/items', {});
    expect(await pending).toMatchObject({success: true, playlistId: 'synced', recovery: {source: 'created', recovered: false}});
    const next = service.syncPlaylist('fixture-token', 'synced', null, 'Name', '', [], undefined, operation);
    const replace = request('/playlists/synced/items');
    expect(replace.request.body.uris).toEqual([]);
    replace.flush({});
    expect(await next).toMatchObject({success: true, addedTracks: 0});
    http.expectNone(environment.spotifyUrl + '/playlists/synced');
  });

  it('rediscovers owned operation results on a later page rather than using a matching other-owner playlist', async () => {
    const seed = await createSeed();
    disk.clear();
    const pending = service.syncPlaylist('fixture-token', null, null, 'Name', 'Description', [song()], undefined, operation);
    const marker = `[Analytify operation:${seed.operationId}]`;
    await flush(discovery, {items: [{id: 'wrong-owner', description: marker, owner: {id: 'someone-else'}}], total: 2});
    await flush('/me/playlists?limit=50&offset=1', {items: [{id: 'rediscovered', description: marker, owner: {id: 'account-a'}, external_urls: {spotify: 'rediscovered-url'}}], total: 2});
    await flush('/playlists/rediscovered', null);
    await flush('/playlists/rediscovered/items', {});
    expect(await pending).toMatchObject({success: true, playlistId: 'rediscovered', playlistUrl: 'rediscovered-url', recovery: {source: 'spotify-discovery', recovered: true}});
  });

  it('refuses a changed operation fingerprint when syncing from a local mapping', async () => {
    await createSeed();
    const result = await service.syncPlaylist('fixture-token', null, null, 'Name', '', [song()], undefined, {...operation, fingerprint: 'changed'});
    expect(result).toMatchObject({success: false, error: 'This playlist operation ID is already associated with different content.'});
  });

  for (const failureStage of ['metadata', 'items'] as const) {
    for (const found of [true, false]) {
      it(`recovers stale sync mapping at ${failureStage} through ${found ? 'owned discovery' : 'private recreation'}`, async () => {
        const seed = await createSeed();
        const pending = service.syncPlaylist('fixture-token', null, null, 'Name', 'Description', [song()], undefined, operation);
        if (failureStage === 'items') await flush('/playlists/saved', null);
        request(failureStage === 'metadata' ? '/playlists/saved' : '/playlists/saved/items').flush({}, {status: 404, statusText: 'Gone'});
        await vi.advanceTimersByTimeAsync(0);
        await flush(discovery, {items: found ? [{id: 'replacement', owner: {id: 'account-a'}, description: `[Analytify operation:${seed.operationId}]`}] : [], total: found ? 1 : 0});
        if (!found) await flush('/me/playlists', {id: 'replacement', external_urls: {spotify: 'replacement-url'}});
        await flush('/playlists/replacement/items', {});
        expect(await pending).toMatchObject({success: true, playlistId: 'replacement', recovery: {source: found ? 'spotify-discovery' : 'stale-mapping-recreated', stalePlaylistId: 'saved'}});
      });
    }
  }

  it('returns a404 instead of recreating a non-operation existing playlist', async () => {
    const pending = service.syncPlaylist('fixture-token', 'external', null, 'Name', '', []);
    request('/playlists/external').flush({message: 'Missing playlist'}, {status: 404, statusText: 'Gone'});
    expect(await pending).toMatchObject({success: false, playlistId: 'external', error: 'Missing playlist'});
  });

  it('cancels a pending create mutation without publishing operation mappings', async () => {
    const controller = new AbortController();
    const pending = service.syncPlaylist('fixture-token', null, null, 'Name', '', [], controller.signal);
    const create = request('/me/playlists');
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(create.cancelled).toBe(true);
    expect(await pending).toMatchObject({success: false, addedTracks: 0});
    expect(disk.size).toBe(0);
  });
});


describe('Participant mutation retry and sparse payload boundaries', () => {
  it('retries a rate-limited private create and replacement with the original content and stable fingerprint', async () => {
    const pending = service.createPlaylist('fixture-token', 'Name', '', [song()]);
    await flush('/me', {id: 'account-a'});
    await flush(discovery, {items: null});
    const firstCreate = request('/me/playlists');
    const original = firstCreate.request.body;
    firstCreate.flush({}, {status: 429, statusText: 'Limited', headers: {'Retry-After': '1'}});
    await vi.advanceTimersByTimeAsync(1000);
    const retryCreate = request('/me/playlists');
    expect(retryCreate.request.body).toEqual(original);
    retryCreate.flush({id: 'saved'});
    await vi.advanceTimersByTimeAsync(0);
    request('/playlists/saved/items').flush({}, {status: 429, statusText: 'Limited', headers: {'Retry-After': '1'}});
    await vi.advanceTimersByTimeAsync(1000);
    const retryReplace = request('/playlists/saved/items');
    expect(retryReplace.request.body.uris).toEqual(['spotify:track:a']);
    retryReplace.flush({});
    expect(await pending).toMatchObject({success: true, playlistId: 'saved', addedTracks: 1, operationFingerprint: expect.any(String)});
  });

  it('creates a non-operation sync playlist and remembers metadata for the next revision', async () => {
    const pending = service.syncPlaylist('fixture-token', null, null, 'Name', '', []);
    await flush('/me/playlists', {id: 'plain'});
    await flush('/playlists/plain/items', {});
    expect(await pending).toMatchObject({success: true, playlistId: 'plain', addedTracks: 0});
    const again = service.syncPlaylist('fixture-token', 'plain', null, 'Name', '', []);
    await flush('/playlists/plain/items', {});
    expect(await again).toMatchObject({success: true, playlistId: 'plain'});
  });

  it('normalizes an empty cached Liked Songs count and skips artistless cached tracks', () => {
    expect(service.normalizeCachedPlaylists([{id: 'fav'}])[0].total).toBe(0);
    expect(service.normalizeCachedTracks([{tracks: [{id: 'no-artists', name: 'No artists'}]}])).toEqual([]);
  });


});
