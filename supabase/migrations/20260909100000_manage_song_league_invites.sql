create or replace function public.list_song_league_invites(p_league_id uuid)
returns table(
  invite_id uuid,
  created_at timestamptz,
  expires_at timestamptz,
  usage_policy text,
  use_count integer,
  max_uses integer,
  last_used_at timestamptz
)
language plpgsql security definer set search_path = public, pg_catalog
as $$
begin
  if not exists (
    select 1 from public.song_leagues league
    where league.id = p_league_id and league.owner_user_id = auth.uid() and league.closed_at is null
  ) then raise exception 'Only the league owner can list active invitations.'; end if;
  return query
  select invite.id, invite.created_at, invite.expires_at, invite.usage_policy,
    invite.use_count, invite.max_uses, invite.last_used_at
  from public.song_league_invites invite
  where invite.league_id = p_league_id and invite.revoked_at is null and invite.expires_at > now()
    and (invite.max_uses is null or invite.use_count < invite.max_uses)
  order by invite.created_at desc;
end;
$$;

create or replace function public.revoke_all_song_league_invites(p_league_id uuid)
returns integer language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_revoked integer;
begin
  perform 1 from public.song_leagues league
  where league.id = p_league_id and league.owner_user_id = auth.uid() and league.closed_at is null
  for update;
  if not found then raise exception 'Only the league owner can revoke invitations.'; end if;
  update public.song_league_invites invite set revoked_at = now()
  where invite.league_id = p_league_id and invite.revoked_at is null and invite.expires_at > now()
    and (invite.max_uses is null or invite.use_count < invite.max_uses);
  get diagnostics v_revoked = row_count;
  return v_revoked;
end;
$$;

revoke select on public.song_league_invites from authenticated;
revoke all on function public.list_song_league_invites(uuid) from public, anon;
revoke all on function public.revoke_all_song_league_invites(uuid) from public, anon;
grant execute on function public.list_song_league_invites(uuid) to authenticated;
grant execute on function public.revoke_all_song_league_invites(uuid) to authenticated;

notify pgrst, 'reload schema';
