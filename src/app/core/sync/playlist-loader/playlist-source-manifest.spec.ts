import {
  areSourceEntriesNewestFirst,
  buildPlaylistSourceManifest,
  findDurableSourceOverlap,
  inferredRemovedSourceEntries,
  parsePlaylistSourceManifest,
  sourceEntriesFromSpotify
} from './playlist-source-manifest';

describe('playlist source manifests', () => {
  it('counts duplicate, local, and unavailable source occurrences separately', () => {
    const entries = sourceEntriesFromSpotify([
      spotifyEntry('shared', '2026-08-05T00:00:00Z'),
      spotifyEntry('shared', '2026-08-04T00:00:00Z'),
      {
        added_at: '2026-08-03T00:00:00Z',
        is_local: true,
        track: {uri: 'spotify:local:Artist:Album:Song:180', name: 'Song', artists: [{name: 'Artist'}]}
      },
      {added_at: '2026-08-02T00:00:00Z', is_local: false, track: null}
    ]);

    const manifest = buildPlaylistSourceManifest('playlist', 4, entries, 1, 'snapshot');

    expect(manifest).not.toBeNull();
    expect(manifest?.sourceTotal).toBe(4);
    expect(manifest?.usableOccurrenceCount).toBe(2);
    expect(manifest?.uniqueUsableTrackCount).toBe(1);
    expect(manifest?.duplicateOccurrenceCount).toBe(1);
    expect(manifest?.localCount).toBe(1);
    expect(manifest?.unavailableCount).toBe(1);
    expect(parsePlaylistSourceManifest(JSON.stringify(manifest))?.entries.length).toBe(4);
  });

  it('finds a durable ordered overlap instead of stopping at one duplicate ID', () => {
    const cached = sourceEntriesFromSpotify([
      spotifyEntry('duplicate', '2026-08-03T00:00:00Z'),
      spotifyEntry('known-2', '2026-08-02T00:00:00Z'),
      spotifyEntry('known-3', '2026-08-01T00:00:00Z')
    ]);
    const fetched = sourceEntriesFromSpotify([
      spotifyEntry('duplicate', '2026-08-04T00:00:00Z'),
      spotifyEntry('new', '2026-08-03T12:00:00Z'),
      spotifyEntry('duplicate', '2026-08-03T00:00:00Z'),
      spotifyEntry('known-2', '2026-08-02T00:00:00Z'),
      spotifyEntry('known-3', '2026-08-01T00:00:00Z')
    ]);

    expect(findDurableSourceOverlap(fetched, cached, 3)).toEqual({
      fetchedIndex: 2,
      cachedIndex: 0,
      length: 3
    });
  });

  it('returns no overlap when every fetched source entry is new', () => {
    const cached = sourceEntriesFromSpotify([
      spotifyEntry('old-1', '2026-08-03T00:00:00Z'),
      spotifyEntry('old-2', '2026-08-02T00:00:00Z'),
      spotifyEntry('old-3', '2026-08-01T00:00:00Z')
    ]);
    const fetched = sourceEntriesFromSpotify([
      spotifyEntry('new-1', '2026-08-06T00:00:00Z'),
      spotifyEntry('new-2', '2026-08-05T00:00:00Z'),
      spotifyEntry('new-3', '2026-08-04T00:00:00Z')
    ]);

    expect(findDurableSourceOverlap(fetched, cached, 3)).toBeNull();
  });

  it('detects removals even when additions leave the total unchanged', () => {
    expect(inferredRemovedSourceEntries(100, 2, 100)).toBe(2);
    expect(inferredRemovedSourceEntries(100, 2, 102)).toBe(0);
  });

  it('rejects a non-monotonic Liked Songs boundary', () => {
    const entries = sourceEntriesFromSpotify([
      spotifyEntry('newer', '2026-08-02T00:00:00Z'),
      spotifyEntry('unexpected-newest', '2026-08-03T00:00:00Z')
    ]);

    expect(areSourceEntriesNewestFirst(entries)).toBeFalse();
  });

  it('does not accept a partial source manifest', () => {
    const entries = sourceEntriesFromSpotify([
      spotifyEntry('one', '2026-08-01T00:00:00Z')
    ]);

    expect(buildPlaylistSourceManifest('playlist', 2, entries, 1, null)).toBeNull();
  });

  function spotifyEntry(id: string, addedAt: string): any {
    return {
      added_at: addedAt,
      is_local: false,
      track: {
        id,
        uri: `spotify:track:${id}`,
        name: id,
        type: 'track',
        artists: [{id: 'artist', name: 'Artist'}]
      }
    };
  }
});
