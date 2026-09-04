-- Historical Top-item search -------------------------------------------------
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
  if p_kind not in ('track', 'artist') then raise exception 'The stats item kind is invalid.'; end if;
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
  else
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
  end if;
end;
$$;

revoke all on function public.search_past_top_items(text, text, text, integer) from public;
grant execute on function public.search_past_top_items(text, text, text, integer) to authenticated;

-- Stats-access request notifications ----------------------------------------
alter table public.notification_preferences
  add column if not exists stats_access_requests_enabled boolean not null default true;

drop function if exists public.get_notification_preferences();
create function public.get_notification_preferences()
returns table(
  song_league_enabled boolean,
  song_league_song_added_enabled boolean,
  song_league_member boolean,
  stats_access_requests_enabled boolean
)
language sql stable security definer set search_path = public
as $$
  select coalesce(preference.song_league_enabled, false),
    coalesce(preference.song_league_song_added_enabled, false),
    exists (
      select 1 from public.song_league_members member
      join public.song_leagues league on league.id = member.league_id
      where member.user_id = auth.uid() and member.left_at is null
        and league.closed_at is null and league.is_demo = false
    ),
    coalesce(preference.stats_access_requests_enabled, true)
  from (select auth.uid() as user_id) identity
  left join public.notification_preferences preference on preference.user_id = identity.user_id;
$$;

