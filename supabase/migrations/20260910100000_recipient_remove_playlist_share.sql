create or replace function public.remove_received_playlist_share(
  p_share_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select id into v_share_id
  from public.playlist_shares
  where id = p_share_id
    and recipient_user_id = auth.uid()
    and revoked_at is null
  for update;

  if not found then
    raise exception 'The active received share was not found.';
  end if;

  -- This mapping only records Analytify's update destination. Removing it does
  -- not call Spotify and therefore leaves an already-created playlist intact.
  delete from public.playlist_share_downloads
  where share_id = v_share_id
    and recipient_user_id = auth.uid();

  update public.playlist_shares
  set recipient_user_id = null,
      updated_at = now(),
      claim_expires_at = now(),
      token_hash = encode(digest(convert_to(
        'recipient-removed:' || id::text || ':' || clock_timestamp()::text,
        'UTF8'
      ), 'sha256'), 'hex')
  where id = v_share_id;
end;
$$;

comment on function public.remove_received_playlist_share(uuid) is
  'Detaches only the signed-in recipient, retires the old claim link, and removes Analytify sync metadata without deleting an external Spotify playlist. The owner may create a fresh share link later.';

revoke all on function public.remove_received_playlist_share(uuid) from public, anon;
grant execute on function public.remove_received_playlist_share(uuid) to authenticated;

notify pgrst, 'reload schema';
