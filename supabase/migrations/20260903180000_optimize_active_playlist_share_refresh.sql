-- Refresh every active copy of a source playlist in one set-based operation.
-- The previous implementation parsed and inserted the same JSON once per share,
-- which could exceed the hosted statement timeout for large playlists.
create or replace function public.refresh_active_playlist_shares(
  p_source_playlist_id text,
  p_playlist_name text,
  p_tracks jsonb
) returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_snapshot_hash text;
  v_share_ids uuid[] := array[]::uuid[];
  v_changed_share_ids uuid[] := array[]::uuid[];
  v_share_count integer := 0;
  v_inserted_count integer := 0;
  v_track_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if nullif(trim(p_source_playlist_id), '') is null
    or nullif(trim(p_playlist_name), '') is null then
    raise exception 'Playlist ID and name are required.';
  end if;
  if jsonb_typeof(coalesce(p_tracks, '[]'::jsonb)) <> 'array' then
    raise exception 'Tracks must be a JSON array.';
  end if;

  v_snapshot_hash := encode(
    digest(convert_to(coalesce(p_tracks, '[]'::jsonb)::text, 'UTF8'), 'sha256'),
    'hex'
  );

  -- Serialize concurrent refreshes for this owner's active copies.
  perform 1
  from public.playlist_shares
  where owner_user_id = v_user_id
    and source_playlist_id = p_source_playlist_id
    and revoked_at is null
  for update;

  select
    coalesce(array_agg(id order by id), array[]::uuid[]),
    coalesce(
      array_agg(id order by id) filter (where snapshot_hash is distinct from v_snapshot_hash),
      array[]::uuid[]
    ),
    count(*)::integer
  into v_share_ids, v_changed_share_ids, v_share_count
  from public.playlist_shares
  where owner_user_id = v_user_id
    and source_playlist_id = p_source_playlist_id
    and revoked_at is null;

  if v_share_count = 0 then
    return 0;
  end if;

  if cardinality(v_changed_share_ids) > 0 then
    delete from public.playlist_share_tracks
    where share_id = any(v_changed_share_ids);

    with source_tracks as (
      select
        element,
        element ->> 'id' as track_id,
        ordinality
      from jsonb_array_elements(coalesce(p_tracks, '[]'::jsonb))
        with ordinality as item(element, ordinality)
      where nullif(element ->> 'id', '') is not null
    ),
    first_occurrences as (
      select distinct on (track_id)
        element,
        track_id,
        ordinality
      from source_tracks
      order by track_id, ordinality
    ),
    ordered_tracks as (
      select
        element,
        track_id,
        row_number() over (order by ordinality)::integer - 1 as position
      from first_occurrences
    )
    insert into public.playlist_share_tracks(share_id, position, track_id, track)
    select changed_share.share_id, track.position, track.track_id, track.element
    from unnest(v_changed_share_ids) as changed_share(share_id)
    cross join ordered_tracks track;

    get diagnostics v_inserted_count = row_count;
    v_track_count := v_inserted_count / cardinality(v_changed_share_ids);
  end if;

  update public.playlist_shares
  set playlist_name = left(trim(p_playlist_name), 100),
      snapshot_hash = v_snapshot_hash,
      track_count = case
        when id = any(v_changed_share_ids) then v_track_count
        else track_count
      end,
      revision = revision + case
        when id = any(v_changed_share_ids) then 1
        else 0
      end,
      updated_at = now()
  where id = any(v_share_ids);

  return v_share_count;
end;
$$;

revoke all on function public.refresh_active_playlist_shares(text, text, jsonb) from public;
grant execute on function public.refresh_active_playlist_shares(text, text, jsonb) to authenticated;
