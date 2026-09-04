const test = require('node:test');
const assert = require('node:assert/strict');

const {createScheduler, isJobAllowed} = require('./scheduler');

function createRunJobHarness({taskStateResults = [], jobRunResults = [], handler} = {}) {
  const taskStateWrites = [];
  const jobRunWrites = [];
  let taskStateResultIndex = 0;
  let jobRunResultIndex = 0;
  const supabase = {
    from(table) {
      if (table === 'users') {
        return {
          select() { return this; },
          eq() { return this; },
          async single() {
            return {
              data: {
                id: 'user-1', spotify_id: 'spotify-1', display_name: 'Test User',
                spotify_refresh_token: 'refresh-token', backup_active: true
              },
              error: null
            };
          }
        };
      }
      if (table === 'sync_user_settings') {
        return {
          select() { return this; },
          eq() { return this; },
          async single() { return {data: {timezone: 'UTC', stats_interval: 1}, error: null}; }
        };
      }
      if (table === 'sync_task_state') {
        return {
          async upsert(value) {
            taskStateWrites.push(value);
            return taskStateResults[taskStateResultIndex++] || {error: null};
          }
        };
      }
      if (table === 'sync_job_runs') {
        return {
          update(value) {
            jobRunWrites.push(value);
            return {
              async eq() { return jobRunResults[jobRunResultIndex++] || {error: null}; }
            };
          }
        };
      }
      throw new Error(`Unexpected table ${table}`);
    }
  };
  const scheduler = createScheduler({
    supabase,
    config: {},
    tasks: {stats_short_term: handler || (async () => ({updated: 1}))},
    credentials: {get: async () => 'stored-credential'},
    pushDispatcher: {dispatchDue: async () => ({})}
  });
  return {scheduler, taskStateWrites, jobRunWrites};
}

async function withoutExpectedConsoleError(work) {
  const original = console.error;
  console.error = () => {};
  try {
    return await work();
  } finally {
    console.error = original;
  }
}

test('blocks Friday-only scheduled playlist jobs outside the configured local Friday', () => {
  assert.equal(isJobAllowed({task_key: 'song_league_playlists', trigger_type: 'scheduled'}, {
    timezone: 'Europe/Vienna',
    song_league_playlist_fridays_only: true
  }, new Date('2026-09-01T12:00:00.000Z')), false);
});

test('allows explicitly queued manual playlist jobs on any day', () => {
  assert.equal(isJobAllowed({task_key: 'song_league_playlists', trigger_type: 'manual'}, {
    timezone: 'Europe/Vienna',
    song_league_playlist_fridays_only: true
  }, new Date('2026-09-01T12:00:00.000Z')), true);
});

test('records a failed job and skips its handler when the started-state write fails', async () => {
  let handlerCalls = 0;
  const {scheduler, taskStateWrites, jobRunWrites} = createRunJobHarness({
    taskStateResults: [{error: new Error('started state unavailable')}, {error: null}],
    handler: async () => {
      handlerCalls++;
      return {};
    }
  });

  await withoutExpectedConsoleError(() => scheduler.runJob({
    id: 'job-1', user_id: 'user-1', task_key: 'stats_short_term', trigger_type: 'manual'
  }));

  assert.equal(handlerCalls, 0);
  assert.equal(taskStateWrites.length, 2);
  assert.equal(taskStateWrites[1].last_error, 'started state unavailable');
  assert.equal(jobRunWrites.length, 1);
  assert.equal(jobRunWrites[0].status, 'failed');
});

test('surfaces task-state persistence errors while recording a failed job', async () => {
  const {scheduler, jobRunWrites} = createRunJobHarness({
    taskStateResults: [{error: null}, {error: new Error('failed state unavailable')}],
    handler: async () => { throw new Error('handler failed'); }
  });

  await assert.rejects(
    withoutExpectedConsoleError(() => scheduler.runJob({
      id: 'job-1', user_id: 'user-1', task_key: 'stats_short_term', trigger_type: 'manual'
    })),
    /failed state unavailable/
  );
  assert.equal(jobRunWrites.length, 1);
  assert.equal(jobRunWrites[0].status, 'failed');
});

test('surfaces job-run persistence errors after a task failure', async () => {
  const {scheduler, taskStateWrites} = createRunJobHarness({
    taskStateResults: [{error: null}, {error: null}],
    jobRunResults: [{error: new Error('job status unavailable')}],
    handler: async () => { throw new Error('handler failed'); }
  });

  await assert.rejects(
    withoutExpectedConsoleError(() => scheduler.runJob({
      id: 'job-1', user_id: 'user-1', task_key: 'stats_short_term', trigger_type: 'manual'
    })),
    /job status unavailable/
  );
  assert.equal(taskStateWrites.length, 2);
  assert.equal(taskStateWrites[1].last_error, 'handler failed');
});
