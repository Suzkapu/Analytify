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
    || spotifyProfileMatches(verifiedProfile, existingSpotifyId);
}
