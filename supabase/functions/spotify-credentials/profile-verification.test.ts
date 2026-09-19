import assert from 'node:assert/strict';
import {
  conflictingProfileBlocksRegistration,
  existingProfileAcceptsVerifiedIdentity,
  personalCloudProfileId,
  spotifyProfileIds,
  spotifyProfileMatches
} from './profile-verification.ts';

Deno.test('matches only Spotify identities returned by the verified profile', () => {
  const profile = {account_id: 'stable-account', id: 'public-profile'};
  assert.deepEqual(spotifyProfileIds(profile), ['stable-account', 'public-profile']);
  assert.equal(spotifyProfileMatches(profile, 'stable-account_dev'), true);
  assert.equal(spotifyProfileMatches(profile, 'attacker-selected'), false);
});

Deno.test('allows a verified anonymous personal-app identity alongside a hosted profile', () => {
  assert.equal(conflictingProfileBlocksRegistration(true), false);
  assert.equal(conflictingProfileBlocksRegistration(false), true);
  assert.equal(personalCloudProfileId('11111111-1111-4111-8111-111111111111'),
    'personal:11111111-1111-4111-8111-111111111111');
});

Deno.test('allows an unverified placeholder to be replaced after server verification', () => {
  const profile = {account_id: 'verified-account', id: 'verified-profile'};
  assert.equal(existingProfileAcceptsVerifiedIdentity(
    'pending:11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    profile
  ), true);
  assert.equal(existingProfileAcceptsVerifiedIdentity(
    'attacker-selected',
    '11111111-1111-4111-8111-111111111111',
    profile
  ), false);
  assert.equal(existingProfileAcceptsVerifiedIdentity(
    'personal:11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111111',
    profile
  ), true);
});
