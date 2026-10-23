import assert from 'node:assert/strict';
import {invoke, userId, leagueId, type Call, type Reply} from '../_shared/handler-fixture.test.ts';

// Keep the real pinned Supabase SDK and handler. Intercept every service boundary;
// these synthetic IDs/tokens never leave the process or reach hosted services.
function failureRecordingReply(mode: 'postgrest-error' | 'transport-error') {
  return (call: Call): Reply | undefined => {
    const path = call.url.pathname;
    if (path.endsWith('/claim_song_league_playlist_sync')) return {body: true};
    if (path.endsWith('/get_song_league_weekly_playlist_payload')) return {body: [{league_name: 'Isolated league', track_uris: ['spotify:track:isolated'], playlist_revision: 2, round_id: leagueId, playlist_window_start: '2026-10-09'}]};
    if (path.endsWith('/song_league_members')) return {body: [{user_id: userId, display_name: 'Isolated member'}]};
    if (path.endsWith('/users')) return {body: call.method === 'GET' ? [{id: userId, spotify_refresh_token: 'isolated-refresh'}] : null};
    if (path.endsWith('/spotify_credentials')) return {body: []};
    if (path.endsWith('/song_league_playlists')) return {body: [{user_id: userId, spotify_playlist_id: 'isolated-copy', spotify_playlist_url: 'https://open.spotify.com/playlist/isolated', last_synced_revision: 1}]};
    if (path.endsWith('/reserve_song_league_playlist_sync')) return {body: [{operation_marker: 'isolated-operation', spotify_playlist_id: 'isolated-copy', spotify_playlist_url: 'https://open.spotify.com/playlist/isolated'}]};
    if (path.endsWith('/record_song_league_playlist_sync_failure')) {
      if (mode === 'transport-error') throw new TypeError('isolated failure-record transport unavailable');
      return {status: 400, body: {code: 'XX000', message: 'isolated failure-record persistence unavailable'}};
    }
    if (path.endsWith('/release_song_league_playlist_sync')) return {body: true};
    // A token failure after a real reservation drives the production member
    // catch without fabricating an SDK-level rejected RPC promise.
    if (call.url.hostname === 'accounts.spotify.com') return {status: 400, body: {error: 'invalid_grant'}};
  };
}

for (const mode of ['postgrest-error', 'transport-error'] as const) {
  Deno.test(`League sync preserves the primary member failure and reports unavailable failure persistence (${mode})`, async () => {
    const result = await invoke('sync', {leagueId, allMembers: true}, {reply: failureRecordingReply(mode)}, {token: 'fixture-service-key', origin: null});
    assert.equal(result.response.status, 200);
    assert.equal(result.value.ok, false); assert.equal(result.value.synced, 0); assert.equal(result.value.failed, 1);
    assert.equal(result.value.results.length, 1); assert.equal(result.value.results[0].userId, userId);
    assert.equal(result.value.results[0].success, false);
    assert.equal(result.value.results[0].error, 'This playlist could not be updated. Please try again later.');
    assert.equal(result.calls.filter(call => call.url.pathname.endsWith('/record_song_league_playlist_sync_failure')).length, 1);
    assert.equal(result.calls.filter(call => call.url.pathname.endsWith('/release_song_league_playlist_sync')).length, 1);
    assert.equal(result.calls.some(call => call.url.pathname.endsWith('/complete_song_league_playlist_sync')), false);
    assert.equal(result.calls.some(call => call.url.hostname === 'api.spotify.com'), false);
    assert.ok(!JSON.stringify(result.value).includes('isolated failure-record'), 'Internal persistence details must stay out of the public response');
    assert.ok(result.errors.some(entry => String(entry[0]).includes(`playlist sync member ${userId} failed`)), 'Primary member failure must be observable');
    assert.ok(result.errors.some(entry => String(entry[0]).includes(`playlist sync failure state ${userId} failed`)), 'Failure-state persistence error must be observable independently of the primary member failure');
  });
}
