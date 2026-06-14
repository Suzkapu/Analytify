# Analytify - Supabase Database Schema Design

This document outlines the final, production-ready, highly normalized database schema for Supabase (PostgreSQL). It incorporates full track, artist, album, and audio features metadata directly aligned with the Spotify Web API.

To ensure **portability**, the core schema is written in standard ANSI SQL / PostgreSQL, making it 100% compatible with self-hosted PostgreSQL databases. Supabase-specific configurations (like Row Level Security (RLS) and linkages to Supabase Auth) are separated into an optional section at the bottom of the script.

---

## 1. Core Relational Database Schema DDL (SQL)

You can run the following SQL script directly in your **Supabase SQL Editor** or any standard **PostgreSQL database**.

```sql
-- Enable extensions if not enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- For gen_random_uuid() on pre-v13 PostgreSQL
CREATE EXTENSION IF NOT EXISTS "btree_gin";  -- For GIN indexes on available_markets

-- ─── 1. USER PROFILES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spotify_id VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    profile_pic_url TEXT,
    spotify_refresh_token TEXT,
    last_synced_at TIMESTAMPTZ, -- Optimization: Tracks last successful sync to avoid API rate limits
    backup_active BOOLEAN DEFAULT false NOT NULL, -- Setting: Controls if automated database backup is enabled for the user
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Note: No manual index on spotify_id is needed. PostgreSQL implicitly 
-- creates a B-tree index for UNIQUE constraints.

-- ─── 2. ARTISTS & GENRES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS artists (
    id VARCHAR(255) PRIMARY KEY, -- Spotify Artist ID
    name VARCHAR(255) NOT NULL,
    image_url TEXT,
    spotify_url TEXT,
    popularity INTEGER DEFAULT 0 NOT NULL CONSTRAINT chk_artist_popularity CHECK (popularity BETWEEN 0 AND 100), -- Current live popularity (automatically updated via trigger)
    followers_count BIGINT DEFAULT 0 NOT NULL, -- Current live followers (automatically updated via trigger, scaled to BIGINT)
    last_updated TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Optimization: Genre name is used as the Primary Key directly. 
-- Since Spotify genres are short strings, this eliminates the need for an integer ID,
-- saves join operations during retrieval, and simplifies insertion logic.
CREATE TABLE IF NOT EXISTS genres (
    name VARCHAR(255) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS artist_genres (
    artist_id VARCHAR(255) REFERENCES artists(id) ON DELETE CASCADE NOT NULL,
    genre_name VARCHAR(255) REFERENCES genres(name) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL, -- Metadata import timestamp
    PRIMARY KEY (artist_id, genre_name)
);

CREATE INDEX IF NOT EXISTS idx_artist_genres_genre ON artist_genres(genre_name);

-- ─── 3. ALBUMS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS albums (
    id VARCHAR(255) PRIMARY KEY, -- Spotify Album ID
    name TEXT NOT NULL,
    album_type VARCHAR(50), -- e.g. 'album', 'single', 'compilation', 'appears_on' (Relaxed to avoid API version drift failures)
    total_tracks INTEGER DEFAULT 1 NOT NULL,
    release_date DATE, -- Optimized to DATE for standard SQL queries and sorting (requires YYYY-MM-DD padding on import)
    release_date_precision VARCHAR(10) CONSTRAINT chk_release_precision CHECK (release_date_precision IN ('year', 'month', 'day')), -- Tells UI how to render
    image_url TEXT, -- Album cover
    spotify_url TEXT,
    label TEXT,
    popularity INTEGER DEFAULT 0 NOT NULL CONSTRAINT chk_album_popularity CHECK (popularity BETWEEN 0 AND 100), -- Current live popularity (automatically updated via trigger)
    upc VARCHAR(100), -- Universal Product Code (External ID)
    ean VARCHAR(100), -- International Article Number (External ID)
    available_markets VARCHAR(2)[] NOT NULL DEFAULT '{}', -- Geo availability list (empty array '{}' represents unavailable in all markets)
    restriction_reason VARCHAR(100), -- e.g. 'market', 'product', 'explicit'
    last_updated TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- GIN (Generalized Inverted Index) for high-performance geo-filtering on available markets
CREATE INDEX IF NOT EXISTS idx_albums_markets ON albums USING GIN (available_markets);

-- Many-to-Many link for albums with multiple artists
CREATE TABLE IF NOT EXISTS album_artists (
    album_id VARCHAR(255) REFERENCES albums(id) ON DELETE CASCADE NOT NULL,
    artist_id VARCHAR(255) REFERENCES artists(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (album_id, artist_id)
);

-- Optimization: Explicit index on artist_id for join queries on albums by artist.
CREATE INDEX IF NOT EXISTS idx_album_artists_artist_id ON album_artists(artist_id);

-- Copyright details for albums
CREATE TABLE IF NOT EXISTS album_copyrights (
    id SERIAL PRIMARY KEY,
    album_id VARCHAR(255) REFERENCES albums(id) ON DELETE CASCADE NOT NULL,
    text TEXT NOT NULL,
    type VARCHAR(5) NOT NULL, -- 'C' (copyright) or 'P' (phonorecord copyright)
    CONSTRAINT chk_copyright_type CHECK (type IN ('C', 'P'))
);

CREATE INDEX IF NOT EXISTS idx_album_copyrights_album ON album_copyrights(album_id);

-- ─── 4. TRACKS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tracks (
    id VARCHAR(255) PRIMARY KEY, -- Spotify Track ID
    name TEXT NOT NULL,
    album_id VARCHAR(255) REFERENCES albums(id) ON DELETE SET NULL, -- SET NULL keeps tracks if album record is deleted
    duration_ms INTEGER DEFAULT 0 NOT NULL,
    explicit BOOLEAN DEFAULT false NOT NULL,
    spotify_url TEXT,
    popularity INTEGER DEFAULT 0 NOT NULL CONSTRAINT chk_track_popularity CHECK (popularity BETWEEN 0 AND 100), -- Current live popularity (automatically updated via trigger)
    track_number INTEGER DEFAULT 1 NOT NULL,
    disc_number INTEGER DEFAULT 1 NOT NULL,
    preview_url TEXT,
    is_playable BOOLEAN DEFAULT true NOT NULL,
    linked_from_track_id VARCHAR(255) REFERENCES tracks(id) ON DELETE SET NULL, -- Self-referential constraint
    is_local BOOLEAN DEFAULT false NOT NULL,
    isrc VARCHAR(100), -- International Standard Recording Code (External ID)
    available_markets VARCHAR(2)[] NOT NULL DEFAULT '{}', -- Geo availability list
    restriction_reason VARCHAR(100), -- e.g. 'market', 'product', 'explicit'
    last_updated TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);

-- GIN (Generalized Inverted Index) for high-performance geo-filtering on track availability
CREATE INDEX IF NOT EXISTS idx_tracks_markets ON tracks USING GIN (available_markets);

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

-- ─── 5. TRACK AUDIO FEATURES (METADATA EXTENSIONS) ───────────────────────────
CREATE TABLE IF NOT EXISTS track_audio_features (
    track_id VARCHAR(255) PRIMARY KEY REFERENCES tracks(id) ON DELETE CASCADE,
    danceability REAL NOT NULL CONSTRAINT chk_danceability CHECK (danceability BETWEEN 0 AND 1),
    energy REAL NOT NULL CONSTRAINT chk_energy CHECK (energy BETWEEN 0 AND 1),
    key INTEGER NOT NULL,
    loudness REAL NOT NULL,
    mode INTEGER NOT NULL,
    speechiness REAL NOT NULL CONSTRAINT chk_speechiness CHECK (speechiness BETWEEN 0 AND 1),
    acousticness REAL NOT NULL CONSTRAINT chk_acousticness CHECK (acousticness BETWEEN 0 AND 1),
    instrumentalness REAL NOT NULL CONSTRAINT chk_instrumentalness CHECK (instrumentalness BETWEEN 0 AND 1),
    liveness REAL NOT NULL CONSTRAINT chk_liveness CHECK (liveness BETWEEN 0 AND 1),
    valence REAL NOT NULL CONSTRAINT chk_valence CHECK (valence BETWEEN 0 AND 1), -- "happiness" metric
    tempo REAL NOT NULL,
    time_signature INTEGER NOT NULL,
    last_updated TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ─── 6. LONG-TERM POPULARITY HISTORY (TRACKS, ARTISTS & ALBUMS) ───────────────
-- Allows you to track how song/artist/album popularity changes over years/decades.
-- Partitioned by date range (recorded_at) to scale over decades.
CREATE TABLE IF NOT EXISTS track_popularity_history (
    track_id VARCHAR(255) REFERENCES tracks(id) ON DELETE CASCADE NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    popularity INTEGER NOT NULL CONSTRAINT chk_history_track_popularity CHECK (popularity BETWEEN 0 AND 100),
    PRIMARY KEY (track_id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Default partition to catch any dates outside explicit range bounds
CREATE TABLE IF NOT EXISTS track_popularity_history_default PARTITION OF track_popularity_history DEFAULT;

CREATE TABLE IF NOT EXISTS artist_popularity_history (
    artist_id VARCHAR(255) REFERENCES artists(id) ON DELETE CASCADE NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    popularity INTEGER NOT NULL CONSTRAINT chk_history_artist_popularity CHECK (popularity BETWEEN 0 AND 100),
    followers_count BIGINT NOT NULL, -- Scaled to BIGINT
    PRIMARY KEY (artist_id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Default partition to catch any dates outside explicit range bounds
CREATE TABLE IF NOT EXISTS artist_popularity_history_default PARTITION OF artist_popularity_history DEFAULT;

CREATE TABLE IF NOT EXISTS album_popularity_history (
    album_id VARCHAR(255) REFERENCES albums(id) ON DELETE CASCADE NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    popularity INTEGER NOT NULL CONSTRAINT chk_history_album_popularity CHECK (popularity BETWEEN 0 AND 100),
    PRIMARY KEY (album_id, recorded_at)
) PARTITION BY RANGE (recorded_at);

-- Default partition to catch any dates outside explicit range bounds
CREATE TABLE IF NOT EXISTS album_popularity_history_default PARTITION OF album_popularity_history DEFAULT;

-- ─── 7. LISTENING HISTORY (ACCIDENTAL DATA LOSS PREVENTION) ───────────────────
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

-- ─── 7B. USER CACHE (CLIENT STATE SYNCHRONIZATION) ───────────────────────────
CREATE TABLE IF NOT EXISTS user_cache (
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    PRIMARY KEY (user_id, key)
);

-- ─── 8. STATS SNAPSHOTS (HISTORICAL TRACKING) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS stats_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    range VARCHAR(50) CONSTRAINT chk_snapshot_range CHECK (range IN ('short_term', 'medium_term', 'long_term')), -- Data validation constraint
    snapshot_date DATE DEFAULT CURRENT_DATE NOT NULL,
    avg_popularity NUMERIC(5,2) DEFAULT 0.00 NOT NULL,
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

-- Maps ranked top genres for a given snapshot (constrained rank)
CREATE TABLE IF NOT EXISTS stats_snapshot_genres (
    snapshot_id UUID REFERENCES stats_snapshots(id) ON DELETE CASCADE NOT NULL,
    genre_name VARCHAR(255) REFERENCES genres(name) ON DELETE CASCADE NOT NULL,
    rank INTEGER NOT NULL CONSTRAINT chk_genre_rank CHECK (rank BETWEEN 1 AND 15),
    weight INTEGER NOT NULL, -- The computed weight score for this genre in the snapshot
    PRIMARY KEY (snapshot_id, rank),
    CONSTRAINT uq_stats_snapshot_genres_genre_name UNIQUE (snapshot_id, genre_name)
);

-- Optimization: Index foreign key for faster analytical joins
CREATE INDEX IF NOT EXISTS idx_stats_snapshot_genres_genre ON stats_snapshot_genres(genre_name);

-- ─── 8B. RAW TOP ITEMS LOGS (AUDIT & RE-COMPUTATION LOGS) ─────────────────────
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


-- ─── 9. DATABASE AUTOMATION TRIGGERS ──────────────────────────────────────────
-- Automatically synchronizes live popularity/follower data in main tables 
-- whenever a new entry is added to the historical popularity logs.
-- Includes chronology checks to prevent backfilled historical data from rewinding current stats.

-- A. Track Popularity Trigger
CREATE OR REPLACE FUNCTION update_track_popularity_from_history()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE tracks
    SET popularity = NEW.popularity,
        last_updated = NEW.recorded_at
    WHERE id = NEW.track_id
      AND (last_updated IS NULL OR NEW.recorded_at >= last_updated); -- Chronology Check
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_update_track_popularity
AFTER INSERT ON track_popularity_history
FOR EACH ROW
EXECUTE FUNCTION update_track_popularity_from_history();

-- B. Artist Popularity/Followers Trigger
CREATE OR REPLACE FUNCTION update_artist_popularity_from_history()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE artists
    SET popularity = NEW.popularity,
        followers_count = NEW.followers_count,
        last_updated = NEW.recorded_at
    WHERE id = NEW.artist_id
      AND (last_updated IS NULL OR NEW.recorded_at >= last_updated); -- Chronology Check
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_update_artist_popularity
AFTER INSERT ON artist_popularity_history
FOR EACH ROW
EXECUTE FUNCTION update_artist_popularity_from_history();

-- C. Album Popularity Trigger
CREATE OR REPLACE FUNCTION update_album_popularity_from_history()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE albums
    SET popularity = NEW.popularity,
        last_updated = NEW.recorded_at
    WHERE id = NEW.album_id
      AND (last_updated IS NULL OR NEW.recorded_at >= last_updated); -- Chronology Check
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_update_album_popularity
AFTER INSERT ON album_popularity_history
FOR EACH ROW
EXECUTE FUNCTION update_album_popularity_from_history();
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
ALTER TABLE artist_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_copyrights ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_audio_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE track_popularity_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_popularity_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE album_popularity_history ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON artist_genres;
CREATE POLICY "Allow all access to authenticated users" ON artist_genres FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON albums;
CREATE POLICY "Allow all access to authenticated users" ON albums FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON album_artists;
CREATE POLICY "Allow all access to authenticated users" ON album_artists FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON album_copyrights;
CREATE POLICY "Allow all access to authenticated users" ON album_copyrights FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON tracks;
CREATE POLICY "Allow all access to authenticated users" ON tracks FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON track_artists;
CREATE POLICY "Allow all access to authenticated users" ON track_artists FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON track_audio_features;
CREATE POLICY "Allow all access to authenticated users" ON track_audio_features FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON track_popularity_history;
CREATE POLICY "Allow all access to authenticated users" ON track_popularity_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON artist_popularity_history;
CREATE POLICY "Allow all access to authenticated users" ON artist_popularity_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON album_popularity_history;
CREATE POLICY "Allow all access to authenticated users" ON album_popularity_history FOR ALL TO authenticated USING (true) WITH CHECK (true);

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

