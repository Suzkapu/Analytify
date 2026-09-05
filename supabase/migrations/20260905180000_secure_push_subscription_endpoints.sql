create or replace function private.is_allowed_push_endpoint(p_endpoint text)
returns boolean language sql immutable strict set search_path = pg_catalog as $$
  select length(p_endpoint) between 16 and 4096
    and p_endpoint !~ '[[:space:]]'
    and (
      p_endpoint ~* '^https://fcm\.googleapis\.com/'
      or p_endpoint ~* '^https://updates\.push\.services\.mozilla\.com/'
      or p_endpoint ~* '^https://web\.push\.apple\.com/'
      or p_endpoint ~* '^https://([a-z0-9-]+\.)*notify\.windows\.com/'
    );
$$;

alter table public.push_subscriptions
  add constraint push_subscriptions_approved_endpoint
  check (private.is_allowed_push_endpoint(endpoint)) not valid;

create or replace function public.upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default ''
) returns uuid
language plpgsql security definer set search_path = public, private
as $$
declare
  v_subscription public.push_subscriptions%rowtype;
  v_subscription_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if not private.is_allowed_push_endpoint(coalesce(p_endpoint, ''))
    or length(coalesce(p_p256dh, '')) not between 16 and 512
    or length(coalesce(p_auth, '')) not between 8 and 256 then
    raise exception 'The push subscription is incomplete or uses an unsupported provider.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_endpoint, 0));
  select * into v_subscription from public.push_subscriptions
  where endpoint = p_endpoint for update;

  if found and v_subscription.user_id <> auth.uid() then
    if v_subscription.p256dh <> p_p256dh or v_subscription.auth <> p_auth then
      raise exception 'That push subscription belongs to another profile.';
    end if;
    -- Exact endpoint and browser keys prove this is the same local PushManager
    -- subscription. Deleting first also removes queued notifications for the
    -- previous profile before this device is transferred.
    delete from public.push_subscriptions where id = v_subscription.id;
  end if;

  insert into public.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(coalesce(p_user_agent, ''), 500))
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    last_seen_at = now()
  where push_subscriptions.user_id = auth.uid()
  returning id into v_subscription_id;
  return v_subscription_id;
end;
$$;

create or replace function public.unlink_push_subscription(p_endpoint text)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_deleted integer;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  delete from public.push_subscriptions
  where user_id = auth.uid() and endpoint = p_endpoint;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.unlink_push_subscription(text) from public;
grant execute on function public.unlink_push_subscription(text) to authenticated;
