import {afterEach, describe, expect, it, vi} from 'vitest';
import {of, Subject, throwError} from 'rxjs';
import {createClient} from '@supabase/supabase-js';
import {SongLeagueService} from './song-league.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}

const track = (id = '1234567890123456789012', extra: any = {}) => ({id, name: id, artists: [], album: {}, ...extra});
const rejoin = (extra: any = {}) => ({request_id: 'request', league_id: 'league', league_name: 'League', user_id: 'member', display_name: 'Member', status: 'pending', requested_at: '2026-10-20', request_expires_at: '2026-10-27', ...extra});
function fixture() {
  const rpc = vi.fn().mockResolvedValue({data: null, error: null});
  const invoke = vi.fn().mockResolvedValue({data: {ok: true}, error: null});
  const getUser = vi.fn().mockResolvedValue({data: {user: {id: 'member'}}, error: null});
  const client = {rpc: (...args: any[]) => {const response = rpc(...args); return Object.assign(response, {abortSignal: () => response});}, functions: {invoke}, auth: {getUser, getSession: vi.fn().mockResolvedValue({data: {session: {user: {id: 'member'}}}, error: null})}};
  const supabase = {
    getClient: vi.fn().mockResolvedValue(client),
    syncTracks: vi.fn().mockResolvedValue(undefined),
    loadLatestStatsSnapshot: vi.fn().mockResolvedValue(null),
    saveStatsSnapshot: vi.fn().mockResolvedValue(undefined)
  };
  const spotify = {
    searchTracks: vi.fn().mockReturnValue(of({tracks: {items: []}})),
    getSingleTrack: vi.fn().mockReturnValue(of(track())),
    getUserTopArtists: vi.fn().mockReturnValue(of({items: []})),
    getUserTopTracks: vi.fn().mockReturnValue(of({items: [track()]}))
  };
  return {service: new SongLeagueService(supabase as any, spotify as any, new SessionLifecycleService()), rpc, invoke, getUser, client, supabase, spotify};
}
afterEach(() => {vi.restoreAllMocks(); vi.useRealTimers();});

const operations = [
  ['create', (s: SongLeagueService) => s.createLeague('League', 'UTC')],
  ['create invite', (s: SongLeagueService) => s.createInvite('league')],
  ['list invites', (s: SongLeagueService) => s.listActiveInvites('league')],
  ['revoke invite', (s: SongLeagueService) => s.revokeInvite('invite')],
  ['revoke all invites', (s: SongLeagueService) => s.revokeAllInvites('league')],
  ['approve rejoin', (s: SongLeagueService) => s.approveRejoin('league', 'member')],
  ['request rejoin', (s: SongLeagueService) => s.requestRejoin('token')],
  ['read rejoin', (s: SongLeagueService) => s.getMyRejoinRequest('token')],
  ['list rejoins', (s: SongLeagueService) => s.listRejoinRequests('league')],
  ['respond rejoin', (s: SongLeagueService) => s.respondToRejoinRequest('request', 'declined')],
  ['history', (s: SongLeagueService) => s.listLifecycleEvents('league')],
  ['capacity', (s: SongLeagueService) => s.setMemberLimit('league', 2)],
  ['claim', (s: SongLeagueService) => s.claimLeague('token')],
  ['leave', (s: SongLeagueService) => s.leaveLeague('league')],
  ['close', (s: SongLeagueService) => s.closeLeague('league')],
  ['remove member', (s: SongLeagueService) => s.removeMember('league', 'member')],
  ['transfer owner', (s: SongLeagueService) => s.transferOwnership('league', 'member')],
  ['delete', (s: SongLeagueService) => s.deleteLeague('league')],
  ['score breakdown', (s: SongLeagueService) => s.loadScoreBreakdown('league', 'member')],
  ['member readiness', (s: SongLeagueService) => s.ensureMemberReadyForLeague('league', 'UTC')],
  ['recommendation', (s: SongLeagueService) => s.submitRecommendation('league', track())]
] as const;

