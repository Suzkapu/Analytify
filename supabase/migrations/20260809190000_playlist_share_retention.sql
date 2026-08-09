create extension if not exists pg_cron;

alter table public.playlist_shares
  add column if not exists claim_expires_at timestamptz;

update public.playlist_shares
set claim_expires_at = created_at + interval '7 days'
where claim_expires_at is null;

alter table public.playlist_shares
  alter column claim_expires_at set default (now() + interval '7 days'),
  alter column claim_expires_at set not null;

create index if not exists playlist_shares_unclaimed_expiry_idx
  on public.playlist_shares(claim_expires_at)
  where recipient_user_id is null and revoked_at is null;

create index if not exists playlist_shares_revoked_retention_idx
  on public.playlist_shares(revoked_at)
  where revoked_at is not null;

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
  if v_share.recipient_user_id is null and v_share.claim_expires_at <= now() then
    raise exception 'This share link expired before it was claimed.';
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
set search_path = public, extensions
as $$
declare
  v_share_id uuid;
begin
  select id into v_share_id
  from public.playlist_shares
  where id = p_share_id
    and owner_user_id = auth.uid()
    and revoked_at is null
  for update;

  if not found then
    raise exception 'The active share was not found or is not owned by this user.';
  end if;

  delete from public.playlist_share_downloads where share_id = v_share_id;
  delete from public.playlist_share_tracks where share_id = v_share_id;

  update public.playlist_shares
  set revoked_at = now(),
      updated_at = now(),
      playlist_description = '',
      playlist_image_url = '',
      owner_image_url = '',
      token_hash = encode(digest(convert_to('revoked:' || id::text, 'UTF8'), 'sha256'), 'hex'),
      snapshot_hash = encode(digest(convert_to('[]', 'UTF8'), 'sha256'), 'hex'),
      track_count = 0
  where id = v_share_id;
end;
$$;

create or replace function private.cleanup_playlist_share_retention()
returns table (
  expired_unclaimed_deleted bigint,
  revoked_tombstones_deleted bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_unclaimed_deleted bigint := 0;
  v_revoked_tombstones_deleted bigint := 0;
begin
  delete from public.playlist_shares
  where recipient_user_id is null
    and revoked_at is null
    and claim_expires_at <= now();
  get diagnostics v_expired_unclaimed_deleted = row_count;

  delete from public.playlist_shares
  where revoked_at is not null
    and revoked_at <= now() - interval '30 days';
  get diagnostics v_revoked_tombstones_deleted = row_count;

  return query select v_expired_unclaimed_deleted, v_revoked_tombstones_deleted;
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
    and revoked_at is null
  for update;

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

comment on column public.playlist_shares.claim_expires_at is
  'Deadline for claiming an unclaimed share. Claimed active access remains valid until revocation.';
comment on function private.cleanup_playlist_share_retention() is
  'Deletes expired unclaimed shares and revoked share tombstones older than 30 days.';

revoke all on function public.claim_playlist_share(text) from public;
revoke all on function public.revoke_playlist_share(uuid) from public;
revoke all on function public.record_playlist_share_download(uuid, text, text, bigint) from public;
revoke all on function private.cleanup_playlist_share_retention() from public;
grant execute on function public.claim_playlist_share(text) to authenticated;
grant execute on function public.revoke_playlist_share(uuid) to authenticated;
grant execute on function public.record_playlist_share_download(uuid, text, text, bigint) to authenticated;

select cron.schedule(
  'analytify-playlist-share-retention',
  '17 3 * * *',
  $cron$select private.cleanup_playlist_share_retention();$cron$
);
