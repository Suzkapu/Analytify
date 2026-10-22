-- Development-only contract. Apply only to an explicitly isolated backend.
-- Friendship never writes Stats grants, playlist shares or notification queues.
create table private.friend_invitations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  recipient_user_id uuid references public.users(id) on delete cascade,
  responded_by_user_id uuid references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check ((status in ('accepted','declined')) = (responded_by_user_id is not null)),
  check ((status = 'pending') = (responded_at is null)),
  check (owner_user_id <> responded_by_user_id),
  check (owner_user_id <> recipient_user_id),
  check (responded_by_user_id is null or (recipient_user_id is not null and responded_by_user_id = recipient_user_id))
);
create index friend_invitations_recipient_idx on private.friend_invitations(recipient_user_id,created_at desc,id) where status='pending';
create index friend_invitations_owner_idx on private.friend_invitations(owner_user_id, created_at desc, id);
create table private.friendships (
  id uuid primary key default gen_random_uuid(),
  connection_version uuid not null default gen_random_uuid(),
  lower_user_id uuid not null references public.users(id) on delete cascade,
  upper_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  unique(lower_user_id,upper_user_id),
  check (lower_user_id < upper_user_id)
);
create index friendships_upper_idx on private.friendships(upper_user_id);
alter table private.friend_invitations enable row level security;
alter table private.friendships enable row level security;
revoke all on private.friend_invitations, private.friendships from public, anon, authenticated;

create function private.require_friend_actor() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Authentication is required.' using errcode='42501'; end if;
  if not exists(select 1 from public.users where id=actor and verified_spotify_id is not null) then
    raise exception 'A verified Spotify profile is required.' using errcode='42501';
  end if;
  return actor;
end $$;
revoke all on function private.require_friend_actor() from public, anon, authenticated;