describe('Song League trusted operation boundaries', () => {
  it.each(operations)('preserves server permission failures for %s without secondary writes', async (_name, operation) => {
    const f = fixture(); const denied = {code: '42501', message: 'Only the league owner may perform this operation.'};
    f.rpc.mockResolvedValue({data: null, error: denied});
    await expect(operation(f.service)).rejects.toBe(denied);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.supabase.saveStatsSnapshot).not.toHaveBeenCalled();
    expect(f.invoke).not.toHaveBeenCalled();
  });
  it.each([
    ['create', (s: SongLeagueService) => s.createLeague('League', 'UTC'), 'Song League ID'],
    ['invite', (s: SongLeagueService) => s.createInvite('league'), 'invitation ID'],
    ['claim', (s: SongLeagueService) => s.claimLeague('token'), 'could not be joined'],
    ['recommendation', (s: SongLeagueService) => s.submitRecommendation('league', track()), 'not saved']
  ] as const)('does not report %s success when the acknowledgement is empty', async (_name, operation, message) => {
    const f = fixture(); await expect(operation(f.service)).rejects.toThrow(message);
  });
  it('treats empty optional lists and absent own rejoin as empty outcomes', async () => {
    const f = fixture();
    expect(await f.service.listActiveInvites('league')).toEqual([]);
    expect(await f.service.revokeAllInvites('league')).toBe(0);
    expect(await f.service.getMyRejoinRequest('token')).toBeNull();
    expect(await f.service.listRejoinRequests('league')).toEqual([]);
    expect(await f.service.listLifecycleEvents('league')).toEqual([]);
    expect(await f.service.loadScoreBreakdown('league', 'member')).toEqual([]);
    await expect(f.service.requestRejoin('token')).rejects.toThrow('could not be created');
    f.rpc.mockResolvedValue({data: [], error: null});
    await expect(f.service.requestRejoin('token')).rejects.toThrow('could not be created');
    expect(await f.service.getMyRejoinRequest('token')).toBeNull();
  });
  it('maps finite invitation limits, missing usage counts and nullable history without exposing secrets', async () => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({data: [{invite_id: 'invite', max_uses: '3', invite_token: 'secret', token_hash: 'secret'}], error: null});
    expect(await f.service.listActiveInvites('league')).toEqual([{id: 'invite', createdAt: undefined, expiresAt: undefined, usagePolicy: undefined, useCount: 0, maxUses: 3, lastUsedAt: null}]);
    f.rpc.mockResolvedValueOnce({data: [{event_id: 'event', action: 'league_closed', actor_user_id: 'owner', actor_display_name: 'Owner', occurred_at: '2026-10-20'}], error: null});
    expect(await f.service.listLifecycleEvents('league')).toEqual([{id: 'event', action: 'league_closed', actorUserId: 'owner', actorDisplayName: 'Owner', subjectUserId: null, subjectDisplayName: null, occurredAt: '2026-10-20'}]);
  });
  it('accepts single-row rejoin responses including approved expiry metadata', async () => {
    const f = fixture(); const row = rejoin({image_url: 'image', responded_at: '2026-10-20T10:00:00Z', approval_expires_at: '2026-10-21', status: 'approved'});
    f.rpc.mockResolvedValue({data: row, error: null});
    expect(await f.service.requestRejoin('token')).toMatchObject({id: 'request', imageUrl: 'image', status: 'approved', respondedAt: row.responded_at, approvalExpiresAt: row.approval_expires_at});
    expect(await f.service.getMyRejoinRequest('token')).toMatchObject({id: 'request', status: 'approved'});
  });
  it('does not submit invalid selections or metadata that failed to persist', async () => {
    const f = fixture(); await expect(f.service.submitRecommendation('league', null as any)).rejects.toThrow('Choose a Spotify track');
    await expect(f.service.submitRecommendation('league', {} as any)).rejects.toThrow('Choose a Spotify track');
    expect(f.supabase.syncTracks).not.toHaveBeenCalled();
    f.supabase.syncTracks.mockRejectedValue(new Error('Metadata storage unavailable'));
    await expect(f.service.submitRecommendation('league', track())).rejects.toThrow('Metadata storage unavailable');
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it('keeps creation retry keys after a missing acknowledgement and changes them for changed capacity', async () => {
    const f = fixture(); await expect(f.service.createLeague('  League  ', 'UTC')).rejects.toThrow('Song League ID');
    const first = f.rpc.mock.calls[0][1]; f.rpc.mockResolvedValue({data: 'saved', error: null});
    await f.service.createLeague('League', 'UTC'); expect(f.rpc.mock.calls[1][1]).toEqual(first);
    await f.service.createLeague('League', 'UTC', 12); expect(f.rpc.mock.calls[2][1]).toMatchObject({p_max_members: 12});
    expect(f.rpc.mock.calls[2][1].p_idempotency_key).not.toBe(first.p_idempotency_key);
  });
  it.each([
    [{error: 'Sync worker unavailable'}, 'Sync worker unavailable'],
    [{ok: false, failed: 1}, '1 member playlist needs a Spotify reconnect.'],
    [{ok: false, failed: 3}, '3 member playlists need a Spotify reconnect.'],
    [{ok: false}, 'Some member playlists need a Spotify reconnect.']
  ])('reports partial playlist sync failure %j without retrying unrelated work', async (data, message) => {
    const f = fixture(); f.invoke.mockResolvedValue({data, error: null});
    await expect(f.service.syncWeeklyPlaylists('league', true)).rejects.toThrow(message);
    expect(f.invoke).toHaveBeenCalledTimes(1); expect(f.rpc).not.toHaveBeenCalled();
  });
  it('preserves invocation and authentication errors instead of accepting missing identities', async () => {
    const f = fixture(); const error = new Error('Session expired');
    f.invoke.mockResolvedValue({data: null, error}); await expect(f.service.syncWeeklyPlaylists('league')).rejects.toBe(error);
    f.getUser.mockResolvedValue({data: {user: null}, error}); await expect(f.service.currentUserId()).rejects.toBe(error);
    f.getUser.mockResolvedValue({data: {user: null}, error: null}); await expect(f.service.currentUserId()).rejects.toThrow('login is required');
  });
});

