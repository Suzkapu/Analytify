import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260905190000_read_only_spotify_catalog.sql', 'utf8'
).toLowerCase();
const browserRepository = readFileSync('src/app/core/data-access/supabase/supabase.service.ts', 'utf8');
const workerRepository = readFileSync('services/sync-service/catalog-repository.js', 'utf8');

const protectedTables = ['artists', 'genres', 'albums', 'album_artists', 'tracks', 'track_artists'];
for (const table of protectedTables) {
  assert.match(migration, new RegExp(`grant select on public\\.%i to authenticated|v_table`));
}
assert.ok(migration.includes("for select to authenticated using (true)"));
assert.ok(migration.includes('revoke insert, update, delete'));
assert.ok(migration.includes('on conflict (id) do nothing'), 'browser ingestion must not rewrite catalog rows');
assert.ok(migration.includes('jsonb_array_length') && migration.includes("p_kind not in"));
assert.ok(migration.includes('on delete restrict'));
assert.ok(browserRepository.includes("rpc('ingest_spotify_catalog'"));
assert.ok(!browserRepository.match(/\.from\('(artists|albums|tracks|album_artists|track_artists)'\)[\s\S]{0,100}\.(upsert|insert|update|delete)\(/));
assert.ok(workerRepository.includes("from('artists').upsert") && workerRepository.includes("from('tracks').upsert"));
console.log('Spotify catalog is browser-read-only and trusted-worker writable.');
