create table if not exists public.notification_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  song_league_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  check (length(endpoint) between 16 and 4096),
  check (length(p256dh) between 16 and 512),
  check (length(auth) between 8 and 256)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id, last_seen_at desc);

create table if not exists public.song_league_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  opening_date date not null,
  user_id uuid not null references public.users(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  league_name text not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'retry', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (league_id, opening_date, subscription_id)
);

create index if not exists song_league_push_delivery_queue_idx
  on public.song_league_push_deliveries(status, created_at)
  where status in ('queued', 'retry');

alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.song_league_push_deliveries enable row level security;

drop policy if exists "Users can read their notification preferences" on public.notification_preferences;
create policy "Users can read their notification preferences"
  on public.notification_preferences for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can read their push devices" on public.push_subscriptions;
create policy "Users can read their push devices"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

create or replace function public.get_notification_preferences()
returns table(song_league_enabled boolean)
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select preference.song_league_enabled
    from public.notification_preferences preference
    where preference.user_id = auth.uid()
  ), false);
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
  if p_category <> 'song_league' then raise exception 'The notification category is not supported.'; end if;

  insert into public.notification_preferences(user_id, song_league_enabled, updated_at)
  values (auth.uid(), coalesce(p_enabled, false), now())
  on conflict (user_id) do update
  set song_league_enabled = excluded.song_league_enabled,
      updated_at = excluded.updated_at;
end;
$$;

create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default ''
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if length(coalesce(p_endpoint, '')) not between 16 and 4096
    or length(coalesce(p_p256dh, '')) not between 16 and 512
    or length(coalesce(p_auth, '')) not between 8 and 256 then
    raise exception 'The push subscription is incomplete.';
  end if;

  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 500))
  on conflict (endpoint) do update
  set p256dh = excluded.p256dh,
      auth = excluded.auth,
      user_agent = excluded.user_agent,
      last_seen_at = now()
  where push_subscriptions.user_id = auth.uid()
  returning id into v_subscription_id;

  if v_subscription_id is null then
    raise exception 'That push subscription belongs to another profile.';
  end if;
  return v_subscription_id;
end;
$$;

create or replace function public.queue_song_league_pick_notifications(
  p_now timestamptz default now()
) returns integer
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_queued integer := 0;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Song League push scheduling is restricted to the trusted worker.';
  end if;

  update public.song_league_push_deliveries
  set status = 'retry', updated_at = now(), last_error = 'Delivery claim expired before completion.'
  where status = 'sending' and updated_at < now() - interval '10 minutes' and attempts < 3;

  insert into public.song_league_push_deliveries(
    league_id, opening_date, user_id, subscription_id, league_name
  )
  select
    league.id,
    (p_now at time zone league.timezone)::date,
    member.user_id,
    subscription.id,
    league.name
  from public.song_leagues league
  join public.song_league_members member
    on member.league_id = league.id and member.left_at is null
  join public.notification_preferences preference
    on preference.user_id = member.user_id and preference.song_league_enabled = true
  join public.push_subscriptions subscription
    on subscription.user_id = member.user_id
  where league.closed_at is null
    and league.is_demo = false
    and extract(isodow from (p_now at time zone league.timezone))::integer = 5
  on conflict (league_id, opening_date, subscription_id) do nothing;

  get diagnostics v_queued = row_count;
  return v_queued;
end;
$$;

create or replace function public.claim_song_league_push_deliveries(
  p_limit integer default 100
) returns table(
  delivery_id uuid,
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  league_id uuid,
  league_name text,
  opening_date date,
  attempts integer
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Song League push delivery is restricted to the trusted worker.';
  end if;

  return query
  with candidates as (
    select delivery.id
    from public.song_league_push_deliveries delivery
    where delivery.status in ('queued', 'retry') and delivery.attempts < 3
    order by delivery.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ), claimed as (
    update public.song_league_push_deliveries delivery
    set status = 'sending', attempts = delivery.attempts + 1, updated_at = now()
    from candidates
    where delivery.id = candidates.id
    returning delivery.*
  )
  select claimed.id, subscription.id, subscription.endpoint, subscription.p256dh,
    subscription.auth, claimed.league_id, claimed.league_name,
    claimed.opening_date, claimed.attempts
  from claimed
  join public.push_subscriptions subscription on subscription.id = claimed.subscription_id;
end;
$$;

revoke all on function public.get_notification_preferences() from public;
revoke all on function public.set_notification_preference(text, boolean) from public;
revoke all on function public.upsert_push_subscription(text, text, text, text) from public;
revoke all on function public.queue_song_league_pick_notifications(timestamptz) from public;
revoke all on function public.claim_song_league_push_deliveries(integer) from public;
grant execute on function public.get_notification_preferences() to authenticated;
grant execute on function public.set_notification_preference(text, boolean) to authenticated;
grant execute on function public.upsert_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.queue_song_league_pick_notifications(timestamptz) to service_role;
grant execute on function public.claim_song_league_push_deliveries(integer) to service_role;

grant select on public.notification_preferences to authenticated;
grant select on public.push_subscriptions to authenticated;
grant all on public.notification_preferences to service_role;
grant all on public.push_subscriptions to service_role;
grant all on public.song_league_push_deliveries to service_role;
