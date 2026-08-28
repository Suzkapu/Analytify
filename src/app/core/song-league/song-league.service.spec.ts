import {TestBed} from '@angular/core/testing';
import {of} from 'rxjs';

import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SongLeagueTrack} from './song-league.models';
import {SongLeagueService} from './song-league.service';

describe('SongLeagueService', () => {
  let service: SongLeagueService;
  let rpc: jasmine.Spy;
  let syncTracks: jasmine.Spy;
  let invoke: jasmine.Spy;
  let spotify: jasmine.SpyObj<SpotifyDataService>;

  beforeEach(() => {
    rpc = jasmine.createSpy('rpc').and.resolveTo({data: 'league-id', error: null});
    syncTracks = jasmine.createSpy('syncTracks').and.resolveTo();
    invoke = jasmine.createSpy('invoke').and.resolveTo({data: {ok: true, failed: 0}, error: null});
    spotify = jasmine.createSpyObj<SpotifyDataService>('SpotifyDataService', ['searchTracks', 'getSingleTrack']);
    spotify.searchTracks.and.returnValue(of({tracks: {items: [track()]}}));
    spotify.getSingleTrack.and.returnValue(of(track()));

    TestBed.configureTestingModule({
      providers: [
        SongLeagueService,
        {provide: SpotifyDataService, useValue: spotify},
        {
          provide: SupabaseService,
          useValue: {
            syncTracks,
            client: {rpc, functions: {invoke}}
          }
        }
      ]
    });
    service = TestBed.inject(SongLeagueService);
  });

  it('creates a private high-entropy invitation without persisting the raw token in the client model', async () => {
    const created = await service.createLeague('Friday Finds', 'Europe/Vienna');
    const parameters = rpc.calls.mostRecent().args[1];

    expect(rpc.calls.mostRecent().args[0]).toBe('create_song_league');
    expect(parameters.p_invite_token.length).toBe(64);
    expect(parameters.p_timezone).toBe('Europe/Vienna');
    expect(created.leagueId).toBe('league-id');
    expect(created.inviteUrl).toContain(`/song-league/join/${parameters.p_invite_token}`);
  });

  it('creates independent invitation tokens when more players are invited', async () => {
    await service.createInvite('league-id');
    const firstParameters = rpc.calls.mostRecent().args[1];
    await service.createInvite('league-id');
    const secondParameters = rpc.calls.mostRecent().args[1];

    expect(rpc.calls.allArgs().map(args => args[0])).toEqual([
      'rotate_song_league_invite',
      'rotate_song_league_invite'
    ]);
    expect(firstParameters.p_league_id).toBe('league-id');
    expect(firstParameters.p_invite_token).not.toBe(secondParameters.p_invite_token);
  });

  it('syncs canonical track metadata before asking the trusted RPC to validate a recommendation', async () => {
    const callOrder: string[] = [];
    syncTracks.and.callFake(async () => { callOrder.push('sync'); });
    rpc.and.callFake(async () => {
      callOrder.push('rpc');
      return {data: 'recommendation-id', error: null};
    });
    const selected = track();

    const recommendationId = await service.submitRecommendation('league-id', selected);

    expect(syncTracks).toHaveBeenCalledOnceWith([selected]);
    expect(rpc).toHaveBeenCalledWith('submit_song_league_recommendation', {
      p_league_id: 'league-id',
      p_track_id: selected.id
    });
    expect(callOrder).toEqual(['sync', 'rpc']);
    expect(recommendationId).toBe('recommendation-id');
  });

  it('uses the admin-only demo submission function for a demo league', async () => {
    rpc.and.resolveTo({data: 'demo-recommendation-id', error: null});
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

    await expectAsync(service.loadTrackFromSpotifyUrl('https://example.com/track/1234567890123456789012'))
      .toBeRejectedWithError('Paste a valid Spotify track URL or URI.');
  });

  it('asks the authenticated server function to refresh enabled weekly playlists', async () => {
    await service.syncWeeklyPlaylists('league-id');

    expect(invoke).toHaveBeenCalledOnceWith('song-league-playlist-sync', {
      body: {leagueId: 'league-id', createForCurrentUser: false}
    });
  });

  it('can opt the current player into a private auto-updating weekly playlist', async () => {
    await service.syncWeeklyPlaylists('league-id', true);

    expect(invoke).toHaveBeenCalledOnceWith('song-league-playlist-sync', {
      body: {leagueId: 'league-id', createForCurrentUser: true}
    });
  });

  it('deletes a league through the owner-only database function', async () => {
    await service.deleteLeague('league-id');

    expect(rpc).toHaveBeenCalledOnceWith('delete_song_league', {p_league_id: 'league-id'});
  });

  it('evaluates Friday in the league timezone rather than the device timezone', () => {
    expect(service.isFridayInTimezone('Europe/Vienna', new Date('2026-08-07T12:00:00Z'))).toBeTrue();
    expect(service.isFridayInTimezone('Europe/Vienna', new Date('2026-08-08T12:00:00Z'))).toBeFalse();
  });

  function track(): SongLeagueTrack {
    return {
      id: '1234567890123456789012',
      name: 'Discovery',
      artists: [{id: 'artist', name: 'Artist'}],
      album: {id: 'album', name: 'Album', images: [{url: 'cover.jpg'}]},
      external_ids: {isrc: 'ATTEST123456'},
      external_urls: {spotify: 'https://open.spotify.com/track/1234567890123456789012'}
    };
  }
});
