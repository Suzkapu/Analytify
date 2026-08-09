const SPOTIFY_PLAYLIST_NAME_LIMIT = 100;

export function sharedPlaylistName(playlistName: string, ownerDisplayName: string): string {
  const sourceName = playlistName.trim() || 'Shared playlist';
  const ownerName = ownerDisplayName.trim() || 'Spotify user';
  return `${sourceName} · from ${ownerName}`;
}

export function sharedPlaylistSpotifyName(playlistName: string, ownerDisplayName: string): string {
  const sourceName = playlistName.trim() || 'Shared playlist';
  const ownerName = ownerDisplayName.trim() || 'Spotify user';
  const suffix = ` · from ${ownerName}`;

  if (suffix.length >= SPOTIFY_PLAYLIST_NAME_LIMIT) {
    return `From ${truncate(ownerName, SPOTIFY_PLAYLIST_NAME_LIMIT - 5)}`;
  }

  return `${truncate(sourceName, SPOTIFY_PLAYLIST_NAME_LIMIT - suffix.length)}${suffix}`;
}

function truncate(value: string, maximumLength: number): string {
  if (value.length <= maximumLength) return value;
  if (maximumLength <= 1) return value.slice(0, maximumLength);
  return `${value.slice(0, maximumLength - 1).trimEnd()}…`;
}
