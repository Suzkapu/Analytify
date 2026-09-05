do $$
declare v_table text;
begin
  foreach v_table in array array['artists', 'genres', 'albums', 'album_artists', 'tracks', 'track_artists'] loop
    execute format('drop policy if exists "Allow all access to authenticated users" on public.%I', v_table);
    execute format('drop policy if exists "Allow read access to all authenticated users" on public.%I', v_table);
    execute format('drop policy if exists "Authenticated users can read catalog" on public.%I', v_table);
    execute format(
      'create policy "Authenticated users can read catalog" on public.%I for select to authenticated using (true)',
      v_table
    );
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from public, anon, authenticated', v_table);
    execute format('grant select on public.%I to authenticated', v_table);
  end loop;
end $$;

-- Browser ingestion is deliberately insert-only: it can satisfy a user's fact
-- foreign keys, but it cannot rewrite or delete metadata already shared by
-- somebody else. The trusted sync worker remains the only catalog updater.
create or replace function public.ingest_spotify_catalog(
  p_kind text,
  p_items jsonb,
  p_relationships jsonb default '[]'::jsonb
) returns integer
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_inserted integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if p_kind not in ('artists', 'genres', 'albums', 'tracks') then
    raise exception 'Unsupported catalog type.';
  end if;
  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 500
    or jsonb_typeof(coalesce(p_relationships, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_relationships, '[]'::jsonb)) > 2000 then
    raise exception 'Catalog payload is invalid or too large.';
  end if;

  if p_kind = 'artists' then
    insert into public.artists(id, name, image_url, spotify_url, last_updated)
    select item.id, left(coalesce(nullif(trim(item.name), ''), 'Unknown Artist'), 255),
      case when item.image_url ~ '^https://' and length(item.image_url) <= 2048 then item.image_url end,
      item.spotify_url, now()
    from jsonb_to_recordset(p_items) as item(id text, name text, image_url text, spotify_url text)
    where item.id ~ '^[A-Za-z0-9]{1,64}$'
      and (item.spotify_url is null or item.spotify_url ~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?artist/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$')
    on conflict (id) do nothing;
  elsif p_kind = 'genres' then
    insert into public.genres(name)
    select distinct left(trim(value #>> '{}'), 255)
    from jsonb_array_elements(p_items) value
    where length(trim(value #>> '{}')) between 1 and 255
    on conflict (name) do nothing;
  elsif p_kind = 'albums' then
    insert into public.albums(id, name, album_type, total_tracks, release_date,
      release_date_precision, image_url, spotify_url, upc, ean, restriction_reason, last_updated)
    select item.id, left(coalesce(nullif(trim(item.name), ''), 'Unknown Album'), 1000),
      case when item.album_type in ('album', 'single', 'compilation') then item.album_type else 'album' end,
      greatest(1, least(coalesce(item.total_tracks, 1), 10000)),
      case when item.release_date ~ '^\d{4}-\d{2}-\d{2}$' then item.release_date::date end,
      case when item.release_date_precision in ('year', 'month', 'day') then item.release_date_precision else 'year' end,
      case when item.image_url ~ '^https://' and length(item.image_url) <= 2048 then item.image_url end,
      item.spotify_url, left(item.upc, 100), left(item.ean, 100), left(item.restriction_reason, 100), now()
    from jsonb_to_recordset(p_items) as item(id text, name text, album_type text, total_tracks integer,
      release_date text, release_date_precision text, image_url text, spotify_url text,
      upc text, ean text, restriction_reason text)
    where item.id ~ '^[A-Za-z0-9]{1,64}$'
      and (item.spotify_url is null or item.spotify_url ~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?album/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$')
    on conflict (id) do nothing;

    insert into public.album_artists(album_id, artist_id)
    select distinct relation.album_id, relation.artist_id
    from jsonb_to_recordset(p_relationships) as relation(album_id text, artist_id text)
    join public.albums album on album.id = relation.album_id
    join public.artists artist on artist.id = relation.artist_id
    on conflict do nothing;
  elsif p_kind = 'tracks' then
    insert into public.tracks(id, name, album_id, duration_ms, explicit, spotify_url,
      track_number, disc_number, is_playable, is_local, isrc, restriction_reason, last_updated)
    select item.id, left(coalesce(nullif(trim(item.name), ''), 'Unknown Track'), 1000), album.id,
      greatest(0, least(coalesce(item.duration_ms, 0), 86400000)), coalesce(item.explicit, false),
      item.spotify_url, greatest(1, least(coalesce(item.track_number, 1), 10000)),
      greatest(1, least(coalesce(item.disc_number, 1), 1000)), coalesce(item.is_playable, true),
      coalesce(item.is_local, false), left(item.isrc, 100), left(item.restriction_reason, 100), now()
    from jsonb_to_recordset(p_items) as item(id text, name text, album_id text, duration_ms integer,
      explicit boolean, spotify_url text, track_number integer, disc_number integer,
      is_playable boolean, is_local boolean, isrc text, restriction_reason text)
    left join public.albums album on album.id = item.album_id
    where item.id ~ '^[A-Za-z0-9]{1,64}$'
      and (item.spotify_url is null or item.spotify_url ~ '^https://open\.spotify\.com/(intl-[a-z]{2}(-[a-z0-9]{2,4})?/)?track/[A-Za-z0-9_-]{1,100}(\?[^#\s]*)?$')
    on conflict (id) do nothing;

    insert into public.track_artists(track_id, artist_id, artist_rank)
    select distinct on (relation.track_id, relation.artist_rank)
      relation.track_id, relation.artist_id, greatest(0, least(relation.artist_rank, 99))
    from jsonb_to_recordset(p_relationships) as relation(track_id text, artist_id text, artist_rank integer)
    join public.tracks track on track.id = relation.track_id
    join public.artists artist on artist.id = relation.artist_id
    where relation.artist_rank between 0 and 99
    order by relation.track_id, relation.artist_rank, relation.artist_id
    on conflict do nothing;
  end if;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.ingest_spotify_catalog(text, jsonb, jsonb) from public;
grant execute on function public.ingest_spotify_catalog(text, jsonb, jsonb) to authenticated;

-- Shared catalog cleanup must never erase another user's historical facts.
alter table public.listening_history drop constraint if exists listening_history_track_id_fkey;
alter table public.listening_history add constraint listening_history_track_id_fkey
  foreign key (track_id) references public.tracks(id) on delete restrict;
alter table public.stats_snapshot_tracks drop constraint if exists stats_snapshot_tracks_track_id_fkey;
alter table public.stats_snapshot_tracks add constraint stats_snapshot_tracks_track_id_fkey
  foreign key (track_id) references public.tracks(id) on delete restrict;
alter table public.stats_snapshot_artists drop constraint if exists stats_snapshot_artists_artist_id_fkey;
alter table public.stats_snapshot_artists add constraint stats_snapshot_artists_artist_id_fkey
  foreign key (artist_id) references public.artists(id) on delete restrict;
alter table public.user_top_tracks_history drop constraint if exists user_top_tracks_history_track_id_fkey;
alter table public.user_top_tracks_history add constraint user_top_tracks_history_track_id_fkey
  foreign key (track_id) references public.tracks(id) on delete restrict;
alter table public.user_top_artists_history drop constraint if exists user_top_artists_history_artist_id_fkey;
alter table public.user_top_artists_history add constraint user_top_artists_history_artist_id_fkey
  foreign key (artist_id) references public.artists(id) on delete restrict;
