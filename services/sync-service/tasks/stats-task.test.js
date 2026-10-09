const test = require('node:test');
const assert = require('node:assert/strict');

const {createStatsTask, genresFromArtists, hydrateArtistGenres} = require('./stats-task');

// In-memory boundaries only: never construct a real client or contact a service.
function snapshotHarness(options = {}) {
  const events = [], requests = [], replacements = [], markers = [], scoring = [];
  const tracks = options.tracks ?? [{id: 'song-a', name: 'A', explicit: true, artists: [{name: 'Artist'}]},
    {id: 'song-b', name: 'B', explicit: false, artists: [{name: 'Artist'}]},
    {id: 'song-c', name: 'C', explicit: false, artists: [{name: 'Artist'}]}];
  const artists = options.artists ?? [{id: 'artist-a', genres: ['rock', ' artist ', '']}, {id: 'artist-b', genres: ['rock', 'pop']}];
  const user = {id: '11111111-1111-4111-8111-111111111111', spotify_credential: {testOnly: true}};
  const resultId = '22222222-2222-4222-8222-222222222222';
  const supabase = {
    from(table) {
      if (table === 'tracks' || table === 'artists') return {select(column) {
        assert.equal(column, 'id');
        return {async in(key, ids) {
          assert.equal(key, 'id'); events.push(`lookup:${table}`);
          return {data: options.nullCatalog ? null : ids.filter(id => !(options.missingCatalog ?? []).includes(id)).map(id => ({id})), error: options[`${table}Error`] ?? null};
        }};
      }};
      if (table === 'stats_snapshots') return {select(column) {
        assert.equal(column, 'revision'); const predicates = {};
        return {eq(key, value) {predicates[key] = value; return this;}, async maybeSingle() {
          events.push('revision'); assert.equal(predicates.user_id, user.id);
          assert.ok(['short_term', 'medium_term', 'long_term'].includes(predicates.range));
          assert.equal(predicates.snapshot_date, '2026-10-06');
          return {data: options.revision === null ? null : {revision: options.revision ?? 4}, error: options.revisionError ?? null};
        }};
      }};
      if (table === 'users') return {update(value) {
        markers.push(value); events.push('marker');
        return {async eq(key, id) {assert.equal(key, 'id'); assert.equal(id, user.id); return {error: options.markerError ?? null};}};
      }};
      assert.fail(`Unexpected table mutation ${table}`);
    },
    async rpc(name, parameters) {
      events.push(name);
      if (name === 'replace_stats_snapshot_v2') {
        replacements.push(parameters);
        return {data: Object.hasOwn(options, 'replacement') ? options.replacement : [{snapshot_id: resultId, revision: 5}], error: options.replaceError ?? null};
      }
      assert.equal(name, 'score_song_league_snapshot'); scoring.push(parameters);
      return {data: null, error: options.scoreError ?? null};
    }
  };
  const spotify = {
    async accessToken(credential) {
      assert.equal(credential, user.spotify_credential); events.push('credential');
      if (options.credentialError) throw options.credentialError;
      return 'isolated-token';
    },
    async api(pathname, token) {
      assert.equal(token, 'isolated-token'); requests.push(pathname);
      const url = new URL(pathname, 'https://fixture.invalid');
      assert.ok(['/me/top/artists', '/me/top/tracks'].includes(url.pathname));
      if (url.pathname.endsWith('/artists')) {
        if (options.artistsPageError) throw options.artistsPageError;
        if (Object.hasOwn(options, 'artistsResponse')) return options.artistsResponse;
        return options.nullPages ? null : {items: artists};
      }
      const offset = Number(url.searchParams.get('offset'));
      if (options.pageErrors?.[offset]) throw options.pageErrors[offset];
      if (offset === 0 && Object.hasOwn(options, 'tracksResponse')) return options.tracksResponse;
      return options.nullPages ? undefined : {items: offset === 0 ? tracks : []};
    }
  };
  const catalog = {async persistPulledTracks(token, pulledTracks, pulledArtists) {
    assert.equal(token, 'isolated-token'); events.push('catalog');
    assert.ok(Array.isArray(pulledTracks)); assert.ok(Array.isArray(pulledArtists));
    if (options.catalogError) throw options.catalogError;
  }};
  return {run: createStatsTask({supabase, spotify, catalog}), user, resultId, events, requests, replacements, markers, scoring};
}

