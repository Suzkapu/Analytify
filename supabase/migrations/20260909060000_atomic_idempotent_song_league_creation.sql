alter table public.song_leagues
  add column if not exists creation_idempotency_hash text,
  add column if not exists creation_request_hash text;

alter table public.song_leagues
  drop constraint if exists song_leagues_creation_idempotency_hash_check;
alter table public.song_leagues
  add constraint song_leagues_creation_idempotency_hash_check
  check (creation_idempotency_hash is null or length(creation_idempotency_hash) = 64);
alter table public.song_leagues
  drop constraint if exists song_leagues_creation_request_hash_check;
alter table public.song_leagues
  add constraint song_leagues_creation_request_hash_check
  check (creation_request_hash is null or length(creation_request_hash) = 64);

create unique index if not exists song_leagues_owner_creation_key_idx
  on public.song_leagues(owner_user_id, creation_idempotency_hash)
  where creation_idempotency_hash is not null;

create or replace function public.create_song_league(
  p_name text,
  p_timezone text,
  p_max_members integer,
  p_invite_token text,
  p_invite_expires_in_hours integer,
  p_invite_usage_policy text,
  p_invite_max_uses integer,
  p_idempotency_key text
) returns uuid
language plpgsql security definer set search_path = public, extensions, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.users%rowtype;
  v_existing public.song_leagues%rowtype;
  v_league_id uuid;
  v_token_hash text;
  v_idempotency_hash text;
  v_request_hash text;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'A league name is required.'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'The league timezone is invalid.';
  end if;
  if p_max_members not between 2 and 50 then raise exception 'Member limit must be between 2 and 50.'; end if;
  if length(coalesce(p_invite_token, '')) not between 32 and 200 then raise exception 'The invite token is invalid.'; end if;
  if p_invite_expires_in_hours not between 1 and 720 then
    raise exception 'Invite expiry must be between 1 and 720 hours.';
  end if;
  if p_invite_usage_policy not in ('one_time', 'multi_use') then
    raise exception 'Invite usage policy is invalid.';
  end if;
  if p_invite_max_uses is not null and p_invite_max_uses not between 1 and 50 then
    raise exception 'Invite usage limit is invalid.';
  end if;
  if length(coalesce(p_idempotency_key, '')) not between 16 and 200 then
    raise exception 'A bounded idempotency key is required.';
  end if;

  v_token_hash := encode(digest(convert_to(p_invite_token, 'UTF8'), 'sha256'), 'hex');
  v_idempotency_hash := encode(digest(convert_to(p_idempotency_key, 'UTF8'), 'sha256'), 'hex');
  v_request_hash := encode(digest(convert_to(jsonb_build_array(
    left(trim(p_name), 80), p_timezone, p_max_members, v_token_hash,
    p_invite_expires_in_hours, p_invite_usage_policy, p_invite_max_uses
  )::text, 'UTF8'), 'sha256'), 'hex');

  perform pg_advisory_xact_lock(hashtextextended(
    'song-league-create:' || v_user_id::text || ':' || p_idempotency_key, 0
  ));

  select * into v_existing from public.song_leagues
  where owner_user_id = v_user_id and creation_idempotency_hash = v_idempotency_hash
  for update;
  if found then
    if v_existing.creation_request_hash is distinct from v_request_hash then
      raise exception 'This Song League creation key was already used with different details.';
    end if;
    return v_existing.id;
  end if;

  select * into v_profile from public.users where id = v_user_id;
  if not found or not v_profile.backup_active then
    raise exception 'Enable Cloud Backup before creating a Song League.';
  end if;

  insert into public.song_leagues(
    owner_user_id, name, timezone, owner_display_name, owner_image_url,
    max_members, creation_idempotency_hash, creation_request_hash
  ) values (
    v_user_id, left(trim(p_name), 80), p_timezone,
    coalesce(nullif(trim(v_profile.display_name), ''), 'Spotify user'),
    coalesce(v_profile.profile_pic_url, ''), p_max_members, v_idempotency_hash, v_request_hash
  ) returning id into v_league_id;

  insert into public.song_league_members(league_id, user_id, role, display_name, image_url)
  values (v_league_id, v_user_id, 'owner',
    coalesce(nullif(trim(v_profile.display_name), ''), 'Spotify user'),
    coalesce(v_profile.profile_pic_url, ''));

  insert into public.song_league_invites(
    league_id, token_hash, created_by, expires_at, usage_policy, max_uses
  ) values (
    v_league_id, v_token_hash, v_user_id,
    now() + make_interval(hours => p_invite_expires_in_hours),
    p_invite_usage_policy, p_invite_max_uses
  );

  return v_league_id;
end;
$$;

-- Cached clients remain atomic and retry-safe because their invite token is
-- itself stable across a retried request.
create or replace function public.create_song_league(p_name text, p_timezone text, p_invite_token text)
returns uuid language sql security definer set search_path = public, extensions, pg_catalog
as $$
  select public.create_song_league(
    p_name, p_timezone, 5, p_invite_token, 168, 'multi_use', null,
    encode(digest(convert_to('legacy:' || coalesce(p_invite_token, ''), 'UTF8'), 'sha256'), 'hex')
  );
$$;

revoke all on function public.create_song_league(text, text, integer, text, integer, text, integer, text) from public, anon;
grant execute on function public.create_song_league(text, text, integer, text, integer, text, integer, text) to authenticated;

notify pgrst, 'reload schema';
