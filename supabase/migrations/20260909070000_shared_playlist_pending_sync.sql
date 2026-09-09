-- Reserve a recipient destination before touching Spotify. A nullable mapping is
-- intentional while the first copy is being created; the immutable share ID is
-- the recovery operation ID until completion records the Spotify destination.
alter table public.playlist_share_downloads
  alter column spotify_playlist_id drop not null;

create or replace function public.claim_playlist_share_sync(
  p_share_id uuid,
  p_recipient_user_id uuid,
  p_expected_source_revision bigint,
  p_expected_applied_revision bigint,
  p_lease_token uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid := case when auth.role() = 'service_role' then p_recipient_user_id else auth.uid() end;
  v_source_revision bigint;
begin
  if v_recipient is null or p_lease_token is null then return false; end if;

  select revision into v_source_revision
  from public.playlist_shares
  where id = p_share_id
    and recipient_user_id = v_recipient
    and revoked_at is null
  for update;
  if not found or v_source_revision <> p_expected_source_revision then return false; end if;

  -- The pending row is durable even if Spotify succeeds but the browser loses
  -- its response. A retry can claim it and discover the marker on Spotify.
  if p_expected_applied_revision = 0 then
    insert into public.playlist_share_downloads(
      share_id, recipient_user_id, spotify_playlist_id, spotify_playlist_url, applied_revision
    ) values (
      p_share_id, v_recipient, null, '', 0
    ) on conflict (share_id, recipient_user_id) do nothing;
  end if;

  update public.playlist_share_downloads
  set sync_lease_token = p_lease_token,
      sync_lease_expires_at = now() + interval '10 minutes'
  where share_id = p_share_id
    and recipient_user_id = v_recipient
    and applied_revision = p_expected_applied_revision
    and applied_revision < p_expected_source_revision
    and (sync_lease_expires_at is null or sync_lease_expires_at <= now() or sync_lease_token = p_lease_token);
  return found;
end;
$$;

revoke all on function public.claim_playlist_share_sync(uuid, uuid, bigint, bigint, uuid) from public;
grant execute on function public.claim_playlist_share_sync(uuid, uuid, bigint, bigint, uuid) to authenticated, service_role;

comment on function public.claim_playlist_share_sync(uuid, uuid, bigint, bigint, uuid) is
  'Reserves and leases a recipient destination before Spotify side effects; the share ID is the stable recovery operation.';

notify pgrst, 'reload schema';