function fixedSnapshotClock(t) {
  t.mock.timers.enable({apis: ['Date'], now: Date.parse('2026-10-06T00:30:00Z')});
}
function runSnapshot(h, taskKey = 'stats_short_term') {
  return h.run({taskKey, user: h.user, settings: {timezone: 'Europe/Vienna'}});
}

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

test('loads overflow tracks in parallel and keeps a full 100 after de-duplication', async () => {
  const rpcCalls = [];
  const startedPages = [];
  let releasePages;
  const pagesReady = new Promise(resolve => { releasePages = resolve; });
  const supabase = {
    from(table) {
      if (table === 'tracks' || table === 'artists') {
        return {select() { return {async in(_column, ids) { return {data: ids.map(id => ({id})), error: null}; }}; }};
      }
      if (table === 'stats_snapshots') {
        return {select() { return {eq() { return this; }, async maybeSingle() { return {data: null, error: null}; }}; }};
      }
      if (table === 'users') return {update() { return {async eq() { return {error: null}; }}; }};
      throw new Error(`Unexpected table ${table}`);
    },
    async rpc(name, parameters) {
      rpcCalls.push([name, parameters]);
      return {data: name === 'replace_stats_snapshot_v2' ? [{snapshot_id: 'snapshot', revision: 1}] : null, error: null};
    }
  };
  const page = (start, count) => Array.from({length: count}, (_, index) => ({
    id: `track-${start + index}`,
    name: `Song ${start + index}`,
    artists: [{id: 'artist-id', name: 'Artist'}],
    explicit: false
  }));
  const spotify = {
    async accessToken() { return 'token'; },
    async api(pathname) {
      if (pathname.includes('/artists')) return {items: [{id: 'artist-id', genres: ['rock']}]};
      startedPages.push(pathname);
      if (startedPages.length === 3) releasePages();
      await pagesReady;
      if (pathname.includes('offset=100')) return {items: page(100, 10)};
      if (pathname.includes('offset=50')) return {items: [page(0, 1)[0], ...page(51, 49)]};
      return {items: page(0, 50)};
    }
  };
  const run = createStatsTask({supabase, spotify, catalog: {async persistPulledTracks() {}}});

  await run({taskKey: 'stats_short_term', user: {id: 'user', spotify_credential: {}}, settings: {timezone: 'UTC'}});

  assert.equal(startedPages.length, 3);
  const replacement = rpcCalls.find(([name]) => name === 'replace_stats_snapshot_v2');
  assert.equal(replacement[1].p_tracks.length, 100);
  assert.equal(replacement[1].p_tracks[99].track_id, 'track-100');
});

