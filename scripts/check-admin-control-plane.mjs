import {existsSync, readFileSync} from 'node:fs';

const migration = readFileSync('supabase/migrations/20260815120000_admin_control_plane.sql', 'utf8');
const personalSpotifyMigration = readFileSync('supabase/migrations/20260816090000_personal_spotify_guest_access.sql', 'utf8');
const schema = readFileSync('supabase_schema.md', 'utf8');
const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
const deployment = readFileSync('scripts/deploy.sh', 'utf8');
const registry = readFileSync('services/sync-service/task-registry.js', 'utf8');

const checks = [
  ['admin migration defines the control-plane RPCs', migration.includes('admin_update_sync_user') && migration.includes('admin_list_sync_runs')],
  ['consolidated schema contains the admin control plane', schema.includes('admin_update_sync_user') && schema.includes('admin_list_sync_runs')],
  ['personal Spotify migration defines encrypted credentials', personalSpotifyMigration.includes('spotify_credentials')],
  ['consolidated schema contains encrypted Spotify credentials', schema.includes('CREATE TABLE IF NOT EXISTS public.spotify_credentials')],
  ['GitHub deployment reads protected admin IDs', workflow.includes('secrets.ADMIN_SPOTIFY_IDS')],
  ['GitHub deployment reads the token-encryption key', workflow.includes('secrets.SPOTIFY_TOKEN_ENCRYPTION_KEY')],
  ['deployment writes the protected admin allowlist', deployment.includes('.admin-spotify-ids')],
  ['deployment writes the protected token-encryption key', deployment.includes('.spotify-token-encryption-key')],
  ['the old monolithic daily-pull script is removed', !existsSync('scripts/daily-pull.js')],
  ['worker registers listening history', registry.includes('listening_history')],
  ['worker registers all three stats ranges', ['stats_short_term', 'stats_medium_term', 'stats_long_term'].every(key => registry.includes(key))],
  ['worker registers both playlist purposes', ['shared_playlists', 'song_league_playlists'].every(key => registry.includes(key))]
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) {
  console.error(`Admin control-plane contract failed:\n${failures.map(name => `- ${name}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Admin control-plane and sync-service contracts are valid.');
}
