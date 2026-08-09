-- Song League owners may permanently delete their leagues after confirming in the UI.
create or replace function public.delete_song_league(
  p_league_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.song_leagues
  where id = p_league_id and owner_user_id = auth.uid();
  if not found then
    raise exception 'The league was not found or is not owned by this user.';
  end if;
end;
$$;

revoke all on function public.delete_song_league(uuid) from public;
grant execute on function public.delete_song_league(uuid) to authenticated;