for (const [task, range] of [['stats_short_term', 'short_term'], ['stats_medium_term', 'medium_term'], ['stats_long_term', 'long_term']]) {
  test(`${task} preserves its range, local day, daily idempotency and CAS revision`, async t => {
    fixedSnapshotClock(t); const h = snapshotHarness();
    assert.deepEqual(await runSnapshot(h, task), {range, snapshotId: h.resultId, snapshotDate: '2026-10-06', tracks: 3, artists: 2});
    assert.deepEqual(h.requests, [
      `/me/top/artists?time_range=${range}&limit=50&offset=0`,
      `/me/top/tracks?time_range=${range}&limit=50&offset=0`,
      `/me/top/tracks?time_range=${range}&limit=50&offset=50`,
      `/me/top/tracks?time_range=${range}&limit=10&offset=100`
    ]);
    assert.equal(h.replacements.length, 1);
    assert.deepEqual(h.replacements[0], {
      p_user_id: h.user.id, p_range: range, p_snapshot_date: '2026-10-06', p_explicit_percentage: 33, p_genre_diversity: 2,
      p_tracks: [{track_id: 'song-a', rank: 1}, {track_id: 'song-b', rank: 2}, {track_id: 'song-c', rank: 3}],
      p_artists: [{artist_id: 'artist-a', rank: 1}, {artist_id: 'artist-b', rank: 2}],
      p_genres: [{genre_name: 'rock', rank: 1, weight: 99}, {genre_name: 'pop', rank: 2, weight: 49}],
      p_fetched_at: '2026-10-05T23:00:00.000Z',
      p_idempotency_key: `${h.user.id}:${range}:2026-10-06:2026-10-05T23:00:00.000Z`, p_expected_revision: 4
    });
    assert.deepEqual(h.scoring, range === 'short_term' ? [{p_snapshot_id: h.resultId}] : []);
    assert.deepEqual(h.markers, [{last_synced_at: '2026-10-06T00:30:00.000Z'}]);
    assert.ok(h.events.indexOf('catalog') < h.events.indexOf('revision'));
    assert.ok(h.events.indexOf('replace_stats_snapshot_v2') < h.events.indexOf('marker'));
  });
}

test('unsupported task and failed credentials do not fetch, write or mark completion', async t => {
  fixedSnapshotClock(t); const h = snapshotHarness();
  await assert.rejects(runSnapshot(h, 'obsolete_stats_task'), /Unsupported stats task/);
  assert.deepEqual(h.events, []);
  const error = new Error('Isolated credential expired');
  const denied = snapshotHarness({credentialError: error});
  await assert.rejects(runSnapshot(denied), e => e === error);
  assert.deepEqual(denied.events, ['credential']);
  assert.deepEqual(denied.requests, []); assert.deepEqual(denied.replacements, []); assert.deepEqual(denied.markers, []);
});

for (const source of ['artistsPageError', 'firstTracksPage']) test(`mandatory ${source} failure preserves the prior snapshot`, async t => {
  fixedSnapshotClock(t); const error = new Error('Isolated mandatory page unavailable');
  const h = snapshotHarness(source === 'firstTracksPage' ? {pageErrors: {0: error}} : {[source]: error});
  await assert.rejects(runSnapshot(h), e => e === error);
  assert.equal(h.events.includes('catalog'), false); assert.deepEqual(h.replacements, []);
  assert.deepEqual(h.scoring, []); assert.deepEqual(h.markers, []);
});

test('failed optional pages preserve primary rankings and report both partial failures', async t => {
  fixedSnapshotClock(t); const warnings = [];
  t.mock.method(console, 'warn', value => warnings.push(value));
  const h = snapshotHarness({pageErrors: {50: new Error('second page'), 100: new Error('overflow page')}});
  const result = await runSnapshot(h);
  assert.equal(result.tracks, 3); assert.equal(h.replacements.length, 1);
  assert.equal(warnings.length, 2); assert.ok(warnings.some(s => /second page/.test(s)));
  assert.ok(warnings.some(s => /overflow page/.test(s))); assert.ok(warnings.every(s => /Additional short_term track page failed/.test(s)));
  assert.equal(h.markers.length, 1);
});

for (const boundary of ['catalogError', 'tracksError', 'artistsError', 'revisionError', 'replaceError']) {
  test(`${boundary} is propagated without scoring or a false successful sync marker`, async t => {
    fixedSnapshotClock(t); const failure = {code: '40001', message: `Isolated ${boundary} failure`};
    const h = snapshotHarness({[boundary]: failure});
    await assert.rejects(runSnapshot(h), error => error === failure);
    assert.equal(h.replacements.length, boundary === 'replaceError' ? 1 : 0);
    assert.deepEqual(h.scoring, []); assert.deepEqual(h.markers, []);
  });
}

