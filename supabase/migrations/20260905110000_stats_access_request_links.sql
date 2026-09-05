create table public.stats_access_invites (
  id uuid primary key default gen_random_uuid(),
  viewer_user_id uuid not null references public.users(id) on delete cascade,
  viewer_display_name text not null default 'Spotify user',
  viewer_image_url text not null default '',
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  claimed_at timestamptz,
  owner_user_id uuid references public.users(id) on delete cascade,
  request_id uuid references public.stats_access_requests(id) on delete set null,
  check (expires_at > created_at)
);

create index stats_access_invites_expiry_idx
  on public.stats_access_invites(expires_at)
  where claimed_at is null;

alter table public.stats_access_invites enable row level security;

create or replace function public.create_stats_access_invite(
  p_claim_token text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_viewer public.users%rowtype;
  v_invite_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if length(coalesce(p_claim_token, '')) < 32 then
    raise exception 'A secure request token is required.';
  end if;

  select * into v_viewer from public.users where id = auth.uid();
  if not found then
    raise exception 'Your registered profile is unavailable.';
  end if;

  insert into public.stats_access_invites(
    viewer_user_id, viewer_display_name, viewer_image_url, token_hash
  ) values (
    v_viewer.id,
    coalesce(nullif(trim(v_viewer.display_name), ''), 'Spotify user'),
    coalesce(v_viewer.profile_pic_url, ''),
    encode(digest(convert_to(p_claim_token, 'UTF8'), 'sha256'), 'hex')
  ) returning id into v_invite_id;

  return v_invite_id;
end;
$$;

create or replace function public.claim_stats_access_invite(
  p_claim_token text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_owner_id uuid := auth.uid();
  v_invite public.stats_access_invites%rowtype;
  v_owner public.users%rowtype;
  v_request public.stats_access_requests%rowtype;
begin
  if v_owner_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into v_invite
  from public.stats_access_invites
  where token_hash = encode(digest(convert_to(coalesce(p_claim_token, ''), 'UTF8'), 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'This stats request link is invalid or has been revoked.';
  end if;
  if v_invite.claimed_at is not null then
    if v_invite.owner_user_id = v_owner_id and v_invite.request_id is not null then
      return v_invite.request_id;
    end if;
    raise exception 'This stats request link has already been used.';
  end if;
  if v_invite.expires_at <= now() then
    raise exception 'This stats request link has expired.';
  end if;
  if v_invite.viewer_user_id = v_owner_id then
    raise exception 'You cannot open your own stats request link.';
  end if;

  select * into v_owner
  from public.users
  where id = v_owner_id and backup_active = true;
  if not found then
    raise exception 'Enable Cloud Backup before accepting or declining a stats request.';
  end if;

  select * into v_request
  from public.stats_access_requests
  where owner_user_id = v_owner_id
    and viewer_user_id = v_invite.viewer_user_id
  for update;

  if not found then
    insert into public.stats_access_requests(
      owner_user_id, viewer_user_id,
      owner_display_name, owner_image_url,
      viewer_display_name, viewer_image_url
    ) values (
      v_owner.id, v_invite.viewer_user_id,
      coalesce(nullif(trim(v_owner.display_name), ''), 'Spotify user'),
      coalesce(v_owner.profile_pic_url, ''),
      v_invite.viewer_display_name, v_invite.viewer_image_url
    ) returning * into v_request;
  elsif v_request.status in ('declined', 'revoked') then
    update public.stats_access_requests
    set status = 'pending',
        owner_display_name = coalesce(nullif(trim(v_owner.display_name), ''), 'Spotify user'),
        owner_image_url = coalesce(v_owner.profile_pic_url, ''),
        viewer_display_name = v_invite.viewer_display_name,
        viewer_image_url = v_invite.viewer_image_url,
        requested_at = now(),
        responded_at = null,
        revoked_at = null,
        updated_at = now()
    where id = v_request.id
    returning * into v_request;
  end if;

  update public.stats_access_invites
  set claimed_at = now(), owner_user_id = v_owner_id, request_id = v_request.id
  where id = v_invite.id;

  return v_request.id;
end;
$$;

revoke all on table public.stats_access_invites from public, anon, authenticated;
revoke all on function public.create_stats_access_invite(text) from public;
revoke all on function public.claim_stats_access_invite(text) from public;
grant execute on function public.create_stats_access_invite(text) to authenticated;
grant execute on function public.claim_stats_access_invite(text) to authenticated;
grant all on table public.stats_access_invites to service_role;
