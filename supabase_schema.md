# Analytify - Supabase Database Schema Design

This document outlines the production database schema for Supabase (PostgreSQL). It stores metadata available in the current Spotify Web API plus Analytify's user-specific history and rank snapshots.

To ensure **portability**, the core schema is written in standard ANSI SQL / PostgreSQL, making it 100% compatible with self-hosted PostgreSQL databases. Supabase-specific configurations (like Row Level Security (RLS) and linkages to Supabase Auth) are separated into an optional section at the bottom of the script.

---

## 1. Core Relational Database Schema DDL (SQL)

You can run the following SQL script directly in your **Supabase SQL Editor** or any standard **PostgreSQL database**.

```sql
-- Enable extensions if not enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- For gen_random_uuid() on pre-v13 PostgreSQL

-- ─── 1. USER PROFILES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spotify_id VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    profile_pic_url TEXT,
    spotify_refresh_token TEXT,
    last_synced_at TIMESTAMPTZ, -- Coarse daily stats completion marker; per-range snapshots remain authoritative
    backup_active BOOLEAN DEFAULT false NOT NULL, -- Setting: Controls if automated database backup is enabled for the user
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Note: No manual index on spotify_id is needed. PostgreSQL implicitly 
-- creates a B-tree index for UNIQUE constraints.

-- ─── 2. ARTISTS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS artists (
    id VARCHAR(255) PRIMARY KEY, -- Spotify Artist ID
    name VARCHAR(255) NOT NULL,
    image_url TEXT,
    spotify_url TEXT,
    last_updated TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Genre names are stored only for ranked stats snapshots, not as artist metadata.
CREATE TABLE IF NOT EXISTS genres (
    name VARCHAR(255) PRIMARY KEY
);

-- ─── 3. ALBUMS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS albums (
    id VARCHAR(255) PRIMARY KEY, -- Spotify Album ID
    name TEXT NOT NULL,
    album_type VARCHAR(50), -- Current Spotify values: 'album', 'single', 'compilation'
    total_tracks INTEGER DEFAULT 1 NOT NULL,
    release_date DATE, -- Optimized to DATE for standard SQL queries and sorting (requires YYYY-MM-DD padding on import)
    release_date_precision VARCHAR(10) CONSTRAINT chk_release_precision CHECK (release_date_precision IN ('year', 'month', 'day')), -- Tells UI how to render
    image_url TEXT, -- Album cover
    spotify_url TEXT,
    upc VARCHAR(100), -- Universal Product Code (External ID)
    ean VARCHAR(100), -- International Article Number (External ID)
    restriction_reason VARCHAR(100), -- e.g. 'market', 'product', 'explicit'
    last_updated TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Many-to-Many link for albums with multiple artists
CREATE TABLE IF NOT EXISTS album_artists (
    album_id VARCHAR(255) REFERENCES albums(id) ON DELETE CASCADE NOT NULL,
    artist_id VARCHAR(255) REFERENCES artists(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (album_id, artist_id)
);

-- Optimization: Explicit index on artist_id for join queries on albums by artist.
CREATE INDEX IF NOT EXISTS idx_album_artists_artist_id ON album_artists(artist_id);

-- ─── 4. TRACKS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracks (
    id VARCHAR(255) PRIMARY KEY, -- Spotify Track ID
    name TEXT NOT NULL,
    album_id VARCHAR(255) REFERENCES albums(id) ON DELETE SET NULL, -- SET NULL keeps tracks if album record is deleted
    duration_ms INTEGER DEFAULT 0 NOT NULL,
    explicit BOOLEAN DEFAULT false NOT NULL,
    spotify_url TEXT,
    track_number INTEGER DEFAULT 1 NOT NULL,
    disc_number INTEGER DEFAULT 1 NOT NULL,
    is_playable BOOLEAN DEFAULT true NOT NULL,
    is_local BOOLEAN DEFAULT false NOT NULL,
    isrc VARCHAR(100), -- International Standard Recording Code (External ID)
    restriction_reason VARCHAR(100), -- e.g. 'market', 'product', 'explicit'
    last_updated TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);

-- Many-to-Many link for tracks with multiple artists (collabs, features)
CREATE TABLE IF NOT EXISTS track_artists (
    track_id VARCHAR(255) REFERENCES tracks(id) ON DELETE CASCADE NOT NULL,
    artist_id VARCHAR(255) REFERENCES artists(id) ON DELETE CASCADE NOT NULL,
    artist_rank INTEGER DEFAULT 0 NOT NULL, -- 0 for primary artist, 1 for second, etc.
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (track_id, artist_id),
    CONSTRAINT uq_track_artists_track_rank UNIQUE (track_id, artist_rank)
);

CREATE INDEX IF NOT EXISTS idx_track_artists_artist_id ON track_artists(artist_id);

-- ─── 5. LISTENING HISTORY (ACCIDENTAL DATA LOSS PREVENTION) ───────────────────
-- Expanded composite PK: (user_id, played_at, track_id)
-- Partitioned by date range (played_at) to maintain high performance with millions of rows.
CREATE TABLE IF NOT EXISTS listening_history (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    track_id VARCHAR(255) REFERENCES tracks(id) ON DELETE CASCADE NOT NULL,
    played_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, played_at, track_id)
) PARTITION BY RANGE (played_at);

-- Default partition to catch any dates outside explicit range bounds
CREATE TABLE IF NOT EXISTS listening_history_default PARTITION OF listening_history DEFAULT;

-- Optimization: Explicit index on track_id is necessary. PostgreSQL does not automatically 
-- index foreign keys, and this avoids full table scans when deleting/cascading tracks 
-- or performing reverse analytic lookups (e.g. tracks list -> play counts).
-- Note: Indexes on partitioned tables automatically propagate to all partitions in PG 12+.
CREATE INDEX IF NOT EXISTS idx_listening_history_track_id ON listening_history(track_id);

-- Optimization: Composite index for fast "last 50 songs of a user" queries.
CREATE INDEX IF NOT EXISTS idx_listening_history_user_played ON listening_history(user_id, played_at DESC);

-- ─── 6. USER CACHE (CLIENT STATE SYNCHRONIZATION) ─────────────────────────────
CREATE TABLE IF NOT EXISTS user_cache (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (user_id, key)
);

-- ─── 7. STATS SNAPSHOTS (HISTORICAL TRACKING) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS stats_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    range VARCHAR(50) NOT NULL CONSTRAINT chk_snapshot_range CHECK (range IN ('short_term', 'medium_term', 'long_term')), -- Data validation constraint
    snapshot_date DATE DEFAULT CURRENT_DATE NOT NULL,
    explicit_percentage NUMERIC(5,2) DEFAULT 0.00 NOT NULL,
    genre_diversity INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT uq_stats_snapshots_user_range_date UNIQUE (user_id, range, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_stats_snapshots_user_range ON stats_snapshots(user_id, range);

-- Maps ranked top tracks for a given snapshot (constrained rank)
CREATE TABLE IF NOT EXISTS stats_snapshot_tracks (
    snapshot_id UUID REFERENCES stats_snapshots(id) ON DELETE CASCADE NOT NULL,
    track_id VARCHAR(255) REFERENCES tracks(id) ON DELETE CASCADE NOT NULL,
    rank INTEGER NOT NULL CONSTRAINT chk_track_rank CHECK (rank BETWEEN 1 AND 100),
    PRIMARY KEY (snapshot_id, rank),
    CONSTRAINT uq_stats_snapshot_tracks_track_id UNIQUE (snapshot_id, track_id)
);

-- Optimization: Index foreign key for faster analytical joins
CREATE INDEX IF NOT EXISTS idx_stats_snapshot_tracks_track_id ON stats_snapshot_tracks(track_id);

-- Maps ranked top artists for a given snapshot (constrained rank)
CREATE TABLE IF NOT EXISTS stats_snapshot_artists (
    snapshot_id UUID REFERENCES stats_snapshots(id) ON DELETE CASCADE NOT NULL,
    artist_id VARCHAR(255) REFERENCES artists(id) ON DELETE CASCADE NOT NULL,
    rank INTEGER NOT NULL CONSTRAINT chk_artist_rank CHECK (rank BETWEEN 1 AND 50),
    PRIMARY KEY (snapshot_id, rank),
    CONSTRAINT uq_stats_snapshot_artists_artist_id UNIQUE (snapshot_id, artist_id)
);

-- Optimization: Index foreign key for faster analytical joins
CREATE INDEX IF NOT EXISTS idx_stats_snapshot_artists_artist_id ON stats_snapshot_artists(artist_id);

-- Maps the ranked genres computed from the genres supplied with top artists.
CREATE TABLE IF NOT EXISTS stats_snapshot_genres (
    snapshot_id UUID REFERENCES stats_snapshots(id) ON DELETE CASCADE NOT NULL,
    genre_name VARCHAR(255) REFERENCES genres(name) ON DELETE CASCADE NOT NULL,
    rank INTEGER NOT NULL CONSTRAINT chk_genre_rank CHECK (rank BETWEEN 1 AND 15),
    weight INTEGER NOT NULL,
    PRIMARY KEY (snapshot_id, rank),
    CONSTRAINT uq_stats_snapshot_genres_genre_name UNIQUE (snapshot_id, genre_name)
);

CREATE INDEX IF NOT EXISTS idx_stats_snapshot_genres_genre ON stats_snapshot_genres(genre_name);

-- ─── 8. RAW TOP ITEMS LOGS (AUDIT & RE-COMPUTATION LOGS) ──────────────────────
-- Stores raw results of Spotify's top items query directly, allowing you to 
-- re-run/adjust snapshot algorithms retroactively.
CREATE TABLE IF NOT EXISTS user_top_tracks_history (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    time_range VARCHAR(50) NOT NULL, -- 'short_term', 'medium_term', 'long_term'
    rank INTEGER NOT NULL,
    track_id VARCHAR(255) REFERENCES tracks(id) ON DELETE CASCADE NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (user_id, time_range, fetched_at, rank)
);

CREATE TABLE IF NOT EXISTS user_top_artists_history (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    time_range VARCHAR(50) NOT NULL, -- 'short_term', 'medium_term', 'long_term'
    rank INTEGER NOT NULL,
    artist_id VARCHAR(255) REFERENCES artists(id) ON DELETE CASCADE NOT NULL,
    fetched_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (user_id, time_range, fetched_at, rank)
);


```

