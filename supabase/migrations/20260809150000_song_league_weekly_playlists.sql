alter table public.song_leagues
  add column if not exists playlist_revision bigint not null default 0;

create table if not exists public.song_league_playlists (
  league_id uuid not null references public.song_leagues(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  spotify_playlist_id text,
  spotify_playlist_url text not null default '',
  last_synced_revision bigint not null default 0,
  last_synced_round_id uuid references public.song_league_rounds(id) on delete set null,
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (league_id, user_id),
  foreign key (league_id, user_id)
    references public.song_league_members(league_id, user_id) on delete cascade
);

create index if not exists song_league_playlists_user_idx
  on public.song_league_playlists(user_id, updated_at desc);

alter table public.song_league_playlists enable row level security;

drop policy if exists "League members can read weekly playlist status" on public.song_league_playlists;
create policy "League members can read weekly playlist status"
  on public.song_league_playlists for select to authenticated
  using (private.is_song_league_member(league_id));

create or replace function private.bump_song_league_playlist_revision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.song_leagues
  set playlist_revision = playlist_revision + 1
  where id = new.league_id;
  return new;
end;
$$;

drop trigger if exists song_league_recommendation_playlist_revision
  on public.song_league_recommendations;
create trigger song_league_recommendation_playlist_revision
after insert on public.song_league_recommendations
for each row execute function private.bump_song_league_playlist_revision();

revoke all on function private.bump_song_league_playlist_revision() from public;

create or replace function public.get_song_league_weekly_playlist_payload(
  p_league_id uuid,
  p_now timestamptz default now()
) returns table (
  league_id uuid,
  league_name text,
  timezone text,
  playlist_revision bigint,
  round_id uuid,
  track_uris text[]
)
language sql
stable
security definer
set search_path = public, private, pg_catalog
as $$
  select
    league.id,
    league.name,
    league.timezone,
    league.playlist_revision,
    round.id,
    coalesce(
      array_agg('spotify:track:' || recommendation.track_id order by recommendation.submitted_at)
        filter (where recommendation.id is not null),
      array[]::text[]
    )
  from public.song_leagues league
  left join public.song_league_rounds round
    on round.league_id = league.id
   and round.starts_at = private.song_league_friday_start(league.timezone, p_now)
  left join public.song_league_recommendations recommendation
    on recommendation.round_id = round.id
  where league.id = p_league_id
    and league.closed_at is null
  group by league.id, league.name, league.timezone, league.playlist_revision, round.id;
$$;

revoke all on function public.get_song_league_weekly_playlist_payload(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.get_song_league_weekly_playlist_payload(uuid, timestamptz)
  to service_role;

grant select on public.song_league_playlists to authenticated;
grant all on public.song_league_playlists to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'song_league_playlists'
    ) then
      alter publication supabase_realtime add table public.song_league_playlists;
    end if;
  end if;
end;
$$;
