-- A round's existing baseline is immutable once recommendations begin, but a
-- member whose same-day snapshot finishes afterward must still be admitted.
create or replace function private.ensure_song_league_round(
  p_league_id uuid,
  p_now timestamptz default now()
) returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_league public.song_leagues%rowtype;
  v_local_now timestamp;
  v_today date;
  v_start timestamptz;
  v_submission_end timestamptz;
  v_scoring_end timestamptz;
  v_round_id uuid;
  v_roster_size integer;
  v_has_recommendations boolean;
begin
  select * into v_league from public.song_leagues
  where id = p_league_id and closed_at is null;
  if not found or not private.is_song_league_member(p_league_id) then
    raise exception 'The active Song League was not found.';
  end if;

  perform private.enable_song_league_sync_for_user(auth.uid());
  v_local_now := p_now at time zone v_league.timezone;
  if extract(isodow from v_local_now)::integer <> 5 then
    raise exception 'Recommendations can only be submitted on Friday in the league timezone.';
  end if;

  v_today := v_local_now::date;
  v_start := private.song_league_friday_start(v_league.timezone, p_now);
  v_submission_end := ((v_today + 1)::timestamp at time zone v_league.timezone);
  v_scoring_end := ((v_today + 29)::timestamp at time zone v_league.timezone);

  insert into public.song_league_rounds(
    league_id, starts_at, submission_ends_at, scoring_starts_at, scoring_ends_at
  ) values (p_league_id, v_start, v_submission_end, v_submission_end, v_scoring_end)
  on conflict (league_id, starts_at) do nothing;

  select id into v_round_id from public.song_league_rounds
  where league_id = p_league_id and starts_at = v_start;
  select exists(select 1 from public.song_league_recommendations where round_id = v_round_id)
    into v_has_recommendations;

  if not v_has_recommendations then
    delete from public.song_league_round_members where round_id = v_round_id;
  end if;

  -- Missing members are inserted even after the first pick. The conflict
  -- update is allowed only before the first pick, preserving frozen baselines.
  insert into public.song_league_round_members(
    round_id, league_id, user_id, baseline_snapshot_id
  )
  select v_round_id, p_league_id, member.user_id, snapshot.id
  from public.song_league_members member
  join public.users profile
    on profile.id = member.user_id and profile.backup_active = true
  join lateral (
    select candidate.id
    from public.stats_snapshots candidate
    where candidate.user_id = member.user_id
      and candidate.range = 'short_term'
      and candidate.snapshot_date = v_today
      and exists (select 1 from public.stats_snapshot_tracks item
        where item.snapshot_id = candidate.id)
    order by candidate.created_at desc
    limit 1
  ) snapshot on true
  where member.league_id = p_league_id and member.left_at is null
  on conflict (round_id, user_id) do update
    set baseline_snapshot_id = excluded.baseline_snapshot_id
    where not v_has_recommendations;

  select count(*)::integer into v_roster_size
  from public.song_league_round_members where round_id = v_round_id;
  if v_roster_size < 2 then
    raise exception 'At least two league members need today''s fresh short-term Top Songs.';
  end if;
  if not exists (select 1 from public.song_league_round_members
    where round_id = v_round_id and user_id = auth.uid()) then
    raise exception 'Your short-term Top Songs are not fresh for today yet.';
  end if;
  return v_round_id;
end;
$$;

