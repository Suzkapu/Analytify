create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.song_leagues (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  timezone text not null default 'Europe/Vienna',
  owner_display_name text not null default 'Spotify user',
  owner_image_url text not null default '',
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.song_league_members (
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text not null default 'Spotify user',
  image_url text not null default '',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (league_id, user_id)
);

create table if not exists public.song_league_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  token_hash text not null unique check (length(token_hash) = 64),
  created_by uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.song_league_rounds (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  starts_at timestamptz not null,
  submission_ends_at timestamptz not null,
  scoring_starts_at timestamptz not null,
  scoring_ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (league_id, starts_at),
  check (starts_at < submission_ends_at),
  check (submission_ends_at = scoring_starts_at),
  check (scoring_starts_at < scoring_ends_at)
);

create table if not exists public.song_league_round_members (
  round_id uuid not null references public.song_league_rounds(id) on delete cascade,
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  baseline_snapshot_id uuid not null references public.stats_snapshots(id) on delete restrict,
  primary key (round_id, user_id)
);

create table if not exists public.song_league_recommendations (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  round_id uuid not null references public.song_league_rounds(id) on delete cascade,
  recommender_user_id uuid not null references public.users(id) on delete cascade,
  track_id text not null references public.tracks(id) on delete restrict,
  recording_key text not null,
  isrc text,
  track_name text not null,
  artist_names text not null,
  album_name text not null default '',
  image_url text not null default '',
  spotify_url text not null default '',
  submitted_at timestamptz not null default now(),
  scoring_starts_at timestamptz not null,
  scoring_ends_at timestamptz not null,
  unique (round_id, recommender_user_id),
  check (scoring_starts_at < scoring_ends_at)
);

create table if not exists public.song_league_recommendation_audience (
  recommendation_id uuid not null references public.song_league_recommendations(id) on delete cascade,
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  listener_user_id uuid not null references public.users(id) on delete cascade,
  primary key (recommendation_id, listener_user_id)
);

create table if not exists public.song_league_score_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  recommendation_id uuid not null references public.song_league_recommendations(id) on delete cascade,
  listener_user_id uuid not null references public.users(id) on delete cascade,
  snapshot_id uuid not null references public.stats_snapshots(id) on delete cascade,
  snapshot_date date not null,
  matched_track_id text references public.tracks(id) on delete set null,
  matched_rank integer check (matched_rank between 1 and 100),
  list_size integer not null check (list_size between 0 and 100),
  points integer not null default 0 check (points between 0 and 100),
  scored_at timestamptz not null default now(),
  unique (recommendation_id, listener_user_id, snapshot_id)
);

create index if not exists song_league_members_user_idx
  on public.song_league_members(user_id, joined_at desc) where left_at is null;
create index if not exists song_league_rounds_league_idx
  on public.song_league_rounds(league_id, starts_at desc);
create index if not exists song_league_recommendations_active_idx
  on public.song_league_recommendations(league_id, scoring_ends_at desc);
create index if not exists song_league_recommendations_owner_idx
  on public.song_league_recommendations(recommender_user_id, submitted_at desc);
create index if not exists song_league_score_events_league_idx
  on public.song_league_score_events(league_id, snapshot_date desc);
create index if not exists song_league_score_events_recommendation_idx
  on public.song_league_score_events(recommendation_id, listener_user_id, snapshot_date desc);

alter table public.song_leagues enable row level security;
alter table public.song_league_members enable row level security;
alter table public.song_league_invites enable row level security;
alter table public.song_league_rounds enable row level security;
alter table public.song_league_round_members enable row level security;
alter table public.song_league_recommendations enable row level security;
alter table public.song_league_recommendation_audience enable row level security;
alter table public.song_league_score_events enable row level security;

create or replace function private.is_song_league_member(
  p_league_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.song_league_members member
    join public.song_leagues league on league.id = member.league_id
    where member.league_id = p_league_id
      and member.user_id = auth.uid()
      and member.left_at is null
      and league.closed_at is null
  );
$$;

