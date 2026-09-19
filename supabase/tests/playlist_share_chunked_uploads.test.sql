begin;
create extension if not exists pgtap with schema extensions;
select plan(13);

insert into auth.users(id, email) values
  ('51000000-0000-4000-8000-000000000001', 'chunk-owner@example.test');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '51000000-0000-4000-8000-000000000001', true);

select public.begin_playlist_share_create_upload(
  'large-source', 'Large playlist', '', '', 'Owner', '', repeat('c', 64)
) as upload_id \gset create_

select is(public.append_playlist_share_upload_chunk(
  :'create_upload_id', 0,
  (select jsonb_agg(jsonb_build_object('id', 'track-' || item, 'padding', repeat('x', 20000)))
   from generate_series(1, 20) item)
), 20, 'a bounded chunk is accepted');
select is(public.append_playlist_share_upload_chunk(
  :'create_upload_id', 20,
  (select jsonb_agg(jsonb_build_object('id', 'track-' || item, 'padding', repeat('x', 20000)))
   from generate_series(21, 40) item)
), 20, 'a snapshot larger than the legacy 2 MB limit can continue in chunks');
select is(public.append_playlist_share_upload_chunk(
  :'create_upload_id', 40,
  (select jsonb_agg(jsonb_build_object('id', 'track-' || item, 'padding', repeat('x', 20000)))
   from generate_series(41, 60) item)
), 20, 'later chunks remain bounded independently');
select is(public.append_playlist_share_upload_chunk(
  :'create_upload_id', 60,
  (select jsonb_agg(jsonb_build_object('id', 'track-' || item, 'padding', repeat('x', 20000)))
   from generate_series(61, 80) item)
), 20, 'the complete upload may exceed two megabytes');
select is(public.append_playlist_share_upload_chunk(
  :'create_upload_id', 80,
  (select jsonb_agg(jsonb_build_object('id', 'track-' || item, 'padding', repeat('x', 20000)))
   from generate_series(81, 100) item)
), 20, 'the final chunk is accepted');
select public.commit_playlist_share_create_upload(:'create_upload_id', 100) as share_id \gset chunk_
select is((select track_count from public.playlist_shares where id = :'chunk_share_id'), 100,
  'commit publishes the complete large snapshot');
select is((select count(*) from public.playlist_share_tracks where share_id = :'chunk_share_id'), 100::bigint,
  'all normalized rows become visible together');

select public.begin_playlist_share_refresh_upload(:'chunk_share_id', 1, 'Incomplete', '', '') as upload_id \gset partial_
select public.append_playlist_share_upload_chunk(
  :'partial_upload_id', 0, '[{"id":"replacement-one"}]'::jsonb
);
select throws_ok(format(
  'select public.commit_playlist_share_refresh_upload(%L, 2)', :'partial_upload_id'
), 'P0001', 'The playlist upload is incomplete. Retry the missing chunks before publishing.',
  'an incomplete upload cannot replace the live snapshot');
select is((select track_count from public.playlist_shares where id = :'chunk_share_id'), 100,
  'a failed commit preserves the prior live revision');
select public.append_playlist_share_upload_chunk(
  :'partial_upload_id', 1, '[{"id":"replacement-two"}]'::jsonb
);
select is(public.commit_playlist_share_refresh_upload(:'partial_upload_id', 2), 2::bigint,
  'the same upload can resume and commit after its missing chunk arrives');

select public.begin_playlist_share_refresh_upload(:'chunk_share_id', 2, 'Winner', '', '') as upload_id \gset winner_
select public.begin_playlist_share_refresh_upload(:'chunk_share_id', 2, 'Stale', '', '') as upload_id \gset stale_
select public.append_playlist_share_upload_chunk(:'winner_upload_id', 0, '[{"id":"winner"}]'::jsonb);
select public.append_playlist_share_upload_chunk(:'stale_upload_id', 0, '[{"id":"stale"}]'::jsonb);
select is(public.commit_playlist_share_refresh_upload(:'winner_upload_id', 1), 3::bigint,
  'the first concurrent upload wins with an atomic revision increment');
select throws_ok(format(
  'select public.commit_playlist_share_refresh_upload(%L, 1)', :'stale_upload_id'
), 'P0001', 'The shared playlist changed. Reload it before publishing again.',
  'a stale concurrent upload cannot overwrite the winner');
select is((select track_id from public.playlist_share_tracks where share_id = :'chunk_share_id'), 'winner',
  'the stale upload leaves the winning snapshot untouched');

select * from finish();
rollback;
