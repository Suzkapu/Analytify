-- Active Song League membership requires unattended short-term Top Songs.
-- Keep that capability enabled independently of how the member was added and
-- make the task immediately due so the worker repairs stale data promptly.
create or replace function private.enable_song_league_sync_for_user(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    raise exception 'A Song League member is required.';
  end if;

  insert into public.sync_user_settings(
    user_id, enabled, short_term_enabled, updated_at, updated_by
  ) values (
    p_user_id, true, true, now(), p_user_id
  )
  on conflict (user_id) do update set
    enabled = true,
    short_term_enabled = true,
    updated_at = now(),
    updated_by = p_user_id;

  insert into public.sync_task_state(
    user_id, task_key, next_run_at, last_error, updated_at
  ) values (
    p_user_id, 'stats_short_term', now(), null, now()
  )
  on conflict (user_id, task_key) do update set
    next_run_at = now(),
    last_error = null,
    updated_at = now();
end;
$$;

create or replace function private.enable_song_league_member_sync_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if new.left_at is null then
    perform private.enable_song_league_sync_for_user(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists enable_song_league_member_sync on public.song_league_members;
create trigger enable_song_league_member_sync
after insert or update of left_at on public.song_league_members
for each row execute function private.enable_song_league_member_sync_trigger();

-- Repair all existing active members during rollout.
insert into public.sync_user_settings(
  user_id, enabled, short_term_enabled, updated_at, updated_by
)
select distinct member.user_id, true, true, now(), member.user_id
from public.song_league_members member
join public.song_leagues league on league.id = member.league_id
where member.left_at is null and league.closed_at is null
on conflict (user_id) do update set
  enabled = true,
  short_term_enabled = true,
  updated_at = now(),
  updated_by = excluded.updated_by;

insert into public.sync_task_state(
  user_id, task_key, next_run_at, last_error, updated_at
)
select distinct member.user_id, 'stats_short_term', now(), null, now()
from public.song_league_members member
join public.song_leagues league on league.id = member.league_id
where member.left_at is null and league.closed_at is null
on conflict (user_id, task_key) do update set
  next_run_at = now(),
  last_error = null,
  updated_at = now();

-- Page loads call this narrow RPC to repair settings changed after joining.
create or replace function public.ensure_song_league_member_sync(
  p_league_id uuid
) returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;
  if not exists (
    select 1
    from public.song_league_members member
    join public.song_leagues league on league.id = member.league_id
    where member.league_id = p_league_id
      and member.user_id = auth.uid()
      and member.left_at is null
      and league.closed_at is null
  ) then
    raise exception 'The active Song League was not found.';
  end if;

  perform private.enable_song_league_sync_for_user(auth.uid());
end;
$$;

-- Use today's league-local snapshot as the immutable Friday baseline. The
-- roster is rebuilt only before the first successful recommendation.
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
begin
  select * into v_league
  from public.song_leagues
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
  ) values (
    p_league_id, v_start, v_submission_end, v_submission_end, v_scoring_end
  ) on conflict (league_id, starts_at) do nothing;

  select id into v_round_id
  from public.song_league_rounds
  where league_id = p_league_id and starts_at = v_start;

  if not exists (
    select 1 from public.song_league_recommendations where round_id = v_round_id
  ) then
    delete from public.song_league_round_members where round_id = v_round_id;
    insert into public.song_league_round_members(
      round_id, league_id, user_id, baseline_snapshot_id
    )
    select
      v_round_id,
      p_league_id,
      member.user_id,
      snapshot.id
    from public.song_league_members member
    join public.users profile
      on profile.id = member.user_id and profile.backup_active = true
    join lateral (
      select candidate.id
      from public.stats_snapshots candidate
      where candidate.user_id = member.user_id
        and candidate.range = 'short_term'
        and candidate.snapshot_date = v_today
        and exists (
          select 1 from public.stats_snapshot_tracks item where item.snapshot_id = candidate.id
        )
      order by candidate.created_at desc
      limit 1
    ) snapshot on true
    where member.league_id = p_league_id
      and member.left_at is null
    on conflict (round_id, user_id) do update set
      baseline_snapshot_id = excluded.baseline_snapshot_id;
  end if;

  select count(*)::integer into v_roster_size
  from public.song_league_round_members
  where round_id = v_round_id;

  if v_roster_size < 2 then
    raise exception 'At least two league members need today''s fresh short-term Top Songs.';
  end if;

  if not exists (
    select 1 from public.song_league_round_members
    where round_id = v_round_id and user_id = auth.uid()
  ) then
    raise exception 'Your short-term Top Songs are not fresh for today yet.';
  end if;

  return v_round_id;
end;
$$;

revoke all on function private.enable_song_league_sync_for_user(uuid) from public;
revoke all on function private.enable_song_league_member_sync_trigger() from public;
revoke all on function public.ensure_song_league_member_sync(uuid) from public;
grant execute on function public.ensure_song_league_member_sync(uuid) to authenticated;