test('retry after a CAS conflict rereads the revision and retains the daily idempotency key', async t => {
  fixedSnapshotClock(t);
  const failed = snapshotHarness({revision: 7, replaceError: {code: '40001', message: 'Concurrent replacement'}});
  await assert.rejects(runSnapshot(failed), e => e.code === '40001');
  const retry = snapshotHarness({revision: 8});
  assert.equal((await runSnapshot(retry)).snapshotId, retry.resultId);
  assert.equal(failed.replacements[0].p_expected_revision, 7); assert.equal(retry.replacements[0].p_expected_revision, 8);
  assert.equal(failed.replacements[0].p_idempotency_key, retry.replacements[0].p_idempotency_key);
  assert.deepEqual(failed.markers, []); assert.equal(retry.markers.length, 1);
});

test('valid empty pages save an explicitly empty ranking without catalog lookup requests', async t => {
  fixedSnapshotClock(t); const h = snapshotHarness({tracks: [], artists: [], revision: null});
  assert.equal((await runSnapshot(h, 'stats_long_term')).tracks, 0);
  const saved = h.replacements[0];
  assert.deepEqual(saved.p_tracks, []); assert.deepEqual(saved.p_artists, []); assert.deepEqual(saved.p_genres, []);
  assert.equal(saved.p_explicit_percentage, 0); assert.equal(saved.p_genre_diversity, 0); assert.equal(saved.p_expected_revision, 0);
  assert.equal(h.events.some(e => e.startsWith('lookup:')), false); assert.deepEqual(h.scoring, []);
});

for (const source of ['artistsResponse', 'tracksResponse']) {
  for (const response of [null, undefined, {}, {items: null}, {items: ''}]) {
    test(`malformed mandatory ${source} (${JSON.stringify(response)}) cannot erase saved rankings`, async t => {
      fixedSnapshotClock(t); const h = snapshotHarness({[source]: response});
      await assert.rejects(runSnapshot(h), /invalid.*ranking data/i);
      assert.equal(h.events.includes('catalog'), false); assert.deepEqual(h.replacements, []);
      assert.deepEqual(h.scoring, []); assert.deepEqual(h.markers, []);
    });
  }
}

test('catalog absence cannot produce dangling snapshot relations', async t => {
  fixedSnapshotClock(t); const h = snapshotHarness({nullCatalog: true});
  const result = await runSnapshot(h);
  assert.equal(result.tracks, 0); assert.equal(result.artists, 0);
  assert.deepEqual(h.replacements[0].p_tracks, []); assert.deepEqual(h.replacements[0].p_artists, []);
});

test('a scoring failure preserves a committed ranking and reports the skipped side effect', async t => {
  fixedSnapshotClock(t); const warnings = [];
  t.mock.method(console, 'warn', message => warnings.push(message));
  const h = snapshotHarness({scoreError: {message: 'Isolated scoring unavailable'}});
  assert.equal((await runSnapshot(h)).snapshotId, h.resultId);
  assert.deepEqual(warnings, ['[Stats] Song League scoring skipped: Isolated scoring unavailable']);
  assert.equal(h.replacements.length, 1); assert.equal(h.markers.length, 1);
});

test('marker failure is reported after commit rather than pretending the task completed', async t => {
  fixedSnapshotClock(t); const failure = {message: 'Isolated marker write unavailable'};
  const h = snapshotHarness({markerError: failure});
  await assert.rejects(runSnapshot(h), e => e === failure);
  assert.equal(h.replacements.length, 1); assert.equal(h.scoring.length, 1); assert.equal(h.markers.length, 1);
});

for (const replacement of [null, [], {}, [{revision: 5}], {snapshot_id: ''}, {snapshot_id: '   '}, {snapshot_id: 123}]) {
  test(`missing committed snapshot identity (${JSON.stringify(replacement)}) cannot be scored or marked successful`, async t => {
    fixedSnapshotClock(t); const h = snapshotHarness({replacement});
    await assert.rejects(runSnapshot(h), /snapshot.*identity/i);
    assert.equal(h.replacements.length, 1); assert.deepEqual(h.scoring, []); assert.deepEqual(h.markers, []);
  });
}

