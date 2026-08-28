import { inject } from '@angular/core';
import {ActivatedRouteSnapshot, Router, RouterStateSnapshot} from '@angular/router';
import { SpotifyAuthService } from './spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { firstValueFrom } from 'rxjs';
import {AuthReturnUrlService} from './auth-return-url.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';

const console = createScopedLogger('Authentication Guard');

export const spotifyAuthGuard = async (
  _route?: ActivatedRouteSnapshot,
  state?: RouterStateSnapshot
) => {
  const authService = inject(SpotifyAuthService);
  const storageService = inject(StorageService);
  const router = inject(Router);
  const returnUrl = inject(AuthReturnUrlService);

  // Wait for StorageService to finish loading from IndexedDB
  await storageService.initFromDB();

  // Restore either a local personal-app refresh token or the hosted Supabase session.
  if (!authService.isAuthenticated()) {
    try {
      await authService.recoverUsableSession();
    } catch (e) {
      console.warn('[Guard] Failed to restore session from Supabase:', e);
    }
  }

  if (authService.isAuthenticated()) {
    if (authService.isTokenExpired()) {
      console.log('[Guard] Spotify token is expired. Attempting refresh...');
      try {
        await firstValueFrom(authService.refreshToken());
        console.log('[Guard] Spotify token refreshed successfully.');
      } catch (err) {
        console.warn('[Guard] Spotify token refresh failed, redirecting to Spotify OAuth for renewal:', err);
        returnUrl.remember(state?.url);
        // Automatically redirect to Spotify OAuth without prompt: 'consent' for immediate login renewal
        await authService.renewSpotifyAuthorization(state?.url || '/playlists');
        return false;
      }
    }
    // Navigation only needs a usable Spotify session. Broad cloud-cache
    // hydration is shared and continues in the background so a slow database
    // read cannot hold every protected route on the startup screen.
    void authService.ensureInitialSync().catch(error => {
      console.warn('[Guard] Background cloud synchronization failed:', error);
    });
    return true;
  }

  // Redirect to login page
  returnUrl.remember(state?.url);
  router.navigate(['/login']);
  return false;
};
