-- Reconcile category preferences with the exact browser PushSubscription.
-- Counts intentionally expose no endpoint material to browser clients.
create or replace function public.get_notification_settings(p_endpoint text default null)
returns table(
  song_league_enabled boolean,
  song_league_song_added_enabled boolean,
  song_league_member boolean,
  stats_access_requests_enabled boolean,
  device_registered boolean,
  registered_device_count bigint
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if length(coalesce(p_endpoint, '')) > 4096 then raise exception 'The push endpoint is invalid.'; end if;
  return query
  select coalesce(preference.song_league_enabled, false),
    coalesce(preference.song_league_song_added_enabled, false),
    exists (
      select 1 from public.song_league_members member
      join public.song_leagues league on league.id = member.league_id
      where member.user_id = auth.uid() and member.left_at is null
        and league.closed_at is null and league.is_demo = false
    ),
    coalesce(preference.stats_access_requests_enabled, true),
    exists (
      select 1 from public.push_subscriptions subscription
      where subscription.user_id = auth.uid()
        and p_endpoint is not null and subscription.endpoint = p_endpoint
    ),
    (select count(*) from public.push_subscriptions subscription where subscription.user_id = auth.uid())
  from (select auth.uid() as user_id) identity
  left join public.notification_preferences preference on preference.user_id = identity.user_id;
end;
$$;

revoke all on function public.get_notification_settings(text) from public, anon;
grant execute on function public.get_notification_settings(text) to authenticated;

comment on function public.get_notification_settings(text) is
  'Returns notification preferences plus registration state for the caller supplied current-device endpoint.';
