-- Creating another invitation must not invalidate links that were already sent.
-- The public function name is retained for backwards compatibility with
-- deployed clients, but it now appends an independent active invite.
create or replace function public.rotate_song_league_invite(
  p_league_id uuid,
  p_invite_token text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if length(coalesce(p_invite_token, '')) < 32 then
    raise exception 'The invite token is invalid.';
  end if;

  if not exists (
    select 1 from public.song_leagues
    where id = p_league_id and owner_user_id = auth.uid() and closed_at is null
  ) then
    raise exception 'Only the league owner can create an invite.';
  end if;

  insert into public.song_league_invites(league_id, token_hash, created_by)
  values (
    p_league_id,
    encode(digest(convert_to(p_invite_token, 'UTF8'), 'sha256'), 'hex'),
    auth.uid()
  );
end;
$$;

revoke all on function public.rotate_song_league_invite(uuid, text) from public;
grant execute on function public.rotate_song_league_invite(uuid, text) to authenticated;
