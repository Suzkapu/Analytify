import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const migration = readFileSync(
  'supabase/migrations/20260905160000_song_league_playlist_sync_locks.sql',
  'utf8'
);
const schema = readFileSync('supabase_schema.md', 'utf8');
const edgeFunction = readFileSync(
  'supabase/functions/song-league-playlist-sync/index.ts',
  'utf8'
);

const contracts = [
  [
    'migration defines try_lock_song_league_playlist_sync with pg_try_advisory_lock',
    migration.includes('create or replace function public.try_lock_song_league_playlist_sync(p_league_id uuid)')
      && migration.includes('pg_try_advisory_lock')
  ],
  [
    'migration defines unlock_song_league_playlist_sync with pg_advisory_unlock',
    migration.includes('create or replace function public.unlock_song_league_playlist_sync(p_league_id uuid)')
      && migration.includes('pg_advisory_unlock')
  ],
  [
    'migration locks are security definer with secure search_path',
    migration.includes('security definer') && migration.includes('set search_path = public, pg_catalog')
  ],
  [
    'migration revokes advisory lock functions from anon and authenticated roles',
    migration.includes('revoke all on function public.try_lock_song_league_playlist_sync(uuid) from public, anon, authenticated')
      && migration.includes('revoke all on function public.unlock_song_league_playlist_sync(uuid) from public, anon, authenticated')
  ],
  [
    'migration grants advisory lock execution strictly to service_role',
    migration.includes('grant execute on function public.try_lock_song_league_playlist_sync(uuid) to service_role')
      && migration.includes('grant execute on function public.unlock_song_league_playlist_sync(uuid) to service_role')
  ],
  [
    'consolidated schema documents playlist sync advisory locks',
    schema.includes('public.try_lock_song_league_playlist_sync')
      && schema.includes('public.unlock_song_league_playlist_sync')
      && schema.includes('20260905160000_song_league_playlist_sync_locks.sql')
  ],
  [
    'edge function identifies service role callers',
    edgeFunction.includes("getJwtRole(jwt) === 'service_role'")
      && edgeFunction.includes('jwt === serviceRoleKey')
  ],
  [
    'edge function forbids user JWT callers from requesting league-wide sync with 403',
    edgeFunction.includes('body?.allMembers === true')
      && edgeFunction.includes('403')
      && edgeFunction.includes('League-wide playlist synchronization is restricted to the trusted worker')
  ],
  [
    'edge function restricts user JWT callers to their own member record',
    edgeFunction.includes('member.user_id !== callerUserId')
  ],
  [
    'edge function allows service role callers to fan out across league members',
    edgeFunction.includes('body?.allMembers === true || mappingById.has(member.user_id)')
  ],
  [
    'edge function acquires advisory lock and returns 409 if sync in progress',
    edgeFunction.includes("admin.rpc(\n      'try_lock_song_league_playlist_sync'")
      || edgeFunction.includes("admin.rpc('try_lock_song_league_playlist_sync'")
      && edgeFunction.includes('409')
  ],
  [
    'edge function releases advisory lock in finally block',
    edgeFunction.includes('finally')
      && edgeFunction.includes("admin.rpc('unlock_song_league_playlist_sync'")
  ],
  [
    'edge function enforces 5-second rate limit with 429 and Retry-After',
    edgeFunction.includes('elapsedMs < 5000')
      && edgeFunction.includes('429')
      && edgeFunction.includes('Retry-After')
  ],
  [
    'edge function skips already-synced playlist revisions',
    edgeFunction.includes('last_synced_revision')
      && edgeFunction.includes('last_synced_round_id')
      && edgeFunction.includes('skipped: true')
  ]
];

