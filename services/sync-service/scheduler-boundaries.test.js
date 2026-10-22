const test=require('node:test');
const assert=require('node:assert/strict');
const {createScheduler,isJobAllowed}=require('./scheduler');
function harness(options={}) {
 const writes=[],rpcCalls=[],warnings=[],errors=[];
 const results=options.results||{};
 const supabase={from(table){const q={select(){return q;},eq(){return q;},or(){return q;},async single(){return {data:table==='users'?{id:'owner',display_name:'Owner',backup_active:options.backup!==false,spotify_refresh_token:'legacy'}:{timezone:'UTC',short_term_interval_hours:2,...options.settings},error:results[table]?.error};},async in(key,ids){writes.push({operation:'in',table,key,ids});if(q.deleting)return {error:options.deleteError};return results[table]||{data:[],error:null};},async upsert(value,opts){writes.push({operation:'upsert',table,value,opts});return {error:options.startError};},async insert(value){writes.push({operation:'insert',table,value});return {error:options.insertError};},delete(){q.deleting=true;return q;},then(resolve,reject){return Promise.resolve(results[table]||{data:[],error:null}).then(resolve,reject);}};return q;},async rpc(name,args){rpcCalls.push({name,args});const result=options.rpc?.[name];if(typeof result==='function')return result(args);return result||{data:name==='heartbeat_sync_job'?true:null,error:null};}};
 const scheduler=createScheduler({supabase,config:{workerId:'worker',adminSpotifyIds:['admin','missing'],maxJobsPerPass:5,leaseSeconds:options.leaseSeconds,...options.config},tasks:options.tasks||{stats_short_term:async input=>{writes.push({operation:'handler',input});return options.details;}},credentials:{get:async()=>{if(options.credentialError)throw options.credentialError;return options.noCredential?null:{refreshToken:'fixture'};},remove:async id=>{writes.push({operation:'remove',id});if(options.removeError)throw options.removeError;}},pushDispatcher:{dispatchDue:async()=>{if(options.pushError)throw options.pushError;}}});
 return {scheduler,writes,rpcCalls,warnings,errors};
}
function silence(t){t.mock.method(console,'warn',()=>{});t.mock.method(console,'error',()=>{});}
const job={id:'job',user_id:'owner',task_key:'stats_short_term',trigger_type:'manual'};
test('admin reconciliation grants configured profiles and removes stale identities only',async t=>{
 silence(t);const h=harness({results:{users:{data:[{id:'owner',spotify_id:'admin'}]},app_admins:{data:[{user_id:'owner'},{user_id:'stale'}]}}});await h.scheduler.reconcileAdmins();
 assert.deepEqual(h.writes.find(w=>w.operation==='upsert').value,[{user_id:'owner'}]);assert.deepEqual(h.writes.at(-1),{operation:'in',table:'app_admins',key:'user_id',ids:['stale']});
});
test('empty admin profile and grant lists do not issue empty writes',async t=>{
 silence(t);const h=harness({results:{users:{data:null},app_admins:{data:null}}});await h.scheduler.reconcileAdmins();assert.equal(h.writes.some(w=>w.operation==='upsert'),false);
});
for(const scenario of ['profile','save','admin','delete'])test(`admin reconciliation propagates ${scenario} persistence failure`,async t=>{
 silence(t);const err=new Error(`${scenario} unavailable`);const h=harness({startError:scenario==='save'?err:null,deleteError:scenario==='delete'?err:null,results:{users:{data:[{id:'owner',spotify_id:'admin'}],error:scenario==='profile'?err:null},app_admins:{data:[{user_id:'stale'}],error:scenario==='admin'?err:null}}});
 await assert.rejects(h.scheduler.reconcileAdmins(),/unavailable/);
});
test('enqueue respects backup ownership, credentials, policy, required tasks, next-run time and duplicate races',async()=>{
 const now=new Date('2026-10-16T12:00:00Z');const settings=[{user_id:'disabled',enabled:true,short_term_enabled:true},{user_id:'missing',enabled:true,short_term_enabled:true},{user_id:'owner',enabled:true,short_term_enabled:true,medium_term_enabled:true,long_term_enabled:true,song_league_playlists_enabled:true,history_enabled:true,shared_playlists_enabled:true},{user_id:'required',enabled:false,short_term_required:true}];
 const h=harness({results:{sync_user_settings:{data:settings},users:{data:[{id:'disabled',backup_active:false,spotify_refresh_token:'legacy'},{id:'missing',backup_active:true},{id:'owner',backup_active:true,spotify_refresh_token:'legacy'},{id:'required',backup_active:true}]},spotify_credentials:{data:[{user_id:'required'}]},sync_task_state:{data:[{user_id:'owner',task_key:'stats_medium_term',next_run_at:'2026-10-17T12:00:00Z'},{user_id:'owner',task_key:'stats_short_term',next_run_at:now.toISOString()}]}}});
 assert.equal(await h.scheduler.enqueueDueJobs(now),6);const jobs=h.writes.filter(w=>w.operation==='insert').map(w=>w.value);assert.equal(jobs.filter(j=>j.user_id==='required').length,1);assert.ok(jobs.every(j=>['owner','required'].includes(j.user_id)));assert.ok(!jobs.some(j=>j.task_key==='stats_medium_term'));
 const duplicate=harness({results:{sync_user_settings:{data:[settings[3]]},users:{data:[{id:'required',backup_active:true,spotify_refresh_token:'legacy'}]}},insertError:{code:'23505'}});assert.equal(await duplicate.scheduler.enqueueDueJobs(now),0);
 const blocked=harness({config:{spotifyRestrictedFeaturesApprovalReference:''},results:{sync_user_settings:{data:[settings[2]]},users:{data:[{id:'owner',backup_active:true,spotify_refresh_token:'legacy'}]}}});assert.equal(await blocked.scheduler.enqueueDueJobs(now),1);assert.equal(blocked.writes.find(w=>w.operation==='insert').value.task_key,'shared_playlists');
});
test('enqueue excludes non-Friday playlist schedules and permits explicitly any-day playlists',async()=>{
 const h=harness({results:{sync_user_settings:{data:[{user_id:'owner',enabled:true,song_league_playlists_enabled:true}]},users:{data:[{id:'owner',backup_active:true,spotify_refresh_token:'legacy'}]}}});assert.equal(await h.scheduler.enqueueDueJobs(new Date('2026-10-15T12:00Z')),0);
 const empty=harness();assert.equal(await empty.scheduler.enqueueDueJobs(),0);
});
for(const table of ['sync_user_settings','users','sync_task_state','spotify_credentials'])test(`enqueue aborts on ${table} read failure`,async()=>{
 const h=harness({results:{sync_user_settings:{data:[{user_id:'owner'}]},[table]:{error:new Error('read failed')}}});await assert.rejects(h.scheduler.enqueueDueJobs(),/read failed/);assert.equal(h.writes.some(w=>w.operation==='insert'),false);
});
test('enqueue surfaces non-duplicate insert errors and handles empty secondary rows',async()=>{
 const settings={user_id:'owner',enabled:true,shared_playlists_enabled:true};const h=harness({results:{sync_user_settings:{data:[settings]},users:{data:[{id:'owner',backup_active:true,spotify_refresh_token:'legacy'}]},sync_task_state:{data:null},spotify_credentials:{data:null}},insertError:new Error('insert failed')});await assert.rejects(h.scheduler.enqueueDueJobs(),/insert failed/);
 const empty=harness({results:{sync_user_settings:{data:[settings]},users:{data:null},sync_task_state:{data:null},spotify_credentials:{data:null}}});assert.equal(await empty.scheduler.enqueueDueJobs(),0);
});
test('job claiming surfaces RPC failure and treats a null queue as empty with a bounded lease',async()=>{
 const h=harness({leaseSeconds:99999});assert.deepEqual(await h.scheduler.claimQueuedJobs(),[]);assert.equal(h.rpcCalls[0].args.p_lease_seconds,900);
 const fail=harness({rpc:{claim_sync_jobs:{error:new Error('claim failed')}}});await assert.rejects(fail.scheduler.claimQueuedJobs(),/claim failed/);
});
for(const [name,options,expected] of [
 ['settings unavailable',{results:{sync_user_settings:{error:new Error('settings failed')}}},'settings failed'],
 ['handler missing',{tasks:{}},'No handler'],
 ['start state unavailable',{startError:new Error('start failed')},'start failed'],
 ['credential missing',{noCredential:true},'credential is missing'],
 ['unknown interval unit',{settings:{short_term_interval_unit:'weeks'}},'Unsupported interval'],
 ['string failure',{credentialError:'string failure'},'string failure']])test(`job failure retains a retry and records the error: ${name}`,async t=>{
 silence(t);const h=harness(options);await h.scheduler.runJob(job);const completion=h.rpcCalls.find(c=>c.name==='complete_sync_job').args;assert.equal(completion.p_status,'failed');assert.match(completion.p_last_error,new RegExp(expected));assert.ok(completion.p_next_run_at);
});
test('handler receives only its user credential and successful completion retains a start timestamp',async()=>{
 const h=harness();await h.scheduler.runJob({...job,started_at:'2026-10-15T00:00:00Z'});const input=h.writes.find(w=>w.operation==='handler').input;assert.equal(input.user.id,'owner');assert.equal(input.user.spotify_refresh_token,undefined);assert.equal(input.user.spotify_credential.refreshToken,'fixture');const result=h.rpcCalls.at(-1).args;assert.equal(result.p_status,'succeeded');assert.deepEqual(result.p_details,{});assert.equal(result.p_last_started_at,'2026-10-15T00:00:00Z');
});
test('policy and backup changes cancel claimed work without materializing credentials',async()=>{
 for(const options of [{backup:false},{config:{spotifyRestrictedFeaturesApprovalReference:''}}]){const h=harness(options);await h.scheduler.runJob(job);const completion=h.rpcCalls.at(-1).args;assert.equal(completion.p_status,'cancelled');assert.match(completion.p_details.reason,/Backup|approval/);assert.equal(h.writes.length,0);}
 assert.equal(isJobAllowed({...job,task_key:'unknown',trigger_type:'scheduled'},{}),false);
});
test('failed invalid-credential cleanup is logged but cannot schedule another Spotify retry',async t=>{
 silence(t);const h=harness({credentialError:Object.assign(new Error('expired'),{kind:'credential_invalid'}),removeError:'discard failed'});await h.scheduler.runJob(job);assert.equal(h.rpcCalls.at(-1).args.p_next_run_at,null);
});
test('heartbeat persistence and thrown transport errors cannot complete a lost lease successfully',async t=>{
 silence(t);
 for(const thrown of [false,true]){let tick;const interval=t.mock.method(global,'setInterval',fn=>{tick=fn;return {unref(){}};});const clear=t.mock.method(global,'clearInterval',()=>{});
 const h=harness({tasks:{stats_short_term:async()=>{tick();await new Promise(resolve=>setImmediate(resolve));return {};}},rpc:{heartbeat_sync_job:async()=>{if(thrown)throw new Error('transport failed');return {error:new Error('heartbeat failed')};}}});
 await h.scheduler.runJob(job);assert.equal(h.rpcCalls.at(-1).args.p_status,'failed');assert.match(h.rpcCalls.at(-1).args.p_last_error,/failed/);interval.mock.restore();clear.mock.restore();}
});
test('run pass tolerates push/monitor failure and processes claimed jobs after admin reconciliation',async t=>{
 silence(t);const h=harness({pushError:'push failed',rpc:{monitor_operational_health:{error:new Error('monitor failed')},claim_sync_jobs:{data:[job]}}});assert.deepEqual(await h.scheduler.runPass(),{queued:0,processed:1});assert.equal(h.rpcCalls.at(-1).args.p_status,'succeeded');
 const empty=harness();assert.deepEqual(await empty.scheduler.runPass(),{queued:0,processed:0});assert.deepEqual(await empty.scheduler.evaluateOperationalHealth(),[]);
});

test('complete administrator allowlist requires no removals and produces no missing-profile warnings',async t=>{
 const warn=t.mock.method(console,'warn',()=>{});
 const h=harness({config:{adminSpotifyIds:['admin']},results:{users:{data:[{id:'owner',spotify_id:'admin'}]},app_admins:{data:[{user_id:'owner'}]}}});await h.scheduler.reconcileAdmins();assert.equal(warn.mock.callCount(),0);
});
test('scheduler generates a worker identity when omitted and uses safe default completion details',async()=>{
 const h=harness({config:{workerId:undefined}});assert.match(h.scheduler.workerId,/^[0-9a-f-]{36}$/);await h.scheduler.runJob(job);assert.deepEqual(h.rpcCalls.at(-1).args.p_details,{});
});
test('run pass logs plain operational exceptions without preventing queued work',async t=>{
 silence(t);const h=harness({rpc:{monitor_operational_health:async()=>{throw 'plain monitor failure';}}});assert.deepEqual(await h.scheduler.runPass(),{queued:0,processed:0});
});
