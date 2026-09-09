const test = require('node:test');
const assert = require('node:assert/strict');
const {createScheduler, isJobAllowed} = require('./scheduler');

function harness({handler, userResult, settingsResult, rpcResults = {}, heartbeatIntervalMs} = {}) {
  const rpcCalls = [], taskStateWrites = [];
  const supabase = {
    async rpc(name, args) {
      rpcCalls.push({name, args});
      const result = rpcResults[name];
      return typeof result === 'function' ? result(args, rpcCalls)
        : (result || {data: name === 'heartbeat_sync_job', error: null});
    },
    from(table) {
      if (table === 'users') return {select() { return this; }, eq() { return this; }, async single() {
        return userResult || {data: {id: 'user-1', spotify_id: 'spotify-1', display_name: 'Test User',
          spotify_refresh_token: 'refresh-token', backup_active: true}, error: null};
      }};
      if (table === 'sync_user_settings') return {select() { return this; }, eq() { return this; }, async single() {
        return settingsResult || {data: {timezone: 'UTC', stats_interval: 1}, error: null};
      }};
      if (table === 'sync_task_state') return {async upsert(value) {
        taskStateWrites.push(value); return {error: null};
      }};
      throw new Error(`Unexpected table ${table}`);
    }
  };
  const scheduler = createScheduler({
    supabase,
    config: {workerId: '00000000-0000-4000-8000-000000000001', maxJobsPerPass: 4,
      leaseSeconds: 30, heartbeatIntervalMs},
    tasks: {stats_short_term: handler || (async () => ({updated: 1}))},
    credentials: {get: async () => 'stored-credential'},
    pushDispatcher: {dispatchDue: async () => ({})}
  });
  return {scheduler, rpcCalls, taskStateWrites};
}

async function quiet(work) {
  const original = console.error;
  console.error = () => {};
  try { return await work(); } finally { console.error = original; }
}

const job = {id: 'job-1', user_id: 'user-1', task_key: 'stats_short_term', trigger_type: 'manual'};

test('blocks Friday-only scheduled playlist jobs outside the configured local Friday', () => {
  assert.equal(isJobAllowed({task_key: 'song_league_playlists', trigger_type: 'scheduled'}, {
    timezone: 'Europe/Vienna', song_league_playlist_fridays_only: true
  }, new Date('2026-09-01T12:00:00.000Z')), false);
});

test('allows explicitly queued manual playlist jobs on any day', () => {
  assert.equal(isJobAllowed({task_key: 'song_league_playlists', trigger_type: 'manual'}, {
    timezone: 'Europe/Vienna', song_league_playlist_fridays_only: true
  }, new Date('2026-09-01T12:00:00.000Z')), true);
});

test('rejects an automatic job disabled after it was queued', () => {
  assert.equal(isJobAllowed({task_key: 'stats_short_term', trigger_type: 'scheduled'}, {
    enabled: true, short_term_enabled: false
  }), false);
  assert.equal(isJobAllowed({task_key: 'stats_short_term', trigger_type: 'scheduled'}, {
    enabled: false, short_term_enabled: true
  }), false);
});

test('runs only the short-term task required by active league membership', () => {
  const required = {enabled: false, short_term_enabled: false, short_term_required: true};
  assert.equal(isJobAllowed({task_key: 'stats_short_term', trigger_type: 'scheduled'}, required), true);
  assert.equal(isJobAllowed({task_key: 'stats_medium_term', trigger_type: 'scheduled'}, required), false);
  assert.equal(isJobAllowed({task_key: 'stats_long_term', trigger_type: 'scheduled'}, required), false);
});

test('keeps feature-required playlist work distinct from admin optional switches', () => {
  assert.equal(isJobAllowed({task_key: 'shared_playlists', trigger_type: 'scheduled'}, {
    enabled: false, shared_playlists_enabled: false, shared_playlists_required: true
  }), true);
  assert.equal(isJobAllowed({task_key: 'song_league_playlists', trigger_type: 'scheduled'}, {
    enabled: false, song_league_playlists_enabled: false, song_league_playlists_required: false
  }, new Date('2026-09-04T12:00:00.000Z')), false);
});

test('retains explicitly queued manual work after automatic scheduling is disabled', () => {
  assert.equal(isJobAllowed({task_key: 'stats_short_term', trigger_type: 'manual'}, {
    enabled: false, short_term_enabled: false
  }), true);
});

