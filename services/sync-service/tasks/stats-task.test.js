const test = require('node:test');
const assert = require('node:assert/strict');

const {createStatsTask, genresFromArtists, hydrateArtistGenres} = require('./stats-task');

test('lazily hydrates missing artist genres with bounded parallel requests', async () => {
  let active = 0;
  let peak = 0;
  const calls = [];
  const spotify = {
    async api(pathname) {
      calls.push(pathname);
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      const id = pathname.split('/').pop();
      return {id, genres: [`genre-${id}`]};
    }
  };
  const artists = Array.from({length: 7}, (_, index) => ({id: `artist-${index}`, genres: []}));

  const enriched = await hydrateArtistGenres(spotify, 'access-token', artists, 4);

  assert.equal(calls.length, 7);
  assert.equal(peak, 4);
  assert.equal(genresFromArtists(enriched).length, 7);
});

test('does not spend artist requests when Top Artists already includes genres', async () => {
  const spotify = {api() { throw new Error('should not be called'); }};
  const artists = [{id: 'artist', genres: ['indie rock']}];

  assert.equal(await hydrateArtistGenres(spotify, 'access-token', artists), artists);
});

test('replaces a daily snapshot through one atomic database call', async () => {
  const rpcCalls = [];
  const touchedTables = [];
  const supabase = {
    from(table) {
      touchedTables.push(table);
      if (table === 'tracks' || table === 'artists') {
        return {select() { return {async in(_column, ids) {
          return {data: ids.map(id => ({id})), error: null};
        }}; }};
      }
      if (table === 'stats_snapshots') {
        return {select() { return {eq() { return this; }, async maybeSingle() {
          return {data: null, error: null};
        }}; }};
      }
      if (table === 'users') {
        return {update() { return {async eq() { return {error: null}; }}; }};
      }
      throw new Error(`Unexpected direct table write: ${table}`);
    },
    async rpc(name, parameters) {
      rpcCalls.push([name, parameters]);
      return {data: name === 'replace_stats_snapshot_v2' ? [{snapshot_id: 'snapshot-id', revision: 1}] : null, error: null};
    }
  };
  const spotify = {
    async accessToken() { return 'access-token'; },
    async api(pathname) {
      if (pathname.includes('/artists')) {
        return {items: [{id: 'artist-id', name: 'Artist', genres: ['rock']}]};
      }
      return {items: [{
        id: pathname.includes('offset=50') ? 'track-two' : 'track-one',
        explicit: false,
        artists: [{id: 'artist-id', name: 'Artist'}]
      }]};
    }
  };
  const run = createStatsTask({
    supabase,
    spotify,
    catalog: {async persistPulledTracks() {}}
  });

  await run({
    taskKey: 'stats_short_term',
    user: {id: 'user-id', spotify_credential: {}},
    settings: {timezone: 'Europe/Vienna'}
  });

  const replacement = rpcCalls.find(([name]) => name === 'replace_stats_snapshot_v2');
  assert.ok(replacement);
  assert.equal(replacement[1].p_tracks.length, 2);
  assert.equal(replacement[1].p_artists.length, 1);
  assert.equal(replacement[1].p_genres[0].weight, 50);
  assert.deepEqual(touchedTables.sort(), ['artists', 'stats_snapshots', 'tracks', 'users']);
  assert.ok(rpcCalls.some(([name]) => name === 'score_song_league_snapshot'));
});

test('deduplicates tracks with matching title and artist so duplicate releases are omitted', () => {
  const {deduplicateTracks} = require('./stats-task');
  const tracks = [
    {id: 'track-1', name: 'Светлана!', artists: [{name: 'NEXTIME'}]},
    {id: 'track-2', name: 'Other Song', artists: [{name: 'Other Artist'}]},
    {id: 'track-3', name: 'Светлана!', artists: [{name: 'NEXTIME'}]},
    {id: 'track-1', name: 'Светлана!', artists: [{name: 'NEXTIME'}]}
  ];
  const deduplicated = deduplicateTracks(tracks);
  assert.equal(deduplicated.length, 2);
  assert.equal(deduplicated[0].id, 'track-1');
  assert.equal(deduplicated[1].id, 'track-2');
});

