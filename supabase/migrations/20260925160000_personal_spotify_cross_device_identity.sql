-- Public Spotify Client IDs are not secrets, but their account mapping and
-- canonical Supabase identity are service-owned so browser clients cannot
-- claim or replace another account's login configuration.
create table if not exists public.personal_spotify_identities (
  verified_spotify_id text primary key,
  client_id text not null check (client_id ~ '^[A-Za-z0-9]{32}$'),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(verified_spotify_id) between 1 and 255)
);

alter table public.personal_spotify_identities enable row level security;
revoke all on public.personal_spotify_identities from public, anon, authenticated;
grant all on public.personal_spotify_identities to service_role;

comment on table public.personal_spotify_identities is
  'Service-only recovery registry for personal Spotify PKCE clients. Client IDs are public; account binding changes require fresh Spotify OAuth proof.';

create index if not exists personal_spotify_identities_auth_user_idx
  on public.personal_spotify_identities(auth_user_id);

create or replace function public.accept_current_terms(
  p_terms_version text,
  p_acceptance_session_id uuid,
  p_connection_mode text
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_user_id uuid := auth.uid(); v_accepted_at timestamptz;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_terms_version <> 'analytify-eula-2026-09-25' then
    raise exception 'The current Terms version must be accepted.';
  end if;
  if p_acceptance_session_id is null then raise exception 'An acceptance session is required.'; end if;
  if p_connection_mode not in ('hosted', 'personal_pkce') then raise exception 'Invalid connection mode.'; end if;
  insert into public.terms_acceptances(user_id, terms_version, acceptance_session_id, connection_mode)
  values (v_user_id, p_terms_version, p_acceptance_session_id, p_connection_mode)
  on conflict (user_id, terms_version) do nothing
  returning accepted_at into v_accepted_at;
  if v_accepted_at is null then
    select accepted_at into v_accepted_at from public.terms_acceptances
    where user_id = v_user_id and terms_version = p_terms_version;
  end if;
  return v_accepted_at;
end;
$$;

revoke all on function public.accept_current_terms(text, uuid, text) from public, anon;
grant execute on function public.accept_current_terms(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';
