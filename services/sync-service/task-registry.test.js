const test = require('node:test');
const assert = require('node:assert/strict');

const {TASK_DEFINITIONS, intervalMilliseconds} = require('./task-registry');

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

test('converts minute and hour schedules to worker intervals', () => {
  assert.equal(intervalMilliseconds('listening_history', {history_interval_minutes: 30}), 1_800_000);
  assert.equal(intervalMilliseconds('stats_short_term', {short_term_interval_hours: 24}), 86_400_000);
});
