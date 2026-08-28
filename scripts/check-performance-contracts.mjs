import {readFileSync} from 'node:fs';

const stats = readFileSync('src/app/features/insights/user-stats/user-stats.component.ts', 'utf8');
const storage = readFileSync('src/app/core/data-access/storage/storage.service.ts', 'utf8');
const migration = readFileSync('supabase/migrations/20260828163000_stats_snapshot_date_index.sql', 'utf8');
const guard = readFileSync('src/app/core/auth/spotify-auth.guard.ts', 'utf8');

const historyStart = stats.indexOf('loadHistoryData()');
const historyEnd = stats.indexOf('\n\n  getTrend(', historyStart);
const historyLoader = stats.slice(historyStart, historyEnd);
const checks = [
  ['Stats history uses lightweight cloud metadata', historyLoader.includes('loadAllStatsSnapshotsMetadata')],
  ['Stats history does not eagerly download every detail payload', !historyLoader.includes('loadAllStatsSnapshots(supabaseUserId')],
  ['Trend popup uses a single-item rank query', stats.includes('loadStatsItemTrend(')],
  ['IndexedDB history has a user/range index', storage.includes("createIndex(this.statsUserRangeIndex, ['userId', 'range']")],
  ['server snapshot dates have a covering index', migration.includes('user_id, range, snapshot_date desc')],
  ['route guard starts cloud hydration without awaiting it', guard.includes('void authService.ensureInitialSync()')]
];

const failures = checks.filter(([, valid]) => !valid).map(([label]) => label);
if (failures.length > 0) {
  console.error(`Performance contract checks failed:\n${failures.map(label => `- ${label}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Startup and statistics performance contracts are valid.');
}
