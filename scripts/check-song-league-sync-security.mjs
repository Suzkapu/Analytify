import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const migration = readFileSync(
  'supabase/migrations/20260906210000_playlist_sync_authority.sql',
  'utf8'
);
const edgeFunction = readFileSync(
  'supabase/functions/song-league-playlist-sync/index.ts',
  'utf8'
);
const workerTask = readFileSync(
  'services/sync-service/tasks/song-league-playlists-task.js',
  'utf8'
);
const requestSecurity = readFileSync(
  'supabase/functions/_shared/request-security.ts',
  'utf8'
);
const requestLimits = readFileSync(
  'supabase/migrations/20260908150000_edge_request_rate_limits.sql',
  'utf8'
);

assert.match(migration, /create table private[.]song_league_playlist_sync_leases/);
assert.match(migration, /lease_expires_at <= now\(\)/);
assert.match(migration, /create function public[.]complete_song_league_playlist_sync/);
assert.match(migration, /v_current_revision <> p_expected_source_revision/);
assert.match(migration, /last_synced_revision = p_expected_applied_revision/);
assert.match(migration, /prevent_song_league_revision_regression/);
assert.match(edgeFunction, /isTrustedServiceToken\(jwt, serviceRoleKey\)/);
assert.doesNotMatch(edgeFunction, /getJwtRole|payload[?][.]role/);
assert.match(edgeFunction, /League-wide playlist synchronization is restricted to the trusted worker/);
assert.match(edgeFunction, /claim_song_league_playlist_sync/);
assert.match(edgeFunction, /complete_song_league_playlist_sync/);
assert.match(edgeFunction, /release_song_league_playlist_sync/);
assert.match(edgeFunction, /finally/);
assert.match(edgeFunction, /enforceRateLimit\(admin, request, 'playlist-sync:user'/);
assert.match(requestSecurity, /'Retry-After'/);
assert.match(requestLimits, /consume_edge_request_limit/);
assert.match(workerTask, /functions[.]invoke\('song-league-playlist-sync'/);
assert.doesNotMatch(workerTask, /spotify[.]api/);

function shouldSkipSync(mapping, payloadRevision, roundId) {
  return Boolean(
    mapping?.spotify_playlist_id
    && !mapping?.last_error
    && Number(mapping?.last_synced_revision || 0) >= payloadRevision
    && (mapping?.last_synced_round_id || null) === (roundId || null)
  );
}

assert.equal(shouldSkipSync({
  spotify_playlist_id: 'playlist', last_synced_revision: 5,
  last_synced_round_id: 'round', last_error: null
}, 5, 'round'), true);
assert.equal(shouldSkipSync({
  spotify_playlist_id: 'playlist', last_synced_revision: 4,
  last_synced_round_id: 'round', last_error: null
}, 5, 'round'), false);
assert.equal(shouldSkipSync({
  spotify_playlist_id: 'playlist', last_synced_revision: 5,
  last_synced_round_id: 'old-round', last_error: null
}, 5, 'round'), false);

console.log('Song League playlist sync uses one lease-bound, revision-safe mutation authority.');
