-- Spotify Developer Terms V10, Section V.11 requires an enforceable EULA.
-- Acceptance is server-timestamped and bound to the authenticated identity.

create table public.terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  acceptance_session_id uuid not null,
  connection_mode text not null check (connection_mode in ('hosted', 'personal_pkce')),
  unique (user_id, terms_version)
);

create index terms_acceptances_user_idx on public.terms_acceptances(user_id, accepted_at desc);
alter table public.terms_acceptances enable row level security;

create policy "Users can read their own terms acceptance"
on public.terms_acceptances for select to authenticated
using (user_id = auth.uid());

revoke all on public.terms_acceptances from public, anon, authenticated;
grant select on public.terms_acceptances to authenticated;

create function public.accept_current_terms(
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
  if p_terms_version <> 'analytify-eula-2026-09-19' then
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

comment on table public.terms_acceptances is
  'Immutable evidence that an authenticated user affirmatively accepted a specific Analytify EULA version.';
