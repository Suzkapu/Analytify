begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select col_default_is('public', 'sync_user_settings', 'history_enabled', 'false',
  'listening history is optional by default');
select col_default_is('public', 'sync_user_settings', 'medium_term_enabled', 'false',
  'medium-term stats are optional by default');
select col_default_is('public', 'sync_user_settings', 'long_term_enabled', 'false',
  'long-term stats are optional by default');
select col_default_is('public', 'sync_user_settings', 'short_term_enabled', 'false',
  'short-term collection is optional by default');
select col_default_is('public', 'sync_user_settings', 'shared_playlists_enabled', 'false',
  'shared-playlist collection is optional by default');
select col_default_is('public', 'sync_user_settings', 'song_league_playlists_enabled', 'false',
  'league-playlist collection is optional by default');

insert into public.users(id, spotify_id, display_name, backup_active) values
  ('71000000-0000-4000-8000-000000000001', 'dependency-owner', 'Owner', true),
  ('71000000-0000-4000-8000-000000000002', 'dependency-member', 'Member', true),
  ('71000000-0000-4000-8000-000000000003', 'dependency-admin', 'Admin', true);
insert into public.app_admins(user_id) values ('71000000-0000-4000-8000-000000000003');
insert into public.song_leagues(id, owner_user_id, name) values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'Dependency league');
insert into public.song_league_members(league_id, user_id, role) values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001', 'owner'),
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002', 'member');

select ok((select short_term_required and not history_enabled and not medium_term_enabled
    and not long_term_enabled and not song_league_playlists_required and not shared_playlists_required
  from public.sync_user_settings where user_id = '71000000-0000-4000-8000-000000000002'),
  'joining requires only short-term stats');
select ok((select next_run_at is not null from public.sync_task_state
  where user_id = '71000000-0000-4000-8000-000000000002' and task_key = 'stats_short_term'),
  'required short-term stats become due immediately');

insert into public.song_league_playlists(league_id, user_id) values
  ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002');
select ok((select song_league_playlists_required from public.sync_user_settings
  where user_id = '71000000-0000-4000-8000-000000000002'),
  'weekly playlist refresh starts only after a playlist is explicitly created');
delete from public.song_league_playlists
where league_id = '72000000-0000-4000-8000-000000000001'
  and user_id = '71000000-0000-4000-8000-000000000002';
select ok((select not song_league_playlists_required from public.sync_user_settings
  where user_id = '71000000-0000-4000-8000-000000000002'),
  'removing the weekly playlist disables its required refresh');

insert into public.playlist_shares(
  id, owner_user_id, source_playlist_id, playlist_name, token_hash, snapshot_hash
) values (
  '73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002',
  'spotify-playlist', 'Shared list', repeat('a', 64), repeat('b', 64)
);
select ok((select shared_playlists_required from public.sync_user_settings
  where user_id = '71000000-0000-4000-8000-000000000002'),
  'publishing a playlist enables only its required refresh');
update public.playlist_shares set recipient_user_id = '71000000-0000-4000-8000-000000000001',
  accepted_at = now() where id = '73000000-0000-4000-8000-000000000001';
select ok((select not shared_playlists_required from public.sync_user_settings
  where user_id = '71000000-0000-4000-8000-000000000001'),
  'claiming a share alone does not schedule writes to the recipient account');
insert into public.playlist_share_downloads(
  share_id, recipient_user_id, spotify_playlist_id, spotify_playlist_url, applied_revision
) values (
  '73000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000001',
  'downloaded-copy', 'https://open.spotify.com/playlist/downloaded-copy', 1
);
select ok((select shared_playlists_required from public.sync_user_settings
  where user_id = '71000000-0000-4000-8000-000000000001'),
  'explicitly downloading an auto-updating share enables recipient refresh');
update public.playlist_shares set revoked_at = now()
where id = '73000000-0000-4000-8000-000000000001';
select ok(
  (select not shared_playlists_required from public.sync_user_settings
    where user_id = '71000000-0000-4000-8000-000000000002')
  and (select not shared_playlists_required from public.sync_user_settings
    where user_id = '71000000-0000-4000-8000-000000000001')
  and (select next_run_at is null from public.sync_task_state
    where user_id = '71000000-0000-4000-8000-000000000001' and task_key = 'shared_playlists'),
  'revoking the last share disables publisher and recipient refresh');

update public.sync_task_state set next_run_at = '2030-01-01T00:00:00Z'
where user_id = '71000000-0000-4000-8000-000000000002' and task_key = 'stats_short_term';
do $$ begin perform private.enable_song_league_sync_for_user('71000000-0000-4000-8000-000000000002'); end $$;
select is((select next_run_at from public.sync_task_state
  where user_id = '71000000-0000-4000-8000-000000000002' and task_key = 'stats_short_term'),
  '2030-01-01T00:00:00Z'::timestamptz,
  'repeated page-load reconciliation preserves the existing schedule');

update public.song_league_members set left_at = now()
where league_id = '72000000-0000-4000-8000-000000000001'
  and user_id = '71000000-0000-4000-8000-000000000002';
select ok((select not short_term_required from public.sync_user_settings
  where user_id = '71000000-0000-4000-8000-000000000002'),
  'leaving the last active league removes the short-term requirement');
select ok((select next_run_at is null from public.sync_task_state
  where user_id = '71000000-0000-4000-8000-000000000002' and task_key = 'stats_short_term'),
  'no-longer-required work is unscheduled');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.get_my_sync_task_status()), 6,
  'a user can see all of their own automatic task statuses');

select set_config('request.jwt.claim.sub', '71000000-0000-4000-8000-000000000003', true);
select is((select required_tasks from public.admin_list_required_sync_reasons()
  where user_id = '71000000-0000-4000-8000-000000000002'), '{}'::jsonb,
  'admin reasons truthfully show that no feature-required work remains');

select * from finish();
rollback;
