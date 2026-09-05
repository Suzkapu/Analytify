-- Resource limits are deliberately enforced at the trusted database boundary:
-- playlists: 5,000 tracks, 2 MB total JSON, 32 KB per track, 100 active shares;
-- leagues: 20 active leagues per owner, 20 active invitations per league;
-- Compare Rooms: 5 active rooms, 10 invitations, 300 messages/minute/client.

create or replace function private.assert_playlist_share_payload(p_tracks jsonb)
returns void language plpgsql immutable security definer set search_path = pg_catalog
as $$
begin
  if p_tracks is null or jsonb_typeof(p_tracks) <> 'array' then
    raise exception 'Tracks must be a JSON array.';
  end if;
  if octet_length(p_tracks::text) > 2000000 then
    raise exception 'Shared playlist data is limited to 2 MB.';
  end if;
  if jsonb_array_length(p_tracks) > 5000 then
    raise exception 'Shared playlists are limited to 5000 tracks.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tracks) item
    where jsonb_typeof(item) <> 'object' or octet_length(item::text) > 32768
      or nullif(item->>'id', '') is null or length(item->>'id') > 128
  ) then
    raise exception 'Every shared track must be a bounded object with a valid ID.';
  end if;
end;
$$;
revoke all on function private.assert_playlist_share_payload(jsonb) from public, anon, authenticated;

alter table public.playlist_share_tracks
  add constraint playlist_share_tracks_resource_bounds
  check (position < 5000 and octet_length(track::text) <= 32768) not valid;

create index if not exists song_leagues_owner_created_idx
  on public.song_leagues(owner_user_id, created_at desc);
create index if not exists song_league_invites_creator_created_idx
  on public.song_league_invites(created_by, created_at desc);
create index if not exists compare_rooms_host_created_idx
  on public.compare_rooms(host_user_id, created_at desc);
create index if not exists compare_room_invitations_active_idx
  on public.compare_room_invitations(room_id, expires_at) where revoked_at is null;
create index if not exists compare_room_messages_sender_rate_idx
  on public.compare_room_messages(room_id, sender_user_id, created_at desc);

create or replace function private.enforce_collaboration_creation_quota()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_table_name = 'playlist_shares' then
    perform pg_advisory_xact_lock(hashtextextended('playlist-shares:' || new.owner_user_id::text, 0));
    if (select count(*) from public.playlist_shares
      where owner_user_id = new.owner_user_id and revoked_at is null) >= 100 then
      raise exception 'Each account is limited to 100 active playlist shares.';
    end if;
    if (select count(*) from public.playlist_shares
      where owner_user_id = new.owner_user_id and created_at > now() - interval '1 hour') >= 20 then
      raise exception 'Playlist share creation is limited to 20 per hour.';
    end if;
  elsif tg_table_name = 'song_leagues' then
    perform pg_advisory_xact_lock(hashtextextended('song-leagues:' || new.owner_user_id::text, 0));
    if (select count(*) from public.song_leagues
      where owner_user_id = new.owner_user_id and closed_at is null) >= 20 then
      raise exception 'Each account is limited to 20 active Song Leagues.';
    end if;
    if (select count(*) from public.song_leagues
      where owner_user_id = new.owner_user_id and created_at > now() - interval '1 day') >= 10 then
      raise exception 'Song League creation is limited to 10 per day.';
    end if;
  elsif tg_table_name = 'song_league_invites' then
    perform pg_advisory_xact_lock(hashtextextended('song-league-invites:' || new.league_id::text, 0));
    if (select count(*) from public.song_league_invites
      where league_id = new.league_id and revoked_at is null and expires_at > now()) >= 20 then
      raise exception 'Each Song League is limited to 20 active invitations.';
    end if;
    if (select count(*) from public.song_league_invites
      where created_by = new.created_by and created_at > now() - interval '1 day') >= 30 then
      raise exception 'Song League invitation creation is limited to 30 per day.';
    end if;
  elsif tg_table_name = 'compare_rooms' then
    perform pg_advisory_xact_lock(hashtextextended('compare-rooms:' || new.host_user_id::text, 0));
    if (select count(*) from public.compare_rooms
      where host_user_id = new.host_user_id and closed_at is null and expires_at > now()) >= 5 then
      raise exception 'Each account is limited to 5 active Compare Rooms.';
    end if;
    if (select count(*) from public.compare_rooms
      where host_user_id = new.host_user_id and created_at > now() - interval '1 hour') >= 20 then
      raise exception 'Compare Room creation is limited to 20 per hour.';
    end if;
  elsif tg_table_name = 'compare_room_invitations' then
    perform pg_advisory_xact_lock(hashtextextended('compare-room-invites:' || new.room_id, 0));
    if (select count(*) from public.compare_room_invitations
      where room_id = new.room_id and revoked_at is null and expires_at > now()) >= 10 then
      raise exception 'Each Compare Room is limited to 10 active invitations.';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_collaboration_creation_quota() from public, anon, authenticated;

