alter table public.stats_access_invites
  add column if not exists invite_kind text not null default 'request',
  add column if not exists claimed_by_user_id uuid references public.users(id) on delete set null;

alter table public.stats_access_invites
  drop constraint if exists stats_access_invites_invite_kind_check;
alter table public.stats_access_invites
  add constraint stats_access_invites_invite_kind_check
  check (invite_kind in ('request', 'share'));

create or replace function public.create_stats_share_invite(
  p_claim_token text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_owner public.users%rowtype;
  v_invite_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if length(coalesce(p_claim_token, '')) < 32 then raise exception 'A secure share token is required.'; end if;

  select * into v_owner from public.users where id = auth.uid() and backup_active = true;
  if not found then raise exception 'Enable Cloud Backup before sharing your stats.'; end if;

  insert into public.stats_access_invites(
    viewer_user_id, viewer_display_name, viewer_image_url, token_hash, invite_kind
  ) values (
    v_owner.id,
    coalesce(nullif(trim(v_owner.display_name), ''), 'Spotify user'),
    coalesce(v_owner.profile_pic_url, ''),
    encode(digest(convert_to(p_claim_token, 'UTF8'), 'sha256'), 'hex'),
    'share'
  ) returning id into v_invite_id;
  return v_invite_id;
end;
$$;

create or replace function public.preview_stats_access_invite(
  p_claim_token text
) returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_invite public.stats_access_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  select * into v_invite from public.stats_access_invites
  where token_hash = encode(digest(convert_to(coalesce(p_claim_token, ''), 'UTF8'), 'sha256'), 'hex');
  if not found or v_invite.claimed_at is not null or v_invite.expires_at <= now() then
    raise exception 'This stats link is invalid, expired, or has already been used.';
  end if;
  if v_invite.viewer_user_id = auth.uid() then raise exception 'You cannot open your own stats link.'; end if;
  return jsonb_build_object(
    'kind', v_invite.invite_kind,
    'displayName', v_invite.viewer_display_name,
    'imageUrl', v_invite.viewer_image_url,
    'expiresAt', v_invite.expires_at
  );
end;
$$;

create or replace function public.accept_stats_share_invite(
  p_claim_token text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_viewer_id uuid := auth.uid();
  v_invite public.stats_access_invites%rowtype;
  v_viewer public.users%rowtype;
  v_request public.stats_access_requests%rowtype;
begin
  if v_viewer_id is null then raise exception 'Authentication is required.'; end if;
  select * into v_invite from public.stats_access_invites
  where token_hash = encode(digest(convert_to(coalesce(p_claim_token, ''), 'UTF8'), 'sha256'), 'hex')
  for update;
  if not found or v_invite.invite_kind <> 'share' then raise exception 'This stats share link is invalid.'; end if;
  if v_invite.claimed_at is not null then
    if v_invite.claimed_by_user_id = v_viewer_id and v_invite.request_id is not null then return v_invite.request_id; end if;
    raise exception 'This stats share link has already been used.';
  end if;
  if v_invite.expires_at <= now() then raise exception 'This stats share link has expired.'; end if;
  if v_invite.viewer_user_id = v_viewer_id then raise exception 'You cannot open your own stats share link.'; end if;

  select * into v_viewer from public.users where id = v_viewer_id;
  if not found then raise exception 'Your registered profile is unavailable.'; end if;

  select * into v_request from public.stats_access_requests
  where owner_user_id = v_invite.viewer_user_id and viewer_user_id = v_viewer_id for update;
  if not found then
    insert into public.stats_access_requests(
      owner_user_id, viewer_user_id, owner_display_name, owner_image_url,
      viewer_display_name, viewer_image_url, status, responded_at
    ) values (
      v_invite.viewer_user_id, v_viewer_id, v_invite.viewer_display_name,
      v_invite.viewer_image_url, coalesce(nullif(trim(v_viewer.display_name), ''), 'Spotify user'),
      coalesce(v_viewer.profile_pic_url, ''), 'approved', now()
    ) returning * into v_request;
  else
    update public.stats_access_requests set
      status = 'approved', owner_display_name = v_invite.viewer_display_name,
      owner_image_url = v_invite.viewer_image_url,
      viewer_display_name = coalesce(nullif(trim(v_viewer.display_name), ''), 'Spotify user'),
      viewer_image_url = coalesce(v_viewer.profile_pic_url, ''), requested_at = now(),
      responded_at = now(), revoked_at = null, updated_at = now()
    where id = v_request.id returning * into v_request;
  end if;

  update public.stats_access_invites set claimed_at = now(), claimed_by_user_id = v_viewer_id,
    owner_user_id = v_invite.viewer_user_id, request_id = v_request.id where id = v_invite.id;
  return v_request.id;
end;
$$;

create or replace function public.decline_stats_share_invite(
  p_claim_token text
) returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  update public.stats_access_invites set claimed_at = now(), claimed_by_user_id = auth.uid()
  where token_hash = encode(digest(convert_to(coalesce(p_claim_token, ''), 'UTF8'), 'sha256'), 'hex')
    and invite_kind = 'share' and claimed_at is null and expires_at > now()
    and viewer_user_id <> auth.uid();
  if not found then raise exception 'This stats share link is unavailable.'; end if;
  return true;
end;
$$;

revoke all on function public.create_stats_share_invite(text) from public, anon;
revoke all on function public.preview_stats_access_invite(text) from public, anon;
revoke all on function public.accept_stats_share_invite(text) from public, anon;
revoke all on function public.decline_stats_share_invite(text) from public, anon;
grant execute on function public.create_stats_share_invite(text) to authenticated;
grant execute on function public.preview_stats_access_invite(text) to authenticated;
grant execute on function public.accept_stats_share_invite(text) to authenticated;
grant execute on function public.decline_stats_share_invite(text) to authenticated;

notify pgrst, 'reload schema';
