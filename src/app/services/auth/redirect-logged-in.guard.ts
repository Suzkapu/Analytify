import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SpotifyAuthService } from './spotify-auth.service';
import { StorageService } from '../storage/storage.service';

export const redirectLoggedInGuard = async () => {
  const authService = inject(SpotifyAuthService);
  const storageService = inject(StorageService);
  const router = inject(Router);

  // Wait for StorageService to finish loading from IndexedDB
  await storageService.initFromDB();

  if (authService.isAuthenticated()) {
    router.navigate(['/playlists']);
    return false;
  }

  return true;
};
