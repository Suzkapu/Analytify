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