create trigger playlist_share_creation_quota before insert on public.playlist_shares
for each row execute function private.enforce_collaboration_creation_quota();
create trigger song_league_creation_quota before insert on public.song_leagues
for each row execute function private.enforce_collaboration_creation_quota();
create trigger song_league_invitation_quota before insert on public.song_league_invites
for each row execute function private.enforce_collaboration_creation_quota();
create trigger compare_room_creation_quota before insert on public.compare_rooms
for each row execute function private.enforce_collaboration_creation_quota();
create trigger compare_room_invitation_quota before insert on public.compare_room_invitations
for each row execute function private.enforce_collaboration_creation_quota();

create or replace function private.enforce_compare_room_message_quota()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (select count(*) from public.compare_room_messages
    where room_id = new.room_id and sender_user_id = new.sender_user_id
      and created_at > now() - interval '1 minute') >= 300 then
    raise exception 'Compare Room messages are limited to 300 per minute.';
  end if;
  if (select count(*) from public.compare_room_messages where room_id = new.room_id) >= 5000 then
    raise exception 'This Compare Room has reached its 5000-message limit.';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_compare_room_message_quota() from public, anon, authenticated;
create trigger compare_room_message_quota before insert on public.compare_room_messages
for each row execute function private.enforce_compare_room_message_quota();

create or replace function private.cleanup_compare_rooms()
returns bigint language plpgsql security definer set search_path = public
as $$
declare v_deleted bigint := 0; v_batch bigint;
begin
  delete from public.song_league_invites
  where expires_at < now() - interval '30 days'
    or revoked_at < now() - interval '30 days';
  get diagnostics v_batch = row_count;
  v_deleted := v_deleted + v_batch;
  delete from public.compare_rooms
  where expires_at < now() - interval '1 day'
    or closed_at < now() - interval '1 day';
  get diagnostics v_batch = row_count;
  v_deleted := v_deleted + v_batch;
  return v_deleted;
end;
$$;
revoke all on function private.cleanup_compare_rooms() from public, anon, authenticated;
select cron.schedule(
  'analytify-compare-room-retention',
  '41 * * * *',
  $cron$select private.cleanup_compare_rooms();$cron$
)
where not exists (select 1 from cron.job where jobname = 'analytify-compare-room-retention');

create or replace function public.create_playlist_share(
  p_source_playlist_id text, p_playlist_name text, p_playlist_description text,
  p_playlist_image_url text, p_owner_display_name text, p_owner_image_url text,
  p_claim_token text, p_tracks jsonb
) returns uuid language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid(); v_share_id uuid; v_token_hash text; v_snapshot_hash text;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if nullif(trim(p_source_playlist_id), '') is null or nullif(trim(p_playlist_name), '') is null then
    raise exception 'Playlist ID and name are required.';
  end if;
  if length(coalesce(p_claim_token, '')) < 32 then raise exception 'The claim token is invalid.'; end if;
  perform private.assert_playlist_share_payload(p_tracks);
  v_token_hash := encode(digest(convert_to(p_claim_token, 'UTF8'), 'sha256'), 'hex');
  v_snapshot_hash := encode(digest(convert_to(p_tracks::text, 'UTF8'), 'sha256'), 'hex');
  insert into public.playlist_shares(
    owner_user_id, source_playlist_id, playlist_name, playlist_description, playlist_image_url,
    owner_display_name, owner_image_url, token_hash, snapshot_hash
  ) values (
    v_user_id, trim(p_source_playlist_id), left(trim(p_playlist_name), 100),
    left(coalesce(p_playlist_description, ''), 300), coalesce(p_playlist_image_url, ''),
    left(coalesce(nullif(trim(p_owner_display_name), ''), 'Spotify user'), 120),
    coalesce(p_owner_image_url, ''), v_token_hash, v_snapshot_hash
  ) returning id into v_share_id;
  perform private.insert_playlist_share_tracks(v_share_id, p_tracks);
  update public.playlist_shares set track_count = (
    select count(*)::integer from public.playlist_share_tracks where share_id = v_share_id
  ) where id = v_share_id;
  return v_share_id;
end;
$$;

