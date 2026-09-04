import { TestBed } from '@angular/core/testing';
import {HttpClientTestingModule, HttpTestingController} from '@angular/common/http/testing';
import { SpotifyAuthService } from './spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {firstValueFrom} from 'rxjs';

describe('SpotifyAuthService', () => {
  let service: SpotifyAuthService;
  let values: Record<string, string>;
  let authClient: any;
  let storage: any;
  let http: HttpTestingController;
  let supabaseService: any;

  async function requestAfterMicrotasks(url: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const requests = http.match(url);
      if (requests.length > 0) {
        expect(requests.length).toBe(1);
        return requests[0];
      }
      await Promise.resolve();
    }
    throw new Error(`Timed out waiting for ${url}`);
  }

  beforeEach(() => {
    values = {};
    authClient = {
      getSession: jasmine.createSpy('getSession').and.resolveTo({data: {session: null}, error: null}),
      signOut: jasmine.createSpy('signOut').and.resolveTo({error: null}),
      signInWithOAuth: jasmine.createSpy('signInWithOAuth').and.resolveTo({data: {}, error: null}),
      signInAnonymously: jasmine.createSpy('signInAnonymously'),
      exchangeCodeForSession: jasmine.createSpy('exchangeCodeForSession')
    };
    storage = {
      initFromDB: () => Promise.resolve(),
      getItem: (key: string) => values[key] ?? null,
      setItem: jasmine.createSpy('setItem').and.callFake((key: string, value: string) => values[key] = value),
      removeItem: jasmine.createSpy('removeItem').and.callFake((key: string) => delete values[key])
    };
    supabaseService = {
      client: {
        auth: authClient,
        functions: {invoke: jasmine.createSpy('invoke').and.resolveTo({data: {ok: true}, error: null})}
      },
      ensureUserProfile: jasmine.createSpy('ensureUserProfile').and.resolveTo(),
      updateBackupActive: jasmine.createSpy('updateBackupActive').and.resolveTo()
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
          useValue: supabaseService
        }
      ]
    });
    service = TestBed.inject(SpotifyAuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    localStorage.removeItem('unrelated-application-setting');
    sessionStorage.clear();
    http.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('clears only Analytify session state when logging out', async () => {
    values['spotifyAccessToken'] = 'token';
    values['spotifyUserId'] = 'spotify-user';
    values['supabaseUserId'] = 'supabase-user';
    localStorage.setItem('unrelated-application-setting', 'keep-me');
    sessionStorage.setItem('unrelated-session-setting', 'keep-me-too');
    sessionStorage.setItem('analytify_personal_spotify_auth_request', 'pending');
    sessionStorage.setItem('analytify_compare_auth_request', 'pending');
    sessionStorage.setItem('analytifyAuthReturnUrl', '/stats');

    await service.logout();

    expect(localStorage.getItem('unrelated-application-setting')).toBe('keep-me');
    expect(sessionStorage.getItem('unrelated-session-setting')).toBe('keep-me-too');
    expect(sessionStorage.getItem('analytify_personal_spotify_auth_request')).toBeNull();
    expect(sessionStorage.getItem('analytify_compare_auth_request')).toBeNull();
    expect(sessionStorage.getItem('analytifyAuthReturnUrl')).toBeNull();
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
    const profileRequest = await requestAfterMicrotasks('https://api.spotify.com/v1/me');
    profileRequest.flush({id: 'spotify-user', display_name: 'Recovered listener', images: []});
    await Promise.resolve();
  });

  it('exchanges a personal-app PKCE code and stores a local-only Spotify identity', async () => {
    sessionStorage.setItem('analytify_personal_spotify_auth_request', JSON.stringify({
      clientId: '12345678901234567890123456789012',
      state: 'expected-state',
      verifier: 'pkce-verifier',
      returnUrl: '/stats',
      expectedSpotifyId: null,
      createdAt: Date.now()
    }));

    const result = service.handlePersonalAppCallback('spotify-code', 'expected-state');
    const tokenRequest = http.expectOne('https://accounts.spotify.com/api/token');
    expect(tokenRequest.request.body).toContain('code_verifier=pkce-verifier');
    expect(tokenRequest.request.body).not.toContain('client_secret');
    tokenRequest.flush({access_token: 'personal-access', refresh_token: 'personal-refresh', expires_in: 3600});
    const profileRequest = await requestAfterMicrotasks('https://api.spotify.com/v1/me');
    expect(profileRequest.request.headers.get('Authorization')).toBe('Bearer personal-access');
    profileRequest.flush({
      account_id: 'stable-personal-account',
      id: 'personal-user',
      display_name: 'Private listener',
      images: []
    });

    expect(await result).toBe('/stats');
    expect(values['spotifyConnectionMode']).toBe('personal_pkce');
    expect(values['personalSpotifyClientId']).toBe('12345678901234567890123456789012');
    expect(values['spotifyUserId']).toContain('stable-personal-account');
    expect(values[`${service.getUserId()}_spotify_profile_id`]).toBe('personal-user');
    expect(values['spotifyRefreshToken']).toBe('personal-refresh');
    expect(values['supabaseUserId']).toBeUndefined();
    expect(authClient.signInAnonymously).not.toHaveBeenCalled();
  });

  it('rejects a personal-app callback with an invalid state before exchanging tokens', async () => {
    sessionStorage.setItem('analytify_personal_spotify_auth_request', JSON.stringify({
      clientId: '12345678901234567890123456789012', state: 'expected', verifier: 'verifier',
      returnUrl: '/playlists', expectedSpotifyId: null, createdAt: Date.now()
    }));

    await expectAsync(service.handlePersonalAppCallback('code', 'different'))
      .toBeRejectedWithError(/invalid authorization state/i);
    expect(sessionStorage.getItem('analytify_personal_spotify_auth_request')).toBeNull();
  });

  it('rejects an expired personal-app callback request', async () => {
    sessionStorage.setItem('analytify_personal_spotify_auth_request', JSON.stringify({
      clientId: '12345678901234567890123456789012', state: 'expected', verifier: 'verifier',
      returnUrl: '/playlists', expectedSpotifyId: null, createdAt: Date.now() - 10 * 60_000 - 1
    }));

    await expectAsync(service.handlePersonalAppCallback('code', 'expected'))
      .toBeRejectedWithError(/authorization request expired/i);
  });

  it('does not replace an existing profile when Spotify returns a different ID', async () => {
    values['spotifyUserId'] = 'existing-user';
    values['spotifyAccessToken'] = 'existing-token';
    sessionStorage.setItem('analytify_personal_spotify_auth_request', JSON.stringify({
      clientId: '12345678901234567890123456789012', state: 'expected', verifier: 'verifier',
      returnUrl: '/playlists', expectedSpotifyId: 'existing-user', createdAt: Date.now()
    }));

    const callback = service.handlePersonalAppCallback('code', 'expected');
    http.expectOne('https://accounts.spotify.com/api/token')
      .flush({access_token: 'other-access', refresh_token: 'other-refresh', expires_in: 3600});
    const profileRequest = await requestAfterMicrotasks('https://api.spotify.com/v1/me');
    profileRequest.flush({id: 'other-user', display_name: 'Other user', images: []});

    await expectAsync(callback).toBeRejectedWithError(/does not match the existing Analytify profile/i);
    expect(values['spotifyUserId']).toBe('existing-user');
    expect(values['spotifyAccessToken']).toBe('existing-token');
    expect(values['spotifyRefreshToken']).toBeUndefined();
  });

  it('preserves an existing profile key when Spotify also returns a stable account ID', async () => {
    values['spotifyUserId'] = 'existing-user';
    values['spotifyAccessToken'] = 'existing-token';
    sessionStorage.setItem('analytify_personal_spotify_auth_request', JSON.stringify({
      clientId: '12345678901234567890123456789012', state: 'expected', verifier: 'verifier',
      returnUrl: '/playlists', expectedSpotifyId: 'existing-user', createdAt: Date.now()
    }));

    const callback = service.handlePersonalAppCallback('code', 'expected');
    http.expectOne('https://accounts.spotify.com/api/token')
      .flush({access_token: 'personal-access', refresh_token: 'personal-refresh', expires_in: 3600});
    const profileRequest = await requestAfterMicrotasks('https://api.spotify.com/v1/me');
    profileRequest.flush({
      account_id: 'stable-account-id',
      id: 'existing-user',
      display_name: 'Existing user',
      images: []
    });

    expect(await callback).toBe('/playlists');
    expect(values['spotifyUserId']).toBe('existing-user');
    expect(values['spotifyRefreshToken']).toBe('personal-refresh');
  });

  it('refreshes a personal-app token with the public Client ID and no secret', async () => {
    values['spotifyConnectionMode'] = 'personal_pkce';
    values['personalSpotifyClientId'] = '12345678901234567890123456789012';
    values['spotifyRefreshToken'] = 'refresh-me';

    const refreshed = firstValueFrom(service.refreshToken());
    const request = http.expectOne('https://accounts.spotify.com/api/token');
    expect(request.request.body).toContain('client_id=12345678901234567890123456789012');
    expect(request.request.body).not.toContain('client_secret');
    request.flush({access_token: 'new-personal-token', expires_in: 3600});

    expect((await refreshed).access_token).toBe('new-personal-token');
    expect(values['spotifyAccessToken']).toBe('new-personal-token');
  });

  it('creates one email-free anonymous identity only when cloud access is enabled', async () => {
    values['spotifyConnectionMode'] = 'personal_pkce';
    values['personalSpotifyClientId'] = '12345678901234567890123456789012';
    values['spotifyAccessToken'] = 'personal-access';
    values['spotifyRefreshToken'] = 'personal-refresh';
    values['spotifyTokenExpiresAt'] = String(Date.now() + 3_600_000);
    values['spotifyUserId'] = 'personal-user_dev';
    authClient.signInAnonymously.and.resolveTo({
      data: {
        session: {
          user: {
            id: '11111111-1111-4111-8111-111111111111',
            is_anonymous: true,
            email: undefined,
            phone: undefined
          }
        }
      },
      error: null
    });

    const enabling = service.enableCloudIdentity();
    const profileRequest = await requestAfterMicrotasks('https://api.spotify.com/v1/me');
    profileRequest.flush({id: 'personal-user', display_name: 'Private listener', images: []});
    await enabling;

    expect(authClient.signInAnonymously).toHaveBeenCalledTimes(1);
    expect(values['anonymousCloudIdentity']).toBe('true');
    expect(values['supabaseUserId']).toBe('11111111-1111-4111-8111-111111111111');
    expect(supabaseService.ensureUserProfile).toHaveBeenCalled();
    expect(supabaseService.client.functions.invoke).toHaveBeenCalledWith(
      'spotify-credentials',
      jasmine.objectContaining({body: jasmine.objectContaining({connectionMode: 'personal_pkce'})})
    );
  });

  it('enables Cloud Sync after registering a personal-app credential', async () => {
    values['spotifyConnectionMode'] = 'personal_pkce';
    values['personalSpotifyClientId'] = '12345678901234567890123456789012';
    values['spotifyAccessToken'] = 'personal-access';
    values['spotifyRefreshToken'] = 'personal-refresh';
    values['spotifyTokenExpiresAt'] = String(Date.now() + 3_600_000);
    values['spotifyUserId'] = 'stable-account-id';
    authClient.signInAnonymously.and.resolveTo({
      data: {session: {user: {id: '11111111-1111-4111-8111-111111111111', is_anonymous: true}}},
      error: null
    });
    spyOn<any>(service, 'pushLocalCacheToDatabase').and.resolveTo();

    const enabling = service.enableBackup();
    const profileRequest = await requestAfterMicrotasks('https://api.spotify.com/v1/me');
    profileRequest.flush({account_id: 'stable-account-id', id: 'public-profile-id', images: []});
    await enabling;

    expect(supabaseService.client.functions.invoke).toHaveBeenCalledWith(
      'spotify-credentials',
      jasmine.objectContaining({body: jasmine.objectContaining({
        connectionMode: 'personal_pkce',
        clientId: '12345678901234567890123456789012'
      })})
    );
    expect(supabaseService.updateBackupActive)
      .toHaveBeenCalledOnceWith('11111111-1111-4111-8111-111111111111', true);
    expect(values['11111111-1111-4111-8111-111111111111_backup_active']).toBe('true');
  });

  it('explains a disabled anonymous-auth server setting when Cloud Backup is enabled', async () => {
    values['spotifyConnectionMode'] = 'personal_pkce';
    authClient.signInAnonymously.and.resolveTo({
      data: {session: null},
      error: {message: 'Anonymous sign-ins are disabled'}
    });

    await expectAsync(service.enableCloudIdentity())
      .toBeRejectedWithError(/temporarily unavailable.*anonymous cloud identities are disabled/i);
  });
});
