create table if not exists public.song_league_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_display_name text not null,
  subject_user_id uuid references public.users(id) on delete set null,
  subject_display_name text,
  action text not null check (action in (
    'member_left', 'member_removed', 'ownership_transferred', 'league_closed'
  )),
  occurred_at timestamptz not null default now()
);

create index if not exists song_league_lifecycle_events_league_idx
  on public.song_league_lifecycle_events(league_id, occurred_at desc);
alter table public.song_league_lifecycle_events enable row level security;

-- Active members can use a league. Everyone who belonged to a league when it
-- closed can still read its immutable history, including members who left.
create or replace function private.can_read_song_league(p_league_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.song_league_members member
    join public.song_leagues league on league.id = member.league_id
    where member.league_id = p_league_id and member.user_id = auth.uid()
      and (league.closed_at is not null or member.left_at is null)
  );
$$;

drop policy if exists "League members can read leagues" on public.song_leagues;
create policy "League members can read leagues" on public.song_leagues
  for select to authenticated using (private.can_read_song_league(id));
drop policy if exists "League members can read member profiles" on public.song_league_members;
create policy "League members can read member profiles" on public.song_league_members
  for select to authenticated using (private.can_read_song_league(league_id));
drop policy if exists "League members can read rounds" on public.song_league_rounds;
create policy "League members can read rounds" on public.song_league_rounds
  for select to authenticated using (private.can_read_song_league(league_id));
drop policy if exists "League members can read round roster" on public.song_league_round_members;
create policy "League members can read round roster" on public.song_league_round_members
  for select to authenticated using (private.can_read_song_league(league_id));
drop policy if exists "League members can read recommendations" on public.song_league_recommendations;
create policy "League members can read recommendations" on public.song_league_recommendations
  for select to authenticated using (private.can_read_song_league(league_id));
drop policy if exists "League members can read recommendation audiences" on public.song_league_recommendation_audience;
create policy "League members can read recommendation audiences" on public.song_league_recommendation_audience
  for select to authenticated using (private.can_read_song_league(league_id));
drop policy if exists "League members can read score events" on public.song_league_score_events;
create policy "League members can read score events" on public.song_league_score_events
  for select to authenticated using (private.can_read_song_league(league_id));
drop policy if exists "League members can read weekly playlist status" on public.song_league_playlists;
create policy "League members can read weekly playlist status" on public.song_league_playlists
  for select to authenticated using (private.can_read_song_league(league_id));
create policy "League members can read lifecycle events" on public.song_league_lifecycle_events
  for select to authenticated using (private.can_read_song_league(league_id));

create or replace function private.record_song_league_lifecycle(
  p_league_id uuid, p_action text, p_subject_user_id uuid default null
) returns void language plpgsql security definer set search_path = public
as $$
declare v_actor_name text; v_subject_name text;
begin
  select coalesce(nullif(member.display_name, ''), nullif(account.display_name, ''), 'Analytify user')
    into v_actor_name from public.users account
    left join public.song_league_members member on member.league_id = p_league_id and member.user_id = account.id
    where account.id = auth.uid();
  if p_subject_user_id is not null then
    select coalesce(nullif(member.display_name, ''), nullif(account.display_name, ''), 'Analytify user')
      into v_subject_name from public.users account
      left join public.song_league_members member on member.league_id = p_league_id and member.user_id = account.id
      where account.id = p_subject_user_id;
  end if;
  insert into public.song_league_lifecycle_events(
    league_id, actor_user_id, actor_display_name, subject_user_id, subject_display_name, action
  ) values (p_league_id, auth.uid(), coalesce(v_actor_name, 'Analytify user'),
    p_subject_user_id, v_subject_name, p_action);
end;
$$;

