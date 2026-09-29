-- Anonymous personal-app identities are created before Spotify can be
-- verified. Do not expose a public profile at that point: the trusted
-- spotify-credentials function creates it only after both the bearer token
-- and requested Spotify identity have passed verification.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;
  begin
    insert into public.users (id, spotify_id, display_name, profile_pic_url)
    values (new.id, 'pending:' || new.id::text, 'Spotify User', null)
    on conflict (id) do nothing;
  exception when others then
    raise warning 'Profile initialization failed for user ID %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Remove only abandoned pending identities that are old enough to be well
-- outside an OAuth callback and have no user-owned foreign-key records. The
-- cleanup is audited and intentionally fails closed on any linked record.
create or replace function private.cleanup_abandoned_pending_profiles(
  p_older_than interval default interval '1 hour'
) returns integer
language plpgsql
security definer
set search_path = public, private, auth, pg_catalog
as $$
declare
  v_profile record;
  v_reference record;
  v_count bigint;
  v_has_reference boolean;
  v_deleted integer := 0;
begin
  if p_older_than < interval '15 minutes' then
    raise exception 'The pending-profile grace period is too short.' using errcode = '22023';
  end if;

  for v_profile in
    select profile.id, profile.spotify_id
    from public.users profile
    where profile.spotify_id = 'pending:' || profile.id::text
      and profile.verified_spotify_id is null
      and not profile.backup_active
      and profile.spotify_refresh_token is null
      and profile.created_at < now() - p_older_than
    order by profile.created_at
    for update skip locked
  loop
    v_has_reference := false;
    for v_reference in
      select ns.nspname as schema_name, cls.relname as table_name, att.attname as column_name
      from pg_constraint con
      join pg_class cls on cls.oid = con.conrelid
      join pg_namespace ns on ns.oid = cls.relnamespace
      join unnest(con.conkey) with ordinality key(attnum, ord) on true
      join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key.attnum
      where con.contype = 'f' and con.confrelid = 'public.users'::regclass
        and ns.nspname = 'public'
        and cls.relname not in ('sync_user_settings', 'pending_profile_cleanup_audit')
      order by cls.relname, att.attname
    loop
      execute format('select count(*) from %I.%I where %I = $1',
        v_reference.schema_name, v_reference.table_name, v_reference.column_name)
        into v_count using v_profile.id;
      if v_count > 0 then
        v_has_reference := true;
        exit;
      end if;
    end loop;
    if v_has_reference then continue; end if;

    insert into public.pending_profile_cleanup_audit(
      deleted_user_id, pending_spotify_id, reviewed_by
    ) values (v_profile.id, v_profile.spotify_id, null);
    delete from auth.users where id = v_profile.id;
    if found then v_deleted := v_deleted + 1; end if;
  end loop;
  return v_deleted;
end;
$$;

revoke all on function private.cleanup_abandoned_pending_profiles(interval) from public, anon, authenticated;
grant execute on function private.cleanup_abandoned_pending_profiles(interval) to service_role;

select cron.schedule(
  'analytify-abandoned-pending-profile-cleanup',
  '17 * * * *',
  $cron$select private.cleanup_abandoned_pending_profiles();$cron$
)
where not exists (
  select 1 from cron.job where jobname = 'analytify-abandoned-pending-profile-cleanup'
);

-- Clear already-abandoned rows during deployment using the same fail-closed
-- rules. Fresh callbacks and every profile with linked data remain untouched.
select private.cleanup_abandoned_pending_profiles();
