const {createCatalogRepository} = require('./catalog-repository');
const {createHistoryTask} = require('./tasks/history-task');
const {createStatsTask} = require('./tasks/stats-task');
const {createSongLeaguePlaylistsTask} = require('./tasks/song-league-playlists-task');
const {createSharedPlaylistsTask} = require('./tasks/shared-playlists-task');

const TASK_DEFINITIONS = {
  listening_history: {enabledField: 'history_enabled', intervalField: 'history_interval_minutes', unitField: 'history_interval_unit', defaultUnit: 'minutes'},
  stats_short_term: {enabledField: 'short_term_enabled', intervalField: 'short_term_interval_hours', unitField: 'short_term_interval_unit', defaultUnit: 'hours'},
  stats_medium_term: {enabledField: 'medium_term_enabled', intervalField: 'medium_term_interval_hours', unitField: 'medium_term_interval_unit', defaultUnit: 'hours'},
  stats_long_term: {enabledField: 'long_term_enabled', intervalField: 'long_term_interval_hours', unitField: 'long_term_interval_unit', defaultUnit: 'hours'},
  song_league_playlists: {
    enabledField: 'song_league_playlists_enabled',
    intervalField: 'song_league_playlist_interval_minutes',
    unitField: 'song_league_playlist_interval_unit', defaultUnit: 'minutes'
  },
  shared_playlists: {
    enabledField: 'shared_playlists_enabled',
    intervalField: 'shared_playlist_interval_minutes',
    unitField: 'shared_playlist_interval_unit', defaultUnit: 'minutes'
  }
};

function intervalMilliseconds(taskKey, settings) {
  const definition = TASK_DEFINITIONS[taskKey];
  const value = Math.max(1, Number(settings[definition.intervalField]) || 1);
  const unit = settings[definition.unitField] || definition.defaultUnit;
  const multiplier = {minutes: 60_000, hours: 3_600_000, days: 86_400_000}[unit];
  if (!multiplier) throw new Error(`Unsupported interval unit: ${unit}`);
  return value * multiplier;
}

function createTaskRegistry(dependencies) {
  const catalog = createCatalogRepository(dependencies.supabase, dependencies.spotify);
  const stats = createStatsTask({...dependencies, catalog});
  return {
    listening_history: createHistoryTask({...dependencies, catalog}),
    stats_short_term: stats,
    stats_medium_term: stats,
    stats_long_term: stats,
    song_league_playlists: createSongLeaguePlaylistsTask(dependencies),
    shared_playlists: createSharedPlaylistsTask(dependencies)
  };
}

module.exports = {TASK_DEFINITIONS, intervalMilliseconds, createTaskRegistry};
