create table if not exists public.stats_access_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  viewer_user_id uuid not null references public.users(id) on delete cascade,
  owner_display_name text not null default 'Spotify user',
  owner_image_url text not null default '',
  viewer_display_name text not null default 'Spotify user',
  viewer_image_url text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'revoked')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (owner_user_id, viewer_user_id),
  check (owner_user_id <> viewer_user_id)
);

create index if not exists stats_access_requests_owner_idx
  on public.stats_access_requests(owner_user_id, status, requested_at);
create index if not exists stats_access_requests_viewer_idx
  on public.stats_access_requests(viewer_user_id, status, updated_at desc);

alter table public.stats_access_requests enable row level security;

drop policy if exists "Stats access participants can read requests" on public.stats_access_requests;
create policy "Stats access participants can read requests"
  on public.stats_access_requests
  for select
  to authenticated
  using (owner_user_id = auth.uid() or viewer_user_id = auth.uid());

-- The directory intentionally exposes only the minimum profile fields needed
-- to address a request, and only for users who have opted into cloud snapshots.
create or replace function public.list_stats_shareable_users()
returns table (
  user_id uuid,
  display_name text,
  image_url text,
  request_id uuid,
  request_status text
)
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select
    profile.id,
    coalesce(nullif(trim(profile.display_name), ''), 'Spotify user')::text,
    coalesce(profile.profile_pic_url, '')::text,
    request.id,
    request.status
  from public.users profile
  left join public.stats_access_requests request
    on request.owner_user_id = profile.id
   and request.viewer_user_id = auth.uid()
  where auth.uid() is not null
    and profile.id <> auth.uid()
    and profile.backup_active = true
    and profile.spotify_id not like 'analytify_demo_bot_%'
  order by lower(coalesce(profile.display_name, profile.spotify_id));
$$;

create or replace function public.list_stats_access_requests()
returns table (
  id uuid,
  owner_user_id uuid,
  viewer_user_id uuid,
  owner_display_name text,
  owner_image_url text,
  viewer_display_name text,
  viewer_image_url text,
  status text,
  requested_at timestamptz,
  responded_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz,
  viewer_role text
)
language sql
security definer
set search_path = public, pg_catalog
stable
as $$
  select
    request.id,
    request.owner_user_id,
    request.viewer_user_id,
    request.owner_display_name,
    request.owner_image_url,
    request.viewer_display_name,
    request.viewer_image_url,
    request.status,
    request.requested_at,
    request.responded_at,
    request.revoked_at,
    request.updated_at,
    case when request.owner_user_id = auth.uid() then 'owner' else 'viewer' end::text
  from public.stats_access_requests request
  where auth.uid() is not null
    and auth.uid() in (request.owner_user_id, request.viewer_user_id)
  order by request.updated_at desc;
$$;

