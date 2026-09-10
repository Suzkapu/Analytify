create table if not exists public.song_league_rejoin_requests (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'joined')),
  requested_at timestamptz not null default now(),
  request_expires_at timestamptz not null default (now() + interval '7 days'),
  responded_at timestamptz,
  approval_expires_at timestamptz,
  unique (league_id, user_id)
);
alter table public.song_league_rejoin_requests enable row level security;
revoke all on public.song_league_rejoin_requests from public, anon, authenticated;

create or replace function private.song_league_rejoin_status(
  p_status text, p_request_expires_at timestamptz, p_approval_expires_at timestamptz
) returns text language sql stable set search_path = pg_catalog
as $$
  select case
    when p_status = 'pending' and p_request_expires_at <= now() then 'expired'
    when p_status = 'approved' and coalesce(p_approval_expires_at, '-infinity') <= now() then 'expired'
    else p_status
  end;
$$;

create or replace function public.request_song_league_rejoin(p_invite_token text)
returns table(request_id uuid, league_id uuid, league_name text, user_id uuid, display_name text,
  image_url text, status text, requested_at timestamptz, request_expires_at timestamptz,
  responded_at timestamptz, approval_expires_at timestamptz)
language plpgsql security definer set search_path = public, private, extensions, pg_catalog
as $$
declare v_user_id uuid := auth.uid(); v_invite public.song_league_invites%rowtype;
  v_request public.song_league_rejoin_requests%rowtype; v_profile public.users%rowtype; v_name text;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  select invite.* into v_invite from public.song_league_invites invite
  join public.song_leagues league on league.id = invite.league_id
  where invite.token_hash = encode(digest(convert_to(coalesce(p_invite_token, ''), 'UTF8'), 'sha256'), 'hex')
    and invite.revoked_at is null and invite.expires_at > now()
    and (invite.max_uses is null or invite.use_count < invite.max_uses) and league.closed_at is null;
  if not found then raise exception 'This Song League invitation is invalid, expired, exhausted, or revoked.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('league-rejoin:' || v_invite.league_id::text || ':' || v_user_id::text, 0));
  select * into v_profile from public.users where id = v_user_id;
  if not found or not v_profile.backup_active then raise exception 'Enable Cloud Backup before requesting to rejoin.'; end if;
  if not exists (select 1 from public.song_league_members member where member.league_id = v_invite.league_id
    and member.user_id = v_user_id and member.left_at is not null) then
    raise exception 'Only a departed member can request to rejoin this league.';
  end if;
  if exists (select 1 from public.song_league_members member where member.league_id = v_invite.league_id
    and member.user_id = v_user_id and member.left_at is null) then raise exception 'You are already a member of this league.'; end if;
  insert into public.song_league_rejoin_requests(league_id, user_id, status, requested_at,
    request_expires_at, responded_at, approval_expires_at)
  values (v_invite.league_id, v_user_id, 'pending', now(), now() + interval '7 days', null, null)
  on conflict on constraint song_league_rejoin_requests_league_id_user_id_key
  do update set status = 'pending', requested_at = now(),
    request_expires_at = now() + interval '7 days', responded_at = null, approval_expires_at = null
  where private.song_league_rejoin_status(song_league_rejoin_requests.status,
    song_league_rejoin_requests.request_expires_at, song_league_rejoin_requests.approval_expires_at)
    in ('declined', 'expired', 'joined')
  returning * into v_request;
  if v_request.id is null then
    select request.* into v_request from public.song_league_rejoin_requests request
      where request.league_id = v_invite.league_id and request.user_id = v_user_id;
  end if;
  select league.name into v_name from public.song_leagues league where league.id = v_invite.league_id;
  return query select v_request.id, v_request.league_id, v_name, v_request.user_id,
    coalesce(nullif(v_profile.display_name, ''), 'Analytify user'), coalesce(v_profile.profile_pic_url, ''),
    private.song_league_rejoin_status(v_request.status, v_request.request_expires_at, v_request.approval_expires_at),
    v_request.requested_at, v_request.request_expires_at, v_request.responded_at, v_request.approval_expires_at;
end;
$$;

create or replace function public.get_my_song_league_rejoin_request(p_invite_token text)
returns table(request_id uuid, league_id uuid, league_name text, user_id uuid, display_name text,
  image_url text, status text, requested_at timestamptz, request_expires_at timestamptz,
  responded_at timestamptz, approval_expires_at timestamptz)
