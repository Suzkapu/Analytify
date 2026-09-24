-- A proposal may be delivered independently to each approved participant and
-- once to everyone. Delivery state is therefore scoped to its target instead
-- of consuming the proposal globally after the first playlist is created.

create table public.compare_room_proposal_deliveries (
  room_id text not null,
  proposal_id text not null,
  target_key text not null,
  received_track_count integer not null default 0 check (received_track_count >= 0),
  status text not null default 'executing' check (status in ('executing', 'committed')),
  updated_at timestamptz not null default now(),
  primary key (room_id, proposal_id, target_key),
  foreign key (room_id, proposal_id)
    references public.compare_room_proposals(room_id, proposal_id) on delete cascade
);

alter table public.compare_room_proposal_deliveries enable row level security;
revoke all on public.compare_room_proposal_deliveries from public, anon, authenticated;

create or replace function public.send_compare_room_creation_message(p_room_id text, p_message jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_room public.compare_rooms%rowtype;
  v_type text := p_message->>'type';
  v_target text := nullif(p_message->>'targetParticipantId', '');
  v_target_key text := coalesce(nullif(p_message->>'targetParticipantId', ''), 'all');
  v_proposal_id text;
  v_hash text;
  v_track_count integer;
  v_count integer;
  v_sequence integer;
  v_message_id bigint;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_message is null or jsonb_typeof(p_message) <> 'object' or octet_length(p_message::text) > 131072 then
    raise exception 'The Compare Room message is invalid or too large.';
  end if;
  if v_type not in ('create-playlist-start', 'create-playlist-track-chunk', 'create-playlist-commit') then
    raise exception 'Only playlist-creation messages are accepted.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_room_id, 0));
  select room.* into v_room from public.compare_rooms room
  where room.room_id = p_room_id and room.host_user_id = v_user_id
    and room.closed_at is null and room.expires_at > now() for update;
  if not found then raise exception 'Only the active room host can create participant playlists.'; end if;

  if v_type = 'create-playlist-start' then
    v_proposal_id := p_message#>>'{proposal,id}';
    v_hash := p_message#>>'{proposal,contentHash}';
    v_track_count := (p_message#>>'{proposal,trackCount}')::integer;
    if jsonb_typeof(p_message#>'{proposal,tracks}') <> 'array'
      or jsonb_array_length(p_message#>'{proposal,tracks}') <> 0
      or not exists (select 1 from public.compare_room_proposals proposal
        where proposal.room_id = p_room_id and proposal.proposal_id = v_proposal_id
          and proposal.content_hash = v_hash and proposal.track_count = v_track_count
          and proposal.status = 'proposed') then
      raise exception 'The active playlist proposal does not match this creation request.';
    end if;
    if v_target is null then
      if exists (select 1 from public.compare_room_members member
        where member.room_id = p_room_id and member.role = 'guest' and member.active
          and not exists (select 1 from public.compare_room_approvals approval
            where approval.room_id = p_room_id and approval.proposal_id = v_proposal_id
              and approval.user_id = member.user_id and approval.content_hash = v_hash)) then
        raise exception 'Every participant must approve this exact proposal.';
      end if;
    elsif not exists (select 1 from public.compare_room_members member
      join public.compare_room_approvals approval
        on approval.room_id = member.room_id and approval.user_id = member.user_id
      where member.room_id = p_room_id and member.participant_id = v_target
        and member.role = 'guest' and member.active
        and approval.proposal_id = v_proposal_id and approval.content_hash = v_hash) then
      raise exception 'The selected participant has not approved this proposal.';
    end if;
    insert into public.compare_room_proposal_deliveries(
      room_id, proposal_id, target_key, received_track_count, status, updated_at
    ) values (p_room_id, v_proposal_id, v_target_key, 0, 'executing', now())
    on conflict (room_id, proposal_id, target_key) do update set
      received_track_count = 0, status = 'executing', updated_at = now();
  elsif v_type = 'create-playlist-track-chunk' then
    v_proposal_id := p_message->>'proposalId';
    if jsonb_typeof(p_message->'tracks') <> 'array' then raise exception 'Track chunks must be arrays.'; end if;
    v_count := jsonb_array_length(p_message->'tracks');
    if v_count not between 1 and 100 then raise exception 'Track chunks are limited to 100 tracks.'; end if;
    update public.compare_room_proposal_deliveries delivery
      set received_track_count = delivery.received_track_count + v_count, updated_at = now()
    from public.compare_room_proposals proposal
    where delivery.room_id = p_room_id and delivery.proposal_id = v_proposal_id
      and delivery.target_key = v_target_key and delivery.status = 'executing'
      and proposal.room_id = delivery.room_id and proposal.proposal_id = delivery.proposal_id
      and delivery.received_track_count + v_count <= proposal.track_count;
    if not found then raise exception 'The participant playlist delivery exceeded the approved proposal.'; end if;
  else
    v_proposal_id := p_message->>'proposalId';
    update public.compare_room_proposal_deliveries delivery set status = 'committed', updated_at = now()
    from public.compare_room_proposals proposal
    where delivery.room_id = p_room_id and delivery.proposal_id = v_proposal_id
      and delivery.target_key = v_target_key and delivery.status = 'executing'
      and proposal.room_id = delivery.room_id and proposal.proposal_id = delivery.proposal_id
      and delivery.received_track_count = proposal.track_count;
    if not found then raise exception 'The participant playlist delivery is incomplete.'; end if;
  end if;

  select coalesce(max(message.sequence), 0) + 1 into v_sequence
  from public.compare_room_messages message where message.room_id = p_room_id;
  insert into public.compare_room_messages(
    room_id, sender_user_id, sender_participant_id, sender_role, sequence, payload
  ) values (p_room_id, v_user_id, v_room.host_participant_id, 'host', v_sequence, p_message)
  returning id into v_message_id;
  return v_message_id;
end;
$$;

revoke all on function public.send_compare_room_creation_message(text, jsonb) from public, anon;
grant execute on function public.send_compare_room_creation_message(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
