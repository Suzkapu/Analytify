-- Stats discovery is a separate, default-off consent from Cloud Backup.
alter table public.users
  add column if not exists stats_discoverable boolean not null default false;

revoke update (stats_discoverable) on table public.users from authenticated;

create table if not exists public.stats_user_blocks (
  blocker_user_id uuid not null references public.users(id) on delete cascade,
  blocked_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  check (blocker_user_id <> blocked_user_id)
);

create table if not exists public.stats_user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.users(id) on delete cascade,
  reported_user_id uuid not null references public.users(id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (reporter_user_id <> reported_user_id)
);

create index if not exists stats_user_reports_pending_idx
  on public.stats_user_reports(created_at desc) where reviewed_at is null;

alter table public.stats_user_blocks enable row level security;
alter table public.stats_user_reports enable row level security;
revoke all on table public.stats_user_blocks, public.stats_user_reports from public, anon, authenticated;
grant all on table public.stats_user_blocks, public.stats_user_reports to service_role;

create or replace function public.safe_stats_profile_image(p_url text)
returns text language sql immutable set search_path = pg_catalog as $$
  select case
    when coalesce(p_url, '') ~* '^https://([a-z0-9-]+\.)*(scdn\.co|spotifycdn\.com|fbsbx\.com)/'
      then left(p_url, 2048)
    else ''
  end
$$;

revoke all on function public.safe_stats_profile_image(text) from public, anon, authenticated;

update public.users
set profile_pic_url = nullif(public.safe_stats_profile_image(profile_pic_url), '')
where coalesce(profile_pic_url, '') <> public.safe_stats_profile_image(profile_pic_url);

update public.stats_access_requests
set owner_image_url = public.safe_stats_profile_image(owner_image_url),
    viewer_image_url = public.safe_stats_profile_image(viewer_image_url);

create or replace function public.get_stats_discovery_setting()
returns boolean language sql security definer set search_path = public, pg_catalog stable as $$
  select coalesce((select stats_discoverable from public.users where id = auth.uid()), false)
$$;

create or replace function public.set_stats_discovery_setting(p_enabled boolean)
returns boolean language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  update public.users set stats_discoverable = coalesce(p_enabled, false) where id = auth.uid();
  if not found then raise exception 'The collaboration profile is unavailable.'; end if;
  return coalesce(p_enabled, false);
end
$$;

create or replace function public.search_stats_shareable_users(p_query text)
returns table (
  user_id uuid, display_name text, image_url text,
  request_id uuid, request_status text
)
language plpgsql security definer set search_path = public, pg_catalog stable as $$
declare v_query text := trim(coalesce(p_query, ''));
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if char_length(v_query) < 3 then return; end if;
  return query
    select profile.id,
      coalesce(nullif(trim(profile.display_name), ''), 'Spotify user')::text,
      public.safe_stats_profile_image(profile.profile_pic_url)::text,
      request.id, request.status
    from public.users profile
    left join public.stats_access_requests request
      on request.owner_user_id = profile.id and request.viewer_user_id = auth.uid()
    where profile.id <> auth.uid()
      and profile.backup_active = true
      and profile.stats_discoverable = true
      and profile.spotify_id not like 'analytify_demo_bot_%'
      and lower(coalesce(profile.display_name, '')) like '%' || lower(v_query) || '%'
      and not exists (
        select 1 from public.stats_user_blocks block
        where (block.blocker_user_id = auth.uid() and block.blocked_user_id = profile.id)
           or (block.blocker_user_id = profile.id and block.blocked_user_id = auth.uid())
      )
    order by lower(coalesce(profile.display_name, profile.spotify_id)), profile.id
    limit 20;
end
$$;

-- The former no-argument directory is deliberately no longer executable.
revoke execute on function public.list_stats_shareable_users() from authenticated;

