const test = require('node:test');
const assert = require('node:assert/strict');
const {createSongLeaguePlaylistsTask} = require('./song-league-playlists-task');

test('worker delegates every Spotify mutation to the authoritative Edge Function', async () => {
  const invocations = [];
  const query = {
    select() { return this; },
    eq: async () => ({data: [{league_id: 'league-a'}, {league_id: 'league-a'}, {league_id: 'league-b'}], error: null})
  };
  const supabase = {
    from: table => {
      assert.equal(table, 'song_league_playlists');
      return query;
    },
    functions: {
      invoke: async (name, options) => {
        invocations.push({name, options});
        return {data: {synced: 1, skipped: 2}, error: null};
      }
    }
  };
  const task = createSongLeaguePlaylistsTask({supabase});

  const result = await task({user: {id: 'user-one'}});

  assert.deepEqual(invocations, [
    {name: 'song-league-playlist-sync', options: {body: {leagueId: 'league-a', userId: 'user-one'}}},
    {name: 'song-league-playlist-sync', options: {body: {leagueId: 'league-b', userId: 'user-one'}}}
  ]);
  assert.deepEqual(result, {updated: 2, skipped: 4});
});

test('league delegation handles empty mappings, empty totals and service failures for the requested owner',async()=>{
 for(const scenario of ['empty','null','totals','mapping','transport','application']){
  const invocations=[];const supabase={from(){return {select(){return this;},async eq(column,id){assert.equal(column,'user_id');assert.equal(id,'owner');return {data:scenario==='empty'?[]:scenario==='null'?null:[{league_id:'league'}],error:scenario==='mapping'?new Error('mapping failed'):null};}};},functions:{async invoke(name,args){invocations.push(args);return {data:scenario==='application'?{error:'application failed'}:null,error:scenario==='transport'?new Error('transport failed'):null};}}};
  const run=createSongLeaguePlaylistsTask({supabase});if(['mapping','transport','application'].includes(scenario))await assert.rejects(run({user:{id:'owner'}}),/failed/);else assert.deepEqual(await run({user:{id:'owner'}}),{updated:0,skipped:0});
  assert.equal(invocations.length,['empty','null','mapping'].includes(scenario)?0:1);
 }
});
