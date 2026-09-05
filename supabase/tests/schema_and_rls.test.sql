begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

select has_table('public', 'users', 'users is reconstructible');
select has_table('public', 'artists', 'artists is reconstructible');
select has_table('public', 'albums', 'albums is reconstructible');
select has_table('public', 'tracks', 'tracks is reconstructible');
select has_table('public', 'listening_history', 'listening history is reconstructible');
select has_table('public', 'user_cache', 'user cache is reconstructible');
select has_table('public', 'stats_snapshots', 'stats snapshots are reconstructible');
select has_table('public', 'playlist_shares', 'playlist sharing is reconstructible');
select has_table('public', 'song_leagues', 'Song League is reconstructible');
select has_table('public', 'stats_access_requests', 'stats access is reconstructible');
select has_table('public', 'push_subscriptions', 'push subscriptions are reconstructible');
select has_table('public', 'sync_job_runs', 'sync control plane is reconstructible');
select has_function('public', 'replace_stats_snapshot', array[
  'uuid', 'text', 'date', 'numeric', 'integer', 'jsonb', 'jsonb', 'jsonb', 'timestamp with time zone'
], 'atomic snapshot RPC is present');
select has_function('public', 'ingest_spotify_catalog', array['text', 'jsonb', 'jsonb'],
  'bounded catalog ingestion RPC is present');
select has_function('public', 'claim_song_league', array['text'],
  'secure invite claim RPC is present');
select has_function('public', 'unlink_push_subscription', array['text'],
  'push unlink RPC is present');

select is((select relrowsecurity from pg_class where oid = 'public.users'::regclass), true,
  'users has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.tracks'::regclass), true,
  'tracks has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.playlist_shares'::regclass), true,
  'playlist shares has RLS');
select is((select relrowsecurity from pg_class where oid = 'public.song_leagues'::regclass), true,
  'Song League has RLS');

insert into auth.users(id, email) values
  ('10000000-0000-4000-8000-000000000001', 'one@example.test'),
  ('20000000-0000-4000-8000-000000000002', 'two@example.test');
update public.users set spotify_id = 'spotify-one' where id = '10000000-0000-4000-8000-000000000001';
update public.users set spotify_id = 'spotify-two' where id = '20000000-0000-4000-8000-000000000002';
insert into public.artists(id, name) values ('catalogartist000000001', 'Original');
insert into public.albums(id, name) values ('catalogalbum0000000001', 'Original');
insert into public.tracks(id, name) values ('catalogtrack0000000001', 'Original');
insert into public.app_admins(user_id) values ('10000000-0000-4000-8000-000000000001');

set local role anon;
select is_empty($$ select * from public.users $$,
  'anonymous clients cannot enumerate profiles');
select throws_ok($$ select public.ingest_spotify_catalog('tracks', '[]', '[]') $$,
  'P0001', 'Authentication is required.',
  'anonymous clients cannot call authenticated ingestion RPCs');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is((select count(*) from public.users), 1::bigint,
  'authenticated RLS exposes only the current profile');
select is(public.is_app_admin(), true, 'admin identity is recognized by its protected membership');

select lives_ok($$ select * from public.replace_stats_snapshot_v2(
  '10000000-0000-4000-8000-000000000001', 'short_term', '2026-09-05', 0, 0,
  '[{"track_id":"catalogtrack0000000001","rank":1}]', '[]', '[]',
  '2026-09-05T00:00:00Z', 'snapshot-key-0001', 0
) $$, 'first versioned snapshot replacement succeeds');
select is((select revision from public.stats_snapshots where user_id = auth.uid()
  and range = 'short_term' and snapshot_date = '2026-09-05'), 1::bigint,
  'snapshot revision starts at one');
select lives_ok($$ select * from public.replace_stats_snapshot_v2(
  '10000000-0000-4000-8000-000000000001', 'short_term', '2026-09-05', 0, 0,
  '[{"track_id":"catalogtrack0000000001","rank":1}]', '[]', '[]',
  '2026-09-05T00:00:00Z', 'snapshot-key-0001', 0
) $$, 'replaying the same snapshot key is idempotent');
select throws_ok($$ select * from public.replace_stats_snapshot_v2(
  '10000000-0000-4000-8000-000000000001', 'short_term', '2026-09-05', 0, 0,
  '[]', '[]', '[]', '2026-09-05T00:00:01Z', 'snapshot-key-0002', 0
) $$, '40001', 'The stats snapshot changed before this replacement committed.',
  'stale snapshot compare-and-swap is rejected');
