create or replace function public.get_song_league_standings(
  p_league_id uuid
) returns table (
  user_id uuid,
  display_name text,
  image_url text,
  role text,
  total_points bigint,
  last_seven_days_points bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not private.is_song_league_member(p_league_id) then
    raise exception 'The Song League was not found.';
  end if;

  return query
  select
    member.user_id,
    member.display_name,
    member.image_url,
    member.role,
    coalesce(sum(event.points), 0)::bigint,
    coalesce(sum(event.points) filter (where event.snapshot_date >= current_date - 6), 0)::bigint
  from public.song_league_members member
  left join public.song_league_recommendations recommendation
    on recommendation.league_id = member.league_id
    and recommendation.recommender_user_id = member.user_id
  left join public.song_league_score_events event
    on event.recommendation_id = recommendation.id
  where member.league_id = p_league_id and member.left_at is null
  group by
    member.user_id,
    member.display_name,
    member.image_url,
    member.role,
    member.joined_at
  order by coalesce(sum(event.points), 0) desc, member.joined_at asc;
end;
$$;

revoke all on function public.get_song_league_standings(uuid) from public;
grant execute on function public.get_song_league_standings(uuid) to authenticated;
