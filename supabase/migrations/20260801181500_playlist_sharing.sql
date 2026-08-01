create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.playlist_shares (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  recipient_user_id uuid references public.users(id) on delete cascade,
  source_playlist_id text not null,
  playlist_name text not null,
  playlist_description text not null default '',
  playlist_image_url text not null default '',
  owner_display_name text not null default 'Spotify user',
  owner_image_url text not null default '',
  recipient_display_name text,
  token_hash text not null unique check (length(token_hash) = 64),
  snapshot_hash text not null check (length(snapshot_hash) = 64),
  track_count integer not null default 0 check (track_count >= 0),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.playlist_share_tracks (
  share_id uuid not null references public.playlist_shares(id) on delete cascade,
  position integer not null check (position >= 0),
  track_id text not null,
  track jsonb not null,
  primary key (share_id, position),
  unique (share_id, track_id)
);

create table if not exists public.playlist_share_downloads (
  share_id uuid not null references public.playlist_shares(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  spotify_playlist_id text not null,
  spotify_playlist_url text not null default '',
  applied_revision bigint not null default 0 check (applied_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (share_id, recipient_user_id),
  unique (recipient_user_id, spotify_playlist_id)
);

create index if not exists playlist_shares_owner_idx
  on public.playlist_shares(owner_user_id, created_at desc);
create index if not exists playlist_shares_recipient_idx
  on public.playlist_shares(recipient_user_id, updated_at desc)
  where revoked_at is null;
create index if not exists playlist_shares_source_idx
  on public.playlist_shares(owner_user_id, source_playlist_id)
  where revoked_at is null;
create index if not exists playlist_share_tracks_share_idx
  on public.playlist_share_tracks(share_id, position);

alter table public.playlist_shares enable row level security;
alter table public.playlist_share_tracks enable row level security;
alter table public.playlist_share_downloads enable row level security;

drop policy if exists "Owners and active recipients can read playlist shares" on public.playlist_shares;
create policy "Owners and active recipients can read playlist shares"
  on public.playlist_shares
  for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or (recipient_user_id = auth.uid() and revoked_at is null)
  );

drop policy if exists "Owners and active recipients can read shared tracks" on public.playlist_share_tracks;
create policy "Owners and active recipients can read shared tracks"
  on public.playlist_share_tracks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.playlist_shares share
      where share.id = playlist_share_tracks.share_id
        and (
          share.owner_user_id = auth.uid()
          or (share.recipient_user_id = auth.uid() and share.revoked_at is null)
        )
    )
  );

drop policy if exists "Active recipients can read their download mapping" on public.playlist_share_downloads;
create policy "Active recipients can read their download mapping"
  on public.playlist_share_downloads
  for select
  to authenticated
  using (
    recipient_user_id = auth.uid()
    and exists (
      select 1
      from public.playlist_shares share
      where share.id = playlist_share_downloads.share_id
        and share.recipient_user_id = auth.uid()
        and share.revoked_at is null
    )
  );

create or replace function private.insert_playlist_share_tracks(
  p_share_id uuid,
  p_tracks jsonb
) returns void
language sql
security definer
set search_path = public, extensions
as $$
  with source_tracks as (
    select
      element,
      element ->> 'id' as track_id,
      ordinality
    from jsonb_array_elements(coalesce(p_tracks, '[]'::jsonb))
      with ordinality as item(element, ordinality)
    where nullif(element ->> 'id', '') is not null
  ),
  first_occurrences as (
    select distinct on (track_id)
      element,
      track_id,
      ordinality
    from source_tracks
    order by track_id, ordinality
  ),
  ordered_tracks as (
    select
      element,
      track_id,
      row_number() over (order by ordinality)::integer - 1 as position
    from first_occurrences
  )
  insert into public.playlist_share_tracks(share_id, position, track_id, track)
  select p_share_id, position, track_id, element
  from ordered_tracks
  order by position;
$$;

