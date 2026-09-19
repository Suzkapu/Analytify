alter table public.playlist_share_downloads
  add column if not exists revoked_at timestamptz;

create table if not exists public.playlist_share_revocations (
  share_id uuid primary key references public.playlist_shares(id) on delete cascade,
  owner_user_id uuid not null references public.users(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  revoked_at timestamptz not null default now()
);

alter table public.playlist_share_revocations enable row level security;

drop policy if exists "Participants can read playlist share revocations"
  on public.playlist_share_revocations;
create policy "Participants can read playlist share revocations"
  on public.playlist_share_revocations
  for select
  to authenticated
  using (owner_user_id = auth.uid() or recipient_user_id = auth.uid());

grant select on public.playlist_share_revocations to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'playlist_share_revocations'
  ) then
    alter publication supabase_realtime add table public.playlist_share_revocations;
  end if;
end $$;

create or replace function public.revoke_playlist_share(
  p_share_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share public.playlist_shares%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select * into v_share
  from public.playlist_shares
  where id = p_share_id
    and owner_user_id = auth.uid()
  for update;

  if not found then
    raise exception 'The share was not found or is not owned by this user.';
  end if;

  -- Retrying a completed revoke is safe. This is important when the client did
  -- not receive the response before going offline.
  if v_share.revoked_at is not null then
    return;
  end if;

  if v_share.recipient_user_id is not null then
    insert into public.playlist_share_revocations(
      share_id, owner_user_id, recipient_user_id, revoked_at
    ) values (
      v_share.id, v_share.owner_user_id, v_share.recipient_user_id, now()
    )
    on conflict (share_id) do nothing;
  end if;

  -- Keep the Spotify destination as an inaccessible audit tombstone. Analytify
  -- never calls Spotify's delete/unfollow APIs during revocation.
  update public.playlist_share_downloads
  set revoked_at = now(),
      sync_lease_token = null,
      sync_lease_expires_at = null,
      updated_at = now()
  where share_id = v_share.id;

  delete from public.playlist_share_tracks where share_id = v_share.id;

  update public.playlist_shares
  set revoked_at = now(),
      updated_at = now(),
      playlist_description = '',
      playlist_image_url = '',
      owner_image_url = '',
      token_hash = encode(digest(convert_to('revoked:' || id::text, 'UTF8'), 'sha256'), 'hex'),
      snapshot_hash = encode(digest(convert_to('[]', 'UTF8'), 'sha256'), 'hex'),
      track_count = 0
  where id = v_share.id;
end;
$$;

comment on table public.playlist_share_revocations is
  'Minimal access-control events used to remove revoked shares from online recipients. Contains no playlist content.';
comment on column public.playlist_share_downloads.revoked_at is
  'Stops Analytify synchronization while retaining the external Spotify destination as an audit tombstone; Spotify content is not deleted.';
comment on function public.revoke_playlist_share(uuid) is
  'Idempotently revokes recipient access and synchronization without deleting or unfollowing any Spotify playlist.';

revoke all on function public.revoke_playlist_share(uuid) from public, anon;
grant execute on function public.revoke_playlist_share(uuid) to authenticated;

notify pgrst, 'reload schema';