create or replace function public.refresh_playlist_share(
  p_share_id uuid, p_playlist_name text, p_playlist_description text,
  p_playlist_image_url text, p_tracks jsonb
) returns bigint language plpgsql security definer set search_path = public, extensions
as $$
declare v_share public.playlist_shares%rowtype; v_snapshot_hash text; v_revision bigint;
begin
  perform private.assert_playlist_share_payload(p_tracks);
  select * into v_share from public.playlist_shares where id = p_share_id for update;
  if not found or v_share.owner_user_id <> auth.uid() or v_share.revoked_at is not null then
    raise exception 'The active share was not found or is not owned by this user.';
  end if;
  v_snapshot_hash := encode(digest(convert_to(p_tracks::text, 'UTF8'), 'sha256'), 'hex');
  v_revision := v_share.revision;
  if v_snapshot_hash <> v_share.snapshot_hash then
    delete from public.playlist_share_tracks where share_id = p_share_id;
    perform private.insert_playlist_share_tracks(p_share_id, p_tracks);
    v_revision := v_revision + 1;
  end if;
  update public.playlist_shares set playlist_name = left(trim(p_playlist_name), 100),
    playlist_description = left(coalesce(p_playlist_description, ''), 300),
    playlist_image_url = coalesce(p_playlist_image_url, playlist_image_url), snapshot_hash = v_snapshot_hash,
    track_count = (select count(*)::integer from public.playlist_share_tracks where share_id = p_share_id),
    revision = v_revision, updated_at = now() where id = p_share_id;
  return v_revision;
end;
$$;

create or replace function public.refresh_active_playlist_shares(
  p_source_playlist_id text, p_playlist_name text, p_tracks jsonb
) returns integer language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid(); v_snapshot_hash text;
  v_share_ids uuid[] := array[]::uuid[]; v_changed_share_ids uuid[] := array[]::uuid[];
  v_share_count integer := 0; v_inserted_count integer := 0; v_track_count integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if nullif(trim(p_source_playlist_id), '') is null or nullif(trim(p_playlist_name), '') is null then
    raise exception 'Playlist ID and name are required.';
  end if;
  perform private.assert_playlist_share_payload(p_tracks);
  v_snapshot_hash := encode(digest(convert_to(p_tracks::text, 'UTF8'), 'sha256'), 'hex');
  perform 1 from public.playlist_shares where owner_user_id = v_user_id
    and source_playlist_id = p_source_playlist_id and revoked_at is null for update;
  select coalesce(array_agg(id order by id), array[]::uuid[]),
    coalesce(array_agg(id order by id) filter (where snapshot_hash is distinct from v_snapshot_hash), array[]::uuid[]),
    count(*)::integer into v_share_ids, v_changed_share_ids, v_share_count
  from public.playlist_shares where owner_user_id = v_user_id
    and source_playlist_id = p_source_playlist_id and revoked_at is null;
  if v_share_count = 0 then return 0; end if;
  if cardinality(v_changed_share_ids) > 0 then
    delete from public.playlist_share_tracks where share_id = any(v_changed_share_ids);
    with source_tracks as (
      select element, element->>'id' as track_id, ordinality
      from jsonb_array_elements(p_tracks) with ordinality as item(element, ordinality)
    ), first_occurrences as (
      select distinct on (track_id) element, track_id, ordinality from source_tracks
      order by track_id, ordinality
    ), ordered_tracks as (
      select element, track_id, row_number() over (order by ordinality)::integer - 1 as position
      from first_occurrences
    )
    insert into public.playlist_share_tracks(share_id, position, track_id, track)
    select changed.share_id, track.position, track.track_id, track.element
    from unnest(v_changed_share_ids) as changed(share_id) cross join ordered_tracks track;
    get diagnostics v_inserted_count = row_count;
    v_track_count := v_inserted_count / cardinality(v_changed_share_ids);
  end if;
  update public.playlist_shares set playlist_name = left(trim(p_playlist_name), 100),
    snapshot_hash = v_snapshot_hash,
    track_count = case when id = any(v_changed_share_ids) then v_track_count else track_count end,
    revision = revision + case when id = any(v_changed_share_ids) then 1 else 0 end,
    updated_at = now() where id = any(v_share_ids);
  return v_share_count;
end;
$$;

comment on function private.assert_playlist_share_payload(jsonb) is
  'Rejects playlist snapshots above 5,000 tracks, 2 MB total, or 32 KB per track before JSON expansion.';
comment on function private.cleanup_compare_rooms() is
  'Deletes expired or closed Compare Rooms after a one-day troubleshooting window.';

notify pgrst, 'reload schema';
