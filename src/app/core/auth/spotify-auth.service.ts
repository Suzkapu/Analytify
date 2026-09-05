import {Injectable} from '@angular/core';
import {environment} from "@env/environment";
import {HttpClient, HttpContext, HttpHeaders, HttpParams} from '@angular/common/http';
import {Observable, throwError, Subject, from, defer, firstValueFrom} from 'rxjs';
import {tap, catchError, shareReplay, switchMap, finalize} from 'rxjs/operators';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {PersonalSpotifyAuthRequest, SpotifyConnectionMode} from './spotify-auth.models';
import {TRANSIENT_SPOTIFY_REQUEST} from '@core/compare-room/spotify-request-context';

const console = createScopedLogger('Authentication');

function toDailySnapshotDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  if (date.getHours() < 1) {
    date.setDate(date.getDate() - 1);
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

@Injectable({
  providedIn: 'root',
})
export class SpotifyAuthService {
  private readonly storageKey = 'spotifyAccessToken';
  private readonly connectionModeKey = 'spotifyConnectionMode';
  private readonly personalClientIdKey = 'personalSpotifyClientId';
  private readonly personalRequestKey = 'analytify_personal_spotify_auth_request';
  private readonly anonymousCloudKey = 'anonymousCloudIdentity';
  private readonly cloudIdentityReadyKey = 'cloudIdentityReady';
  private refreshObservable: Observable<any> | null = null;
  private restoreSessionPromise: Promise<boolean> | null = null;
  logout$ = new Subject<void>();

  isSyncing = false;
  syncProgress = 0;
  initialSyncPromise: Promise<void> | null = null;
  private credentialRegistrationPromise: Promise<string | null> | null = null;

  constructor(
    private storageService: StorageService,
    private supabaseService: SupabaseService,
    private http: HttpClient
  ) {
    this.storageService.initFromDB().then(async () => {
      // The callback owns the one-time PKCE code exchange. Starting session
      // restoration here would race Supabase's callback processing.
      if (this.isOAuthCallbackInProgress()) {
        return;
      }
      if (!this.isAuthenticated()) {
        await this.recoverUsableSession().catch(() => false);
      }
      if (this.isAuthenticated()) {
        this.ensureInitialSync();
      }
    });
  }

  ensureInitialSync(): Promise<void> {
    if (!this.initialSyncPromise) {
      this.initialSyncPromise = this._ensureInitialSync();
    }
    return this.initialSyncPromise;
  }

  private async _ensureInitialSync(): Promise<void> {
    const supabaseUserId = this.getSupabaseUserId();
    if (!supabaseUserId) return;

    // Complete cloud hydration before feature pages evaluate their local cache.
    // The promise is shared for the whole app session, so this runs only once.
    await this.syncBackupActiveStatus().catch(err => {
      console.warn('[Auth] Initial sync failed:', err);
    });
  }

  private get accessToken(): string | null {
    return this.storageService.getItem(this.storageKey);
  }

  async loginWithSupabase(promptConsent: boolean = true): Promise<any> {
    if (promptConsent) {
      // A user-initiated login must not inherit a Supabase session whose
      // Spotify provider token has expired or was never persisted.
      await this.clearSupabaseSession();
      this.clearSpotifyCredentials();
    }
    this.storageService.setItem(this.connectionModeKey, 'hosted', false);
    const queryParams: any = {
      access_type: 'offline'
    };
    if (promptConsent) {
      queryParams.prompt = 'consent';
    }
    return this.supabaseService.client.auth.signInWithOAuth({
      provider: 'spotify',
      options: {
        redirectTo: environment.spotifyRedirectUri,
        scopes: environment.spotifyScopes,
        queryParams
      }
    });
  }

  getConnectionMode(): SpotifyConnectionMode {
    return this.storageService.getItem(this.connectionModeKey) === 'personal_pkce'
      ? 'personal_pkce'
      : 'hosted';
  }

  isPersonalAppConnection(): boolean {
    return this.getConnectionMode() === 'personal_pkce';
  }

  getPersonalSpotifyClientId(): string {
    return this.storageService.getItem(this.personalClientIdKey) || '';
  }

  hasCloudIdentity(): boolean {
    if (!this.getSupabaseUserId()) return false;
    return !this.isPersonalAppConnection()
      || this.storageService.getItem(this.cloudIdentityReadyKey) === 'true';
  }

  isAnonymousCloudIdentity(): boolean {
    return this.storageService.getItem(this.anonymousCloudKey) === 'true';
  }

  async startPersonalAppAuthorization(clientId: string, returnUrl = '/playlists'): Promise<void> {
    const normalizedClientId = clientId.trim();
    if (!/^[a-zA-Z0-9]{32}$/.test(normalizedClientId)) {
      throw new Error('Enter the 32-character Client ID from your Spotify Developer app.');
    }

    const verifier = this.randomUrlSafeString(64);
    const request: PersonalSpotifyAuthRequest = {
      clientId: normalizedClientId,
      state: this.randomUrlSafeString(32),
      verifier,
      returnUrl: this.safeInternalReturnUrl(returnUrl),
      expectedSpotifyId: this.normalizedSpotifyId(this.getUserId()),
      createdAt: Date.now()
    };
    const challenge = await this.createPkceChallenge(verifier);
    sessionStorage.setItem(this.personalRequestKey, JSON.stringify(request));

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: normalizedClientId,
      redirect_uri: environment.personalSpotifyRedirectUri,
      scope: environment.spotifyScopes,
      state: request.state,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      show_dialog: 'true'
    });
    window.location.assign(`${environment.authorizeUrl}?${params.toString()}`);
  }

  clearPendingPersonalAppAuthorization(): void {
    sessionStorage.removeItem(this.personalRequestKey);
  }

  async handlePersonalAppCallback(code: string, state: string): Promise<string> {
    const rawRequest = sessionStorage.getItem(this.personalRequestKey);
    if (!rawRequest) {
      throw new Error('The personal Spotify authorization request is missing or expired.');
    }

    let request: PersonalSpotifyAuthRequest;
    try {
      request = JSON.parse(rawRequest) as PersonalSpotifyAuthRequest;
    } catch {
      sessionStorage.removeItem(this.personalRequestKey);
      throw new Error('The saved Spotify authorization request is invalid.');
    }
    sessionStorage.removeItem(this.personalRequestKey);
    if (request.state !== state) {
      throw new Error('Spotify returned an invalid authorization state. Please start again.');
    }
    if (Date.now() - request.createdAt > 10 * 60_000) {
      throw new Error('The Spotify authorization request expired. Please start again.');
    }
    if (!/^[a-zA-Z0-9]{32}$/.test(request.clientId)) {
      throw new Error('The saved Spotify Client ID is invalid.');
    }

    const tokenBody = new HttpParams()
      .set('client_id', request.clientId)
      .set('grant_type', 'authorization_code')
      .set('code', code)
      .set('redirect_uri', environment.personalSpotifyRedirectUri)
      .set('code_verifier', request.verifier);
    const token = await firstValueFrom(this.http.post<any>(
      'https://accounts.spotify.com/api/token',
      tokenBody.toString(),
      {headers: new HttpHeaders({'Content-Type': 'application/x-www-form-urlencoded'})}
    ));
    if (!token?.access_token || !token?.refresh_token) {
      throw new Error('Spotify did not return the tokens required for a persistent session.');
    }

    const profile = await firstValueFrom(this.http.get<any>(`${environment.spotifyUrl}/me`, {
      headers: new HttpHeaders({Authorization: `Bearer ${token.access_token}`}),
      context: new HttpContext().set(TRANSIENT_SPOTIFY_REQUEST, true)
    }));
    const returnedSpotifyId = this.spotifyAccountIdentity(profile);
    if (!returnedSpotifyId) {
      throw new Error('Spotify did not return a usable profile.');
    }
    if (request.expectedSpotifyId && !this.spotifyProfileMatches(profile, request.expectedSpotifyId)) {
      throw new Error('This Spotify account does not match the existing Analytify profile. No data was changed.');
    }
    // Existing profiles retain their established key so their local and cloud
    // caches do not split when Spotify returns the newer stable account_id.
    const effectiveSpotifyId = request.expectedSpotifyId || returnedSpotifyId;

    if (this.getSupabaseUserId()) {
      const rotatedRefreshToken = await this.registerCurrentSpotifyCredentials(profile, {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        connectionMode: 'personal_pkce',
        clientId: request.clientId,
        spotifyId: effectiveSpotifyId
      });
      if (rotatedRefreshToken) token.refresh_token = rotatedRefreshToken;
    }

    this.storageService.setItem(this.connectionModeKey, 'personal_pkce', false);
    this.storageService.setItem(this.personalClientIdKey, request.clientId, false);
    this.setUserId(effectiveSpotifyId);
    this.storeSpotifyTokenResponse(token, false);
    const localSpotifyId = this.getUserId() || effectiveSpotifyId;
    const profileImage = profile.images?.[0]?.url || '';
    if (profileImage) {
      this.storageService.setItem(`${localSpotifyId}_profile_pic`, profileImage, false);
    } else {
      this.storageService.removeItem(`${localSpotifyId}_profile_pic`);
    }
    this.storageService.setItem(`${localSpotifyId}_display_name`, profile.display_name || '', false);
    // account_id is the durable cache identity for newer personal-app
    // sessions, while playlist.owner.id still uses the public Spotify profile
    // ID. Keep both so ownership checks never compare identifiers from two
    // different namespaces.
    if (profile.id) {
      this.storageService.setItem(`${localSpotifyId}_spotify_profile_id`, profile.id, false);
      this.storageService.setItem(`${localSpotifyId}_spotify_profile_id_verified`, 'true', false);
    }
    this.initialSyncPromise = null;

    return request.returnUrl;
  }

  async renewSpotifyAuthorization(returnUrl = '/playlists'): Promise<void> {
    if (this.isPersonalAppConnection()) {
      const clientId = this.getPersonalSpotifyClientId();
      if (!clientId) throw new Error('Reconnect your personal Spotify app from the login page.');
      await this.startPersonalAppAuthorization(clientId, returnUrl);
      return;
    }
    await this.loginWithSupabase(false);
  }

  /** Clears stale Supabase session state — call before re-initiating login after a server_error */
  async clearSupabaseSession(): Promise<void> {
    try {
      await this.supabaseService.client.auth.signOut({ scope: 'local' });
    } catch (e) {
      // Ignore errors — we just want to clear local state
    }
  }


  exchangeSupabaseCodeForSession(code: string): Observable<any> {
    return from(this.supabaseService.client.auth.exchangeCodeForSession(code)).pipe(
      tap(({ data, error }: any) => {
        if (error) throw error;
        const session = data?.session;
        if (session) {
          if (!session.provider_token) {
            throw new Error('Spotify provider token missing from OAuth callback. Please restart login.');
          }
          this.storageService.setItem(this.storageKey, session.provider_token);
          this.storageService.setItem(this.connectionModeKey, 'hosted', false);
          if (session.provider_refresh_token) {
            this.storageService.setItem('spotifyRefreshToken', session.provider_refresh_token);
          }
          const expiresAt = Date.now() + 3600 * 1000; // Spotify access token expires in 1 hour
          this.storageService.setItem('spotifyTokenExpiresAt', expiresAt.toString());

          if (session.user) {
            let spotifyId = session.user.user_metadata?.['provider_id'] || session.user.id;
            if (!environment.production) {
              spotifyId = `${spotifyId}_dev`;
            }
            this.storageService.setItem('spotifyUserId', spotifyId);
            this.storageService.setItem('supabaseUserId', session.user.id);

            const displayName = session.user.user_metadata?.['full_name'] || session.user.user_metadata?.['name'] || null;
            const profilePicUrl = session.user.user_metadata?.['avatar_url'] || null;
            this.initialSyncPromise = (async () => {
              try {
                if (session.provider_refresh_token) {
                  await this.registerCurrentSpotifyCredentials().catch(error => {
                    console.warn('Hosted Spotify credentials could not be moved to encrypted storage.', error);
                  });
                }
                await this.syncBackupActiveStatus();
              } catch (err) {
                console.warn('Failed during login synchronization setup:', err);
              }
            })();
          }
        }
      }),
      catchError(err => {
        console.error('Error exchanging code for session:', err);
        return throwError(() => err);
      })
    );
  }

  handleCallbackSession(): Observable<any> {
    return from(this.supabaseService.client.auth.getSession()).pipe(
      tap(({ data: { session } }: any) => {
        if (session) {
          if (!session.provider_token) {
            throw new Error('Spotify provider token missing from OAuth callback. Please restart login.');
          }
          this.storageService.setItem(this.storageKey, session.provider_token);
          this.storageService.setItem(this.connectionModeKey, 'hosted', false);
          if (session.provider_refresh_token) {
            this.storageService.setItem('spotifyRefreshToken', session.provider_refresh_token);
          }
          const expiresAt = Date.now() + 3600 * 1000; // Spotify access token expires in 1 hour
          this.storageService.setItem('spotifyTokenExpiresAt', expiresAt.toString());

          if (session.user) {
            let spotifyId = session.user.user_metadata?.['provider_id'] || session.user.id;
            if (!environment.production) {
              spotifyId = `${spotifyId}_dev`;
            }
            this.storageService.setItem('spotifyUserId', spotifyId);
            this.storageService.setItem('supabaseUserId', session.user.id);

            const displayName = session.user.user_metadata?.['full_name'] || session.user.user_metadata?.['name'] || null;
            const profilePicUrl = session.user.user_metadata?.['avatar_url'] || null;
            this.initialSyncPromise = (async () => {
              try {
                if (session.provider_refresh_token) {
                  await this.registerCurrentSpotifyCredentials().catch(error => {
                    console.warn('Hosted Spotify credentials could not be moved to encrypted storage.', error);
                  });
                }
                await this.syncBackupActiveStatus();
              } catch (err) {
                console.warn('Failed during callback login synchronization setup:', err);
              }
            })();
          }
        } else {
          throw new Error('No active session found.');
        }
      }),
      catchError(err => {
        console.error('Error handling callback session:', err);
        return throwError(() => err);
      })
    );
  }

  async restoreSessionFromSupabase(): Promise<boolean> {
    if (this.restoreSessionPromise) {
      return this.restoreSessionPromise;
    }
    this.restoreSessionPromise = this._restoreSessionFromSupabase();
    try {
      const result = await this.restoreSessionPromise;
      return result;
    } finally {
      this.restoreSessionPromise = null;
    }
  }

  async recoverUsableSession(): Promise<boolean> {
    await this.storageService.initFromDB();
    if (this.isAuthenticated() && !this.isTokenExpired()) {
      return true;
    }

    if (this.isPersonalAppConnection() && this.storageService.getItem('spotifyRefreshToken')) {
      try {
        await firstValueFrom(this.refreshToken());
        return this.isAuthenticated() && !this.isTokenExpired();
      } catch (error) {
        console.warn('[Auth] Personal Spotify token refresh failed:', error);
        return false;
      }
    }

    await this.restoreSessionFromSupabase();
    return this.isAuthenticated() && !this.isTokenExpired();
  }

  private async _restoreSessionFromSupabase(): Promise<boolean> {
    try {
      const { data: { session }, error } = await this.supabaseService.client.auth.getSession();
      if (error) throw error;
      
      if (session) {
        console.log('[Auth] Restoring session from Supabase client...');
        if (this.isPersonalAppConnection()) {
          if (session.user) {
            this.storageService.setItem('supabaseUserId', session.user.id, false);
            this.storageService.setItem(this.anonymousCloudKey, session.user.is_anonymous ? 'true' : 'false', false);
          }
          return this.isAuthenticated();
        }
        const hadUsableSpotifyAccessToken =
          !!this.storageService.getItem(this.storageKey) && !this.isTokenExpired();

        if (session.user) {
          let spotifyId = session.user.user_metadata?.['provider_id'] || session.user.id;
          if (!environment.production) {
            spotifyId = `${spotifyId}_dev`;
          }
          this.storageService.setItem('spotifyUserId', spotifyId);
          this.storageService.setItem('supabaseUserId', session.user.id);
          this.storageService.setItem(this.anonymousCloudKey, session.user.is_anonymous ? 'true' : 'false', false);
        }

        if (!hadUsableSpotifyAccessToken && session.provider_token) {
          this.storeSpotifyTokenResponse({
            access_token: session.provider_token,
            refresh_token: session.provider_refresh_token,
            expires_in: 3600
          });
        }
        
        return this.isAuthenticated();
      }
    } catch (e) {
      console.warn('[Auth] Failed to restore Supabase session:', e);
    }
    return false;
  }

  refreshToken(): Observable<any> {
    if (this.refreshObservable) {
      return this.refreshObservable;
    }

    if (this.isPersonalAppConnection()) {
      const refreshToken = this.storageService.getItem('spotifyRefreshToken');
      const clientId = this.getPersonalSpotifyClientId();
      if (!refreshToken || !clientId) {
        return throwError(() => new Error('The personal Spotify session cannot be refreshed. Please reconnect.'));
      }
      const body = new HttpParams()
        .set('grant_type', 'refresh_token')
        .set('refresh_token', refreshToken)
        .set('client_id', clientId);
      this.refreshObservable = this.http.post<any>(
        'https://accounts.spotify.com/api/token',
        body.toString(),
        {headers: new HttpHeaders({'Content-Type': 'application/x-www-form-urlencoded'})}
      ).pipe(
        tap(response => this.storeSpotifyTokenResponse(response)),
        finalize(() => this.refreshObservable = null),
        shareReplay(1)
      );
      return this.refreshObservable;
    }

    const refreshViaSupabase$ = defer(
      () => from(this.supabaseService.client.auth.refreshSession())
    ).pipe(
      switchMap(({ data: { session }, error }: any) => {
        if (error) throw error;
        if (session && session.provider_token) {
          console.log('[Auth] Using the provider token from a refreshed Supabase session.');
          this.storeSpotifyTokenResponse({
            access_token: session.provider_token,
            refresh_token: session.provider_refresh_token,
            expires_in: 3600
          });
          return from(Promise.resolve({ access_token: session.provider_token }));
        }
        throw new Error('No Spotify provider token in refreshed Supabase session');
      })
    );

    // Supabase does not refresh OAuth provider tokens. Its Spotify refresh
    // token was issued to the confidential Supabase provider and cannot be
    // exchanged safely by this browser without the app secret. If the current
    // Supabase session has no provider token, callers fall back to a silent
    // signInWithOAuth redirect.
    this.refreshObservable = refreshViaSupabase$.pipe(
      tap(() => {
        this.refreshObservable = null;
      }),
      catchError(err => {
        this.refreshObservable = null;
        return throwError(() => err);
      }),
      shareReplay(1)
    );

    return this.refreshObservable;
  }

  private storeSpotifyTokenResponse(response: any, registerCloudCredential = true): void {
    if (!response?.access_token) return;

    this.storageService.setItem(this.storageKey, response.access_token);
    if (response.refresh_token) {
      this.storageService.setItem('spotifyRefreshToken', response.refresh_token);
      if (registerCloudCredential && this.getSupabaseUserId()) {
        void this.registerCurrentSpotifyCredentials().catch(() => {});
      }
    }

    const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
    this.storageService.setItem('spotifyTokenExpiresAt', expiresAt.toString());
  }

  private clearSpotifyCredentials(): void {
    this.storageService.removeItem(this.storageKey);
    this.storageService.removeItem('spotifyRefreshToken');
    this.storageService.removeItem('spotifyTokenExpiresAt');
    this.storageService.removeItem('spotifyUserId');
    this.storageService.removeItem('supabaseUserId');
    this.storageService.removeItem(this.connectionModeKey);
    this.storageService.removeItem(this.personalClientIdKey);
    this.storageService.removeItem(this.anonymousCloudKey);
    this.storageService.removeItem(this.cloudIdentityReadyKey);
    this.initialSyncPromise = null;
  }

  private isOAuthCallbackInProgress(): boolean {
    if (typeof window === 'undefined') return false;
    return window.location.pathname.endsWith('/callback') &&
      new URLSearchParams(window.location.search).has('code');
  }

  isTokenExpired(): boolean {
    const expiresAtStr = this.storageService.getItem('spotifyTokenExpiresAt');
    if (!expiresAtStr) {
      return true;
    }
    const expiresAt = parseInt(expiresAtStr, 10);
    return Date.now() > (expiresAt - 60 * 1000);
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  getUserId(): string | null {
    const rawId = this.storageService.getItem('spotifyUserId');
    if (!rawId) return null;
    const hasDevSuffix = rawId.endsWith('_dev');
    if (!environment.production && !hasDevSuffix) {
      return `${rawId}_dev`;
    } else if (environment.production && hasDevSuffix) {
      return rawId.slice(0, -4);
    }
    return rawId;
  }

  setUserId(userId: string): void {
    let finalId = userId;
    const hasDevSuffix = userId.endsWith('_dev');
    if (!environment.production && !hasDevSuffix) {
      finalId = `${userId}_dev`;
    } else if (environment.production && hasDevSuffix) {
      finalId = userId.slice(0, -4);
    }
    this.storageService.setItem('spotifyUserId', finalId);
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  async logout(): Promise<void> {
    const supabaseUserId = this.getSupabaseUserId();
    if (this.isAnonymousCloudIdentity()) {
      await this.deleteAnonymousCloudAccount();
    }
    if (supabaseUserId) {
      this.storageService.removeItem(`${supabaseUserId}_backup_active`);
      this.storageService.removeItem(`${supabaseUserId}_last_synced_at`);
    }
    this.storageService.removeItem(this.storageKey);
    this.storageService.removeItem('spotifyUserId');
    this.storageService.removeItem('supabaseUserId');
    this.storageService.removeItem('spotifyRefreshToken');
    this.storageService.removeItem('spotifyTokenExpiresAt');
    this.storageService.removeItem(this.connectionModeKey);
    this.storageService.removeItem(this.personalClientIdKey);
    this.storageService.removeItem(this.anonymousCloudKey);
    this.storageService.removeItem(this.cloudIdentityReadyKey);
    try {
      await this.supabaseService.client.auth.signOut();
    } catch (err) {
      console.error('Supabase signout failed', err);
    }
    this.clearAnalytifySessionStorage();
    this.clearAllCookies();
    this.logout$.next();
  }

  async clearCacheAndLogout(): Promise<void> {
    if (this.isAnonymousCloudIdentity()) {
      await this.deleteAnonymousCloudAccount();
    }
    await this.storageService.clear();
    try {
      await this.supabaseService.client.auth.signOut();
    } catch (err) {
      console.error('Supabase signout failed', err);
    }
    this.clearAnalytifySessionStorage();
    this.clearAllCookies();
    this.logout$.next();
  }

  isBackupActive(): boolean {
    const userId = this.getSupabaseUserId() || 'anonymous';
    return this.storageService.getItem(`${userId}_backup_active`) === 'true';
  }

  async syncBackupActiveStatus(): Promise<void> {
    const supabaseUserId = this.getSupabaseUserId();
    if (supabaseUserId) {
      // Ensure the public.users row exists — recreates it if deleted manually.
      // Read user metadata from the live Supabase session.
      const spotifyId = this.getUserId();
      let displayName: string | null = null;
      let profilePicUrl: string | null = null;
      try {
        const { data: { session } } = await this.supabaseService.client.auth.getSession();
        if (session?.user?.user_metadata) {
          displayName = session.user.user_metadata['full_name'] || session.user.user_metadata['name'] || null;
          profilePicUrl = session.user.user_metadata['avatar_url'] || null;
        }
      } catch { /* non-fatal */ }
      await this.supabaseService.ensureUserProfile(supabaseUserId, spotifyId, displayName, profilePicUrl);

      const { data, error } = await this.supabaseService.client
        .from('users')
        .select('backup_active, last_synced_at')
        .eq('id', supabaseUserId)
        .maybeSingle();

      if (error) {
        console.warn('[SpotifyAuthService] Failed to check backup and sync status:', error);
      } else if (data) {
        const active = !!data.backup_active;
        this.storageService.setItem(`${supabaseUserId}_backup_active`, active ? 'true' : 'false');
        this.storageService.setItem(`${supabaseUserId}_last_synced_at`, data.last_synced_at || '');
        const redundantCacheKeys = [
          `${supabaseUserId}_backup_active`,
          `${supabaseUserId}_last_synced_at`
        ];
        if (spotifyId) {
          redundantCacheKeys.push(
            `${spotifyId}_recently_played`,
            `${spotifyId}_profile_pic`,
            ...['short_term', 'medium_term', 'long_term'].flatMap(range => [
              `${spotifyId}_stats_${range}_tracks`,
              `${spotifyId}_stats_${range}_artists`,
              `${spotifyId}_stats_${range}_genres`,
              `${spotifyId}_stats_${range}_lastUpdated`
            ])
          );
        }
        await this.supabaseService.deleteUserCacheEntries(
          supabaseUserId,
          redundantCacheKeys
        ).catch(err => {
          console.warn('[SpotifyAuthService] Failed to clean redundant normalized cache keys:', err);
        });
      }
    }
  }

  async enableBackup(): Promise<void> {
    await this.enableCloudIdentity();
    const supabaseUserId = this.getSupabaseUserId();
    if (!supabaseUserId) {
      throw new Error('User not logged in');
    }

    // The cloud flag is authoritative. Only expose backup as enabled locally
    // after Supabase accepted the setting.
    await this.supabaseService.updateBackupActive(supabaseUserId, true);
    this.storageService.setItem(`${supabaseUserId}_backup_active`, 'true');
    await this.pushLocalCacheToDatabase(supabaseUserId);
  }

  async enableCloudIdentity(): Promise<void> {
    if (this.getSupabaseUserId()) {
      if (this.isPersonalAppConnection()) await this.registerCurrentSpotifyCredentials();
      return;
    }
    if (!this.isPersonalAppConnection()) {
      throw new Error('Sign in with Spotify before enabling cloud features.');
    }

    let {data: {session}, error: sessionError} = await this.supabaseService.client.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) {
      const anonymousResult = await this.supabaseService.client.auth.signInAnonymously();
      if (anonymousResult.error) {
        if (/anonymous sign-ins are disabled/i.test(anonymousResult.error.message || '')) {
          throw new Error('Cloud Backup is temporarily unavailable because anonymous cloud identities are disabled on the server.');
        }
        throw anonymousResult.error;
      }
      session = anonymousResult.data.session;
    }
    if (!session?.user) throw new Error('The anonymous cloud identity could not be created.');
    if (session.user.email || session.user.phone) {
      throw new Error('The cloud identity unexpectedly contains personal recovery data.');
    }

    this.storageService.setItem('supabaseUserId', session.user.id, false);
    this.storageService.setItem(this.anonymousCloudKey, session.user.is_anonymous ? 'true' : 'false', false);
    const profile = await this.loadCurrentSpotifyProfile();
    const profileUserId = this.getSupabaseUserId() || session.user.id;
    await this.supabaseService.ensureUserProfile(
      profileUserId,
      this.getUserId(),
      profile.display_name || null,
      profile.images?.[0]?.url || null
    );
    await this.registerCurrentSpotifyCredentials(profile);
    this.initialSyncPromise = null;
  }

  async disableBackup(): Promise<void> {
    const supabaseUserId = this.getSupabaseUserId();
    if (!supabaseUserId) {
      throw new Error('User not logged in');
    }
    await this.supabaseService.updateBackupActive(supabaseUserId, false);
    this.storageService.setItem(`${supabaseUserId}_backup_active`, 'false');
  }

  private async pushLocalCacheToDatabase(supabaseUserId: string): Promise<void> {
    const spotifyUserId = this.getUserId() || 'anonymous';
    this.isSyncing = true;
    this.syncProgress = 0;

    try {
      // 1. Gather all items to count total steps
      const historyKey = `${spotifyUserId}_recently_played`;
      const cachedHistoryStr = this.storageService.getItem(historyKey);
      let cachedHistory: any[] = [];
      if (cachedHistoryStr) {
        try {
          const parsedHistory = JSON.parse(cachedHistoryStr);
          cachedHistory = Array.isArray(parsedHistory) ? parsedHistory : [];
        } catch (error) {
          console.warn('[Auth] Ignoring invalid local listening-history cache during backup activation:', error);
        }
      }
      
      const ranges = ['short_term', 'medium_term', 'long_term'];
      const statsToSyncByDate = new Map<string, { range: string; snap: any }>();
      for (const range of ranges) {
        const history = await this.storageService.getStatsHistory(spotifyUserId, range);
        if (history && history.length > 0) {
          history.forEach(snap => {
            const dateKey = snap.snapshotDate || toDailySnapshotDateKey(snap.timestamp);
            const mapKey = `${range}:${dateKey}`;
            const existing = statsToSyncByDate.get(mapKey);
            const snapHasDetails = Array.isArray(snap.topTracks) && snap.topTracks.length > 0;
            const existingHasDetails =
              Array.isArray(existing?.snap?.topTracks) && (existing?.snap?.topTracks?.length || 0) > 0;
            if (!existing || snapHasDetails || !existingHasDetails) {
              statsToSyncByDate.set(mapKey, {
                range,
                snap: { ...snap, snapshotDate: dateKey }
              });
            }
          });
        }
      }
      const statsToSync = Array.from(statsToSyncByDate.values());

      // Collect generic cache keys to sync
      const cacheKeys = this.storageService.getCacheKeys()
        .filter(key => this.storageService.shouldSyncUserCacheKey(key));

      const totalSteps = 1 + statsToSync.length + cacheKeys.length;
      let completedSteps = 0;

      // Step 1: Listening History Sync
      if (cachedHistory && cachedHistory.length > 0) {
        try {
          await this.supabaseService.syncListeningHistory(supabaseUserId, cachedHistory);
        } catch (e) {
          console.warn('Failed to push listening history cache to DB:', e);
        }
      }
      completedSteps++;
      this.syncProgress = Math.round((completedSteps / totalSteps) * 100);

      // Steps 2 to N: Stats Snapshots Sync
      for (const item of statsToSync) {
        try {
          const customDateStr =
            item.snap.snapshotDate || toDailySnapshotDateKey(item.snap.timestamp);
          await this.supabaseService.saveStatsSnapshot(
            supabaseUserId,
            item.range,
            item.snap.explicitPercentage || 0,
            item.snap.genreDiversity || 0,
            item.snap.topTracks || [],
            item.snap.topArtists || [],
            item.snap.topGenres || [],
            true, // onlyInsertMissing = true
            customDateStr
          );
        } catch (e) {
          console.warn('Failed to push stats snapshot cache to DB:', e);
        }
        completedSteps++;
        this.syncProgress = Math.round((completedSteps / totalSteps) * 100);
      }

      // Steps N+1 to M: Generic User Cache keys sync
      for (const key of cacheKeys) {
        try {
          const val = this.storageService.getItem(key);
          if (val !== null) {
            await this.supabaseService.saveUserCache(supabaseUserId, key, val);
          }
        } catch (e) {
          console.warn(`Failed to push user cache key ${key} to DB:`, e);
        }
        completedSteps++;
        this.syncProgress = Math.round((completedSteps / totalSteps) * 100);
      }

      this.syncProgress = 100;
      setTimeout(() => {
        this.isSyncing = false;
        this.syncProgress = 0;
      }, 1000);

    } catch (e) {
      console.error('Failed to run cache push to DB:', e);
      this.isSyncing = false;
      this.syncProgress = 0;
    }
  }

  private async registerCurrentSpotifyCredentials(
    profile?: any,
    override?: {
      accessToken: string;
      refreshToken: string;
      connectionMode: SpotifyConnectionMode;
      clientId: string | null;
      spotifyId: string;
    }
  ): Promise<string | null> {
    if (profile || override) {
      return this.persistCurrentSpotifyCredentials(profile, override);
    }
    if (!this.credentialRegistrationPromise) {
      this.credentialRegistrationPromise = this.persistCurrentSpotifyCredentials()
        .finally(() => { this.credentialRegistrationPromise = null; });
    }
    return this.credentialRegistrationPromise;
  }

  private async persistCurrentSpotifyCredentials(
    profile?: any,
    override?: {
      accessToken: string;
      refreshToken: string;
      connectionMode: SpotifyConnectionMode;
      clientId: string | null;
      spotifyId: string;
    }
  ): Promise<string | null> {
    const profileUserId = this.getSupabaseUserId();
    const accessToken = override?.accessToken || this.getAccessToken();
    const refreshToken = override?.refreshToken || this.storageService.getItem('spotifyRefreshToken');
    if (!profileUserId || !accessToken || !refreshToken) return null;

    const spotifyProfile = profile || await this.loadCurrentSpotifyProfile();
    const connectionMode = override?.connectionMode || this.getConnectionMode();
    const clientId = override?.clientId !== undefined
      ? override.clientId
      : (connectionMode === 'personal_pkce' ? this.getPersonalSpotifyClientId() : null);
    const {data, error} = await this.supabaseService.client.functions.invoke('spotify-credentials', {
      body: {
        action: 'store',
        profileUserId,
        connectionMode,
        clientId,
        accessToken,
        refreshToken,
        spotifyId: override?.spotifyId || this.getUserId() || spotifyProfile.id
      }
    });
    if (error) throw new Error(`Cloud credential registration failed: ${error.message}`);
    const rotatedRefreshToken = typeof data?.rotatedRefreshToken === 'string' && data.rotatedRefreshToken
      ? data.rotatedRefreshToken
      : null;
    if (rotatedRefreshToken && !override) {
      this.storageService.setItem('spotifyRefreshToken', rotatedRefreshToken, false);
    }
    this.storageService.setItem(this.cloudIdentityReadyKey, 'true', false);
    return rotatedRefreshToken;
  }

  private async deleteAnonymousCloudAccount(): Promise<void> {
    const profileUserId = this.getSupabaseUserId();
    if (!profileUserId) return;
    const {error} = await this.supabaseService.client.functions.invoke('spotify-credentials', {
      body: {action: 'delete_account', profileUserId}
    });
    if (error) throw new Error(`Anonymous cloud account deletion failed: ${error.message}`);
  }

  private async loadCurrentSpotifyProfile(): Promise<any> {
    const accessToken = this.getAccessToken();
    if (!accessToken) throw new Error('Spotify is not connected.');
    return firstValueFrom(this.http.get<any>(`${environment.spotifyUrl}/me`, {
      headers: new HttpHeaders({Authorization: `Bearer ${accessToken}`}),
      context: new HttpContext().set(TRANSIENT_SPOTIFY_REQUEST, true)
    }));
  }

  private normalizedSpotifyId(value: string | null): string | null {
    if (!value) return null;
    return value.endsWith('_dev') ? value.slice(0, -4) : value;
  }

  private spotifyAccountIdentity(profile: any): string | null {
    return typeof profile?.account_id === 'string' && profile.account_id
      ? profile.account_id
      : (typeof profile?.id === 'string' && profile.id ? profile.id : null);
  }

  private spotifyProfileMatches(profile: any, expectedSpotifyId: string): boolean {
    const expected = this.normalizedSpotifyId(expectedSpotifyId);
    return [profile?.account_id, profile?.id]
      .some(value => typeof value === 'string' && this.normalizedSpotifyId(value) === expected);
  }

  private safeInternalReturnUrl(value: string): string {
    return value.startsWith('/') && !value.startsWith('//') ? value : '/playlists';
  }

  private randomUrlSafeString(byteCount: number): string {
    return this.base64Url(crypto.getRandomValues(new Uint8Array(byteCount)));
  }

  private async createPkceChallenge(verifier: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
    return this.base64Url(new Uint8Array(digest));
  }

  private base64Url(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach(byte => binary += String.fromCharCode(byte));
    return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  private clearAllCookies(): void {
    const cookies = document.cookie.split(';');
    for (let i = 0; i < cookies.length; i++) {
      const cookie = cookies[i];
      const eqPos = cookie.indexOf('=');
      const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=' + window.location.hostname;
      document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.' + window.location.hostname.replace(/^www\./, '');
    }
  }

  private clearAnalytifySessionStorage(): void {
    [
      this.personalRequestKey,
      'analytify_compare_auth_request',
      'analytifyAuthReturnUrl'
    ].forEach(key => sessionStorage.removeItem(key));
  }

  getSupabaseUserId(): string | null {
    const rawId = this.storageService.getItem('supabaseUserId') || null;
    if (!rawId) return null;
    if (!environment.production && rawId.length >= 36 && !rawId.startsWith('de11')) {
      return 'de11' + rawId.substring(4);
    }
    return rawId;
  }


}
