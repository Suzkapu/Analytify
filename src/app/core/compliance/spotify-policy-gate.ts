import {CanActivateFn, Router} from '@angular/router';
import {inject} from '@angular/core';

// Spotify Developer Policy version reviewed: effective 15 May 2025.
// Keep disabled unless a written Spotify determination covering Stats,
// history-derived comparisons, Compare Rooms, and Song League is recorded.
export const SPOTIFY_RESTRICTED_FEATURES_APPROVAL_REFERENCE: string | null = null;
export const SPOTIFY_RESTRICTED_FEATURES_ENABLED =
  SPOTIFY_RESTRICTED_FEATURES_APPROVAL_REFERENCE !== null;

export const spotifyRestrictedFeatureGuard: CanActivateFn = () => {
  if (SPOTIFY_RESTRICTED_FEATURES_ENABLED) return true;
  return inject(Router).createUrlTree(['/playlists'], {
    queryParams: {notice: 'spotify-policy-restricted'}
  });
};
