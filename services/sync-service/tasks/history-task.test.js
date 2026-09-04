const test = require('node:test');
const assert = require('node:assert/strict');

const {createHistoryTask} = require('./history-task');

function play(id, playedAt) {
  return {played_at: playedAt, track: {id}};
}

function createHarness({
  latestPlayedAt = null,
  checkpoint = null,
  pages = {},
  maxPagesPerRun = 20,
  checkpointFailures = 0,
  historyUpsertFailures = 0
} = {}) {
  const apiPaths = [];
  const catalogBatches = [];
  const upsertAttempts = [];
  const storedRows = new Map();
  let checkpointRow = checkpoint ? {...checkpoint} : null;

  const supabase = {
    from(table) {
      if (table === 'listening_history') {
        return {
          select() {
            return {
              eq() { return this; },
              order() { return this; },
              limit() { return this; },
              async maybeSingle() {
                return {data: latestPlayedAt ? {played_at: latestPlayedAt} : null, error: null};
              }
            };
          },
          async upsert(rows, options) {
            upsertAttempts.push({rows, options});
            if (historyUpsertFailures > 0) {
              historyUpsertFailures--;
              return {error: new Error('history upsert failed')};
            }
            for (const row of rows) {
              storedRows.set(`${row.user_id}:${row.played_at}:${row.track_id}`, row);
            }
            return {error: null};
          }
        };
      }
      if (table === 'listening_history_checkpoints') {
        return {
          select() {
            return {
              eq() { return this; },
              async maybeSingle() { return {data: checkpointRow ? {...checkpointRow} : null, error: null}; }
            };
          },
          async upsert(row, options) {
            if (checkpointFailures > 0) {
              checkpointFailures--;
              return {error: new Error('checkpoint write failed')};
            }
            checkpointRow = {...row};
            return {error: null, options};
          }
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    }
  };
  const spotify = {
    async accessToken() { return 'access-token'; },
    async api(pathname) {
      apiPaths.push(pathname);
      const cursor = new URL(pathname, 'https://api.spotify.test').searchParams.get('before') || 'initial';
      const response = pages[cursor];
      if (response instanceof Error) throw response;
      if (!response) throw new Error(`Missing page fixture for cursor ${cursor}`);
      return response;
    }
  };
  const catalog = {
    async persistPulledTracks(_token, tracks) { catalogBatches.push(tracks.map(track => track.id)); }
  };
  const task = createHistoryTask({supabase, spotify, catalog, maxPagesPerRun});

  return {
    apiPaths,
    catalogBatches,
    upsertAttempts,
    storedRows,
    get checkpoint() { return checkpointRow; },
    setPage(cursor, response) { pages[cursor] = response; },
    run() { return task({user: {id: 'user-1', spotify_credential: {refreshToken: 'refresh'}}}); }
  };
}

test('pages backwards past 50 plays and commits a durable high-water mark', async () => {
  const previousHighWater = '2026-08-01T10:00:00.000Z';
  const newest = Array.from({length: 50}, (_, index) =>
    play(`new-${index}`, new Date(Date.parse('2026-08-03T12:00:00.000Z') - index * 60_000).toISOString())
  );
  const older = Array.from({length: 25}, (_, index) =>
    play(`older-${index}`, new Date(Date.parse('2026-08-02T12:00:00.000Z') - index * 3_600_000).toISOString())
  );
  older.push(play('watermark', previousHighWater));
  older.push(play('before-watermark', '2026-08-01T09:59:00.000Z'));
  const harness = createHarness({
    checkpoint: {user_id: 'user-1', high_water_mark: previousHighWater},
    pages: {
      initial: {items: newest, next: 'next', cursors: {before: 'page-2'}},
      'page-2': {items: older, next: null, cursors: {before: 'page-3'}}
    }
  });

  const result = await harness.run();

  assert.equal(result.pages, 2);
  assert.equal(result.truncated, false);
  assert.equal(result.processed, 77);
  assert.deepEqual(harness.apiPaths, [
    '/me/player/recently-played?limit=50',
    '/me/player/recently-played?limit=50&before=page-2'
  ]);
  assert.equal(harness.checkpoint.high_water_mark, newest[0].played_at);
  assert.equal(harness.checkpoint.pending_before_cursor, null);
  assert.equal(harness.checkpoint.pending_high_water_mark, null);
});

test('keeps distinct plays sharing a timestamp and deduplicates stable play identities', async () => {
  const playedAt = '2026-08-03T12:00:00.000Z';
  const harness = createHarness({
    pages: {
      initial: {
        items: [play('track-a', playedAt), play('track-a', playedAt)],
        next: 'next',
        cursors: {before: 'page-2'}
      },
      'page-2': {
        items: [play('track-b', playedAt), play('track-a', playedAt)],
        next: null,
        cursors: {}
      }
    }
  });

  const result = await harness.run();

  assert.equal(result.processed, 2);
  assert.equal(harness.upsertAttempts.length, 2);
  for (const attempt of harness.upsertAttempts) {
    assert.deepEqual(attempt.options, {
      onConflict: 'user_id,played_at,track_id',
      ignoreDuplicates: true
    });
  }
  assert.deepEqual(Array.from(harness.storedRows.values()).map(row => row.track_id).sort(), ['track-a', 'track-b']);
});

test('checkpoints a bounded delayed backfill and resumes it on the next run', async () => {
  const previousHighWater = '2026-08-01T10:00:00.000Z';
  const firstPage = [play('newest', '2026-08-05T12:00:00.000Z')];
  const harness = createHarness({
    maxPagesPerRun: 2,
    checkpoint: {user_id: 'user-1', high_water_mark: previousHighWater},
    pages: {
      initial: {items: firstPage, next: 'next', cursors: {before: 'page-2'}},
      'page-2': {items: [play('middle', '2026-08-03T12:00:00.000Z')], next: 'next', cursors: {before: 'page-3'}},
      'page-3': {
        items: [play('watermark', previousHighWater), play('older', '2026-08-01T09:00:00.000Z')],
        next: null,
        cursors: {before: 'page-4'}
      }
    }
  });

  const firstResult = await harness.run();

  assert.equal(firstResult.truncated, true);
  assert.equal(firstResult.pages, 2);
  assert.equal(harness.checkpoint.high_water_mark, previousHighWater);
  assert.equal(harness.checkpoint.pending_high_water_mark, firstPage[0].played_at);
  assert.equal(harness.checkpoint.pending_before_cursor, 'page-3');

  const secondResult = await harness.run();

  assert.equal(secondResult.resumed, true);
  assert.equal(secondResult.truncated, false);
  assert.equal(secondResult.pages, 1);
  assert.equal(harness.apiPaths[2], '/me/player/recently-played?limit=50&before=page-3');
  assert.equal(harness.checkpoint.high_water_mark, firstPage[0].played_at);
  assert.equal(harness.checkpoint.pending_before_cursor, null);
  assert.equal(harness.storedRows.size, 4);
});

test('retains page progress across a partial Spotify page failure and retry', async () => {
  const previousHighWater = '2026-08-01T10:00:00.000Z';
  const harness = createHarness({
    checkpoint: {user_id: 'user-1', high_water_mark: previousHighWater},
    pages: {
      initial: {
        items: [play('newest', '2026-08-03T12:00:00.000Z')],
        next: 'next',
        cursors: {before: 'page-2'}
      },
      'page-2': new Error('temporary Spotify failure')
    }
  });

  await assert.rejects(harness.run(), /temporary Spotify failure/);
  assert.equal(harness.checkpoint.high_water_mark, previousHighWater);
  assert.equal(harness.checkpoint.pending_before_cursor, 'page-2');
  assert.equal(harness.storedRows.size, 1);

  harness.apiPaths.length = 0;
  const originalRun = harness.run;
  harness.setPage('page-2', {
    items: [play('watermark', previousHighWater), play('older', '2026-08-01T09:00:00.000Z')],
    next: null,
    cursors: {before: 'page-3'}
  });

  const result = await originalRun();

  assert.equal(result.resumed, true);
  assert.deepEqual(harness.apiPaths, ['/me/player/recently-played?limit=50&before=page-2']);
  assert.equal(harness.checkpoint.high_water_mark, '2026-08-03T12:00:00.000Z');
  assert.equal(harness.storedRows.size, 3);
});

test('does not advance the committed checkpoint when a history page upsert fails', async () => {
  const previousHighWater = '2026-08-01T10:00:00.000Z';
  const harness = createHarness({
    historyUpsertFailures: 1,
    checkpoint: {user_id: 'user-1', high_water_mark: previousHighWater},
    pages: {
      initial: {
        items: [play('newest', '2026-08-03T12:00:00.000Z')],
        next: 'next',
        cursors: {before: 'page-2'}
      },
      'page-2': {
        items: [play('watermark', previousHighWater), play('older', '2026-08-01T09:00:00.000Z')],
        next: null,
        cursors: {before: 'page-3'}
      }
    }
  });

  await assert.rejects(harness.run(), /history upsert failed/);
  assert.equal(harness.checkpoint.high_water_mark, previousHighWater);
  assert.equal(harness.checkpoint.pending_before_cursor, undefined);
  assert.equal(harness.storedRows.size, 0);

  const result = await harness.run();

  assert.equal(result.truncated, false);
  assert.equal(harness.checkpoint.high_water_mark, '2026-08-03T12:00:00.000Z');
  assert.equal(harness.storedRows.size, 3);
});

test('retries idempotently when rows persist before the first checkpoint write', async () => {
  const harness = createHarness({
    checkpointFailures: 1,
    pages: {
      initial: {
        items: [play('newest', '2026-08-03T12:00:00.000Z')],
        next: 'next',
        cursors: {before: 'page-2'}
      },
      'page-2': {
        items: [play('older', '2026-08-02T11:00:00.000Z')],
        next: null,
        cursors: {before: 'page-3'}
      }
    }
  });

  await assert.rejects(harness.run(), /checkpoint write failed/);
  assert.equal(harness.checkpoint, null);
  assert.equal(harness.storedRows.size, 1);

  const result = await harness.run();

  assert.equal(result.truncated, false);
  assert.deepEqual(harness.apiPaths, [
    '/me/player/recently-played?limit=50',
    '/me/player/recently-played?limit=50',
    '/me/player/recently-played?limit=50&before=page-2'
  ]);
  assert.equal(harness.upsertAttempts.length, 3);
  assert.equal(harness.storedRows.size, 2);
  assert.equal(harness.checkpoint.high_water_mark, '2026-08-03T12:00:00.000Z');
});

test('does not infer a missing checkpoint from rows that may belong to a partial run', async () => {
  const latestPlayedAt = '2026-08-02T12:00:00.000Z';
  const harness = createHarness({
    latestPlayedAt,
    pages: {
      initial: {
        items: [
          play('new', '2026-08-02T13:00:00.000Z'),
          play('existing', latestPlayedAt),
          play('possibly-partial', '2026-08-02T11:30:00.000Z')
        ],
        next: 'next',
        cursors: {before: 'page-2'}
      },
      'page-2': {
        items: [play('older', '2026-08-02T11:00:00.000Z')],
        next: null,
        cursors: {before: 'page-3'}
      }
    }
  });

  await harness.run();

  assert.equal(harness.apiPaths.length, 2);
  assert.equal(harness.checkpoint.high_water_mark, '2026-08-02T13:00:00.000Z');
});
