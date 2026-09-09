alter table public.compare_room_members
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists left_at timestamptz;

create index if not exists compare_room_members_presence_idx
  on public.compare_room_members(room_id, last_seen_at)
  where active;

create or replace function private.cleanup_compare_room_departure()
returns trigger language plpgsql security definer set search_path = public, pg_catalog
as $$
begin
  if old.active and not new.active then
    update public.compare_room_invitations
    set revoked_at = coalesce(revoked_at, now())
    where room_id = new.room_id and claimed_by = new.user_id;
    update public.compare_room_proposals
    set status = 'cancelled'
    where room_id = new.room_id and status in ('proposed', 'executing');
  end if;
  return new;
end;
$$;
revoke all on function private.cleanup_compare_room_departure() from public, anon, authenticated;

drop trigger if exists cleanup_compare_room_departure on public.compare_room_members;
create trigger cleanup_compare_room_departure
after update of active on public.compare_room_members
for each row execute function private.cleanup_compare_room_departure();

create or replace function public.touch_compare_room_presence(p_room_id text)
returns void language plpgsql security definer set search_path = public, pg_catalog
as $$
begin
  update public.compare_room_members member
  set last_seen_at = now()
  from public.compare_rooms room
  where member.room_id = p_room_id and member.user_id = auth.uid() and member.active
    and room.room_id = member.room_id and room.closed_at is null and room.expires_at > now();
  if not found then raise exception 'You are not an active member of this Compare Room.'; end if;
end;
$$;

create or replace function public.leave_compare_room(p_room_id text)
returns void language plpgsql security definer set search_path = public, pg_catalog
as $$
declare
  v_member public.compare_room_members%rowtype;
  v_sequence integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_room_id, 0));
  select member.* into v_member
  from public.compare_room_members member
  join public.compare_rooms room on room.room_id = member.room_id
  where member.room_id = p_room_id and member.user_id = auth.uid() and member.role = 'guest'
    and member.active and room.closed_at is null and room.expires_at > now()
  for update of member;
  if not found then return; end if;

  select coalesce(max(message.sequence), 0) + 1 into v_sequence
  from public.compare_room_messages message where message.room_id = p_room_id;
  insert into public.compare_room_messages(
    room_id, sender_user_id, sender_participant_id, sender_role, sequence, payload
  ) values (
    p_room_id, v_member.user_id, v_member.participant_id, 'guest', v_sequence,
    jsonb_build_object('type', 'participant-left', 'participantId', v_member.participant_id, 'reason', 'left')
  );
  update public.compare_room_members
  set active = false, left_at = now(), allowed_through_sequence = v_sequence
  where room_id = p_room_id and user_id = v_member.user_id and active;
end;
$$;

create or replace function public.reconcile_compare_room_participants(p_room_id text)
returns table(participant_id text)
language plpgsql security definer set search_path = public, pg_catalog
as $$
declare
  v_room public.compare_rooms%rowtype;
  v_member public.compare_room_members%rowtype;
  v_sequence integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_room_id, 0));
  select room.* into v_room from public.compare_rooms room
  where room.room_id = p_room_id and room.host_user_id = auth.uid()
    and room.closed_at is null and room.expires_at > now()
  for update;
  if not found then raise exception 'Only the active room host can reconcile participants.'; end if;

  for v_member in
    select member.* from public.compare_room_members member
    where member.room_id = p_room_id and member.role = 'guest' and member.active
      and member.last_seen_at < now() - interval '90 seconds'
    order by member.joined_at
    for update
  loop
    select coalesce(max(message.sequence), 0) + 1 into v_sequence
    from public.compare_room_messages message where message.room_id = p_room_id;
    insert into public.compare_room_messages(
      room_id, sender_user_id, sender_participant_id, sender_role, sequence, payload
    ) values (
      p_room_id, v_room.host_user_id, v_room.host_participant_id, 'host', v_sequence,
      jsonb_build_object('type', 'participant-left', 'participantId', v_member.participant_id,
        'reason', 'disconnected')
    );
    update public.compare_room_members
    set active = false, left_at = now(), allowed_through_sequence = v_sequence
    where room_id = p_room_id and user_id = v_member.user_id and active;
    participant_id := v_member.participant_id;
    return next;
  end loop;
end;
$$;

revoke all on function public.touch_compare_room_presence(text) from public, anon;
revoke all on function public.leave_compare_room(text) from public, anon;
revoke all on function public.reconcile_compare_room_participants(text) from public, anon;
grant execute on function public.touch_compare_room_presence(text) to authenticated;
grant execute on function public.leave_compare_room(text) to authenticated;
grant execute on function public.reconcile_compare_room_participants(text) to authenticated;

notify pgrst, 'reload schema';
