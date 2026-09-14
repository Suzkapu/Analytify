begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select has_function('public', 'get_song_league_weekly_playlist_payload',
  array['uuid', 'timestamp with time zone'],
  'the trusted worker playlist payload accepts a deterministic clock');

insert into public.users(id, spotify_id, display_name, backup_active) values
  ('81000000-0000-4000-8000-000000000001', 'retention-owner', 'Owner', true);
insert into public.song_leagues(id, owner_user_id, name, timezone) values
  ('82000000-0000-4000-8000-000000000001',
   '81000000-0000-4000-8000-000000000001', 'Retention league', 'UTC');
insert into public.song_league_members(league_id, user_id, role) values
  ('82000000-0000-4000-8000-000000000001',
   '81000000-0000-4000-8000-000000000001', 'owner');

insert into public.tracks(id, name) values
  ('retention-current', 'Current'),
  ('retention-week-one', 'Week one'),
  ('retention-week-two', 'Week two'),
  ('retention-week-three', 'Week three'),
  ('retention-expired', 'Expired'),
  ('retention-future', 'Future');

insert into public.song_league_rounds(
  id, league_id, starts_at, submission_ends_at, scoring_starts_at, scoring_ends_at
) values
  ('83000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001',
   '2026-09-11 00:00:00+00', '2026-09-12 00:00:00+00', '2026-09-12 00:00:00+00', '2026-10-10 00:00:00+00'),
  ('83000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001',
   '2026-09-04 00:00:00+00', '2026-09-05 00:00:00+00', '2026-09-05 00:00:00+00', '2026-10-03 00:00:00+00'),
  ('83000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001',
   '2026-08-28 00:00:00+00', '2026-08-29 00:00:00+00', '2026-08-29 00:00:00+00', '2026-09-26 00:00:00+00'),
  ('83000000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000001',
   '2026-08-21 00:00:00+00', '2026-08-22 00:00:00+00', '2026-08-22 00:00:00+00', '2026-09-19 00:00:00+00'),
  ('83000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001',
   '2026-08-14 00:00:00+00', '2026-08-15 00:00:00+00', '2026-08-15 00:00:00+00', '2026-09-12 00:00:00+00'),
  ('83000000-0000-4000-8000-000000000006', '82000000-0000-4000-8000-000000000001',
   '2026-09-18 00:00:00+00', '2026-09-19 00:00:00+00', '2026-09-19 00:00:00+00', '2026-10-17 00:00:00+00');

insert into public.song_league_recommendations(
  id, league_id, round_id, recommender_user_id, track_id, recording_key,
  track_name, artist_names, submitted_at, scoring_starts_at, scoring_ends_at
) values
  ('84000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'retention-current', 'track:current', 'Current', 'Artist', '2026-09-11 10:00:00+00', '2026-09-12 00:00:00+00', '2026-10-10 00:00:00+00'),
  ('84000000-0000-4000-8000-000000000002', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000002', '81000000-0000-4000-8000-000000000001', 'retention-week-one', 'track:week-one', 'Week one', 'Artist', '2026-09-04 10:00:00+00', '2026-09-05 00:00:00+00', '2026-10-03 00:00:00+00'),
  ('84000000-0000-4000-8000-000000000003', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000003', '81000000-0000-4000-8000-000000000001', 'retention-week-two', 'track:week-two', 'Week two', 'Artist', '2026-08-28 10:00:00+00', '2026-08-29 00:00:00+00', '2026-09-26 00:00:00+00'),
  ('84000000-0000-4000-8000-000000000004', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000004', '81000000-0000-4000-8000-000000000001', 'retention-week-three', 'track:week-three', 'Week three', 'Artist', '2026-08-21 10:00:00+00', '2026-08-22 00:00:00+00', '2026-09-19 00:00:00+00'),
  ('84000000-0000-4000-8000-000000000005', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000005', '81000000-0000-4000-8000-000000000001', 'retention-expired', 'track:expired', 'Expired', 'Artist', '2026-08-14 10:00:00+00', '2026-08-15 00:00:00+00', '2026-09-12 00:00:00+00'),
  ('84000000-0000-4000-8000-000000000006', '82000000-0000-4000-8000-000000000001', '83000000-0000-4000-8000-000000000006', '81000000-0000-4000-8000-000000000001', 'retention-future', 'track:future', 'Future', 'Artist', '2026-09-18 10:00:00+00', '2026-09-19 00:00:00+00', '2026-10-17 00:00:00+00');

-- A legacy duplicate must not cause Spotify to receive the same URI twice.
update public.song_league_recommendations
set track_id = 'retention-current'
where id = '84000000-0000-4000-8000-000000000003';

create temporary table retention_payload as
select * from public.get_song_league_weekly_playlist_payload(
  '82000000-0000-4000-8000-000000000001', '2026-09-11 12:00:00+00'
);

select is((select round_id from retention_payload),
  '83000000-0000-4000-8000-000000000001'::uuid,
  'the payload still identifies the current league round');
select is((select track_uris from retention_payload),
  array['spotify:track:retention-current', 'spotify:track:retention-week-one',
        'spotify:track:retention-week-three']::text[],
  'current and still-scoring prior recommendations are ordered newest first');
select ok(not ('spotify:track:retention-expired' = any((select track_uris from retention_payload))),
  'the oldest recommendation rolls off when the next four-round playlist window starts');
select ok(not ('spotify:track:retention-future' = any((select track_uris from retention_payload))),
  'future recommendations cannot leak into the current playlist');
select is((select cardinality(track_uris) from retention_payload), 3,
  'duplicate Spotify track URIs are emitted only once');

update public.song_leagues set closed_at = '2026-09-11 12:00:00+00'
where id = '82000000-0000-4000-8000-000000000001';
select is((select count(*) from public.get_song_league_weekly_playlist_payload(
  '82000000-0000-4000-8000-000000000001', '2026-09-11 12:00:00+00'
)), 0::bigint, 'closed leagues never produce playlist work');

select * from finish();
rollback;
