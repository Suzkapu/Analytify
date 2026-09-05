-- Spotify identity is security-sensitive because administrator reconciliation
-- uses only identities verified by the credential Edge Function. Browser
-- clients may change operational flags, but never identity/profile columns.
revoke insert, update on table public.users from anon, authenticated;
grant update (backup_active, last_synced_at) on table public.users to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.users (id, spotify_id, display_name, profile_pic_url)
    values (
      new.id,
      'pending:' || new.id::text,
      'Spotify User',
      null
    )
    on conflict (id) do nothing;
  exception when others then
    raise warning 'Profile initialization failed for user ID %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

do $$
begin
  if has_table_privilege('authenticated', 'public.users', 'insert') then
    raise exception 'authenticated must not insert public.users rows';
  end if;
  if has_column_privilege('authenticated', 'public.users', 'spotify_id', 'update')
    or has_column_privilege('authenticated', 'public.users', 'id', 'update') then
    raise exception 'authenticated must not update profile identity columns';
  end if;
  if not has_column_privilege('authenticated', 'public.users', 'backup_active', 'update') then
    raise exception 'authenticated must retain the explicit backup toggle';
  end if;
end;
$$;
