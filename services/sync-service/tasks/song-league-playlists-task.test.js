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