language plpgsql stable security definer set search_path = public, private, extensions, pg_catalog
as $$
declare v_invite public.song_league_invites%rowtype;
begin
  select invite.* into v_invite from public.song_league_invites invite
  join public.song_leagues league on league.id = invite.league_id
  where invite.token_hash = encode(digest(convert_to(coalesce(p_invite_token, ''), 'UTF8'), 'sha256'), 'hex')
    and invite.revoked_at is null and invite.expires_at > now() and league.closed_at is null;
  if not found then return; end if;
  return query select request.id, request.league_id, league.name, request.user_id,
    coalesce(nullif(account.display_name, ''), member.display_name, 'Analytify user'),
    coalesce(account.profile_pic_url, member.image_url, ''),
    private.song_league_rejoin_status(request.status, request.request_expires_at, request.approval_expires_at),
    request.requested_at, request.request_expires_at, request.responded_at, request.approval_expires_at
  from public.song_league_rejoin_requests request
  join public.song_leagues league on league.id = request.league_id
  join public.users account on account.id = request.user_id
  left join public.song_league_members member on member.league_id = request.league_id and member.user_id = request.user_id
  where request.league_id = v_invite.league_id and request.user_id = auth.uid();
end;
$$;

create or replace function public.list_song_league_rejoin_requests(p_league_id uuid)
returns table(request_id uuid, league_id uuid, league_name text, user_id uuid, display_name text,
  image_url text, status text, requested_at timestamptz, request_expires_at timestamptz,
  responded_at timestamptz, approval_expires_at timestamptz)
language plpgsql stable security definer set search_path = public, private
as $$
begin
  if not exists (select 1 from public.song_leagues where id = p_league_id
    and owner_user_id = auth.uid() and closed_at is null) then
    raise exception 'Only the league owner can review rejoin requests.';
  end if;
  return query select request.id, request.league_id, league.name, request.user_id,
    coalesce(nullif(account.display_name, ''), member.display_name, 'Analytify user'),
    coalesce(account.profile_pic_url, member.image_url, ''),
    private.song_league_rejoin_status(request.status, request.request_expires_at, request.approval_expires_at),
    request.requested_at, request.request_expires_at, request.responded_at, request.approval_expires_at
  from public.song_league_rejoin_requests request
  join public.song_leagues league on league.id = request.league_id
  join public.users account on account.id = request.user_id
  left join public.song_league_members member on member.league_id = request.league_id and member.user_id = request.user_id
  where request.league_id = p_league_id and request.status <> 'joined'
  order by (request.status = 'pending') desc, request.requested_at desc;
end;
$$;

create or replace function public.respond_song_league_rejoin_request(p_request_id uuid, p_decision text)
returns void language plpgsql security definer set search_path = public, private, pg_catalog
as $$
declare v_request public.song_league_rejoin_requests%rowtype; v_count integer; v_limit integer;
begin
  if p_decision not in ('approved', 'declined') then raise exception 'Choose approved or declined.'; end if;
  select request.* into v_request from public.song_league_rejoin_requests request
  join public.song_leagues league on league.id = request.league_id
  where request.id = p_request_id and league.owner_user_id = auth.uid() and league.closed_at is null
  for update of request;
  if not found then raise exception 'The pending rejoin request was not found.'; end if;
  if private.song_league_rejoin_status(v_request.status, v_request.request_expires_at,
    v_request.approval_expires_at) <> 'pending' then raise exception 'This rejoin request is no longer pending.'; end if;
  if p_decision = 'approved' then
    select max_members into v_limit from public.song_leagues where id = v_request.league_id for update;
    select count(*)::integer into v_count from public.song_league_members
      where league_id = v_request.league_id and left_at is null;
    if v_count >= v_limit then raise exception 'This Song League is full. Increase its capacity or remove a member first.'; end if;
    insert into public.song_league_rejoin_approvals(league_id, user_id, approved_by, approved_at, expires_at, consumed_at)
    values (v_request.league_id, v_request.user_id, auth.uid(), now(), now() + interval '1 day', null)
    on conflict (league_id, user_id) do update set approved_by = excluded.approved_by,
      approved_at = excluded.approved_at, expires_at = excluded.expires_at, consumed_at = null;
  else
    delete from public.song_league_rejoin_approvals where league_id = v_request.league_id and user_id = v_request.user_id;
  end if;
  update public.song_league_rejoin_requests set status = p_decision, responded_at = now(),
    approval_expires_at = case when p_decision = 'approved' then now() + interval '1 day' else null end
  where id = p_request_id;
