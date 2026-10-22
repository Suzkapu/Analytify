const test = require('node:test');
const assert = require('node:assert/strict');

const {createPushDispatcher} = require('./push-dispatcher');

test('invokes the trusted Song League notification function once per scheduler pass', async () => {
  const calls = [];
  const dispatcher = createPushDispatcher({
    supabase: {
      functions: {
        invoke: async (name, options) => {
          calls.push([name, options]);
          return {data: {queued: 4, sent: 4, failed: 0}, error: null};
        }
      }
    }
  });
  const now = new Date('2026-09-04T00:01:00.000Z');

  const result = await dispatcher.dispatchDue(now);

  assert.deepEqual(calls, [[
    'song-league-notifications',
    {body: {now: '2026-09-04T00:01:00.000Z'}}
  ]]);
  assert.deepEqual(result, {queued: 4, sent: 4, failed: 0});
});

test('surfaces edge delivery errors without exposing credentials', async () => {
  const dispatcher = createPushDispatcher({
    supabase: {functions: {invoke: async () => ({data: null, error: {message: 'delivery unavailable'}})}}
  });

  await assert.rejects(() => dispatcher.dispatchDue(new Date()), /delivery unavailable/);
});

test('empty notification response produces zero totals and transport failures have a safe default',async()=>{
 const empty=createPushDispatcher({supabase:{functions:{invoke:async()=>({data:null,error:null})}}});assert.deepEqual(await empty.dispatchDue(),{queued:0,sent:0,failed:0});
 const failed=createPushDispatcher({supabase:{functions:{invoke:async()=>({error:{}})}}});await assert.rejects(failed.dispatchDue(),/Song League push delivery failed/);
});

test('application-level notification errors propagate even when transport succeeds',async()=>{
 const dispatcher=createPushDispatcher({supabase:{functions:{invoke:async()=>({data:{error:'delivery rejected'},error:null})}}});await assert.rejects(dispatcher.dispatchDue(),/delivery rejected/);
});
