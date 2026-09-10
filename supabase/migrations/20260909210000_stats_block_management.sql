create or replace function public.list_blocked_stats_users()
returns table(user_id uuid, display_name text, image_url text, blocked_at timestamptz)
language sql stable security definer set search_path = public, pg_catalog
as $$
  select profile.id,
    coalesce(nullif(trim(profile.display_name), ''), 'Spotify user')::text,
    public.safe_stats_profile_image(profile.profile_pic_url)::text,
    block.created_at
  from public.stats_user_blocks block
  join public.users profile on profile.id = block.blocked_user_id
  where block.blocker_user_id = auth.uid()
  order by block.created_at desc, profile.id
$$;

create or replace function public.unblock_stats_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  delete from public.stats_user_blocks
  where blocker_user_id = auth.uid() and blocked_user_id = p_user_id;
end
$$;

revoke all on function public.list_blocked_stats_users() from public, anon;
revoke all on function public.unblock_stats_user(uuid) from public, anon;
grant execute on function public.list_blocked_stats_users() to authenticated;
grant execute on function public.unblock_stats_user(uuid) to authenticated;
