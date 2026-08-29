import {readFileSync} from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260829020000_song_league_two_player_minimum.sql',
  'utf8'
);
const schema = readFileSync('supabase_schema.md', 'utf8');

function recommendationFunction(source) {
  const start = source.lastIndexOf('create or replace function public.submit_song_league_recommendation');
  const end = source.indexOf('create or replace function public.score_song_league_snapshot', start);
  return source.slice(start, end === -1 ? source.length : end);
}

const migrationFunction = recommendationFunction(migration);
const schemaFunction = recommendationFunction(schema);
const checks = [
  ['migration accepts one fresh opponent', migrationFunction.includes('if v_opponent_count < 1 then')],
  ['migration keeps solo leagues blocked clearly', migrationFunction.includes('At least one opponent needs fresh Top Songs')],
  ['migration keeps strict-majority validation', migrationFunction.includes('v_absent_count * 2 <= v_opponent_count')],
  ['migration keeps the opponent Top 20 rejection', migrationFunction.includes('v_best_existing_rank <= 20')],
  ['consolidated schema accepts one fresh opponent', schemaFunction.includes('if v_opponent_count < 1 then')],
  ['consolidated schema no longer requires two opponents', !schemaFunction.includes('v_opponent_count < 2')]
];

const failures = checks.filter(([, valid]) => !valid).map(([label]) => label);
if (failures.length > 0) {
  console.error(`Song League rule checks failed:\n${failures.map(label => `- ${label}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Song League supports two members while preserving discovery validation.');
}
