const test = require('node:test');
const assert = require('node:assert/strict');
const {createHealthHandler} = require('./health-server');

test('readiness exposes the exact worker commit and startup state', () => {
  const state = {ready: false, startedAt: '2026-09-05T00:00:00Z', lastPassAt: null, lastError: null};
  const handler = createHealthHandler(state, 'abc123');
  let status;
  let body;
  handler({method: 'GET', url: '/health'}, {
    writeHead: value => { status = value; },
    end: value => { body = JSON.parse(value); }
  });
  assert.equal(status, 503);
  assert.deepEqual(body, {component: 'analytify-sync', commit: 'abc123', ...state});

  state.ready = true;
  state.lastPassAt = '2026-09-05T00:01:00Z';
  handler({method: 'GET', url: '/health'}, {
    writeHead: value => { status = value; },
    end: value => { body = JSON.parse(value); }
  });
  assert.equal(status, 200);
  assert.equal(body.commit, 'abc123');
  assert.equal(body.lastPassAt, state.lastPassAt);
});

const {loadIsolated} = require('./test-support/load-isolated.cjs');
test('health handler rejects other methods and URLs without caching operational state', () => {
  const handler=createHealthHandler({ready:true},'fixture');
  for (const request of [{method:'POST',url:'/health'},{method:'GET',url:'/health?extra=1'}]) {
    let status, headers, body;
    handler(request,{writeHead(s,h){status=s;headers=h;},end(value){body=JSON.parse(value);}});
    assert.equal(status,404);assert.equal(headers['Cache-Control'],'no-store');assert.deepEqual(body,{error:'Not found'});
  }
});
test('health lifecycle binds only loopback and reflects failure and recovery', async t => {
  let handler, callback, errorListener, closed=false;
  const server={once(event,fn){assert.equal(event,'error');errorListener=fn;},listen(port,host,fn){assert.equal(port,8787);assert.equal(host,'127.0.0.1');callback=fn;},address:()=>({port:8787}),close(fn){closed=true;fn();}};
  const source=loadIsolated('health-server.js',{'node:http':{createServer(fn){handler=fn;return server;}},'node:fs':{readFileSync(){throw Object.assign(new Error('absent'),{code:'ENOENT'});}}});
  const old=process.env.DEPLOY_COMMIT_SHA;delete process.env.DEPLOY_COMMIT_SHA;t.after(()=>{if(old===undefined)delete process.env.DEPLOY_COMMIT_SHA;else process.env.DEPLOY_COMMIT_SHA=old;});
  const health=source.createHealthServer();const listening=health.listen();callback();assert.deepEqual(await listening,{port:8787});
  health.recordFailure(new Error('unavailable'));assert.equal(health.state.lastError,'unavailable');health.markReady();assert.equal(health.state.lastError,null);assert.equal(health.state.ready,true);
  health.recordFailure('plain failure');assert.equal(health.state.lastError,'plain failure');health.recordPass();assert.ok(health.state.lastPassAt);assert.equal(health.state.lastError,null);
  let body;handler({method:'GET',url:'/health'},{writeHead(status){assert.equal(status,200);},end(text){body=JSON.parse(text);}});assert.equal(body.commit,'development');
  await health.close();assert.equal(closed,true);
  const failed=health.listen();errorListener(new Error('address in use'));await assert.rejects(failed,/address in use/);
});
test('release identity prefers the environment, falls back to file, and surfaces unreadable files', t => {
  const old=process.env.DEPLOY_COMMIT_SHA;t.after(()=>{if(old===undefined)delete process.env.DEPLOY_COMMIT_SHA;else process.env.DEPLOY_COMMIT_SHA=old;});
  let reads=0;const source=loadIsolated('health-server.js',{'node:fs':{readFileSync(){reads++;return ' file-commit \n';}}});
  process.env.DEPLOY_COMMIT_SHA=' env-commit ';assert.equal(source.deployedCommit(),'env-commit');assert.equal(reads,0);
  delete process.env.DEPLOY_COMMIT_SHA;assert.equal(source.deployedCommit(),'file-commit');
  const failing=loadIsolated('health-server.js',{'node:fs':{readFileSync(){throw Object.assign(new Error('denied'),{code:'EACCES'});}}});assert.throws(()=>failing.deployedCommit(),/denied/);
});

test('real loopback readiness endpoint exposes startup, recovery and exact deployed identity',async t=>{
  const {createHealthServer}=require('./health-server');
  const health=createHealthServer({port:0,commit:'test-only-loopback'});
  t.after(()=>health.close());
  const address=await health.listen();
  assert.equal(address.address,'127.0.0.1');
  const request=path=>new Promise((resolve,reject)=>{
    require('node:http').get({hostname:'127.0.0.1',port:address.port,path},response=>{
      let body='';response.setEncoding('utf8');response.on('data',chunk=>{body+=chunk;});response.on('end',()=>resolve({status:response.statusCode,headers:response.headers,body:JSON.parse(body)}));
    }).on('error',reject);
  });
  const starting=await request('/health');assert.equal(starting.status,503);assert.equal(starting.body.commit,'test-only-loopback');assert.equal(starting.headers['cache-control'],'no-store');
  health.recordFailure(new Error('test startup issue'));assert.equal((await request('/health')).body.lastError,'test startup issue');
  health.markReady();health.recordPass();const ready=await request('/health');assert.equal(ready.status,200);assert.equal(ready.body.ready,true);assert.equal(ready.body.lastError,null);assert.ok(ready.body.lastPassAt);
  assert.equal((await request('/unknown')).status,404);
});
