import {readFileSync} from 'node:fs';

const read = path => readFileSync(path, 'utf8');

const metricTs = read('src/app/shared/ui/metric-card/metric-card.component.ts');
const metricHtml = read('src/app/shared/ui/metric-card/metric-card.component.html');
const analysisTs = read('src/app/features/library/playlist-analysis/playlist-analysis.component.ts');
const analysisHtml = read('src/app/features/library/playlist-analysis/playlist-analysis.component.html');
const songsTs = read('src/app/features/library/songs/songs.component.ts');
const songsHtml = read('src/app/features/library/songs/songs.component.html');
const playlistsTs = read('src/app/features/library/playlists/playlists.component.ts');
const playlistsHtml = read('src/app/features/library/playlists/playlists.component.html');
const statsTs = read('src/app/features/insights/user-stats/user-stats.component.ts');
const statsHtml = read('src/app/features/insights/user-stats/user-stats.component.html');
const historyTs = read('src/app/features/insights/listening-history/listening-history.component.ts');
const artistTs = read('src/app/features/library/artist-details/artist-details.component.ts');
const artistHtml = read('src/app/features/library/artist-details/artist-details.component.html');
const leagueHtml = read('src/app/features/song-league/song-league-home.component.html');
const playlistLoader = read('src/app/core/sync/playlist-loader/playlist-loader.service.ts');

const checks = [
  ['shared metrics expose a loading input', metricTs.includes('@Input() loading = false')],
  ['pending metrics do not render a final-looking value', metricHtml.includes('*ngIf="!loading"') && metricHtml.includes('metric-loading')],
  ['metric feedback adds no timers or data work', !/(setTimeout|setInterval|requestAnimationFrame|subscribe\()/.test(metricTs + metricHtml)],
  ['playlist analysis starts in a loading state', analysisTs.includes('isLoading: boolean = true')],
  ['playlist analysis handles unknown totals', analysisHtml.includes('Finding cached playlist data…') && analysisHtml.includes('[loading]="isAnalysisPending"')],
  ['playlist analysis avoids repeated full calculations during progress events', !analysisTs.includes('if (this.artists && this.artists.length > 0) {\n          this.runAnalysis();')],
  ['playlist explorer starts in a loading state', songsTs.includes('isLoading: boolean = true')],
  ['playlist explorer handles unknown totals', songsHtml.includes('Finding cached playlist data…')],
  ['playlist overview distinguishes loading from empty', playlistsTs.includes('isLoadingPlaylists = true') && playlistsHtml.includes('!isLoadingPlaylists && playlists.length === 0')],
  ['current stats start before showing empty results', statsTs.includes('isLoading: boolean = true')],
  ['stale stats stay visible while refreshing', statsTs.includes('isRefreshingStats') && statsHtml.includes('cached stats remain visible')],
  ['listening history starts in a loading state', historyTs.includes('isLoadingRecentlyPlayed: boolean = true')],
  ['artist details expose cache lookup progress', artistTs.includes('isLoadingArtist = true') && artistHtml.includes('Loading artist details…')],
  ['Song League count does not flash zero while loading', leagueHtml.includes('[attr.aria-busy]="isLoading"') && leagueHtml.includes('*ngIf="!isLoading">{{ leagues.length }}')],
  ['current stats API requests remain parallel', statsTs.includes('forkJoin({')],
  ['current stats still start before deferred history', statsTs.indexOf('void this.loadStats()') < statsTs.indexOf('this.scheduleHistoryLoad()')],
  ['playlist pagination remains bounded and parallel', playlistLoader.includes('}, 4),')]
];

const failures = checks.filter(([, valid]) => !valid).map(([label]) => label);
if (failures.length > 0) {
  console.error(`Loading feedback contract checks failed:\n${failures.map(label => `- ${label}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Loading feedback is immediate, non-blocking, and preserves parallel loaders.');
}
