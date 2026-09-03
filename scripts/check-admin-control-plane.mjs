import {existsSync, readFileSync} from 'node:fs';

const migration = readFileSync('supabase/migrations/20260815120000_admin_control_plane.sql', 'utf8');
const personalSpotifyMigration = readFileSync('supabase/migrations/20260816090000_personal_spotify_guest_access.sql', 'utf8');
const schema = readFileSync('supabase_schema.md', 'utf8');
const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');
const deployment = readFileSync('scripts/deploy.sh', 'utf8');
const supabaseDeployment = readFileSync('scripts/deploy-supabase.sh', 'utf8');
const liveVerification = readFileSync('scripts/verify-live-deployment.mjs', 'utf8');
const registry = readFileSync('services/sync-service/task-registry.js', 'utf8');
const intervalUnitsMigration = readFileSync('supabase/migrations/20260903210000_configurable_sync_interval_units.sql', 'utf8');
const fridayPlaylistMigration = readFileSync('supabase/migrations/20260903220000_song_league_friday_playlist_refresh.sql', 'utf8');
const adminTemplate = readFileSync('src/app/features/admin/admin.component.html', 'utf8');
const scheduler = readFileSync('services/sync-service/scheduler.js', 'utf8');

const checks = [
  ['admin migration defines the control-plane RPCs', migration.includes('admin_update_sync_user') && migration.includes('admin_list_sync_runs')],
  ['consolidated schema contains the admin control plane', schema.includes('admin_update_sync_user') && schema.includes('admin_list_sync_runs')],
  ['personal Spotify migration defines encrypted credentials', personalSpotifyMigration.includes('spotify_credentials')],
  ['consolidated schema contains encrypted Spotify credentials', schema.includes('CREATE TABLE IF NOT EXISTS public.spotify_credentials')],
  ['GitHub deployment reads protected admin IDs', workflow.includes('secrets.ADMIN_SPOTIFY_IDS')],
  ['GitHub deployment reads the token-encryption key', workflow.includes('secrets.SPOTIFY_TOKEN_ENCRYPTION_KEY')],
  ['GitHub deployment authenticates to Supabase', workflow.includes('secrets.SUPABASE_ACCESS_TOKEN') && workflow.includes('secrets.SUPABASE_DB_PASSWORD')],
  ['GitHub deployment configures the hosted Spotify secret', workflow.includes('secrets.SPOTIFY_CLIENT_SECRET')],
  ['Supabase deployment applies migrations', supabaseDeployment.includes('supabase db push')],
  ['Supabase deployment publishes both Edge Functions', ['spotify-credentials', 'song-league-playlist-sync'].every(name => supabaseDeployment.includes(`functions deploy ${name}`))],
  ['deployment verifies both Oracle and Supabase', workflow.includes('verify-live-deployment.mjs') && liveVerification.includes('Oracle and Supabase live deployment checks passed.')],
  ['deployment writes the protected admin allowlist', deployment.includes('.admin-spotify-ids')],
  ['deployment writes the protected token-encryption key', deployment.includes('.spotify-token-encryption-key')],
  ['the old monolithic daily-pull script is removed', !existsSync('scripts/daily-pull.js')],
  ['worker registers listening history', registry.includes('listening_history')],
  ['worker registers all three stats ranges', ['stats_short_term', 'stats_medium_term', 'stats_long_term'].every(key => registry.includes(key))],
  ['worker registers both playlist purposes', ['shared_playlists', 'song_league_playlists'].every(key => registry.includes(key))],
  ['every schedule supports minutes, hours, and days',
    (adminTemplate.match(/<option value="minutes">minutes<\/option><option value="hours">hours<\/option><option value="days">days<\/option>/g) || []).length === 6],
  ['schedule units are persisted and validated',
    ['history_interval_unit', 'short_term_interval_unit', 'medium_term_interval_unit', 'long_term_interval_unit',
      'song_league_playlist_interval_unit', 'shared_playlist_interval_unit'].every(field => intervalUnitsMigration.includes(field))
      && intervalUnitsMigration.includes("('minutes', 'hours', 'days')")],
  ['worker uses persisted schedule units', registry.includes('unitField') && registry.includes('86_400_000')],
  ['Song League playlist schedules default to local Fridays',
    fridayPlaylistMigration.includes('song_league_playlist_fridays_only boolean not null default true')
      && adminTemplate.includes('user.songLeaguePlaylistFridaysOnly')
      && scheduler.includes('isScheduledTaskAllowed(taskKey, settings, now)')
      && scheduler.includes("job.trigger_type !== 'scheduled'")]
];

const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) {
  console.error(`Admin control-plane contract failed:\n${failures.map(name => `- ${name}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Admin control-plane and sync-service contracts are valid.');
}