create or replace function private.song_league_friday_start(
  p_timezone text,
  p_now timestamptz default now()
) returns timestamptz
language plpgsql
stable
set search_path = public, pg_catalog
as $$
declare
  v_local_now timestamp;
  v_days_since_friday integer;
  v_local_friday date;
begin
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'The league timezone is invalid.';
  end if;

  v_local_now := p_now at time zone p_timezone;
  v_days_since_friday := (extract(isodow from v_local_now)::integer - 5 + 7) % 7;
  v_local_friday := v_local_now::date - v_days_since_friday;
  return v_local_friday::timestamp at time zone p_timezone;
end;
$$;

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

  v_local_now := p_now at time zone v_league.timezone;
  if extract(isodow from v_local_now)::integer <> 5 then
    raise exception 'Recommendations can only be submitted on Friday in the league timezone.';
  end if;

  v_start := private.song_league_friday_start(v_league.timezone, p_now);
  v_submission_end := ((v_local_now::date + 1)::timestamp at time zone v_league.timezone);
  v_scoring_end := ((v_local_now::date + 29)::timestamp at time zone v_league.timezone);

  insert into public.song_league_rounds(
    league_id, starts_at, submission_ends_at, scoring_starts_at, scoring_ends_at
  ) values (
    p_league_id, v_start, v_submission_end, v_submission_end, v_scoring_end
  ) on conflict (league_id, starts_at) do nothing;

  select id into v_round_id
  from public.song_league_rounds
  where league_id = p_league_id and starts_at = v_start;

  if not exists (
    select 1 from public.song_league_round_members where round_id = v_round_id
  ) then
    insert into public.song_league_round_members(round_id, league_id, user_id, baseline_snapshot_id)
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
        and candidate.snapshot_date < (v_start at time zone v_league.timezone)::date
        and candidate.snapshot_date >= (v_start at time zone v_league.timezone)::date - 2
        and exists (
          select 1 from public.stats_snapshot_tracks item where item.snapshot_id = candidate.id
        )
      order by candidate.snapshot_date desc, candidate.created_at desc
      limit 1
    ) snapshot on true
    where member.league_id = p_league_id
      and member.left_at is null
    on conflict (round_id, user_id) do nothing;
  end if;

  select count(*)::integer into v_roster_size
  from public.song_league_round_members
  where round_id = v_round_id;

  if v_roster_size < 3 then
    raise exception 'At least three league members need fresh short-term Top Songs before Friday.';
  end if;

  if not exists (
    select 1 from public.song_league_round_members
    where round_id = v_round_id and user_id = auth.uid()
  ) then
    raise exception 'Your short-term Top Songs snapshot is not fresh enough for this Friday round.';
  end if;

  return v_round_id;
end;
$$;

drop policy if exists "League members can read leagues" on public.song_leagues;
create policy "League members can read leagues"
  on public.song_leagues for select to authenticated
  using (private.is_song_league_member(id));

drop policy if exists "League members can read member profiles" on public.song_league_members;
create policy "League members can read member profiles"
  on public.song_league_members for select to authenticated
  using (private.is_song_league_member(league_id));

drop policy if exists "League owners can read active invites" on public.song_league_invites;
create policy "League owners can read active invites"
  on public.song_league_invites for select to authenticated
  using (
    exists (
      select 1 from public.song_leagues league
      where league.id = song_league_invites.league_id and league.owner_user_id = auth.uid()
    )
  );

drop policy if exists "League members can read rounds" on public.song_league_rounds;
create policy "League members can read rounds"
  on public.song_league_rounds for select to authenticated
  using (private.is_song_league_member(league_id));

drop policy if exists "League members can read round roster" on public.song_league_round_members;
create policy "League members can read round roster"
  on public.song_league_round_members for select to authenticated
  using (private.is_song_league_member(league_id));

drop policy if exists "League members can read recommendations" on public.song_league_recommendations;
create policy "League members can read recommendations"
  on public.song_league_recommendations for select to authenticated
  using (private.is_song_league_member(league_id));