select throws_ok($$ select * from public.replace_stats_snapshot_v2(
  '10000000-0000-4000-8000-000000000001', 'short_term', '2026-09-05', 0, 0,
  '[{"track_id":"missingtrack00000000001","rank":1}]', '[]', '[]',
  '2026-09-05T00:00:02Z', 'snapshot-key-0003', 1
) $$, '23503', 'insert or update on table "stats_snapshot_tracks" violates foreign key constraint "stats_snapshot_tracks_track_id_fkey"',
  'fault during replacement rolls its transaction back');
select is((select track_id from public.stats_snapshot_tracks relation
  join public.stats_snapshots snapshot on snapshot.id = relation.snapshot_id
  where snapshot.user_id = auth.uid() and snapshot.range = 'short_term'),
  'catalogtrack0000000001', 'last-known-good snapshot survives a failed replacement');

select lives_ok($$ select * from public.tracks where id = 'catalogtrack0000000001' $$,
  'authenticated users can read catalog rows');
select throws_ok($$ update public.tracks set name = 'Poisoned' where id = 'catalogtrack0000000001' $$,
  '42501', 'permission denied for table tracks', 'authenticated users cannot update catalog rows');
select throws_ok($$ delete from public.tracks where id = 'catalogtrack0000000001' $$,
  '42501', 'permission denied for table tracks', 'authenticated users cannot delete catalog rows');
select throws_ok($$ insert into public.tracks(id, name) values ('directinsert00000000001', 'Direct') $$,
  '42501', 'permission denied for table tracks', 'authenticated users cannot insert catalog rows directly');
select lives_ok($$ select public.ingest_spotify_catalog('tracks', '[{"id":"newcatalogtrack0000001","name":"New"}]', '[]') $$,
  'authenticated users can use bounded insert-only ingestion');
select is((select name from public.tracks where id = 'catalogtrack0000000001'), 'Original',
  'cross-user catalog metadata remains unchanged');
select lives_ok($$ select public.ingest_spotify_catalog('tracks', '[{"id":"newcatalogtrack0000001","name":"Changed"}]', '[]') $$,
  'conflicting bounded ingestion is safely ignored');

reset role;
-- The insert-only RPC returns normally on conflicts; verify it did not replace
-- the first accepted value instead of relying on an exception.
select is((select name from public.tracks where id = 'newcatalogtrack0000001'), 'New',
  'insert-only ingestion cannot rewrite an existing catalog row');

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select is((select count(*) from public.users), 2::bigint,
  'service role can perform trusted cross-user work');
select lives_ok($$ select public.replace_spotify_catalog(
  'tracks:catalogtrack0000000001', 0, 'catalog-write-key-0001', '[]', '[]',
  '[{"id":"catalogtrack0000000001","name":"Worker value","duration_ms":1,"explicit":false,"track_number":1,"disc_number":1,"is_playable":true,"is_local":false}]',
  '[]', '[]'
) $$, 'trusted catalog replacement succeeds');
select lives_ok($$ select public.replace_spotify_catalog(
  'tracks:catalogtrack0000000001', 0, 'catalog-write-key-0001', '[]', '[]',
  '[{"id":"catalogtrack0000000001","name":"Worker value","duration_ms":1,"explicit":false,"track_number":1,"disc_number":1,"is_playable":true,"is_local":false}]',
  '[]', '[]'
) $$, 'trusted catalog replacement replay is idempotent');
select throws_ok($$ select public.replace_spotify_catalog(
  'tracks:catalogtrack0000000001', 0, 'catalog-write-key-0002', '[]', '[]',
  '[{"id":"catalogtrack0000000001","name":"Stale value","duration_ms":1,"explicit":false,"track_number":1,"disc_number":1,"is_playable":true,"is_local":false}]',
  '[]', '[]'
) $$, '40001', 'The catalog resource changed before this replacement committed.',
  'stale catalog compare-and-swap is rejected');
select is((select name from public.tracks where id = 'catalogtrack0000000001'),
  'Worker value', 'stale catalog replacement cannot overwrite the committed version');
reset role;

select * from finish();
rollback;
