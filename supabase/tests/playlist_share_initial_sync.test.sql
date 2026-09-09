begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id, email) values
  ('39000000-0000-4000-8000-000000000001', 'pending-owner@example.test'),
  ('39000000-0000-4000-8000-000000000002', 'pending-recipient@example.test');
insert into public.playlist_shares(
  owner_user_id, recipient_user_id, source_playlist_id, playlist_name,
  token_hash, snapshot_hash, revision
) values (
  '39000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000002',
  'source', 'Pending shared copy', repeat('c', 64), repeat('d', 64), 2
) returning id \gset pending_

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '39000000-0000-4000-8000-000000000002', true);

select ok(public.claim_playlist_share_sync(
  :'pending_id', null, 2, 0, '39000000-0000-4000-8000-000000000010'
), 'the first download reserves and claims a pending destination');
select is((select count(*) from public.playlist_share_downloads where share_id = :'pending_id'), 1::bigint,
  'claim creates exactly one durable mapping row');
select is((select spotify_playlist_id from public.playlist_share_downloads where share_id = :'pending_id'), null::text,
  'the reserved mapping has no invented Spotify ID');
select is((select applied_revision from public.playlist_share_downloads where share_id = :'pending_id'), 0::bigint,
  'the pending mapping does not claim that tracks were applied');
select isnt(public.claim_playlist_share_sync(
  :'pending_id', null, 2, 0, '39000000-0000-4000-8000-000000000011'
), true, 'a competing first-download attempt cannot acquire the lease');

select lives_ok(format(
  $sql$select public.release_playlist_share_sync(%L, null, '39000000-0000-4000-8000-000000000010')$sql$,
  :'pending_id'
), 'an interrupted first download can release its lease');
select ok(public.claim_playlist_share_sync(
  :'pending_id', null, 2, 0, '39000000-0000-4000-8000-000000000012'
), 'the same pending destination can be reclaimed for recovery');
select ok(public.complete_playlist_share_sync(
  :'pending_id', null, 2, 0, '39000000-0000-4000-8000-000000000012',
  'spotify-recovered', 'https://open.spotify.com/playlist/spotify-recovered'
), 'recovery completion atomically binds the Spotify destination and revision');

select * from finish();
rollback;
