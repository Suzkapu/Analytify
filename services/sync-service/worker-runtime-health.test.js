const test = require('node:test');
const assert = require('node:assert/strict');

const {createWorkerRuntimeHealth} = require('./worker-runtime-health');

test('persists worker lifecycle events with one fenced instance identity', async () => {
  const calls = [];
  const supabase = {rpc: async (name, args) => {
    calls.push({name, args});
    return {data: true, error: null};
  }};
  const runtime = createWorkerRuntimeHealth({
    supabase,
    instanceId: 'worker-instance-1',
    commit: 'commit-a',
    heartbeatMs: 0
  });

  await runtime.start();
  await runtime.markReady();
  await runtime.recordPassStarted();
  await runtime.recordPassSucceeded();
  await runtime.recordFailure(new Error('provider unavailable'));
  await runtime.stop();

  assert.deepEqual(calls.map(call => call.args.p_event), [
    'startup', 'ready', 'pass_started', 'pass_succeeded', 'pass_failed', 'stopped'
  ]);
  assert.ok(calls.every(call => call.name === 'record_worker_runtime_event'));
  assert.ok(calls.every(call => call.args.p_instance_id === 'worker-instance-1'));
  assert.equal(calls[0].args.p_commit_sha, 'commit-a');
  assert.equal(calls[4].args.p_error, 'provider unavailable');
});

test('surfaces lifecycle persistence failures', async () => {
  const runtime = createWorkerRuntimeHealth({
    supabase: {rpc: async () => ({data: null, error: new Error('database unavailable')})},
    heartbeatMs: 0
  });

  await assert.rejects(runtime.start(), /database unavailable/);
});
