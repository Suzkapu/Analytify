-- Keep the server-side acceptance allowlist synchronized with the material
-- Privacy Notice update published on 22 September 2026.
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
  if p_terms_version <> 'analytify-eula-2026-09-22' then
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
