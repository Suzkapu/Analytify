-- A Spotify account may be reached through the hosted OAuth client or a
-- browser-bound personal PKCE client. Keep the currently authenticated
-- profile as the canonical row so its RLS ownership remains usable, while
-- moving an older independently verified profile into it atomically.
create table if not exists public.spotify_identity_merge_audit (
  id bigint generated always as identity primary key,
  verified_spotify_id text not null,
  source_user_id uuid not null,
  target_user_id uuid not null,
  moved_references integer not null,
  merged_at timestamptz not null default now()
);

alter table public.spotify_identity_merge_audit enable row level security;
revoke all on public.spotify_identity_merge_audit from public, anon, authenticated;
grant select, insert on public.spotify_identity_merge_audit to service_role;
grant usage, select on sequence public.spotify_identity_merge_audit_id_seq to service_role;

create or replace function public.merge_verified_spotify_profile(
  p_target_user_id uuid,
  p_verified_spotify_id text
) returns table(merged boolean, source_user_id uuid, moved_references integer)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_target public.users%rowtype;
  v_source public.users%rowtype;
  v_candidate_count integer;
  v_reference record;
  v_changed integer;
  v_moved integer := 0;
  v_verified_id text := nullif(trim(p_verified_spotify_id), '');
begin
  if auth.role() <> 'service_role' then
    raise exception 'Only the trusted credential service may merge identities.' using errcode = '42501';
  end if;
  if v_verified_id is null or length(v_verified_id) > 255 then
    raise exception 'A verified Spotify identity is required.' using errcode = '22023';
  end if;

  -- Serializes hosted→personal, personal→hosted, and concurrent callbacks for
  -- the same external account without locking unrelated registrations.
  perform pg_advisory_xact_lock(hashtextextended('spotify-identity:' || v_verified_id, 0));

  select * into v_target from public.users where id = p_target_user_id for update;
  if not found then raise exception 'The target profile does not exist.' using errcode = 'P0002'; end if;
  if v_target.verified_spotify_id is not null and v_target.verified_spotify_id <> v_verified_id then
    raise exception 'The target profile is verified for another Spotify account.' using errcode = '23514';
  end if;

  select count(*), min(id) into v_candidate_count, source_user_id
  from public.users
  where verified_spotify_id = v_verified_id and id <> p_target_user_id;

  if v_candidate_count = 0 then
    update public.users set verified_spotify_id = v_verified_id where id = p_target_user_id;
    return query select false, null::uuid, 0;
    return;
  end if;
  if v_candidate_count <> 1 then
    raise exception 'Multiple profiles claim this verified Spotify account; reviewed cleanup is required.'
      using errcode = '21000';
  end if;

  select * into v_source from public.users where id = source_user_id for update;
  if v_source.verified_spotify_id is distinct from v_verified_id then
    raise exception 'The source profile is no longer verified for this Spotify account.' using errcode = '40001';
  end if;

  -- Every newly-created profile receives a default schedule row. It contains
  -- no user decision yet, so discard only that placeholder before moving the
  -- established profile's schedule. Two established schedules remain an
  -- intentional collision and therefore abort the merge below.
  if v_target.verified_spotify_id is null then
    delete from public.sync_user_settings where user_id = p_target_user_id;
  end if;

  -- PostgreSQL rolls the whole function back if any unique/check constraint
  -- reveals an ambiguous collision. No partial merge or guessed winner is
  -- permitted. New user-owned tables are covered automatically by their FK.
  for v_reference in
    select ns.nspname as schema_name, cls.relname as table_name, att.attname as column_name
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    join unnest(con.conkey) with ordinality key(attnum, ord) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key.attnum
    where con.contype = 'f'
      and con.confrelid = 'public.users'::regclass
      and ns.nspname = 'public'
    order by cls.relname, att.attname
  loop
    execute format('update %I.%I set %I = $1 where %I = $2',
      v_reference.schema_name, v_reference.table_name,
      v_reference.column_name, v_reference.column_name)
      using p_target_user_id, source_user_id;
    get diagnostics v_changed = row_count;
    v_moved := v_moved + v_changed;
  end loop;

  update public.users
  set verified_spotify_id = v_verified_id,
      display_name = case
        when nullif(trim(display_name), '') is null or display_name = 'Spotify User'
          then v_source.display_name else display_name end,
      profile_pic_url = coalesce(nullif(profile_pic_url, ''), v_source.profile_pic_url),
      backup_active = backup_active or v_source.backup_active,
      last_synced_at = greatest(last_synced_at, v_source.last_synced_at),
      spotify_refresh_token = coalesce(spotify_refresh_token, v_source.spotify_refresh_token)
  where id = p_target_user_id;

  delete from public.users where id = source_user_id;
  insert into public.spotify_identity_merge_audit(
    verified_spotify_id, source_user_id, target_user_id, moved_references
  ) values (v_verified_id, source_user_id, p_target_user_id, v_moved);

  return query select true, source_user_id, v_moved;
end;
$$;

revoke all on function public.merge_verified_spotify_profile(uuid, text) from public, anon, authenticated;
grant execute on function public.merge_verified_spotify_profile(uuid, text) to service_role;

create or replace function private.cleanup_spotify_identity_merge_audit()
returns integer
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare v_deleted integer;
begin
  delete from public.spotify_identity_merge_audit
  where merged_at < now() - interval '180 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function private.cleanup_spotify_identity_merge_audit() from public, anon, authenticated;
grant execute on function private.cleanup_spotify_identity_merge_audit() to service_role;

select cron.schedule(
  'analytify-identity-merge-audit-retention',
  '52 3 * * *',
  $cron$select private.cleanup_spotify_identity_merge_audit();$cron$
)
where not exists (
  select 1 from cron.job where jobname = 'analytify-identity-merge-audit-retention'
);
