import {readFileSync} from 'node:fs';

const migration = readFileSync('supabase/migrations/20260904190000_stats_history_notifications_and_league_capacity.sql', 'utf8').toLowerCase();
const component = readFileSync('src/app/features/insights/user-stats/user-stats.component.ts', 'utf8');
const template = readFileSync('src/app/features/insights/user-stats/user-stats.component.html', 'utf8');

const checks = [
  ['authenticated server-side search', migration.includes('function public.search_past_top_items') && migration.includes('auth.uid()')],
  ['range and item-kind validation', migration.includes("p_kind not in ('track', 'artist')") && migration.includes("'short_term', 'medium_term', 'long_term'")],
  ['current snapshot exclusion', migration.includes('not exists') && migration.includes('current_snapshot')],
  ['historical rank and date aggregation', migration.includes('min(item.rank)') && migration.includes('max(snapshot.snapshot_date)')],
  ['bounded results', migration.includes('least(coalesce(p_limit, 20), 50)')],
  ['debounced lazy request', component.includes('pastSearchTimer') && component.includes('setTimeout')],
  ['stale request protection', component.includes('pastSearchSequence')],
  ['current-page exclusion', component.includes('currentIds')],
  ['accessible result status', template.includes('past-stats-results') && template.includes('aria-live="polite"')],
  ['past matches open position history', template.includes('(click)="openPastTopResult(item)"') && component.includes('openPastTopResult(item: PastTopItem)')],
  ['past matches are buttons, not external links', template.includes('<button *ngFor="let item of pastTopResults"') && !template.includes('[href]="item.spotifyUrl || null"')],
  ['past cards omit aggregate summary text', !template.includes('Best #{{ item.bestRank }}') && !template.includes('last seen {{ item.lastSeen }}')],
  ['past search is explicitly opt-in', component.includes('includePastStatsSearch = false') && component.includes('togglePastStatsSearch()')],
  ['past toggle replaces match count', template.includes('(click)="togglePastStatsSearch()"') && !template.includes('class="stats-search-status"')]
];

const failures = checks.filter(([, valid]) => !valid).map(([label]) => label);
if (failures.length) {
  console.error(`Historical stats-search checks failed:\n${failures.map(label => `- ${label}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Historical Top Songs and Top Artists search contracts are valid.');
}
