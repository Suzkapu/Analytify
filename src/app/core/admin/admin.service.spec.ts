import {TestBed} from '@angular/core/testing';

import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {AdminService} from './admin.service';
import {AdminUserSyncSettings} from './admin.models';

describe('AdminService', () => {
  let service: AdminService;
  let auth: jasmine.SpyObj<SpotifyAuthService>;
  let rpc: jasmine.Spy;
  let invoke: jasmine.Spy;

  beforeEach(() => {
    auth = jasmine.createSpyObj<SpotifyAuthService>('SpotifyAuthService', ['getSupabaseUserId']);
    rpc = jasmine.createSpy('rpc').and.resolveTo({data: true, error: null});
    invoke = jasmine.createSpy('invoke').and.resolveTo({data: {ok: true, sent: 1}, error: null});
    TestBed.configureTestingModule({providers: [
      AdminService,
      {provide: SpotifyAuthService, useValue: auth},
      {provide: SupabaseService, useValue: {client: {rpc, functions: {invoke}}}}
    ]});
    service = TestBed.inject(AdminService);
  });

  it('does not query Supabase for a local-only session', async () => {
    auth.getSupabaseUserId.and.returnValue(null);

    expect(await service.isAdmin(true)).toBeFalse();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('checks the trusted RPC when a cloud identity exists', async () => {
    auth.getSupabaseUserId.and.returnValue('supabase-user');

    expect(await service.isAdmin(true)).toBeTrue();
    expect(rpc).toHaveBeenCalledOnceWith('is_app_admin');
  });

  it('sends a test push only through the authenticated notification function', async () => {
    expect(await service.sendTestNotification()).toBe(1);
    expect(invoke).toHaveBeenCalledOnceWith('song-league-notifications', {
      body: {action: 'test'}
    });
  });

  it('loads the persisted interval unit for every scheduled task', async () => {
    rpc.and.resolveTo({data: [{
      user_id: 'user-1', spotify_id: 'spotify-1', display_name: 'Listener',
      history_interval_unit: 'hours', short_term_interval_unit: 'minutes',
      medium_term_interval_unit: 'days', long_term_interval_unit: 'days',
      song_league_playlist_fridays_only: false,
      song_league_playlist_interval_unit: 'hours', shared_playlist_interval_unit: 'minutes'
    }], error: null});

    const [user] = await service.listUsers();

    expect(user.historyIntervalUnit).toBe('hours');
    expect(user.shortTermIntervalUnit).toBe('minutes');
    expect(user.mediumTermIntervalUnit).toBe('days');
    expect(user.longTermIntervalUnit).toBe('days');
    expect(user.songLeaguePlaylistFridaysOnly).toBeFalse();
    expect(user.songLeaguePlaylistIntervalUnit).toBe('hours');
    expect(user.sharedPlaylistIntervalUnit).toBe('minutes');
  });

  it('saves all selected interval units with the schedule values', async () => {
    const user = {
      userId: 'user-1', spotifyId: 'spotify-1', displayName: 'Listener', profilePicUrl: '',
      backupActive: true, hasRefreshToken: true, enabled: true, timezone: 'Europe/Vienna',
      historyEnabled: true, historyIntervalMinutes: 2, historyIntervalUnit: 'hours',
      shortTermEnabled: true, shortTermIntervalHours: 30, shortTermIntervalUnit: 'minutes',
      mediumTermEnabled: true, mediumTermIntervalHours: 2, mediumTermIntervalUnit: 'days',
      longTermEnabled: true, longTermIntervalHours: 3, longTermIntervalUnit: 'days',
      songLeaguePlaylistsEnabled: true, songLeaguePlaylistFridaysOnly: false,
      songLeaguePlaylistIntervalMinutes: 4, songLeaguePlaylistIntervalUnit: 'hours',
      sharedPlaylistsEnabled: true, sharedPlaylistIntervalMinutes: 5, sharedPlaylistIntervalUnit: 'minutes',
      lastSuccessAt: null, lastError: null
    } as AdminUserSyncSettings;
    rpc.and.resolveTo({data: null, error: null});

    await service.updateUser(user);

    const parameters = rpc.calls.mostRecent().args[1];
    expect(parameters.p_history_interval_unit).toBe('hours');
    expect(parameters.p_short_term_interval_unit).toBe('minutes');
    expect(parameters.p_medium_term_interval_unit).toBe('days');
    expect(parameters.p_long_term_interval_unit).toBe('days');
    expect(parameters.p_song_league_playlist_fridays_only).toBeFalse();
    expect(parameters.p_song_league_playlist_interval_unit).toBe('hours');
    expect(parameters.p_shared_playlist_interval_unit).toBe('minutes');
  });
});
