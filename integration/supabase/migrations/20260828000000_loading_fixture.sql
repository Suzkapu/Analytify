create table public.user_cache (
  user_id uuid not null,
  key text not null,
  value text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.user_cache enable row level security;

-- This database exists only inside the GitHub runner. Anonymous read access
-- lets the browser test exercise the real PostgREST/Supabase transport without
-- putting a service-role credential into the Karma browser process.
create policy "CI fixture cache is readable"
  on public.user_cache for select to anon using (true);

grant usage on schema public to anon;
grant select on public.user_cache to anon;

insert into public.user_cache (user_id, key, value) values
  (
    '11111111-1111-4111-8111-111111111111',
    'ci-spotify-user_playlists',
    $$[
      {"id":"fav","name":"Favourite Tracks","description":"Cloud liked songs","tracks":{"total":21}},
      {"id":"ci-cloud-playlist","name":"CI Cloud Playlist","description":"Loaded from real Supabase","owner":{"id":"ci-spotify-user"},"tracks":{"total":7}}
    ]$$
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'ci-spotify-user_playlists_lastUpdated',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'ci-spotify-user_stats_short_term_tracks',
    $$[
      {
        "id":"ci-cloud-track",
        "name":"CI Supabase Song",
        "duration_ms":201000,
        "explicit":false,
        "artists":[{"id":"ci-cloud-artist","name":"CI Supabase Artist"}],
        "album":{"id":"ci-cloud-album","name":"CI Cloud Album","images":[]},
        "external_urls":{"spotify":"https://open.spotify.com/track/ci-cloud-track"}
      }
    ]$$
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'ci-spotify-user_stats_short_term_artists',
    $$[
      {"id":"ci-cloud-artist","name":"CI Supabase Artist","genres":["ci genre"],"images":[]}
    ]$$
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'ci-spotify-user_stats_short_term_genres',
    $$[
      {"name":"ci genre","count":1,"percentage":100,"percentage_simple":100}
    ]$$
  ),
  (
    '11111111-1111-4111-8111-111111111111',
    'ci-spotify-user_stats_short_term_lastUpdated',
    floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text
  );