describe('Song League Spotify selection and readiness', () => {
  it.each(['', ' ', 'x'])('does not send an undersized search %j to Spotify', async query => {
    const f = fixture(); expect(await f.service.searchTracks(query)).toEqual([]); expect(f.spotify.searchTracks).not.toHaveBeenCalled();
  });
  it('trims searches, removes local/missing identities and handles absent search results', async () => {
    const f = fixture(); f.spotify.searchTracks.mockReturnValue(of({tracks: {items: [null, {}, track('valid'), track('local', {is_local: true})]}}));
    expect(await f.service.searchTracks('  music  ')).toEqual([track('valid')]); expect(f.spotify.searchTracks).toHaveBeenCalledWith('music', 10);
    for (const response of [null, {}, {tracks: {}}]) {f.spotify.searchTracks.mockReturnValue(of(response)); expect(await f.service.searchTracks('music')).toEqual([]);}
  });
  it.each(['spotify:album:1234567890123456789012', 'not a URL', 'https://spotify.com.attacker.invalid/track/1234567890123456789012', 'https://open.spotify.com/track/short', 'https://open.spotify.com/album/1234567890123456789012', 'https://open.spotify.com@attacker.invalid/track/1234567890123456789012'])('rejects a non-track Spotify selection %s before transport', async value => {
    const f = fixture(); await expect(f.service.loadTrackFromSpotifyUrl(value)).rejects.toThrow('valid Spotify track'); expect(f.spotify.getSingleTrack).not.toHaveBeenCalled();
  });
  it('waits for Spotify results and exposes transport failures to search/track recovery', async () => {
    const f = fixture(); const pending = new Subject<any>(); f.spotify.searchTracks.mockReturnValue(pending); const result = f.service.searchTracks('find'); pending.next({tracks: {items: [track()]}}); pending.complete(); expect(await result).toEqual([track()]);
    f.spotify.searchTracks.mockReturnValue(throwError(() => new Error('Search unavailable'))); await expect(f.service.searchTracks('find')).rejects.toThrow('Search unavailable');
    f.spotify.getSingleTrack.mockReturnValue(throwError(() => new Error('Track unavailable'))); await expect(f.service.loadTrackFromSpotifyUrl(' https://open.spotify.com/track/1234567890123456789012/ ')).rejects.toThrow('Track unavailable');
  });
  it('coalesces concurrent leagues for the same member/day, retaining each membership authorization', async () => {
    const f = fixture(); const snapshot = deferred<any>(); f.supabase.loadLatestStatsSnapshot.mockReturnValue(snapshot.promise);
    const day = new Date('2026-10-20T10:00:00Z'); const first = f.service.ensureMemberReadyForLeague('first', 'UTC', day); const second = f.service.ensureMemberReadyForLeague('second', 'UTC', day);
    await vi.waitFor(() => expect(f.supabase.loadLatestStatsSnapshot).toHaveBeenCalledTimes(1));
    snapshot.resolve({snapshotDate: '2026-10-20', topTracks: [track()]});
    expect(await Promise.all([first, second])).toEqual([{refreshed: false, snapshotDate: '2026-10-20'}, {refreshed: false, snapshotDate: '2026-10-20'}]);
    expect(f.rpc.mock.calls.map(call => call[1])).toEqual([{p_league_id: 'first'}, {p_league_id: 'second'}]);
    expect(f.supabase.saveStatsSnapshot).not.toHaveBeenCalled();
  });
  it('keeps different league-local dates independent and retries a failed snapshot save', async () => {
    const f = fixture(); const day = new Date('2026-10-20T12:30:00Z');
    const results = await Promise.all([f.service.ensureMemberReadyForLeague('first', 'Pacific/Kiritimati', day), f.service.ensureMemberReadyForLeague('second', 'America/Adak', day)]);
    expect(results.map(result => result.snapshotDate)).toEqual(['2026-10-21', '2026-10-20']); expect(f.supabase.saveStatsSnapshot).toHaveBeenCalledTimes(2);
    f.supabase.saveStatsSnapshot.mockRejectedValueOnce(new Error('Snapshot unavailable')); await expect(f.service.ensureMemberReadyForLeague('first', 'UTC', day)).rejects.toThrow('Snapshot unavailable');
    expect(await f.service.ensureMemberReadyForLeague('first', 'UTC', day)).toEqual({refreshed: true, snapshotDate: '2026-10-20'});
  });
  it.each([null, {snapshotDate: '2026-10-20'}, {snapshotDate: '2026-10-20', topTracks: []}, {snapshotDate: '2026-10-20', topTracks: {}}])('refreshes an incomplete daily snapshot %j and rejects empty Spotify songs', async existing => {
    const f = fixture(); f.supabase.loadLatestStatsSnapshot.mockResolvedValue(existing); f.spotify.getUserTopArtists.mockReturnValue(of(null)); f.spotify.getUserTopTracks.mockReturnValue(of(undefined));
    await expect(f.service.ensureMemberReadyForLeague('league', 'UTC', new Date('2026-10-20T10:00:00Z'))).rejects.toThrow('did not return short-term Top Songs'); expect(f.supabase.saveStatsSnapshot).not.toHaveBeenCalled();
  });
  it('weights trimmed genres by rank, omits placeholder genres and persists only the top15 while retaining full denominator', async () => {
    const f = fixture(); const artists = [{genres: [' Rock ', 'artist', '', null]}, {genres: ['Rock', 'Jazz']}, null, ...Array.from({length: 49}, (_, index) => ({genres: [`Genre${index}`]}))];
    f.spotify.getUserTopArtists.mockReturnValue(of({items: artists})); f.spotify.getUserTopTracks.mockImplementation((_range: string, _limit: number, offset: number) => of({items: offset ? [track('second', {explicit: true})] : [track('first'), null]}));
    await f.service.ensureMemberReadyForLeague('league', 'UTC', new Date('2026-10-20T10:00:00Z'));
    const args = f.supabase.saveStatsSnapshot.mock.calls[0]; const genres = args[6];
    expect(args.slice(0, 4)).toEqual(['member', 'short_term', 33, 15]); expect(genres).toHaveLength(15); expect(genres[0]).toMatchObject({name: 'Rock', count: 99}); expect(genres[1]).toMatchObject({name: 'Jazz', count: 49});
    const fullWeight = 1278; // 50/49 leading credits, then ranks4–52 with a minimum weight of1.
    expect(genres[0].percentage).toBeCloseTo(99 / fullWeight * 100); expect(genres[0].percentage_simple).toBe(genres[0].percentage); expect(genres.map((genre: any) => genre.name)).not.toContain('artist');
  });
  it('can persist tracks when Spotify omits artist/page metadata', async () => {
    const f = fixture(); f.spotify.getUserTopArtists.mockReturnValue(of({})); f.spotify.getUserTopTracks.mockImplementation((_range: string, _limit: number, offset: number) => of(offset ? null : {items: [track()]}));
    await f.service.ensureMemberReadyForLeague('league', 'UTC', new Date('2026-10-20T10:00:00Z'));
    expect(f.supabase.saveStatsSnapshot.mock.calls[0].slice(2, 7)).toEqual([0, 0, [track()], [], []]);
  });
});