create or replace function public.request_stats_access(
  p_owner_user_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_owner public.users%rowtype;
  v_viewer public.users%rowtype;
  v_request_id uuid;
begin
  if v_viewer_id is null then
    raise exception 'Authentication is required.';
  end if;
  if p_owner_user_id = v_viewer_id then
    raise exception 'You cannot request access to your own stats.';
  end if;

  select * into v_owner from public.users
  where id = p_owner_user_id and backup_active = true;
  select * into v_viewer from public.users where id = v_viewer_id;
  if not found or v_owner.id is null or v_viewer.id is null then
    raise exception 'This registered stats user is unavailable.';
  end if;

  insert into public.stats_access_requests(
    owner_user_id, viewer_user_id,
    owner_display_name, owner_image_url,
    viewer_display_name, viewer_image_url
  ) values (
    v_owner.id, v_viewer.id,
    coalesce(nullif(trim(v_owner.display_name), ''), 'Spotify user'), coalesce(v_owner.profile_pic_url, ''),
    coalesce(nullif(trim(v_viewer.display_name), ''), 'Spotify user'), coalesce(v_viewer.profile_pic_url, '')
  )
  on conflict (owner_user_id, viewer_user_id)
  do update set
    status = 'pending',
    owner_display_name = excluded.owner_display_name,
    owner_image_url = excluded.owner_image_url,
    viewer_display_name = excluded.viewer_display_name,
    viewer_image_url = excluded.viewer_image_url,
    requested_at = now(),
    responded_at = null,
    revoked_at = null,
    updated_at = now()
  where stats_access_requests.status in ('declined', 'revoked')
  returning id into v_request_id;

  if v_request_id is null then
    select id into v_request_id
    from public.stats_access_requests
    where owner_user_id = p_owner_user_id and viewer_user_id = v_viewer_id;
  end if;
  return v_request_id;
end;
$$;

create or replace function public.respond_stats_access(
  p_request_id uuid,
  p_approve boolean
) returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_request public.stats_access_requests%rowtype;
begin
  select * into v_request
  from public.stats_access_requests
  where id = p_request_id
  for update;

  if not found or v_request.owner_user_id <> auth.uid() then
    raise exception 'Only the stats owner can answer this request.';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'This stats request has already been answered.';
  end if;

  update public.stats_access_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      responded_at = now(),
      revoked_at = null,
      updated_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.revoke_stats_access(
  p_request_id uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_request public.stats_access_requests%rowtype;
begin
  select * into v_request
  from public.stats_access_requests
  where id = p_request_id
  for update;

  if not found or auth.uid() not in (v_request.owner_user_id, v_request.viewer_user_id) then
    raise exception 'This stats access request is unavailable.';
  end if;
  if v_request.status not in ('pending', 'approved') then
    raise exception 'This stats access request is not active.';
  end if;

  update public.stats_access_requests
  set status = 'revoked', revoked_at = now(), updated_at = now()
  where id = p_request_id;
end;
$$;

create or replace function public.get_shared_stats_snapshot(
  p_owner_user_id uuid,
  p_range text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
stable
as $$
declare
  v_snapshot public.stats_snapshots%rowtype;
  v_profile public.users%rowtype;
  v_result jsonb;
begin
  if p_range not in ('short_term', 'medium_term', 'long_term') then
    raise exception 'The stats range is invalid.';
  end if;
  if not exists (
    select 1
    from public.stats_access_requests request
    where request.status = 'approved'
      and request.owner_user_id = p_owner_user_id
      and request.viewer_user_id = auth.uid()
      and request.revoked_at is null
  ) then
    raise exception 'Stats access is not approved.';
  end if;

  select * into v_snapshot
  from public.stats_snapshots snapshot
  where snapshot.user_id = p_owner_user_id and snapshot.range = p_range
  order by snapshot.snapshot_date desc, snapshot.created_at desc
  limit 1;
  if not found then return null; end if;
  select * into v_profile from public.users where id = p_owner_user_id;

  select jsonb_build_object(
    'ownerUserId', p_owner_user_id,
    'ownerDisplayName', coalesce(nullif(trim(v_profile.display_name), ''), 'Spotify user'),
    'ownerImageUrl', coalesce(v_profile.profile_pic_url, ''),
    'snapshotDate', v_snapshot.snapshot_date,
    'topTracks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', track.id,
        'name', track.name,
        'duration_ms', track.duration_ms,
        'explicit', track.explicit,
        'external_urls', jsonb_build_object('spotify', coalesce(track.spotify_url, '')),
        'spotifyUrl', coalesce(track.spotify_url, ''),
        'albumCover', coalesce(album.image_url, ''),
        'album', jsonb_build_object(
          'id', album.id,
          'name', coalesce(album.name, ''),
          'images', case when album.image_url is null then '[]'::jsonb
            else jsonb_build_array(jsonb_build_object('url', album.image_url)) end
        ),
        'artists', coalesce((
          select jsonb_agg(jsonb_build_object('id', artist.id, 'name', artist.name) order by link_artist.artist_rank)
          from public.track_artists link_artist
          join public.artists artist on artist.id = link_artist.artist_id
          where link_artist.track_id = track.id
        ), '[]'::jsonb)
      ) order by item.rank)
      from public.stats_snapshot_tracks item
      join public.tracks track on track.id = item.track_id
      left join public.albums album on album.id = track.album_id
      where item.snapshot_id = v_snapshot.id
    ), '[]'::jsonb),
    'topArtists', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', artist.id,
        'name', artist.name,
        'external_urls', jsonb_build_object('spotify', coalesce(artist.spotify_url, '')),
        'images', case when artist.image_url is null then '[]'::jsonb
          else jsonb_build_array(jsonb_build_object('url', artist.image_url)) end
      ) order by item.rank)
      from public.stats_snapshot_artists item
      join public.artists artist on artist.id = item.artist_id
      where item.snapshot_id = v_snapshot.id
    ), '[]'::jsonb),
    'topGenres', coalesce((
      select jsonb_agg(jsonb_build_object('name', item.genre_name, 'weight', item.weight) order by item.rank)
      from public.stats_snapshot_genres item
      where item.snapshot_id = v_snapshot.id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.list_stats_shareable_users() from public;
revoke all on function public.list_stats_access_requests() from public;
revoke all on function public.request_stats_access(uuid) from public;
revoke all on function public.respond_stats_access(uuid, boolean) from public;
revoke all on function public.revoke_stats_access(uuid) from public;
revoke all on function public.get_shared_stats_snapshot(uuid, text) from public;

grant execute on function public.list_stats_shareable_users() to authenticated;
grant execute on function public.list_stats_access_requests() to authenticated;
grant execute on function public.request_stats_access(uuid) to authenticated;
grant execute on function public.respond_stats_access(uuid, boolean) to authenticated;
grant execute on function public.revoke_stats_access(uuid) to authenticated;
grant execute on function public.get_shared_stats_snapshot(uuid, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'stats_access_requests'
    ) then
    alter publication supabase_realtime add table public.stats_access_requests;
  end if;
end
$$;
