alter table public.stats_snapshots
  add column if not exists revision bigint not null default 1,
  add column if not exists last_idempotency_key text;
alter table public.stats_snapshots drop constraint if exists stats_snapshots_revision_check;
alter table public.stats_snapshots add constraint stats_snapshots_revision_check check (revision > 0);
create unique index if not exists stats_snapshots_idempotency_idx
  on public.stats_snapshots(user_id, range, last_idempotency_key)
  where last_idempotency_key is not null;

create or replace function public.replace_stats_snapshot_v2(
  p_user_id uuid,
  p_range text,
  p_snapshot_date date,
  p_explicit_percentage numeric,
  p_genre_diversity integer,
  p_tracks jsonb,
  p_artists jsonb,
  p_genres jsonb,
  p_fetched_at timestamptz,
  p_idempotency_key text,
  p_expected_revision bigint
) returns table(snapshot_id uuid, revision bigint)
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_existing public.stats_snapshots%rowtype; v_snapshot_id uuid;
begin
  if length(coalesce(p_idempotency_key, '')) not between 16 and 200 then
    raise exception 'A bounded idempotency key is required.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':' || p_range || ':' || p_snapshot_date::text, 0
  ));
  select * into v_existing from public.stats_snapshots
  where user_id = p_user_id and range = p_range and snapshot_date = p_snapshot_date
  for update;
  if found and v_existing.last_idempotency_key = p_idempotency_key then
    return query select v_existing.id, v_existing.revision;
    return;
  end if;
  if coalesce(v_existing.revision, 0) <> coalesce(p_expected_revision, 0) then
    raise exception using errcode = '40001', message = 'The stats snapshot changed before this replacement committed.';
  end if;

  v_snapshot_id := public.replace_stats_snapshot(
    p_user_id, p_range, p_snapshot_date, p_explicit_percentage,
    p_genre_diversity, p_tracks, p_artists, p_genres, p_fetched_at
  );
  update public.stats_snapshots set
    revision = coalesce(v_existing.revision, 0) + 1,
    last_idempotency_key = p_idempotency_key
  where id = v_snapshot_id
  returning stats_snapshots.revision into revision;
  snapshot_id := v_snapshot_id;
  return next;
end;
$$;

revoke all on function public.replace_stats_snapshot_v2(
  uuid, text, date, numeric, integer, jsonb, jsonb, jsonb, timestamptz, text, bigint
) from public;
grant execute on function public.replace_stats_snapshot_v2(
  uuid, text, date, numeric, integer, jsonb, jsonb, jsonb, timestamptz, text, bigint
) to authenticated, service_role;

create table if not exists public.catalog_write_versions (
  resource_key text primary key check (length(resource_key) between 16 and 200),
  revision bigint not null default 0 check (revision >= 0),
  last_idempotency_key text,
  updated_at timestamptz not null default now()
);
alter table public.catalog_write_versions enable row level security;
revoke all on public.catalog_write_versions from public, anon, authenticated;
grant all on public.catalog_write_versions to service_role;