---

## 2. Optional Supabase Integration Extensions (SQL)

If you host your application on **Supabase** and want to utilize native Supabase Authentication and Row Level Security (RLS), execute the following SQL block. 

*If self-hosting a standard PostgreSQL instance, omit this section.*

```sql
-- ─── 1. LINK TO SUPABASE INTERNAL AUTH ────────────────────────────────────────
-- NOTE: In development mode, the foreign key constraint from users.id to auth.users.id
-- is dropped so that development UUIDs (starting with 'de11') can exist.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS fk_users_supabase_auth;

-- Re-links users.id to reference Supabase's managed auth schema (re-created if not in dev)
-- In production, run this constraint addition.
-- ALTER TABLE users ADD CONSTRAINT fk_users_supabase_auth FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Automated profile sync: Creates a public.users row whenever a user signs up.
-- Also pulls the metadata mapped from Spotify/OAuth provider metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = '' -- Sandbox hardening: Forces absolute schema qualification
AS $$
BEGIN
  BEGIN
    INSERT INTO public.users (id, spotify_id, display_name, profile_pic_url)
    VALUES (
      new.id,
      COALESCE(new.raw_user_meta_data->>'provider_id', new.id::text), -- Fallback identifier
      COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Spotify User'),
      new.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (spotify_id) DO UPDATE
    SET id = EXCLUDED.id,
        display_name = EXCLUDED.display_name,
        profile_pic_url = EXCLUDED.profile_pic_url;
  EXCEPTION WHEN OTHERS THEN
    -- Capture and log failures to prevent blocking user sign-ups
    RAISE WARNING 'Profile synchronization failed for user ID %: %', new.id, SQLERRM;
  END;
  RETURN new;
END;
$$;

-- Trigger to execute the profile sync automatically
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 2. ROW LEVEL SECURITY (RLS) POLICIES ─────────────────────────────────────
-- Restricts client-side access so users can only view and update their own data.

-- Enable RLS on Private User Tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE listening_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats_snapshot_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats_snapshot_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE stats_snapshot_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_top_tracks_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_top_artists_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_cache ENABLE ROW LEVEL SECURITY;

-- Enable RLS on Shared Metadata Tables (to prevent unauthorized client-side modifications)
ALTER TABLE artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_artists ENABLE ROW LEVEL SECURITY;

-- Helper function to generate dev UUID
CREATE OR REPLACE FUNCTION public.get_dev_uuid(usr_id UUID)
RETURNS UUID AS $$
BEGIN
  RETURN ('de11' || substring(usr_id::text from 5))::uuid;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- A. Users Table Policies (using InitPlan Caching)
DROP POLICY IF EXISTS "Users can view own profile" ON users;
CREATE POLICY "Users can view own profile" 
ON users FOR SELECT 
USING ((SELECT auth.uid()) = id OR id = public.get_dev_uuid((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile" 
ON users FOR UPDATE 
USING ((SELECT auth.uid()) = id OR id = public.get_dev_uuid((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can delete own profile" ON users;
CREATE POLICY "Users can delete own profile" 
ON users FOR DELETE 
USING ((SELECT auth.uid()) = id OR id = public.get_dev_uuid((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can insert own profile" ON users;
CREATE POLICY "Users can insert own profile" 
ON users FOR INSERT 
WITH CHECK ((SELECT auth.uid()) = id OR id = public.get_dev_uuid((SELECT auth.uid())));

-- B. Listening History Policies (using InitPlan Caching)
DROP POLICY IF EXISTS "Users can view own history" ON listening_history;
CREATE POLICY "Users can view own history" 
ON listening_history FOR SELECT 
USING ((SELECT auth.uid()) = user_id OR user_id = public.get_dev_uuid((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can insert own history" ON listening_history;
CREATE POLICY "Users can insert own history" 
ON listening_history FOR INSERT 
WITH CHECK ((SELECT auth.uid()) = user_id OR user_id = public.get_dev_uuid((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can delete own history" ON listening_history;
CREATE POLICY "Users can delete own history" 
ON listening_history FOR DELETE 
USING ((SELECT auth.uid()) = user_id OR user_id = public.get_dev_uuid((SELECT auth.uid())));

-- C. Stats Snapshots Policies (using InitPlan Caching)
DROP POLICY IF EXISTS "Users can view own snapshots" ON stats_snapshots;
CREATE POLICY "Users can view own snapshots" 
ON stats_snapshots FOR SELECT 
USING ((SELECT auth.uid()) = user_id OR user_id = public.get_dev_uuid((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can insert/update own snapshots" ON stats_snapshots;
CREATE POLICY "Users can insert/update own snapshots" 
ON stats_snapshots FOR ALL 
USING ((SELECT auth.uid()) = user_id OR user_id = public.get_dev_uuid((SELECT auth.uid())));

-- D. Stats Snapshot Junction Tables Policies (using InitPlan Caching)
DROP POLICY IF EXISTS "Users can manage own snapshot tracks" ON stats_snapshot_tracks;
CREATE POLICY "Users can manage own snapshot tracks" 
ON stats_snapshot_tracks FOR ALL 
USING (
    snapshot_id IN (
        SELECT s.id FROM stats_snapshots s 
        WHERE s.user_id = (SELECT auth.uid()) OR s.user_id = public.get_dev_uuid((SELECT auth.uid()))
    )
);

DROP POLICY IF EXISTS "Users can manage own snapshot artists" ON stats_snapshot_artists;
CREATE POLICY "Users can manage own snapshot artists" 
ON stats_snapshot_artists FOR ALL 
USING (
    snapshot_id IN (
        SELECT s.id FROM stats_snapshots s 
        WHERE s.user_id = (SELECT auth.uid()) OR s.user_id = public.get_dev_uuid((SELECT auth.uid()))
    )
);

DROP POLICY IF EXISTS "Users can manage own snapshot genres" ON stats_snapshot_genres;
CREATE POLICY "Users can manage own snapshot genres"
ON stats_snapshot_genres FOR ALL
USING (
    snapshot_id IN (
        SELECT s.id FROM stats_snapshots s
        WHERE s.user_id = (SELECT auth.uid()) OR s.user_id = public.get_dev_uuid((SELECT auth.uid()))
    )
);

-- E. Shared Metadata Tables Access Policies (For authenticated clients to select/insert/upsert metadata)
DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON artists;
CREATE POLICY "Allow all access to authenticated users" ON artists FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON genres;
CREATE POLICY "Allow all access to authenticated users" ON genres FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON albums;
CREATE POLICY "Allow all access to authenticated users" ON albums FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON album_artists;
CREATE POLICY "Allow all access to authenticated users" ON album_artists FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON tracks;
CREATE POLICY "Allow all access to authenticated users" ON tracks FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON track_artists;
CREATE POLICY "Allow all access to authenticated users" ON track_artists FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- F. Raw Top Items History Policies (using InitPlan Caching)
DROP POLICY IF EXISTS "Users can manage own top tracks raw history" ON user_top_tracks_history;
CREATE POLICY "Users can manage own top tracks raw history" 
ON user_top_tracks_history FOR ALL 
USING ((SELECT auth.uid()) = user_id OR user_id = public.get_dev_uuid((SELECT auth.uid())));

DROP POLICY IF EXISTS "Users can manage own top artists raw history" ON user_top_artists_history;
CREATE POLICY "Users can manage own top artists raw history" 
ON user_top_artists_history FOR ALL 
USING ((SELECT auth.uid()) = user_id OR user_id = public.get_dev_uuid((SELECT auth.uid())));

-- H. User Cache Policies (using InitPlan Caching)
DROP POLICY IF EXISTS "Users can manage own cache" ON user_cache;
CREATE POLICY "Users can manage own cache" 
ON user_cache FOR ALL 
USING ((SELECT auth.uid()) = user_id OR user_id = public.get_dev_uuid((SELECT auth.uid())));

-- G. Explicit B-Tree Indexes for RLS Filter Columns (High-performance optimization)
CREATE INDEX IF NOT EXISTS idx_user_top_tracks_history_user_id ON user_top_tracks_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_top_artists_history_user_id ON user_top_artists_history(user_id);
```

