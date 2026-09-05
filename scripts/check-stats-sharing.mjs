import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20260902190000_stats_spy_mode.sql', import.meta.url),
  'utf8'
).toLowerCase();
const responseFix = readFileSync(
  new URL('../supabase/migrations/20260904170000_fix_stats_access_response.sql', import.meta.url),
  'utf8'
).toLowerCase();
const requestLinks = readFileSync(
  new URL('../supabase/migrations/20260905110000_stats_access_request_links.sql', import.meta.url),
  'utf8'
).toLowerCase();
const service = readFileSync(
  new URL('../src/app/core/sharing/stats-sharing.service.ts', import.meta.url),
  'utf8'
);
const statsPage = readFileSync(
  new URL('../src/app/features/insights/user-stats/user-stats.component.ts', import.meta.url),
  'utf8'
);
const sharingRoutes = readFileSync(
  new URL('../src/app/features/shared-playlists/shared-playlists.module.ts', import.meta.url),
  'utf8'
);

assert.match(migration, /create table if not exists public\.stats_access_requests/);
assert.match(migration, /check \(status in \('pending', 'approved', 'declined', 'revoked'\)\)/);
assert.match(migration, /unique \(owner_user_id, viewer_user_id\)/);
assert.match(migration, /check \(owner_user_id <> viewer_user_id\)/);
assert.match(migration, /alter table public\.stats_access_requests enable row level security/);
assert.match(migration, /owner_user_id = auth\.uid\(\)[\s\S]*viewer_user_id = auth\.uid\(\)/);

for (const fn of [
  'list_stats_shareable_users',
  'list_stats_access_requests',
  'request_stats_access',
  'respond_stats_access',
  'revoke_stats_access',
  'get_shared_stats_snapshot'
]) {
  assert.match(migration, new RegExp(`create or replace function public\\.${fn}`));
  assert.match(migration, new RegExp(`revoke all on function public\\.${fn}`));
}

assert.match(migration, /status = 'approved'[\s\S]*owner_user_id = p_owner_user_id[\s\S]*viewer_user_id = auth\.uid\(\)/);
assert.match(migration, /owner_user_id <> auth\.uid\(\)[\s\S]*raise exception 'only the stats owner can answer this request\.'/);
assert.match(migration, /auth\.uid\(\) not in \(v_request\.owner_user_id, v_request\.viewer_user_id\)/);
assert.doesNotMatch(migration, /create policy[\s\S]{0,1200}stats_snapshots[\s\S]{0,500}approved/);

assert.match(responseFix, /create or replace function public\.answer_stats_access_request/);
assert.match(responseFix, /p_decision text/);
assert.match(responseFix, /owner_user_id = auth\.uid\(\)/);
assert.match(responseFix, /status = 'pending'/);
assert.match(responseFix, /if v_request\.status = p_decision then/);
assert.match(responseFix, /revoke all on function public\.answer_stats_access_request\(uuid, text\) from public/);
assert.match(responseFix, /grant execute on function public\.answer_stats_access_request\(uuid, text\) to authenticated/);

assert.match(service, /rpc\('get_shared_stats_snapshot'/);
assert.match(service, /rpc\('answer_stats_access_request'/);
assert.match(service, /rpc\('create_stats_access_invite'/);
assert.match(service, /rpc\('claim_stats_access_invite'/);
assert.match(statsPage, /if \(this\.isSpyMode\) \{[\s\S]*await this\.loadSharedStats\(loadSequence\);[\s\S]*return;/);

assert.match(requestLinks, /create table public\.stats_access_invites/);
assert.match(requestLinks, /alter table public\.stats_access_invites enable row level security/);
assert.match(requestLinks, /digest\(convert_to\(p_claim_token/);
assert.match(requestLinks, /expires_at <= now\(\)/);
assert.match(requestLinks, /viewer_user_id = v_owner_id[\s\S]*cannot open your own stats request link/);
assert.match(requestLinks, /status = 'pending'[\s\S]*requested_at = now\(\)/);
assert.match(requestLinks, /revoke all on table public\.stats_access_invites from public, anon, authenticated/);
assert.match(sharingRoutes, /path: 'stats-request\/:token'/);

console.log('Stats sharing consent and isolation checks passed.');
