import {readFileSync} from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260829020000_song_league_two_player_minimum.sql',
  'utf8'
);
const freshnessMigration = readFileSync(
  'supabase/migrations/20260904160000_song_league_member_sync_freshness.sql',
  'utf8'
);
const schema = readFileSync('supabase_schema.md', 'utf8');
const capacityMigration = readFileSync(
  'supabase/migrations/20260904190000_stats_history_notifications_and_league_capacity.sql',
  'utf8'
).toLowerCase();

function recommendationFunction(source) {
  const start = source.lastIndexOf('create or replace function public.submit_song_league_recommendation');
  const end = source.indexOf('create or replace function public.score_song_league_snapshot', start);
  return source.slice(start, end === -1 ? source.length : end);
}

const migrationFunction = recommendationFunction(migration);
const schemaFunction = recommendationFunction(schema);
const ensureRoundStart = freshnessMigration.indexOf(
  'create or replace function private.ensure_song_league_round'
);
const ensureRoundEnd = freshnessMigration.indexOf(
  'revoke all on function private.enable_song_league_sync_for_user',
  ensureRoundStart
);
const ensureRoundFunction = freshnessMigration.slice(ensureRoundStart, ensureRoundEnd);
const checks = [
  ['migration accepts one fresh opponent', migrationFunction.includes('if v_opponent_count < 1 then')],
  ['migration keeps solo leagues blocked clearly', migrationFunction.includes('At least one opponent needs fresh Top Songs')],
  ['migration keeps strict-majority validation', migrationFunction.includes('v_absent_count * 2 <= v_opponent_count')],
  ['migration keeps the opponent Top 20 rejection', migrationFunction.includes('v_best_existing_rank <= 20')],
  ['consolidated schema accepts one fresh opponent', schemaFunction.includes('if v_opponent_count < 1 then')],
  ['consolidated schema no longer requires two opponents', !schemaFunction.includes('v_opponent_count < 2')],
  ['active league membership enables the sync service', freshnessMigration.includes('enabled = true')],
  ['active league membership enables short-term stats', freshnessMigration.includes('short_term_enabled = true')],
  ['existing members are repaired during rollout', freshnessMigration.includes('select distinct member.user_id')],
  ['league loads can repair member sync through a narrow RPC', freshnessMigration.includes('public.ensure_song_league_member_sync')],
  ['Friday roster accepts two fresh members', ensureRoundFunction.includes('if v_roster_size < 2 then')],
  ['Friday roster no longer requires three fresh members', !ensureRoundFunction.includes('v_roster_size < 3')],
  ['Friday baseline requires the current league-local day', ensureRoundFunction.includes('candidate.snapshot_date = v_today')],
  ['Friday baseline is immutable after the first recommendation', ensureRoundFunction.includes('select 1 from public.song_league_recommendations where round_id = v_round_id')],
  ['league capacity defaults to five', capacityMigration.includes('max_members integer not null default 5')],
  ['capacity is owner managed and bounded', capacityMigration.includes('owner_user_id = auth.uid()') && capacityMigration.includes('between 2 and 50')],
  ['capacity cannot shrink below the roster', capacityMigration.includes('p_max_members < v_active_members')],
  ['joining locks the league capacity row', capacityMigration.includes('select max_members into v_member_limit') && capacityMigration.includes('for update')],
  ['joining enforces the configured capacity', capacityMigration.includes('v_member_count >= v_member_limit')]
];

const failures = checks.filter(([, valid]) => !valid).map(([label]) => label);
if (failures.length > 0) {
  console.error(`Song League rule checks failed:\n${failures.map(label => `- ${label}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Song League supports two members while preserving discovery validation.');
}
