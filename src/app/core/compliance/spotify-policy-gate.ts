import {CanActivateFn, Router} from '@angular/router';
import {inject} from '@angular/core';

// Spotify Developer Policy version reviewed: effective 15 May 2025.
// The operator has explicitly chosen to expose these features while issue #96
// tracks the still-missing written Spotify determination. This reference is an
// operator decision record, not a claim that Spotify approved the features.
export const SPOTIFY_RESTRICTED_FEATURES_APPROVAL_REFERENCE: string | null =
  'operator-enabled-pending-spotify-determination-2026-09-25';
export const SPOTIFY_RESTRICTED_FEATURES_ENABLED =
  SPOTIFY_RESTRICTED_FEATURES_APPROVAL_REFERENCE !== null;

export const spotifyRestrictedFeatureGuard: CanActivateFn = () => {
  if (SPOTIFY_RESTRICTED_FEATURES_ENABLED) return true;
  return inject(Router).createUrlTree(['/playlists'], {
    queryParams: {notice: 'spotify-policy-restricted'}
  });
};
