const test = require('node:test');
const assert = require('node:assert/strict');
const {loadIsolated} = require('./test-support/load-isolated.cjs');
function harness(t, options = {}) {
  const events = [], logs = [], errors = [], listeners = {}, removed=[];
  t.mock.method(console, 'log', (...args) => logs.push(args));
  t.mock.method(console, 'error', (...args) => errors.push(args));
  t.mock.method(process, 'once', (signal, fn) => {listeners[signal] = fn;});
  t.mock.method(process,'removeListener',(signal,fn)=>{removed.push({signal,fn});});
  const config = {supabaseUrl:'https://fixture.invalid',supabaseServiceRoleKey:'fixture',spotifyTokenEncryptionKey:'key',spotifyTokenEncryptionKeys:{1:'key'},spotifyTokenEncryptionWriteVersion:1,pollSeconds:15};
  const runtime = Object.fromEntries(['start','markReady','recordPassStarted','recordPassSucceeded','recordFailure','stop'].map(name => [name, async () => {events.push(name); if(options[name]) throw new Error(options[name]);}]));
  const health = Object.fromEntries(['listen','close','markReady','recordPass','recordFailure'].map(name => [name, (...args) => {events.push(`health:${name}`); if(name==='recordFailure') assert.ok(args[0] instanceof Error);if(options[`health:${name}`])throw new Error(options[`health:${name}`]);}]));
  let passes = 0;
  const scheduler = {async runPass() { events.push('pass'); passes++; if(options.signal && passes >= (options.signalAfter || 1)) listeners[options.signal](); if(options.passError && (options.alwaysFail || passes===1)) throw options.passError instanceof Error ? options.passError : new Error('pass unavailable'); return {queued:2,processed:1}; }};
  const supabase = {from(table) {assert.equal(table,'deployment_revisions');return {async upsert(row, opts) {events.push('deployment');assert.equal(row.component,'worker');assert.equal(row.commit_sha,'fixture-commit');assert.equal(opts.onConflict,'component');return {error:options.releaseError ? new Error('release failed') : null};}};}};
  const source = loadIsolated('index.js', {
    '@supabase/supabase-js':{createClient(url,key,opts) {assert.equal(url,config.supabaseUrl);assert.equal(key,'fixture');assert.deepEqual(opts.auth,{persistSession:false,autoRefreshToken:false});assert.equal(opts.realtime.transport,'fixture-ws');return supabase;}},
    ws:'fixture-ws','./config':{loadConfig:()=>config},
    './health-server':{deployedCommit:()=>'fixture-commit', createHealthServer:()=>health},
    './worker-runtime-health':{createWorkerRuntimeHealth:()=>runtime},
    './spotify-client':{createSpotifyClient:()=>({fixture:true})},
    './credential-store':{createCredentialStore:()=>({async migrateAllLegacy() {events.push('migrate');if(options.migrateError)throw new Error('migration failed'); return options.migrated ?? 0;}, async rotatePending(){events.push('rotate');if(options.rotationError)throw new Error('rotation failed');return {examined:options.rotated ?? 0,rotated:1,failed:0};}})},
    './push-dispatcher':{createPushDispatcher:()=>({})},'./task-registry':{createTaskRegistry:()=>({})},'./scheduler':{createScheduler:()=>scheduler}
  }, {main:options.main});
  return {source,events,logs,errors,listeners,removed};
}
test('startup records release identity, migrates and rotates before exposing a scheduler', async t => {
  const h = harness(t, {migrated:2,rotated:1});
  const service = await h.source.createService();
  assert.deepEqual(h.events,['deployment','start','migrate','rotate']);
  assert.ok(service.scheduler); assert.equal(h.logs.length,2);
});
test('one-shot service records readiness, pass success and always shuts down after success', async t => {
  const h = harness(t); await h.source.main();
  assert.deepEqual(h.events,['health:listen','deployment','start','migrate','rotate','health:markReady','markReady','recordPassStarted','pass','health:recordPass','recordPassSucceeded','stop','health:close']);
  assert.deepEqual(Object.keys(h.listeners),['SIGINT','SIGTERM']);
});
for (const options of [{releaseError:true},{start:'startup failed'},{markReady:'ready failed'}]) test(`startup failure closes readiness endpoint: ${JSON.stringify(options)}`, async t => {
  const h = harness(t, options); await assert.rejects(h.source.main([]), /failed/); assert.equal(h.events.at(-1),'health:close'); assert.ok(h.events.includes('health:recordFailure')); assert.equal(h.events.includes('pass'),false);
});
test('one-shot pass failure persists failure and propagates to the caller', async t => {
  const h = harness(t,{passError:true,recordFailure:'runtime unavailable'}); await assert.rejects(h.source.main([]),/pass unavailable/); assert.equal(h.errors.length,2); assert.ok(h.events.includes('health:recordFailure'));
});
test('shutdown still closes health if runtime stop fails', async t => {
  const h = harness(t,{stop:'stop failed'});await assert.rejects(h.source.main([]),/stop failed/);assert.equal(h.events.at(-1),'health:close');
});
for (const signal of ['SIGINT','SIGTERM']) test(`watch mode stops cleanly on ${signal} after a failed pass`, async t => {
  const h = harness(t,{signal,passError:true});await h.source.main(['--watch']);assert.ok(h.events.includes('recordFailure'));assert.deepEqual(h.events.slice(-2),['stop','health:close']);
});
test('watch mode recovers on the next pass with a minimum wait after an overlong pass', async t => {
  const h = harness(t,{passError:true,signal:'SIGTERM',signalAfter:2}); let waited;
  t.mock.method(global, 'setTimeout', (fn,ms) => {waited=ms;fn();return 1;});
  let now=0;t.mock.method(Date,'now',()=>{now+=20000;return now;});
  await h.source.main(['--watch']);assert.equal(h.events.filter(event=>event==='pass').length,2);assert.ok(h.events.includes('recordPassSucceeded'));assert.equal(waited,1000);assert.deepEqual(h.events.slice(-2),['stop','health:close']);
});
test('direct entrypoint reports fatal startup errors with a failing exit code', async t => {
  const old=process.exitCode;t.after(()=>{process.exitCode=old;});const h=harness(t,{main:true,releaseError:true});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(process.exitCode,1);assert.match(h.errors[0][0],/Fatal error/);
});
test('compatibility entrypoint invokes one-shot mode and propagates a fatal exit status', async t => {
  const old=process.exitCode;t.after(()=>{process.exitCode=old;});let argv;let logged;
  t.mock.method(console,'error',(...args)=>{logged=args;});
  loadIsolated('daily-pull.js',{'./index':{main:async args=>{argv=args;throw new Error('fixture failure');}}});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(argv,[]);assert.equal(process.exitCode,1);assert.match(logged[0],/Compatibility run failed/);
});

