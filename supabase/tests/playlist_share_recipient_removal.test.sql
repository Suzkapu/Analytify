begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users(id, email) values
  ('76400000-0000-4000-8000-000000000001', 'removal-owner@example.test'),
  ('76400000-0000-4000-8000-000000000002', 'removal-recipient@example.test'),
  ('76400000-0000-4000-8000-000000000003', 'removal-stranger@example.test');
insert into public.playlist_shares(
  owner_user_id, recipient_user_id, source_playlist_id, playlist_name,
  recipient_display_name, token_hash, snapshot_hash, accepted_at, revision
) values (
  '76400000-0000-4000-8000-000000000001',
  '76400000-0000-4000-8000-000000000002',
  'source', 'Shared', 'Recipient',
  encode(digest(convert_to(repeat('t', 64), 'UTF8'), 'sha256'), 'hex'),
  repeat('f', 64), now(), 2
) returning id \gset removed_
insert into public.playlist_share_tracks(share_id, position, track_id, track)
values (:'removed_id', 0, 'track-one', '{"id":"track-one"}'::jsonb);
insert into public.playlist_share_downloads(
  share_id, recipient_user_id, spotify_playlist_id, spotify_playlist_url, applied_revision
) values (
  :'removed_id', '76400000-0000-4000-8000-000000000002',
  'spotify-copy', 'https://open.spotify.com/playlist/spotify-copy', 2
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '76400000-0000-4000-8000-000000000003', true);
select throws_ok(format('select public.remove_received_playlist_share(%L)', :'removed_id'),
  'P0001', 'The active received share was not found.', 'an unrelated user cannot remove the association');

select set_config('request.jwt.claim.sub', '76400000-0000-4000-8000-000000000001', true);
select throws_ok(format('select public.remove_received_playlist_share(%L)', :'removed_id'),
  'P0001', 'The active received share was not found.', 'the owner cannot use the recipient removal authority');

select set_config('request.jwt.claim.sub', '76400000-0000-4000-8000-000000000002', true);
select lives_ok(format('select public.remove_received_playlist_share(%L)', :'removed_id'),
  'the recipient can remove the playlist from their shared library');
reset role;

select is((select recipient_user_id from public.playlist_shares where id = :'removed_id'), null::uuid,
  'the recipient association is detached');
select ok((select revoked_at is null from public.playlist_shares where id = :'removed_id'),
  'recipient removal does not revoke or delete the owner share');
select is((select recipient_display_name from public.playlist_shares where id = :'removed_id'), 'Recipient',
  'the owner keeps the minimal historical recipient label');
select is((select count(*) from public.playlist_share_tracks where share_id = :'removed_id'), 1::bigint,
  'the owner snapshot remains intact');
select is((select count(*) from public.playlist_share_downloads where share_id = :'removed_id'), 0::bigint,
  'Analytify removes the recipient sync destination');
select ok((select claim_expires_at <= now() from public.playlist_shares where id = :'removed_id'),
  'the removed share cannot become claimable through its old invitation');
select isnt((select token_hash from public.playlist_shares where id = :'removed_id'),
  encode(digest(convert_to(repeat('t', 64), 'UTF8'), 'sha256'), 'hex'),
  'the old claim token is retired');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '76400000-0000-4000-8000-000000000002', true);
select throws_ok($$select public.claim_playlist_share(repeat('t', 64))$$,
  'P0001', 'This share link is invalid or has been revoked.', 'the old link cannot silently restore access');
select set_config('request.jwt.claim.sub', '76400000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.create_playlist_share(
  'source', 'Shared again', '', '', 'Owner', '', repeat('a', 64), '[]'::jsonb
)$$, 'the owner can create a fresh share record and link later');

select * from finish();
rollback;
