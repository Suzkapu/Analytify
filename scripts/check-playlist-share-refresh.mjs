import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrationPath = resolve(
  projectRoot,
  'supabase/migrations/20260903180000_optimize_active_playlist_share_refresh.sql'
);
const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

const requiredContracts = [
  ['single JSON expansion', (sql.match(/jsonb_array_elements/g) || []).length === 1],
  ['set-based fan-out', sql.includes('cross join ordered_tracks')],
  ['changed-share filtering', sql.includes('v_changed_share_ids')],
  ['row locking', sql.includes('for update;')],
  ['deduplicated tracks', sql.includes('select distinct on (track_id)')],
  ['authenticated execution grant', sql.includes('to authenticated;')]
];

const missing = requiredContracts.filter(([, present]) => !present).map(([label]) => label);
if (missing.length) {
  console.error(`Playlist-share refresh migration is missing: ${missing.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Playlist-share refresh performance contracts are present.');
}
