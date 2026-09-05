import {readFileSync} from 'node:fs';

const journal = readFileSync('docs/decision-journal.md', 'utf8');
const playlists = readFileSync('src/app/features/library/playlists/playlists.component.ts', 'utf8');
const playlistTests = readFileSync('src/app/features/library/playlists/playlists.component.spec.ts', 'utf8');
const shareSync = readFileSync('src/app/core/sharing/playlist-share-auto-sync.service.ts', 'utf8');
const admin = readFileSync('src/app/core/admin/admin.service.ts', 'utf8');
const stats = readFileSync('src/app/features/insights/user-stats/user-stats.component.ts', 'utf8');
const history = readFileSync('src/app/features/insights/listening-history/listening-history.component.ts', 'utf8');
const scheduler = readFileSync('services/sync-service/scheduler.js', 'utf8');
const syncJobLeases = readFileSync('supabase/migrations/20260905163000_sync_job_leases_and_atomic_completion.sql', 'utf8');
const integration = readFileSync('src/app/integration/supabase-loading.integration.spec.ts', 'utf8');
const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');

const playlistLoadStart = playlists.indexOf('async loadPlaylists()');
const playlistRefreshStart = playlists.indexOf('private async refreshPlaylistsFromSpotify', playlistLoadStart);
const playlistLoad = playlists.slice(playlistLoadStart, playlistRefreshStart);
const freshCacheGate = playlistLoad.indexOf('if (hasCompleteFreshCache())');
const spotifyFallback = playlistLoad.indexOf('await this.refreshPlaylistsFromSpotify(');

const checks = [
  ['Decision journal records the API-on-demand policy', journal.includes('Use external APIs only for stale, missing, or explicitly requested data')],
  ['Decision journal forbids external reads for complete fresh local data', journal.includes('make no external read for that feature')],
  ['Playlist overview checks cache completeness and freshness', playlistLoad.includes('const hasCompleteFreshCache = () =>')],
  ['Playlist overview returns from a fresh cache before Spotify fallback', freshCacheGate >= 0 && spotifyFallback > freshCacheGate],
  ['Playlist overview gives cloud a bounded priority window', playlistLoad.includes('cloudPriorityWindowMs') && playlistLoad.includes('Promise.race([')],
  ['Playlist overview regression test prohibits fresh-cache Spotify reads', playlistTests.includes('does not call Spotify when the cached playlist portfolio is complete and fresh')],
  ['Old unconditional-playlist-refresh contract is gone', !playlistTests.includes('refreshes Spotify on every load')],
  ['Shared-playlist startup requires a cloud identity', shareSync.includes('if (this.started || !this.auth.getSupabaseUserId()) return;')],
  ['Shared-playlist sync exits before hydration without a cloud identity', shareSync.includes('if (!this.auth.isAuthenticated() || !this.auth.getSupabaseUserId()) return;')],
  ['Shared-playlist sync rechecks cloud identity after hydration', shareSync.includes('await this.auth.ensureInitialSync();\n    if (!this.auth.getSupabaseUserId()) return;')],
  ['Admin role checks avoid impossible local-only RPCs', admin.includes('if (!this.auth.getSupabaseUserId())') && admin.indexOf('if (!this.auth.getSupabaseUserId())') < admin.indexOf("this.supabase.client.rpc('is_app_admin')")],
  ['Stats return from complete unexpired cache', stats.includes('if (!isExpired && !isCacheIncomplete)') && stats.includes('if (!isCacheIncomplete) return;')],
  ['Listening history has a five-minute request freshness gate', history.includes('Date.now() - lastChecked < 5 * 60 * 1000')],
  ['Scheduled worker skips tasks that are not due', scheduler.includes('state?.next_run_at') && scheduler.includes('> now.getTime()) continue;')],
  ['Manual worker runs only atomically claimed queued jobs',
    scheduler.includes("rpc('claim_sync_jobs'") && syncJobLeases.includes("where run.status = 'queued'")],
  ['Supabase loading integration uses the real cloud query', integration.includes("spyOn(supabase, 'loadUserCache').and.callThrough()")],
  ['Supabase loading integration renders both playlist and stats fixtures', integration.includes("toContain('CI Cloud Playlist')") && integration.includes("toContain('CI Supabase Song')")],
  ['Supabase loading integration rejects Spotify HTTP calls', integration.includes('http.expectNone(request => request.url.startsWith(environment.spotifyUrl))')],
  ['GitHub Actions starts the isolated Supabase stack', workflow.includes('supabase start --workdir integration')],
  ['Deployment is gated by the Supabase loading integration', workflow.includes('npm run test:supabase-integration')]
];

const failures = checks.filter(([, valid]) => !valid).map(([label]) => label);
if (failures.length > 0) {
  console.error(`API-on-demand contract checks failed:\n${failures.map(label => `- ${label}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('API-on-demand decision and implementation contracts are valid.');
}
