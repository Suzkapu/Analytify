begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

select has_column('public', 'song_league_playlists', 'operation_marker',
  'Song League destinations have a durable recovery marker');
select has_function('public', 'reserve_song_league_playlist_sync',
  array['uuid', 'uuid', 'bigint', 'bigint', 'uuid', 'uuid'],
  'a lease-checked reservation RPC exists');
select has_function('public', 'record_song_league_playlist_sync_failure',
  array['uuid', 'uuid', 'bigint', 'uuid', 'text'],
  'a lease-checked sanitized failure RPC exists');

insert into public.users(id, spotify_id, display_name, backup_active) values
  ('75000000-0000-4000-8000-000000000001', 'recovery-owner', 'Owner', true),
  ('75000000-0000-4000-8000-000000000002', 'recovery-member', 'Member', true);
insert into public.song_leagues(id, owner_user_id, name, timezone, playlist_revision) values
  ('76000000-0000-4000-8000-000000000001',
   '75000000-0000-4000-8000-000000000001', 'Recovery league', 'UTC', 2);
insert into public.song_league_members(league_id, user_id, role) values
  ('76000000-0000-4000-8000-000000000001', '75000000-0000-4000-8000-000000000001', 'owner'),
  ('76000000-0000-4000-8000-000000000001', '75000000-0000-4000-8000-000000000002', 'member');
insert into public.song_league_rounds(
  id, league_id, starts_at, submission_ends_at, scoring_starts_at, scoring_ends_at
) values (
  '77000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000001',
  private.song_league_friday_start('UTC', now()),
  private.song_league_friday_start('UTC', now()) + interval '1 day',
  private.song_league_friday_start('UTC', now()) + interval '1 day',
  private.song_league_friday_start('UTC', now()) + interval '29 days'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(public.claim_song_league_playlist_sync(
  '76000000-0000-4000-8000-000000000001', '78000000-0000-4000-8000-000000000001'
), 'worker acquires the authoritative league lease');
create temporary table first_reservation as select *
from public.reserve_song_league_playlist_sync(
  '76000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000002', 2, 0,
  '77000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001'
);
select is((select count(*) from first_reservation), 1::bigint,
  'reservation succeeds before Spotify side effects');
select is((select spotify_playlist_id from first_reservation), null::text,
  'a reservation never invents a Spotify playlist ID');
select matches((select operation_marker from first_reservation), '^[0-9a-f]{64}$',
  'reservation returns a bounded deterministic marker');
select is((select count(*) from public.song_league_playlists
  where league_id = '76000000-0000-4000-8000-000000000001'
    and user_id = '75000000-0000-4000-8000-000000000002'), 1::bigint,
  'reservation durably creates exactly one nullable mapping');

create temporary table retry_reservation as select *
from public.reserve_song_league_playlist_sync(
  '76000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000002', 2, 0,
  '77000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001'
);
select is((select operation_marker from retry_reservation),
  (select operation_marker from first_reservation),
  'a retry receives the same recovery operation marker');

select ok(public.record_song_league_playlist_sync_failure(
  '76000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000002', 0,
  '78000000-0000-4000-8000-000000000001',
  'secret upstream payload must not persist'
), 'the lease owner records a failed attempt');
select is((select last_error from public.song_league_playlists
  where league_id = '76000000-0000-4000-8000-000000000001'
    and user_id = '75000000-0000-4000-8000-000000000002'),
  'This playlist could not be updated. Please try again later.',
  'only a stable sanitized error is persisted');

select ok(public.complete_song_league_playlist_sync(
  '76000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000002', 2, 0,
  '77000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001',
  'spotify-recovered', 'https://open.spotify.com/playlist/spotify-recovered'
), 'recovered Spotify work completes through the existing revision CAS');
select is((select last_error from public.song_league_playlists
  where league_id = '76000000-0000-4000-8000-000000000001'
    and user_id = '75000000-0000-4000-8000-000000000002'), null::text,
  'successful completion clears a prior failed-attempt state');
select isnt(public.record_song_league_playlist_sync_failure(
  '76000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000002', 0,
  '78000000-0000-4000-8000-000000000001', 'late failure'
), true, 'a lost completion response cannot mark the committed revision failed');
select is((select last_error from public.song_league_playlists
  where league_id = '76000000-0000-4000-8000-000000000001'
    and user_id = '75000000-0000-4000-8000-000000000002'), null::text,
  'late failure handling leaves the completed row successful');
select is((select count(*) from public.reserve_song_league_playlist_sync(
  '76000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000002', 2, 0,
  '77000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001'
)), 0::bigint, 'an outdated applied revision cannot reclaim completed work');

select * from finish();
rollback;
