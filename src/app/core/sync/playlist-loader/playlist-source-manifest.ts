export const PLAYLIST_SOURCE_MANIFEST_VERSION = 1;

export interface PlaylistSourceEntryManifest {
  identity: string | null;
  trackId: string | null;
  uri: string | null;
  addedAt: string | null;
  isLocal: boolean;
  isUnavailable: boolean;
  isUsable: boolean;
  position: number;
}

export interface PlaylistSourceManifest {
  version: typeof PLAYLIST_SOURCE_MANIFEST_VERSION;
  playlistId: string;
  sourceTotal: number;
  usableOccurrenceCount: number;
  uniqueUsableTrackCount: number;
  duplicateOccurrenceCount: number;
  localCount: number;
  unavailableCount: number;
  snapshotId: string | null;
  complete: true;
  completedAt: number;
  entries: PlaylistSourceEntryManifest[];
}

export interface PlaylistSourceSyncState {
  version: typeof PLAYLIST_SOURCE_MANIFEST_VERSION;
  dirty: boolean;
  reason: 'current' | 'total-changed' | 'snapshot-changed';
  observedTotal: number;
  observedSnapshotId: string | null;
  checkedAt: number;
}

export interface PlaylistSourceOverlap {
  fetchedIndex: number;
  cachedIndex: number;
  length: number;
}

export function sourceEntryFromSpotify(entry: any, position: number): PlaylistSourceEntryManifest {
  const item = entry?.item || entry?.track || null;
  const trackId = typeof item?.id === 'string' && item.id.length > 0 ? item.id : null;
  const uri = typeof item?.uri === 'string' && item.uri.length > 0 ? item.uri : null;
  const addedAt = typeof entry?.added_at === 'string' && entry.added_at.length > 0
    ? entry.added_at
    : null;
  const isLocal = entry?.is_local === true || item?.is_local === true;
  const hasName = typeof item?.name === 'string' && item.name.trim().length > 0;
  const hasArtist = Array.isArray(item?.artists) && item.artists.some((artist: any) =>
    typeof artist?.name === 'string' && artist.name.trim().length > 0
  );
  const isUsable = !isLocal && item?.type !== 'episode' && !!trackId && hasName && hasArtist;
  const baseIdentity = trackId ? `track:${trackId}` : (uri ? `uri:${uri}` : null);

  return {
    identity: baseIdentity ? `${baseIdentity}|added:${addedAt || ''}` : null,
    trackId,
    uri,
    addedAt,
    isLocal,
    isUnavailable: !isLocal && !isUsable,
    isUsable,
    position
  };
}

export function sourceEntriesFromSpotify(
  entries: any[],
  offset: number = 0
): PlaylistSourceEntryManifest[] {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => sourceEntryFromSpotify(entry, offset + index));
}

export function buildPlaylistSourceManifest(
  playlistId: string,
  sourceTotal: number,
  entries: PlaylistSourceEntryManifest[],
  uniqueUsableTrackCount: number,
  snapshotId: string | null
): PlaylistSourceManifest | null {
  if (!Number.isFinite(sourceTotal) || sourceTotal < 0 || entries.length !== sourceTotal) {
    return null;
  }

  const normalizedEntries = entries.map((entry, position) => ({...entry, position}));
  const usableEntries = normalizedEntries.filter(entry => entry.isUsable);
  const usableTrackIds = new Set(usableEntries.map(entry => entry.trackId).filter(Boolean));
  if (
    !Number.isFinite(uniqueUsableTrackCount) ||
    uniqueUsableTrackCount < 0 ||
    uniqueUsableTrackCount > usableTrackIds.size
  ) {
    return null;
  }

  return {
    version: PLAYLIST_SOURCE_MANIFEST_VERSION,
    playlistId,
    sourceTotal,
    usableOccurrenceCount: usableEntries.length,
    uniqueUsableTrackCount,
    duplicateOccurrenceCount: Math.max(0, usableEntries.length - usableTrackIds.size),
    localCount: normalizedEntries.filter(entry => entry.isLocal).length,
    unavailableCount: normalizedEntries.filter(entry => entry.isUnavailable).length,
    snapshotId,
    complete: true,
    completedAt: Date.now(),
    entries: normalizedEntries
  };
}

export function parsePlaylistSourceManifest(value: string | null): PlaylistSourceManifest | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PlaylistSourceManifest>;
    if (
      parsed.version !== PLAYLIST_SOURCE_MANIFEST_VERSION ||
      parsed.complete !== true ||
      typeof parsed.playlistId !== 'string' ||
      !Number.isFinite(parsed.sourceTotal) ||
      !Array.isArray(parsed.entries) ||
      parsed.entries.length !== parsed.sourceTotal
    ) {
      return null;
    }
    return parsed as PlaylistSourceManifest;
  } catch {
    return null;
  }
}

export function parsePlaylistSourceSyncState(value: string | null): PlaylistSourceSyncState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PlaylistSourceSyncState>;
    if (
      parsed.version !== PLAYLIST_SOURCE_MANIFEST_VERSION ||
      typeof parsed.dirty !== 'boolean' ||
      !Number.isFinite(parsed.observedTotal) ||
      !Number.isFinite(parsed.checkedAt)
    ) {
      return null;
    }
    return parsed as PlaylistSourceSyncState;
  } catch {
    return null;
  }
}

export function findDurableSourceOverlap(
  fetched: PlaylistSourceEntryManifest[],
  cached: PlaylistSourceEntryManifest[],
  requestedLength: number = 3
): PlaylistSourceOverlap | null {
  if (fetched.length === 0 || cached.length === 0) return null;
  const requiredLength = Math.max(1, Math.min(requestedLength, cached.length));

  for (let fetchedIndex = 0; fetchedIndex <= fetched.length - requiredLength; fetchedIndex++) {
    for (let cachedIndex = 0; cachedIndex <= cached.length - requiredLength; cachedIndex++) {
      let matches = true;
      for (let index = 0; index < requiredLength; index++) {
        const left = fetched[fetchedIndex + index]?.identity;
        const right = cached[cachedIndex + index]?.identity;
        if (!left || !right || left !== right) {
          matches = false;
          break;
        }
      }
      if (matches) return {fetchedIndex, cachedIndex, length: requiredLength};
    }
  }
  return null;
}

export function areSourceEntriesNewestFirst(entries: PlaylistSourceEntryManifest[]): boolean {
  let previousTimestamp = Number.POSITIVE_INFINITY;
  for (const entry of entries) {
    if (!entry.addedAt) return false;
    const timestamp = Date.parse(entry.addedAt);
    if (!Number.isFinite(timestamp) || timestamp > previousTimestamp) return false;
    previousTimestamp = timestamp;
  }
  return true;
}

export function inferredRemovedSourceEntries(
  oldSourceTotal: number,
  discoveredNewEntries: number,
  remoteSourceTotal: number
): number {
  return oldSourceTotal + discoveredNewEntries - remoteSourceTotal;
}
