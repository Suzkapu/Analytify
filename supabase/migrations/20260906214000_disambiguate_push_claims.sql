-- Qualify delivery columns that share names with RETURNS TABLE output variables.
create or replace function public.claim_song_league_song_push_deliveries(p_limit integer default 100)
returns table(
  delivery_id uuid, subscription_id uuid, endpoint text, p256dh text, auth text,
  league_id uuid, league_name text, track_name text, recommender_display_name text,
  attempts integer, delivery_table text
)
language plpgsql security definer set search_path = public, private as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'Song League push delivery is restricted to the trusted worker.';
  end if;
  update public.song_league_song_push_deliveries delivery
  set status = 'retry', updated_at = now(), last_error = 'Delivery claim expired before completion.'
  where delivery.status = 'sending' and delivery.updated_at < now() - interval '10 minutes'
    and delivery.attempts < 3;
  return query
  with candidates as (
    select delivery.id from public.song_league_song_push_deliveries delivery
    join public.notification_preferences preference
      on preference.user_id = delivery.user_id and preference.song_league_song_added_enabled = true
    join public.song_league_members member
      on member.league_id = delivery.league_id and member.user_id = delivery.user_id and member.left_at is null
    where delivery.status in ('queued', 'retry') and delivery.attempts < 3
    order by delivery.created_at for update of delivery skip locked
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ), claimed as (
    update public.song_league_song_push_deliveries delivery
    set status = 'sending', attempts = delivery.attempts + 1, updated_at = now()
    from candidates where delivery.id = candidates.id returning delivery.*
  )
  select claimed.id, subscription.id, subscription.endpoint, subscription.p256dh,
    subscription.auth, claimed.league_id, claimed.league_name, claimed.track_name,
    claimed.recommender_display_name, claimed.attempts, 'song_league_song_push_deliveries'::text
  from claimed join public.push_subscriptions subscription on subscription.id = claimed.subscription_id;
end; $$;

create or replace function public.claim_stats_access_push_deliveries(p_limit integer default 100)
returns table(
  delivery_id uuid, subscription_id uuid, endpoint text, p256dh text, auth text,
  viewer_display_name text, attempts integer, delivery_table text
)
language plpgsql security definer set search_path = public as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Push delivery is restricted to the trusted worker.'; end if;
  update public.stats_access_push_deliveries delivery
  set status = 'retry', updated_at = now(), last_error = 'Delivery claim expired before completion.'
  where delivery.status = 'sending' and delivery.updated_at < now() - interval '10 minutes'
    and delivery.attempts < 3;
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
    subscription.auth, claimed.viewer_display_name, claimed.attempts, 'stats_access_push_deliveries'::text
  from claimed join public.push_subscriptions subscription on subscription.id = claimed.subscription_id;
end; $$;

revoke all on function public.claim_song_league_song_push_deliveries(integer) from public, anon, authenticated;
revoke all on function public.claim_stats_access_push_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_song_league_song_push_deliveries(integer) to service_role;
grant execute on function public.claim_stats_access_push_deliveries(integer) to service_role;
