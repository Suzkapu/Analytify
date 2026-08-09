import { TestBed } from '@angular/core/testing';
import {HttpClientTestingModule} from '@angular/common/http/testing';
import { SpotifyAuthService } from './spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {firstValueFrom} from 'rxjs';

describe('SpotifyAuthService', () => {
  let service: SpotifyAuthService;
  let values: Record<string, string>;
  let authClient: any;
  let storage: any;

  beforeEach(() => {
    values = {};
    authClient = {
      getSession: jasmine.createSpy('getSession').and.resolveTo({data: {session: null}, error: null}),
      signOut: jasmine.createSpy('signOut').and.resolveTo({error: null}),
      signInWithOAuth: jasmine.createSpy('signInWithOAuth').and.resolveTo({data: {}, error: null}),
      exchangeCodeForSession: jasmine.createSpy('exchangeCodeForSession')
    };
    storage = {
      initFromDB: () => Promise.resolve(),
      getItem: (key: string) => values[key] ?? null,
      setItem: jasmine.createSpy('setItem').and.callFake((key: string, value: string) => values[key] = value),
      removeItem: jasmine.createSpy('removeItem').and.callFake((key: string) => delete values[key])
    };
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: StorageService,
          useValue: storage
        },
        {
          provide: SupabaseService,
          useValue: {client: {auth: authClient}}
        }
      ]
    });
    service = TestBed.inject(SpotifyAuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('stores the Spotify provider token returned by the explicit code exchange', async () => {
    authClient.exchangeCodeForSession.and.resolveTo({
      data: {session: {provider_token: 'spotify-token', provider_refresh_token: 'spotify-refresh'}},
      error: null
    });

    await firstValueFrom(service.exchangeSupabaseCodeForSession('one-time-code'));

    expect(values['spotifyAccessToken']).toBe('spotify-token');
    expect(values['spotifyRefreshToken']).toBe('spotify-refresh');
    expect(values['spotifyTokenExpiresAt']).toBeTruthy();
  });

  it('rejects a callback session that has no Spotify provider token', async () => {
    authClient.exchangeCodeForSession.and.resolveTo({
      data: {session: {provider_token: null}},
      error: null
    });

    await expectAsync(firstValueFrom(service.exchangeSupabaseCodeForSession('one-time-code')))
      .toBeRejectedWithError(/provider token missing/i);
    expect(values['spotifyTokenExpiresAt']).toBeUndefined();
  });

  it('clears stale local and Supabase sessions before a user-initiated login', async () => {
    values['spotifyAccessToken'] = 'stale';
    values['spotifyRefreshToken'] = 'stale-refresh';
    values['spotifyTokenExpiresAt'] = '1';
    values['spotifyUserId'] = 'old-user';
    values['supabaseUserId'] = 'old-supabase-user';

    await service.loginWithSupabase(true);

    expect(authClient.signOut).toHaveBeenCalledWith({scope: 'local'});
    expect(values['spotifyAccessToken']).toBeUndefined();
    expect(values['spotifyRefreshToken']).toBeUndefined();
    expect(authClient.signInWithOAuth).toHaveBeenCalled();
  });

  it('recovers a usable Spotify session before a callback error is shown', async () => {
    authClient.getSession.and.resolveTo({
      data: {
        session: {
          provider_token: 'recovered-token',
          provider_refresh_token: 'recovered-refresh',
          user: {id: 'supabase-user', user_metadata: {provider_id: 'spotify-user'}}
        }
      },
      error: null
    });

    expect(await service.recoverUsableSession()).toBeTrue();
    expect(values['spotifyAccessToken']).toBe('recovered-token');
    expect(service.isTokenExpired()).toBeFalse();
  });
});
