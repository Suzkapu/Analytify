-- Keep recently-played pagination retryable across worker runs. The committed
-- high-water mark advances only after a backward scan reaches its prior mark.
create table if not exists public.listening_history_checkpoints (
  user_id uuid primary key references public.users(id) on delete cascade,
  high_water_mark timestamptz,
  pending_high_water_mark timestamptz,
  pending_before_cursor text,
  updated_at timestamptz not null default now(),
  constraint listening_history_checkpoint_pending_pair check (
    (pending_high_water_mark is null and pending_before_cursor is null)
    or (pending_high_water_mark is not null and pending_before_cursor is not null)
  )
);

-- Establish the migration baseline before the new worker can persist a page.
-- Runtime fallback to max(listening_history.played_at) would be unsafe: a retry
-- could mistake a partially persisted newest page for a committed checkpoint.
insert into public.listening_history_checkpoints(user_id, high_water_mark)
select history.user_id, max(history.played_at)
from public.listening_history history
group by history.user_id
on conflict (user_id) do nothing;

alter table public.listening_history_checkpoints enable row level security;

revoke all on public.listening_history_checkpoints from anon, authenticated;
grant all on public.listening_history_checkpoints to service_role;

comment on table public.listening_history_checkpoints is
  'Service-role checkpoints for retryable backward pagination of Spotify recently-played history.';
