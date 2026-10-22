import {createClient, SupabaseClient} from '@supabase/supabase-js';
import {TestBed} from '@angular/core/testing';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StatsSharingService} from './stats-sharing.service';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: {'content-type': 'application/json'}
});

describe('Stats Sharing serialized SDK boundary', () => {
  let service: StatsSharingService;
  let client: SupabaseClient;
  let reply: (rpc: string, args: Record<string, unknown>) => Response | Promise<Response>;
  let requests: Array<{rpc: string; args: Record<string, unknown>}>;

  beforeEach(() => {
    requests = [];
    reply = rpc => {throw new Error(`Unconfigured synthetic RPC: ${rpc}`);};
    client = createClient('https://stats.fixture.invalid', 'synthetic-public-key', {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      global: {fetch: (async (input: RequestInfo | URL, init: RequestInit = {}) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        expect(url.origin).toBe('https://stats.fixture.invalid');
        expect(url.pathname).toMatch(/^\/rest\/v1\/rpc\/[a-z0-9_]+$/);
        expect(init.method).toBe('POST');
        const rpc = url.pathname.split('/').at(-1)!;
        const args = JSON.parse(String(init.body || '{}')) as Record<string, unknown>;
        requests.push({rpc, args});
        return reply(rpc, args);
      }) as typeof fetch}
    });
    TestBed.configureTestingModule({providers: [StatsSharingService,
      {provide: SupabaseService, useValue: {getClient: async () => client}}
    ]});
    service = TestBed.inject(StatsSharingService);
  });
  afterEach(() => vi.restoreAllMocks());

  // Permission checks belong to the SQL RPC. These tests assert that their errors
  // survive SDK decoding; this synthetic boundary does not execute SQL or RLS.
  it.each([
    ['search privacy', (s: StatsSharingService) => s.listAvailableUsers('  Owner  '), 'search_stats_shareable_users', {p_query: 'Owner'}],
    ['discovery read', (s: StatsSharingService) => s.getDiscoverability(), 'get_stats_discovery_setting', {}],
    ['discovery write', (s: StatsSharingService) => s.setDiscoverability(false), 'set_stats_discovery_setting', {p_enabled: false}],
    ['private request list', (s: StatsSharingService) => s.listAccessRequests(), 'list_stats_access_requests', {}],
    ['viewer request', (s: StatsSharingService) => s.requestAccess('owner'), 'request_stats_access', {p_owner_user_id: 'owner'}],
    ['owner answer', (s: StatsSharingService) => s.respondToRequest('request', true), 'answer_stats_access_request', {p_request_id: 'request', p_decision: 'approved'}],
    ['owner revoke', (s: StatsSharingService) => s.revokeAccess('request'), 'revoke_stats_access', {p_request_id: 'request'}],
    ['private snapshot', (s: StatsSharingService) => s.loadSharedStats('owner', 'long_term'), 'get_shared_stats_snapshot', {p_owner_user_id: 'owner', p_range: 'long_term'}],
    ['request link claim', (s: StatsSharingService) => s.claimAccessInvite('private-token'), 'claim_stats_access_invite', {p_claim_token: 'private-token'}],
    ['share link accept', (s: StatsSharingService) => s.acceptShareInvite('private-token'), 'accept_stats_share_invite', {p_claim_token: 'private-token'}],
    ['share link decline', (s: StatsSharingService) => s.declineShareInvite('private-token'), 'decline_stats_share_invite', {p_claim_token: 'private-token'}],
    ['link preview', (s: StatsSharingService) => s.previewAccessInvite('private-token'), 'preview_stats_access_invite', {p_claim_token: 'private-token'}],
    ['report receipt', (s: StatsSharingService) => s.reportUser('other', '  safety issue  '), 'report_stats_user_v2', {p_user_id: 'other', p_reason: 'safety issue', p_category: 'user_safety', p_content_url: null}],
    ['private moderation notice', (s: StatsSharingService) => s.listModerationCases(), 'list_my_moderation_cases', {}],
    ['appeal', (s: StatsSharingService) => s.appealModerationCase('report', '  reconsider  '), 'appeal_moderation_report', {p_report_id: 'report', p_reason: 'reconsider'}]
  ] as const)('preserves %s denial without fallback data or a follow-up write', async (_label, call, rpc, args) => {
    reply = () => json({code: '42501', message: 'Synthetic permission denied', details: 'consent required', hint: 'request explicit access'}, 403);
    await expect(call(service)).rejects.toMatchObject({code: '42501', message: 'Synthetic permission denied', details: 'consent required', hint: 'request explicit access'});
    expect(requests).toEqual([{rpc, args}]);
  });

  it.each(['request', 'share'] as const)('does not expose a %s claim link after creation is denied', async kind => {
    reply = () => json({code: 'P0001', message: 'Enable Cloud Backup before sharing your stats.'}, 400);
    await expect(kind === 'request' ? service.createAccessInvite() : service.createShareInvite()).rejects.toMatchObject({message: 'Enable Cloud Backup before sharing your stats.'});
    expect(requests).toHaveLength(1);
    expect(requests[0].rpc).toBe(kind === 'request' ? 'create_stats_access_invite' : 'create_stats_share_invite');
    expect(requests[0].args['p_claim_token']).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps both request roles, revocation timestamps and absent profile fallbacks', async () => {
    const base = {owner_user_id: 'owner', viewer_user_id: 'viewer', requested_at: 'requested', updated_at: 'updated'};
    reply = () => json([
      {...base, id: 'incoming', status: 'pending', viewer_role: 'owner', owner_display_name: null, owner_image_url: null, viewer_display_name: null, viewer_image_url: null, responded_at: null, revoked_at: null},
      {...base, id: 'outgoing', status: 'revoked', viewer_role: 'viewer', owner_display_name: 'Owner', owner_image_url: 'owner.jpg', viewer_display_name: 'Viewer', viewer_image_url: 'viewer.jpg', responded_at: 'approved-at', revoked_at: 'revoked-at'}
    ]);
    expect(await service.listAccessRequests()).toEqual([
      {id: 'incoming', ownerUserId: 'owner', viewerUserId: 'viewer', ownerDisplayName: 'Spotify user', ownerImageUrl: '', viewerDisplayName: 'Spotify user', viewerImageUrl: '', status: 'pending', viewerRole: 'owner', requestedAt: 'requested', respondedAt: null, revokedAt: null, updatedAt: 'updated'},
      {id: 'outgoing', ownerUserId: 'owner', viewerUserId: 'viewer', ownerDisplayName: 'Owner', ownerImageUrl: 'owner.jpg', viewerDisplayName: 'Viewer', viewerImageUrl: 'viewer.jpg', status: 'revoked', viewerRole: 'viewer', requestedAt: 'requested', respondedAt: 'approved-at', revokedAt: 'revoked-at', updatedAt: 'updated'}
    ]);
  });

  it('does not substitute friendship or a search result for explicit stats consent', async () => {
    reply = rpc => rpc === 'search_stats_shareable_users'
      ? json([{user_id: 'friend', display_name: null, image_url: null, request_id: null, request_status: null}])
      : json({code: 'P0001', message: 'Stats access is not approved.'}, 400);
    expect(await service.listAvailableUsers('Friend')).toEqual([{userId: 'friend', displayName: 'Spotify user', imageUrl: '', requestId: null, requestStatus: null}]);
    await expect(service.loadSharedStats('friend', 'short_term')).rejects.toMatchObject({message: 'Stats access is not approved.'});
    expect(requests.map(item => item.rpc)).toEqual(['search_stats_shareable_users', 'get_shared_stats_snapshot']);
  });

  it.each(['listAvailableUsers', 'listAccessRequests', 'listModerationCases'] as const)('returns an empty %s result on a successful null response', async method => {
    reply = () => json(null);
    expect(await service[method]('Owner')).toEqual([]);
  });

  it('requires an explicit true discoverability response and preserves disabling', async () => {
    reply = () => json(null);
    expect(await service.getDiscoverability()).toBe(false);
    reply = () => json(false);
    expect(await service.setDiscoverability(false)).toBe(false);
    reply = () => json(true);
    expect(await service.setDiscoverability(true)).toBe(true);
  });

  it('distinguishes no saved snapshot from an empty saved snapshot', async () => {
    reply = () => json(null);
    expect(await service.loadSharedStats('owner', 'short_term')).toBeNull();
    reply = () => json({snapshotDate: '2026-10-20', topTracks: null, topArtists: null, topGenres: null});
    expect(await service.loadSharedStats('owner', 'short_term')).toEqual({ownerUserId: 'owner', ownerDisplayName: 'Spotify user', ownerImageUrl: '', snapshotDate: '2026-10-20', topTracks: [], topArtists: [], topGenres: []});
  });

  it('preserves ranked Spotify track and artist payloads and canonical owner identity', async () => {
    const topTracks = [{id: 'second', name: 'Second', external_urls: {spotify: 'https://open.spotify.com/track/second'}, album: {images: []}, artists: []}, {id: 'first', name: 'First'}];
    const topArtists = [{id: 'artist', external_urls: {spotify: 'https://open.spotify.com/artist/artist'}, images: []}];
    reply = () => json({ownerUserId: 'canonical-owner', ownerDisplayName: 'Owner', ownerImageUrl: 'owner.jpg', snapshotDate: '2026-10-20', topTracks, topArtists, topGenres: [{name: 'indie', weight: 100}]});
    expect(await service.loadSharedStats('owner', 'medium_term')).toEqual({ownerUserId: 'canonical-owner', ownerDisplayName: 'Owner', ownerImageUrl: 'owner.jpg', snapshotDate: '2026-10-20', topTracks, topArtists, topGenres: [{name: 'indie', count: 100, percentage: 100}]});
    expect(requests[0].args).toEqual({p_owner_user_id: 'owner', p_range: 'medium_term'});
  });

  it.each([
    [[{name: 'indie', weight: 800}, {name: 'pop', weight: 200}], [{name: 'indie', count: 800, percentage: 80}, {name: 'pop', count: 200, percentage: 20}]],
    [[{name: 'indie', weight: 60}, {name: 'pop', weight: 60}], [{name: 'indie', count: 60, percentage: 50}, {name: 'pop', count: 60, percentage: 50}]],
    [[{name: 'indie', weight: 200}, {name: 'pop', weight: 0}], [{name: 'indie', count: 200, percentage: 100}, {name: 'pop', count: 0, percentage: 0}]],
    [[{name: 'silence', weight: 0}], [{name: 'silence', count: 0, percentage: 0}]]
  ])('normalizes legacy count weights without losing counts or inventing activity', async (topGenres, expected) => {
    reply = () => json({topGenres, topTracks: [], topArtists: []});
    expect((await service.loadSharedStats('owner', 'long_term'))?.topGenres).toEqual(expected);
  });

  it.each([
    ['requestAccess', (s: StatsSharingService) => s.requestAccess('owner'), 'could not be created'],
    ['createAccessInvite', (s: StatsSharingService) => s.createAccessInvite(), 'could not be created'],
    ['createShareInvite', (s: StatsSharingService) => s.createShareInvite(), 'could not be created'],
    ['claimAccessInvite', (s: StatsSharingService) => s.claimAccessInvite('token'), 'could not be opened']
  ] as const)('rejects a successful but absent %s identity', async (_name, call, message) => {
    reply = () => json(null);
    await expect(call(service)).rejects.toThrow(message);
  });

  it.each([null, {}, {kind: null}])('rejects an unavailable invitation preview', async payload => {
    reply = () => json(payload);
    await expect(service.previewAccessInvite('token')).rejects.toThrow('This stats link is unavailable.');
  });

  it('does not claim share acceptance succeeded without its request identity', async () => {
    reply = () => json(null);
    await expect(service.acceptShareInvite('token')).rejects.toThrow('The stats share could not be accepted.');
  });

  it('keeps the preview kind and expiry while falling back for a missing profile', async () => {
    reply = () => json({kind: 'request', displayName: null, imageUrl: null, expiresAt: '2026-10-22T00:00:00Z'});
    expect(await service.previewAccessInvite('token')).toEqual({kind: 'request', displayName: 'Spotify user', imageUrl: '', expiresAt: '2026-10-22T00:00:00Z'});
  });

  it.each([null, [], [{}], [{report_id: 'report'}], [{receipt_code: 'receipt'}]])('does not claim reporting succeeded without a complete receipt', async payload => {
    reply = () => json(payload);
    await expect(service.reportUser('other', 'safety issue')).rejects.toThrow('The report receipt could not be created.');
  });

  it('keeps appeal and resolution dates while safely mapping a pending notice', async () => {
    reply = () => json([
      {report_id: 'pending', receipt_code: 'AR-1', viewer_role: 'reporter', status: 'submitted', decision_reason: null, notice: null, resolved_at: null, appealed_at: null},
      {report_id: 'resolved', receipt_code: 'AR-2', viewer_role: 'affected', status: 'appealed', decision_reason: 'Reason', notice: 'Notice', resolved_at: 'resolved', appealed_at: 'appealed'}
    ]);
    expect(await service.listModerationCases()).toEqual([
      {reportId: 'pending', receiptCode: 'AR-1', viewerRole: 'reporter', status: 'submitted', decisionReason: '', notice: '', resolvedAt: null, appealedAt: null},
      {reportId: 'resolved', receiptCode: 'AR-2', viewerRole: 'affected', status: 'appealed', decisionReason: 'Reason', notice: 'Notice', resolvedAt: 'resolved', appealedAt: 'appealed'}
    ]);
  });

  it('keeps failed approval retry explicit and preserves the same decision', async () => {
    let attempts = 0;
    reply = () => ++attempts === 1 ? json({code: 'P0001', message: 'This stats request changed while it was being answered. Try again.'}, 409) : json('approved');
    await expect(service.respondToRequest('request', true)).rejects.toMatchObject({message: 'This stats request changed while it was being answered. Try again.'});
    expect(attempts).toBe(1);
    await expect(service.respondToRequest('request', true)).resolves.toBeUndefined();
    expect(requests).toEqual(Array.from({length: 2}, () => ({rpc: 'answer_stats_access_request', args: {p_request_id: 'request', p_decision: 'approved'}})));
  });

  it('allows a fresh snapshot retry after transient failure without caching it as unavailable', async () => {
    reply = () => json({code: '57014', message: 'Synthetic timeout'}, 503);
    await expect(service.loadSharedStats('owner', 'short_term')).rejects.toMatchObject({code: '57014'});
    reply = () => json({snapshotDate: 'recovered', topTracks: [], topArtists: [], topGenres: []});
    expect((await service.loadSharedStats('owner', 'short_term'))?.snapshotDate).toBe('recovered');
    expect(requests).toHaveLength(2);
  });

  it('keeps simultaneous owner and range responses isolated when the later call finishes first', async () => {
    let releaseFirst!: (response: Response) => void;
    let firstEntered!: () => void;
    const entered = new Promise<void>(resolve => {firstEntered = resolve;});
    reply = (_rpc, args) => {
      if (args['p_owner_user_id'] === 'first-owner') {
        firstEntered();
        return new Promise<Response>(resolve => {releaseFirst = resolve;});
      }
      return json({ownerUserId: 'second-owner', snapshotDate: 'second-date', topTracks: [], topArtists: [], topGenres: []});
    };
    const first = service.loadSharedStats('first-owner', 'short_term');
    await entered;
    const second = await service.loadSharedStats('second-owner', 'long_term');
    expect(second).toMatchObject({ownerUserId: 'second-owner', snapshotDate: 'second-date'});
    releaseFirst(json({ownerUserId: 'first-owner', snapshotDate: 'first-date', topTracks: [], topArtists: [], topGenres: []}));
    expect(await first).toMatchObject({ownerUserId: 'first-owner', snapshotDate: 'first-date'});
    expect(requests.map(item => item.args)).toEqual([{p_owner_user_id: 'first-owner', p_range: 'short_term'}, {p_owner_user_id: 'second-owner', p_range: 'long_term'}]);
  });
});
