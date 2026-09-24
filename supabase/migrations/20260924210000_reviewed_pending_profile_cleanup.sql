-- Incomplete registrations are never deleted merely because their display
-- name is generic. Review must prove the row is pending and owns no data.
create table if not exists public.pending_profile_cleanup_audit (
  id bigint generated always as identity primary key,
  deleted_user_id uuid not null,
  pending_spotify_id text not null,
  reviewed_by uuid,
  deleted_at timestamptz not null default now()
);
alter table public.pending_profile_cleanup_audit enable row level security;
revoke all on public.pending_profile_cleanup_audit from public, anon, authenticated;

create or replace function public.admin_review_pending_spotify_profile(p_user_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, private, pg_catalog
as $$
declare
  v_profile public.users%rowtype;
  v_reference record;
  v_count bigint;
  v_blockers jsonb := '[]'::jsonb;
begin
  if not private.is_app_admin(auth.uid()) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  select * into v_profile from public.users where id = p_user_id;
  if not found then raise exception 'The profile no longer exists.' using errcode = 'P0002'; end if;

  if v_profile.spotify_id not like 'pending:%' then
    v_blockers := v_blockers || jsonb_build_array('The profile has completed Spotify registration.');
  end if;
  if v_profile.verified_spotify_id is not null then
    v_blockers := v_blockers || jsonb_build_array('The profile has a verified Spotify identity.');
  end if;
  if v_profile.backup_active or v_profile.spotify_refresh_token is not null then
    v_blockers := v_blockers || jsonb_build_array('The profile has cloud backup data or credentials.');
  end if;
  if v_profile.created_at > now() - interval '15 minutes' then
    v_blockers := v_blockers || jsonb_build_array('The registration is still recent and may be in progress.');
  end if;

  for v_reference in
    select ns.nspname as schema_name, cls.relname as table_name, att.attname as column_name
    from pg_constraint con
    join pg_class cls on cls.oid = con.conrelid
    join pg_namespace ns on ns.oid = cls.relnamespace
    join unnest(con.conkey) with ordinality key(attnum, ord) on true
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key.attnum
    where con.contype = 'f' and con.confrelid = 'public.users'::regclass
      and ns.nspname = 'public' and cls.relname <> 'sync_user_settings'
    order by cls.relname, att.attname
  loop
    execute format('select count(*) from %I.%I where %I = $1',
      v_reference.schema_name, v_reference.table_name, v_reference.column_name)
      into v_count using p_user_id;
    if v_count > 0 then
      v_blockers := v_blockers || jsonb_build_array(format(
        '%s contains %s linked record%s.', v_reference.table_name, v_count,
        case when v_count = 1 then '' else 's' end));
    end if;
  end loop;

  return jsonb_build_object('eligible', jsonb_array_length(v_blockers) = 0,
    'spotifyId', v_profile.spotify_id, 'createdAt', v_profile.created_at, 'blockers', v_blockers);
end;
$$;

create or replace function public.admin_delete_reviewed_pending_spotify_profile(
  p_user_id uuid, p_expected_spotify_id text
) returns void language plpgsql security definer
set search_path = public, private, auth, pg_catalog
as $$
declare v_review jsonb; v_spotify_id text;
begin
  if not private.is_app_admin(auth.uid()) then
    raise exception 'Administrator access is required.' using errcode = '42501';
  end if;
  select spotify_id into v_spotify_id from public.users where id = p_user_id for update;
  if not found then raise exception 'The profile no longer exists.' using errcode = 'P0002'; end if;
  if v_spotify_id is distinct from p_expected_spotify_id then
    raise exception 'The profile identity changed after review.' using errcode = '40001';
  end if;
  v_review := public.admin_review_pending_spotify_profile(p_user_id);
  if not coalesce((v_review->>'eligible')::boolean, false) then
    raise exception 'The pending profile is not safe to delete: %', v_review->'blockers'
      using errcode = '23514';
  end if;
  insert into public.pending_profile_cleanup_audit(deleted_user_id, pending_spotify_id, reviewed_by)
    values (p_user_id, v_spotify_id, auth.uid());
  delete from auth.users where id = p_user_id;
  if not found then raise exception 'The authentication identity no longer exists.' using errcode = 'P0002'; end if;
end;
$$;

revoke all on function public.admin_review_pending_spotify_profile(uuid) from public, anon;
revoke all on function public.admin_delete_reviewed_pending_spotify_profile(uuid, text) from public, anon;
grant execute on function public.admin_review_pending_spotify_profile(uuid) to authenticated;
grant execute on function public.admin_delete_reviewed_pending_spotify_profile(uuid, text) to authenticated;

create or replace function private.cleanup_pending_profile_cleanup_audit()
returns integer language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_deleted integer;
begin
  delete from public.pending_profile_cleanup_audit where deleted_at < now() - interval '180 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
revoke all on function private.cleanup_pending_profile_cleanup_audit() from public, anon, authenticated;
grant execute on function private.cleanup_pending_profile_cleanup_audit() to service_role;
select cron.schedule('analytify-pending-profile-cleanup-audit-retention', '57 3 * * *',
  $cron$select private.cleanup_pending_profile_cleanup_audit();$cron$)
where not exists (select 1 from cron.job where jobname = 'analytify-pending-profile-cleanup-audit-retention');
