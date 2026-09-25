import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const notice = await readFile(path.join(root, 'src/app/features/legal/legal/legal.component.html'), 'utf8');
const acceptance = await readFile(path.join(root, 'src/app/core/legal/terms-acceptance.service.ts'), 'utf8');
const routes = await readFile(path.join(root, 'src/app/app-routing.module.ts'), 'utf8');
const header = await readFile(path.join(root, 'src/app/shared/layout/header/header.component.html'), 'utf8');
const termsMigration = await readFile(path.join(root, 'supabase/migrations/20260925160000_personal_spotify_cross_device_identity.sql'), 'utf8');

for (const activity of [
  'Open the website and keep it secure',
  'Connect Spotify and show your library, stats, and history',
  'Cloud identity, backup, and scheduled updates',
  'Playlist sharing, stats access, and Compare Rooms',
  'Song League',
  'Optional notifications',
  'Reports, support, and legal requests',
  'Terms acceptance and browser storage',
]) {
  assert.match(notice, new RegExp(activity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

const requiredActivityFields = ['Data and source', 'Purpose and legal basis', 'Recipients and transfers', 'Retention', 'Required?'];
for (const field of requiredActivityFields) {
  const occurrences = [...notice.matchAll(new RegExp(`<dt>${field.replace('?', '\\?')}</dt>`, 'g'))];
  assert.equal(occurrences.length, 8, `every processing activity needs the ${field} field`);
}

for (const right of ['Access and a copy', 'Correction', 'Deletion', 'Restriction', 'Portability', 'Object', 'Withdraw consent']) {
  assert.match(notice, new RegExp(`<strong>${right}:`), `privacy notice is missing the ${right} right`);
}

assert.match(notice, /Austrian Data Protection Authority/);
assert.match(notice, /normally within one month/);
assert.match(notice, /Automated results, not automated decisions/);
assert.match(notice, /do not produce legal or similarly significant effects/);
assert.match(notice, /Version:<\/strong> 2026-09-25/);
assert.match(notice, /Material changes receive a new version/);
assert.match(notice, /No ads or tracking/);
assert.match(notice, /at least 14 years old/);
assert.match(notice, /does not ask for or store your date of birth/);
assert.match(notice, /stored Spotify credentials are\s+disconnected/);
assert.match(acceptance, /analytify-eula-2026-09-25/);
assert.match(termsMigration, /p_terms_version <> 'analytify-eula-2026-09-25'/,
  'the database acceptance allowlist must match the published browser version');
assert.match(routes, /path:\s*'legal'/, 'privacy notice must remain publicly routable');
assert.match(header, /routerLink="\/legal" fragment="privacy"/, 'signed-in users need a persistent privacy-notice link');

console.log('Article 13/14 privacy notice contract passed.');
