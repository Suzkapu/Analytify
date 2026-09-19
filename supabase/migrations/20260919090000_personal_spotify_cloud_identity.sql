-- Keep the security-sensitive spotify_id unique. Browser-bound personal-PKCE
-- identities receive a UUID-scoped internal value there, while this read-only
-- column retains the Spotify identity verified by the credential Edge Function.
alter table public.users add column if not exists verified_spotify_id varchar(255);
update public.users
set verified_spotify_id = spotify_id
where verified_spotify_id is null and spotify_id not like 'pending:%';
create index if not exists idx_users_verified_spotify_id
  on public.users (verified_spotify_id);

-- URL checks are deliberately unavailable to browser roles. Trusted workers
-- still need EXECUTE because PostgreSQL evaluates this helper from CHECK
-- constraints during service-role catalog and playlist writes.
revoke all on function private.is_valid_spotify_url(text, text) from public, anon, authenticated;
grant execute on function private.is_valid_spotify_url(text, text) to service_role;