function dashboardFixture() {
  const requests: Array<{url: URL; method: string; body: any}> = [];
  const responses = new Map<string, {data: any; status?: number}>();
  const client = createClient('https://league-boundary.invalid', 'isolated-anon-key', {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
    global: {fetch: async (input, init) => {
      const url = new URL(String(input)); const key = url.pathname.replace('/rest/v1/', '');
      requests.push({url, method: init?.method || 'GET', body: init?.body ? JSON.parse(String(init.body)) : null});
      const response = responses.get(key); if (!response) throw new Error(`Unconfigured boundary: ${key}`);
      const data = typeof response.data === 'function' ? response.data(requests.at(-1)) : response.data;
      return new Response(JSON.stringify(data), {status: response.status || 200, headers: {'Content-Type': 'application/json'}});
    }}
  });
  const service = new SongLeagueService({getClient: async () => client} as any, {} as any, new SessionLifecycleService());
  responses.set('song_leagues', {data: {id: 'league', owner_user_id: 'owner', name: 'League', timezone: 'UTC', created_at: '2026-09-01'}});
  for (const table of ['song_league_members', 'song_league_recommendations', 'song_league_playlists', 'song_league_score_events']) responses.set(table, {data: []});
  responses.set('rpc/get_song_league_score_breakdown', {data: []});
  return {service, responses, requests};
}

