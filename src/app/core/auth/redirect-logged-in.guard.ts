import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SpotifyAuthService } from './spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import {AuthReturnUrlService} from './auth-return-url.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {TermsAcceptanceService} from '@core/legal/terms-acceptance.service';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';

const console = createScopedLogger('Login Redirect Guard');

export const redirectLoggedInGuard = async () => {
  const authService = inject(SpotifyAuthService);
  const storageService = inject(StorageService);
  const router = inject(Router);
  const returnUrl = inject(AuthReturnUrlService);
  const terms = inject(TermsAcceptanceService);
  const navigation = inject(DesignNavigationService);

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

  if (authService.isAuthenticated() && terms.hasCurrentAcceptance()) {
    router.navigateByUrl(returnUrl.consume(navigation.url('playlists')));
    return false;
  }

  if (authService.isAuthenticated()) return true;

  return true;
};
