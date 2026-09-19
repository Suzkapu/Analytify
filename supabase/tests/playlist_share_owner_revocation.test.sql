begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users(id, email) values
  ('76500000-0000-4000-8000-000000000001', 'revoke-owner@example.test'),
  ('76500000-0000-4000-8000-000000000002', 'revoke-recipient@example.test'),
  ('76500000-0000-4000-8000-000000000003', 'other-recipient@example.test');

insert into public.playlist_shares(
  id, owner_user_id, recipient_user_id, source_playlist_id, playlist_name,
  token_hash, snapshot_hash, accepted_at, revision
) values
  ('76510000-0000-4000-8000-000000000001', '76500000-0000-4000-8000-000000000001',
   '76500000-0000-4000-8000-000000000002', 'source-one', 'Revoked share', repeat('a', 64), repeat('b', 64), now(), 2),
  ('76510000-0000-4000-8000-000000000002', '76500000-0000-4000-8000-000000000001',
   '76500000-0000-4000-8000-000000000003', 'source-two', 'Unaffected share', repeat('c', 64), repeat('d', 64), now(), 3);

insert into public.playlist_share_tracks(share_id, position, track_id, track) values
  ('76510000-0000-4000-8000-000000000001', 0, 'revoked-track', '{"id":"revoked-track"}'),
  ('76510000-0000-4000-8000-000000000002', 0, 'other-track', '{"id":"other-track"}');
insert into public.playlist_share_downloads(
  share_id, recipient_user_id, spotify_playlist_id, spotify_playlist_url, applied_revision
) values
  ('76510000-0000-4000-8000-000000000001', '76500000-0000-4000-8000-000000000002',
   'spotify-copy-to-preserve', 'https://open.spotify.com/playlist/spotify-copy-to-preserve', 2),
  ('76510000-0000-4000-8000-000000000002', '76500000-0000-4000-8000-000000000003',
   'unrelated-copy', 'https://open.spotify.com/playlist/unrelated-copy', 3);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '76500000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.revoke_playlist_share('76510000-0000-4000-8000-000000000001')$$,
  'P0001', 'The share was not found or is not owned by this user.',
  'a recipient cannot revoke through owner authority');

select set_config('request.jwt.claim.sub', '76500000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.revoke_playlist_share('76510000-0000-4000-8000-000000000001')$$,
  'the owner can revoke the share');
select lives_ok(
  $$select public.revoke_playlist_share('76510000-0000-4000-8000-000000000001')$$,
  'retrying an already completed revoke is idempotent');
reset role;

select ok((select revoked_at is not null from public.playlist_shares
  where id = '76510000-0000-4000-8000-000000000001'), 'the share is revoked');
select is((select track_count from public.playlist_shares
  where id = '76510000-0000-4000-8000-000000000001'), 0, 'recipient content is scrubbed');
select is((select count(*) from public.playlist_share_tracks
  where share_id = '76510000-0000-4000-8000-000000000001'), 0::bigint, 'revoked snapshot tracks are removed');
select is((select count(*) from public.playlist_share_revocations
  where share_id = '76510000-0000-4000-8000-000000000001'), 1::bigint, 'one realtime revocation event is retained');
select is((select recipient_user_id from public.playlist_share_revocations
  where share_id = '76510000-0000-4000-8000-000000000001'),
  '76500000-0000-4000-8000-000000000002'::uuid, 'the event targets the exact recipient');
select is((select spotify_playlist_id from public.playlist_share_downloads
  where share_id = '76510000-0000-4000-8000-000000000001'), 'spotify-copy-to-preserve',
  'the Spotify destination identifier is never deleted');
select is((select spotify_playlist_url from public.playlist_share_downloads
  where share_id = '76510000-0000-4000-8000-000000000001'),
  'https://open.spotify.com/playlist/spotify-copy-to-preserve', 'the external playlist URL is preserved');
select ok((select revoked_at is not null from public.playlist_share_downloads
  where share_id = '76510000-0000-4000-8000-000000000001'), 'the Analytify sync mapping is disabled');
select is((select sync_lease_token from public.playlist_share_downloads
  where share_id = '76510000-0000-4000-8000-000000000001'), null::uuid, 'any active sync lease is cleared');
select ok((select revoked_at is null from public.playlist_shares
  where id = '76510000-0000-4000-8000-000000000002'), 'an unrelated share stays active');
select is((select count(*) from public.playlist_share_tracks
  where share_id = '76510000-0000-4000-8000-000000000002'), 1::bigint, 'unrelated snapshot content is untouched');
select is((select spotify_playlist_id from public.playlist_share_downloads
  where share_id = '76510000-0000-4000-8000-000000000002'), 'unrelated-copy', 'unrelated download mappings are untouched');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '76500000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.playlist_shares
  where id = '76510000-0000-4000-8000-000000000001'), 0::bigint, 'the recipient can no longer list the revoked share');
select is((select count(*) from public.playlist_share_downloads
  where share_id = '76510000-0000-4000-8000-000000000001'), 0::bigint, 'the recipient can no longer read the disabled mapping');
select is((select count(*) from public.playlist_share_revocations
  where share_id = '76510000-0000-4000-8000-000000000001'), 1::bigint, 'the recipient can receive the minimal revocation event');

select * from finish();
rollback;
