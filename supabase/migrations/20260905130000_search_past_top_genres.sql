create or replace function public.search_past_top_items(
  p_range text,
  p_kind text,
  p_query text,
  p_limit integer default 20
) returns table(
  kind text,
  item_id text,
  item_name text,
  subtitle text,
  image_url text,
  spotify_url text,
  best_rank integer,
  first_seen date,
  last_seen date,
  appearances integer
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := trim(coalesce(p_query, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 20), 50));
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_range not in ('short_term', 'medium_term', 'long_term') then
    raise exception 'The stats range is invalid.';
  end if;
  if p_kind not in ('track', 'artist', 'genre') then
    raise exception 'The stats item kind is invalid.';
  end if;
  if char_length(v_query) < 2 then return; end if;

  if p_kind = 'track' then
    return query
    with current_snapshot as (
      select snapshot.id
      from public.stats_snapshots snapshot
      where snapshot.user_id = v_user_id and snapshot.range = p_range
      order by snapshot.snapshot_date desc, snapshot.created_at desc
      limit 1
    ), historical as (
      select item.track_id, track.name,
        coalesce(string_agg(distinct artist.name, ', '), 'Unknown artist') as artist_names,
        coalesce(album.image_url, '') as cover,
        coalesce(track.spotify_url, '') as link,
        min(item.rank)::integer as historical_best_rank,
        min(snapshot.snapshot_date) as historical_first_seen,
        max(snapshot.snapshot_date) as historical_last_seen,
        count(distinct snapshot.id)::integer as historical_appearances
      from public.stats_snapshots snapshot
      join public.stats_snapshot_tracks item on item.snapshot_id = snapshot.id
      join public.tracks track on track.id = item.track_id
      left join public.albums album on album.id = track.album_id
      left join public.track_artists relation on relation.track_id = track.id
      left join public.artists artist on artist.id = relation.artist_id
      where snapshot.user_id = v_user_id and snapshot.range = p_range
        and snapshot.id <> coalesce((select id from current_snapshot), '00000000-0000-0000-0000-000000000000'::uuid)
        and (
          track.name ilike '%' || v_query || '%'
          or exists (
            select 1 from public.track_artists matched_relation
            join public.artists matched_artist on matched_artist.id = matched_relation.artist_id
            where matched_relation.track_id = track.id and matched_artist.name ilike '%' || v_query || '%'
          )
        )
        and not exists (
          select 1 from current_snapshot current
          join public.stats_snapshot_tracks current_item on current_item.snapshot_id = current.id
          where current_item.track_id = item.track_id
        )
      group by item.track_id, track.name, album.image_url, track.spotify_url
    )
    select 'track'::text, historical.track_id::text, historical.name::text,
      historical.artist_names::text, historical.cover::text, historical.link::text,
      historical.historical_best_rank, historical.historical_first_seen,
      historical.historical_last_seen, historical.historical_appearances
    from historical
    order by historical.historical_last_seen desc, historical.historical_best_rank, lower(historical.name)
    limit v_limit;
  elsif p_kind = 'artist' then
    return query
    with current_snapshot as (
      select snapshot.id
      from public.stats_snapshots snapshot
      where snapshot.user_id = v_user_id and snapshot.range = p_range
      order by snapshot.snapshot_date desc, snapshot.created_at desc
      limit 1
    )
    select 'artist'::text, artist.id::text, artist.name::text, ''::text,
      coalesce(artist.image_url, '')::text, coalesce(artist.spotify_url, '')::text,
      min(item.rank)::integer, min(snapshot.snapshot_date), max(snapshot.snapshot_date),
      count(distinct snapshot.id)::integer
    from public.stats_snapshots snapshot
    join public.stats_snapshot_artists item on item.snapshot_id = snapshot.id
    join public.artists artist on artist.id = item.artist_id
    where snapshot.user_id = v_user_id and snapshot.range = p_range
      and snapshot.id <> coalesce((select id from current_snapshot), '00000000-0000-0000-0000-000000000000'::uuid)
      and artist.name ilike '%' || v_query || '%'
      and not exists (
        select 1 from current_snapshot current
        join public.stats_snapshot_artists current_item on current_item.snapshot_id = current.id
        where current_item.artist_id = item.artist_id
      )
    group by artist.id, artist.name, artist.image_url, artist.spotify_url
    order by max(snapshot.snapshot_date) desc, min(item.rank), lower(artist.name)
    limit v_limit;
  else
    return query
    with current_snapshot as (
      select snapshot.id
      from public.stats_snapshots snapshot
      where snapshot.user_id = v_user_id and snapshot.range = p_range
      order by snapshot.snapshot_date desc, snapshot.created_at desc
      limit 1
    )
    select 'genre'::text, item.genre_name::text, item.genre_name::text, ''::text,
      ''::text, ''::text, min(item.rank)::integer,
      min(snapshot.snapshot_date), max(snapshot.snapshot_date),
      count(distinct snapshot.id)::integer
    from public.stats_snapshots snapshot
    join public.stats_snapshot_genres item on item.snapshot_id = snapshot.id
    where snapshot.user_id = v_user_id and snapshot.range = p_range
      and snapshot.id <> coalesce((select id from current_snapshot), '00000000-0000-0000-0000-000000000000'::uuid)
      and item.genre_name ilike '%' || v_query || '%'
      and not exists (
        select 1 from current_snapshot current
        join public.stats_snapshot_genres current_item on current_item.snapshot_id = current.id
        where lower(current_item.genre_name) = lower(item.genre_name)
      )
    group by item.genre_name
    order by max(snapshot.snapshot_date) desc, min(item.rank), lower(item.genre_name)
    limit v_limit;
  end if;
end;
$$;

revoke all on function public.search_past_top_items(text, text, text, integer) from public;
grant execute on function public.search_past_top_items(text, text, text, integer) to authenticated;
