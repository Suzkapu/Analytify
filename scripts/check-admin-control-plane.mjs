import {existsSync, readFileSync} from 'node:fs';

const migration = readFileSync('supabase/migrations/20260815120000_admin_control_plane.sql', 'utf8').trim();
const schema = readFileSync('supabase_schema.md', 'utf8');
const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
const deployment = readFileSync('scripts/deploy.sh', 'utf8');
const registry = readFileSync('services/sync-service/task-registry.js', 'utf8');

const checks = [
  ['consolidated schema contains the complete admin migration', schema.includes(migration)],
  ['GitHub deployment reads protected admin IDs', workflow.includes('secrets.ADMIN_SPOTIFY_IDS')],
  ['deployment writes the protected admin allowlist', deployment.includes('.admin-spotify-ids')],
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
