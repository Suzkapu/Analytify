create extension if not exists pgtap with schema extensions;
begin;
select plan(2);

select ok(exists(
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'song_league_members'
), 'Song League roster changes are published to Realtime');

select ok(exists(
  select 1 from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'song_leagues'
), 'Song League capacity and closure changes are published to Realtime');

select * from finish();
rollback;
