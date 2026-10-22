import {createClient, SupabaseClient} from '@supabase/supabase-js';
import {afterEach, beforeEach, describe, expect, it, vi, type Mock} from 'vitest';
import {PlaylistSharingService} from './playlist-sharing.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {CompareTrack} from '@core/compare-room/compare-room.models';

const json = (value: unknown, status = 200, extra: Record<string, string> = {}) => new Response(JSON.stringify(value), {status, headers: {'content-type': 'application/json', ...extra}});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {resolve = done;});
  return {promise, resolve};
}
function track(id: string, index = 1): CompareTrack {
  return {id, uri: `spotify:track:${id}`, name: id, artists: [{id: 'artist', name: 'Artist'}], albumName: '', imageUrl: '', spotifyUrl: '', playlistIndex: index};
}
const share = (id = 'share', owner = 'owner', recipient: string | null = 'recipient') => ({id, owner_user_id: owner, recipient_user_id: recipient, source_playlist_id: 'source', playlist_name: 'Shared', track_count: 2, revision: 4, created_at: 'created', updated_at: 'updated'});
const publication = (tracks = [track('one')]) => ({sourcePlaylistId: 'source', playlistName: 'Published', playlistDescription: '', playlistImageUrl: '', tracks});

describe('Playlist sharing actual SDK transport boundaries', () => {
  let service: PlaylistSharingService;
  let lifecycle: SessionLifecycleService;
  let cachedActorId: string;
  let client: SupabaseClient;
  let getUser: Mock<() => Promise<any>>;
  let reply: (url: URL, init: RequestInit) => Response | Promise<Response>;
  let requests: Array<{url: URL; init: RequestInit; body: any}>;
  beforeEach(() => {
    requests = [];
    lifecycle = new SessionLifecycleService();
    cachedActorId = 'owner';
    reply = url => {throw new Error(`Unconfigured isolated request: ${url.pathname}`);};
    const fetchBoundary = async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      expect(url.origin).toBe('https://sharing.fixture.invalid');
      requests.push({url, init, body: init.body ? JSON.parse(String(init.body)) : undefined});
      return reply(url, init);
    };
    client = createClient('https://sharing.fixture.invalid', 'fixture-public-key', {auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}, global: {fetch: fetchBoundary as typeof fetch}});
    getUser = vi.fn().mockResolvedValue({data: {user: {id: 'owner'}}, error: null});
    vi.spyOn(client.auth, 'getUser').mockImplementation(() => getUser());
    vi.spyOn(client.auth, 'getSession').mockImplementation(async () => ({data: {session: {user: {id: cachedActorId}}}, error: null}) as any);
    service = new PlaylistSharingService({getClient: async () => client} as unknown as SupabaseService, lifecycle);
  });
  afterEach(() => {vi.restoreAllMocks(); vi.unstubAllGlobals();});

  it('separates owned and received rows and preserves selected revisions and existing Spotify copy mappings', async () => {
    reply = url => {
      if (url.pathname.endsWith('/playlist_shares')) return json([share('owned'), share('received', 'someone', 'owner'), share('other', 'someone', 'other')]);
      if (url.pathname.endsWith('/playlist_share_downloads')) return json([{share_id: 'received', spotify_playlist_id: 'same-copy', spotify_playlist_url: 'https://open.spotify.com/playlist/same-copy', applied_revision: 3, updated_at: 'updated'}, {share_id: 'reserved'}]);
      throw new Error('Unexpected table');
    };
    expect((await service.listOwnedShares()).map(item => item.id)).toEqual(['owned']);
    expect((await service.listReceivedShares()).map(item => item.id)).toEqual(['received']);
    expect(requests[1].url.searchParams.get('revoked_at')).toBe('is.null');
    expect(requests[0].url.searchParams.get('order')).toBe('created_at.desc');
    expect(requests[1].url.searchParams.get('order')).toBe('updated_at.desc');
    expect(await service.listReceivedDownloads()).toEqual([{shareId: 'received', spotifyPlaylistId: 'same-copy', spotifyPlaylistUrl: 'https://open.spotify.com/playlist/same-copy', appliedRevision: 3, updatedAt: 'updated'}, {shareId: 'reserved', spotifyPlaylistId: null, spotifyPlaylistUrl: '', appliedRevision: 0, updatedAt: undefined}]);
  });

  it.each(['owner', 'recipient'])('loads role-correct metadata with an existing mapping as %s', async id => {
    getUser.mockResolvedValue({data: {user: {id}}, error: null});
    reply = url => {
      if (url.pathname.endsWith('/playlist_shares')) return json([share()]);
      return json([{share_id: 'share', spotify_playlist_id: 'existing', applied_revision: 2}]);
    };
    const metadata = await service.loadShareMetadata('share');
    expect(metadata.viewerRole).toBe(id);
    expect(metadata.share).toMatchObject({revision: 4, playlistDescription: '', ownerDisplayName: 'Spotify user', recipientDisplayName: null, acceptedAt: null, revokedAt: null});
    expect(metadata.download).toMatchObject({spotifyPlaylistId: 'existing', appliedRevision: 2});
    expect(requests.map(item => [item.url.pathname.split('/').at(-1), item.url.searchParams.get(item.url.pathname.endsWith('/playlist_shares') ? 'id' : 'share_id')])).toEqual([['playlist_shares', 'eq.share'], ['playlist_share_downloads', 'eq.share']]);
  });

  it.each(['playlist_shares', 'playlist_share_downloads'])('propagates metadata permission failure for %s without presenting missing access as an empty playlist', async denied => {
    reply = url => url.pathname.endsWith(`/${denied}`) ? json({code: '42501', message: 'fixture permission denied'}, 403) : json([share()]);
    await expect(service.loadShareMetadata('share')).rejects.toMatchObject({code: '42501'});
  });

  it('distinguishes revoked metadata from an available share without a saved Spotify copy', async () => {
    let available = false;
    reply = url => json(url.pathname.endsWith('/playlist_shares') && available ? [share()] : []);
    await expect(service.loadShareMetadata('share')).rejects.toThrow('unavailable or has been revoked');
    available = true;
    expect((await service.loadShareMetadata('share')).download).toBeNull();
  });

  it.each(['listOwnedShares', 'listReceivedShares', 'listReceivedDownloads'] as const)('returns an explicit empty %s result on a successful empty response', async method => {
    reply = () => json(null);
    expect(await service[method]()).toEqual([]);
  });

  it.each(['listOwnedShares', 'listReceivedShares', 'listReceivedDownloads'] as const)('preserves permission failures from %s', async method => {
    reply = () => json({code: '42501', message: 'no access'}, 403);
    await expect(service[method]()).rejects.toMatchObject({code: '42501'});
  });

  it.each([null, {id: 'owner'}])('requires a valid authenticated identity before publication and propagates auth errors', async user => {
    getUser.mockResolvedValue({data: {user}, error: user ? new Error('identity unavailable') : null});
    await expect(service.createShare(publication())).rejects.toThrow(user ? 'identity unavailable' : 'Supabase login is required');
    expect(requests).toEqual([]);
  });

  it('uses profile fallbacks and commits a genuinely empty snapshot without appending fake tracks', async () => {
    reply = url => {
      if (url.pathname.endsWith('/users')) return json([]);
      if (url.pathname.endsWith('/begin_playlist_share_create_upload')) return json('upload');
      if (url.pathname.endsWith('/commit_playlist_share_create_upload')) return json('created');
      throw new Error('Unexpected append');
    };
    const result = await service.createShare(publication([]));
    expect(result.shareId).toBe('created');
    expect(requests[1].body).toMatchObject({p_owner_display_name: 'Spotify user', p_owner_image_url: ''});
    expect(requests[2].body).toEqual({p_upload_id: 'upload', p_expected_track_count: 0});
  });

  it.each(['begin', 'append', 'commit'])('does not commit an owner refresh after %s fails and preserves the viewed revision for retry', async failing => {
    const seen: string[] = [];
    let retry = false;
    reply = (url, init) => {
      const name = url.pathname.split('/').at(-1)!;
      seen.push(name);
      if (!retry && name.startsWith(failing === 'append' ? 'append_' : `${failing}_`)) return json({code: 'P0001', message: 'revision conflict'}, 409);
      return json(name.startsWith('begin_') ? 'upload' : name.startsWith('commit_') ? 5 : null);
    };
    await expect(service.refreshShare('share', 4, publication())).rejects.toMatchObject({message: 'revision conflict'});
    if (failing !== 'commit') expect(seen.some(name => name.startsWith('commit_'))).toBe(false);
    retry = true;
    expect(await service.refreshShare('share', 4, publication())).toBe(5);
    const starts = requests.filter(item => item.url.pathname.includes('begin_'));
    expect(starts.every(item => item.body.p_expected_revision === 4 && item.body.p_share_id === 'share')).toBe(true);
  });

  it.each(['create', 'refresh'] as const)('rejects a missing %s upload id before appending or committing', async mode => {
    reply = url => url.pathname.endsWith('/users') ? json([]) : json(null);
    const operation = mode === 'create' ? service.createShare(publication()) : service.refreshShare('share', 4, publication());
    await expect(operation).rejects.toThrow('did not start the playlist upload');
    expect(requests.some(item => item.url.pathname.includes('append_') || item.url.pathname.includes('commit_'))).toBe(false);
  });

  it('rejects missing committed creation identity rather than creating a usable claim link', async () => {
    reply = url => url.pathname.endsWith('/users') ? json([]) : json(url.pathname.includes('/begin_') ? 'upload' : null);
    await expect(service.createShare(publication([]))).rejects.toThrow('did not return a playlist share ID');
  });

  it.each(['create', 'refresh'] as const)('bounds %s uploads by UTF8 bytes and rejects a single oversize song before append', async mode => {
    reply = url => url.pathname.endsWith('/users') ? json([]) : json('upload');
    const huge = {...track('huge'), name: '💚'.repeat(112_501)};
    const operation = mode === 'create' ? service.createShare(publication([huge])) : service.refreshShare('share', 4, publication([huge]));
    await expect(operation).rejects.toThrow('song is too large to share');
    expect(requests.some(item => item.url.pathname.includes('append_') || item.url.pathname.includes('commit_'))).toBe(false);
  });

  it('keeps complete UTF8 tracks in separate byte-bounded chunks with no duplicated offsets', async () => {
    reply = url => json(url.pathname.includes('/begin_') ? 'upload' : url.pathname.includes('/commit_') ? 5 : null);
    const songs = Array.from({length: 3}, (_, i) => ({...track(`unicode-${i}`), name: '💚'.repeat(60_000)}));
    await service.refreshShare('share', 4, publication(songs));
    const chunks = requests.filter(item => item.url.pathname.includes('append_'));
    expect(chunks.map(item => item.body.p_offset)).toEqual([0, 1, 2]);
    expect(chunks.flatMap(item => item.body.p_tracks).map(item => item.id)).toEqual(songs.map(item => item.id));
    expect(chunks.every(item => new TextEncoder().encode(JSON.stringify(item.body.p_tracks)).byteLength <= 450_000)).toBe(true);
  });

  it.each(['claimShare', 'revokeShare', 'removeReceivedShare'] as const)('propagates server ownership decisions through %s', async method => {
    reply = () => json({code: '42501', message: 'not permitted'}, 403);
    await expect(service[method]('share-or-token')).rejects.toMatchObject({code: '42501'});
    expect(requests).toHaveLength(1);
  });

  it('distinguishes an expired claim and a busy lease from successful opaque ownership claims', async () => {
    let available = false;
    reply = () => json(available ? 'claimed-share' : null);
    await expect(service.claimShare('expired')).rejects.toThrow('could not be claimed');
    expect(await service.claimDownloadSync('share', 4, 2)).toBeNull();
    available = true;
    expect(await service.claimShare('valid')).toBe('claimed-share');
  });

  it('records and commits the existing Spotify destination under the same exact snapshot lease without creating a new copy', async () => {
    reply = url => json(url.pathname.includes('claim_') || url.pathname.includes('complete_') ? true : null);
    const lease = await service.claimDownloadSync('share', 4, 2);
    await service.recordDownload('share', 'existing-copy', 'https://open.spotify.com/playlist/existing-copy', 2);
    expect(await service.completeDownloadSync('share', 4, 2, lease!, 'existing-copy', 'https://open.spotify.com/playlist/existing-copy')).toBe(true);
    await service.releaseDownloadSync('share', lease!);
    expect(requests[2].body).toMatchObject({p_expected_source_revision: 4, p_expected_applied_revision: 2, p_lease_token: lease, p_spotify_playlist_id: 'existing-copy'});
    expect(requests[3].body).toMatchObject({p_share_id: 'share', p_lease_token: lease, p_recipient_user_id: null});
    expect(requests.some(item => item.url.origin.includes('spotify'))).toBe(false);
  });

  it('treats a rejected lease completion as false instead of marking the source revision applied', async () => {
    reply = () => json('true');
    expect(await service.completeDownloadSync('share', 4, 2, 'lease', 'copy', 'url')).toBe(false);
  });

  it.each(['claim', 'complete', 'release', 'record'])('propagates %s download synchronization failures so the caller can recover', async operation => {
    reply = () => json({code: '40001', message: 'lease lost'}, 409);
    const action = operation === 'claim' ? service.claimDownloadSync('share', 4, 2)
      : operation === 'complete' ? service.completeDownloadSync('share', 4, 2, 'lease', 'copy', 'url')
      : operation === 'release' ? service.releaseDownloadSync('share', 'lease') : service.recordDownload('share', 'copy', 'url', 2);
    await expect(action).rejects.toMatchObject({code: '40001'});
  });
  it('continues pagination without an exact total until the first short page', async () => {
    reply = url => {
      const offset = Number(url.searchParams.get('offset') || 0);
      const amount = offset < 100 ? 50 : 3;
      return json(Array.from({length: amount}, (_, index) => ({position: offset + index, track: track(`t-${offset + index}`, offset + index + 1)})));
    };
    const result = await service.loadShareTracks('share', {pageSize: 50, concurrency: 4});
    expect(result.map(item => item.id)).toEqual(Array.from({length: 103}, (_, i) => `t-${i}`));
    expect(requests.map(item => Number(item.url.searchParams.get('offset') || 0))).toEqual([0, 50, 100]);
  });

  it('retains successful pages in an explicit partial error and loads a clean full result on retry', async () => {
    let failed = true;
    reply = url => {
      const offset = Number(url.searchParams.get('offset') || 0);
      if (failed && offset === 50) return json({code: '57014', message: 'page unavailable'}, 403);
      return json(Array.from({length: 50}, (_, i) => ({position: offset + i, track: track(`t-${offset + i}`)})), 200, {'content-range': `${offset}-${offset + 49}/150`});
    };
    const pages: string[][] = [];
    const failure = await service.loadShareTracks('share', {pageSize: 50, concurrency: 4, onPage: page => pages.push(page.map(item => item.id))}).catch(error => error);
    expect(failure).toMatchObject({message: expect.stringContaining('could not be loaded'), cause: {code: '57014'}});
    expect(failure.partialTracks.map((item: CompareTrack) => item.id)).toEqual([...Array.from({length: 50}, (_, i) => `t-${i}`), ...Array.from({length: 50}, (_, i) => `t-${100 + i}`)]);
    expect(pages.map(page => page[0])).toEqual(['t-0', 't-100']);
    failed = false;
    const recovered = await service.loadShareTracks('share', {pageSize: 50});
    expect(recovered.map(item => item.id)).toEqual(Array.from({length: 150}, (_, i) => `t-${i}`));
    expect(new Set(recovered.map(item => item.id)).size).toBe(150);
  });

  it('preserves a first-page transport failure without presenting an empty share', async () => {
    reply = () => json({code: '42501', message: 'share revoked'}, 403);
    await expect(service.loadShareTracks('share')).rejects.toMatchObject({code: '42501'});
  });

  it('does not report a short exact-count page as a complete source snapshot', async () => {
    reply = url => {
      const offset = Number(url.searchParams.get('offset') || 0);
      const amount = offset === 0 ? 50 : 5;
      return json(Array.from({length: amount}, (_, i) => ({position: offset + i, track: track(`t-${offset + i}`)})), 200, {'content-range': `${offset}-${offset + amount - 1}/60`});
    };
    const result = service.loadShareTracks('share', {pageSize: 50});
    await expect(result).rejects.toMatchObject({partialTracks: expect.any(Array)});
  });

  it('preserves cancellation semantics when an in-flight later page completes after navigation abort', async () => {
    const secondPage = deferred<Response>();
    reply = url => {
      const offset = Number(url.searchParams.get('offset') || 0);
      return offset ? secondPage.promise : json(Array.from({length: 50}, (_, i) => ({position: i, track: track(`t-${i}`)})), 200, {'content-range': '0-49/51'});
    };
    const controller = new AbortController();
    const loading = service.loadShareTracks('share', {pageSize: 50, signal: controller.signal});
    await vi.waitFor(() => expect(requests).toHaveLength(2));
    controller.abort();
    secondPage.resolve(json([{position: 50, track: track('late')}], 200, {'content-range': '50-50/51'}));
    await expect(loading).rejects.toMatchObject({name: 'AbortError'});
  });

  it('does not publish an account A snapshot into a replacement account while its profile request is pending', async () => {
    const profile = deferred<Response>();
    reply = url => url.pathname.endsWith('/users') ? profile.promise : json(url.pathname.includes('/begin_') ? 'upload' : 'share-created');
    const creating = service.createShare(publication());
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    getUser.mockResolvedValue({data: {user: {id: 'account-b'}}, error: null});
    cachedActorId = 'account-b';
    profile.resolve(json([{display_name: 'Old account A', profile_pic_url: 'account-a.jpg'}]));
    await creating.catch(() => undefined);
    expect(requests.filter(item => item.url.pathname.includes('/rpc/'))).toEqual([]);
  });

  it('normalizes legacy cache fallbacks, removes malformed/duplicate tracks and preserves first-source ordering', () => {
    const normalized = service.normalizeCachedTracks([
      null, {}, {tracks: [null, {}, {id: 'nameless', artists: [{id: 'a', name: 'A'}]}, {id: 'artistless', name: 'No artists'}, {id: 'bad-artists', name: 'Bad artists', artists: [null, {id: 'only-id'}, {name: 'only-name'}]},
        {id: 'later', name: 'Later', artists: [{id: 'a', name: 'A'}, null], playlist_index: 2, duration_ms: 180, explicit: true, uri: 'spotify:track:later', external_urls: {spotify: 'https://open.spotify.com/track/later'}, album: {name: 'Album', images: [{url: 'cover'}], release_date: '2026'}},
        {id: 'first', name: 'First', artists: [{id: 'a', name: 'A'}], playlist_index: 1},
        {id: 'later', name: 'Duplicate ignored', artists: [{id: 'different', name: 'Different'}]}]}
    ]);
    expect(normalized.map(item => item.id)).toEqual(['first', 'later']);
    expect(normalized[0]).toEqual({...track('first'), name: 'First', artists: [{id: 'a', name: 'A'}], durationMs: 0, explicit: false, releaseDate: ''});
    expect(normalized[1]).toMatchObject({playlistIndex: 2, durationMs: 180, explicit: true, albumName: 'Album', imageUrl: 'cover', releaseDate: '2026', artists: [{id: 'a', name: 'A'}]});
    expect(service.normalizeCachedTracks(null as unknown as any[])).toEqual([]);
  });

  it('calculates explicit/duration totals and independently limits ranked artists and albums to ten', () => {
    const tracks = Array.from({length: 12}, (_, index) => ({...track(`t-${index}`), artists: [{id: `a-${index}`, name: `Artist ${index}`}], albumName: `Album ${index}`, durationMs: index ? 100 : undefined, explicit: index % 2 === 0}));
    tracks.push({...tracks[11], id: 'extra', durationMs: 200});
    const stats = service.calculateStats(tracks);
    expect(stats).toMatchObject({tracks: 13, artists: 12, albums: 12, durationMs: 1300, explicitTracks: 6});
    expect(stats.topArtists).toHaveLength(10);
    expect(stats.topAlbums).toHaveLength(10);
    expect(stats.topArtists[0]).toEqual({id: 'a-11', name: 'Artist 11', count: 2});
    expect(stats.topAlbums[0]).toEqual({name: 'Album 11', count: 2});
    expect(service.calculateStats([])).toEqual({tracks: 0, artists: 0, albums: 0, durationMs: 0, explicitTracks: 0, topArtists: [], topAlbums: []});
  });

  it.each(['begin', 'append', 'commit'])('propagates a create publication %s failure before exposing an invitation', async stage => {
    reply = url => {
      if (url.pathname.endsWith('/users')) return json([{display_name: 'Owner', profile_pic_url: 'owner.jpg'}]);
      if (url.pathname.split('/').at(-1)!.startsWith(`${stage}_`)) return json({code: '42501', message: 'publication denied'}, 403);
      return json('upload');
    };
    await expect(service.createShare(publication())).rejects.toMatchObject({code: '42501'});
    if (stage !== 'commit') expect(requests.some(item => item.url.pathname.includes('commit_'))).toBe(false);
  });

  it('removes a realtime channel only once and suppresses callbacks despite a failed cleanup acknowledgement', async () => {
    const callbacks: Array<() => void> = [];
    const channel = {on: vi.fn().mockImplementation((_type, _filter, callback) => {callbacks.push(callback); return channel;}), subscribe: vi.fn().mockImplementation(() => channel)};
    const removeChannel = vi.fn().mockRejectedValue(new Error('channel cleanup unavailable'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const realtimeService = new PlaylistSharingService({getClient: async () => ({channel: () => channel, removeChannel})} as unknown as SupabaseService, lifecycle);
    const changed = vi.fn();
    const cleanup = realtimeService.subscribeToShareChanges(changed);
    await Promise.resolve();
    callbacks.forEach(callback => callback());
    expect(changed).toHaveBeenCalledTimes(2);
    cleanup(); cleanup();
    callbacks.forEach(callback => callback());
    await Promise.resolve();
    expect(removeChannel).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledTimes(2);
    expect(warning).toHaveBeenCalledWith('[PlaylistSharing] Could not remove realtime subscription.', expect.any(Error));
  });

  it('does not warn about late realtime initialization failure after the subscriber was disposed', async () => {
    let reject!: (reason: unknown) => void;
    const ready = new Promise((_resolve, fail) => {reject = fail;});
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const realtimeService = new PlaylistSharingService({getClient: () => ready} as unknown as SupabaseService, lifecycle);
    const cleanup = realtimeService.subscribeToShareChanges(vi.fn());
    cleanup();
    reject(new Error('obsolete initialization failure'));
    await Promise.resolve(); await Promise.resolve();
    expect(warning).not.toHaveBeenCalled();
  });

  it('does not append or commit a captured owner snapshot after identity changes during begin acknowledgement', async () => {
    const begin = deferred<Response>();
    reply = url => url.pathname.endsWith('/users') ? json([{display_name: 'Owner A'}])
      : url.pathname.includes('/begin_') ? begin.promise : json('unexpected successor mutation');
    const creating = service.createShare(publication());
    await vi.waitFor(() => expect(requests.some(item => item.url.pathname.includes('/begin_'))).toBe(true));
    getUser.mockResolvedValue({data: {user: {id: 'account-b'}}, error: null});
    cachedActorId = 'account-b';
    begin.resolve(json('upload-a'));
    await creating.catch(() => undefined);
    expect(requests.filter(item => item.url.pathname.includes('/rpc/')).map(item => item.url.pathname.split('/').at(-1))).toEqual(['begin_playlist_share_create_upload']);
  });

  it('does not send a second upload chunk or commit when identity changes during the first chunk acknowledgement', async () => {
    const firstChunk = deferred<Response>();
    reply = url => url.pathname.endsWith('/users') ? json([{display_name: 'Owner A'}])
      : url.pathname.includes('/begin_') ? json('upload-a')
      : url.pathname.includes('/append_') ? firstChunk.promise : json('unexpected successor commit');
    const creating = service.createShare(publication(Array.from({length: 251}, (_, i) => track(`t-${i}`))));
    await vi.waitFor(() => expect(requests.some(item => item.url.pathname.includes('/append_'))).toBe(true));
    getUser.mockResolvedValue({data: {user: {id: 'account-b'}}, error: null});
    cachedActorId = 'account-b';
    firstChunk.resolve(json(null));
    await creating.catch(() => undefined);
    expect(requests.filter(item => item.url.pathname.includes('/append_')).map(item => item.body.p_offset)).toEqual([0]);
    expect(requests.some(item => item.url.pathname.includes('/commit_'))).toBe(false);
  });

  it.each(['create', 'refresh'] as const)('does not expose an acknowledged %s commit to a replacement actor or issue compensating writes', async mode => {
    const commit = deferred<Response>();
    reply = url => url.pathname.endsWith('/users') ? json([{display_name: 'Owner'}])
      : url.pathname.includes('/begin_') ? json('upload')
      : url.pathname.includes('/commit_') ? commit.promise : json(null);
    const operation = mode === 'create' ? service.createShare(publication()) : service.refreshShare('share', 4, publication());
    await vi.waitFor(() => expect(requests.some(item => item.url.pathname.includes('/commit_'))).toBe(true));
    const requestCountAtCommit = requests.length;
    cachedActorId = 'account-b';
    getUser.mockResolvedValue({data: {user: {id: 'account-b'}}, error: null});
    commit.resolve(json(mode === 'create' ? 'acknowledged-share' : 5));
    await expect(operation).rejects.toMatchObject({name: 'AbortError'});
    expect(requests).toHaveLength(requestCountAtCommit);
    expect(requests.filter(item => item.url.pathname.includes('/commit_'))).toHaveLength(1);
    expect(requests.some(item => /revoke|remove/.test(item.url.pathname))).toBe(false);
  });

  it('rejects a same-owner prior session during a chunk and allows a fresh session to publish successfully', async () => {
    const firstChunk = deferred<Response>();
    let original = true;
    reply = url => url.pathname.includes('/begin_') ? json('upload')
      : url.pathname.includes('/commit_') ? json(5)
      : original ? firstChunk.promise : json(null);
    const songs = Array.from({length: 251}, (_, i) => track(`t-${i}`));
    const oldSession = service.refreshShare('share', 4, publication(songs));
    await vi.waitFor(() => expect(requests.some(item => item.url.pathname.includes('/append_'))).toBe(true));
    await lifecycle.invalidateAndDrain();
    original = false;
    firstChunk.resolve(json(null));
    await expect(oldSession).rejects.toMatchObject({name: 'AbortError'});
    expect(requests.filter(item => item.url.pathname.includes('/append_')).map(item => item.body.p_offset)).toEqual([0]);
    expect(requests.some(item => item.url.pathname.includes('/commit_'))).toBe(false);
    expect(await service.refreshShare('share', 4, publication(songs))).toBe(5);
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(requests.filter(item => item.url.pathname.includes('/append_')).map(item => item.body.p_offset)).toEqual([0, 0, 250]);
  });

  it('rejects a stale session during guarded client readiness before opening a profile query', async () => {
    const ready = deferred<SupabaseClient>();
    let calls = 0;
    const guarded = new PlaylistSharingService({getClient: () => ++calls === 1 ? Promise.resolve(client) : ready.promise} as unknown as SupabaseService, lifecycle);
    const operation = guarded.createShare(publication());
    await vi.waitFor(() => expect(calls).toBe(2));
    await lifecycle.invalidateAndDrain();
    ready.resolve(client);
    await expect(operation).rejects.toMatchObject({name: 'AbortError'});
    expect(requests).toEqual([]);
  });

  it('rejects a stale session during a local SDK session-cache read without making a profile or upload request', async () => {
    const session = deferred<any>();
    vi.mocked(client.auth.getSession).mockReturnValueOnce(session.promise);
    const operation = service.createShare(publication());
    await vi.waitFor(() => expect(client.auth.getSession).toHaveBeenCalledOnce());
    await lifecycle.invalidateAndDrain();
    session.resolve({data: {session: {user: {id: 'owner'}}}, error: null});
    await expect(operation).rejects.toMatchObject({name: 'AbortError'});
    expect(requests).toEqual([]);
  });

  it('preserves a local SDK session-cache error before any publication effects', async () => {
    vi.mocked(client.auth.getSession).mockResolvedValueOnce({data: {session: null}, error: new Error('local session unavailable')} as any);
    await expect(service.createShare(publication())).rejects.toThrow('local session unavailable');
    expect(requests).toEqual([]);
  });

  it('reports a short exact-count first page as partial instead of returning a complete snapshot', async () => {
    reply = () => json([{position: 0, track: track('only')}], 200, {'content-range': '0-0/60'});
    await expect(service.loadShareTracks('share', {pageSize: 50})).rejects.toMatchObject({partialTracks: [track('only')]});
  });

  it.each([true, false])('returns a complete short first page with exact count available: %s', async exactCount => {
    reply = () => json([{position: 0, track: track('one')}], 200, exactCount ? {'content-range': '0-0/1'} : {});
    expect(await service.loadShareTracks('share', {pageSize: 50})).toEqual([track('one')]);
    expect(requests).toHaveLength(1);
  });

  it('normalizes legacy source order without explicit indices and calculates stats for tracks without albums', () => {
    const tracks = service.normalizeCachedTracks([{tracks: [
      {id: 'first', name: 'First', artists: [{id: 'a', name: 'A'}]},
      {id: 'second', name: 'Second', artists: [{id: 'a', name: 'A'}]}
    ]}]);
    expect(tracks.map(item => item.playlistIndex)).toEqual([1, 2]);
    expect(service.calculateStats(tracks)).toEqual({tracks: 2, artists: 1, albums: 0, durationMs: 0, explicitTracks: 0, topArtists: [{id: 'a', name: 'A', count: 2}], topAlbums: []});
  });

  it('maps an empty owned snapshot and keeps its accepted/revoked metadata available to the owner', async () => {
    reply = () => json([{...share(), track_count: 0, accepted_at: 'accepted', revoked_at: 'revoked', recipient_display_name: 'Recipient'}]);
    expect((await service.listOwnedShares())[0]).toMatchObject({trackCount: 0, acceptedAt: 'accepted', revokedAt: 'revoked', recipientDisplayName: 'Recipient'});
  });

  it('keeps independent realtime subscriptions isolated when UUID generation is unavailable', async () => {
    const names: string[] = [];
    const channels: unknown[] = [];
    const makeChannel = (name: string) => {
      names.push(name);
      const channel = {on: () => channel, subscribe: () => channel};
      channels.push(channel);
      return channel;
    };
    const removeChannel = vi.fn().mockResolvedValue(undefined);
    const realtime = new PlaylistSharingService({getClient: async () => ({channel: makeChannel, removeChannel})} as unknown as SupabaseService, lifecycle);
    vi.stubGlobal('crypto', {getRandomValues: crypto.getRandomValues.bind(crypto)});
    vi.spyOn(Math, 'random').mockReturnValueOnce(.125).mockReturnValueOnce(.875);
    const cleanupA = realtime.subscribeToShareChanges(vi.fn());
    const cleanupB = realtime.subscribeToShareChanges(vi.fn());
    await Promise.resolve();
    expect(names).toHaveLength(2);
    expect(names[0]).not.toBe(names[1]);
    cleanupA();
    expect(removeChannel).toHaveBeenCalledExactlyOnceWith(channels[0]);
    cleanupB();
    expect(removeChannel).toHaveBeenLastCalledWith(channels[1]);
  });

  it('does not dispatch a captured publication after logout interrupts actual SDK access-token readiness', async () => {
    const tokenStarted = deferred<void>();
    const token = deferred<string>();
    const dispatched: string[] = [];
    let abortedBeforeDispatch = 0;
    let profileServed = false;
    let blocked = false;
    const sdk = createClient('https://sharing.fixture.invalid', 'fixture-public-key', {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      accessToken: async () => {
        if (profileServed && !blocked) {blocked = true; tokenStarted.resolve(); return token.promise;}
        return 'fixture-token';
      },
      global: {fetch: (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        // Native fetch rejects an already-aborted signal before dispatch. Keep
        // this synthetic network boundary faithful without making live requests.
        if (init.signal?.aborted) {abortedBeforeDispatch++; throw new DOMException('Request aborted before dispatch.', 'AbortError');}
        const url = new URL(input instanceof Request ? input.url : String(input));
        expect(url.origin).toBe('https://sharing.fixture.invalid');
        dispatched.push(url.pathname);
        if (url.pathname.endsWith('/users')) {profileServed = true; return json([{display_name: 'Owner'}]);}
        return json('upload');
      }) as typeof fetch}
    });
    const scoped = new PlaylistSharingService({getClient: async () => ({
      from: sdk.from.bind(sdk), rpc: sdk.rpc.bind(sdk),
      auth: {getUser: async () => ({data: {user: {id: 'owner'}}, error: null}), getSession: async () => ({data: {session: {user: {id: 'owner'}}}, error: null})}
    })} as unknown as SupabaseService, lifecycle);
    const operation = scoped.createShare(publication());
    await tokenStarted.promise;
    await lifecycle.invalidateAndDrain();
    token.resolve('old-session-token');
    await expect(operation).rejects.toMatchObject({name: 'AbortError'});
    expect(dispatched).toEqual(['/rest/v1/users']);
    expect(abortedBeforeDispatch).toBe(1);
  });

  it('does not open a publication RPC when logout is queued between cached session verification and the mutation caller', async () => {
    const rpc = vi.spyOn(client, 'rpc');
    vi.mocked(client.auth.getSession).mockImplementationOnce(() => {
      const cached = Promise.resolve({data: {session: {user: {id: 'owner'}}}, error: null});
      // A queued logout observes the same public cached-session completion as
      // the service. It runs after that verification but before caller handover.
      void cached.then(() => queueMicrotask(() => {void lifecycle.invalidateAndDrain();}));
      return cached as any;
    });
    reply = () => json('unexpected stale mutation');
    await expect(service.refreshShare('share', 4, publication())).rejects.toMatchObject({name: 'AbortError'});
    expect(rpc).not.toHaveBeenCalled();
    expect(requests).toEqual([]);
  });

});