create or replace function public.replace_spotify_catalog(
  p_resource_key text,
  p_expected_revision bigint,
  p_idempotency_key text,
  p_artists jsonb default '[]'::jsonb,
  p_albums jsonb default '[]'::jsonb,
  p_tracks jsonb default '[]'::jsonb,
  p_album_artists jsonb default '[]'::jsonb,
  p_track_artists jsonb default '[]'::jsonb
) returns bigint
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_version public.catalog_write_versions%rowtype; v_next bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Catalog replacement is restricted to the trusted worker.';
  end if;
  if length(coalesce(p_resource_key, '')) not between 16 and 200
    or length(coalesce(p_idempotency_key, '')) not between 16 and 200 then
    raise exception 'Catalog replacement keys are invalid.';
  end if;
  if jsonb_typeof(p_artists) <> 'array' or jsonb_array_length(p_artists) > 500
    or jsonb_typeof(p_albums) <> 'array' or jsonb_array_length(p_albums) > 500
    or jsonb_typeof(p_tracks) <> 'array' or jsonb_array_length(p_tracks) > 1000
    or jsonb_typeof(p_album_artists) <> 'array' or jsonb_array_length(p_album_artists) > 2000
    or jsonb_typeof(p_track_artists) <> 'array' or jsonb_array_length(p_track_artists) > 4000 then
    raise exception 'Catalog replacement payload is invalid or too large.';
  end if;

  insert into public.catalog_write_versions(resource_key) values (p_resource_key)
  on conflict (resource_key) do nothing;
  select * into v_version from public.catalog_write_versions
  where resource_key = p_resource_key for update;
  if v_version.last_idempotency_key = p_idempotency_key then return v_version.revision; end if;
  if v_version.revision <> coalesce(p_expected_revision, 0) then
    raise exception using errcode = '40001', message = 'The catalog resource changed before this replacement committed.';
  end if;

  insert into public.artists(id, name, image_url, spotify_url, last_updated)
  select item.id, item.name, item.image_url, item.spotify_url, coalesce(item.last_updated, now())
  from jsonb_to_recordset(p_artists) as item(id text, name text, image_url text, spotify_url text, last_updated timestamptz)
  on conflict (id) do update set name = excluded.name, image_url = excluded.image_url,
    spotify_url = excluded.spotify_url, last_updated = excluded.last_updated;

  insert into public.albums(id, name, album_type, total_tracks, release_date,
    release_date_precision, image_url, spotify_url, upc, ean, restriction_reason, last_updated)
  select item.id, item.name, item.album_type, item.total_tracks, item.release_date,
    item.release_date_precision, item.image_url, item.spotify_url, item.upc, item.ean,
    item.restriction_reason, coalesce(item.last_updated, now())
  from jsonb_to_recordset(p_albums) as item(id text, name text, album_type text,
    total_tracks integer, release_date date, release_date_precision text, image_url text,
    spotify_url text, upc text, ean text, restriction_reason text, last_updated timestamptz)
  on conflict (id) do update set name = excluded.name, album_type = excluded.album_type,
    total_tracks = excluded.total_tracks, release_date = excluded.release_date,
    release_date_precision = excluded.release_date_precision, image_url = excluded.image_url,
    spotify_url = excluded.spotify_url, upc = excluded.upc, ean = excluded.ean,
    restriction_reason = excluded.restriction_reason, last_updated = excluded.last_updated;

  insert into public.tracks(id, name, album_id, duration_ms, explicit, spotify_url,
    track_number, disc_number, is_playable, is_local, isrc, restriction_reason, last_updated)
  select item.id, item.name, item.album_id, item.duration_ms, item.explicit, item.spotify_url,
    item.track_number, item.disc_number, item.is_playable, item.is_local, item.isrc,
    item.restriction_reason, coalesce(item.last_updated, now())
  from jsonb_to_recordset(p_tracks) as item(id text, name text, album_id text,
    duration_ms integer, explicit boolean, spotify_url text, track_number integer,
    disc_number integer, is_playable boolean, is_local boolean, isrc text,
    restriction_reason text, last_updated timestamptz)
  on conflict (id) do update set name = excluded.name, album_id = excluded.album_id,
    duration_ms = excluded.duration_ms, explicit = excluded.explicit,
    spotify_url = excluded.spotify_url, track_number = excluded.track_number,
    disc_number = excluded.disc_number, is_playable = excluded.is_playable,
    is_local = excluded.is_local, isrc = excluded.isrc,
    restriction_reason = excluded.restriction_reason, last_updated = excluded.last_updated;

  delete from public.album_artists relation
  where relation.album_id in (select item.id from jsonb_to_recordset(p_albums) as item(id text));
  insert into public.album_artists(album_id, artist_id)
  select relation.album_id, relation.artist_id
  from jsonb_to_recordset(p_album_artists) as relation(album_id text, artist_id text)
  on conflict do nothing;

  delete from public.track_artists relation
  where relation.track_id in (select item.id from jsonb_to_recordset(p_tracks) as item(id text));
  insert into public.track_artists(track_id, artist_id, artist_rank)
  select relation.track_id, relation.artist_id, relation.artist_rank
  from jsonb_to_recordset(p_track_artists) as relation(track_id text, artist_id text, artist_rank integer)
  on conflict do nothing;

  v_next := v_version.revision + 1;
  update public.catalog_write_versions set revision = v_next,
    last_idempotency_key = p_idempotency_key, updated_at = now()
  where resource_key = p_resource_key;
  return v_next;
end;
$$;

revoke all on function public.replace_spotify_catalog(
  text, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public;
grant execute on function public.replace_spotify_catalog(
  text, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;