create or replace function private.cancel_song_league_member_work(
  p_league_id uuid, p_user_id uuid default null
) returns void language plpgsql security definer set search_path = public
as $$
begin
  delete from public.song_league_push_deliveries
    where league_id = p_league_id and status in ('queued', 'retry')
      and (p_user_id is null or user_id = p_user_id);
  delete from public.song_league_song_push_deliveries
    where league_id = p_league_id and status in ('queued', 'retry')
      and (p_user_id is null or user_id = p_user_id);
  if p_user_id is not null then
    update public.sync_task_state state set next_run_at = now(), updated_at = now()
      where state.task_key = 'song_league_playlists' and state.user_id in (
        select playlist.user_id from public.song_league_playlists playlist
        join public.song_league_members member on member.league_id = playlist.league_id
          and member.user_id = playlist.user_id and member.left_at is null
        where playlist.league_id = p_league_id
      );
  end if;
end;
$$;

create or replace function public.leave_song_league(p_league_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_catalog
as $$
declare v_league public.song_leagues%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  select * into v_league from public.song_leagues where id = p_league_id for update;
  if not found or v_league.closed_at is not null then raise exception 'The active league was not found.'; end if;
  if v_league.owner_user_id = auth.uid() then
    raise exception 'Transfer ownership or close the league before leaving.';
  end if;
  update public.song_league_members set left_at = now()
    where league_id = p_league_id and user_id = auth.uid() and left_at is null;
  if not found then raise exception 'Active membership was not found.'; end if;
  perform private.record_song_league_lifecycle(p_league_id, 'member_left', auth.uid());
  update public.song_leagues set playlist_revision = playlist_revision + 1 where id = p_league_id;
  perform private.cancel_song_league_member_work(p_league_id, auth.uid());
end;
$$;

create or replace function public.remove_song_league_member(p_league_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_catalog
as $$
begin
  if not exists (select 1 from public.song_leagues where id = p_league_id
    and owner_user_id = auth.uid() and closed_at is null) then
    raise exception 'Only the owner of an active league can remove members.';
  end if;
  if p_user_id = auth.uid() then raise exception 'The owner cannot remove themselves.'; end if;
  update public.song_league_members set left_at = now()
    where league_id = p_league_id and user_id = p_user_id and role = 'member' and left_at is null;
  if not found then raise exception 'The active member was not found.'; end if;
  perform private.record_song_league_lifecycle(p_league_id, 'member_removed', p_user_id);
  update public.song_leagues set playlist_revision = playlist_revision + 1 where id = p_league_id;
  perform private.cancel_song_league_member_work(p_league_id, p_user_id);
end;
$$;

create or replace function public.transfer_song_league_ownership(
  p_league_id uuid, p_new_owner_user_id uuid
) returns void language plpgsql security definer set search_path = public, private, pg_catalog
as $$
declare v_member public.song_league_members%rowtype;
begin
  if not exists (select 1 from public.song_leagues where id = p_league_id
    and owner_user_id = auth.uid() and closed_at is null for update) then
    raise exception 'Only the owner of an active league can transfer ownership.';
  end if;
  select * into v_member from public.song_league_members where league_id = p_league_id
    and user_id = p_new_owner_user_id and left_at is null and role = 'member' for update;
  if not found then raise exception 'Choose an active member as the new owner.'; end if;
  update public.song_league_members set role = case when user_id = p_new_owner_user_id then 'owner' else 'member' end
    where league_id = p_league_id and user_id in (auth.uid(), p_new_owner_user_id);
  update public.song_leagues set owner_user_id = p_new_owner_user_id,
    owner_display_name = v_member.display_name, owner_image_url = v_member.image_url
    where id = p_league_id;
  perform private.record_song_league_lifecycle(p_league_id, 'ownership_transferred', p_new_owner_user_id);
end;
$$;

create or replace function public.close_song_league(p_league_id uuid)
returns void language plpgsql security definer set search_path = public, private, pg_catalog
as $$
begin
  update public.song_leagues set closed_at = now()
    where id = p_league_id and owner_user_id = auth.uid() and closed_at is null;
  if not found then raise exception 'The active league was not found or is not owned by this user.'; end if;
  perform private.record_song_league_lifecycle(p_league_id, 'league_closed');
  update public.song_league_invites set revoked_at = now()
    where league_id = p_league_id and revoked_at is null;
  perform private.cancel_song_league_member_work(p_league_id);
end;
$$;

create or replace function public.list_song_league_lifecycle_events(p_league_id uuid)
returns table(event_id uuid, action text, actor_user_id uuid, actor_display_name text,
  subject_user_id uuid, subject_display_name text, occurred_at timestamptz)
language plpgsql stable security definer set search_path = public, private
as $$
begin
  if not private.can_read_song_league(p_league_id) then raise exception 'The Song League was not found.'; end if;
  return query select event.id, event.action, event.actor_user_id, event.actor_display_name,
    event.subject_user_id, event.subject_display_name, event.occurred_at
    from public.song_league_lifecycle_events event where event.league_id = p_league_id
    order by event.occurred_at desc;
end;
$$;

-- Closed leagues expose score history through the same narrow RPC.
create or replace function public.get_song_league_score_breakdown(
  p_league_id uuid, p_recommender_user_id uuid
) returns table (recommendation_id uuid, track_id text, track_name text, artist_names text,
  image_url text, spotify_url text, submitted_at timestamptz, scoring_starts_at timestamptz,
  scoring_ends_at timestamptz, listener_user_id uuid, listener_display_name text,
  total_points bigint, latest_rank integer, latest_list_size integer, latest_points integer,
  latest_snapshot_date date)
language plpgsql stable security definer set search_path = public, private
as $$
begin
  if not private.can_read_song_league(p_league_id) then raise exception 'The Song League was not found.'; end if;
  return query select recommendation.id, recommendation.track_id, recommendation.track_name,
    recommendation.artist_names, recommendation.image_url, recommendation.spotify_url,
    recommendation.submitted_at, recommendation.scoring_starts_at, recommendation.scoring_ends_at,
    audience.listener_user_id, listener.display_name, coalesce(totals.total_points, 0)::bigint,
    latest.matched_rank, latest.list_size, latest.points, latest.snapshot_date
  from public.song_league_recommendations recommendation
  join public.song_league_recommendation_audience audience on audience.recommendation_id = recommendation.id
  join public.song_league_members listener on listener.league_id = recommendation.league_id
    and listener.user_id = audience.listener_user_id
  left join lateral (select sum(event.points)::bigint total_points from public.song_league_score_events event
    where event.recommendation_id = recommendation.id and event.listener_user_id = audience.listener_user_id) totals on true
  left join lateral (select event.matched_rank, event.list_size, event.points, event.snapshot_date
    from public.song_league_score_events event where event.recommendation_id = recommendation.id
      and event.listener_user_id = audience.listener_user_id
    order by event.snapshot_date desc, event.scored_at desc limit 1) latest on true
  where recommendation.league_id = p_league_id and recommendation.recommender_user_id = p_recommender_user_id
  order by recommendation.submitted_at desc, listener.display_name asc;
end;
$$;

revoke all on table public.song_league_lifecycle_events from public, anon;
grant select on table public.song_league_lifecycle_events to authenticated;
revoke all on function private.can_read_song_league(uuid) from public, anon;
grant execute on function private.can_read_song_league(uuid) to authenticated;
revoke all on function private.record_song_league_lifecycle(uuid, text, uuid) from public, anon, authenticated;
revoke all on function private.cancel_song_league_member_work(uuid, uuid) from public, anon, authenticated;
revoke all on function public.remove_song_league_member(uuid, uuid) from public, anon;
revoke all on function public.transfer_song_league_ownership(uuid, uuid) from public, anon;
revoke all on function public.list_song_league_lifecycle_events(uuid) from public, anon;
grant execute on function public.remove_song_league_member(uuid, uuid) to authenticated;
grant execute on function public.transfer_song_league_ownership(uuid, uuid) to authenticated;
grant execute on function public.list_song_league_lifecycle_events(uuid) to authenticated;

notify pgrst, 'reload schema';
