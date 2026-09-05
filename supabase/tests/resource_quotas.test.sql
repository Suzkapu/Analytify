begin;
create extension if not exists pgtap with schema extensions;
select plan(10);
set local statement_timeout = '3s';

insert into auth.users(id, email) values
  ('32000000-0000-4000-8000-000000000001', 'quota-owner@example.test');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '32000000-0000-4000-8000-000000000001', true);

select throws_ok($$ select public.create_playlist_share(
  'playlist', 'Too many', '', '', 'Owner', '', '12345678901234567890123456789012',
  (select jsonb_agg(jsonb_build_object('id', item)) from generate_series(1, 5001) item)
) $$, 'P0001', 'Shared playlists are limited to 5000 tracks.',
  'oversized arrays are rejected within the bounded statement timeout');
select is((select count(*) from public.playlist_shares where owner_user_id = auth.uid()), 0::bigint,
  'oversized playlist input creates no share or child rows');
select throws_ok($$ select public.create_playlist_share(
  'playlist', 'Huge object', '', '', 'Owner', '', '22345678901234567890123456789012',
  jsonb_build_array(jsonb_build_object('id', 'track', 'padding', repeat('x', 33000)))
) $$, 'P0001', 'Every shared track must be a bounded object with a valid ID.',
  'oversized per-track objects are rejected before expansion');
select lives_ok($$ select public.create_playlist_share(
  'playlist', 'Valid', '', '', 'Owner', '', '32345678901234567890123456789012',
  '[{"id":"track-one"}]'::jsonb
) $$, 'bounded playlist snapshots remain usable');

reset role;
insert into public.playlist_shares(
  owner_user_id, source_playlist_id, playlist_name, token_hash, snapshot_hash, created_at
)
select '32000000-0000-4000-8000-000000000001', 'old-' || item, 'Old share',
  encode(extensions.digest('share-token-' || item, 'sha256'), 'hex'), repeat('a', 64), now() - interval '2 hours'
from generate_series(1, 99) item;
set local role authenticated;
select set_config('request.jwt.claim.sub', '32000000-0000-4000-8000-000000000001', true);
select throws_ok($$ select public.create_playlist_share(
  'playlist', 'Quota', '', '', 'Owner', '', '42345678901234567890123456789012', '[]'::jsonb
) $$, 'P0001', 'Each account is limited to 100 active playlist shares.',
  'active playlist-share row growth is capped per account');

reset role;
delete from public.playlist_shares where owner_user_id = '32000000-0000-4000-8000-000000000001';
insert into public.song_leagues(owner_user_id, name, created_at)
select '32000000-0000-4000-8000-000000000001', 'Old league ' || item, now() - interval '2 days'
from generate_series(1, 20) item;
select throws_ok($$ insert into public.song_leagues(owner_user_id, name)
  values ('32000000-0000-4000-8000-000000000001', 'Too many') $$,
  'P0001', 'Each account is limited to 20 active Song Leagues.',
  'active Song League growth is capped per account');

delete from public.song_leagues where owner_user_id = '32000000-0000-4000-8000-000000000001';
insert into public.song_leagues(owner_user_id, name) values
  ('32000000-0000-4000-8000-000000000001', 'Invite quota') returning id \gset quota_
insert into public.song_league_invites(league_id, token_hash, created_by, expires_at)
select :'quota_id', encode(extensions.digest('invite-token-' || item, 'sha256'), 'hex'),
  '32000000-0000-4000-8000-000000000001', now() + interval '1 day'
from generate_series(1, 20) item;
select throws_ok(format($statement$insert into public.song_league_invites(
  league_id, token_hash, created_by, expires_at
) values (%L, %L, %L, now() + interval '1 day')$statement$,
  :'quota_id', repeat('b', 64), '32000000-0000-4000-8000-000000000001'),
  'P0001', 'Each Song League is limited to 20 active invitations.',
  'active invitation growth is capped per league');

insert into public.compare_rooms(room_id, host_user_id, host_participant_id, expires_at)
values ('expired_room_123456', '32000000-0000-4000-8000-000000000001',
  'expired_host_123456', now() - interval '2 days');
select is(private.cleanup_compare_rooms(), 1::bigint,
  'expired Compare Rooms and their child data are cleaned up');
select is((select count(*) from public.compare_rooms where room_id = 'expired_room_123456'), 0::bigint,
  'Compare Room cleanup leaves no expired parent row');
select ok((select count(*) <= 20 from public.song_league_invites where league_id = :'quota_id'),
  'stress setup confirms the invitation table remains bounded');

select * from finish();
rollback;
