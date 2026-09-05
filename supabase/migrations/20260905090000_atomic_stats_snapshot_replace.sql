-- Replace one daily ranking snapshot atomically. Browser refreshes and the
-- scheduled sync worker can overlap, so the lock must live in Postgres rather
-- than in either process.
create or replace function public.replace_stats_snapshot(
  p_user_id uuid,
  p_range text,
  p_snapshot_date date,
  p_explicit_percentage numeric,
  p_genre_diversity integer,
  p_tracks jsonb,
  p_artists jsonb,
  p_genres jsonb,
  p_fetched_at timestamptz
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_snapshot_id uuid;
  v_role text := coalesce(auth.role(), '');
begin
  if auth.uid() is null and v_role <> 'service_role' then
    raise exception 'Authentication is required.';
  end if;
  if auth.uid() is not null
    and p_user_id <> auth.uid()
    and p_user_id <> public.get_dev_uuid(auth.uid()) then
    raise exception 'The snapshot does not belong to this session.';
  end if;
  if p_range not in ('short_term', 'medium_term', 'long_term') then
    raise exception 'The stats range is invalid.';
  end if;
  if jsonb_typeof(coalesce(p_tracks, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_artists, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_genres, '[]'::jsonb)) <> 'array' then
    raise exception 'Snapshot ranking data must be arrays.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_user_id::text || ':' || p_range || ':' || p_snapshot_date::text,
    0
  ));

  insert into public.stats_snapshots(
    user_id, range, snapshot_date, explicit_percentage, genre_diversity
  ) values (
    p_user_id, p_range, p_snapshot_date,
    coalesce(p_explicit_percentage, 0), coalesce(p_genre_diversity, 0)
  )
  on conflict (user_id, range, snapshot_date) do update set
    explicit_percentage = excluded.explicit_percentage,
    genre_diversity = excluded.genre_diversity
  returning id into v_snapshot_id;

  delete from public.stats_snapshot_tracks where snapshot_id = v_snapshot_id;
  delete from public.stats_snapshot_artists where snapshot_id = v_snapshot_id;
  delete from public.stats_snapshot_genres where snapshot_id = v_snapshot_id;

  insert into public.stats_snapshot_tracks(snapshot_id, track_id, rank)
  select v_snapshot_id, item.track_id, item.rank
  from jsonb_to_recordset(coalesce(p_tracks, '[]'::jsonb))
    as item(track_id text, rank integer)
  where item.track_id is not null and item.rank between 1 and 100;

  insert into public.stats_snapshot_artists(snapshot_id, artist_id, rank)
  select v_snapshot_id, item.artist_id, item.rank
  from jsonb_to_recordset(coalesce(p_artists, '[]'::jsonb))
    as item(artist_id text, rank integer)
  where item.artist_id is not null and item.rank between 1 and 50;

  insert into public.genres(name)
  select distinct item.genre_name
  from jsonb_to_recordset(coalesce(p_genres, '[]'::jsonb))
    as item(genre_name text, rank integer, weight numeric)
  where nullif(trim(item.genre_name), '') is not null
  on conflict (name) do nothing;

  insert into public.stats_snapshot_genres(snapshot_id, genre_name, rank, weight)
  select v_snapshot_id, item.genre_name, item.rank, round(coalesce(item.weight, 0))::integer
  from jsonb_to_recordset(coalesce(p_genres, '[]'::jsonb))
    as item(genre_name text, rank integer, weight numeric)
  where nullif(trim(item.genre_name), '') is not null and item.rank between 1 and 15;

  delete from public.user_top_tracks_history
  where user_id = p_user_id and time_range = p_range and fetched_at = p_fetched_at;
  delete from public.user_top_artists_history
  where user_id = p_user_id and time_range = p_range and fetched_at = p_fetched_at;

  insert into public.user_top_tracks_history(user_id, time_range, rank, track_id, fetched_at)
  select p_user_id, p_range, item.rank, item.track_id, p_fetched_at
  from jsonb_to_recordset(coalesce(p_tracks, '[]'::jsonb))
    as item(track_id text, rank integer)
  where item.track_id is not null and item.rank between 1 and 100;

  insert into public.user_top_artists_history(user_id, time_range, rank, artist_id, fetched_at)
  select p_user_id, p_range, item.rank, item.artist_id, p_fetched_at
  from jsonb_to_recordset(coalesce(p_artists, '[]'::jsonb))
    as item(artist_id text, rank integer)
  where item.artist_id is not null and item.rank between 1 and 50;

  return v_snapshot_id;
end;
$$;

revoke all on function public.replace_stats_snapshot(
  uuid, text, date, numeric, integer, jsonb, jsonb, jsonb, timestamptz
) from public;
grant execute on function public.replace_stats_snapshot(
  uuid, text, date, numeric, integer, jsonb, jsonb, jsonb, timestamptz
) to authenticated, service_role;
