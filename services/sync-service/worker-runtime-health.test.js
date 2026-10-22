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

test('heartbeat failure is logged and repeated startup does not create duplicate timers',async t=>{
 const ticks=[],warns=[],events=[];let clears=0;
 t.mock.method(global,'setInterval',(fn,ms)=>{assert.equal(ms,25);ticks.push(fn);return {unref(){}};});t.mock.method(global,'clearInterval',()=>{clears++;});
 const runtime=createWorkerRuntimeHealth({supabase:{async rpc(name,args){events.push(args);return {error:args.p_event==='heartbeat'?new Error('offline'):null};}},heartbeatMs:25,logger:{warn:(...args)=>warns.push(args)}});
 await runtime.start();await runtime.start();assert.equal(ticks.length,1);ticks[0]();await new Promise(resolve=>setImmediate(resolve));assert.equal(warns.length,1);
 await runtime.recordFailure('plain failure');assert.equal(events.at(-1).p_error,'plain failure');await runtime.recordFailure({});assert.equal(events.at(-1).p_error,'[object Object]');await runtime.recordFailure(null);assert.equal(events.at(-1).p_error,null);await runtime.stop();assert.equal(clears,1);await runtime.stop();assert.equal(clears,1);
});
