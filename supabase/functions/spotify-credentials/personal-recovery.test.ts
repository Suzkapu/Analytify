import assert from 'node:assert/strict';
import {personalRecoveryEmail, personalRecoveryMatches, validSpotifyId} from './personal-recovery.ts';

Deno.test('personal recovery accepts only bounded Spotify account identifiers', () => {
  assert.equal(validSpotifyId('spotify_user-123.abc'), true);
  assert.equal(validSpotifyId(''), false);
  assert.equal(validSpotifyId('user@example.com'), false);
  assert.equal(validSpotifyId('a'.repeat(256)), false);
});

Deno.test('personal recovery aliases are deterministic and reveal no Spotify ID', async () => {
  const first = await personalRecoveryEmail('spotify-user');
  const second = await personalRecoveryEmail('spotify-user');
  assert.equal(first, second);
  assert.equal(first.includes('spotify-user'), false);
  assert.equal(first.endsWith('@identity.analytify.invalid'), true);
  await assert.rejects(() => personalRecoveryEmail('../invalid'));
});

Deno.test('personal recovery requires both token paths to verify the claimed account', () => {
  const account = {account_id: 'stable-account', id: 'public-profile'};
  assert.equal(personalRecoveryMatches(account, account, 'stable-account'), true);
  assert.equal(personalRecoveryMatches(account, {id: 'attacker'}, 'stable-account'), false);
  assert.equal(personalRecoveryMatches({id: 'attacker'}, account, 'stable-account'), false);
});
