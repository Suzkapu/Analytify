import {readFileSync} from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260828160000_preserve_song_league_invites.sql',
  'utf8'
);
const schema = readFileSync('supabase_schema.md', 'utf8');
const management = readFileSync(
  'supabase/migrations/20260909100000_manage_song_league_invites.sql',
  'utf8'
);
const service = readFileSync('src/app/core/song-league/song-league.service.ts', 'utf8');
const detail = readFileSync('src/app/features/song-league/song-league-detail.component.html', 'utf8');

function inviteFunction(source) {
  const start = source.indexOf('create or replace function public.rotate_song_league_invite');
  const end = source.indexOf('create or replace function public.claim_song_league', start);
  return source.slice(start, end === -1 ? source.length : end);
}

const checks = [
  ['migration appends a Song League invite', migration.includes('insert into public.song_league_invites')],
  ['migration does not revoke older invites', !migration.includes('set revoked_at = now()')],
  ['consolidated schema does not revoke older invites', !inviteFunction(schema).includes('set revoked_at = now()')],
  ['owners receive token-free invitation metadata', management.includes('list_song_league_invites') &&
    !management.slice(management.indexOf('returns table('), management.indexOf('language plpgsql')).includes('token_hash')],
  ['owners can revoke all active invitations', management.includes('revoke_all_song_league_invites')],
  ['clients use the safe invitation metadata RPC', service.includes("rpc('list_song_league_invites'")],
  ['UI truthfully says older active links remain valid', detail.includes('Other active links stay valid until they expire or you revoke them.')]
];

const failures = checks.filter(([, valid]) => !valid).map(([label]) => label);
if (failures.length > 0) {
  console.error(`Song League invite checks failed:\n${failures.map(label => `- ${label}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Song League invite links are truthful, token-safe, visible, and revocable.');
}
