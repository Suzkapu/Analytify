-- Large playlist snapshots are staged in bounded chunks and published atomically.
-- The live playlist_share_tracks rows are never partially replaced.

create table private.playlist_share_uploads (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  share_id uuid references public.playlist_shares(id) on delete cascade,
  expected_revision bigint,
  source_playlist_id text,
  playlist_name text not null,
  playlist_description text not null default '',
  playlist_image_url text not null default '',
  owner_display_name text,
  owner_image_url text,
  token_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 hour',
  check ((share_id is null and expected_revision is null and source_playlist_id is not null and token_hash is not null)
    or (share_id is not null and expected_revision is not null and source_playlist_id is null and token_hash is null))
);

create table private.playlist_share_upload_tracks (
  upload_id uuid not null references private.playlist_share_uploads(id) on delete cascade,
  position integer not null check (position >= 0 and position < 5000),
  track_id text not null check (length(track_id) between 1 and 128),
  track jsonb not null check (jsonb_typeof(track) = 'object' and octet_length(track::text) <= 32768),
  primary key (upload_id, position)
);

create index playlist_share_uploads_expiry_idx on private.playlist_share_uploads(expires_at);

revoke all on private.playlist_share_uploads from public, anon, authenticated;
revoke all on private.playlist_share_upload_tracks from public, anon, authenticated;

create function private.assert_playlist_share_upload_access(p_upload_id uuid)
returns private.playlist_share_uploads
language plpgsql
security definer
set search_path = public, private
as $$
declare v_upload private.playlist_share_uploads%rowtype;
begin
  select * into v_upload from private.playlist_share_uploads where id = p_upload_id for update;
  if not found or v_upload.expires_at <= now() then
    raise exception 'This playlist upload expired. Start the upload again.';
  end if;
  if auth.role() <> 'service_role' and v_upload.owner_user_id <> auth.uid() then
    raise exception 'This playlist upload is not owned by the current user.';
  end if;
  return v_upload;
end;
$$;
revoke all on function private.assert_playlist_share_upload_access(uuid) from public, anon, authenticated;

create function public.begin_playlist_share_create_upload(
  p_source_playlist_id text,
  p_playlist_name text,
  p_playlist_description text,
  p_playlist_image_url text,
  p_owner_display_name text,
  p_owner_image_url text,
  p_claim_token text
) returns uuid
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare v_upload_id uuid; v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if nullif(trim(p_source_playlist_id), '') is null or nullif(trim(p_playlist_name), '') is null then
    raise exception 'Playlist ID and name are required.';
  end if;
  if length(coalesce(p_claim_token, '')) < 32 then raise exception 'The claim token is invalid.'; end if;
  delete from private.playlist_share_uploads where expires_at <= now();
  insert into private.playlist_share_uploads(
    owner_user_id, source_playlist_id, playlist_name, playlist_description, playlist_image_url,
    owner_display_name, owner_image_url, token_hash
  ) values (
    v_user_id, trim(p_source_playlist_id), left(trim(p_playlist_name), 100),
    left(coalesce(p_playlist_description, ''), 300), coalesce(p_playlist_image_url, ''),
    left(coalesce(nullif(trim(p_owner_display_name), ''), 'Spotify user'), 120),
    coalesce(p_owner_image_url, ''),
    encode(digest(convert_to(p_claim_token, 'UTF8'), 'sha256'), 'hex')
  ) returning id into v_upload_id;
  return v_upload_id;
