import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SpotifyAuthService } from './spotify-auth.service';

export const spotifyAuthGuard = async () => {
  const authService = inject(SpotifyAuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    // If initialSyncPromise is null, it means the SpotifyAuthService constructor ran
    // before initFromDB() finished loading IndexedDB (a startup race condition).
    // In that case we trigger the sync now so the DB cache is available before
    // any protected component renders.
    if (!authService.initialSyncPromise) {
      authService.initialSyncPromise = authService.syncBackupActiveStatus()
        .catch(err => console.warn('[Guard] Failed to sync backup status on navigation:', err));
    }
    await authService.initialSyncPromise;
    return true;
  }

  // Redirect to login page
  router.navigate(['/login']);
  return false;
};