test('an unconfirmed commit can recover on retry without scoring the absent identity', async t => {
  fixedSnapshotClock(t); const response = {replacement: []}; const h = snapshotHarness(response);
  await assert.rejects(runSnapshot(h), /snapshot.*identity/i);
  assert.deepEqual(h.scoring, []); assert.deepEqual(h.markers, []);
  response.replacement = [{snapshot_id: h.resultId, revision: 5}];
  assert.equal((await runSnapshot(h)).snapshotId, h.resultId);
  assert.equal(h.replacements.length, 2);
  assert.equal(h.replacements[0].p_idempotency_key, h.replacements[1].p_idempotency_key);
  assert.deepEqual(h.scoring, [{p_snapshot_id: h.resultId}]); assert.equal(h.markers.length, 1);
});

test('single-object atomic replacement responses retain the committed snapshot identity', async t => {
  fixedSnapshotClock(t); const h = snapshotHarness({replacement: {snapshot_id: 'committed-snapshot', revision: 5}});
  assert.equal((await runSnapshot(h)).snapshotId, 'committed-snapshot');
  assert.deepEqual(h.scoring, [{p_snapshot_id: 'committed-snapshot'}]);
});

test('genre enrichment deduplicates requests and retains original artists on partial failure', async t => {
  const warnings = []; t.mock.method(console, 'warn', message => warnings.push(message));
  const calls = [], original = [{id: 'a/b', name: 'Original', genres: []}, {id: 'a/b', name: 'Duplicate', genres: []},
    {id: 'failed', name: 'Kept on failure'}, {id: 'empty', name: 'Kept on empty response'}];
  const spotify = {async api(path, token) {
    assert.equal(token, 'isolated-token'); calls.push(path);
    if (path === '/artists/failed') throw new Error('Isolated enrichment failure');
    if (path === '/artists/empty') return null;
    assert.equal(path, '/artists/a%2Fb'); return {id: 'a/b', name: 'Enriched', genres: ['rock']};
  }};
  const enriched = await hydrateArtistGenres(spotify, 'isolated-token', original, 1);
  assert.deepEqual(calls, ['/artists/a%2Fb', '/artists/failed', '/artists/empty']);
  assert.equal(enriched[0].name, 'Enriched'); assert.equal(enriched[1].name, 'Enriched');
  assert.deepEqual(enriched.slice(2), original.slice(2)); assert.equal(original[0].name, 'Original');
  assert.deepEqual(warnings, ['[Stats] Artist genre enrichment failed for failed: Isolated enrichment failure']);
  const noIds = [{genres: []}]; assert.equal(await hydrateArtistGenres(spotify, 'isolated-token', noIds), noIds);
  assert.equal(calls.length, 3);
});

test('genre ranking excludes placeholders and caps the weighted distinct result at fifteen', () => {
  const artists = [{genres: [' Artist ', '', 'shared', ...Array.from({length: 16}, (_, i) => `g-${i}`)]},
    {genres: ['shared']}, {}];
  const result = genresFromArtists(artists);
  assert.equal(result.length, 15); assert.deepEqual(result[0], {name: 'shared', weight: 99});
  assert.equal(result.some(g => !g.name || g.name.trim().toLowerCase() === 'artist'), false);
  assert.equal(result.some(g => g.name === 'g-15'), false);
});

test('deduplication retains distinct artists and unnamed tracks while dropping invalid and duplicate IDs', () => {
  const {deduplicateTracks} = require('./stats-task');
  const first = {id: '1', name: ' Song ', artists: [{name: ' ARTIST '}]};
  const otherArtist = {id: '3', name: 'Song', artist: 'other'};
  const unnamed = {id: '4'};
  assert.deepEqual(deduplicateTracks([null, {}, first, {id: '1', name: 'Different'},
    {id: '2', name: 'song', artist: 'artist'}, otherArtist, unnamed, {id: '5', name: '', artists: []}]),
  [first, otherArtist, unnamed, {id: '5', name: '', artists: []}]);
  assert.deepEqual(deduplicateTracks(undefined), []);
});