create function public.create_friend_invitation(p_claim_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_friend_actor(); invitation private.friend_invitations%rowtype; token_digest text;
begin
  if p_claim_token is null or p_claim_token !~ '^[0-9a-f]{64}$' then
    raise exception 'A secure invitation token is required.' using errcode='22023';
  end if;
  token_digest := encode(extensions.digest(convert_to(p_claim_token,'UTF8'),'sha256'),'hex');
  -- Serializes the owner's quota and retries without storing the bearer secret.
  perform 1 from public.users where id=actor for update;
  select * into invitation from private.friend_invitations where token_hash=token_digest;
  if found then
    if invitation.owner_user_id <> actor then raise exception 'This invitation is unavailable.' using errcode='42501'; end if;
  else
    if (select count(*) from private.friend_invitations where owner_user_id=actor and status='pending') >= 20 then
      raise exception 'Revoke a pending invitation before creating another.' using errcode='54000';
    end if;
    insert into private.friend_invitations(owner_user_id,token_hash) values(actor,token_digest) returning * into invitation;
  end if;
  return jsonb_build_object('id',invitation.id,'status',invitation.status,'createdAt',invitation.created_at);
end $$;

create function public.preview_friend_invitation(p_claim_token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := private.require_friend_actor(); invitation private.friend_invitations%rowtype; profile public.users%rowtype;
begin
  if p_claim_token is null or p_claim_token !~ '^[0-9a-f]{64}$' then
    raise exception 'This invitation is unavailable.' using errcode='22023';
  end if;
  select * into invitation from private.friend_invitations
    where token_hash=encode(extensions.digest(convert_to(p_claim_token,'UTF8'),'sha256'),'hex');
  if not found or invitation.owner_user_id=actor or invitation.status <> 'pending'
    or (invitation.recipient_user_id is not null and invitation.recipient_user_id <> actor) then
    raise exception 'This invitation is unavailable.' using errcode='22023';
  end if;
  select * into profile from public.users where id=invitation.owner_user_id;
  return jsonb_build_object('id',invitation.id,'inviterUserId',profile.id,
    'displayName',coalesce(nullif(trim(profile.display_name),''),'Spotify user'),
    'imageUrl',coalesce(profile.profile_pic_url,''));
end $$;

create function private.decide_friend_invitation(p_invitation_id uuid,p_accept boolean,p_require_received boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_friend_actor(); invitation private.friend_invitations%rowtype; connection private.friendships%rowtype;
begin
  if p_accept is null then
    raise exception 'A valid invitation decision is required.' using errcode='22023';
  end if;
  select * into invitation from private.friend_invitations
    where id=p_invitation_id for update;
  if not found or invitation.owner_user_id=actor or invitation.status='revoked'
    or (invitation.status='pending' and invitation.recipient_user_id is not null and invitation.recipient_user_id <> actor)
    or (p_require_received and invitation.recipient_user_id is null) then
    raise exception 'This invitation is unavailable.' using errcode='22023';
  end if;
  if invitation.status <> 'pending' then
    if invitation.responded_by_user_id <> actor or (invitation.status='accepted') <> p_accept then
      raise exception 'This invitation has already been answered.' using errcode='22023';
    end if;
  else
    if p_accept then
      insert into private.friendships(lower_user_id,upper_user_id)
        values(least(actor,invitation.owner_user_id),greatest(actor,invitation.owner_user_id))
        on conflict(lower_user_id,upper_user_id) do update
          set connection_version=case when private.friendships.removed_at is null then private.friendships.connection_version else gen_random_uuid() end,
            removed_at=null,created_at=case when private.friendships.removed_at is null then private.friendships.created_at else now() end;
    end if;
    update private.friend_invitations set status=case when p_accept then 'accepted' else 'declined' end,
      recipient_user_id=actor,responded_by_user_id=actor,responded_at=now() where id=invitation.id returning * into invitation;
  end if;
  -- Retried accepted requests report the saved result and never resurrect removal.
  select * into connection from private.friendships
    where lower_user_id=least(actor,invitation.owner_user_id) and upper_user_id=greatest(actor,invitation.owner_user_id);
  return jsonb_build_object('id',invitation.id,'status',invitation.status,
    'isConnected',p_accept and connection.id is not null and connection.removed_at is null);
end $$;

revoke all on function private.decide_friend_invitation(uuid,boolean,boolean) from public,anon,authenticated;

create function public.respond_friend_invitation(p_claim_token text,p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare invitation_id uuid;
begin
  perform private.require_friend_actor();
  if p_accept is null or p_claim_token is null or p_claim_token !~ '^[0-9a-f]{64}$' then
    raise exception 'A valid invitation decision is required.' using errcode='22023';
  end if;
  select id into invitation_id from private.friend_invitations
    where token_hash=encode(extensions.digest(convert_to(p_claim_token,'UTF8'),'sha256'),'hex');
  return private.decide_friend_invitation(invitation_id,p_accept,false);
end $$;

-- Opening the invitation as a verified actor reserves its one recipient.
-- It never accepts friendship; the saved request supports another device/reload.
create function public.receive_friend_invitation(p_claim_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_friend_actor(); invitation private.friend_invitations%rowtype;
begin
  if p_claim_token is null or p_claim_token !~ '^[0-9a-f]{64}$' then
    raise exception 'This invitation is unavailable.' using errcode='22023';
  end if;
  select * into invitation from private.friend_invitations
    where token_hash=encode(extensions.digest(convert_to(p_claim_token,'UTF8'),'sha256'),'hex') for update;
  if not found or invitation.owner_user_id=actor or invitation.status <> 'pending'
    or (invitation.recipient_user_id is not null and invitation.recipient_user_id <> actor) then
    raise exception 'This invitation is unavailable.' using errcode='22023';
  end if;
  if invitation.recipient_user_id is null then
    update private.friend_invitations set recipient_user_id=actor where id=invitation.id;
  end if;
  return public.preview_friend_invitation(p_claim_token);
end $$;

create function public.respond_friend_request(p_invitation_id uuid,p_accept boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return private.decide_friend_invitation(p_invitation_id,p_accept,true);
end $$;

create function public.list_friend_requests(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := private.require_friend_actor(); result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception 'Invalid request page.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(item.value order by item.created_at desc,item.id),'[]'::jsonb) into result from (
    select invitation.created_at,invitation.id,jsonb_build_object('requestId',invitation.id,
      'inviterUserId',profile.id,'displayName',coalesce(nullif(trim(profile.display_name),''),'Spotify user'),
      'imageUrl',coalesce(profile.profile_pic_url,''),'createdAt',invitation.created_at) as value
    from private.friend_invitations invitation join public.users profile on profile.id=invitation.owner_user_id
    where invitation.recipient_user_id=actor and invitation.status='pending'
    order by invitation.created_at desc,invitation.id limit p_limit offset p_offset
  ) item;
  return result;
end $$;

create function public.revoke_friend_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_friend_actor(); invitation private.friend_invitations%rowtype;
begin
  select * into invitation from private.friend_invitations where id=p_invitation_id for update;
  if not found or invitation.owner_user_id <> actor then
    raise exception 'This invitation is unavailable.' using errcode='42501';
  end if;
  if invitation.status='pending' then
    update private.friend_invitations set status='revoked',responded_at=now() where id=invitation.id;
  end if;
end $$;

create function public.remove_friend(p_friend_user_id uuid,p_connection_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.require_friend_actor();
begin
  if p_friend_user_id is null or p_friend_user_id=actor then raise exception 'Choose another friend.' using errcode='22023'; end if;
  if p_connection_version is null then raise exception 'A connection version is required.' using errcode='22023'; end if;
  update private.friendships set removed_at=coalesce(removed_at,now())
    where lower_user_id=least(actor,p_friend_user_id) and upper_user_id=greatest(actor,p_friend_user_id)
      and connection_version=p_connection_version;
end $$;

create function public.list_friends(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := private.require_friend_actor(); result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception 'Invalid friends page.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(item.value order by item.created_at,item.id),'[]'::jsonb) into result from (
    select connection.created_at,connection.id,jsonb_build_object('userId',profile.id,
      'displayName',coalesce(nullif(trim(profile.display_name),''),'Spotify user'),
      'imageUrl',coalesce(profile.profile_pic_url,''),'connectedAt',connection.created_at,
      'connectionVersion',connection.connection_version) as value
    from private.friendships connection join public.users profile on profile.id=
      case when connection.lower_user_id=actor then connection.upper_user_id else connection.lower_user_id end
    where (connection.lower_user_id=actor or connection.upper_user_id=actor) and connection.removed_at is null
    order by connection.created_at,connection.id limit p_limit offset p_offset
  ) item;
  return result;
end $$;

create function public.list_friend_invitations(p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := private.require_friend_actor(); result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset < 0 then
    raise exception 'Invalid invitation page.' using errcode='22023';
  end if;
  select coalesce(jsonb_agg(item.value order by item.created_at desc,item.id),'[]'::jsonb) into result from (
    select invitation.created_at,invitation.id,jsonb_build_object('id',invitation.id,'status',invitation.status,
      'createdAt',invitation.created_at,'respondedAt',invitation.responded_at) as value
    from private.friend_invitations invitation where invitation.owner_user_id=actor
    order by invitation.created_at desc,invitation.id limit p_limit offset p_offset
  ) item;
  return result;
end $$;

revoke all on function public.create_friend_invitation(text), public.preview_friend_invitation(text),
  public.respond_friend_invitation(text,boolean), public.revoke_friend_invitation(uuid), public.remove_friend(uuid,uuid),
  public.list_friends(integer,integer), public.list_friend_invitations(integer,integer),
  public.receive_friend_invitation(text),public.respond_friend_request(uuid,boolean),public.list_friend_requests(integer,integer) from public, anon;
grant execute on function public.create_friend_invitation(text), public.preview_friend_invitation(text),
  public.respond_friend_invitation(text,boolean), public.revoke_friend_invitation(uuid), public.remove_friend(uuid,uuid),
  public.list_friends(integer,integer), public.list_friend_invitations(integer,integer),
  public.receive_friend_invitation(text),public.respond_friend_request(uuid,boolean),public.list_friend_requests(integer,integer) to authenticated;
notify pgrst, 'reload schema';