---

## 3. Optional Feature Modules (Supabase SQL)

The feature modules below are optional. They require the core schema from section 1 and the Supabase integration from section 2. For a new Supabase project, run the selected blocks in the order shown. Existing environments should continue applying the matching files in `supabase/migrations/`; these consolidated blocks are the single-file reference for the complete current schema.

### 3.1 Shared Playlists

Adds durable playlist sharing, seven-day unclaimed-link retention, recipient download mappings, revision tracking, RLS, trusted RPCs, daily cleanup, and Realtime updates. Omit this entire block when the Shared Playlists workspace feature is disabled.

```sql
-- BEGIN OPTIONAL MODULE: SHARED PLAYLISTS
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron;
create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.playlist_shares (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  recipient_user_id uuid references public.users(id) on delete cascade,
  source_playlist_id text not null,
  playlist_name text not null,
  playlist_description text not null default '',
  playlist_image_url text not null default '',
  owner_display_name text not null default 'Spotify user',
  owner_image_url text not null default '',
  recipient_display_name text,
  token_hash text not null unique check (length(token_hash) = 64),
  snapshot_hash text not null check (length(snapshot_hash) = 64),
  track_count integer not null default 0 check (track_count >= 0),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  claim_expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz
);

create table if not exists public.playlist_share_tracks (
  share_id uuid not null references public.playlist_shares(id) on delete cascade,
  position integer not null check (position >= 0),
  track_id text not null,
  track jsonb not null,
  primary key (share_id, position),
  unique (share_id, track_id)
);

create table if not exists public.playlist_share_downloads (
  share_id uuid not null references public.playlist_shares(id) on delete cascade,
  recipient_user_id uuid not null references public.users(id) on delete cascade,
  spotify_playlist_id text not null,
  spotify_playlist_url text not null default '',
  applied_revision bigint not null default 0 check (applied_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (share_id, recipient_user_id),
  unique (recipient_user_id, spotify_playlist_id)
);

create index if not exists playlist_shares_owner_idx
  on public.playlist_shares(owner_user_id, created_at desc);
create index if not exists playlist_shares_recipient_idx
  on public.playlist_shares(recipient_user_id, updated_at desc)
  where revoked_at is null;
create index if not exists playlist_shares_source_idx
  on public.playlist_shares(owner_user_id, source_playlist_id)
  where revoked_at is null;
create index if not exists playlist_share_tracks_share_idx
  on public.playlist_share_tracks(share_id, position);
create index if not exists playlist_shares_unclaimed_expiry_idx
  on public.playlist_shares(claim_expires_at)
  where recipient_user_id is null and revoked_at is null;
create index if not exists playlist_shares_revoked_retention_idx
  on public.playlist_shares(revoked_at)
  where revoked_at is not null;

alter table public.playlist_shares enable row level security;
alter table public.playlist_share_tracks enable row level security;
alter table public.playlist_share_downloads enable row level security;

drop policy if exists "Owners and active recipients can read playlist shares" on public.playlist_shares;
create policy "Owners and active recipients can read playlist shares"
  on public.playlist_shares
  for select
  to authenticated
  using (
    owner_user_id = auth.uid()
    or (recipient_user_id = auth.uid() and revoked_at is null)
  );

drop policy if exists "Owners and active recipients can read shared tracks" on public.playlist_share_tracks;
create policy "Owners and active recipients can read shared tracks"
  on public.playlist_share_tracks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.playlist_shares share
      where share.id = playlist_share_tracks.share_id
        and (
          share.owner_user_id = auth.uid()
          or (share.recipient_user_id = auth.uid() and share.revoked_at is null)
        )
    )
  );

drop policy if exists "Active recipients can read their download mapping" on public.playlist_share_downloads;
create policy "Active recipients can read their download mapping"
  on public.playlist_share_downloads
  for select
  to authenticated
  using (
    recipient_user_id = auth.uid()
    and exists (
      select 1
      from public.playlist_shares share
      where share.id = playlist_share_downloads.share_id
        and share.recipient_user_id = auth.uid()
        and share.revoked_at is null
    )
  );

create or replace function private.insert_playlist_share_tracks(
  p_share_id uuid,
  p_tracks jsonb
) returns void
language sql
security definer
set search_path = public, extensions
as $$
  with source_tracks as (
    select
      element,
      element ->> 'id' as track_id,
      ordinality
    from jsonb_array_elements(coalesce(p_tracks, '[]'::jsonb))
      with ordinality as item(element, ordinality)
    where nullif(element ->> 'id', '') is not null
  ),
  first_occurrences as (
    select distinct on (track_id)
      element,
      track_id,
      ordinality
    from source_tracks
    order by track_id, ordinality
  ),
  ordered_tracks as (
    select
      element,
      track_id,
      row_number() over (order by ordinality)::integer - 1 as position
    from first_occurrences
  )
  insert into public.playlist_share_tracks(share_id, position, track_id, track)
  select p_share_id, position, track_id, element
  from ordered_tracks
  order by position;
$$;

create or replace function public.create_playlist_share(
  p_source_playlist_id text,
  p_playlist_name text,
  p_playlist_description text,
  p_playlist_image_url text,
  p_owner_display_name text,
  p_owner_image_url text,
  p_claim_token text,
  p_tracks jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_share_id uuid;
  v_token_hash text;
  v_snapshot_hash text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if nullif(trim(p_source_playlist_id), '') is null
    or nullif(trim(p_playlist_name), '') is null then
    raise exception 'Playlist ID and name are required.';
  end if;
  if length(coalesce(p_claim_token, '')) < 32 then
    raise exception 'The claim token is invalid.';
  end if;
  if jsonb_typeof(coalesce(p_tracks, '[]'::jsonb)) <> 'array' then
    raise exception 'Tracks must be a JSON array.';
  end if;

  v_token_hash := encode(digest(convert_to(p_claim_token, 'UTF8'), 'sha256'), 'hex');
  v_snapshot_hash := encode(digest(convert_to(coalesce(p_tracks, '[]'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');

  insert into public.playlist_shares(
    owner_user_id,
    source_playlist_id,
    playlist_name,
    playlist_description,
    playlist_image_url,
    owner_display_name,
    owner_image_url,
    token_hash,
    snapshot_hash
  ) values (
    v_user_id,
    trim(p_source_playlist_id),
    left(trim(p_playlist_name), 100),
    left(coalesce(p_playlist_description, ''), 300),
    coalesce(p_playlist_image_url, ''),
    left(coalesce(nullif(trim(p_owner_display_name), ''), 'Spotify user'), 120),
    coalesce(p_owner_image_url, ''),
    v_token_hash,
    v_snapshot_hash
  ) returning id into v_share_id;

  perform private.insert_playlist_share_tracks(v_share_id, p_tracks);
  update public.playlist_shares
  set track_count = (
    select count(*)::integer
    from public.playlist_share_tracks
    where share_id = v_share_id
  )
  where id = v_share_id;
  return v_share_id;
end;
$$;

create or replace function public.refresh_playlist_share(
  p_share_id uuid,
  p_playlist_name text,
  p_playlist_description text,
  p_playlist_image_url text,
  p_tracks jsonb
) returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share public.playlist_shares%rowtype;
  v_snapshot_hash text;
  v_revision bigint;
begin
  select * into v_share
  from public.playlist_shares
  where id = p_share_id
  for update;

  if not found or v_share.owner_user_id <> auth.uid() or v_share.revoked_at is not null then
    raise exception 'The active share was not found or is not owned by this user.';
  end if;
  if jsonb_typeof(coalesce(p_tracks, '[]'::jsonb)) <> 'array' then
    raise exception 'Tracks must be a JSON array.';
  end if;

  v_snapshot_hash := encode(digest(convert_to(coalesce(p_tracks, '[]'::jsonb)::text, 'UTF8'), 'sha256'), 'hex');
  v_revision := v_share.revision;

  if v_snapshot_hash <> v_share.snapshot_hash then
    delete from public.playlist_share_tracks where share_id = p_share_id;
    perform private.insert_playlist_share_tracks(p_share_id, p_tracks);
    v_revision := v_revision + 1;
  end if;

  update public.playlist_shares
  set playlist_name = left(trim(p_playlist_name), 100),
      playlist_description = left(coalesce(p_playlist_description, ''), 300),
      playlist_image_url = coalesce(p_playlist_image_url, playlist_image_url),
      snapshot_hash = v_snapshot_hash,
      track_count = (
        select count(*)::integer
        from public.playlist_share_tracks
        where share_id = p_share_id
      ),
      revision = v_revision,
      updated_at = now()
  where id = p_share_id;

  return v_revision;
end;
$$;

create or replace function public.refresh_active_playlist_shares(
  p_source_playlist_id text,
  p_playlist_name text,
  p_tracks jsonb
) returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share record;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  for v_share in
    select id, playlist_description, playlist_image_url
    from public.playlist_shares
    where owner_user_id = auth.uid()
      and source_playlist_id = p_source_playlist_id
      and revoked_at is null
  loop
    perform public.refresh_playlist_share(
      v_share.id,
      p_playlist_name,
      v_share.playlist_description,
      v_share.playlist_image_url,
      p_tracks
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

create or replace function public.claim_playlist_share(
  p_claim_token text
) returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_share public.playlist_shares%rowtype;
  v_recipient_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;

  select * into v_share
  from public.playlist_shares
  where token_hash = encode(digest(convert_to(coalesce(p_claim_token, ''), 'UTF8'), 'sha256'), 'hex')
    and revoked_at is null
  for update;

  if not found then
    raise exception 'This share link is invalid or has been revoked.';
  end if;
  if v_share.recipient_user_id is null and v_share.claim_expires_at <= now() then
    raise exception 'This share link expired before it was claimed.';
  end if;
  if v_share.owner_user_id = v_user_id then
    raise exception 'The owner cannot claim their own share link.';
  end if;
  if v_share.recipient_user_id is not null and v_share.recipient_user_id <> v_user_id then
    raise exception 'This share link has already been claimed.';
  end if;

  select display_name into v_recipient_name
  from public.users
  where id = v_user_id;

  update public.playlist_shares
  set recipient_user_id = v_user_id,
      recipient_display_name = coalesce(v_recipient_name, 'Spotify user'),
      accepted_at = coalesce(accepted_at, now()),
      updated_at = now()
  where id = v_share.id;

  return v_share.id;
end;
$$;

create or replace function public.revoke_playlist_share(
  p_share_id uuid
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_share_id uuid;
begin
  select id into v_share_id
  from public.playlist_shares
  where id = p_share_id
    and owner_user_id = auth.uid()
    and revoked_at is null
  for update;

  if not found then
    raise exception 'The active share was not found or is not owned by this user.';
  end if;

  delete from public.playlist_share_downloads where share_id = v_share_id;
  delete from public.playlist_share_tracks where share_id = v_share_id;

  update public.playlist_shares
  set revoked_at = now(),
      updated_at = now(),
      playlist_description = '',
      playlist_image_url = '',
      owner_image_url = '',
      token_hash = encode(digest(convert_to('revoked:' || id::text, 'UTF8'), 'sha256'), 'hex'),
      snapshot_hash = encode(digest(convert_to('[]', 'UTF8'), 'sha256'), 'hex'),
      track_count = 0
  where id = v_share_id;
end;
$$;

create or replace function private.cleanup_playlist_share_retention()
returns table (
  expired_unclaimed_deleted bigint,
  revoked_tombstones_deleted bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expired_unclaimed_deleted bigint := 0;
  v_revoked_tombstones_deleted bigint := 0;
begin
  delete from public.playlist_shares
  where recipient_user_id is null
    and revoked_at is null
    and claim_expires_at <= now();
  get diagnostics v_expired_unclaimed_deleted = row_count;

  delete from public.playlist_shares
  where revoked_at is not null
    and revoked_at <= now() - interval '30 days';
  get diagnostics v_revoked_tombstones_deleted = row_count;

  return query select v_expired_unclaimed_deleted, v_revoked_tombstones_deleted;
end;
$$;

create or replace function public.record_playlist_share_download(
  p_share_id uuid,
  p_spotify_playlist_id text,
  p_spotify_playlist_url text,
  p_applied_revision bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share public.playlist_shares%rowtype;
begin
  select * into v_share
  from public.playlist_shares
  where id = p_share_id
    and recipient_user_id = auth.uid()
    and revoked_at is null
  for update;

  if not found then
    raise exception 'The active shared playlist is unavailable.';
  end if;
  if nullif(trim(p_spotify_playlist_id), '') is null then
    raise exception 'A Spotify playlist ID is required.';
  end if;
  if p_applied_revision < 0 or p_applied_revision > v_share.revision then
    raise exception 'The applied revision is invalid.';
  end if;

  insert into public.playlist_share_downloads(
    share_id,
    recipient_user_id,
    spotify_playlist_id,
    spotify_playlist_url,
    applied_revision
  ) values (
    p_share_id,
    auth.uid(),
    trim(p_spotify_playlist_id),
    coalesce(p_spotify_playlist_url, ''),
    p_applied_revision
  )
  on conflict (share_id, recipient_user_id)
  do update set
    spotify_playlist_id = excluded.spotify_playlist_id,
    spotify_playlist_url = excluded.spotify_playlist_url,
    applied_revision = excluded.applied_revision,
    updated_at = now();
end;
$$;

revoke all on function private.insert_playlist_share_tracks(uuid, jsonb) from public;
revoke all on function public.create_playlist_share(text, text, text, text, text, text, text, jsonb) from public;
revoke all on function public.refresh_playlist_share(uuid, text, text, text, jsonb) from public;
revoke all on function public.refresh_active_playlist_shares(text, text, jsonb) from public;
revoke all on function public.claim_playlist_share(text) from public;
revoke all on function public.revoke_playlist_share(uuid) from public;
revoke all on function private.cleanup_playlist_share_retention() from public;
revoke all on function public.record_playlist_share_download(uuid, text, text, bigint) from public;

grant execute on function public.create_playlist_share(text, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.refresh_playlist_share(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.refresh_active_playlist_shares(text, text, jsonb) to authenticated;
grant execute on function public.claim_playlist_share(text) to authenticated;
grant execute on function public.revoke_playlist_share(uuid) to authenticated;
grant execute on function public.record_playlist_share_download(uuid, text, text, bigint) to authenticated;

grant select on public.playlist_shares to authenticated;
grant select on public.playlist_share_tracks to authenticated;
grant select on public.playlist_share_downloads to authenticated;

select cron.schedule(
  'analytify-playlist-share-retention',
  '17 3 * * *',
  $cron$select private.cleanup_playlist_share_retention();$cron$
);
-- Realtime addition from 20260802014500_playlist_share_realtime.sql
do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'playlist_shares'
  ) then
    alter publication supabase_realtime add table public.playlist_shares;
  end if;
end
$$;
-- END OPTIONAL MODULE: SHARED PLAYLISTS
```

### 3.2 Song League

Adds private leagues, invitations, Friday rounds, eligibility validation, four-week rank scoring, standings, owner-authorized deletion, private per-member Weekly Picks playlist state, trusted playlist-sync payloads, RLS, and Realtime updates. It depends on daily `short_term` stats snapshots and the Spotify refresh token stored on `public.users`.

```sql
-- BEGIN OPTIONAL MODULE: SONG LEAGUE
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

-- Owner deletion addition from 20260809180000_song_league_owner_delete.sql
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
-- Weekly private playlist addition from 20260809150000_song_league_weekly_playlists.sql
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
-- Standings ordering fix from 20260809170000_song_league_standings_order_fix.sql
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
-- END OPTIONAL MODULE: SONG LEAGUE
```