describe('Song League dashboard through the installed PostgREST client', () => {
  it.each([false, true])('loads closed=%s dashboard with the correct retained membership/scoring filters', async closed => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T12:00:00Z'));
    const f = dashboardFixture();
    if (closed) f.responses.set('song_leagues', {data: {id: 'league', closed_at: '2026-10-01', max_members: 12, playlist_revision: 4, owner_display_name: 'Owner', owner_image_url: 'image', is_demo: true}});
    const dashboard = await f.service.loadDashboard('league');
    expect(dashboard.members).toEqual([]); expect(dashboard.standings).toEqual([]); expect(dashboard.recommendations).toEqual([]); expect(dashboard.playlists).toEqual([]);
    expect(dashboard.league).toMatchObject(closed ? {closedAt: '2026-10-01', maxMembers: 12, playlistRevision: 4, ownerDisplayName: 'Owner', ownerImageUrl: 'image', isDemo: true} : {closedAt: null, maxMembers: 5, playlistRevision: 0, ownerDisplayName: 'Spotify user', ownerImageUrl: '', isDemo: false});
    const member = f.requests.find(request => request.url.pathname.endsWith('/song_league_members'))!.url.searchParams;
    const recommendations = f.requests.find(request => request.url.pathname.endsWith('/song_league_recommendations'))!.url.searchParams;
    expect(member.get('league_id')).toBe('eq.league'); expect(member.get('left_at')).toBe(closed ? null : 'is.null');
    expect(recommendations.get('scoring_ends_at')).toBe(closed ? null : 'gte.2026-10-20T12:00:00.000Z');
    expect(f.requests.find(request => request.url.pathname.endsWith('/song_league_score_events'))!.url.searchParams.get('snapshot_date')).toBe('gte.2026-10-14');
  });
  it('preserves permanent points, aggregates recent scoring and resolves tied standing by join time', async () => {
    const f = dashboardFixture();
    f.responses.set('song_league_members', {data: [
      {league_id: 'league', user_id: 'newer', role: 'member', display_name: 'Newer', joined_at: '2026-10-02', image_url: 'cover', left_at: '2026-10-03'},
      {league_id: 'league', user_id: 'owner', role: 'owner', display_name: 'Owner', joined_at: '2026-10-01'},
      {league_id: 'league', user_id: 'zero', role: 'member', display_name: 'Zero', joined_at: '2026-10-03'}
    ]});
    f.responses.set('rpc/get_song_league_score_breakdown', {data: (request: any) => request.body.p_recommender_user_id === 'zero' ? [] : [{recommendation_id: `${request.body.p_recommender_user_id}-pick`, track_id: 'track', total_points: '100', latest_rank: null, latest_list_size: null}]});
    f.responses.set('song_league_score_events', {data: [{recommendation_id: 'owner-pick', points: '3'}, {recommendation_id: 'owner-pick', points: 2}, {recommendation_id: 'newer-pick', points: null}, {recommendation_id: 'unknown', points: 100}]});
    f.responses.set('song_league_recommendations', {data: [{id: 'pick', league_id: 'league', recommender_user_id: 'owner', isrc: 'ISRC', album_name: 'Album', image_url: 'cover', spotify_url: 'https://open.spotify.com/track/fixture'}]});
    f.responses.set('song_league_playlists', {data: [{league_id: 'league', user_id: 'owner', spotify_playlist_id: 'spotify', spotify_playlist_url: 'url', last_synced_revision: '4', last_synced_round_id: 'round', last_synced_at: '2026-10-20', last_error: 'Reconnect'}]});
    const dashboard = await f.service.loadDashboard('league');
    expect(dashboard.standings.map(standing => [standing.userId, standing.totalPoints, standing.lastSevenDaysPoints])).toEqual([['owner', 100, 5], ['newer', 100, 0], ['zero', 0, 0]]);
    expect(dashboard.members[0]).toMatchObject({imageUrl: 'cover', leftAt: '2026-10-03'}); expect(dashboard.members[1]).toMatchObject({imageUrl: '', leftAt: null});
    expect(dashboard.recommendations[0]).toMatchObject({isrc: 'ISRC', albumName: 'Album', imageUrl: 'cover', spotifyUrl: 'https://open.spotify.com/track/fixture'});
    expect(dashboard.playlists[0]).toMatchObject({spotifyPlaylistId: 'spotify', spotifyPlaylistUrl: 'url', lastSyncedRevision: 4, lastSyncedRoundId: 'round', lastSyncedAt: '2026-10-20', lastError: 'Reconnect'});
    expect(dashboard.breakdownByRecommender.get('owner')![0]).toMatchObject({imageUrl: '', spotifyUrl: '', latestRank: null, latestListSize: null, latestPoints: 0, latestSnapshotDate: null});
  });
  it('maps nullable recommendation/playlist metadata and numeric score receipts', async () => {
    const f = dashboardFixture(); f.responses.set('song_league_recommendations', {data: [{id: 'pick'}]}); f.responses.set('song_league_playlists', {data: [{}]});
    const dashboard = await f.service.loadDashboard('league'); expect(dashboard.recommendations[0]).toMatchObject({isrc: null, albumName: '', imageUrl: '', spotifyUrl: ''}); expect(dashboard.playlists[0]).toMatchObject({spotifyPlaylistId: null, spotifyPlaylistUrl: '', lastSyncedRevision: 0, lastSyncedRoundId: null, lastSyncedAt: null, lastError: null});
    f.responses.set('rpc/get_song_league_score_breakdown', {data: [{recommendation_id: 'pick', image_url: 'image', spotify_url: 'url', total_points: null, latest_rank: '2', latest_list_size: '100', latest_points: '99', latest_snapshot_date: '2026-10-20'}]});
    expect(await f.service.loadScoreBreakdown('league', 'owner')).toEqual([expect.objectContaining({totalPoints: 0, latestRank: 2, latestListSize: 100, latestPoints: 99, latestSnapshotDate: '2026-10-20', imageUrl: 'image', spotifyUrl: 'url'})]);
  });
  it.each(['song_leagues', 'song_league_members', 'song_league_recommendations', 'song_league_playlists', 'song_league_score_events'])('rejects a %s failure instead of returning a partially trusted dashboard', async table => {
    const f = dashboardFixture(); f.responses.set(table, {data: {code: '42501', message: `Denied ${table}`}, status: 403});
    await expect(f.service.loadDashboard('league')).rejects.toMatchObject({code: '42501', message: `Denied ${table}`});
  });
  it('rejects an unavailable league before loading related rows', async () => {
    const f = dashboardFixture(); f.responses.set('song_leagues', {data: null}); await expect(f.service.loadDashboard('league')).rejects.toThrow('unavailable'); expect(f.requests).toHaveLength(1);
  });
  it.each([false, true])('lists closed=%s with stable ordering and server row filters', async closed => {
    const f = dashboardFixture(); f.responses.set('song_leagues', {data: [{id: 'league'}]}); expect(await f.service.listLeagues(closed)).toEqual([expect.objectContaining({id: 'league'})]);
    const query = f.requests[0].url.searchParams; expect(query.get('closed_at')).toBe(closed ? 'not.is.null' : 'is.null'); expect(query.get('order')).toBe('created_at.desc');
    f.responses.set('song_leagues', {data: null}); expect(await f.service.listLeagues(closed)).toEqual([]);
  });
  it('propagates list permission failure without turning it into an empty list', async () => {
    const f = dashboardFixture(); f.responses.set('song_leagues', {data: {code: '42501', message: 'Not authorized'}, status: 403}); await expect(f.service.listLeagues()).rejects.toMatchObject({code: '42501'});
  });
});