end;
$$;
revoke all on function public.begin_playlist_share_create_upload(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.begin_playlist_share_create_upload(text, text, text, text, text, text, text) to authenticated;

create function public.begin_playlist_share_refresh_upload(
  p_share_id uuid,
  p_expected_revision bigint,
  p_playlist_name text,
  p_playlist_description text,
  p_playlist_image_url text
) returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare v_upload_id uuid; v_share public.playlist_shares%rowtype;
begin
  select * into v_share from public.playlist_shares where id = p_share_id;
  if not found or v_share.revoked_at is not null
    or (auth.role() <> 'service_role' and v_share.owner_user_id <> auth.uid()) then
    raise exception 'The active share was not found or is not owned by this user.';
  end if;
  if v_share.revision <> p_expected_revision then
    raise exception 'The shared playlist changed. Reload it before publishing again.';
  end if;
  insert into private.playlist_share_uploads(
    owner_user_id, share_id, expected_revision, playlist_name, playlist_description, playlist_image_url
  ) values (
    v_share.owner_user_id, p_share_id, p_expected_revision, left(trim(p_playlist_name), 100),
    case when v_share.source_playlist_id = 'fav' and auth.role() = 'service_role'
      then v_share.playlist_description else left(coalesce(p_playlist_description, ''), 300) end,
    case when v_share.source_playlist_id = 'fav' and auth.role() = 'service_role'
      then v_share.playlist_image_url else coalesce(p_playlist_image_url, v_share.playlist_image_url) end
  ) returning id into v_upload_id;
  return v_upload_id;
end;
$$;
revoke all on function public.begin_playlist_share_refresh_upload(uuid, bigint, text, text, text) from public, anon;
grant execute on function public.begin_playlist_share_refresh_upload(uuid, bigint, text, text, text) to authenticated, service_role;

create function public.append_playlist_share_upload_chunk(
  p_upload_id uuid,
  p_offset integer,
  p_tracks jsonb
) returns integer
language plpgsql
security definer
set search_path = public, private
as $$
declare v_count integer;
begin
  perform private.assert_playlist_share_upload_access(p_upload_id);
  if p_offset < 0 or p_tracks is null or jsonb_typeof(p_tracks) <> 'array' then
    raise exception 'A valid playlist upload offset and track array are required.';
  end if;
  v_count := jsonb_array_length(p_tracks);
  if v_count > 250 or p_offset + v_count > 5000 or octet_length(p_tracks::text) > 500000 then
    raise exception 'Playlist upload chunks are limited to 250 tracks, 500 KB, and 5000 total tracks.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tracks) item
    where jsonb_typeof(item) <> 'object' or octet_length(item::text) > 32768
      or nullif(item->>'id', '') is null or length(item->>'id') > 128
  ) then
    raise exception 'Every shared track must be a bounded object with a valid ID.';
  end if;
  insert into private.playlist_share_upload_tracks(upload_id, position, track_id, track)
  select p_upload_id, p_offset + ordinality::integer - 1, item->>'id', item
  from jsonb_array_elements(p_tracks) with ordinality as source(item, ordinality)
  on conflict (upload_id, position) do update set track_id = excluded.track_id, track = excluded.track;
  update private.playlist_share_uploads set expires_at = now() + interval '1 hour' where id = p_upload_id;
  return v_count;
end;
$$;
revoke all on function public.append_playlist_share_upload_chunk(uuid, integer, jsonb) from public, anon;
grant execute on function public.append_playlist_share_upload_chunk(uuid, integer, jsonb) to authenticated, service_role;

create function private.validate_playlist_share_upload(p_upload_id uuid, p_expected_track_count integer)
returns text
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare v_count integer; v_min integer; v_max integer; v_hash text;
begin
  if p_expected_track_count < 0 or p_expected_track_count > 5000 then
    raise exception 'Shared playlists are limited to 5000 tracks.';
  end if;
  select count(*)::integer, min(position), max(position) into v_count, v_min, v_max
  from private.playlist_share_upload_tracks where upload_id = p_upload_id;
  if v_count <> p_expected_track_count
    or (v_count > 0 and (v_min <> 0 or v_max <> v_count - 1)) then
    raise exception 'The playlist upload is incomplete. Retry the missing chunks before publishing.';
  end if;
  select encode(digest(convert_to(coalesce(jsonb_agg(track order by position), '[]'::jsonb)::text, 'UTF8'), 'sha256'), 'hex')
  into v_hash from private.playlist_share_upload_tracks where upload_id = p_upload_id;
  return v_hash;
