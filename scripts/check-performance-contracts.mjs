import {readFileSync} from 'node:fs';

const stats = readFileSync('src/app/features/insights/user-stats/user-stats.component.ts', 'utf8');
const supabase = readFileSync('src/app/core/data-access/supabase/supabase.service.ts', 'utf8');
const authService = readFileSync('src/app/core/auth/spotify-auth.service.ts', 'utf8');
const storage = readFileSync('src/app/core/data-access/storage/storage.service.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260828163000_stats_snapshot_date_index.sql', 'utf8');
const atomicStatsMigration = readFileSync('supabase/migrations/20260905090000_atomic_stats_snapshot_replace.sql', 'utf8');
const guard = readFileSync('src/app/core/auth/spotify-auth.guard.ts', 'utf8');
const asyncLoad = readFileSync('src/app/core/performance/async-load.ts', 'utf8');
const playlistLoader = readFileSync('src/app/core/sync/playlist-loader/playlist-loader.service.ts', 'utf8');
const compareSource = readFileSync('src/app/core/compare-room/compare-playlist-source.service.ts', 'utf8');
const songs = readFileSync('src/app/features/library/songs/songs.component.ts', 'utf8');
const serviceWorker = JSON.parse(readFileSync('ngsw-config.json', 'utf8'));

const prefetchedServiceWorkerFiles = serviceWorker.assetGroups
  .filter(group => group.installMode === 'prefetch')
  .flatMap(group => group.resources?.files || []);
const lazyScriptGroup = serviceWorker.assetGroups.find(group =>
  group.installMode === 'lazy'
  && group.updateMode === 'lazy'
  && (group.resources?.files || []).includes('/*.js')
);

const historyStart = stats.indexOf('loadHistoryData()');
const historyEnd = stats.indexOf('\n\n  getTrend(', historyStart);
const historyLoader = stats.slice(historyStart, historyEnd);
const checks = [
  ['Stats history uses lightweight cloud metadata', historyLoader.includes('loadAllStatsSnapshotsMetadata')],
  ['Stats history does not eagerly download every detail payload', !historyLoader.includes('loadAllStatsSnapshots(supabaseUserId')],
  ['Trend popup uses a single-item rank query', stats.includes('loadStatsItemTrend(')],
  ['IndexedDB history has a user/range index', storage.includes("createIndex(this.statsUserRangeIndex, ['userId', 'range']")],
  ['server snapshot dates have a covering index', migration.includes('user_id, range, snapshot_date desc')],
  ['route guard starts cloud hydration without awaiting it', guard.includes('void authService.ensureInitialSync()')],
  ['current stats start before deferred history', stats.indexOf('void this.loadStats()') < stats.indexOf('this.scheduleHistoryLoad()')],
  ['background history yields to the first paint', stats.includes('runAfterNextPaint')],
  ['bounded async work preserves result order', asyncLoad.includes('results[index] = await worker')],
  ['playlist pagination uses bounded parallel requests', playlistLoader.includes('}, 4),')],
  ['multi-playlist comparison loads concurrently', compareSource.includes('mapWithConcurrency(')],
  ['playlist cloud restore has a first-open fallback window', songs.includes('cloudPriorityWindowMs') && songs.includes('Promise.race([')],
  ['late cloud playlist data cannot overwrite Spotify', storage.includes('if (!canApply()) return 0')],
  ['PWA install does not prefetch every lazy JavaScript chunk', !prefetchedServiceWorkerFiles.includes('/*.js')],
  ['PWA feature chunks are cached lazily', !!lazyScriptGroup],
  ['same-day snapshot writes are serialized by user, range, and date', supabase.includes('statsSnapshotWrites.run(') && supabase.includes('`${supabaseUserId}:${range}:${snapshotDate}`')],
  ['snapshot replacement is one locked database transaction', atomicStatsMigration.includes('pg_advisory_xact_lock') && supabase.includes("rpc('replace_stats_snapshot'")],
  ['genre weights are normalized to database integers', supabase.includes('weight: Math.round(')],
  ['startup avoids an unbounded user-cache download', !authService.includes('loadUserCache(supabaseUserId)')],
  ['overlapping credential registration is coalesced', authService.includes('credentialRegistrationPromise')]
];

const failures = checks.filter(([, valid]) => !valid).map(([label]) => label);
if (failures.length > 0) {
  console.error(`Performance contract checks failed:\n${failures.map(label => `- ${label}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Startup and statistics performance contracts are valid.');
}
