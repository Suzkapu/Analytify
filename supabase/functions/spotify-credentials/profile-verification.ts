export function normalizedSpotifyId(value: string): string {
  return value.endsWith('_dev') ? value.slice(0, -4) : value;
}

export function spotifyProfileIds(profile: unknown): string[] {
  const value = profile as {account_id?: unknown; id?: unknown} | null;
  return Array.from(new Set([value?.account_id, value?.id]
    .filter((item): item is string => typeof item === 'string' && item.length > 0)));
}

export function spotifyProfileMatches(profile: unknown, spotifyId: string): boolean {
  const normalized = normalizedSpotifyId(spotifyId);
  return spotifyProfileIds(profile).some(value => normalizedSpotifyId(value) === normalized);
}

export function existingProfileAcceptsVerifiedIdentity(
  existingSpotifyId: string,
  profileUserId: string,
  verifiedProfile: unknown
): boolean {
  return existingSpotifyId === profileUserId
    || existingSpotifyId === `pending:${profileUserId}`
    || existingSpotifyId === personalCloudProfileId(profileUserId)
    || spotifyProfileMatches(verifiedProfile, existingSpotifyId);
}

export function personalCloudProfileId(profileUserId: string): string {
  return `personal:${profileUserId}`;
}

/**
 * Hosted Supabase identities stay unique, while a browser-bound anonymous
 * identity may represent the same server-verified Spotify account. This lets
 * personal-PKCE users opt into cloud features without taking over or mutating
 * an existing hosted account.
 */
export function conflictingProfileBlocksRegistration(isAnonymousIdentity: boolean): boolean {
  return !isAnonymousIdentity;
}
