import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SpotifyAuthService } from './spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import {AuthReturnUrlService} from './auth-return-url.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';

const console = createScopedLogger('Login Redirect Guard');

export const redirectLoggedInGuard = async () => {
  const authService = inject(SpotifyAuthService);
  const storageService = inject(StorageService);
  const router = inject(Router);
  const returnUrl = inject(AuthReturnUrlService);

  // Wait for StorageService to finish loading from IndexedDB
  await storageService.initFromDB();

  // Try to restore session from Supabase if not authenticated locally
  if (!authService.isAuthenticated()) {
    try {
      await authService.restoreSessionFromSupabase();
    } catch (e) {
      console.warn('[Guard] Failed to restore session from Supabase:', e);
    }
  }

  if (authService.isAuthenticated()) {
    router.navigateByUrl(returnUrl.consume());
    return false;
  }

  return true;
};
