const test = require('node:test');
const assert = require('node:assert/strict');
const {createCatalogRepository} = require('./catalog-repository');

function harness({replacementError = null, revision = 3} = {}) {
  const writes = [];
  const reads = {artists: [], albums: [], tracks: []};
  const supabase = {
    from(table) {
      if (table === 'catalog_write_versions') {
        return {select() { return {eq() { return this; }, async maybeSingle() {
          return {data: {revision}, error: null};
        }}; }};
      }
      if (reads[table]) {
        return {select() { return {async in() { return {data: reads[table], error: null}; }}; }};
      }
      throw new Error(`Unexpected direct catalog mutation: ${table}`);
    },
    async rpc(name, parameters) {
      writes.push({name, parameters});
      return {data: replacementError ? null : revision + 1, error: replacementError};
    }
  };
  return {repository: createCatalogRepository(supabase, {api: async () => null}), writes};
}

test('replaces track metadata and relationships through one CAS transaction', async () => {
  const {repository, writes} = harness();
  await repository.syncTracks(['track1'], [{
    id: 'track1', name: 'Track', duration_ms: 123, artists: [{id: 'artist1', name: 'Artist'}]
  }]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, 'replace_spotify_catalog');
  assert.equal(writes[0].parameters.p_expected_revision, 3);
  assert.equal(writes[0].parameters.p_tracks[0].name, 'Track');
  assert.deepEqual(writes[0].parameters.p_track_artists, [
    {track_id: 'track1', artist_id: 'artist1', artist_rank: 0}
  ]);
  assert.match(writes[0].parameters.p_idempotency_key, /^[0-9a-f]{64}$/);
});

test('surfaces an atomic replacement failure without issuing cleanup writes', async () => {
  const failure = {code: '40001', message: 'concurrent replacement'};
  const {repository, writes} = harness({replacementError: failure});
  await assert.rejects(
    repository.syncAlbums(['album1'], [{id: 'album1', name: 'Album', artists: []}]),
    error => error === failure
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, 'replace_spotify_catalog');
});
