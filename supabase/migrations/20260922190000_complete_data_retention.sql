-- Complete, monitored lifecycle cleanup. User-created history and active
-- collaboration are intentionally excluded: absence is not consent to erase.

create table public.retention_cleanup_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  error text
);

create index retention_cleanup_runs_started_idx
  on public.retention_cleanup_runs(started_at desc);
alter table public.retention_cleanup_runs enable row level security;
revoke all on public.retention_cleanup_runs from public, anon, authenticated;
grant select, insert, update, delete on public.retention_cleanup_runs to service_role;

create or replace function private.cleanup_data_retention(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public, private, pg_catalog as $$
declare
  v_stats_requests integer := 0;
  v_stats_invites integer := 0;
  v_reviewed_reports integer := 0;
  v_share_revocations integer := 0;
  v_league_invites integer := 0;
  v_rejoin_requests integer := 0;
  v_rejoin_approvals integer := 0;
  v_rate_limits integer := 0;
  v_sync_leases integer := 0;
  v_catalog_versions integer := 0;
  v_tracks integer := 0;
  v_albums integer := 0;
  v_artists integer := 0;
  v_genres integer := 0;
  v_alerts integer := 0;
  v_run_history integer := 0;
  v_inactive_review_candidates integer := 0;
begin
  -- Collaboration tombstones remain for 30 days so every device has time to
  -- observe revocation. Active/approved records are never removed here.
  delete from public.stats_access_invites invite
  where invite.expires_at < p_now - interval '30 days'
     or invite.claimed_at < p_now - interval '30 days';
  get diagnostics v_stats_invites = row_count;

  delete from public.stats_access_requests request
  where (request.status = 'pending' and request.requested_at < p_now - interval '30 days')
     or (request.status in ('declined', 'revoked') and request.updated_at < p_now - interval '30 days');
  get diagnostics v_stats_requests = row_count;

  delete from public.stats_user_reports report
  where report.reviewed_at is not null and report.reviewed_at < p_now - interval '180 days';
  get diagnostics v_reviewed_reports = row_count;

  delete from public.playlist_share_revocations revocation
  where revocation.revoked_at < p_now - interval '30 days';
  get diagnostics v_share_revocations = row_count;

  delete from public.song_league_rejoin_approvals approval
  where approval.expires_at < p_now - interval '30 days';
  get diagnostics v_rejoin_approvals = row_count;

  delete from public.song_league_rejoin_requests request
  where (request.status = 'pending' and request.request_expires_at < p_now - interval '30 days')
     or (request.status = 'approved' and request.approval_expires_at < p_now - interval '30 days')
     or (request.status in ('declined', 'joined')
       and coalesce(request.responded_at, request.requested_at) < p_now - interval '30 days');
  get diagnostics v_rejoin_requests = row_count;

  delete from public.song_league_invites invite
  where invite.expires_at < p_now - interval '30 days'
     or invite.revoked_at < p_now - interval '30 days';
  get diagnostics v_league_invites = row_count;

  -- Technical state has no user-facing historical value.
  delete from private.edge_request_limits request_limit
  where request_limit.updated_at < p_now - interval '2 days';
  get diagnostics v_rate_limits = row_count;

  delete from private.song_league_playlist_sync_leases lease
  where lease.lease_expires_at < p_now - interval '1 day';
  get diagnostics v_sync_leases = row_count;

  delete from public.catalog_write_versions version
  where version.updated_at < p_now - interval '90 days';
  get diagnostics v_catalog_versions = row_count;

  -- Catalog rows are shared and reconstructible. Delete only rows that are
  -- older than 90 days and have no live fact/history reference anywhere.
  delete from public.tracks track
  where track.last_updated < p_now - interval '90 days'
    and not exists (select 1 from public.listening_history history where history.track_id = track.id)
    and not exists (select 1 from public.stats_snapshot_tracks snapshot where snapshot.track_id = track.id)
    and not exists (select 1 from public.user_top_tracks_history top_item where top_item.track_id = track.id)
    and not exists (select 1 from public.song_league_recommendations recommendation where recommendation.track_id = track.id);
  get diagnostics v_tracks = row_count;

  delete from public.albums album
  where album.last_updated < p_now - interval '90 days'
    and not exists (select 1 from public.tracks track where track.album_id = album.id);
  get diagnostics v_albums = row_count;

  delete from public.artists artist
  where artist.last_updated < p_now - interval '90 days'
    and not exists (select 1 from public.track_artists relation where relation.artist_id = artist.id)
    and not exists (select 1 from public.album_artists relation where relation.artist_id = artist.id)
    and not exists (select 1 from public.stats_snapshot_artists snapshot where snapshot.artist_id = artist.id)
    and not exists (select 1 from public.user_top_artists_history top_item where top_item.artist_id = artist.id);
  get diagnostics v_artists = row_count;

  delete from public.genres genre
  where not exists (select 1 from public.stats_snapshot_genres snapshot where snapshot.genre_name = genre.name);
  get diagnostics v_genres = row_count;

  delete from public.operational_alerts alert
  where alert.resolved_at < p_now - interval '90 days';
  get diagnostics v_alerts = row_count;

  delete from public.retention_cleanup_runs run
  where run.status = 'succeeded' and run.finished_at < p_now - interval '90 days';
  get diagnostics v_run_history = row_count;

  -- Inactivity alone is deliberately a review signal, never deletion authority.
  select count(*) into v_inactive_review_candidates
  from public.users account
  where greatest(account.created_at, coalesce(account.last_synced_at, account.created_at)) < p_now - interval '730 days'
    and account.spotify_id not like 'analytify_demo_bot_%'
    and not exists (select 1 from public.app_admins admin where admin.user_id = account.id)
    and not exists (select 1 from public.song_league_members member
      join public.song_leagues league on league.id = member.league_id
      where member.user_id = account.id and member.left_at is null and league.closed_at is null)
    and not exists (select 1 from public.playlist_shares share
      where share.revoked_at is null and account.id in (share.owner_user_id, share.recipient_user_id))
    and not exists (select 1 from public.stats_access_requests request
      where request.status = 'approved' and account.id in (request.owner_user_id, request.viewer_user_id));

  return jsonb_build_object(
    'stats_access_invites_deleted', v_stats_invites,
    'stats_access_requests_deleted', v_stats_requests,
    'reviewed_reports_deleted', v_reviewed_reports,
    'share_revocations_deleted', v_share_revocations,
    'league_invites_deleted', v_league_invites,
    'rejoin_requests_deleted', v_rejoin_requests,
    'rejoin_approvals_deleted', v_rejoin_approvals,
    'rate_limits_deleted', v_rate_limits,
    'sync_leases_deleted', v_sync_leases,
    'catalog_versions_deleted', v_catalog_versions,
    'orphan_tracks_deleted', v_tracks,
    'orphan_albums_deleted', v_albums,
    'orphan_artists_deleted', v_artists,
    'orphan_genres_deleted', v_genres,
    'resolved_alerts_deleted', v_alerts,
    'cleanup_runs_deleted', v_run_history,
    'inactive_profiles_for_review', v_inactive_review_candidates
  );
end;
$$;

create or replace function private.run_data_retention_cleanup(p_now timestamptz default now())
returns jsonb language plpgsql security definer set search_path = public, private, pg_catalog as $$
declare v_run_id uuid; v_summary jsonb;
begin
  insert into public.retention_cleanup_runs(started_at) values (p_now) returning id into v_run_id;
  begin
    v_summary := private.cleanup_data_retention(p_now);
    update public.retention_cleanup_runs set status = 'succeeded', finished_at = clock_timestamp(),
      summary = v_summary, error = null where id = v_run_id;
    return v_summary;
  exception when others then
    update public.retention_cleanup_runs set status = 'failed', finished_at = clock_timestamp(),
      error = left(sqlstate || ': ' || sqlerrm, 2000) where id = v_run_id;
    return jsonb_build_object('error', left(sqlstate || ': ' || sqlerrm, 2000));
  end;
end;
$$;

create or replace function public.monitor_data_retention_health()
returns table(alert_key text, severity text, message text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_latest public.retention_cleanup_runs%rowtype; v_now timestamptz := now();
begin
  if auth.role() <> 'service_role' then
    raise exception 'Retention monitoring is restricted to the trusted worker.';
  end if;
  select * into v_latest from public.retention_cleanup_runs order by started_at desc limit 1;
  if v_latest.id is null or v_latest.status <> 'succeeded' or v_latest.finished_at < v_now - interval '48 hours' then
    insert into public.operational_alerts as existing(
      alert_key, severity, message, first_seen_at, last_seen_at, resolved_at
    ) values (
      'data-retention-cleanup', 'critical',
      case when v_latest.id is null then 'The data-retention cleanup has never completed.'
        when v_latest.status = 'failed' then 'The latest data-retention cleanup failed.'
        else 'The data-retention cleanup has not succeeded within 48 hours.' end,
      v_now, v_now, null
    ) on conflict on constraint operational_alerts_pkey do update set
      severity = excluded.severity, message = excluded.message,
      last_seen_at = v_now, resolved_at = null;
  else
    update public.operational_alerts set resolved_at = v_now
    where operational_alerts.alert_key = 'data-retention-cleanup' and resolved_at is null;
  end if;

  return query
  update public.operational_alerts alert set last_notified_at = v_now
  where alert.alert_key = 'data-retention-cleanup' and alert.resolved_at is null
    and (alert.last_notified_at is null or alert.last_notified_at < v_now - interval '30 minutes')
  returning alert.alert_key, alert.severity, alert.message;
end;
$$;

revoke all on function private.cleanup_data_retention(timestamptz) from public, anon, authenticated;
revoke all on function private.run_data_retention_cleanup(timestamptz) from public, anon, authenticated;
revoke all on function public.monitor_data_retention_health() from public, anon, authenticated;
grant execute on function private.cleanup_data_retention(timestamptz) to service_role;
grant execute on function private.run_data_retention_cleanup(timestamptz) to service_role;
grant execute on function public.monitor_data_retention_health() to service_role;

-- Run once on installation so the monitor has a real baseline and stale,
-- provably safe records do not wait for the first nightly schedule.
select private.run_data_retention_cleanup(now());

select cron.schedule(
  'analytify-complete-data-retention',
  '37 3 * * *',
  $cron$select private.run_data_retention_cleanup();$cron$
)
where not exists (
  select 1 from cron.job where jobname = 'analytify-complete-data-retention'
);

comment on function private.cleanup_data_retention(timestamptz) is
  'Deletes only policy-expired collaboration/moderation state and old unreferenced Spotify catalog rows; active user data is excluded.';
comment on table public.retention_cleanup_runs is
  'Monitors nightly retention execution and stores non-personal aggregate deletion counts.';

notify pgrst, 'reload schema';