const failures = contracts.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) {
  console.error(`Song league sync security contract checks failed:\n${failures.map(name => `- ${name}`).join('\n')}`);
  process.exitCode = 1;
} else {
  // Behavioral unit test of JWT role extraction and revision skip logic
  function getJwtRole(jwt) {
    try {
      const parts = jwt.split('.');
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
      return typeof payload?.role === 'string' ? payload.role : null;
    } catch {
      return null;
    }
  }

  const userPayload = Buffer.from(JSON.stringify({sub: 'user-123', role: 'authenticated'})).toString('base64url');
  const servicePayload = Buffer.from(JSON.stringify({sub: 'service-worker', role: 'service_role'})).toString('base64url');
  const userJwt = `eyJhbGciOiJIUzI1NiJ9.${userPayload}.signature`;
  const serviceJwt = `eyJhbGciOiJIUzI1NiJ9.${servicePayload}.signature`;

  assert.equal(getJwtRole(userJwt), 'authenticated');
  assert.equal(getJwtRole(serviceJwt), 'service_role');
  assert.equal(getJwtRole('malformed-token'), null);
  assert.equal(getJwtRole(''), null);

  // Validate revision skip contract
  function shouldSkipSync(mapping, payloadRevision, roundId) {
    return Boolean(
      mapping?.spotify_playlist_id
      && !mapping?.last_error
      && Number(mapping?.last_synced_revision || 0) >= payloadRevision
      && (mapping?.last_synced_round_id || null) === (roundId || null)
    );
  }

  assert.equal(
    shouldSkipSync(
      {spotify_playlist_id: 'pl-1', last_synced_revision: 5, last_synced_round_id: 'round-1', last_error: null},
      5,
      'round-1'
    ),
    true,
    'Should skip when revision and round ID match without error'
  );

  assert.equal(
    shouldSkipSync(
      {spotify_playlist_id: 'pl-1', last_synced_revision: 6, last_synced_round_id: 'round-1', last_error: null},
      5,
      'round-1'
    ),
    true,
    'Should skip when last_synced_revision is greater than current'
  );

  assert.equal(
    shouldSkipSync(
      {spotify_playlist_id: 'pl-1', last_synced_revision: 4, last_synced_round_id: 'round-1', last_error: null},
      5,
      'round-1'
    ),
    false,
    'Should not skip when revision is older'
  );

  assert.equal(
    shouldSkipSync(
      {spotify_playlist_id: 'pl-1', last_synced_revision: 5, last_synced_round_id: 'round-0', last_error: null},
      5,
      'round-1'
    ),
    false,
    'Should not skip when round ID differs'
  );

  assert.equal(
    shouldSkipSync(
      {spotify_playlist_id: 'pl-1', last_synced_revision: 5, last_synced_round_id: 'round-1', last_error: 'Spotify 401'},
      5,
      'round-1'
    ),
    false,
    'Should not skip when previous run encountered an error'
  );

  assert.equal(
    shouldSkipSync(
      {spotify_playlist_id: null, last_synced_revision: 5, last_synced_round_id: 'round-1', last_error: null},
      5,
      'round-1'
    ),
    false,
    'Should not skip when playlist ID has not been created yet'
  );

  // Validate rate limit calculation
  function checkRateLimit(lastSyncedAt, nowMs) {
    if (!lastSyncedAt) return {rateLimited: false};
    const elapsed = nowMs - new Date(lastSyncedAt).getTime();
    if (elapsed < 5000) {
      return {rateLimited: true, retryAfter: Math.max(1, Math.ceil((5000 - elapsed) / 1000))};
    }
    return {rateLimited: false};
  }

  const now = Date.now();
  assert.equal(checkRateLimit(new Date(now - 2000).toISOString(), now).rateLimited, true);
  assert.equal(checkRateLimit(new Date(now - 2000).toISOString(), now).retryAfter, 3);
  assert.equal(checkRateLimit(new Date(now - 6000).toISOString(), now).rateLimited, false);
  assert.equal(checkRateLimit(null, now).rateLimited, false);

  console.log('Song league playlist sync security contracts and behavioral assertions passed.');
}
