-- Service-role-only audit trail for resumable Spotify credential key rotation.
create table if not exists public.spotify_credential_rotation_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  from_key_version integer not null check (from_key_version > 0),
  to_key_version integer not null check (to_key_version > 0),
  status text not null check (status in ('succeeded', 'failed')),
  error_message text,
  completed_at timestamptz not null default now()
);

create index if not exists spotify_credential_rotation_audit_user_completed_idx
  on public.spotify_credential_rotation_audit(user_id, completed_at desc);

alter table public.spotify_credential_rotation_audit enable row level security;
revoke all on public.spotify_credential_rotation_audit from anon, authenticated;
grant all on public.spotify_credential_rotation_audit to service_role;