describe('Song League overlapping creation recovery', () => {
  it('retains the newer uncertain creation identity when an older distinct creation succeeds', async () => {
    const f = fixture(); const firstResponse = deferred<any>(); const secondResponse = deferred<any>();
    f.rpc.mockReturnValueOnce(firstResponse.promise).mockReturnValueOnce(secondResponse.promise).mockResolvedValue({data: 'second', error: null});
    const first = f.service.createLeague('First', 'UTC'); const second = f.service.createLeague('Second', 'UTC');
    const secondFailure = expect(second).rejects.toThrow('Acknowledgement lost');
    await vi.waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(2));
    const secondIdentity = f.rpc.mock.calls[1][1];
    firstResponse.resolve({data: 'first', error: null}); await first;
    secondResponse.resolve({data: null, error: new Error('Acknowledgement lost')}); await secondFailure;
    await f.service.createLeague('Second', 'UTC');
    expect(f.rpc.mock.calls[2][1].p_idempotency_key).toBe(secondIdentity.p_idempotency_key);
    expect(f.rpc.mock.calls[2][1].p_invite_token).toBe(secondIdentity.p_invite_token);
  });
});

describe('Song League empty transport and realtime cleanup recovery', () => {
  it('accepts server-confirmed membership and owner closure without inventing extra mutations', async () => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({data: 'league', error: null});
    expect(await f.service.claimLeague('valid-invite')).toBe('league');
    await f.service.closeLeague('league');
    expect(f.rpc.mock.calls).toEqual([['claim_song_league', {p_invite_token: 'valid-invite'}], ['close_song_league', {p_league_id: 'league'}]]);
  });
  it('treats absent optional dashboard datasets as empty while retaining the league', async () => {
    const f = dashboardFixture(); for (const table of ['song_league_members', 'song_league_recommendations', 'song_league_playlists', 'song_league_score_events']) f.responses.set(table, {data: null});
    const result = await f.service.loadDashboard('league'); expect(result.league.id).toBe('league'); expect(result.members).toEqual([]); expect(result.recommendations).toEqual([]); expect(result.playlists).toEqual([]); expect(result.standings).toEqual([]); expect(result.breakdownByRecommender.size).toBe(0);
  });
  it('builds distinct channels without randomUUID and reports failed cleanup once', async () => {
    const f = fixture(); vi.spyOn(crypto, 'randomUUID').mockReturnValue(undefined as any);
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const removeError = new Error('Realtime cleanup unavailable'); const removeChannel = vi.fn().mockRejectedValue(removeError);
    const callbacks: Array<() => void> = []; const channel = {on: vi.fn(), subscribe: vi.fn()}; channel.on.mockImplementation((_kind: string, _filter: any, callback: () => void) => {callbacks.push(callback); return channel;}); channel.subscribe.mockReturnValue(channel);
    const channelFactory = vi.fn().mockReturnValue(channel); f.supabase.getClient.mockResolvedValue({...f.client, channel: channelFactory, removeChannel});
    const change = vi.fn(); const disposeA = f.service.subscribeToLeague('league', change); const disposeB = f.service.subscribeToLeague('league', change);
    await Promise.resolve(); expect(channelFactory).toHaveBeenCalledTimes(2); expect(channelFactory.mock.calls[0][0]).not.toBe(channelFactory.mock.calls[1][0]);
    callbacks[0](); expect(change).toHaveBeenCalledOnce(); disposeA(); disposeA(); await vi.waitFor(() => expect(warning).toHaveBeenCalledWith('[SongLeague] Could not remove realtime subscription.', removeError));
    expect(removeChannel).toHaveBeenCalledTimes(1); callbacks[0](); expect(change).toHaveBeenCalledOnce(); disposeB();
  });
  it('silences a late initialization rejection after the subscribing view has been destroyed', async () => {
    const f = fixture(); const pending = deferred<any>(); f.supabase.getClient.mockReturnValue(pending.promise); const warning = vi.spyOn(console, 'warn').mockImplementation(() => {}); const change = vi.fn();
    const dispose = f.service.subscribeToLeague('league', change); dispose(); pending.reject(new Error('Client unavailable')); await Promise.resolve(); await Promise.resolve();
    expect(change).not.toHaveBeenCalled(); expect(warning).not.toHaveBeenCalled();
  });
});

