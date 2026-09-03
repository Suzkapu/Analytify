const test = require('node:test');
const assert = require('node:assert/strict');

const {TASK_DEFINITIONS, intervalMilliseconds, isScheduledTaskAllowed} = require('./task-registry');

test('registers every independently configurable synchronization purpose', () => {
  assert.deepEqual(Object.keys(TASK_DEFINITIONS).sort(), [
    'listening_history',
    'shared_playlists',
    'song_league_playlists',
    'stats_long_term',
    'stats_medium_term',
    'stats_short_term'
  ]);
});

test('converts every selectable schedule unit to worker intervals', () => {
  assert.equal(intervalMilliseconds('listening_history', {history_interval_minutes: 30}), 1_800_000);
  assert.equal(intervalMilliseconds('stats_short_term', {short_term_interval_hours: 24}), 86_400_000);
  assert.equal(intervalMilliseconds('stats_short_term', {
    short_term_interval_hours: 15,
    short_term_interval_unit: 'minutes'
  }), 900_000);
  assert.equal(intervalMilliseconds('shared_playlists', {
    shared_playlist_interval_minutes: 2,
    shared_playlist_interval_unit: 'days'
  }), 172_800_000);
});

test('rejects unsupported schedule units', () => {
  assert.throws(() => intervalMilliseconds('stats_long_term', {
    long_term_interval_hours: 1,
    long_term_interval_unit: 'weeks'
  }), /Unsupported interval unit/);
});

test('allows scheduled Song League playlist refreshes only on local Fridays by default', () => {
  const thursdayUtcFridayVienna = new Date('2026-09-03T22:30:00.000Z');
  const fridayUtcSaturdayVienna = new Date('2026-09-04T22:30:00.000Z');
  const settings = {timezone: 'Europe/Vienna'};

  assert.equal(isScheduledTaskAllowed('song_league_playlists', settings, thursdayUtcFridayVienna), true);
  assert.equal(isScheduledTaskAllowed('song_league_playlists', settings, fridayUtcSaturdayVienna), false);
  assert.equal(isScheduledTaskAllowed('shared_playlists', settings, fridayUtcSaturdayVienna), true);
});

test('allows Song League playlist refreshes every day when Friday-only scheduling is disabled', () => {
  assert.equal(isScheduledTaskAllowed('song_league_playlists', {
    timezone: 'Europe/Vienna',
    song_league_playlist_fridays_only: false
  }, new Date('2026-09-01T12:00:00.000Z')), true);
});
