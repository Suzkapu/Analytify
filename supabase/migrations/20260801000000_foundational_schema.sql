-- Foundational schema for clean environment rebuilds. Every statement is
-- additive/idempotent because existing production projects may discover this
-- historical baseline after later migrations have already been applied.
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  spotify_id varchar(255) unique not null,
  display_name varchar(255),
  profile_pic_url text,
  spotify_refresh_token text,
  last_synced_at timestamptz,
  backup_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.artists (
  id varchar(255) primary key,
  name varchar(255) not null,
  image_url text,
  spotify_url text,
  last_updated timestamptz not null default now()
);

create table if not exists public.genres (name varchar(255) primary key);

create table if not exists public.albums (
  id varchar(255) primary key,
  name text not null,
  album_type varchar(50),
  total_tracks integer not null default 1,
  release_date date,
  release_date_precision varchar(10) check (release_date_precision in ('year', 'month', 'day')),
  image_url text,
  spotify_url text,
  upc varchar(100),
  ean varchar(100),
  restriction_reason varchar(100),
  last_updated timestamptz not null default now()
);

create table if not exists public.album_artists (
  album_id varchar(255) not null references public.albums(id) on delete cascade,
  artist_id varchar(255) not null references public.artists(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (album_id, artist_id)
);
create index if not exists idx_album_artists_artist_id on public.album_artists(artist_id);

create table if not exists public.tracks (
  id varchar(255) primary key,
  name text not null,
  album_id varchar(255) references public.albums(id) on delete set null,
  duration_ms integer not null default 0,
  explicit boolean not null default false,
  spotify_url text,
  track_number integer not null default 1,
  disc_number integer not null default 1,
  is_playable boolean not null default true,
  is_local boolean not null default false,
  isrc varchar(100),
  restriction_reason varchar(100),
  last_updated timestamptz not null default now()
);
create index if not exists idx_tracks_album_id on public.tracks(album_id);

create table if not exists public.track_artists (
  track_id varchar(255) not null references public.tracks(id) on delete cascade,
  artist_id varchar(255) not null references public.artists(id) on delete cascade,
  artist_rank integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (track_id, artist_id),
  constraint uq_track_artists_track_rank unique (track_id, artist_rank)
);
create index if not exists idx_track_artists_artist_id on public.track_artists(artist_id);

create table if not exists public.listening_history (
  user_id uuid not null references public.users(id) on delete cascade,
  track_id varchar(255) not null references public.tracks(id) on delete cascade,
  played_at timestamptz not null,
  primary key (user_id, played_at, track_id)
) partition by range (played_at);
create table if not exists public.listening_history_default
  partition of public.listening_history default;
create index if not exists idx_listening_history_track_id on public.listening_history(track_id);
create index if not exists idx_listening_history_user_played
  on public.listening_history(user_id, played_at desc);

create table if not exists public.user_cache (
  user_id uuid not null references public.users(id) on delete cascade,
  key varchar(255) not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create table if not exists public.stats_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  range varchar(50) not null check (range in ('short_term', 'medium_term', 'long_term')),
  snapshot_date date not null default current_date,
  explicit_percentage numeric(5,2) not null default 0,
  genre_diversity integer not null default 0,
  created_at timestamptz not null default now(),
  constraint uq_stats_snapshots_user_range_date unique (user_id, range, snapshot_date)
);
create index if not exists idx_stats_snapshots_user_range
  on public.stats_snapshots(user_id, range);
create index if not exists idx_stats_snapshots_user_range_date
  on public.stats_snapshots(user_id, range, snapshot_date desc);

create table if not exists public.stats_snapshot_tracks (
  snapshot_id uuid not null references public.stats_snapshots(id) on delete cascade,
  track_id varchar(255) not null references public.tracks(id) on delete cascade,
  rank integer not null check (rank between 1 and 100),
  primary key (snapshot_id, rank),
  unique (snapshot_id, track_id)
);
create index if not exists idx_stats_snapshot_tracks_track_id
  on public.stats_snapshot_tracks(track_id);

create table if not exists public.stats_snapshot_artists (
  snapshot_id uuid not null references public.stats_snapshots(id) on delete cascade,
  artist_id varchar(255) not null references public.artists(id) on delete cascade,
  rank integer not null check (rank between 1 and 50),
  primary key (snapshot_id, rank),
  unique (snapshot_id, artist_id)
);
create index if not exists idx_stats_snapshot_artists_artist_id
  on public.stats_snapshot_artists(artist_id);

create table if not exists public.stats_snapshot_genres (
  snapshot_id uuid not null references public.stats_snapshots(id) on delete cascade,
  genre_name varchar(255) not null references public.genres(name) on delete cascade,
  rank integer not null check (rank between 1 and 15),
  weight integer not null,
  primary key (snapshot_id, rank),
  unique (snapshot_id, genre_name)
);
create index if not exists idx_stats_snapshot_genres_genre
  on public.stats_snapshot_genres(genre_name);

create table if not exists public.user_top_tracks_history (
  user_id uuid not null references public.users(id) on delete cascade,
  time_range varchar(50) not null,
  rank integer not null,
  track_id varchar(255) not null references public.tracks(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  primary key (user_id, time_range, fetched_at, rank)
);
create index if not exists idx_user_top_tracks_history_user_id
  on public.user_top_tracks_history(user_id);

create table if not exists public.user_top_artists_history (
  user_id uuid not null references public.users(id) on delete cascade,
  time_range varchar(50) not null,
  rank integer not null,
  artist_id varchar(255) not null references public.artists(id) on delete cascade,
  fetched_at timestamptz not null default now(),
  primary key (user_id, time_range, fetched_at, rank)
);
create index if not exists idx_user_top_artists_history_user_id
  on public.user_top_artists_history(user_id);

do $baseline$
begin
  if to_regprocedure('public.get_dev_uuid(uuid)') is null then
    execute $function$
      create function public.get_dev_uuid(usr_id uuid) returns uuid
      language sql immutable strict as
      'select (''de11'' || substring(usr_id::text from 5))::uuid'
    $function$;
  end if;
  if to_regprocedure('public.handle_new_user()') is null then
    execute $function$
      create function public.handle_new_user() returns trigger
      language plpgsql security definer set search_path = '' as $body$
      begin
        insert into public.users(id, spotify_id, display_name, profile_pic_url)
        values (new.id, coalesce(new.raw_user_meta_data->>'provider_id', new.id::text),
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Spotify User'),
          new.raw_user_meta_data->>'avatar_url')
        on conflict (id) do update set display_name = excluded.display_name,
          profile_pic_url = excluded.profile_pic_url;
        return new;
      end $body$
    $function$;
  end if;
end
$baseline$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.users enable row level security;
alter table public.artists enable row level security;
alter table public.genres enable row level security;
alter table public.albums enable row level security;
alter table public.album_artists enable row level security;
alter table public.tracks enable row level security;
alter table public.track_artists enable row level security;
alter table public.listening_history enable row level security;
alter table public.user_cache enable row level security;
alter table public.stats_snapshots enable row level security;
alter table public.stats_snapshot_tracks enable row level security;
alter table public.stats_snapshot_artists enable row level security;
alter table public.stats_snapshot_genres enable row level security;
alter table public.user_top_tracks_history enable row level security;
alter table public.user_top_artists_history enable row level security;

do $policies$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users') then
    create policy "Users can view own profile" on public.users for select to authenticated
      using (auth.uid() = id or id = public.get_dev_uuid(auth.uid()));
    create policy "Users can update own profile" on public.users for update to authenticated
      using (auth.uid() = id or id = public.get_dev_uuid(auth.uid()))
      with check (auth.uid() = id or id = public.get_dev_uuid(auth.uid()));
    create policy "Users can insert own profile" on public.users for insert to authenticated
      with check (auth.uid() = id or id = public.get_dev_uuid(auth.uid()));
    create policy "Users can delete own profile" on public.users for delete to authenticated
      using (auth.uid() = id or id = public.get_dev_uuid(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'listening_history') then
    create policy "Users manage own listening history" on public.listening_history for all to authenticated
      using (auth.uid() = user_id or user_id = public.get_dev_uuid(auth.uid()))
      with check (auth.uid() = user_id or user_id = public.get_dev_uuid(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_cache') then
    create policy "Users manage own cache" on public.user_cache for all to authenticated
      using (auth.uid() = user_id or user_id = public.get_dev_uuid(auth.uid()))
      with check (auth.uid() = user_id or user_id = public.get_dev_uuid(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stats_snapshots') then
    create policy "Users manage own snapshots" on public.stats_snapshots for all to authenticated
      using (auth.uid() = user_id or user_id = public.get_dev_uuid(auth.uid()))
      with check (auth.uid() = user_id or user_id = public.get_dev_uuid(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stats_snapshot_tracks') then
    create policy "Users manage own snapshot tracks" on public.stats_snapshot_tracks for all to authenticated
      using (exists (select 1 from public.stats_snapshots snapshot where snapshot.id = snapshot_id
        and snapshot.user_id in (auth.uid(), public.get_dev_uuid(auth.uid()))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stats_snapshot_artists') then
    create policy "Users manage own snapshot artists" on public.stats_snapshot_artists for all to authenticated
      using (exists (select 1 from public.stats_snapshots snapshot where snapshot.id = snapshot_id
        and snapshot.user_id in (auth.uid(), public.get_dev_uuid(auth.uid()))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'stats_snapshot_genres') then
    create policy "Users manage own snapshot genres" on public.stats_snapshot_genres for all to authenticated
      using (exists (select 1 from public.stats_snapshots snapshot where snapshot.id = snapshot_id
        and snapshot.user_id in (auth.uid(), public.get_dev_uuid(auth.uid()))));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_top_tracks_history') then
    create policy "Users manage own top tracks" on public.user_top_tracks_history for all to authenticated
      using (auth.uid() = user_id or user_id = public.get_dev_uuid(auth.uid()))
      with check (auth.uid() = user_id or user_id = public.get_dev_uuid(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_top_artists_history') then
    create policy "Users manage own top artists" on public.user_top_artists_history for all to authenticated
      using (auth.uid() = user_id or user_id = public.get_dev_uuid(auth.uid()))
      with check (auth.uid() = user_id or user_id = public.get_dev_uuid(auth.uid()));
  end if;
end
$policies$;

grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on public.users, public.listening_history,
  public.user_cache, public.stats_snapshots, public.stats_snapshot_tracks,
  public.stats_snapshot_artists, public.stats_snapshot_genres,
  public.user_top_tracks_history, public.user_top_artists_history to authenticated;
grant select on public.artists, public.genres, public.albums, public.album_artists,
  public.tracks, public.track_artists to authenticated;
grant all on all tables in schema public to service_role;
