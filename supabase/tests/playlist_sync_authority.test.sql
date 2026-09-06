begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users(id, email) values
  ('36000000-0000-4000-8000-000000000001', 'sync-owner@example.test'),
  ('36000000-0000-4000-8000-000000000002', 'sync-recipient@example.test');
insert into public.playlist_shares(
  owner_user_id, recipient_user_id, source_playlist_id, playlist_name,
  token_hash, snapshot_hash, revision
) values (
  '36000000-0000-4000-8000-000000000001',
  '36000000-0000-4000-8000-000000000002',
  'source', 'Shared', repeat('a', 64), repeat('b', 64), 1
) returning id \gset sync_
insert into public.playlist_share_downloads(
  share_id, recipient_user_id, spotify_playlist_id, spotify_playlist_url, applied_revision
) values (
  :'sync_id', '36000000-0000-4000-8000-000000000002',
  'spotify-old', 'https://open.spotify.com/playlist/spotify-old', 0
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select ok(public.refresh_playlist_share_from_worker(
  :'sync_id', 1, 'Fresh', '', '', '[{"id":"fresh-track"}]'::jsonb
), 'authoritative worker publishes against the expected source revision');
select is((select revision from public.playlist_shares where id = :'sync_id'), 2::bigint,
  'changed worker snapshot increments the source revision');
select isnt(public.refresh_playlist_share_from_worker(
  :'sync_id', 1, 'Stale', '', '', '[{"id":"stale-track"}]'::jsonb
), true, 'delayed worker publication cannot overwrite a newer revision');
select is((select track_id from public.playlist_share_tracks where share_id = :'sync_id'), 'fresh-track',
  'rejected stale publication leaves the fresh snapshot intact');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '36000000-0000-4000-8000-000000000002', true);
select ok(public.claim_playlist_share_sync(
  :'sync_id', null, 2, 0, '36000000-0000-4000-8000-000000000010'
), 'recipient claims the exact source/applied revision pair');
select isnt(public.claim_playlist_share_sync(
  :'sync_id', null, 2, 0, '36000000-0000-4000-8000-000000000011'
), true, 'a competing browser or worker cannot mutate the same Spotify destination');
select isnt(public.complete_playlist_share_sync(
  :'sync_id', null, 1, 0, '36000000-0000-4000-8000-000000000010',
  'spotify-stale', 'https://open.spotify.com/playlist/spotify-stale'
), true, 'completion must match the exact current source revision');
select ok(public.complete_playlist_share_sync(
  :'sync_id', null, 2, 0, '36000000-0000-4000-8000-000000000010',
  'spotify-fresh', 'https://open.spotify.com/playlist/spotify-fresh'
), 'the lease owner can complete its exact revision');
select is((select applied_revision from public.playlist_share_downloads where share_id = :'sync_id'), 2::bigint,
  'successful completion advances the applied revision');
reset role;
select throws_ok(format(
  'update public.playlist_share_downloads set applied_revision = 1 where share_id = %L', :'sync_id'
), 'P0001', 'Applied playlist revisions cannot move backwards.',
  'database trigger rejects every direct applied-revision regression');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '36000000-0000-4000-8000-000000000002', true);
select lives_ok(format(
  $sql$select public.record_playlist_share_download(%L, 'spotify-stale', 'https://open.spotify.com/playlist/spotify-stale', 1)$sql$,
  :'sync_id'
), 'a delayed legacy completion is harmless');
select is((select spotify_playlist_id from public.playlist_share_downloads where share_id = :'sync_id'),
  'spotify-fresh', 'delayed completion cannot replace the newer Spotify mapping');
select isnt(public.claim_playlist_share_sync(
  :'sync_id', null, 2, 0, '36000000-0000-4000-8000-000000000012'
), true, 'old expected applied revisions cannot replay a completed side effect');

select * from finish();
rollback;