test('claims jobs atomically with a stable worker identity and bounded lease', async () => {
  const claimed = [{...job, status: 'running'}];
  const {scheduler, rpcCalls} = harness({rpcResults: {claim_sync_jobs: {data: claimed, error: null}}});
  assert.deepEqual(await scheduler.claimQueuedJobs(), claimed);
  assert.deepEqual(rpcCalls[0], {name: 'claim_sync_jobs', args: {
    p_worker_id: scheduler.workerId, p_limit: 4, p_lease_seconds: 30
  }});
});

test('completes successful work and task state in one atomic RPC', async () => {
  const {scheduler, rpcCalls, taskStateWrites} = harness();
  await scheduler.runJob(job);
  assert.equal(taskStateWrites.length, 1);
  const completion = rpcCalls.find(call => call.name === 'complete_sync_job');
  assert.equal(completion.args.p_status, 'succeeded');
  assert.deepEqual(completion.args.p_details, {updated: 1});
  assert.equal(rpcCalls.filter(call => call.name === 'complete_sync_job').length, 1);
});

test('records loading failures instead of stranding claimed jobs', async () => {
  const {scheduler, rpcCalls} = harness({userResult: {data: null, error: new Error('user unavailable')}});
  await quiet(() => scheduler.runJob(job));
  const completion = rpcCalls.find(call => call.name === 'complete_sync_job');
  assert.equal(completion.args.p_status, 'failed');
  assert.equal(completion.args.p_last_error, 'user unavailable');
});

test('records handler failures through the atomic completion boundary', async () => {
  const {scheduler, rpcCalls} = harness({handler: async () => { throw new Error('handler failed'); }});
  await quiet(() => scheduler.runJob(job));
  const completions = rpcCalls.filter(call => call.name === 'complete_sync_job');
  assert.equal(completions.length, 1);
  assert.equal(completions[0].args.p_status, 'failed');
  assert.equal(completions[0].args.p_last_error, 'handler failed');
});

test('cancels a claimed automatic job when its task was disabled after enqueue', async () => {
  const scheduled = {...job, trigger_type: 'scheduled'};
  const handler = async () => ({updated: 1});
  const {scheduler, rpcCalls, taskStateWrites} = harness({handler, settingsResult: {
    data: {enabled: true, short_term_enabled: false, short_term_interval_hours: 1}, error: null
  }});

  await scheduler.runJob(scheduled);

  assert.equal(taskStateWrites.length, 0);
  const completion = rpcCalls.find(call => call.name === 'complete_sync_job');
  assert.equal(completion.args.p_status, 'cancelled');
});

test('heartbeats long-running work before completing it', async () => {
  const {scheduler, rpcCalls} = harness({heartbeatIntervalMs: 5,
    handler: async () => new Promise(resolve => setTimeout(() => resolve({updated: 1}), 18))});
  await scheduler.runJob(job);
  assert.ok(rpcCalls.some(call => call.name === 'heartbeat_sync_job'));
  assert.equal(rpcCalls.at(-1).name, 'complete_sync_job');
});

test('does not report success after losing lease ownership', async () => {
  const {scheduler, rpcCalls} = harness({heartbeatIntervalMs: 5,
    handler: async () => new Promise(resolve => setTimeout(() => resolve({updated: 1}), 12)),
    rpcResults: {heartbeat_sync_job: {data: false, error: null}}});
  await quiet(() => scheduler.runJob(job));
  const completions = rpcCalls.filter(call => call.name === 'complete_sync_job');
  assert.equal(completions.length, 1);
  assert.equal(completions[0].args.p_status, 'failed');
  assert.match(completions[0].args.p_last_error, /lease was lost/i);
});

test('surfaces atomic completion persistence errors', async () => {
  const {scheduler} = harness({rpcResults: {complete_sync_job: {
    data: null, error: new Error('completion unavailable')
  }}});
  await assert.rejects(quiet(() => scheduler.runJob(job)), /completion unavailable/);
});

test('emits only alerts the database marks due after its cooldown', async () => {
  const {scheduler} = harness({rpcResults: {monitor_operational_health: {data: [
    {alert_key: 'sync-backlog', severity: 'warning', message: 'Queue is old.'}
  ], error: null}}});
  const original = console.warn;
  const warnings = [];
  console.warn = message => warnings.push(message);
  try {
    const alerts = await scheduler.evaluateOperationalHealth();
    assert.equal(alerts.length, 1);
    assert.deepEqual(warnings, ['[Operations][warning] Queue is old.']);
  } finally {
    console.warn = original;
  }
});
