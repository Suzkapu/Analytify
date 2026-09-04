alter table public.notification_preferences
  add column if not exists song_league_song_added_enabled boolean not null default false;

drop function if exists public.get_notification_preferences();
create function public.get_notification_preferences()
returns table(
  song_league_enabled boolean,
  song_league_song_added_enabled boolean,
  song_league_member boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(preference.song_league_enabled, false),
    coalesce(preference.song_league_song_added_enabled, false),
    exists (
      select 1
      from public.song_league_members member
      join public.song_leagues league on league.id = member.league_id
      where member.user_id = auth.uid()
        and member.left_at is null
        and league.closed_at is null
        and league.is_demo = false
    )
  from (select auth.uid() as user_id) identity
  left join public.notification_preferences preference
    on preference.user_id = identity.user_id;
$$;

create or replace function public.set_notification_preference(
  p_category text,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if p_category not in ('song_league', 'song_league_song_added') then
    raise exception 'The notification category is not supported.';
  end if;
  if p_category = 'song_league_song_added' and coalesce(p_enabled, false) and not exists (
    select 1
    from public.song_league_members member
    join public.song_leagues league on league.id = member.league_id
    where member.user_id = auth.uid() and member.left_at is null
      and league.closed_at is null and league.is_demo = false
  ) then
    raise exception 'Join a Song League before enabling new-song notifications.';
  end if;

  insert into public.notification_preferences(
    user_id, song_league_enabled, song_league_song_added_enabled, updated_at
  ) values (
    auth.uid(),
    case when p_category = 'song_league' then coalesce(p_enabled, false) else false end,
    case when p_category = 'song_league_song_added' then coalesce(p_enabled, false) else false end,
    now()
  )
  on conflict (user_id) do update set
    song_league_enabled = case when p_category = 'song_league'
      then coalesce(p_enabled, false) else notification_preferences.song_league_enabled end,
    song_league_song_added_enabled = case when p_category = 'song_league_song_added'
      then coalesce(p_enabled, false) else notification_preferences.song_league_song_added_enabled end,
    updated_at = now();
end;
$$;

create table if not exists public.song_league_song_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references public.song_league_recommendations(id) on delete cascade,
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  league_name text not null,
  track_name text not null,
  recommender_display_name text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'retry', 'sent', 'failed', 'cancelled')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (recommendation_id, subscription_id)
);

create index if not exists song_league_song_push_queue_idx
  on public.song_league_song_push_deliveries(status, created_at)
  where status in ('queued', 'retry');
alter table public.song_league_song_push_deliveries enable row level security;

create or replace function private.queue_song_league_song_added_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.song_league_song_push_deliveries(
    recommendation_id, league_id, user_id, subscription_id,
    league_name, track_name, recommender_display_name
  )
  select new.id, new.league_id, recipient.user_id, subscription.id,
    league.name, track.name, recommender.display_name
  from public.song_leagues league
  join public.tracks track on track.id = new.track_id
  join public.song_league_members recommender
    on recommender.league_id = new.league_id and recommender.user_id = new.recommender_user_id
  join public.song_league_members recipient
    on recipient.league_id = new.league_id and recipient.left_at is null
      and recipient.user_id <> new.recommender_user_id
  join public.notification_preferences preference
    on preference.user_id = recipient.user_id
      and preference.song_league_song_added_enabled = true
  join public.push_subscriptions subscription on subscription.user_id = recipient.user_id
  where league.id = new.league_id and league.closed_at is null and league.is_demo = false
  on conflict (recommendation_id, subscription_id) do nothing;
  return new;
end;
$$;

drop trigger if exists queue_song_league_song_added_notification on public.song_league_recommendations;
create trigger queue_song_league_song_added_notification
after insert on public.song_league_recommendations
for each row execute function private.queue_song_league_song_added_notification();

create or replace function public.claim_song_league_song_push_deliveries(p_limit integer default 100)
returns table(
  delivery_id uuid, subscription_id uuid, endpoint text, p256dh text, auth text,
  league_id uuid, league_name text, track_name text, recommender_display_name text,
  attempts integer, delivery_table text
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Song League push delivery is restricted to the trusted worker.';
  end if;

  update public.song_league_song_push_deliveries
  set status = 'retry', updated_at = now(), last_error = 'Delivery claim expired before completion.'
  where status = 'sending' and updated_at < now() - interval '10 minutes' and attempts < 3;

  return query
  with candidates as (
    select delivery.id
    from public.song_league_song_push_deliveries delivery
    join public.notification_preferences preference
      on preference.user_id = delivery.user_id and preference.song_league_song_added_enabled = true
    join public.song_league_members member
      on member.league_id = delivery.league_id and member.user_id = delivery.user_id and member.left_at is null
    where delivery.status in ('queued', 'retry') and delivery.attempts < 3
    order by delivery.created_at
    for update of delivery skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ), claimed as (
    update public.song_league_song_push_deliveries delivery
    set status = 'sending', attempts = delivery.attempts + 1, updated_at = now()
    from candidates where delivery.id = candidates.id returning delivery.*
  )
  select claimed.id, subscription.id, subscription.endpoint, subscription.p256dh,
    subscription.auth, claimed.league_id, claimed.league_name, claimed.track_name,
    claimed.recommender_display_name, claimed.attempts,
    'song_league_song_push_deliveries'::text
  from claimed join public.push_subscriptions subscription on subscription.id = claimed.subscription_id;
end;
$$;

revoke all on function public.get_notification_preferences() from public;
revoke all on function public.set_notification_preference(text, boolean) from public;
revoke all on function private.queue_song_league_song_added_notification() from public;
revoke all on function public.claim_song_league_song_push_deliveries(integer) from public;
grant execute on function public.get_notification_preferences() to authenticated;
grant execute on function public.set_notification_preference(text, boolean) to authenticated;
grant execute on function public.claim_song_league_song_push_deliveries(integer) to service_role;
grant all on public.song_league_song_push_deliveries to service_role;

notify pgrst, 'reload schema';
