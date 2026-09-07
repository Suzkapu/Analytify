import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SpotifyAuthService } from './spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import { firstValueFrom } from 'rxjs';
import { provideHttpClient, withInterceptorsFromDi, withXhr } from '@angular/common/http';

describe('SpotifyAuthService', () => {
    let service: SpotifyAuthService;
    let values: Record<string, string>;
    let authClient: any;
    let storage: any;
    let http: HttpTestingController;
    let supabaseService: any;
    let rpc: Mock;

    async function requestAfterMicrotasks(url: string) {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const requests = http.match(request => request.url === url);
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
            getSession: vi.fn().mockName('getSession').mockResolvedValue({ data: { session: null }, error: null }),
            signOut: vi.fn().mockName('signOut').mockResolvedValue({ error: null }),
            signInWithOAuth: vi.fn().mockName('signInWithOAuth').mockResolvedValue({ data: {}, error: null }),
            signInAnonymously: vi.fn().mockName('signInAnonymously'),
            exchangeCodeForSession: vi.fn().mockName('exchangeCodeForSession')
        };
        storage = {
            initFromDB: () => Promise.resolve(),
            getItem: (key: string) => values[key] ?? null,
            setItem: vi.fn().mockName('setItem').mockImplementation((key: string, value: string) => values[key] = value),
            removeItem: vi.fn().mockName('removeItem').mockImplementation((key: string) => delete values[key])
        };
        rpc = vi.fn().mockName('rpc').mockResolvedValue({ data: true, error: null });
        supabaseService = {
            client: {
                auth: authClient,
                rpc,
                functions: { invoke: vi.fn().mockName('invoke').mockResolvedValue({ data: { ok: true }, error: null }) }
            },
            ensureUserProfile: vi.fn().mockName('ensureUserProfile').mockResolvedValue(undefined),
            updateBackupActive: vi.fn().mockName('updateBackupActive').mockResolvedValue(undefined)
        };
        TestBed.configureTestingModule({
            imports: [],
            providers: [
                {
                    provide: StorageService,
                    useValue: storage
                },
                {
                    provide: SupabaseService,
                    useValue: supabaseService
                },
                provideHttpClient(withXhr(), withInterceptorsFromDi()),
                provideHttpClientTesting()
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

    it('unlinks the current push endpoint before logout without revoking browser permission', async () => {
        const unsubscribe = vi.fn().mockName('unsubscribe');
        const getSubscription = vi.fn().mockName('getSubscription').mockResolvedValue({
            endpoint: 'https://fcm.googleapis.com/fcm/send/device', unsubscribe
        });
        Object.defineProperty(navigator, 'serviceWorker', {
            configurable: true,
            value: {
                getRegistration: () => Promise.resolve({ pushManager: { getSubscription } })
            } as unknown as ServiceWorkerContainer
        });

        await service.logout();

        expect(rpc).toHaveBeenCalledWith('unlink_push_subscription', {
            p_endpoint: 'https://fcm.googleapis.com/fcm/send/device'
        });
        expect(vi.mocked(rpc).mock.invocationCallOrder.at(-1)!)
            .toBeLessThan(vi.mocked(authClient.signOut).mock.invocationCallOrder.at(-1)!);
        expect(unsubscribe).not.toHaveBeenCalled();
    });

    it('stores the Spotify provider token returned by the explicit code exchange', async () => {
        authClient.exchangeCodeForSession.mockResolvedValue({
            data: { session: { provider_token: 'spotify-token', provider_refresh_token: 'spotify-refresh' } },
            error: null
        });

        await firstValueFrom(service.exchangeSupabaseCodeForSession('one-time-code'));

        expect(values['spotifyAccessToken']).toBe('spotify-token');
        expect(values['spotifyRefreshToken']).toBe('spotify-refresh');
        expect(values['spotifyTokenExpiresAt']).toBeTruthy();
    });

    it('rejects a callback session that has no Spotify provider token', async () => {
        authClient.exchangeCodeForSession.mockResolvedValue({
            data: { session: { provider_token: null } },
            error: null
        });

        await expect(firstValueFrom(service.exchangeSupabaseCodeForSession('one-time-code'))).rejects.toThrowError(/provider token missing/i);
        expect(values['spotifyTokenExpiresAt']).toBeUndefined();
    });

    it('clears stale local and Supabase sessions before a user-initiated login', async () => {
        values['spotifyAccessToken'] = 'stale';
        values['spotifyRefreshToken'] = 'stale-refresh';
        values['spotifyTokenExpiresAt'] = '1';
        values['spotifyUserId'] = 'old-user';
        values['supabaseUserId'] = 'old-supabase-user';

        await service.loginWithSupabase(true);

        expect(authClient.signOut).toHaveBeenCalledWith({ scope: 'local' });
        expect(values['spotifyAccessToken']).toBeUndefined();
        expect(values['spotifyRefreshToken']).toBeUndefined();
        expect(authClient.signInWithOAuth).toHaveBeenCalled();
    });

    it('recovers a usable Spotify session before a callback error is shown', async () => {
        authClient.getSession.mockResolvedValue({
            data: {
                session: {
                    provider_token: 'recovered-token',
                    provider_refresh_token: 'recovered-refresh',
                    user: { id: 'supabase-user', user_metadata: { provider_id: 'spotify-user' } }
                }
            },
            error: null
        });

        expect(await service.recoverUsableSession()).toBe(true);
        expect(values['spotifyAccessToken']).toBe('recovered-token');
        expect(service.isTokenExpired()).toBe(false);
        expect(http.match(request => request.url === 'https://api.spotify.com/v1/me').length).toBe(0);
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
        tokenRequest.flush({ access_token: 'personal-access', refresh_token: 'personal-refresh', expires_in: 3600 });
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

    it('does not let account A callback data repopulate storage after logout begins', async () => {
        sessionStorage.setItem('analytify_personal_spotify_auth_request', JSON.stringify({
            clientId: '12345678901234567890123456789012',
            state: 'expected-state',
            verifier: 'pkce-verifier',
            returnUrl: '/stats',
            expectedSpotifyId: null,
            createdAt: Date.now()
        }));
        const callbackA = service.handlePersonalAppCallback('spotify-code', 'expected-state');
        http.expectOne('https://accounts.spotify.com/api/token')
            .flush({ access_token: 'account-a-token', refresh_token: 'account-a-refresh', expires_in: 3600 });
        const profileA = await requestAfterMicrotasks('https://api.spotify.com/v1/me');

        const logoutA = service.logout();
        profileA.flush({ id: 'account-a', display_name: 'Account A', images: [] });

        await expect(callbackA).rejects.toThrowError('Session ended.');
        await logoutA;
        expect(values['spotifyUserId']).toBeUndefined();
        expect(values['spotifyAccessToken']).toBeUndefined();
        expect(values['spotifyRefreshToken']).toBeUndefined();
    });

    it('rejects a personal-app callback with an invalid state before exchanging tokens', async () => {
        sessionStorage.setItem('analytify_personal_spotify_auth_request', JSON.stringify({
            clientId: '12345678901234567890123456789012', state: 'expected', verifier: 'verifier',
            returnUrl: '/playlists', expectedSpotifyId: null, createdAt: Date.now()
        }));

        await expect(service.handlePersonalAppCallback('code', 'different')).rejects.toThrowError(/invalid authorization state/i);
        expect(sessionStorage.getItem('analytify_personal_spotify_auth_request')).toBeNull();
    });

    it('rejects an expired personal-app callback request', async () => {
        sessionStorage.setItem('analytify_personal_spotify_auth_request', JSON.stringify({
            clientId: '12345678901234567890123456789012', state: 'expected', verifier: 'verifier',
            returnUrl: '/playlists', expectedSpotifyId: null, createdAt: Date.now() - 10 * 60000 - 1
        }));

        await expect(service.handlePersonalAppCallback('code', 'expected')).rejects.toThrowError(/authorization request expired/i);
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
            .flush({ access_token: 'other-access', refresh_token: 'other-refresh', expires_in: 3600 });
        const profileRequest = await requestAfterMicrotasks('https://api.spotify.com/v1/me');
        profileRequest.flush({ id: 'other-user', display_name: 'Other user', images: [] });

        await expect(callback).rejects.toThrowError(/does not match the existing Analytify profile/i);
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
            .flush({ access_token: 'personal-access', refresh_token: 'personal-refresh', expires_in: 3600 });
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
        request.flush({ access_token: 'new-personal-token', expires_in: 3600 });

        expect((await refreshed).access_token).toBe('new-personal-token');
        expect(values['spotifyAccessToken']).toBe('new-personal-token');
    });

    it('creates one email-free anonymous identity only when cloud access is enabled', async () => {
        values['spotifyConnectionMode'] = 'personal_pkce';
        values['personalSpotifyClientId'] = '12345678901234567890123456789012';
        values['spotifyAccessToken'] = 'personal-access';
        values['spotifyRefreshToken'] = 'personal-refresh';
        values['spotifyTokenExpiresAt'] = String(Date.now() + 3600000);
        values['spotifyUserId'] = 'personal-user_dev';
        authClient.signInAnonymously.mockResolvedValue({
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

        await service.enableCloudIdentity();

        expect(authClient.signInAnonymously).toHaveBeenCalledTimes(1);
        expect(values['anonymousCloudIdentity']).toBe('true');
        expect(values['supabaseUserId']).toBe('11111111-1111-4111-8111-111111111111');
        expect(supabaseService.ensureUserProfile).not.toHaveBeenCalled();
        expect(supabaseService.client.functions.invoke).toHaveBeenCalledWith('spotify-credentials', expect.objectContaining({ body: expect.objectContaining({
                action: 'profile',
                profileUserId: '11111111-1111-4111-8111-111111111111'
            }) }));
        const body = vi.mocked(supabaseService.client.functions.invoke).mock.lastCall![1].body;
        expect(body.refreshToken).toBeUndefined();
        expect(values['collaborationIdentityReady']).toBe('true');
        expect(values['cloudIdentityReady']).toBeUndefined();
    });

    it('enables Cloud Sync after registering a personal-app credential', async () => {
        values['spotifyConnectionMode'] = 'personal_pkce';
        values['personalSpotifyClientId'] = '12345678901234567890123456789012';
        values['spotifyAccessToken'] = 'personal-access';
        values['spotifyRefreshToken'] = 'personal-refresh';
        values['spotifyTokenExpiresAt'] = String(Date.now() + 3600000);
        values['spotifyUserId'] = 'stable-account-id';
        values['11111111-1111-4111-8111-111111111111_backup_upload_manifest'] = JSON.stringify({
            version: 1, completed: ['listening-history'], failures: {}
        });
        authClient.signInAnonymously.mockResolvedValue({
            data: { session: { user: { id: '11111111-1111-4111-8111-111111111111', is_anonymous: true } } },
            error: null
        });
        vi.spyOn(service as any, 'pushLocalCacheToDatabase').mockResolvedValue(undefined);

        await service.enableBackup();

        expect(supabaseService.client.functions.invoke).toHaveBeenCalledWith('spotify-credentials', expect.objectContaining({ body: expect.objectContaining({
                connectionMode: 'personal_pkce',
                clientId: '12345678901234567890123456789012'
            }) }));
        expect(supabaseService.updateBackupActive).toHaveBeenCalledTimes(1);
        expect(supabaseService.updateBackupActive).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', true);
        expect(values['11111111-1111-4111-8111-111111111111_backup_active']).toBe('true');
        expect(values['11111111-1111-4111-8111-111111111111_backup_upload_manifest']).toBeUndefined();
        expect(vi.mocked((service as any).pushLocalCacheToDatabase).mock.invocationCallOrder[0])
            .toBeLessThan(vi.mocked(supabaseService.updateBackupActive).mock.invocationCallOrder[0]);
        expect(service.backupActivationState).toBe('active');
    });

    it('keeps Cloud Backup inactive when a required upload fails', async () => {
        values['supabaseUserId'] = '11111111-1111-4111-8111-111111111111';
        values['spotifyAccessToken'] = 'access-token';
        values['spotifyRefreshToken'] = 'refresh-token';
        values['spotifyUserId'] = 'spotify-user';
        values['11111111-1111-4111-8111-111111111111_backup_active'] = 'false';
        vi.spyOn(service as any, 'pushLocalCacheToDatabase').mockRejectedValue(new Error('Listening history: database unavailable'));

        await expect(service.enableBackup()).rejects.toThrowError(/Listening history/);

        expect(supabaseService.updateBackupActive).not.toHaveBeenCalled();
        expect(values['11111111-1111-4111-8111-111111111111_backup_active']).toBe('false');
        expect(service.backupActivationState).toBe('failed');
    });

    it('persists completed upload steps and resumes only failed datasets', async () => {
        values['spotifyUserId'] = 'spotify-user';
        values['spotify-user_recently_played'] = JSON.stringify([{ track: { id: 'track-1' }, played_at: '2026-09-05T08:00:00Z' }]);
        values['cache-key'] = 'cached value';
        storage.getStatsHistory = vi.fn().mockName('getStatsHistory').mockResolvedValue([]);
        storage.getCacheKeys = vi.fn().mockName('getCacheKeys').mockReturnValue(['cache-key']);
        storage.shouldSyncUserCacheKey = vi.fn().mockName('shouldSyncUserCacheKey').mockReturnValue(true);
        supabaseService.syncListeningHistory = vi.fn().mockName('syncListeningHistory').mockResolvedValue(undefined);
        let saveCacheAttempts = 0;
        supabaseService.saveUserCache = vi.fn().mockName('saveUserCache').mockImplementation(() => {
            saveCacheAttempts++;
            if (saveCacheAttempts <= 3) {
                return Promise.reject(new Error('cache unavailable'));
            }
            return Promise.resolve();
        });
        (service as any).backupRetryDelays = [0, 0];

        await expect((service as any).pushLocalCacheToDatabase('supabase-user')).rejects.toThrowError(/Local cache.*cache unavailable/s);
        expect(supabaseService.syncListeningHistory).toHaveBeenCalledTimes(1);
        expect(values['supabase-user_backup_upload_manifest']).toContain('listening-history');

        await (service as any).pushLocalCacheToDatabase('supabase-user');

        expect(supabaseService.syncListeningHistory).toHaveBeenCalledTimes(1);
        expect(supabaseService.saveUserCache).toHaveBeenCalledTimes(4);
        expect(values['supabase-user_backup_upload_manifest']).toContain('cache:cache-key');
        expect(service.syncProgress).toBe(100);
    });

    it('coalesces overlapping hosted credential registrations', async () => {
        values['supabaseUserId'] = '11111111-1111-4111-8111-111111111111';
        values['spotifyUserId'] = 'spotify-user';
        values['spotifyAccessToken'] = 'hosted-access';
        values['spotifyRefreshToken'] = 'hosted-refresh';

        const first = (service as any).registerCurrentSpotifyCredentials();
        const second = (service as any).registerCurrentSpotifyCredentials();
        await Promise.all([first, second]);

        expect(supabaseService.client.functions.invoke).toHaveBeenCalledTimes(1);
    });

    it('models collaboration, backup, and scheduled access independently', () => {
        values['spotifyConnectionMode'] = 'personal_pkce';
        expect(service.getCloudCapabilities()).toEqual({
            localOnly: true, collaboration: false, backup: false, scheduledSpotifyAccess: false
        });

        values['spotifyConnectionMode'] = 'hosted';
        values['supabaseUserId'] = 'hosted-cloud-user';
        expect(service.getCloudCapabilities()).toEqual({
            localOnly: false, collaboration: true, backup: false, scheduledSpotifyAccess: false
        });

        values['spotifyConnectionMode'] = 'personal_pkce';
        values['supabaseUserId'] = 'cloud-user';
        values['collaborationIdentityReady'] = 'true';

        expect(service.getCloudCapabilities()).toEqual({
            localOnly: false, collaboration: true, backup: false, scheduledSpotifyAccess: false
        });

        values['cloudIdentityReady'] = 'true';
        values['cloud-user_backup_active'] = 'true';
        expect(service.getCloudCapabilities()).toEqual({
            localOnly: false, collaboration: true, backup: true, scheduledSpotifyAccess: true
        });
    });

    it('deletes unattended Spotify credentials without deleting collaboration identity', async () => {
        values['spotifyConnectionMode'] = 'personal_pkce';
        values['supabaseUserId'] = '11111111-1111-4111-8111-111111111111';
        values['collaborationIdentityReady'] = 'true';
        values['cloudIdentityReady'] = 'true';

        await service.disableScheduledSpotifyAccess();

        expect(supabaseService.client.functions.invoke).toHaveBeenCalledWith('spotify-credentials', { body: { action: 'delete_credentials', profileUserId: '11111111-1111-4111-8111-111111111111' } });
        expect(values['cloudIdentityReady']).toBeUndefined();
        expect(service.hasCloudIdentity()).toBe(true);
    });

    it('explains a disabled anonymous-auth server setting when Cloud Backup is enabled', async () => {
        values['spotifyConnectionMode'] = 'personal_pkce';
        authClient.signInAnonymously.mockResolvedValue({
            data: { session: null },
            error: { message: 'Anonymous sign-ins are disabled' }
        });

        await expect(service.enableCloudIdentity()).rejects.toThrowError(/temporarily unavailable.*anonymous cloud identities are disabled/i);
    });
});