create or replace function public.create_playlist_share(
  p_source_playlist_id text,
  p_playlist_name text,
  p_playlist_description text,
  p_playlist_image_url text,
  p_owner_display_name text,
  p_owner_image_url text,
  p_claim_token text,
  p_tracks jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_share_id uuid;
  v_token_hash text;
  v_snapshot_hash text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if nullif(trim(p_source_playlist_id), '') is null
    or nullif(trim(p_playlist_name), '') is null then
    raise exception 'Playlist ID and name are required.';
  end if;
  if length(coalesce(p_claim_token, '')) < 32 then
    raise exception 'The claim token is invalid.';
  end if;
  if jsonb_typeof(coalesce(p_tracks, '[]'::jsonb)) <> 'array' then
    raise exception 'Tracks must be a JSON array.';
  end if;

  v_token_hash := encode(digest(convert_to(p_claim_token, 'UTF8'), 'sha256'), 'hex');
  v_snapshot_hash := encode(digest(convert_to(coalesce(p_tracks, '[]'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.playlist_shares(
    owner_user_id,
    source_playlist_id,
    playlist_name,
    playlist_description,
    playlist_image_url,
    owner_display_name,
    owner_image_url,
    token_hash,
    snapshot_hash
  ) values (
    v_user_id,
    trim(p_source_playlist_id),
    left(trim(p_playlist_name), 100),
    left(coalesce(p_playlist_description, ''), 300),
    coalesce(p_playlist_image_url, ''),
    left(coalesce(nullif(trim(p_owner_display_name), ''), 'Spotify user'), 120),
    coalesce(p_owner_image_url, ''),
    v_token_hash,
    v_snapshot_hash
  ) returning id into v_share_id;

  perform private.insert_playlist_share_tracks(v_share_id, p_tracks);
  update public.playlist_shares
  set track_count = (
    select count(*)::integer
    from public.playlist_share_tracks
    where share_id = v_share_id
  )
  where id = v_share_id;
  return v_share_id;
end;
$$;

create or replace function public.refresh_playlist_share(
  p_share_id uuid,
  p_playlist_name text,
  p_playlist_description text,
  p_playlist_image_url text,
  p_tracks jsonb
) returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share public.playlist_shares%rowtype;
  v_snapshot_hash text;
  v_revision bigint;
begin
  select * into v_share
  from public.playlist_shares
  where id = p_share_id
  for update;

  if not found or v_share.owner_user_id <> auth.uid() or v_share.revoked_at is not null then
    raise exception 'The active share was not found or is not owned by this user.';
  end if;
  if jsonb_typeof(coalesce(p_tracks, '[]'::jsonb)) <> 'array' then
    raise exception 'Tracks must be a JSON array.';
  end if;

  v_snapshot_hash := encode(digest(convert_to(coalesce(p_tracks, '[]'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');
  v_revision := v_share.revision;

  if v_snapshot_hash <> v_share.snapshot_hash then
    delete from public.playlist_share_tracks where share_id = p_share_id;
    perform private.insert_playlist_share_tracks(p_share_id, p_tracks);
    v_revision := v_revision + 1;
  end if;

  update public.playlist_shares
  set playlist_name = left(trim(p_playlist_name), 100),
      playlist_description = left(coalesce(p_playlist_description, ''), 300),
      playlist_image_url = coalesce(p_playlist_image_url, playlist_image_url),
      snapshot_hash = v_snapshot_hash,
      track_count = (
        select count(*)::integer
        from public.playlist_share_tracks
        where share_id = p_share_id
      ),
      revision = v_revision,
      updated_at = now()
  where id = p_share_id;

  return v_revision;
end;
$$;

create or replace function public.refresh_active_playlist_shares(
  p_source_playlist_id text,
  p_playlist_name text,
  p_tracks jsonb
) returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share record;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  for v_share in
    select id, playlist_description, playlist_image_url
    from public.playlist_shares
    where owner_user_id = auth.uid()
      and source_playlist_id = p_source_playlist_id
      and revoked_at is null
  loop
    perform public.refresh_playlist_share(
      v_share.id,
      p_playlist_name,
      v_share.playlist_description,
      v_share.playlist_image_url,
      p_tracks
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.claim_playlist_share(
  p_claim_token text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_share public.playlist_shares%rowtype;
  v_recipient_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into v_share
  from public.playlist_shares
  where token_hash = encode(digest(convert_to(coalesce(p_claim_token, ''), 'UTF8'), 'sha256'), 'hex')
    and revoked_at is null
  for update;

  if not found then
    raise exception 'This share link is invalid or has been revoked.';
  end if;
  if v_share.owner_user_id = v_user_id then
    raise exception 'The owner cannot claim their own share link.';
  end if;
  if v_share.recipient_user_id is not null and v_share.recipient_user_id <> v_user_id then
    raise exception 'This share link has already been claimed.';
  end if;

  select display_name into v_recipient_name
  from public.users
  where id = v_user_id;

  update public.playlist_shares
  set recipient_user_id = v_user_id,
      recipient_display_name = coalesce(v_recipient_name, 'Spotify user'),
      accepted_at = coalesce(accepted_at, now()),
      updated_at = now()
  where id = v_share.id;

  return v_share.id;
end;
$$;

create or replace function public.revoke_playlist_share(
  p_share_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.playlist_shares
  set revoked_at = now(), updated_at = now()
  where id = p_share_id
    and owner_user_id = auth.uid()
    and revoked_at is null;

  if not found then
    raise exception 'The active share was not found or is not owned by this user.';
  end if;
end;
$$;

create or replace function public.record_playlist_share_download(
  p_share_id uuid,
  p_spotify_playlist_id text,
  p_spotify_playlist_url text,
  p_applied_revision bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.playlist_shares%rowtype;
begin
  select * into v_share
  from public.playlist_shares
  where id = p_share_id
    and recipient_user_id = auth.uid()
    and revoked_at is null;

  if not found then
    raise exception 'The active shared playlist is unavailable.';
  end if;
  if nullif(trim(p_spotify_playlist_id), '') is null then
    raise exception 'A Spotify playlist ID is required.';
  end if;
  if p_applied_revision < 0 or p_applied_revision > v_share.revision then
    raise exception 'The applied revision is invalid.';
  end if;

  insert into public.playlist_share_downloads(
    share_id,
    recipient_user_id,
    spotify_playlist_id,
    spotify_playlist_url,
    applied_revision
  ) values (
    p_share_id,
    auth.uid(),
    trim(p_spotify_playlist_id),
    coalesce(p_spotify_playlist_url, ''),
    p_applied_revision
  )
  on conflict (share_id, recipient_user_id)
  do update set
    spotify_playlist_id = excluded.spotify_playlist_id,
    spotify_playlist_url = excluded.spotify_playlist_url,
    applied_revision = excluded.applied_revision,
    updated_at = now();
end;
$$;

revoke all on function private.insert_playlist_share_tracks(uuid, jsonb) from public;
revoke all on function public.create_playlist_share(text, text, text, text, text, text, text, jsonb) from public;
revoke all on function public.refresh_playlist_share(uuid, text, text, text, jsonb) from public;
revoke all on function public.refresh_active_playlist_shares(text, text, jsonb) from public;
revoke all on function public.claim_playlist_share(text) from public;
revoke all on function public.revoke_playlist_share(uuid) from public;
revoke all on function public.record_playlist_share_download(uuid, text, text, bigint) from public;

grant execute on function public.create_playlist_share(text, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.refresh_playlist_share(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.refresh_active_playlist_shares(text, text, jsonb) to authenticated;
grant execute on function public.claim_playlist_share(text) to authenticated;
grant execute on function public.revoke_playlist_share(uuid) to authenticated;
grant execute on function public.record_playlist_share_download(uuid, text, text, bigint) to authenticated;

grant select on public.playlist_shares to authenticated;
grant select on public.playlist_share_tracks to authenticated;
grant select on public.playlist_share_downloads to authenticated;
