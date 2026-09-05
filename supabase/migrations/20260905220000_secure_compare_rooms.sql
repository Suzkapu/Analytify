create table public.compare_rooms (
  room_id text primary key check (room_id ~ '^[A-Za-z0-9_-]{16,80}$'),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  host_participant_id text not null check (host_participant_id ~ '^[A-Za-z0-9_-]{12,80}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  closed_at timestamptz
);

create table public.compare_room_members (
  room_id text not null references public.compare_rooms(room_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  participant_id text not null check (participant_id ~ '^[A-Za-z0-9_-]{12,80}$'),
  role text not null check (role in ('host', 'guest')),
  active boolean not null default true,
  allowed_through_sequence integer,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, participant_id)
);

create table public.compare_room_invitations (
  invitation_id text not null check (invitation_id ~ '^[A-Za-z0-9_-]{8,80}$'),
  room_id text not null references public.compare_rooms(room_id) on delete cascade,
  secret_hash text not null check (length(secret_hash) = 64),
  claimed_by uuid references auth.users(id) on delete set null,
  participant_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  revoked_at timestamptz,
  primary key (room_id, invitation_id)
);

create table public.compare_room_proposals (
  room_id text not null references public.compare_rooms(room_id) on delete cascade,
  proposal_id text not null check (proposal_id ~ '^[A-Za-z0-9_-]{8,80}$'),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  track_count integer not null check (track_count between 1 and 5000),
  received_track_count integer not null default 0 check (received_track_count between 0 and 5000),
  received_chunk_count integer not null default 0 check (received_chunk_count between 0 and 50),
  status text not null default 'proposed' check (status in ('proposed', 'cancelled', 'executing', 'committed')),
  created_at timestamptz not null default now(),
  primary key (room_id, proposal_id)
);

create table public.compare_room_approvals (
  room_id text not null,
  proposal_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  approved_at timestamptz not null default now(),
  primary key (room_id, proposal_id, user_id),
  foreign key (room_id, proposal_id) references public.compare_room_proposals(room_id, proposal_id) on delete cascade
);

create table public.compare_room_uploads (
  room_id text not null references public.compare_rooms(room_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  track_count integer not null default 0 check (track_count between 0 and 5000),
  chunk_count integer not null default 0 check (chunk_count between 0 and 50),
  primary key (room_id, user_id)
);

create table public.compare_room_messages (
  id bigint generated always as identity primary key,
  room_id text not null references public.compare_rooms(room_id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_participant_id text not null,
  sender_role text not null check (sender_role in ('host', 'guest')),
  sequence integer not null check (sequence > 0),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (room_id, sequence)
);
create index compare_room_messages_room_id_id_idx on public.compare_room_messages(room_id, id);

alter table public.compare_rooms enable row level security;
alter table public.compare_room_members enable row level security;
alter table public.compare_room_invitations enable row level security;
alter table public.compare_room_proposals enable row level security;
alter table public.compare_room_approvals enable row level security;
alter table public.compare_room_uploads enable row level security;
alter table public.compare_room_messages enable row level security;

revoke all on public.compare_rooms, public.compare_room_members, public.compare_room_invitations,
  public.compare_room_proposals, public.compare_room_approvals, public.compare_room_uploads,
  public.compare_room_messages from public, anon, authenticated;
grant select on public.compare_room_messages to authenticated;

create or replace function private.can_read_compare_room_message(p_room_id text, p_sequence integer)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.compare_room_members member
    where member.room_id = p_room_id and member.user_id = auth.uid()
      and (member.active or p_sequence <= member.allowed_through_sequence)
  );
$$;
revoke all on function private.can_read_compare_room_message(text, integer) from public, anon;
grant execute on function private.can_read_compare_room_message(text, integer) to authenticated;

create or replace function private.is_active_compare_room_member(p_room_id text)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.compare_room_members member
    join public.compare_rooms room on room.room_id = member.room_id
    where member.room_id = p_room_id and member.user_id = auth.uid() and member.active
      and room.closed_at is null and room.expires_at > now()
  );
$$;
revoke all on function private.is_active_compare_room_member(text) from public, anon;
grant execute on function private.is_active_compare_room_member(text) to authenticated;

create policy compare_room_messages_member_read on public.compare_room_messages
for select to authenticated using (
  private.can_read_compare_room_message(compare_room_messages.room_id, compare_room_messages.sequence)
);

drop policy if exists compare_room_authenticated_receive on realtime.messages;
create policy compare_room_authenticated_receive on realtime.messages
for select to authenticated using (
  realtime.topic() like 'compare-room:%'
  and private.is_active_compare_room_member(substring(realtime.topic() from 14))
);

create or replace function public.create_compare_room(p_room_id text, p_host_participant_id text)
returns void language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_room_id !~ '^[A-Za-z0-9_-]{16,80}$' or p_host_participant_id !~ '^[A-Za-z0-9_-]{12,80}$' then
    raise exception 'The Compare Room identity is invalid.';
  end if;
  insert into public.compare_rooms(room_id, host_user_id, host_participant_id)
  values (p_room_id, v_user_id, p_host_participant_id);
  insert into public.compare_room_members(room_id, user_id, participant_id, role)
  values (p_room_id, v_user_id, p_host_participant_id, 'host');
end;
$$;

create or replace function public.create_compare_room_invitation(
  p_room_id text, p_invitation_id text, p_invitation_secret text
) returns void language plpgsql security definer set search_path = public, extensions, pg_catalog
as $$
begin
  if length(coalesce(p_invitation_secret, '')) < 24 or p_invitation_id !~ '^[A-Za-z0-9_-]{8,80}$' then
    raise exception 'The invitation is invalid.';
  end if;
  perform 1 from public.compare_rooms room
  where room.room_id = p_room_id and room.host_user_id = auth.uid()
    and room.closed_at is null and room.expires_at > now() for update;
  if not found then raise exception 'Only the active room host can create invitations.'; end if;
  insert into public.compare_room_invitations(invitation_id, room_id, secret_hash)
  values (p_invitation_id, p_room_id,
    encode(digest(convert_to(p_invitation_secret, 'UTF8'), 'sha256'), 'hex'));
end;
$$;

create or replace function public.claim_compare_room_invitation(
  p_room_id text, p_invitation_id text, p_invitation_secret text, p_participant_id text
) returns void language plpgsql security definer set search_path = public, extensions, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_invitation public.compare_room_invitations%rowtype;
  v_sequence integer;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_participant_id !~ '^[A-Za-z0-9_-]{12,80}$' then raise exception 'The participant identity is invalid.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_room_id, 0));
  select invitation.* into v_invitation from public.compare_room_invitations invitation
  join public.compare_rooms room on room.room_id = invitation.room_id
  where invitation.room_id = p_room_id and invitation.invitation_id = p_invitation_id
    and invitation.secret_hash = encode(digest(convert_to(coalesce(p_invitation_secret, ''), 'UTF8'), 'sha256'), 'hex')
    and invitation.claimed_by is null and invitation.revoked_at is null
    and invitation.expires_at > now() and room.closed_at is null and room.expires_at > now()
  for update of invitation;
  if not found then raise exception 'This Compare Room invitation is invalid, expired, used, or revoked.'; end if;
  if exists (select 1 from public.compare_room_members where room_id = p_room_id and user_id = v_user_id) then
    raise exception 'This authenticated identity has already joined the room.';
  end if;
  update public.compare_room_invitations set claimed_by = v_user_id, participant_id = p_participant_id
  where room_id = p_room_id and invitation_id = p_invitation_id;
  insert into public.compare_room_members(room_id, user_id, participant_id, role)
  values (p_room_id, v_user_id, p_participant_id, 'guest');
  select coalesce(max(message.sequence), 0) + 1 into v_sequence
  from public.compare_room_messages message where message.room_id = p_room_id;
  insert into public.compare_room_messages(
    room_id, sender_user_id, sender_participant_id, sender_role, sequence, payload
  ) values (
    p_room_id, v_user_id, p_participant_id, 'guest', v_sequence,
    jsonb_build_object('type', 'invitation-claimed', 'invitationId', p_invitation_id, 'participantId', p_participant_id)
  );
end;
$$;

create or replace function public.revoke_compare_room_invitation(p_room_id text, p_invitation_id text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  update public.compare_room_invitations invitation set revoked_at = now()
  from public.compare_rooms room
  where invitation.room_id = p_room_id and invitation.invitation_id = p_invitation_id
    and room.room_id = invitation.room_id and room.host_user_id = auth.uid()
    and invitation.revoked_at is null;
  if not found then raise exception 'Only the room host can revoke this invitation.'; end if;
end;
$$;

create or replace function public.send_compare_room_message(p_room_id text, p_message jsonb)
returns bigint language plpgsql security definer set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_member public.compare_room_members%rowtype;
  v_type text := p_message->>'type';
  v_sequence integer;
  v_message_id bigint;
  v_count integer;
  v_proposal_id text;
  v_hash text;
  v_track_count integer;
begin
  if v_user_id is null then raise exception 'Authentication is required.'; end if;
  if p_message is null or jsonb_typeof(p_message) <> 'object' or octet_length(p_message::text) > 131072 then
    raise exception 'The Compare Room message is invalid or too large.';
  end if;
  if v_type is null then raise exception 'The Compare Room message type is required.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_room_id, 0));
  select member.* into v_member from public.compare_room_members member
  join public.compare_rooms room on room.room_id = member.room_id
  where member.room_id = p_room_id and member.user_id = v_user_id and member.active
    and room.closed_at is null and room.expires_at > now() for update of member;
  if not found then raise exception 'You are not an active member of this Compare Room.'; end if;

  if v_member.role = 'host' and v_type not in (
    'remove-participant', 'merge-proposal', 'merge-proposal-cancelled',
    'create-playlist-start', 'create-playlist-track-chunk', 'create-playlist-commit'
  ) then raise exception 'The host cannot send this message type.';
  elsif v_member.role = 'guest' and v_type not in (
    'participant-state', 'participant-track-chunk', 'participant-tracks-complete',
    'proposal-approval', 'save-result'
  ) then raise exception 'A guest cannot send this message type.';
  end if;

  if v_type in ('participant-track-chunk', 'proposal-approval', 'save-result')
    and p_message->>'participantId' is distinct from v_member.participant_id then
    raise exception 'Participant impersonation was rejected.';
  end if;
  if v_type in ('participant-state', 'participant-tracks-complete')
    and p_message#>>'{participant,id}' is distinct from v_member.participant_id then
    raise exception 'Participant impersonation was rejected.';
  end if;

  if v_type = 'participant-state' then
    if jsonb_typeof(p_message#>'{participant,tracks}') <> 'array'
      or jsonb_array_length(p_message#>'{participant,tracks}') <> 0 then
      raise exception 'Participant state must use bounded track chunks.';
    end if;
    delete from public.compare_room_uploads where room_id = p_room_id and user_id = v_user_id;
    insert into public.compare_room_uploads(room_id, user_id) values (p_room_id, v_user_id);
  elsif v_type = 'participant-track-chunk' then
    if jsonb_typeof(p_message->'tracks') <> 'array' then raise exception 'Track chunks must be arrays.'; end if;
    v_count := jsonb_array_length(p_message->'tracks');
    if v_count not between 1 and 100 then raise exception 'Track chunks are limited to 100 tracks.'; end if;
    update public.compare_room_uploads set track_count = track_count + v_count, chunk_count = chunk_count + 1
    where room_id = p_room_id and user_id = v_user_id
      and track_count + v_count <= 5000 and chunk_count < 50;
    if not found then raise exception 'Participant upload limits were exceeded.'; end if;
  elsif v_type = 'participant-tracks-complete' then
    v_track_count := (p_message->>'total')::integer;
    if jsonb_typeof(p_message#>'{participant,tracks}') <> 'array'
      or jsonb_array_length(p_message#>'{participant,tracks}') <> 0
      or v_track_count not between 0 and 5000 or not exists (
      select 1 from public.compare_room_uploads where room_id = p_room_id and user_id = v_user_id
        and track_count = v_track_count
    ) then raise exception 'The participant upload is incomplete or exceeds its limit.'; end if;
  elsif v_type = 'merge-proposal' then
    v_proposal_id := p_message#>>'{proposal,id}';
    v_hash := p_message#>>'{proposal,contentHash}';
    v_track_count := (p_message#>>'{proposal,trackCount}')::integer;
    if v_proposal_id !~ '^[A-Za-z0-9_-]{8,80}$' or v_hash !~ '^[0-9a-f]{64}$'
      or v_track_count not between 1 and 5000
      or jsonb_typeof(p_message#>'{proposal,tracks}') <> 'array'
      or jsonb_array_length(p_message#>'{proposal,tracks}') <> 0 then
      raise exception 'The playlist proposal is invalid.';
    end if;
    update public.compare_room_proposals set status = 'cancelled'
    where room_id = p_room_id and status = 'proposed';
    insert into public.compare_room_proposals(room_id, proposal_id, content_hash, track_count)
    values (p_room_id, v_proposal_id, v_hash, v_track_count);
  elsif v_type = 'merge-proposal-cancelled' then
    update public.compare_room_proposals set status = 'cancelled'
    where room_id = p_room_id and status = 'proposed';
  elsif v_type = 'proposal-approval' then
    v_proposal_id := p_message->>'proposalId';
    v_hash := p_message->>'contentHash';
    if not exists (select 1 from public.compare_room_proposals proposal
      where proposal.room_id = p_room_id and proposal.proposal_id = v_proposal_id
        and proposal.content_hash = v_hash and proposal.status = 'proposed') then
      raise exception 'The approval does not match the active proposal.';
    end if;
    insert into public.compare_room_approvals(room_id, proposal_id, user_id, content_hash)
    values (p_room_id, v_proposal_id, v_user_id, v_hash);
  elsif v_type = 'create-playlist-start' then
    v_proposal_id := p_message#>>'{proposal,id}';
    v_hash := p_message#>>'{proposal,contentHash}';
    v_track_count := (p_message#>>'{proposal,trackCount}')::integer;
    if jsonb_typeof(p_message#>'{proposal,tracks}') <> 'array'
      or jsonb_array_length(p_message#>'{proposal,tracks}') <> 0 then
      raise exception 'Playlist creation must use bounded track chunks.';
    end if;
    if exists (select 1 from public.compare_room_members member
      where member.room_id = p_room_id and member.role = 'guest' and member.active
        and not exists (select 1 from public.compare_room_approvals approval
          where approval.room_id = p_room_id and approval.proposal_id = v_proposal_id
            and approval.user_id = member.user_id and approval.content_hash = v_hash)) then
      raise exception 'Every participant must approve this exact proposal.';
    end if;
    update public.compare_room_proposals set status = 'executing', received_track_count = 0, received_chunk_count = 0
    where room_id = p_room_id and proposal_id = v_proposal_id and content_hash = v_hash
      and track_count = v_track_count and status = 'proposed';
    if not found then raise exception 'The proposal is stale or has already executed.'; end if;
  elsif v_type = 'create-playlist-track-chunk' then
    v_proposal_id := p_message->>'proposalId';
    if jsonb_typeof(p_message->'tracks') <> 'array' then raise exception 'Track chunks must be arrays.'; end if;
    v_count := jsonb_array_length(p_message->'tracks');
    if v_count not between 1 and 100 then raise exception 'Track chunks are limited to 100 tracks.'; end if;
    update public.compare_room_proposals
    set received_track_count = received_track_count + v_count, received_chunk_count = received_chunk_count + 1
    where room_id = p_room_id and proposal_id = v_proposal_id and status = 'executing'
      and received_track_count + v_count <= track_count and received_chunk_count < 50;
    if not found then raise exception 'Proposal chunk limits were exceeded.'; end if;
  elsif v_type = 'create-playlist-commit' then
    v_proposal_id := p_message->>'proposalId';
    update public.compare_room_proposals set status = 'committed'
    where room_id = p_room_id and proposal_id = v_proposal_id and status = 'executing'
      and received_track_count = track_count;
    if not found then raise exception 'The proposal is incomplete or has already been committed.'; end if;
  elsif v_type = 'remove-participant' then
    if not exists (select 1 from public.compare_room_members where room_id = p_room_id
      and participant_id = p_message->>'participantId' and role = 'guest' and active) then
      raise exception 'The selected guest is not active.';
    end if;
  end if;

  select coalesce(max(message.sequence), 0) + 1 into v_sequence
  from public.compare_room_messages message where message.room_id = p_room_id;
  insert into public.compare_room_messages(
    room_id, sender_user_id, sender_participant_id, sender_role, sequence, payload
  ) values (p_room_id, v_user_id, v_member.participant_id, v_member.role, v_sequence, p_message)
  returning id into v_message_id;

  if v_type = 'remove-participant' then
    update public.compare_room_members set active = false, allowed_through_sequence = v_sequence
    where room_id = p_room_id and participant_id = p_message->>'participantId' and role = 'guest';
  end if;
  return v_message_id;
end;
$$;

create or replace function public.close_compare_room(p_room_id text)
returns void language plpgsql security definer set search_path = public, pg_catalog
as $$
declare v_room public.compare_rooms%rowtype; v_sequence integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_room_id, 0));
  select * into v_room from public.compare_rooms
  where room_id = p_room_id and host_user_id = auth.uid() and closed_at is null for update;
  if not found then raise exception 'Only the active room host can close it.'; end if;
  select coalesce(max(message.sequence), 0) + 1 into v_sequence
  from public.compare_room_messages message where message.room_id = p_room_id;
  insert into public.compare_room_messages(
    room_id, sender_user_id, sender_participant_id, sender_role, sequence, payload
  ) values (p_room_id, auth.uid(), v_room.host_participant_id, 'host', v_sequence,
    jsonb_build_object('type', 'room-closed'));
  update public.compare_rooms set closed_at = now() where room_id = p_room_id;
end;
$$;

revoke all on function public.create_compare_room(text, text) from public, anon;
revoke all on function public.create_compare_room_invitation(text, text, text) from public, anon;
revoke all on function public.claim_compare_room_invitation(text, text, text, text) from public, anon;
revoke all on function public.revoke_compare_room_invitation(text, text) from public, anon;
revoke all on function public.send_compare_room_message(text, jsonb) from public, anon;
revoke all on function public.close_compare_room(text) from public, anon;
grant execute on function public.create_compare_room(text, text) to authenticated;
grant execute on function public.create_compare_room_invitation(text, text, text) to authenticated;
grant execute on function public.claim_compare_room_invitation(text, text, text, text) to authenticated;
grant execute on function public.revoke_compare_room_invitation(text, text) to authenticated;
grant execute on function public.send_compare_room_message(text, jsonb) to authenticated;
grant execute on function public.close_compare_room(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'compare_room_messages') then
    alter publication supabase_realtime add table public.compare_room_messages;
  end if;
end;
$$;

notify pgrst, 'reload schema';
