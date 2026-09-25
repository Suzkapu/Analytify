begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users(id, email) values
  ('61000000-0000-4000-8000-000000000001', 'late-owner@example.test'),
  ('61000000-0000-4000-8000-000000000002', 'early-member@example.test'),
  ('61000000-0000-4000-8000-000000000003', 'late-member@example.test');
update public.users set backup_active = true where id::text like '61000000-%';

insert into public.artists(id, name) values ('late-artist', 'Late Artist');
insert into public.albums(id, name) values ('late-album', 'Late Album');
insert into public.tracks(id, name, album_id, spotify_url) values
  ('late-track-1', 'First Pick', 'late-album', 'https://open.spotify.com/track/1111111111111111111111'),
  ('late-track-2', 'Late Pick', 'late-album', 'https://open.spotify.com/track/2222222222222222222222');
insert into public.track_artists(track_id, artist_id, artist_rank) values
  ('late-track-1', 'late-artist', 0), ('late-track-2', 'late-artist', 0);

insert into public.song_leagues(id, owner_user_id, name, timezone, owner_display_name)
values ('62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001', 'Late freshness', 'Europe/Vienna', 'Owner');
insert into public.song_league_members(league_id, user_id, role, display_name) values
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'owner', 'Owner'),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002', 'member', 'Early'),
  ('62000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', 'member', 'Late');

insert into public.stats_snapshots(id, user_id, range, snapshot_date) values
  ('63000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'short_term', '2026-09-25'),
  ('63000000-0000-4000-8000-000000000002', '61000000-0000-4000-8000-000000000002', 'short_term', '2026-09-25');
insert into public.stats_snapshot_tracks(snapshot_id, track_id, rank) values
  ('63000000-0000-4000-8000-000000000001', 'late-track-1', 1),
  ('63000000-0000-4000-8000-000000000002', 'late-track-1', 1);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select private.ensure_song_league_round(
  '62000000-0000-4000-8000-000000000001', '2026-09-25 12:00:00+00') $$,
  'the first fresh member opens the Friday round');

select is((select count(*) from public.song_league_round_members
  where league_id = '62000000-0000-4000-8000-000000000001'), 2::bigint,
  'only members with complete snapshots enter the initial roster');

insert into public.song_league_recommendations(
  league_id, round_id, recommender_user_id, track_id, recording_key,
  track_name, artist_names, scoring_starts_at, scoring_ends_at
)
select
  round.league_id, round.id, '61000000-0000-4000-8000-000000000001',
  'late-track-1', 'track:late-track-1', 'First Pick', 'Late Artist',
  round.scoring_starts_at, round.scoring_ends_at
from public.song_league_rounds round
where round.league_id = '62000000-0000-4000-8000-000000000001';

insert into public.stats_snapshots(id, user_id, range, snapshot_date) values
  ('63000000-0000-4000-8000-000000000003', '61000000-0000-4000-8000-000000000003', 'short_term', '2026-09-25');
insert into public.stats_snapshot_tracks(snapshot_id, track_id, rank) values
  ('63000000-0000-4000-8000-000000000003', 'late-track-2', 1);

select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000003', true);
select lives_ok($$ select private.ensure_song_league_round(
  '62000000-0000-4000-8000-000000000001', '2026-09-25 12:00:00+00') $$,
  'a member whose fresh snapshot arrives after the first pick is admitted');

select is((select count(*) from public.song_league_round_members
  where league_id = '62000000-0000-4000-8000-000000000001'), 3::bigint,
  'the late fresh member is added without rebuilding the established roster');

select * from finish();
rollback;
