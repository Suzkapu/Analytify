import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('README leads with user features and sends development details to CONTRIBUTING', async () => {
  const [readme, contributing] = await Promise.all([read('README.md'), read('CONTRIBUTING.md')]);
  assert.ok(readme.indexOf('## Main features') < readme.indexOf('## Contributing and running locally'));
  assert.match(readme, /\[CONTRIBUTING\.md\]\(CONTRIBUTING\.md\)/);
  assert.doesNotMatch(readme, /## Development/);
  assert.match(contributing, /npm run verify/);
  assert.match(contributing, /supabase db push/);
});

test('logged-out copy plainly describes playlists and statistics', async () => {
  const login = await read('src/app/features/auth/login-page/login-page.component.html');
  assert.match(login, /See what you listen to\./);
  assert.match(login, /top songs/);
  assert.doesNotMatch(login, /insights|focused dashboard|music that defines you/i);
});