create or replace function public.set_notification_preference(p_category text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if p_category not in ('song_league', 'song_league_song_added', 'stats_access_requests') then
    raise exception 'The notification category is not supported.';
  end if;
  if p_category = 'song_league_song_added' and coalesce(p_enabled, false) and not exists (
    select 1 from public.song_league_members member
    join public.song_leagues league on league.id = member.league_id
    where member.user_id = auth.uid() and member.left_at is null
      and league.closed_at is null and league.is_demo = false
  ) then raise exception 'Join a Song League before enabling new-song notifications.'; end if;

  insert into public.notification_preferences(
    user_id, song_league_enabled, song_league_song_added_enabled,
    stats_access_requests_enabled, updated_at
  ) values (
    auth.uid(),
    case when p_category = 'song_league' then coalesce(p_enabled, false) else false end,
    case when p_category = 'song_league_song_added' then coalesce(p_enabled, false) else false end,
    case when p_category = 'stats_access_requests' then coalesce(p_enabled, false) else true end,
    now()
  ) on conflict (user_id) do update set
    song_league_enabled = case when p_category = 'song_league' then coalesce(p_enabled, false) else notification_preferences.song_league_enabled end,
    song_league_song_added_enabled = case when p_category = 'song_league_song_added' then coalesce(p_enabled, false) else notification_preferences.song_league_song_added_enabled end,
    stats_access_requests_enabled = case when p_category = 'stats_access_requests' then coalesce(p_enabled, false) else notification_preferences.stats_access_requests_enabled end,
    updated_at = now();
end;
$$;

create table public.stats_access_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.stats_access_requests(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  viewer_display_name text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'retry', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(request_id, subscription_id)
);
create index stats_access_push_queue_idx on public.stats_access_push_deliveries(status, created_at)
  where status in ('queued', 'retry');
alter table public.stats_access_push_deliveries enable row level security;

create or replace function private.queue_stats_access_request_notification()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'pending' and (
    tg_op = 'INSERT' or old.status is distinct from new.status or old.requested_at is distinct from new.requested_at
  ) then
    insert into public.stats_access_push_deliveries(request_id, user_id, subscription_id, viewer_display_name)
    select new.id, new.owner_user_id, subscription.id, new.viewer_display_name
    from public.push_subscriptions subscription
    left join public.notification_preferences preference on preference.user_id = new.owner_user_id
    where subscription.user_id = new.owner_user_id
      and coalesce(preference.stats_access_requests_enabled, true)
    on conflict (request_id, subscription_id) do update set
      status = 'queued', attempts = 0, last_error = null, sent_at = null, updated_at = now();
  end if;
  return new;
end;
$$;
create trigger queue_stats_access_request_notification
after insert or update of status, requested_at on public.stats_access_requests
for each row execute function private.queue_stats_access_request_notification();

create function public.claim_stats_access_push_deliveries(p_limit integer default 100)
returns table(
  delivery_id uuid, subscription_id uuid, endpoint text, p256dh text, auth text,
  viewer_display_name text, attempts integer, delivery_table text
)
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Push delivery is restricted to the trusted worker.'; end if;
  update public.stats_access_push_deliveries set status = 'retry', updated_at = now(),
    last_error = 'Delivery claim expired before completion.'
  where status = 'sending' and updated_at < now() - interval '10 minutes' and attempts < 3;
  return query
  with candidates as (
    select delivery.id from public.stats_access_push_deliveries delivery
    left join public.notification_preferences preference on preference.user_id = delivery.user_id
    join public.stats_access_requests request on request.id = delivery.request_id and request.status = 'pending'
    where delivery.status in ('queued', 'retry') and delivery.attempts < 3
      and coalesce(preference.stats_access_requests_enabled, true)
    order by delivery.created_at for update of delivery skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ), claimed as (
    update public.stats_access_push_deliveries delivery set status = 'sending',
      attempts = delivery.attempts + 1, updated_at = now()
    from candidates where delivery.id = candidates.id returning delivery.*
  )
  select claimed.id, subscription.id, subscription.endpoint, subscription.p256dh,
    subscription.auth, claimed.viewer_display_name, claimed.attempts,
    'stats_access_push_deliveries'::text
  from claimed join public.push_subscriptions subscription on subscription.id = claimed.subscription_id;
end;
$$;

-- Per-league capacity ---------------------------------------------------------
alter table public.song_leagues add column if not exists max_members integer not null default 5;
alter table public.song_leagues drop constraint if exists song_leagues_max_members_check;
alter table public.song_leagues add constraint song_leagues_max_members_check check (max_members between 2 and 50);

create function public.set_song_league_member_limit(p_league_id uuid, p_max_members integer)
returns integer language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_active_members integer;
begin
  if p_max_members not between 2 and 50 then raise exception 'Member limit must be between 2 and 50.'; end if;
  perform 1 from public.song_leagues where id = p_league_id and owner_user_id = auth.uid()
    and closed_at is null for update;
  if not found then raise exception 'Only the league owner can change the member limit.'; end if;
  select count(*)::integer into v_active_members from public.song_league_members
    where league_id = p_league_id and left_at is null;
  if p_max_members < v_active_members then
    raise exception 'The member limit cannot be lower than the current member count (%).', v_active_members;
  end if;
  update public.song_leagues set max_members = p_max_members where id = p_league_id;
  return p_max_members;
end;
$$;

create or replace function public.claim_song_league(p_invite_token text)
returns uuid language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.song_league_invites%rowtype;
  v_profile public.users%rowtype;
  v_member_count integer;
  v_member_limit integer;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  select invite.* into v_invite from public.song_league_invites invite
  join public.song_leagues league on league.id = invite.league_id
  where invite.token_hash = encode(digest(convert_to(coalesce(p_invite_token, ''), 'UTF8'), 'sha256'), 'hex')
    and invite.revoked_at is null and league.closed_at is null for update of invite;
  if not found then raise exception 'This Song League invitation is invalid or revoked.'; end if;
  select max_members into v_member_limit from public.song_leagues
    where id = v_invite.league_id and closed_at is null for update;
  select * into v_profile from public.users where id = v_user_id;
  if not found or not v_profile.backup_active then raise exception 'Enable Cloud Backup before joining a Song League.'; end if;
  select count(*)::integer into v_member_count from public.song_league_members
    where league_id = v_invite.league_id and left_at is null;
  if v_member_count >= v_member_limit and not exists (
    select 1 from public.song_league_members where league_id = v_invite.league_id and user_id = v_user_id and left_at is null
  ) then raise exception 'This Song League has reached its % member limit.', v_member_limit; end if;
  insert into public.song_league_members(league_id, user_id, role, display_name, image_url, joined_at, left_at)
  values (v_invite.league_id, v_user_id, 'member',
    coalesce(nullif(trim(v_profile.display_name), ''), 'Spotify user'), coalesce(v_profile.profile_pic_url, ''), now(), null)
  on conflict (league_id, user_id) do update set display_name = excluded.display_name,
    image_url = excluded.image_url, joined_at = excluded.joined_at, left_at = null;
  return v_invite.league_id;
end;
$$;

revoke all on function public.get_notification_preferences() from public;
revoke all on function public.set_notification_preference(text, boolean) from public;
revoke all on function private.queue_stats_access_request_notification() from public;
revoke all on function public.claim_stats_access_push_deliveries(integer) from public;
revoke all on function public.set_song_league_member_limit(uuid, integer) from public;
revoke all on function public.claim_song_league(text) from public;
grant execute on function public.get_notification_preferences() to authenticated;
grant execute on function public.set_notification_preference(text, boolean) to authenticated;
grant execute on function public.claim_stats_access_push_deliveries(integer) to service_role;
grant execute on function public.set_song_league_member_limit(uuid, integer) to authenticated;
grant execute on function public.claim_song_league(text) to authenticated;
grant all on public.stats_access_push_deliveries to service_role;

notify pgrst, 'reload schema';