for (const options of [{passError:true},{recordPassStarted:'pass start failed'},{recordPassSucceeded:'pass success failed'},{markReady:'ready failed'},{migrateError:true},{rotationError:true}]) test(`failed startup/pass releases acquired resources exactly once: ${JSON.stringify(options)}`,async t=>{
 const h=harness(t,options);await assert.rejects(h.source.main([]),/failed|unavailable/);assert.equal(h.events.filter(event=>event==='stop').length,1);assert.equal(h.events.filter(event=>event==='health:close').length,1);
});
test('cleanup failures retain original pass failure and still close readiness',async t=>{
 const original=new Error('pass unavailable');const h=harness(t,{passError:original,stop:'cleanup failed','health:close':'close failed'});await assert.rejects(h.source.main([]),error=>error===original);assert.equal(h.events.filter(event=>event==='health:close').length,1);assert.ok(h.errors.some(args=>String(args[0]).includes('cleanup')));
});
test('migration cleanup failure retains the original startup error',async t=>{
 const h=harness(t,{migrateError:true,stop:'cleanup failed'});await assert.rejects(h.source.main([]),/migration failed/);assert.equal(h.events.filter(event=>event==='health:close').length,1);
});
test('successful runs surface readiness close failure',async t=>{
 const h=harness(t,{'health:close':'close failed'});await assert.rejects(h.source.main([]),/close failed/);
});
test('repeated in-process runs remove their own signal listeners without touching unrelated listeners',async t=>{
 const h=harness(t);await h.source.main([]);const first={...h.listeners};await h.source.main([]);assert.equal(h.removed.length,4);assert.deepEqual(h.removed.map(row=>row.signal),['SIGINT','SIGTERM','SIGINT','SIGTERM']);assert.equal(h.removed[0].fn,first.SIGINT);assert.equal(h.removed[1].fn,first.SIGTERM);assert.notEqual(h.removed[2].fn,first.SIGINT);
});