describe('Song League independent creation identities', () => {
  it('retains an older uncertain creation identity after a distinct newer creation succeeds', async () => {
    const f = fixture(); const firstResponse = deferred<any>(); const secondResponse = deferred<any>();
    f.rpc.mockReturnValueOnce(firstResponse.promise).mockReturnValueOnce(secondResponse.promise).mockResolvedValue({data: 'first', error: null});
    const first = f.service.createLeague('First', 'UTC'); const second = f.service.createLeague('Second', 'UTC'); const firstFailure = expect(first).rejects.toThrow('Acknowledgement lost');
    await vi.waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(2)); const firstIdentity = f.rpc.mock.calls[0][1];
    secondResponse.resolve({data: 'second', error: null}); await second; firstResponse.resolve({data: null, error: new Error('Acknowledgement lost')}); await firstFailure;
    await f.service.createLeague('First', 'UTC'); expect(f.rpc.mock.calls[2][1].p_idempotency_key).toBe(firstIdentity.p_idempotency_key); expect(f.rpc.mock.calls[2][1].p_invite_token).toBe(firstIdentity.p_invite_token);
  });
  it('does not let a duplicate older acknowledgement clear a newer same-name uncertain creation', async () => {
    const f = fixture(); const firstResponse = deferred<any>(); const duplicateResponse = deferred<any>(); const newerResponse = deferred<any>();
    f.rpc.mockReturnValueOnce(firstResponse.promise).mockReturnValueOnce(duplicateResponse.promise).mockReturnValueOnce(newerResponse.promise).mockResolvedValue({data: 'newer', error: null});
    const first = f.service.createLeague('Same', 'UTC'); const duplicate = f.service.createLeague('Same', 'UTC'); await vi.waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(2));
    expect(f.rpc.mock.calls[1][1]).toEqual(f.rpc.mock.calls[0][1]); firstResponse.resolve({data: 'first', error: null}); await first;
    const newer = f.service.createLeague('Same', 'UTC'); const newerFailure = expect(newer).rejects.toThrow('Acknowledgement lost'); await vi.waitFor(() => expect(f.rpc).toHaveBeenCalledTimes(3)); const newerIdentity = f.rpc.mock.calls[2][1];
    expect(newerIdentity.p_idempotency_key).not.toBe(f.rpc.mock.calls[0][1].p_idempotency_key); duplicateResponse.resolve({data: 'first', error: null}); await duplicate;
    newerResponse.resolve({data: null, error: new Error('Acknowledgement lost')}); await newerFailure;
    await f.service.createLeague('Same', 'UTC'); expect(f.rpc.mock.calls[3][1]).toEqual(newerIdentity);
  });
  it('retains an uncertain attempt across a subsequent successful different form submission', async () => {
    const f = fixture(); f.rpc.mockResolvedValueOnce({data: null, error: new Error('Acknowledgement lost')}).mockResolvedValue({data: 'confirmed', error: null});
    await expect(f.service.createLeague('First', 'UTC')).rejects.toThrow('Acknowledgement lost'); const firstIdentity = f.rpc.mock.calls[0][1];
    await f.service.createLeague('Different', 'UTC'); await f.service.createLeague('First', 'UTC'); expect(f.rpc.mock.calls[2][1]).toEqual(firstIdentity);
  });
});
