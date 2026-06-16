import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SpotifyAuthService } from './spotify-auth.service';
import { StorageService } from '../storage/storage.service';

export const spotifyAuthGuard = async () => {
  const authService = inject(SpotifyAuthService);
  const storageService = inject(StorageService);
  const router = inject(Router);

  // Wait for StorageService to finish loading from IndexedDB
  await storageService.initFromDB();

  if (authService.isAuthenticated()) {
    await authService.ensureInitialSync();
    return true;
  }

  // Redirect to login page
  router.navigate(['/login']);
  return false;
};