end;
$$;
revoke all on function private.validate_playlist_share_upload(uuid, integer) from public, anon, authenticated;

create function public.commit_playlist_share_create_upload(p_upload_id uuid, p_expected_track_count integer)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare v_upload private.playlist_share_uploads%rowtype; v_share_id uuid; v_hash text;
begin
  v_upload := private.assert_playlist_share_upload_access(p_upload_id);
  if v_upload.share_id is not null then raise exception 'This is not a new playlist share upload.'; end if;
  v_hash := private.validate_playlist_share_upload(p_upload_id, p_expected_track_count);
  insert into public.playlist_shares(
    owner_user_id, source_playlist_id, playlist_name, playlist_description, playlist_image_url,
    owner_display_name, owner_image_url, token_hash, snapshot_hash, track_count
  ) values (
    v_upload.owner_user_id, v_upload.source_playlist_id, v_upload.playlist_name,
    v_upload.playlist_description, v_upload.playlist_image_url, v_upload.owner_display_name,
    v_upload.owner_image_url, v_upload.token_hash, v_hash, p_expected_track_count
  ) returning id into v_share_id;
  insert into public.playlist_share_tracks(share_id, position, track_id, track)
  select v_share_id, position, track_id, track from private.playlist_share_upload_tracks
  where upload_id = p_upload_id order by position;
  delete from private.playlist_share_uploads where id = p_upload_id;
  return v_share_id;
end;
$$;
revoke all on function public.commit_playlist_share_create_upload(uuid, integer) from public, anon;
grant execute on function public.commit_playlist_share_create_upload(uuid, integer) to authenticated;

create function public.commit_playlist_share_refresh_upload(p_upload_id uuid, p_expected_track_count integer)
returns bigint
language plpgsql
security definer
set search_path = public, private
as $$
declare v_upload private.playlist_share_uploads%rowtype; v_share public.playlist_shares%rowtype; v_hash text; v_revision bigint;
begin
  v_upload := private.assert_playlist_share_upload_access(p_upload_id);
  if v_upload.share_id is null then raise exception 'This is not a playlist refresh upload.'; end if;
  select * into v_share from public.playlist_shares where id = v_upload.share_id for update;
  if not found or v_share.revoked_at is not null or v_share.revision <> v_upload.expected_revision then
    raise exception 'The shared playlist changed. Reload it before publishing again.';
  end if;
  v_hash := private.validate_playlist_share_upload(p_upload_id, p_expected_track_count);
  v_revision := v_share.revision;
  if v_hash <> v_share.snapshot_hash then
    delete from public.playlist_share_tracks where share_id = v_share.id;
    insert into public.playlist_share_tracks(share_id, position, track_id, track)
    select v_share.id, position, track_id, track from private.playlist_share_upload_tracks
    where upload_id = p_upload_id order by position;
    v_revision := v_revision + 1;
  end if;
  update public.playlist_shares set
    playlist_name = v_upload.playlist_name,
    playlist_description = v_upload.playlist_description,
    playlist_image_url = v_upload.playlist_image_url,
    snapshot_hash = v_hash,
    track_count = p_expected_track_count,
    revision = v_revision,
    updated_at = now()
  where id = v_share.id;
  delete from private.playlist_share_uploads where id = p_upload_id;
  return v_revision;
end;
$$;
revoke all on function public.commit_playlist_share_refresh_upload(uuid, integer) from public, anon;
grant execute on function public.commit_playlist_share_refresh_upload(uuid, integer) to authenticated, service_role;

create function private.cleanup_playlist_share_uploads()
returns bigint language plpgsql security definer set search_path = private
as $$
declare v_deleted bigint;
begin
  delete from private.playlist_share_uploads where expires_at <= now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function private.cleanup_playlist_share_uploads() from public, anon, authenticated;

select cron.schedule(
  'analytify-playlist-share-upload-retention',
  '17 * * * *',
  $cron$select private.cleanup_playlist_share_uploads();$cron$
)
where not exists (select 1 from cron.job where jobname = 'analytify-playlist-share-upload-retention');

