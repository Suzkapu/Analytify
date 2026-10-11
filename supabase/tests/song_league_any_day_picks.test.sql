begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users(id, email) values
  ('71000000-0000-4000-8000-000000000001', 'anyday-owner@example.test'),
  ('71000000-0000-4000-8000-000000000002', 'anyday-member@example.test');
update public.users set backup_active = true where id::text like '71000000-%';
insert into public.artists(id, name) values ('anyday-artist', 'Artist');
insert into public.albums(id, name) values ('anyday-album', 'Album');
insert into public.tracks(id, name, album_id) values
  ('anyday-baseline', 'Baseline', 'anyday-album'),
  ('anyday-pick', 'Discovery', 'anyday-album'),
  ('anyday-second', 'Second', 'anyday-album');
insert into public.track_artists(track_id, artist_id, artist_rank)
select id, 'anyday-artist', 0 from public.tracks where id like 'anyday-%';
insert into public.song_leagues(id, owner_user_id, name, timezone, owner_display_name)
values ('72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001', 'Any day', 'Europe/Vienna', 'Owner');
insert into public.song_league_members(league_id, user_id, role, display_name) values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'owner', 'Owner'),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 'member', 'Member');
insert into public.song_league_playlists(league_id, user_id, spotify_playlist_id)
select league_id, user_id, 'playlist-' || user_id from public.song_league_members
where league_id = '72000000-0000-4000-8000-000000000001';
update public.sync_task_state set next_run_at = now() + interval '7 days'
where user_id::text like '71000000-%' and task_key = 'song_league_playlists';

insert into public.stats_snapshots(user_id, range, snapshot_date)
select id, 'short_term', day from public.users
cross join (values ((now() at time zone 'Europe/Vienna')::date),
  ('2026-10-08'::date), ('2026-10-09'::date)) days(day)
where id::text like '71000000-%' on conflict do nothing;
insert into public.stats_snapshot_tracks(snapshot_id, track_id, rank)
select id, 'anyday-baseline', 1 from public.stats_snapshots
where user_id::text like '71000000-%';
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000001', true);

select lives_ok($$ select private.ensure_song_league_round(
  '72000000-0000-4000-8000-000000000001', '2026-10-08 21:30:00+00') $$,
  'Thursday picks are allowed');
select is((select submission_ends_at from public.song_league_rounds
  where league_id = '72000000-0000-4000-8000-000000000001' and starts_at = '2026-10-01 22:00:00+00'),
  '2026-10-08 22:00:00+00'::timestamptz, 'the allowance resets at local Friday midnight');
select is((select scoring_ends_at from public.song_league_rounds
  where league_id = '72000000-0000-4000-8000-000000000001' and starts_at = '2026-10-01 22:00:00+00'),
  '2026-10-30 23:00:00+00'::timestamptz,
  'a Thursday round keeps its original Friday-cohort end across daylight saving');
select lives_ok($$ select private.ensure_song_league_round(
  '72000000-0000-4000-8000-000000000001', '2026-10-08 22:00:00+00') $$,
  'Friday opens the next round');
select is((select count(*) from public.song_league_rounds
  where league_id = '72000000-0000-4000-8000-000000000001'), 2::bigint,
  'Thursday and Friday use different weekly allowances');

select lives_ok($$ select public.submit_song_league_recommendation(
  '72000000-0000-4000-8000-000000000001', 'anyday-pick') $$,
  'a discovery can be submitted on the current day');
select is((select scoring_starts_at from public.song_league_recommendations where track_id = 'anyday-pick'),
  (((now() at time zone 'Europe/Vienna')::date + 1)::timestamp at time zone 'Europe/Vienna'),
  'scoring starts the next league-local day');
select is((select scoring_ends_at from public.song_league_recommendations where track_id = 'anyday-pick'),
  (((private.song_league_friday_start('Europe/Vienna', now()) at time zone 'Europe/Vienna')::date + 29)::timestamp at time zone 'Europe/Vienna'),
  'late picks expire with the Friday cohort, not four weeks after submission');
select throws_ok($$ select public.submit_song_league_recommendation(
  '72000000-0000-4000-8000-000000000001', 'anyday-second') $$,
  'P0001', 'You already picked this week. Your next pick opens Friday.', 'only one pick is accepted per week');
select is((select count(*) from public.sync_task_state where user_id::text like '71000000-%'
  and task_key = 'song_league_playlists' and next_run_at <= now()), 2::bigint,
  'every member playlist is scheduled immediately after a pick');
select set_config('request.jwt.claim.role', 'service_role', true);
select is((select track_uris from public.get_song_league_weekly_playlist_payload(
  '72000000-0000-4000-8000-000000000001')), array['spotify:track:anyday-pick'],
  'the accepted pick enters the shared playlist payload immediately');
select is(public.score_song_league_snapshot((select id from public.stats_snapshots
  where user_id = '71000000-0000-4000-8000-000000000002'
  and snapshot_date = (now() at time zone 'Europe/Vienna')::date and range = 'short_term')), 0,
  'a submission-day snapshot never awards points to the new pick');
insert into public.stats_snapshots(id, user_id, range, snapshot_date) values
  ('73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002',
  'short_term', (now() at time zone 'Europe/Vienna')::date + 1) on conflict do nothing;
insert into public.stats_snapshot_tracks(snapshot_id, track_id, rank)
select id, 'anyday-pick', 1 from public.stats_snapshots
where user_id = '71000000-0000-4000-8000-000000000002' and range = 'short_term'
  and snapshot_date = (now() at time zone 'Europe/Vienna')::date + 1;
select is(public.score_song_league_snapshot((select id from public.stats_snapshots
  where user_id = '71000000-0000-4000-8000-000000000002' and range = 'short_term'
  and snapshot_date = (now() at time zone 'Europe/Vienna')::date + 1)), 1,
  'the following local day is eligible for scoring');
select * from finish();
rollback;
