export interface SpotifyPlaylistSummary {
  id?: unknown;
  description?: unknown;
  owner?: {id?: unknown} | null;
  external_urls?: {spotify?: unknown} | null;
}

export interface SpotifyPlaylistPage {
  items?: SpotifyPlaylistSummary[] | null;
  next?: unknown;
}

export interface RecoveredPlaylist {
  id: string;
  url: string;
}

export function playlistTrackBatches(trackUris: string[]): string[][] {
  if (trackUris.length === 0) return [[]];
  const batches: string[][] = [];
  for (let index = 0; index < trackUris.length; index += 100) {
    batches.push(trackUris.slice(index, index + 100));
  }
  return batches;
}

export function playlistOperationTag(operationMarker: string): string {
  return `[Analytify sync:${operationMarker}]`;
}

export function playlistDescription(baseDescription: string, operationMarker: string): string {
  const tag = playlistOperationTag(operationMarker);
  const availableBaseLength = Math.max(0, 299 - tag.length);
  return `${baseDescription.slice(0, availableBaseLength).trimEnd()} ${tag}`.trimStart();
}

export function matchingOwnedPlaylist(
  page: SpotifyPlaylistPage | null,
  operationMarker: string,
  spotifyUserId: string
): RecoveredPlaylist | null {
  const tag = playlistOperationTag(operationMarker);
  for (const playlist of page?.items || []) {
    if (
      typeof playlist?.id !== 'string' || !playlist.id ||
      typeof playlist?.description !== 'string' || !playlist.description.includes(tag) ||
      typeof playlist?.owner?.id !== 'string' || playlist.owner.id !== spotifyUserId
    ) continue;
    return {
      id: playlist.id,
      url: typeof playlist.external_urls?.spotify === 'string'
        ? playlist.external_urls.spotify
        : ''
    };
  }
  return null;
}
