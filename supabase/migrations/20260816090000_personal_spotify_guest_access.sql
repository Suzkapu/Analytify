-- Personal Spotify app credentials. Refresh tokens are encrypted by trusted
-- services before they reach this table; browser clients have no direct access.
create table if not exists public.spotify_credentials (
  user_id uuid primary key references public.users(id) on delete cascade,
  connection_mode text not null check (connection_mode in ('hosted', 'personal_pkce')),
  client_id text,
  refresh_token_ciphertext text not null,
  refresh_token_nonce text not null,
  key_version integer not null default 1 check (key_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spotify_credentials_personal_client_check check (
    (connection_mode = 'hosted' and client_id is null)
    or (connection_mode = 'personal_pkce' and client_id ~ '^[A-Za-z0-9]{32}$')
  )
);

alter table public.spotify_credentials enable row level security;
revoke all on public.spotify_credentials from anon, authenticated;
grant all on public.spotify_credentials to service_role;

comment on table public.spotify_credentials is
  'Service-only encrypted Spotify refresh credentials. Ciphertext is AES-256-GCM and the key is never stored in PostgreSQL.';
comment on column public.users.spotify_refresh_token is
  'Deprecated migration source. Trusted workers clear this after encrypting it into spotify_credentials.';

-- Preserve the existing public RPC signature while reporting encrypted and
-- not-yet-migrated credentials alike during the staged rollout.
create or replace function public.admin_list_users()
returns table (
  user_id uuid,
  spotify_id text,
  display_name text,
  profile_pic_url text,
  backup_active boolean,
  has_refresh_token boolean,
  enabled boolean,
  timezone text,
  history_enabled boolean,
  history_interval_minutes integer,
  short_term_enabled boolean,
  short_term_interval_hours integer,
  medium_term_enabled boolean,
  medium_term_interval_hours integer,
  long_term_enabled boolean,
  long_term_interval_hours integer,
  song_league_playlists_enabled boolean,
  song_league_playlist_interval_minutes integer,
  shared_playlists_enabled boolean,
  shared_playlist_interval_minutes integer,
  last_success_at timestamptz,
  last_error text
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  return query
  select
    profile.id,
    profile.spotify_id::text,
    coalesce(profile.display_name, 'Spotify user')::text,
    coalesce(profile.profile_pic_url, '')::text,
    profile.backup_active,
    (credential.user_id is not null or profile.spotify_refresh_token is not null),
    coalesce(settings.enabled, false),
    coalesce(settings.timezone, 'Europe/Vienna')::text,
    coalesce(settings.history_enabled, true),
    coalesce(settings.history_interval_minutes, 60),
    coalesce(settings.short_term_enabled, true),
    coalesce(settings.short_term_interval_hours, 24),
    coalesce(settings.medium_term_enabled, true),
    coalesce(settings.medium_term_interval_hours, 168),
    coalesce(settings.long_term_enabled, true),
    coalesce(settings.long_term_interval_hours, 168),
    coalesce(settings.song_league_playlists_enabled, true),
    coalesce(settings.song_league_playlist_interval_minutes, 60),
    coalesce(settings.shared_playlists_enabled, true),
    coalesce(settings.shared_playlist_interval_minutes, 60),
    state.last_success_at,
    state.last_error
  from public.users profile
  left join public.spotify_credentials credential on credential.user_id = profile.id
  left join public.sync_user_settings settings on settings.user_id = profile.id
  left join lateral (
    select max(task.last_success_at) as last_success_at,
      (array_agg(task.last_error order by task.updated_at desc)
        filter (where task.last_error is not null))[1] as last_error
    from public.sync_task_state task where task.user_id = profile.id
  ) state on true
  where profile.spotify_id not like 'analytify_demo_bot_%'
  order by lower(coalesce(profile.display_name, profile.spotify_id));
end;
$$;

