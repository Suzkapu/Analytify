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

test('logged-out copy plainly describes the currently enabled Spotify features', async () => {
  const login = await read('src/app/features/auth/login-page/login-page.component.html');
  assert.match(login, /Explore your playlists\./);
  assert.match(login, /saved songs, playlists/);
  assert.match(login, /top songs and artists/i);
  assert.match(login, /recently played songs/i);
  assert.doesNotMatch(login, /insights|focused dashboard|music that defines you/i);
});
