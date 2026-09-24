-- Playlist snapshots have no application-level song-count limit. Uploads stay
-- bounded per request so large libraries are still transferred safely.

alter table public.playlist_share_tracks
  drop constraint if exists playlist_share_tracks_resource_bounds;
alter table public.playlist_share_tracks
  add constraint playlist_share_tracks_resource_bounds
  check (position >= 0 and octet_length(track::text) <= 32768) not valid;

alter table private.playlist_share_upload_tracks
  drop constraint if exists playlist_share_upload_tracks_position_check;
alter table private.playlist_share_upload_tracks
  add constraint playlist_share_upload_tracks_position_check check (position >= 0);

create or replace function private.assert_playlist_share_payload(p_tracks jsonb)
returns void language plpgsql immutable security definer set search_path = pg_catalog
as $$
begin
  if p_tracks is null or jsonb_typeof(p_tracks) <> 'array' then
    raise exception 'Tracks must be a JSON array.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tracks) item
    where jsonb_typeof(item) <> 'object' or octet_length(item::text) > 32768
      or nullif(item->>'id', '') is null or length(item->>'id') > 128
  ) then
    raise exception 'Every shared track must be a bounded object with a valid ID.';
  end if;
end;
$$;

create or replace function public.append_playlist_share_upload_chunk(
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
  if v_count > 250 or octet_length(p_tracks::text) > 500000 then
    raise exception 'Playlist upload chunks are limited to 250 tracks and 500 KB.';
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

create or replace function private.validate_playlist_share_upload(p_upload_id uuid, p_expected_track_count integer)
returns text
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare v_count integer; v_min integer; v_max integer; v_hash text;
begin
  if p_expected_track_count < 0 then
    raise exception 'The expected playlist song count cannot be negative.';
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
