create table public.deployment_revisions (
  component text primary key check (component in ('supabase')),
  commit_sha text not null check (commit_sha ~ '^[0-9a-f]{40}$'),
  deployed_at timestamptz not null default now()
);
alter table public.deployment_revisions enable row level security;
revoke all on public.deployment_revisions from public, anon, authenticated;
grant select on public.deployment_revisions to anon, authenticated;
create policy deployment_revisions_read on public.deployment_revisions
for select to anon, authenticated using (true);

comment on table public.deployment_revisions is
  'Public non-secret release identity used to prove the live Supabase schema/functions match the intended commit.';
