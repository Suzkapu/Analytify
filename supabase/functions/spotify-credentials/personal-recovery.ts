import {spotifyProfileMatches} from './profile-verification.ts';

export function validSpotifyId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,255}$/.test(value);
}

export async function personalRecoveryEmail(spotifyId: string): Promise<string> {
  if (!validSpotifyId(spotifyId)) throw new Error('A valid Spotify ID is required.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(spotifyId));
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  return `spotify-${key}@identity.analytify.invalid`;
}

export function personalRecoveryMatches(
  accessProfile: unknown,
  refreshProfile: unknown,
  claimedSpotifyId: string
): boolean {
  return validSpotifyId(claimedSpotifyId)
    && spotifyProfileMatches(accessProfile, claimedSpotifyId)
    && spotifyProfileMatches(refreshProfile, claimedSpotifyId);
}