drop policy if exists "League members can read recommendation audiences" on public.song_league_recommendation_audience;
create policy "League members can read recommendation audiences"
  on public.song_league_recommendation_audience for select to authenticated
  using (private.is_song_league_member(league_id));

drop policy if exists "League members can read score events" on public.song_league_score_events;
create policy "League members can read score events"
  on public.song_league_score_events for select to authenticated
  using (private.is_song_league_member(league_id));

create or replace function public.create_song_league(
  p_name text,
  p_timezone text,
  p_invite_token text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.users%rowtype;
  v_league_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'A league name is required.'; end if;
  if length(coalesce(p_invite_token, '')) < 32 then raise exception 'The invite token is invalid.'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'The league timezone is invalid.';
  end if;

  select * into v_profile from public.users where id = v_user_id;
  if not found or not v_profile.backup_active then
    raise exception 'Enable Cloud Backup before creating a Song League.';
  end if;

  insert into public.song_leagues(
    owner_user_id, name, timezone, owner_display_name, owner_image_url
  ) values (
    v_user_id,
    left(trim(p_name), 80),
    p_timezone,
    coalesce(nullif(trim(v_profile.display_name), ''), 'Spotify user'),
    coalesce(v_profile.profile_pic_url, '')
  ) returning id into v_league_id;

  insert into public.song_league_members(
    league_id, user_id, role, display_name, image_url
  ) values (
    v_league_id,
    v_user_id,
    'owner',
    coalesce(nullif(trim(v_profile.display_name), ''), 'Spotify user'),
    coalesce(v_profile.profile_pic_url, '')
  );

  insert into public.song_league_invites(league_id, token_hash, created_by)
  values (
    v_league_id,
    encode(digest(convert_to(p_invite_token, 'UTF8'), 'sha256'), 'hex'),
    v_user_id
  );

  return v_league_id;
end;
$$;

create or replace function public.rotate_song_league_invite(
  p_league_id uuid,
  p_invite_token text
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if length(coalesce(p_invite_token, '')) < 32 then raise exception 'The invite token is invalid.'; end if;
  if not exists (
    select 1 from public.song_leagues
    where id = p_league_id and owner_user_id = auth.uid() and closed_at is null
  ) then
    raise exception 'Only the league owner can create an invite.';
  end if;

  update public.song_league_invites
  set revoked_at = now()
  where league_id = p_league_id and revoked_at is null;

  insert into public.song_league_invites(league_id, token_hash, created_by)
  values (
    p_league_id,
    encode(digest(convert_to(p_invite_token, 'UTF8'), 'sha256'), 'hex'),
    auth.uid()
  );
end;
$$;

create or replace function public.claim_song_league(
  p_invite_token text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.song_league_invites%rowtype;
  v_profile public.users%rowtype;
  v_member_count integer;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;

  select invite.* into v_invite
  from public.song_league_invites invite
  join public.song_leagues league on league.id = invite.league_id
  where invite.token_hash = encode(digest(convert_to(coalesce(p_invite_token, ''), 'UTF8'), 'sha256'), 'hex')
    and invite.revoked_at is null
    and league.closed_at is null
  for update of invite;

  if not found then raise exception 'This Song League invitation is invalid or revoked.'; end if;

  select * into v_profile from public.users where id = v_user_id;
  if not found or not v_profile.backup_active then
    raise exception 'Enable Cloud Backup before joining a Song League.';
  end if;

  select count(*)::integer into v_member_count
  from public.song_league_members
  where league_id = v_invite.league_id and left_at is null;
  if v_member_count >= 5 and not exists (
    select 1 from public.song_league_members
    where league_id = v_invite.league_id and user_id = v_user_id
  ) then
    raise exception 'This private-beta Song League already has five members.';
  end if;

  insert into public.song_league_members(
    league_id, user_id, role, display_name, image_url, joined_at, left_at
  ) values (
    v_invite.league_id,
    v_user_id,
    'member',
    coalesce(nullif(trim(v_profile.display_name), ''), 'Spotify user'),
    coalesce(v_profile.profile_pic_url, ''),
    now(),
    null
  ) on conflict (league_id, user_id) do update set
    display_name = excluded.display_name,
    image_url = excluded.image_url,
    joined_at = excluded.joined_at,
    left_at = null;

  return v_invite.league_id;
end;
$$;

create or replace function public.leave_song_league(
  p_league_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.song_leagues where id = p_league_id and owner_user_id = auth.uid()
  ) then
    raise exception 'The owner cannot leave; close the league instead.';
  end if;

  update public.song_league_members
  set left_at = now()
  where league_id = p_league_id and user_id = auth.uid() and left_at is null;
  if not found then raise exception 'Active membership was not found.'; end if;
end;
$$;

create or replace function public.close_song_league(
  p_league_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.song_leagues
  set closed_at = now()
  where id = p_league_id and owner_user_id = auth.uid() and closed_at is null;
  if not found then raise exception 'The active league was not found or is not owned by this user.'; end if;
end;
$$;

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

create or replace function public.submit_song_league_recommendation(
  p_league_id uuid,
  p_track_id text
) returns uuid
language plpgsql
security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_round public.song_league_rounds%rowtype;
  v_round_id uuid;
  v_track public.tracks%rowtype;
  v_recording_key text;
  v_artist_names text;
  v_album_name text;
  v_image_url text;
  v_opponent_count integer;
  v_absent_count integer;
  v_best_existing_rank integer;
  v_recommendation_id uuid;
begin
  v_round_id := private.ensure_song_league_round(p_league_id, now());
  select * into v_round from public.song_league_rounds where id = v_round_id;
  if now() >= v_round.submission_ends_at then raise exception 'Friday submissions are closed.'; end if;

  select * into v_track from public.tracks where id = p_track_id;
  if not found or v_track.is_local then raise exception 'Choose a playable Spotify catalog track.'; end if;

  v_recording_key := case
    when nullif(trim(v_track.isrc), '') is not null then 'isrc:' || upper(trim(v_track.isrc))
    else 'track:' || v_track.id
  end;

  -- Serialize identical recording submissions so two simultaneous clients
  -- cannot both pass the active-duplicate check.
  perform pg_advisory_xact_lock(hashtextextended(p_league_id::text || ':' || v_recording_key, 0));

  if exists (
    select 1
    from public.song_league_recommendations recommendation
    where recommendation.league_id = p_league_id
      and recommendation.recording_key = v_recording_key
      and recommendation.scoring_ends_at > v_round.scoring_starts_at
  ) then
    raise exception 'That recording is already active in this league.';
  end if;

  with opponent_ranks as (
    select
      roster.user_id,
      min(item.rank) filter (
        where candidate.id = v_track.id
          or (
            nullif(v_track.isrc, '') is not null
            and upper(nullif(candidate.isrc, '')) = upper(v_track.isrc)
          )
      ) as matched_rank
    from public.song_league_round_members roster
    left join public.stats_snapshot_tracks item on item.snapshot_id = roster.baseline_snapshot_id
    left join public.tracks candidate on candidate.id = item.track_id
    where roster.round_id = v_round_id and roster.user_id <> auth.uid()
    group by roster.user_id
  )
  select
    count(*)::integer,
    count(*) filter (where matched_rank is null)::integer,
    min(matched_rank)::integer
  into v_opponent_count, v_absent_count, v_best_existing_rank
  from opponent_ranks;

  if v_opponent_count < 2 then
    raise exception 'At least two opponents need fresh Top Songs for discovery validation.';
  end if;
  if v_absent_count * 2 <= v_opponent_count then
    raise exception 'Choose a song that is new to a strict majority of the league.';
  end if;
  if v_best_existing_rank is not null and v_best_existing_rank <= 20 then
    raise exception 'That song is already a Top 20 favorite for a league member.';
  end if;

  select coalesce(string_agg(artist.name, ', ' order by relation.artist_rank), 'Unknown artist')
  into v_artist_names
  from public.track_artists relation
  join public.artists artist on artist.id = relation.artist_id
  where relation.track_id = v_track.id;

  select coalesce(album.name, ''), coalesce(album.image_url, '')
  into v_album_name, v_image_url
  from public.albums album
  where album.id = v_track.album_id;

  insert into public.song_league_recommendations(
    league_id,
    round_id,
    recommender_user_id,
    track_id,
    recording_key,
    isrc,
    track_name,
    artist_names,
    album_name,
    image_url,
    spotify_url,
    scoring_starts_at,
    scoring_ends_at
  ) values (
    p_league_id,
    v_round_id,
    auth.uid(),
    v_track.id,
    v_recording_key,
    v_track.isrc,
    v_track.name,
    v_artist_names,
    v_album_name,
    v_image_url,
    coalesce(v_track.spotify_url, ''),
    v_round.scoring_starts_at,
    v_round.scoring_ends_at
  ) returning id into v_recommendation_id;

  insert into public.song_league_recommendation_audience(
    recommendation_id, league_id, listener_user_id
  )
  select v_recommendation_id, p_league_id, roster.user_id
  from public.song_league_round_members roster
  where roster.round_id = v_round_id and roster.user_id <> auth.uid();

  return v_recommendation_id;
end;
$$;

create or replace function public.score_song_league_snapshot(
  p_snapshot_id uuid
) returns integer
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_snapshot public.stats_snapshots%rowtype;
  v_list_size integer;
  v_written integer;
begin
  select * into v_snapshot from public.stats_snapshots where id = p_snapshot_id;
  if not found or v_snapshot.range <> 'short_term' then return 0; end if;
  if auth.role() <> 'service_role' then
    raise exception 'Song League scoring is restricted to the trusted daily sync.';
  end if;

  select count(*)::integer into v_list_size
  from public.stats_snapshot_tracks where snapshot_id = p_snapshot_id;

  insert into public.song_league_score_events(
    league_id,
    recommendation_id,
    listener_user_id,
    snapshot_id,
    snapshot_date,
    matched_track_id,
    matched_rank,
    list_size,
    points,
    scored_at
  )
  select
    recommendation.league_id,
    recommendation.id,
    v_snapshot.user_id,
    p_snapshot_id,
    v_snapshot.snapshot_date,
    matched.track_id,
    matched.rank,
    v_list_size,
    case when matched.rank is null then 0 else greatest(0, v_list_size - matched.rank + 1) end,
    now()
  from public.song_league_recommendations recommendation
  join public.song_league_recommendation_audience audience
    on audience.recommendation_id = recommendation.id
    and audience.listener_user_id = v_snapshot.user_id
  join public.song_leagues league on league.id = recommendation.league_id and league.closed_at is null
  left join lateral (
    select item.track_id, item.rank
    from public.stats_snapshot_tracks item
    join public.tracks candidate on candidate.id = item.track_id
    where item.snapshot_id = p_snapshot_id
      and (
        candidate.id = recommendation.track_id
        or (
          recommendation.isrc is not null
          and upper(nullif(candidate.isrc, '')) = upper(recommendation.isrc)
        )
      )
    order by item.rank
    limit 1
  ) matched on true
  where v_snapshot.snapshot_date >= (recommendation.scoring_starts_at at time zone league.timezone)::date
    and v_snapshot.snapshot_date < (recommendation.scoring_ends_at at time zone league.timezone)::date
  on conflict (recommendation_id, listener_user_id, snapshot_id) do update set
    matched_track_id = excluded.matched_track_id,
    matched_rank = excluded.matched_rank,
    list_size = excluded.list_size,
    points = excluded.points,
    scored_at = now();

  get diagnostics v_written = row_count;
  return v_written;
end;
$$;

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
  group by member.user_id, member.display_name, member.image_url, member.role
  order by coalesce(sum(event.points), 0) desc, member.joined_at asc;
end;
$$;

create or replace function public.get_song_league_score_breakdown(
  p_league_id uuid,
  p_recommender_user_id uuid
) returns table (
  recommendation_id uuid,
  track_id text,
  track_name text,
  artist_names text,
  image_url text,
  spotify_url text,
  submitted_at timestamptz,
  scoring_starts_at timestamptz,
  scoring_ends_at timestamptz,
  listener_user_id uuid,
  listener_display_name text,
  total_points bigint,
  latest_rank integer,
  latest_list_size integer,
  latest_points integer,
  latest_snapshot_date date
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
    recommendation.id,
    recommendation.track_id,
    recommendation.track_name,
    recommendation.artist_names,
    recommendation.image_url,
    recommendation.spotify_url,
    recommendation.submitted_at,
    recommendation.scoring_starts_at,
    recommendation.scoring_ends_at,
    audience.listener_user_id,
    listener.display_name,
    coalesce(totals.total_points, 0)::bigint,
    latest.matched_rank,
    latest.list_size,
    latest.points,
    latest.snapshot_date
  from public.song_league_recommendations recommendation
  join public.song_league_recommendation_audience audience
    on audience.recommendation_id = recommendation.id
  join public.song_league_members listener
    on listener.league_id = recommendation.league_id
    and listener.user_id = audience.listener_user_id
  left join lateral (
    select sum(event.points)::bigint as total_points
    from public.song_league_score_events event
    where event.recommendation_id = recommendation.id
      and event.listener_user_id = audience.listener_user_id
  ) totals on true
  left join lateral (
    select event.matched_rank, event.list_size, event.points, event.snapshot_date
    from public.song_league_score_events event
    where event.recommendation_id = recommendation.id
      and event.listener_user_id = audience.listener_user_id
    order by event.snapshot_date desc, event.scored_at desc
    limit 1
  ) latest on true
  where recommendation.league_id = p_league_id
    and recommendation.recommender_user_id = p_recommender_user_id
  order by recommendation.submitted_at desc, listener.display_name asc;
end;
$$;

revoke all on function private.is_song_league_member(uuid) from public;
revoke all on function private.song_league_friday_start(text, timestamptz) from public;
revoke all on function private.ensure_song_league_round(uuid, timestamptz) from public;
revoke all on function public.create_song_league(text, text, text) from public;
revoke all on function public.rotate_song_league_invite(uuid, text) from public;
revoke all on function public.claim_song_league(text) from public;
revoke all on function public.leave_song_league(uuid) from public;
revoke all on function public.close_song_league(uuid) from public;
revoke all on function public.delete_song_league(uuid) from public;
revoke all on function public.submit_song_league_recommendation(uuid, text) from public;
revoke all on function public.score_song_league_snapshot(uuid) from public;
revoke all on function public.get_song_league_standings(uuid) from public;
revoke all on function public.get_song_league_score_breakdown(uuid, uuid) from public;

grant execute on function public.create_song_league(text, text, text) to authenticated;
grant execute on function public.rotate_song_league_invite(uuid, text) to authenticated;
grant execute on function public.claim_song_league(text) to authenticated;
grant execute on function public.leave_song_league(uuid) to authenticated;
grant execute on function public.close_song_league(uuid) to authenticated;
grant execute on function public.delete_song_league(uuid) to authenticated;
grant execute on function public.submit_song_league_recommendation(uuid, text) to authenticated;
grant execute on function public.score_song_league_snapshot(uuid) to service_role;
grant execute on function public.get_song_league_standings(uuid) to authenticated;
grant execute on function public.get_song_league_score_breakdown(uuid, uuid) to authenticated;

grant usage on schema private to authenticated;
grant execute on function private.is_song_league_member(uuid) to authenticated;

grant select on public.song_leagues to authenticated;
grant select on public.song_league_members to authenticated;
grant select on public.song_league_invites to authenticated;
grant select on public.song_league_rounds to authenticated;
grant select on public.song_league_round_members to authenticated;
grant select on public.song_league_recommendations to authenticated;
grant select on public.song_league_recommendation_audience to authenticated;
grant select on public.song_league_score_events to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'song_league_recommendations'
    ) then
      alter publication supabase_realtime add table public.song_league_recommendations;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'song_league_score_events'
    ) then
      alter publication supabase_realtime add table public.song_league_score_events;
    end if;
  end if;
end
$$;