end;
$$;

create or replace function public.approve_song_league_rejoin(p_league_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare v_request_id uuid;
begin
  select id into v_request_id from public.song_league_rejoin_requests where league_id = p_league_id
    and user_id = p_user_id and status = 'pending' and request_expires_at > now();
  if not found then raise exception 'A pending rejoin request is required.'; end if;
  perform public.respond_song_league_rejoin_request(v_request_id, 'approved');
end;
$$;

-- Preserve the secure invitation semantics while consuming an explicit approval.
create or replace function public.claim_song_league(p_invite_token text)
returns uuid language plpgsql security definer set search_path = public, extensions, pg_catalog
as $$
declare v_user_id uuid := auth.uid(); v_invite public.song_league_invites%rowtype;
  v_profile public.users%rowtype; v_member_count integer; v_member_limit integer; v_departed boolean;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  select invite.* into v_invite from public.song_league_invites invite join public.song_leagues league on league.id = invite.league_id
  where invite.token_hash = encode(digest(convert_to(coalesce(p_invite_token, ''), 'UTF8'), 'sha256'), 'hex')
    and invite.revoked_at is null and invite.expires_at > now()
    and (invite.max_uses is null or invite.use_count < invite.max_uses) and league.closed_at is null for update of invite;
  if not found then raise exception 'This Song League invitation is invalid, expired, exhausted, or revoked.'; end if;
  select max_members into v_member_limit from public.song_leagues where id = v_invite.league_id and closed_at is null for update;
  select * into v_profile from public.users where id = v_user_id;
  if not found or not v_profile.backup_active then raise exception 'Enable Cloud Backup before joining a Song League.'; end if;
  select exists(select 1 from public.song_league_members where league_id = v_invite.league_id and user_id = v_user_id and left_at is not null) into v_departed;
  if v_departed and not exists (select 1 from public.song_league_rejoin_approvals where league_id = v_invite.league_id
    and user_id = v_user_id and consumed_at is null and expires_at > now()) then
    raise exception 'The league owner must approve this user before they can rejoin.';
  end if;
  select count(*)::integer into v_member_count from public.song_league_members where league_id = v_invite.league_id and left_at is null;
  if v_member_count >= v_member_limit and not exists (select 1 from public.song_league_members where league_id = v_invite.league_id and user_id = v_user_id and left_at is null) then
    raise exception 'This Song League has reached its % member limit.', v_member_limit;
  end if;
  insert into public.song_league_members(league_id, user_id, role, display_name, image_url, joined_at, left_at)
  values (v_invite.league_id, v_user_id, 'member', coalesce(nullif(trim(v_profile.display_name), ''), 'Spotify user'),
    coalesce(v_profile.profile_pic_url, ''), now(), null)
  on conflict (league_id, user_id) do update set display_name = excluded.display_name, image_url = excluded.image_url,
    joined_at = excluded.joined_at, left_at = null, role = 'member';
  update public.song_league_invites set last_used_at = now(), use_count = use_count + 1,
    revoked_at = case when usage_policy = 'one_time' or (max_uses is not null and use_count + 1 >= max_uses) then now() else revoked_at end
    where id = v_invite.id;
  update public.song_league_rejoin_approvals set consumed_at = now()
    where league_id = v_invite.league_id and user_id = v_user_id and consumed_at is null;
  update public.song_league_rejoin_requests set status = 'joined', responded_at = coalesce(responded_at, now())
    where league_id = v_invite.league_id and user_id = v_user_id;
  return v_invite.league_id;
end;
$$;

revoke all on function private.song_league_rejoin_status(text, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.request_song_league_rejoin(text) from public, anon;
revoke all on function public.get_my_song_league_rejoin_request(text) from public, anon;
revoke all on function public.list_song_league_rejoin_requests(uuid) from public, anon;
revoke all on function public.respond_song_league_rejoin_request(uuid, text) from public, anon;
grant execute on function public.request_song_league_rejoin(text) to authenticated;
grant execute on function public.get_my_song_league_rejoin_request(text) to authenticated;
grant execute on function public.list_song_league_rejoin_requests(uuid) to authenticated;
grant execute on function public.respond_song_league_rejoin_request(uuid, text) to authenticated;

notify pgrst, 'reload schema';
