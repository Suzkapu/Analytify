import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {environment} from "../../../environments/environment";
import {Observable, throwError, Subject, from, firstValueFrom} from 'rxjs';
import {tap, catchError, shareReplay, switchMap} from 'rxjs/operators';
import {StorageService} from '../storage/storage.service';
import {SupabaseService} from '../supabase/supabase.service';

@Injectable({
  providedIn: 'root',
})
export class SpotifyAuthService {
  private readonly storageKey = 'spotifyAccessToken';
  private refreshObservable: Observable<any> | null = null;
  private restoreSessionPromise: Promise<boolean> | null = null;
  logout$ = new Subject<void>();

  isSyncing = false;
  syncProgress = 0;
  initialSyncPromise: Promise<void> | null = null;

  private clientId = environment.spotifyClientId;
  constructor(
    private http: HttpClient,
    private storageService: StorageService,
    private supabaseService: SupabaseService
  ) {
    this.storageService.initFromDB().then(async () => {
      if (!this.isAuthenticated()) {
        await this.restoreSessionFromSupabase().catch(() => {});
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
          if (session.provider_token) {
            this.storageService.setItem(this.storageKey, session.provider_token);
          }
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
            const effectiveUserId = this.getSupabaseUserId() || session.user.id;

            this.initialSyncPromise = (async () => {
              try {
                if (session.provider_refresh_token) {
                  await this.saveRefreshTokenToDatabase(effectiveUserId, session.provider_refresh_token);
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

  private async saveRefreshTokenToDatabase(userId: string, refreshToken: string) {
    try {
      const { error } = await this.supabaseService.client
        .from('users')
        .update({ spotify_refresh_token: refreshToken })
        .eq('id', userId);
      if (error) {
        console.warn('Could not save Spotify refresh token to database. Make sure public.users has spotify_refresh_token column:', error);
      }
    } catch (e) {
      console.error('Error saving Spotify refresh token to database:', e);
    }
  }

  handleCallbackSession(): Observable<any> {
    return from(this.supabaseService.client.auth.getSession()).pipe(
      tap(({ data: { session } }: any) => {
        if (session) {
          if (session.provider_token) {
            this.storageService.setItem(this.storageKey, session.provider_token);
          }
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
            const effectiveUserId = this.getSupabaseUserId() || session.user.id;

            this.initialSyncPromise = (async () => {
              try {
                if (session.provider_refresh_token) {
                  await this.saveRefreshTokenToDatabase(effectiveUserId, session.provider_refresh_token);
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

  private async _restoreSessionFromSupabase(): Promise<boolean> {
    try {
      const { data: { session }, error } = await this.supabaseService.client.auth.getSession();
      if (error) throw error;
      
      if (session) {
        console.log('[Auth] Restoring session from Supabase client...');
        if (session.provider_token) {
          this.storageService.setItem(this.storageKey, session.provider_token);
        }
        if (session.provider_refresh_token) {
          this.storageService.setItem('spotifyRefreshToken', session.provider_refresh_token);
        }
        
        // Save expiration time
        const expiresAt = Date.now() + 3600 * 1000;
        this.storageService.setItem('spotifyTokenExpiresAt', expiresAt.toString());

        if (session.user) {
          let spotifyId = session.user.user_metadata?.['provider_id'] || session.user.id;
          if (!environment.production) {
            spotifyId = `${spotifyId}_dev`;
          }
          this.storageService.setItem('spotifyUserId', spotifyId);
          this.storageService.setItem('supabaseUserId', session.user.id);
        }

        // Query DB for refresh token if it is missing locally
        const supabaseUserId = session.user.id;
        let effectiveUserId = supabaseUserId;
        if (!environment.production && effectiveUserId.length >= 36 && !effectiveUserId.startsWith('de11')) {
          effectiveUserId = 'de11' + effectiveUserId.substring(4);
        }

        let localRefreshToken = this.storageService.getItem('spotifyRefreshToken');
        if (!localRefreshToken || !this.storageService.getItem(this.storageKey)) {
          console.log('[Auth] Spotify token or refresh token missing from cache. Querying DB...');
          const { data: userData, error: userError } = await this.supabaseService.client
            .from('users')
            .select('spotify_refresh_token, spotify_id')
            .eq('id', effectiveUserId)
            .maybeSingle();

          if (!userError && userData) {
            if (userData.spotify_refresh_token) {
              console.log('[Auth] Found Spotify refresh token in database.');
              this.storageService.setItem('spotifyRefreshToken', userData.spotify_refresh_token);
              localRefreshToken = userData.spotify_refresh_token;
            }
            if (userData.spotify_id) {
              this.storageService.setItem('spotifyUserId', userData.spotify_id);
            }
          }
        }

        // If we have a refresh token and no access token or it's expired, proactively refresh it
        if (localRefreshToken && (!this.storageService.getItem(this.storageKey) || this.isTokenExpired())) {
          try {
            console.log('[Auth] Spotify access token missing or expired. Proactively refreshing...');
            await firstValueFrom(this.refreshToken());
            console.log('[Auth] Spotify token refreshed successfully during session restoration.');
          } catch (refreshErr) {
            console.warn('[Auth] Failed to refresh Spotify token during session restoration:', refreshErr);
          }
        }
        
        return true;
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

    // Try refreshing via Supabase first, as it is the auth manager
    const supabaseRefresh$ = from(this.supabaseService.client.auth.getSession()).pipe(
      switchMap(({ data: { session }, error }: any) => {
        if (error) throw error;
        if (session && session.provider_token) {
          console.log('[Auth] Refreshed Spotify token via Supabase session');
          this.storageService.setItem(this.storageKey, session.provider_token);
          if (session.provider_refresh_token) {
            this.storageService.setItem('spotifyRefreshToken', session.provider_refresh_token);
          }
          const expiresAt = Date.now() + 3600 * 1000;
          this.storageService.setItem('spotifyTokenExpiresAt', expiresAt.toString());
          return from(Promise.resolve({ access_token: session.provider_token }));
        }
        throw new Error('No provider token in Supabase session');
      }),
      catchError(err => {
        console.warn('[Auth] Supabase token refresh failed, falling back to direct Spotify refresh:', err);
        // Fallback to direct Spotify accounts refresh
        const refreshToken = this.storageService.getItem('spotifyRefreshToken') || '';
        if (!refreshToken) {
          return throwError(() => new Error('No refresh token found'));
        }

        const body = new HttpParams()
          .set('grant_type', 'refresh_token')
          .set('refresh_token', refreshToken)
          .set('client_id', this.clientId);

        const headers = new HttpHeaders({
          'Content-Type': 'application/x-www-form-urlencoded'
        });

        return this.http.post('https://accounts.spotify.com/api/token', body.toString(), { headers }).pipe(
          tap((response: any) => {
            if (response && response.access_token) {
              this.storageService.setItem(this.storageKey, response.access_token);
              if (response.refresh_token) {
                this.storageService.setItem('spotifyRefreshToken', response.refresh_token);
                const supabaseUserId = this.getSupabaseUserId();
                if (supabaseUserId) {
                  this.saveRefreshTokenToDatabase(supabaseUserId, response.refresh_token);
                }
              }
              const expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
              this.storageService.setItem('spotifyTokenExpiresAt', expiresAt.toString());
            }
          })
        );
      })
    );

    this.refreshObservable = supabaseRefresh$.pipe(
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
    if (supabaseUserId) {
      this.storageService.removeItem(`${supabaseUserId}_backup_active`);
      this.storageService.removeItem(`${supabaseUserId}_last_synced_at`);
    }
    this.storageService.removeItem(this.storageKey);
    this.storageService.removeItem('spotifyUserId');
    this.storageService.removeItem('supabaseUserId');
    this.storageService.removeItem('spotifyRefreshToken');
    this.storageService.removeItem('spotifyTokenExpiresAt');
    try {
      await this.supabaseService.client.auth.signOut();
    } catch (err) {
      console.error('Supabase signout failed', err);
    }
    localStorage.clear();
    sessionStorage.clear();
    this.clearAllCookies();
    this.logout$.next();
  }

  async clearCacheAndLogout(): Promise<void> {
    await this.storageService.clear();
    try {
      await this.supabaseService.client.auth.signOut();
    } catch (err) {
      console.error('Supabase signout failed', err);
    }
    localStorage.clear();
    sessionStorage.clear();
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
        if (active) {
          await this.pullCacheFromDatabase(supabaseUserId);
        }
      }
    }
  }

  private async pullCacheFromDatabase(supabaseUserId: string): Promise<void> {
    try {
      console.log('[Auth] Pulling user cache from Supabase...');
      const dbCache = await this.supabaseService.loadUserCache(supabaseUserId);
      if (dbCache && dbCache.length > 0) {
        const activeCache = dbCache.filter(item => !item.key.endsWith('_genres'));
        activeCache.forEach(item => {
          // Local data is the primary source. Cloud data only fills gaps during
          // the broad startup hydration; expired feature caches explicitly
          // request their cloud keys before falling back to Spotify.
          if (this.storageService.getItem(item.key) === null) {
            this.storageService.setItem(item.key, item.value, false);
          }
        });
        console.log(`[Auth] Loaded ${activeCache.length} active cache keys from database.`);
      }
    } catch (e) {
      console.error('[Auth] Failed to pull user cache from database:', e);
    }
  }

  async enableBackup(): Promise<void> {
    const supabaseUserId = this.getSupabaseUserId();
    if (!supabaseUserId) {
      throw new Error('User not logged in');
    }
    // Update local cache immediately
    this.storageService.setItem(`${supabaseUserId}_backup_active`, 'true');

    // Update database and sync in background/safely
    try {
      await this.supabaseService.updateBackupActive(supabaseUserId, true);
      await this.pushLocalCacheToDatabase(supabaseUserId);
    } catch (e) {
      console.warn('[SpotifyAuthService] Database not enabled/configured yet. Backup state stored in local cache only.', e);
    }
  }

  async disableBackup(): Promise<void> {
    const supabaseUserId = this.getSupabaseUserId();
    if (!supabaseUserId) {
      throw new Error('User not logged in');
    }
    // Update local cache immediately
    this.storageService.setItem(`${supabaseUserId}_backup_active`, 'false');

    try {
      await this.supabaseService.updateBackupActive(supabaseUserId, false);
    } catch (e) {
      console.warn('[SpotifyAuthService] Database not enabled/configured yet. Backup state stored in local cache only.', e);
    }
  }

  private async pushLocalCacheToDatabase(supabaseUserId: string): Promise<void> {
    const spotifyUserId = this.getUserId() || 'anonymous';
    this.isSyncing = true;
    this.syncProgress = 0;

    try {
      // 1. Gather all items to count total steps
      const historyKey = `${spotifyUserId}_recently_played`;
      const cachedHistoryStr = this.storageService.getItem(historyKey);
      const cachedHistory = cachedHistoryStr ? JSON.parse(cachedHistoryStr) : [];
      
      const ranges = ['short_term', 'medium_term', 'long_term'];
      const statsToSync: { range: string; snap: any }[] = [];
      for (const range of ranges) {
        const history = await this.storageService.getStatsHistory(spotifyUserId, range);
        if (history && history.length > 0) {
          history.forEach(snap => statsToSync.push({ range, snap }));
        }
      }

      // Collect generic cache keys to sync
      const cacheKeys = this.storageService.getCacheKeys().filter(key => {
        const isUserKey = key.startsWith(`${spotifyUserId}_`) || key.startsWith(`${supabaseUserId}_`);
        const isBackupActiveKey = key === `${supabaseUserId}_backup_active`;
        const isObsoleteGenreCache = key.endsWith('_genres');
        return isUserKey && !isBackupActiveKey && !isObsoleteGenreCache;
      });

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
          const customDateStr = new Date(item.snap.timestamp).toISOString().split('T')[0];
          await this.supabaseService.saveStatsSnapshot(
            supabaseUserId,
            item.range,
            item.snap.explicitPercentage || 0,
            item.snap.topTracks || [],
            item.snap.topArtists || [],
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

  getSupabaseUserId(): string | null {
    const rawId = this.storageService.getItem('supabaseUserId') || null;
    if (!rawId) return null;
    if (!environment.production && rawId.length >= 36 && !rawId.startsWith('de11')) {
      return 'de11' + rawId.substring(4);
    }
    return rawId;
  }


}


