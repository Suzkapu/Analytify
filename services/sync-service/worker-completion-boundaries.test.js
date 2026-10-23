const test = require('node:test');
const assert = require('node:assert/strict');
const {createSpotifyClient} = require('./spotify-client');
const {createStatsTask} = require('./tasks/stats-task');
const {validateSpotifyUrl} = require('./spotify-url-validator');

// Compose the actual transport decoder and task. Only external HTTP, catalog and
// database boundaries are replaced; no real endpoints or credentials are used.
function rankingBoundary({invalidPrimary = false} = {}) {
  const http = [], persisted = [], replacements = [], scores = [], markers = [];
  const track = {id: 'retained-primary-song', name: 'Primary song', artists: [{id: 'retained-primary-artist', name: 'Primary artist'}], explicit: false};
  const artist = {id: 'retained-primary-artist', name: 'Primary artist', genres: ['indie']};
  const spotify = createSpotifyClient({spotifyClientId: 'isolated-client', spotifyClientSecret: 'isolated-secret'}, {
    async fetch(url) {
      http.push(url);
      if (url === 'https://accounts.spotify.com/api/token') return new Response(JSON.stringify({access_token: 'isolated-access'}));
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://api.spotify.com');
      const offset = parsed.searchParams.get('offset');
      let payload;
      if (parsed.pathname === '/v1/me/top/artists') payload = {items: [artist]};
      else {
        assert.equal(parsed.pathname, '/v1/me/top/tracks');
        // A complete primary page, a null optional envelope and an optional
        // envelope without items exercise transport partial-response recovery.
        payload = offset === '0' ? (invalidPrimary ? null : {items: [track]}) : offset === '50' ? null : {};
      }
      return new Response(JSON.stringify(payload), {headers: {'content-type': 'application/json'}});
    }
  });
  const supabase = {
    from(table) {
      if (table === 'tracks' || table === 'artists') return {select(column) {
        assert.equal(column, 'id'); return {async in(key, ids) {assert.equal(key, 'id'); return {data: ids.map(id => ({id})), error: null};}};
      }};
      if (table === 'stats_snapshots') {
        const predicates = {};
        return {select(column) {assert.equal(column, 'revision'); return this;}, eq(key, value) {predicates[key] = value; return this;}, async maybeSingle() {
          assert.equal(predicates.user_id, 'isolated-user'); assert.equal(predicates.range, 'short_term');
          return {data: null, error: null};
        }};
      }
      assert.equal(table, 'users');
      return {update(value) {markers.push(value); return {async eq(key, id) {assert.equal(key, 'id'); assert.equal(id, 'isolated-user'); return {error: null};}};}};
    },
    async rpc(name, parameters) {
      if (name === 'replace_stats_snapshot_v2') {replacements.push(parameters); return {data: [{snapshot_id: 'isolated-snapshot'}], error: null};}
      assert.equal(name, 'score_song_league_snapshot'); scores.push(parameters); return {data: null, error: null};
    }
  };
  const catalog = {async persistPulledTracks(token, tracks, artists) {assert.equal(token, 'isolated-access'); persisted.push({tracks, artists});}};
  const run = createStatsTask({supabase, spotify, catalog});
  return {run: () => run({taskKey: 'stats_short_term', user: {id: 'isolated-user', spotify_credential: {refreshToken: 'isolated-refresh'}}, settings: {timezone: 'UTC'}}), http, persisted, replacements, scores, markers, track, artist};
}

test('Stats retains validated primary rankings when decoded optional HTTP pages are incomplete', async () => {
  const h = rankingBoundary();
  const result = await h.run();
  assert.equal(result.snapshotId, 'isolated-snapshot'); assert.equal(result.tracks, 1); assert.equal(result.artists, 1);
  assert.deepEqual(h.persisted, [{tracks: [h.track], artists: [h.artist]}]);
  assert.equal(h.replacements.length, 1);
  assert.deepEqual(h.replacements[0].p_tracks, [{track_id: h.track.id, rank: 1}]);
  assert.deepEqual(h.replacements[0].p_artists, [{artist_id: h.artist.id, rank: 1}]);
  assert.deepEqual(h.replacements[0].p_genres, [{genre_name: 'indie', rank: 1, weight: 50}]);
  assert.deepEqual(h.scores, [{p_snapshot_id: 'isolated-snapshot'}]); assert.equal(h.markers.length, 1);
  assert.equal(h.http.length, 5); // One token exchange and exactly four ranking reads; no hidden retries.
});

test('an invalid primary HTTP envelope cannot replace a snapshot or publish a sync success', async () => {
  const h = rankingBoundary({invalidPrimary: true});
  await assert.rejects(h.run(), /invalid primary Stats ranking data/);
  assert.deepEqual(h.persisted, []); assert.deepEqual(h.replacements, []);
  assert.deepEqual(h.scores, []); assert.deepEqual(h.markers, []);
  assert.equal(h.http.length, 5);
});

test('a Spotify origin without an entity path cannot become a persisted entity link', () => {
  assert.equal(validateSpotifyUrl('https://open.spotify.com', 'track'), null);
  assert.equal(validateSpotifyUrl('https://open.spotify.com/', 'track'), null);
  assert.equal(validateSpotifyUrl('https://open.spotify.com/track/retainedSong', 'track'), 'https://open.spotify.com/track/retainedSong');
});