create or replace function public.request_stats_access(p_owner_user_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_catalog as $$
declare
  v_viewer_id uuid := auth.uid();
  v_owner public.users%rowtype;
  v_viewer public.users%rowtype;
  v_request_id uuid;
begin
  if v_viewer_id is null then raise exception 'Authentication is required.'; end if;
  if p_owner_user_id = v_viewer_id then raise exception 'You cannot request access to your own stats.'; end if;
  if exists (
    select 1 from public.stats_user_blocks block
    where (block.blocker_user_id = v_viewer_id and block.blocked_user_id = p_owner_user_id)
       or (block.blocker_user_id = p_owner_user_id and block.blocked_user_id = v_viewer_id)
  ) then raise exception 'This stats user is unavailable.'; end if;
  if (select count(*) from public.stats_access_requests
      where viewer_user_id = v_viewer_id and requested_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many stats requests. Please try again later.';
  end if;

  select * into v_owner from public.users
  where id = p_owner_user_id and backup_active = true and stats_discoverable = true;
  select * into v_viewer from public.users where id = v_viewer_id;
  if v_owner.id is null or v_viewer.id is null then
    raise exception 'This registered stats user is unavailable.';
  end if;

  insert into public.stats_access_requests(
    owner_user_id, viewer_user_id, owner_display_name, owner_image_url,
    viewer_display_name, viewer_image_url
  ) values (
    v_owner.id, v_viewer.id,
    coalesce(nullif(trim(v_owner.display_name), ''), 'Spotify user'), public.safe_stats_profile_image(v_owner.profile_pic_url),
    coalesce(nullif(trim(v_viewer.display_name), ''), 'Spotify user'), public.safe_stats_profile_image(v_viewer.profile_pic_url)
  )
  on conflict (owner_user_id, viewer_user_id) do update set
    status = 'pending', owner_display_name = excluded.owner_display_name,
    owner_image_url = excluded.owner_image_url, viewer_display_name = excluded.viewer_display_name,
    viewer_image_url = excluded.viewer_image_url, requested_at = now(), responded_at = null,
    revoked_at = null, updated_at = now()
  where stats_access_requests.status in ('declined', 'revoked')
    and stats_access_requests.requested_at <= now() - interval '1 hour'
  returning id into v_request_id;

  if v_request_id is null then
    select id into v_request_id from public.stats_access_requests
    where owner_user_id = p_owner_user_id and viewer_user_id = v_viewer_id;
  end if;
  return v_request_id;
end
$$;

create or replace function public.block_stats_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot block yourself.'; end if;
  insert into public.stats_user_blocks(blocker_user_id, blocked_user_id)
  values (auth.uid(), p_user_id) on conflict do nothing;
  update public.stats_access_requests set status = 'revoked', revoked_at = now(), updated_at = now()
  where status in ('pending', 'approved')
    and ((owner_user_id = auth.uid() and viewer_user_id = p_user_id)
      or (owner_user_id = p_user_id and viewer_user_id = auth.uid()));
end
$$;

create or replace function public.report_stats_user(p_user_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot report yourself.'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Describe the issue in 3 to 500 characters.';
  end if;
  if (select count(*) from public.stats_user_reports
      where reporter_user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Too many reports. Please try again later.';
  end if;
  insert into public.stats_user_reports(reporter_user_id, reported_user_id, reason)
  values (auth.uid(), p_user_id, trim(p_reason)) returning id into v_id;
  perform public.block_stats_user(p_user_id);
  return v_id;
end
$$;

revoke all on function public.get_stats_discovery_setting() from public;
revoke all on function public.set_stats_discovery_setting(boolean) from public;
revoke all on function public.search_stats_shareable_users(text) from public;
revoke all on function public.block_stats_user(uuid) from public;
revoke all on function public.report_stats_user(uuid, text) from public;
grant execute on function public.get_stats_discovery_setting() to authenticated;
grant execute on function public.set_stats_discovery_setting(boolean) to authenticated;
grant execute on function public.search_stats_shareable_users(text) to authenticated;
grant execute on function public.block_stats_user(uuid) to authenticated;
grant execute on function public.report_stats_user(uuid, text) to authenticated;
