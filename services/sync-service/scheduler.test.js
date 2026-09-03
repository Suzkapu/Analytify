const test = require('node:test');
const assert = require('node:assert/strict');

const {isJobAllowed} = require('./scheduler');

test('blocks Friday-only scheduled playlist jobs outside the configured local Friday', () => {
  assert.equal(isJobAllowed({task_key: 'song_league_playlists', trigger_type: 'scheduled'}, {
    timezone: 'Europe/Vienna',
    song_league_playlist_fridays_only: true
  }, new Date('2026-09-01T12:00:00.000Z')), false);
});

test('allows explicitly queued manual playlist jobs on any day', () => {
  assert.equal(isJobAllowed({task_key: 'song_league_playlists', trigger_type: 'manual'}, {
    timezone: 'Europe/Vienna',
    song_league_playlist_fridays_only: true
  }, new Date('2026-09-01T12:00:00.000Z')), true);
});
