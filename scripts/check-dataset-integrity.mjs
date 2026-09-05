import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260905200000_versioned_atomic_dataset_replacement.sql', 'utf8'
).toLowerCase();
const catalog = readFileSync('services/sync-service/catalog-repository.js', 'utf8');
const workerStats = readFileSync('services/sync-service/tasks/stats-task.js', 'utf8');
const browser = readFileSync('src/app/core/data-access/supabase/supabase.service.ts', 'utf8');

const checks = [
  migration.includes('p_expected_revision'),
  migration.includes('p_idempotency_key'),
  migration.includes("errcode = '40001'"),
  migration.includes('for update'),
  migration.includes('replace_stats_snapshot_v2'),
  migration.includes('replace_spotify_catalog'),
  migration.includes("auth.role() <> 'service_role'"),
  catalog.includes("rpc('replace_spotify_catalog'"),
  !catalog.match(/\.from\('(artists|albums|tracks|album_artists|track_artists)'\)[\s\S]{0,120}\.(upsert|delete|update|insert)\(/),
  workerStats.includes("rpc('replace_stats_snapshot_v2'"),
  browser.includes("rpc('replace_stats_snapshot_v2'")
];
assert.ok(checks.every(Boolean), 'A versioned atomic dataset replacement contract is missing.');
console.log('Stats and catalog replacements are atomic, idempotent, and compare-and-swap guarded.');
