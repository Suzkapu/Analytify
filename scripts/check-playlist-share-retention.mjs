import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260809190000_playlist_share_retention.sql'
);
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

function functionBody(functionName) {
  const start = sql.indexOf(`create or replace function ${functionName}`);
  if (start < 0) {
    return '';
  }

  const end = sql.indexOf('\n$$;', start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

const claimFunction = functionBody('public.claim_playlist_share');
const revokeFunction = functionBody('public.revoke_playlist_share');
const downloadFunction = functionBody('public.record_playlist_share_download');
const cleanupFunction = functionBody('private.cleanup_playlist_share_retention');

const requiredContracts = [
  ['seven-day claim deadline', sql.includes("created_at + interval '7 days'")],
  ['claim-time expiry enforcement', claimFunction.includes('v_share.claim_expires_at <= now()')],
  ['unclaimed-only claim expiry', claimFunction.includes('v_share.recipient_user_id is null')],
  ['revocation row lock', revokeFunction.includes('for update;')],
  ['revoked track cleanup', revokeFunction.includes('delete from public.playlist_share_tracks')],
  ['revoked download cleanup', revokeFunction.includes('delete from public.playlist_share_downloads')],
  ['download/revocation serialization', downloadFunction.includes('for update;')],
  ['expired unclaimed cleanup', cleanupFunction.includes('claim_expires_at <= now()')],
  ['revoked tombstone cleanup', cleanupFunction.includes("revoked_at <= now() - interval '30 days'")],
  ['daily database schedule', sql.includes("'17 3 * * *'")],
  ['stable cleanup job identity', sql.includes("'analytify-playlist-share-retention'")]
];

const missing = requiredContracts
  .filter(([, present]) => !present)
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Playlist-share retention migration is missing: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Playlist-share retention contracts are present.');
}
