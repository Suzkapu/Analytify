begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

select is(private.sync_interval(2, 'minutes'), interval '2 minutes', 'minute intervals are exact');
select is(private.sync_interval(2, 'hours'), interval '2 hours', 'hour intervals are exact');
select is(private.sync_interval(2, 'days'), interval '2 days', 'day intervals are exact');
select is(
  private.next_eligible_sync_time('2026-09-03 22:30:00+00', 'Europe/Vienna', true),
  '2026-09-03 22:30:00+00'::timestamptz,
  'a local Friday remains eligible across timezone conversion'
);
select is(
  private.next_eligible_sync_time('2026-09-05 08:00:00+00', 'Europe/Vienna', true),
  '2026-09-11 08:00:00+00'::timestamptz,
  'a local Saturday advances to the next Friday at the same local time'
);

insert into auth.users(id, email) values
  ('64000000-0000-4000-8000-000000000001', 'schedule-admin@example.test'),
  ('64000000-0000-4000-8000-000000000002', 'schedule-user@example.test');
insert into public.app_admins(user_id) values ('64000000-0000-4000-8000-000000000001');

create function pg_temp.apply_schedule(p_enabled boolean, p_value integer, p_unit text)
returns void language sql as $$
  select public.admin_update_sync_user(
    '64000000-0000-4000-8000-000000000002', p_enabled, 'Europe/Vienna',
    p_enabled, p_value, p_unit, p_enabled, p_value, p_unit,
    p_enabled, p_value, p_unit, p_enabled, p_value, p_unit,
    p_enabled, false, p_value, p_unit, p_enabled, p_value, p_unit
  );
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '64000000-0000-4000-8000-000000000001', true);

select lives_ok($$ select pg_temp.apply_schedule(true, 2, 'hours') $$,
  'enabling a schedule atomically initializes every task state');
set local role service_role;
select is((select count(*) from public.sync_task_state
    where user_id = '64000000-0000-4000-8000-000000000002' and next_run_at is not null), 6::bigint,
  'enabled tasks all receive an effective next run');
select ok((select bool_and(next_run_at between now() - interval '1 second' and now() + interval '2 seconds')
    from public.sync_task_state where user_id = '64000000-0000-4000-8000-000000000002'),
  'newly enabled tasks become due immediately');

insert into public.sync_job_runs(user_id, task_key, trigger_type) values
  ('64000000-0000-4000-8000-000000000002', 'listening_history', 'scheduled'),
  ('64000000-0000-4000-8000-000000000002', 'stats_short_term', 'manual');
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '64000000-0000-4000-8000-000000000001', true);
select lives_ok($$ select pg_temp.apply_schedule(false, 3, 'days') $$,
  'disabling a schedule atomically rebases its task state');
select is((select status from public.sync_job_runs where task_key = 'listening_history'
    and user_id = '64000000-0000-4000-8000-000000000002'), 'cancelled',
  'a queued automatic job is cancelled by the schedule edit');
select is((select status from public.sync_job_runs where task_key = 'stats_short_term'
    and user_id = '64000000-0000-4000-8000-000000000002'), 'queued',
  'a queued manual job is retained by the schedule edit');
select ok((select manual_job_retained from public.admin_list_schedule_status()
    where user_id = '64000000-0000-4000-8000-000000000002'),
  'the admin status reports retained manual work');

select * from finish();
rollback;
