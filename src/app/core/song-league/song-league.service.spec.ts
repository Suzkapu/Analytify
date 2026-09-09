import { beforeEach, describe, expect, it, type Mock, type MockedObject, vi } from "vitest";
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';

import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import { SongLeagueTrack } from './song-league.models';
import { SongLeagueService } from './song-league.service';

describe('SongLeagueService', () => {
    let service: SongLeagueService;
    let rpc: Mock;
    let syncTracks: Mock;
    let invoke: Mock;
    let loadLatestStatsSnapshot: Mock;
    let saveStatsSnapshot: Mock;
    let spotify: any;

    beforeEach(() => {
        rpc = vi.fn().mockName('rpc').mockResolvedValue({ data: 'league-id', error: null });
        syncTracks = vi.fn().mockName('syncTracks').mockResolvedValue(undefined);
        invoke = vi.fn().mockName('invoke').mockResolvedValue({ data: { ok: true, failed: 0 }, error: null });
        loadLatestStatsSnapshot = vi.fn().mockName('loadLatestStatsSnapshot').mockResolvedValue(null);
        saveStatsSnapshot = vi.fn().mockName('saveStatsSnapshot').mockResolvedValue(undefined);
        spotify = {
            searchTracks: vi.fn().mockName("SpotifyDataService.searchTracks"),
            getSingleTrack: vi.fn().mockName("SpotifyDataService.getSingleTrack"),
            getUserTopArtists: vi.fn().mockName("SpotifyDataService.getUserTopArtists"),
            getUserTopTracks: vi.fn().mockName("SpotifyDataService.getUserTopTracks")
        };
        spotify.searchTracks.mockReturnValue(of({ tracks: { items: [track()] } }));
        spotify.getSingleTrack.mockReturnValue(of(track()));

        TestBed.configureTestingModule({
            providers: [
                SongLeagueService,
                { provide: SpotifyDataService, useValue: spotify },
                {
                    provide: SupabaseService,
                    useValue: {
                        syncTracks,
                        loadLatestStatsSnapshot,
                        saveStatsSnapshot,
                        client: {
                            rpc,
                            functions: { invoke },
                            auth: { getUser: vi.fn().mockName('getUser').mockResolvedValue({
                                    data: { user: { id: 'member-id' } }, error: null
                                }) }
                        }
                    }
                }
            ]
        });
        service = TestBed.inject(SongLeagueService);
    });

    it('creates a private high-entropy invitation without persisting the raw token in the client model', async () => {
        const created = await service.createLeague('Friday Finds', 'Europe/Vienna');
        const parameters = vi.mocked(rpc).mock.lastCall![1];

        expect(vi.mocked(rpc).mock.lastCall![0]).toBe('create_song_league');
        expect(parameters.p_invite_token.length).toBe(64);
        expect(parameters.p_idempotency_key.length).toBe(64);
        expect(parameters.p_timezone).toBe('Europe/Vienna');
        expect(parameters.p_max_members).toBe(5);
        expect(created.leagueId).toBe('league-id');
        expect(created.inviteUrl).toContain(`/song-league/join/${parameters.p_invite_token}`);
        expect(created).not.toHaveProperty('inviteToken');
    });

    it('creates custom capacity, owner membership, and invitation through one atomic RPC', async () => {
        rpc.mockResolvedValue({ data: 'league-id', error: null });
        const created = await service.createLeague('Two Player Duel', 'Europe/Vienna', 2);

        expect(created.leagueId).toBe('league-id');
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(vi.mocked(rpc).mock.lastCall![1].p_max_members).toBe(2);
    });

    it('reuses the same creation and invite keys after an uncertain request failure', async () => {
        rpc.mockResolvedValueOnce({data: null, error: new Error('response lost')})
            .mockResolvedValueOnce({data: 'existing-league', error: null});

        await expect(service.createLeague('Retry League', 'Europe/Vienna', 5)).rejects.toThrow('response lost');
        const first = vi.mocked(rpc).mock.calls[0][1];
        const created = await service.createLeague('Retry League', 'Europe/Vienna', 5);
        const retry = vi.mocked(rpc).mock.calls[1][1];

        expect(retry.p_idempotency_key).toBe(first.p_idempotency_key);
        expect(retry.p_invite_token).toBe(first.p_invite_token);
        expect(created.leagueId).toBe('existing-league');
    });

    it('starts a new creation attempt after a confirmed success', async () => {
        await service.createLeague('Repeatable Name', 'Europe/Vienna', 5);
        const first = vi.mocked(rpc).mock.calls[0][1];
        await service.createLeague('Repeatable Name', 'Europe/Vienna', 5);
        const second = vi.mocked(rpc).mock.calls[1][1];

        expect(second.p_idempotency_key).not.toBe(first.p_idempotency_key);
        expect(second.p_invite_token).not.toBe(first.p_invite_token);
    });

    it('creates independent invitation tokens when more players are invited', async () => {
        await service.createInvite('league-id');
        const firstParameters = vi.mocked(rpc).mock.lastCall![1];
        await service.createInvite('league-id');
        const secondParameters = vi.mocked(rpc).mock.lastCall![1];

        expect(vi.mocked(rpc).mock.calls.map(args => args[0])).toEqual([
            'rotate_song_league_invite',
            'rotate_song_league_invite'
        ]);
        expect(firstParameters.p_league_id).toBe('league-id');
        expect(firstParameters.p_expires_in_hours).toBe(168);
        expect(firstParameters.p_usage_policy).toBe('multi_use');
        expect(firstParameters.p_invite_token).not.toBe(secondParameters.p_invite_token);
    });

    it('revokes one invitation without rotating unrelated links', async () => {
        await service.revokeInvite('invite-id');
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('revoke_song_league_invite', { p_invite_id: 'invite-id' });
    });

    it('lists only token-free invitation metadata and revokes all through owner RPCs', async () => {
        rpc.mockResolvedValueOnce({data: [{
            invite_id: 'invite-id', created_at: '2026-09-01T00:00:00Z', expires_at: '2026-09-08T00:00:00Z',
            usage_policy: 'multi_use', use_count: 2, max_uses: null, last_used_at: '2026-09-02T00:00:00Z'
        }], error: null}).mockResolvedValueOnce({data: 1, error: null});

        const invitations = await service.listActiveInvites('league-id');
        const revoked = await service.revokeAllInvites('league-id');

        expect(invitations).toEqual([expect.objectContaining({id: 'invite-id', useCount: 2})]);
        expect(invitations[0]).not.toHaveProperty('token');
        expect(invitations[0]).not.toHaveProperty('tokenHash');
        expect(revoked).toBe(1);
        expect(rpc).toHaveBeenNthCalledWith(1, 'list_song_league_invites', {p_league_id: 'league-id'});
        expect(rpc).toHaveBeenNthCalledWith(2, 'revoke_all_song_league_invites', {p_league_id: 'league-id'});
    });

    it('records explicit owner approval before a departed member rejoins', async () => {
        await service.approveRejoin('league-id', 'departed-user');
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('approve_song_league_rejoin', {
            p_league_id: 'league-id', p_user_id: 'departed-user'
        });
    });

    it('uses owner-only lifecycle RPCs and maps the immutable activity log', async () => {
        rpc.mockResolvedValueOnce({data: null, error: null})
            .mockResolvedValueOnce({data: null, error: null})
            .mockResolvedValueOnce({data: null, error: null})
            .mockResolvedValueOnce({data: [{
                event_id: 'event-id', action: 'member_removed', actor_user_id: 'owner',
                actor_display_name: 'Owner', subject_user_id: 'member', subject_display_name: 'Member',
                occurred_at: '2026-09-09T12:00:00Z'
            }], error: null});

        await service.leaveLeague('league-id');
        await service.removeMember('league-id', 'member-id');
        await service.transferOwnership('league-id', 'member-id');
        const events = await service.listLifecycleEvents('league-id');

        expect(rpc).toHaveBeenNthCalledWith(1, 'leave_song_league', {p_league_id: 'league-id'});
        expect(rpc).toHaveBeenNthCalledWith(2, 'remove_song_league_member', {
            p_league_id: 'league-id', p_user_id: 'member-id'
        });
        expect(rpc).toHaveBeenNthCalledWith(3, 'transfer_song_league_ownership', {
            p_league_id: 'league-id', p_new_owner_user_id: 'member-id'
        });
        expect(rpc).toHaveBeenNthCalledWith(4, 'list_song_league_lifecycle_events', {p_league_id: 'league-id'});
        expect(events).toEqual([expect.objectContaining({id: 'event-id', subjectDisplayName: 'Member'})]);
    });

    it('updates the per-league member limit through the owner-only RPC', async () => {
        rpc.mockResolvedValue({ data: 12, error: null });

        const saved = await service.setMemberLimit('league-id', 12);

        expect(saved).toBe(12);
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith('set_song_league_member_limit', {
            p_league_id: 'league-id', p_max_members: 12
        });
    });

    it('syncs canonical track metadata before asking the trusted RPC to validate a recommendation', async () => {
        const callOrder: string[] = [];
        syncTracks.mockImplementation(async () => { callOrder.push('sync'); });
        rpc.mockImplementation(async () => {
            callOrder.push('rpc');
            return { data: 'recommendation-id', error: null };
        });
        const selected = track();

        const recommendationId = await service.submitRecommendation('league-id', selected);

        expect(syncTracks).toHaveBeenCalledTimes(1);

        expect(syncTracks).toHaveBeenCalledWith([selected]);
        expect(rpc).toHaveBeenCalledWith('submit_song_league_recommendation', {
            p_league_id: 'league-id',
            p_track_id: selected.id
        });
        expect(callOrder).toEqual(['sync', 'rpc']);
        expect(recommendationId).toBe('recommendation-id');
    });

    it('uses the admin-only demo submission function for a demo league', async () => {
        rpc.mockResolvedValue({ data: 'demo-recommendation-id', error: null });
        const selected = track();

        const recommendationId = await service.submitRecommendation('demo-league', selected, true);

        expect(rpc).toHaveBeenCalledWith('submit_song_league_demo_recommendation', {
            p_league_id: 'demo-league', p_track_id: selected.id
        });
        expect(recommendationId).toBe('demo-recommendation-id');
    });

    it('accepts Spotify URLs and URIs but rejects unrelated links', async () => {
        await service.loadTrackFromSpotifyUrl('https://open.spotify.com/track/1234567890123456789012?si=test');
        expect(spotify.getSingleTrack).toHaveBeenCalledWith('1234567890123456789012');

        await service.loadTrackFromSpotifyUrl('spotify:track:abcdefghijklmnopqrstuv');
        expect(spotify.getSingleTrack).toHaveBeenCalledWith('abcdefghijklmnopqrstuv');

        await expect(service.loadTrackFromSpotifyUrl('https://example.com/track/1234567890123456789012')).rejects.toThrowError('Paste a valid Spotify track URL or URI.');
    });

    it('asks the authenticated server function to refresh enabled weekly playlists', async () => {
        await service.syncWeeklyPlaylists('league-id');

        expect(invoke).toHaveBeenCalledTimes(1);

        expect(invoke).toHaveBeenCalledWith('song-league-playlist-sync', {
            body: { leagueId: 'league-id', createForCurrentUser: false }
        });
    });

    it('can opt the current player into a private auto-updating weekly playlist', async () => {
        await service.syncWeeklyPlaylists('league-id', true);

        expect(invoke).toHaveBeenCalledTimes(1);

        expect(invoke).toHaveBeenCalledWith('song-league-playlist-sync', {
            body: { leagueId: 'league-id', createForCurrentUser: true }
        });
    });

    it('deletes a league through the owner-only database function', async () => {
        await service.deleteLeague('league-id');

        expect(rpc).toHaveBeenCalledTimes(1);

        expect(rpc).toHaveBeenCalledWith('delete_song_league', { p_league_id: 'league-id' });
    });

    it('evaluates Friday in the league timezone rather than the device timezone', () => {
        expect(service.isFridayInTimezone('Europe/Vienna', new Date('2026-08-07T12:00:00Z'))).toBe(true);
        expect(service.isFridayInTimezone('Europe/Vienna', new Date('2026-08-08T12:00:00Z'))).toBe(false);
    });

    it('enables member auto-sync and skips Spotify when today\'s short-term snapshot is complete', async () => {
        loadLatestStatsSnapshot.mockResolvedValue({
            snapshotDate: '2026-09-04',
            topTracks: [{ id: 'existing-track' }],
            topArtists: [],
            topGenres: []
        });

        const result = await service.ensureMemberReadyForLeague('league-id', 'Europe/Vienna', new Date('2026-09-04T12:00:00Z'));

        expect(rpc).toHaveBeenCalledWith('ensure_song_league_member_sync', { p_league_id: 'league-id' });
        expect(loadLatestStatsSnapshot).toHaveBeenCalledWith('member-id', 'short_term', 2);
        expect(spotify.getUserTopArtists).not.toHaveBeenCalled();
        expect(spotify.getUserTopTracks).not.toHaveBeenCalled();
        expect(saveStatsSnapshot).not.toHaveBeenCalled();
        expect(result).toEqual({ refreshed: false, snapshotDate: '2026-09-04' });
    });

    it('refreshes stale short-term data in parallel and persists it for the league-local day', async () => {
        loadLatestStatsSnapshot.mockResolvedValue({
            snapshotDate: '2026-09-03', topTracks: [{ id: 'old-track' }], topArtists: [], topGenres: []
        });
        spotify.getUserTopArtists.mockReturnValue(of({ items: [
                { id: 'artist-1', name: 'Artist', genres: ['rock'] }
            ] }));
        spotify.getUserTopTracks.mockImplementation((_range: string, _limit: number, offset: number) => of({ items: [
                {
                    id: offset === 0 ? 'track-1' : 'track-2',
                    explicit: offset !== 0,
                    artists: [{ id: 'artist-1', name: 'Artist' }],
                    album: { id: 'album-1', name: 'Album', images: [] }
                }
            ] }));

        const result = await service.ensureMemberReadyForLeague('league-id', 'Europe/Vienna', new Date('2026-09-04T12:00:00Z'));

        expect(spotify.getUserTopArtists).toHaveBeenCalledTimes(1);

        expect(spotify.getUserTopArtists).toHaveBeenCalledWith('short_term', 50, 0);
        expect(vi.mocked(spotify.getUserTopTracks).mock.calls).toEqual([
            ['short_term', 50, 0],
            ['short_term', 50, 50]
        ]);
        expect(saveStatsSnapshot).toHaveBeenCalledWith('member-id', 'short_term', 50, 1, [
            expect.objectContaining({ id: 'track-1' }),
            expect.objectContaining({ id: 'track-2' })
        ], [expect.objectContaining({ id: 'artist-1' })], [expect.objectContaining({ name: 'rock' })], false, '2026-09-04');
        expect(result).toEqual({ refreshed: true, snapshotDate: '2026-09-04' });
    });

    it('uses the league timezone when deciding which day must be fresh', async () => {
        loadLatestStatsSnapshot.mockResolvedValue({
            snapshotDate: '2026-09-05', topTracks: [{ id: 'existing-track' }], topArtists: [], topGenres: []
        });

        const result = await service.ensureMemberReadyForLeague('league-id', 'Pacific/Kiritimati', new Date('2026-09-04T12:30:00Z'));

        expect(result.snapshotDate).toBe('2026-09-05');
        expect(spotify.getUserTopTracks).not.toHaveBeenCalled();
    });

    it('allows a failed refresh to be retried instead of caching the rejection', async () => {
        spotify.getUserTopArtists.mockReturnValue(throwError(() => new Error('Spotify unavailable')));
        spotify.getUserTopTracks.mockReturnValue(of({ items: [track()] }));

        await expect(service.ensureMemberReadyForLeague('league-id', 'Europe/Vienna', new Date('2026-09-04T12:00:00Z'))).rejects.toThrowError('Spotify unavailable');

        spotify.getUserTopArtists.mockReturnValue(of({ items: [] }));
        const result = await service.ensureMemberReadyForLeague('league-id', 'Europe/Vienna', new Date('2026-09-04T12:00:00Z'));

        expect(result.refreshed).toBe(true);
        expect(saveStatsSnapshot).toHaveBeenCalledTimes(1);
    });

    function track(): SongLeagueTrack {
        return {
            id: '1234567890123456789012',
            name: 'Discovery',
            artists: [{ id: 'artist', name: 'Artist' }],
            album: { id: 'album', name: 'Album', images: [{ url: 'cover.jpg' }] },
            external_ids: { isrc: 'ATTEST123456' },
            external_urls: { spotify: 'https://open.spotify.com/track/1234567890123456789012' }
        };
    }
});
