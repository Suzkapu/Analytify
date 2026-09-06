-- The worker is the sole background publisher for source snapshots. Explicit
-- owner refreshes remain possible, but both paths use revision compare-and-set.
revoke execute on function public.refresh_active_playlist_shares(text, text, jsonb) from authenticated;

drop function if exists public.refresh_playlist_share(uuid, text, text, text, jsonb);
create function public.refresh_playlist_share(
  p_share_id uuid,
  p_expected_revision bigint,
  p_playlist_name text,
  p_playlist_description text,
  p_playlist_image_url text,
  p_tracks jsonb
) returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share public.playlist_shares%rowtype;
  v_snapshot_hash text;
  v_revision bigint;
begin
  select * into v_share from public.playlist_shares where id = p_share_id for update;
  if not found or v_share.owner_user_id <> auth.uid() or v_share.revoked_at is not null then
    raise exception 'The active share was not found or is not owned by this user.';
  end if;
  if v_share.revision <> p_expected_revision then
    raise exception 'The shared playlist changed. Reload it before publishing again.';
  end if;
  perform private.assert_playlist_share_payload(p_tracks);
  v_snapshot_hash := encode(digest(convert_to(coalesce(p_tracks, '[]'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');
  v_revision := v_share.revision;
  if v_snapshot_hash <> v_share.snapshot_hash then
    delete from public.playlist_share_tracks where share_id = p_share_id;
    perform private.insert_playlist_share_tracks(p_share_id, p_tracks);
    v_revision := v_revision + 1;
  end if;
  update public.playlist_shares
  set playlist_name = left(trim(p_playlist_name), 100),
      playlist_description = left(coalesce(p_playlist_description, ''), 300),
      playlist_image_url = coalesce(p_playlist_image_url, playlist_image_url),
      snapshot_hash = v_snapshot_hash,
      track_count = (select count(*)::integer from public.playlist_share_tracks where share_id = p_share_id),
      revision = v_revision,
      updated_at = now()
  where id = p_share_id;
  return v_revision;
end;
$$;
revoke all on function public.refresh_playlist_share(uuid, bigint, text, text, text, jsonb) from public;
grant execute on function public.refresh_playlist_share(uuid, bigint, text, text, text, jsonb) to authenticated;

create function public.refresh_playlist_share_from_worker(
  p_share_id uuid,
  p_expected_revision bigint,
  p_playlist_name text,
  p_playlist_description text,
  p_playlist_image_url text,
  p_tracks jsonb
) returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share public.playlist_shares%rowtype;
  v_snapshot_hash text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;
  select * into v_share from public.playlist_shares where id = p_share_id for update;
  if not found or v_share.revoked_at is not null or v_share.revision <> p_expected_revision then return false; end if;
  perform private.assert_playlist_share_payload(p_tracks);
  v_snapshot_hash := encode(digest(convert_to(coalesce(p_tracks, '[]'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');
  if v_snapshot_hash <> v_share.snapshot_hash then
    delete from public.playlist_share_tracks where share_id = p_share_id;
    perform private.insert_playlist_share_tracks(p_share_id, p_tracks);
  end if;
  update public.playlist_shares
  set playlist_name = left(trim(p_playlist_name), 100),
      playlist_description = case when source_playlist_id = 'fav' then playlist_description else left(coalesce(p_playlist_description, ''), 300) end,
      playlist_image_url = case when source_playlist_id = 'fav' then playlist_image_url else coalesce(p_playlist_image_url, '') end,
      snapshot_hash = v_snapshot_hash,
      track_count = (select count(*)::integer from public.playlist_share_tracks where share_id = p_share_id),
      revision = revision + case when v_snapshot_hash <> v_share.snapshot_hash then 1 else 0 end,
      updated_at = now()
  where id = p_share_id;
  return true;
end;
$$;
revoke all on function public.refresh_playlist_share_from_worker(uuid, bigint, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.refresh_playlist_share_from_worker(uuid, bigint, text, text, text, jsonb) to service_role;

alter table public.playlist_share_downloads
  add column sync_lease_token uuid,
  add column sync_lease_expires_at timestamptz;

create function private.prevent_applied_revision_regression()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.applied_revision < old.applied_revision then
    raise exception 'Applied playlist revisions cannot move backwards.';
  end if;
  return new;
end;
$$;
create trigger prevent_playlist_share_revision_regression
before update on public.playlist_share_downloads
for each row execute function private.prevent_applied_revision_regression();

create function public.claim_playlist_share_sync(
  p_share_id uuid,
  p_recipient_user_id uuid,
  p_expected_source_revision bigint,
  p_expected_applied_revision bigint,
  p_lease_token uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid := case when auth.role() = 'service_role' then p_recipient_user_id else auth.uid() end;
  v_source_revision bigint;
begin
  if v_recipient is null or p_lease_token is null then return false; end if;
  select revision into v_source_revision from public.playlist_shares
  where id = p_share_id and recipient_user_id = v_recipient and revoked_at is null for update;
  if not found or v_source_revision <> p_expected_source_revision then return false; end if;
  update public.playlist_share_downloads
  set sync_lease_token = p_lease_token,
      sync_lease_expires_at = now() + interval '10 minutes'
  where share_id = p_share_id
    and recipient_user_id = v_recipient
    and applied_revision = p_expected_applied_revision
    and applied_revision < p_expected_source_revision
    and (sync_lease_expires_at is null or sync_lease_expires_at <= now() or sync_lease_token = p_lease_token);
  return found;
end;
$$;

create function public.complete_playlist_share_sync(
  p_share_id uuid,
  p_recipient_user_id uuid,
  p_expected_source_revision bigint,
  p_expected_applied_revision bigint,
  p_lease_token uuid,
  p_spotify_playlist_id text,
  p_spotify_playlist_url text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid := case when auth.role() = 'service_role' then p_recipient_user_id else auth.uid() end;
begin
  if nullif(trim(p_spotify_playlist_id), '') is null then raise exception 'A Spotify playlist ID is required.'; end if;
  perform 1 from public.playlist_shares
  where id = p_share_id and recipient_user_id = v_recipient and revoked_at is null
    and revision = p_expected_source_revision for update;
  if not found then return false; end if;
  update public.playlist_share_downloads
  set spotify_playlist_id = trim(p_spotify_playlist_id),
      spotify_playlist_url = coalesce(p_spotify_playlist_url, ''),
      applied_revision = p_expected_source_revision,
      sync_lease_token = null,
      sync_lease_expires_at = null,
      updated_at = now()
  where share_id = p_share_id and recipient_user_id = v_recipient
    and applied_revision = p_expected_applied_revision
    and sync_lease_token = p_lease_token and sync_lease_expires_at > now();
  return found;
end;
$$;

create function public.release_playlist_share_sync(
  p_share_id uuid,
  p_recipient_user_id uuid,
  p_lease_token uuid
) returns void
language sql
security definer
set search_path = public
as $$
  update public.playlist_share_downloads
  set sync_lease_token = null, sync_lease_expires_at = null
  where share_id = p_share_id
    and recipient_user_id = case when auth.role() = 'service_role' then p_recipient_user_id else auth.uid() end
    and sync_lease_token = p_lease_token;
$$;

revoke all on function public.claim_playlist_share_sync(uuid, uuid, bigint, bigint, uuid) from public;
revoke all on function public.complete_playlist_share_sync(uuid, uuid, bigint, bigint, uuid, text, text) from public;
revoke all on function public.release_playlist_share_sync(uuid, uuid, uuid) from public;
grant execute on function public.claim_playlist_share_sync(uuid, uuid, bigint, bigint, uuid) to authenticated, service_role;
grant execute on function public.complete_playlist_share_sync(uuid, uuid, bigint, bigint, uuid, text, text) to authenticated, service_role;
grant execute on function public.release_playlist_share_sync(uuid, uuid, uuid) to authenticated, service_role;

create or replace function public.record_playlist_share_download(
  p_share_id uuid,
  p_spotify_playlist_id text,
  p_spotify_playlist_url text,
  p_applied_revision bigint
) returns void
language plpgsql security definer set search_path = public as $$
declare v_share public.playlist_shares%rowtype;
begin
  select * into v_share from public.playlist_shares
  where id = p_share_id and recipient_user_id = auth.uid() and revoked_at is null for update;
  if not found then raise exception 'The active shared playlist is unavailable.'; end if;
  if nullif(trim(p_spotify_playlist_id), '') is null then raise exception 'A Spotify playlist ID is required.'; end if;
  if p_applied_revision < 0 or p_applied_revision > v_share.revision then raise exception 'The applied revision is invalid.'; end if;
  insert into public.playlist_share_downloads(
    share_id, recipient_user_id, spotify_playlist_id, spotify_playlist_url, applied_revision
  ) values (p_share_id, auth.uid(), trim(p_spotify_playlist_id), coalesce(p_spotify_playlist_url, ''), p_applied_revision)
  on conflict (share_id, recipient_user_id) do update set
    spotify_playlist_id = case when excluded.applied_revision >= playlist_share_downloads.applied_revision then excluded.spotify_playlist_id else playlist_share_downloads.spotify_playlist_id end,
    spotify_playlist_url = case when excluded.applied_revision >= playlist_share_downloads.applied_revision then excluded.spotify_playlist_url else playlist_share_downloads.spotify_playlist_url end,
    applied_revision = greatest(playlist_share_downloads.applied_revision, excluded.applied_revision),
    updated_at = case when excluded.applied_revision >= playlist_share_downloads.applied_revision then now() else playlist_share_downloads.updated_at end;
end;
$$;

comment on function public.refresh_playlist_share_from_worker(uuid, bigint, text, text, text, jsonb) is
  'Authoritative background source publisher. Expected revision prevents stale Spotify reads from overwriting newer snapshots.';
comment on function public.claim_playlist_share_sync(uuid, uuid, bigint, bigint, uuid) is
  'Serializes Spotify side effects per recipient playlist and binds completion to exact source and applied revisions.';

-- Song League uses the Edge Function as its only Spotify mutation
-- implementation. A transaction-safe lease survives PostgREST connection
-- pooling, unlike session advisory locks.
create table private.song_league_playlist_sync_leases (
  league_id uuid primary key references public.song_leagues(id) on delete cascade,
  lease_token uuid not null,
  lease_expires_at timestamptz not null
);

revoke execute on function public.try_lock_song_league_playlist_sync(uuid) from service_role;
revoke execute on function public.unlock_song_league_playlist_sync(uuid) from service_role;

create function public.claim_song_league_playlist_sync(
  p_league_id uuid,
  p_lease_token uuid
) returns boolean
language plpgsql security definer set search_path = public, private as $$
begin
  if auth.role() <> 'service_role' or p_lease_token is null then return false; end if;
  insert into private.song_league_playlist_sync_leases(league_id, lease_token, lease_expires_at)
  values (p_league_id, p_lease_token, now() + interval '10 minutes')
  on conflict (league_id) do update
  set lease_token = excluded.lease_token, lease_expires_at = excluded.lease_expires_at
  where song_league_playlist_sync_leases.lease_expires_at <= now()
     or song_league_playlist_sync_leases.lease_token = excluded.lease_token;
  return found;
end;
$$;

create function public.release_song_league_playlist_sync(
  p_league_id uuid,
  p_lease_token uuid
) returns void
language sql security definer set search_path = public, private as $$
  delete from private.song_league_playlist_sync_leases
  where league_id = p_league_id and lease_token = p_lease_token;
$$;

create function public.complete_song_league_playlist_sync(
  p_league_id uuid,
  p_user_id uuid,
  p_expected_source_revision bigint,
  p_expected_applied_revision bigint,
  p_expected_round_id uuid,
  p_lease_token uuid,
  p_spotify_playlist_id text,
  p_spotify_playlist_url text
) returns boolean
language plpgsql security definer set search_path = public, private as $$
declare v_current_revision bigint;
declare v_current_round_id uuid;
begin
  if auth.role() <> 'service_role' then return false; end if;
  if nullif(trim(p_spotify_playlist_id), '') is null then raise exception 'A Spotify playlist ID is required.'; end if;
  select league.playlist_revision, round.id
  into v_current_revision, v_current_round_id
  from public.song_leagues league
  left join public.song_league_rounds round
    on round.league_id = league.id
   and round.starts_at = private.song_league_friday_start(league.timezone, now())
  where league.id = p_league_id and league.closed_at is null
  for update of league;
  if not found or v_current_revision <> p_expected_source_revision
    or v_current_round_id is distinct from p_expected_round_id then return false; end if;
  if not exists (
    select 1 from private.song_league_playlist_sync_leases
    where league_id = p_league_id and lease_token = p_lease_token and lease_expires_at > now()
  ) then return false; end if;
  if p_expected_applied_revision = 0 and not exists (
    select 1 from public.song_league_playlists where league_id = p_league_id and user_id = p_user_id
  ) then
    insert into public.song_league_playlists(
      league_id, user_id, spotify_playlist_id, spotify_playlist_url,
      last_synced_revision, last_synced_round_id, last_synced_at, last_error, updated_at
    ) values (
      p_league_id, p_user_id, trim(p_spotify_playlist_id), coalesce(p_spotify_playlist_url, ''),
      p_expected_source_revision, p_expected_round_id, now(), null, now()
    );
    return true;
  end if;
  update public.song_league_playlists
  set spotify_playlist_id = trim(p_spotify_playlist_id),
      spotify_playlist_url = coalesce(p_spotify_playlist_url, ''),
      last_synced_revision = p_expected_source_revision,
      last_synced_round_id = p_expected_round_id,
      last_synced_at = now(),
      last_error = null,
      updated_at = now()
  where league_id = p_league_id and user_id = p_user_id
    and last_synced_revision = p_expected_applied_revision;
  return found;
end;
$$;

create function private.prevent_song_league_revision_regression()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.last_synced_revision < old.last_synced_revision then
    raise exception 'Song League playlist revisions cannot move backwards.';
  end if;
  return new;
end;
$$;
create trigger prevent_song_league_playlist_revision_regression
before update on public.song_league_playlists
for each row execute function private.prevent_song_league_revision_regression();

revoke all on function public.claim_song_league_playlist_sync(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_song_league_playlist_sync(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_song_league_playlist_sync(uuid, uuid, bigint, bigint, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_song_league_playlist_sync(uuid, uuid) to service_role;
grant execute on function public.release_song_league_playlist_sync(uuid, uuid) to service_role;
grant execute on function public.complete_song_league_playlist_sync(uuid, uuid, bigint, bigint, uuid, uuid, text, text)
  to service_role;

comment on table private.song_league_playlist_sync_leases is
  'Transaction-safe per-league serialization for the authoritative playlist-sync Edge Function.';

notify pgrst, 'reload schema';
