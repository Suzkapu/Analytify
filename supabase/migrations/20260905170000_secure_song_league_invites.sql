alter table public.song_league_invites
  add column if not exists expires_at timestamptz,
  add column if not exists last_used_at timestamptz,
  add column if not exists usage_policy text not null default 'multi_use',
  add column if not exists use_count integer not null default 0,
  add column if not exists max_uses integer;
update public.song_league_invites set expires_at = created_at + interval '7 days' where expires_at is null;
alter table public.song_league_invites alter column expires_at set default (now() + interval '7 days');
alter table public.song_league_invites alter column expires_at set not null;
alter table public.song_league_invites drop constraint if exists song_league_invites_usage_policy_check;
alter table public.song_league_invites add constraint song_league_invites_usage_policy_check
  check (usage_policy in ('one_time', 'multi_use'));
alter table public.song_league_invites drop constraint if exists song_league_invites_max_uses_check;
alter table public.song_league_invites add constraint song_league_invites_max_uses_check
  check (max_uses is null or max_uses between 1 and 50);

create table if not exists public.song_league_rejoin_approvals (
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  approved_by uuid not null references public.users(id) on delete cascade,
  approved_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 day'),
  consumed_at timestamptz,
  primary key (league_id, user_id)
);
alter table public.song_league_rejoin_approvals enable row level security;
revoke all on public.song_league_rejoin_approvals from public, anon, authenticated;

drop function if exists public.rotate_song_league_invite(uuid, text);
create function public.rotate_song_league_invite(
  p_league_id uuid, p_invite_token text, p_expires_in_hours integer default 168,
  p_usage_policy text default 'multi_use', p_max_uses integer default null
) returns uuid language plpgsql security definer set search_path = public, extensions
as $$
declare v_id uuid;
begin
  if length(coalesce(p_invite_token, '')) < 32 then raise exception 'The invite token is invalid.'; end if;
  if p_expires_in_hours not between 1 and 720 then raise exception 'Invite expiry must be between 1 and 720 hours.'; end if;
  if p_usage_policy not in ('one_time', 'multi_use') then raise exception 'Invite usage policy is invalid.'; end if;
  if p_max_uses is not null and p_max_uses not between 1 and 50 then raise exception 'Invite usage limit is invalid.'; end if;
  perform 1 from public.song_leagues where id = p_league_id and owner_user_id = auth.uid() and closed_at is null for update;
  if not found then raise exception 'Only the league owner can create an invite.'; end if;
  insert into public.song_league_invites(league_id, token_hash, created_by, expires_at, usage_policy, max_uses)
  values (p_league_id, encode(digest(convert_to(p_invite_token, 'UTF8'), 'sha256'), 'hex'), auth.uid(),
    now() + make_interval(hours => p_expires_in_hours), p_usage_policy, p_max_uses)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.revoke_song_league_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.song_league_invites invite set revoked_at = now()
  from public.song_leagues league
  where invite.id = p_invite_id and league.id = invite.league_id and league.owner_user_id = auth.uid()
    and invite.revoked_at is null;
  if not found then raise exception 'Only the league owner can revoke an active invite.'; end if;
end;
$$;

create or replace function public.approve_song_league_rejoin(p_league_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  perform 1 from public.song_leagues where id = p_league_id and owner_user_id = auth.uid() and closed_at is null for update;
  if not found then raise exception 'Only the league owner can approve rejoining.'; end if;
  if not exists (select 1 from public.song_league_members where league_id = p_league_id and user_id = p_user_id and left_at is not null) then
    raise exception 'This user is not a departed league member.';
  end if;
  insert into public.song_league_rejoin_approvals(league_id, user_id, approved_by, approved_at, expires_at, consumed_at)
  values (p_league_id, p_user_id, auth.uid(), now(), now() + interval '1 day', null)
  on conflict (league_id, user_id) do update set approved_by = excluded.approved_by,
    approved_at = excluded.approved_at, expires_at = excluded.expires_at, consumed_at = null;
end;
$$;

create or replace function public.claim_song_league(p_invite_token text)
returns uuid language plpgsql security definer set search_path = public, extensions
as $$
declare v_user_id uuid := auth.uid(); v_invite public.song_league_invites%rowtype;
  v_profile public.users%rowtype; v_member_count integer; v_member_limit integer; v_departed boolean;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  select invite.* into v_invite from public.song_league_invites invite
  join public.song_leagues league on league.id = invite.league_id
  where invite.token_hash = encode(digest(convert_to(coalesce(p_invite_token, ''), 'UTF8'), 'sha256'), 'hex')
    and invite.revoked_at is null and invite.expires_at > now()
    and (invite.max_uses is null or invite.use_count < invite.max_uses) and league.closed_at is null
  for update of invite;
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
    joined_at = excluded.joined_at, left_at = null;
  update public.song_league_invites set last_used_at = now(), use_count = use_count + 1,
    revoked_at = case when usage_policy = 'one_time' or (max_uses is not null and use_count + 1 >= max_uses) then now() else revoked_at end
  where id = v_invite.id;
  update public.song_league_rejoin_approvals set consumed_at = now()
  where league_id = v_invite.league_id and user_id = v_user_id and consumed_at is null;
  return v_invite.league_id;
end;
$$;

revoke all on function public.rotate_song_league_invite(uuid, text, integer, text, integer) from public;
revoke all on function public.revoke_song_league_invite(uuid) from public;
revoke all on function public.approve_song_league_rejoin(uuid, uuid) from public;
grant execute on function public.rotate_song_league_invite(uuid, text, integer, text, integer) to authenticated;
grant execute on function public.revoke_song_league_invite(uuid) to authenticated;
grant execute on function public.approve_song_league_rejoin(uuid, uuid) to authenticated;
notify pgrst, 'reload schema';
