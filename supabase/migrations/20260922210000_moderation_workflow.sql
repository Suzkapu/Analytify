-- Actionable, auditable moderation for Stats-sharing reports.
alter table public.stats_user_reports
  add column if not exists receipt_code text,
  add column if not exists category text not null default 'user_safety',
  add column if not exists content_url text,
  add column if not exists status text not null default 'submitted',
  add column if not exists outcome text,
  add column if not exists decision_reason text,
  add column if not exists reporter_notice text,
  add column if not exists affected_notice text,
  add column if not exists assigned_to uuid references public.users(id) on delete set null,
  add column if not exists reviewed_by uuid references public.users(id) on delete set null,
  add column if not exists resolved_at timestamptz,
  add column if not exists appeal_reason text,
  add column if not exists appealed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update public.stats_user_reports
set receipt_code = 'AR-' || upper(substr(replace(id::text, '-', ''), 1, 10))
where receipt_code is null;

alter table public.stats_user_reports
  alter column receipt_code set default ('AR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  alter column receipt_code set not null;

alter table public.stats_user_reports
  drop constraint if exists stats_user_reports_category_check,
  add constraint stats_user_reports_category_check
    check (category in ('user_safety', 'illegal_content')),
  drop constraint if exists stats_user_reports_status_check,
  add constraint stats_user_reports_status_check
    check (status in ('submitted', 'under_review', 'resolved_action', 'resolved_no_action', 'appealed')),
  drop constraint if exists stats_user_reports_outcome_check,
  add constraint stats_user_reports_outcome_check
    check (outcome is null or outcome in ('warning', 'access_revoked', 'no_violation', 'outside_scope')),
  drop constraint if exists stats_user_reports_content_url_check,
  add constraint stats_user_reports_content_url_check
    check (content_url is null or (char_length(content_url) <= 2048 and content_url ~* '^https://')),
  drop constraint if exists stats_user_reports_decision_reason_check,
  add constraint stats_user_reports_decision_reason_check
    check (decision_reason is null or char_length(decision_reason) between 3 and 1000),
  drop constraint if exists stats_user_reports_appeal_reason_check,
  add constraint stats_user_reports_appeal_reason_check
    check (appeal_reason is null or char_length(appeal_reason) between 3 and 1000);

create unique index if not exists stats_user_reports_receipt_idx
  on public.stats_user_reports(receipt_code);
create index if not exists stats_user_reports_queue_idx
  on public.stats_user_reports(status, created_at);

create table if not exists public.moderation_report_events (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.stats_user_reports(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in ('submitted', 'review_started', 'resolved', 'appealed')),
  from_status text,
  to_status text not null,
  outcome text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists moderation_report_events_report_idx
  on public.moderation_report_events(report_id, created_at);

insert into public.moderation_report_events(report_id, actor_user_id, event_type, to_status, reason, created_at)
select report.id, report.reporter_user_id, 'submitted', report.status, report.reason, report.created_at
from public.stats_user_reports report
where not exists (
  select 1 from public.moderation_report_events event where event.report_id = report.id
);

alter table public.moderation_report_events enable row level security;
revoke all on table public.moderation_report_events from public, anon, authenticated;
grant all on table public.moderation_report_events to service_role;

create or replace function public.report_stats_user(p_user_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if p_user_id = auth.uid() then raise exception 'You cannot report yourself.'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'Describe the issue in 3 to 500 characters.';
  end if;
  if (select count(*) from public.stats_user_reports
      where reporter_user_id = auth.uid() and created_at > now() - interval '1 day') >= 5 then
    raise exception 'Too many reports. Please try again later.';
  end if;
  insert into public.stats_user_reports(reporter_user_id, reported_user_id, reason)
  values (auth.uid(), p_user_id, trim(p_reason)) returning id into v_id;
  insert into public.moderation_report_events(
    report_id, actor_user_id, event_type, to_status, reason
  ) values (v_id, auth.uid(), 'submitted', 'submitted', trim(p_reason));
  perform public.block_stats_user(p_user_id);
  return v_id;
end
$$;

create or replace function public.report_stats_user_v2(
  p_user_id uuid,
  p_reason text,
  p_category text default 'user_safety',
  p_content_url text default null
)
returns table(report_id uuid, receipt_code text, status text)
language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_id uuid;
begin
  if coalesce(p_category, '') not in ('user_safety', 'illegal_content') then
    raise exception 'Choose a valid report category.';
  end if;
  if nullif(trim(coalesce(p_content_url, '')), '') is not null
     and (char_length(trim(p_content_url)) > 2048 or trim(p_content_url) !~* '^https://') then
    raise exception 'The reported content link must be a valid HTTPS URL.';
  end if;
  v_id := public.report_stats_user(p_user_id, p_reason);
  update public.stats_user_reports report set
    category = p_category,
    content_url = nullif(trim(coalesce(p_content_url, '')), ''),
    updated_at = now()
  where report.id = v_id;
  return query select report.id, report.receipt_code, report.status
    from public.stats_user_reports report where report.id = v_id;
end
$$;

create or replace function public.list_my_moderation_cases()
returns table(
  report_id uuid, receipt_code text, viewer_role text, category text, status text,
  reason text, outcome text, decision_reason text, notice text,
  created_at timestamptz, resolved_at timestamptz, appealed_at timestamptz
)
language sql security definer set search_path = public, pg_catalog stable as $$
  select report.id, report.receipt_code,
    case when report.reporter_user_id = auth.uid() then 'reporter' else 'affected' end,
    report.category, report.status,
    case when report.reporter_user_id = auth.uid() then report.reason else null end,
    report.outcome, report.decision_reason,
    case when report.reporter_user_id = auth.uid() then report.reporter_notice else report.affected_notice end,
    report.created_at, report.resolved_at, report.appealed_at
  from public.stats_user_reports report
  where auth.uid() is not null
    and (report.reporter_user_id = auth.uid()
      or (report.reported_user_id = auth.uid()
        and report.status in ('resolved_action', 'resolved_no_action', 'appealed')))
  order by report.created_at desc
$$;

create or replace function public.appeal_moderation_report(p_report_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_previous text;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if char_length(trim(coalesce(p_reason, ''))) not between 3 and 1000 then
    raise exception 'Describe the appeal in 3 to 1000 characters.';
  end if;
  select status into v_previous from public.stats_user_reports
  where id = p_report_id and reported_user_id = auth.uid()
    and status in ('resolved_action', 'resolved_no_action')
    and resolved_at >= now() - interval '30 days'
  for update;
  if v_previous is null then raise exception 'This decision cannot be appealed.'; end if;
  update public.stats_user_reports set status = 'appealed', appeal_reason = trim(p_reason),
    appealed_at = now(), reviewed_at = null, updated_at = now() where id = p_report_id;
  insert into public.moderation_report_events(
    report_id, actor_user_id, event_type, from_status, to_status, reason
  ) values (p_report_id, auth.uid(), 'appealed', v_previous, 'appealed', trim(p_reason));
end
$$;

create or replace function public.admin_list_moderation_reports(p_status text default null)
returns table(
  report_id uuid, receipt_code text, category text, status text,
  reporter_name text, affected_name text, reason text, content_url text,
  outcome text, decision_reason text, reporter_notice text, affected_notice text,
  appeal_reason text, created_at timestamptz, resolved_at timestamptz, appealed_at timestamptz
)
language plpgsql security definer set search_path = public, pg_catalog stable as $$
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  return query
    select report.id, report.receipt_code, report.category, report.status,
      coalesce(nullif(reporter.display_name, ''), 'Spotify user'),
      coalesce(nullif(affected.display_name, ''), 'Spotify user'),
      report.reason, report.content_url, report.outcome, report.decision_reason,
      report.reporter_notice, report.affected_notice, report.appeal_reason,
      report.created_at, report.resolved_at, report.appealed_at
    from public.stats_user_reports report
    join public.users reporter on reporter.id = report.reporter_user_id
    join public.users affected on affected.id = report.reported_user_id
    where p_status is null or report.status = p_status
    order by case report.status when 'appealed' then 0 when 'submitted' then 1 when 'under_review' then 2 else 3 end,
      report.created_at;
end
$$;

create or replace function public.admin_update_moderation_report(
  p_report_id uuid,
  p_status text,
  p_outcome text default null,
  p_decision_reason text default null,
  p_reporter_notice text default null,
  p_affected_notice text default null
)
returns void language plpgsql security definer set search_path = public, pg_catalog as $$
declare v_previous text;
declare v_event text;
begin
  if not private.is_app_admin(auth.uid()) then raise exception 'Administrator access is required.'; end if;
  if p_status not in ('under_review', 'resolved_action', 'resolved_no_action') then
    raise exception 'Choose a valid moderation status.';
  end if;
  if p_status like 'resolved_%' and (
      char_length(trim(coalesce(p_decision_reason, ''))) not between 3 and 1000
      or char_length(trim(coalesce(p_reporter_notice, ''))) not between 3 and 1000
      or char_length(trim(coalesce(p_affected_notice, ''))) not between 3 and 1000) then
    raise exception 'Resolved reports require a reason and notices for both people.';
  end if;
  if p_status = 'resolved_action' and coalesce(p_outcome, '') not in ('warning', 'access_revoked') then
    raise exception 'Choose an action outcome.';
  end if;
  if p_status = 'resolved_no_action' and coalesce(p_outcome, '') not in ('no_violation', 'outside_scope') then
    raise exception 'Choose a no-action outcome.';
  end if;
  select status into v_previous from public.stats_user_reports where id = p_report_id for update;
  if v_previous is null then raise exception 'The moderation report was not found.'; end if;
  v_event := case when p_status = 'under_review' then 'review_started' else 'resolved' end;
  update public.stats_user_reports set
    status = p_status,
    outcome = case when p_status = 'under_review' then outcome else p_outcome end,
    decision_reason = case when p_status = 'under_review' then decision_reason else trim(p_decision_reason) end,
    reporter_notice = case when p_status = 'under_review' then reporter_notice else trim(p_reporter_notice) end,
    affected_notice = case when p_status = 'under_review' then affected_notice else trim(p_affected_notice) end,
    assigned_to = coalesce(assigned_to, auth.uid()), reviewed_by = auth.uid(),
    reviewed_at = case when p_status like 'resolved_%' then now() else reviewed_at end,
    resolved_at = case when p_status like 'resolved_%' then now() else null end,
    updated_at = now()
  where id = p_report_id;
  insert into public.moderation_report_events(
    report_id, actor_user_id, event_type, from_status, to_status, outcome, reason
  ) values (p_report_id, auth.uid(), v_event, v_previous, p_status, p_outcome, nullif(trim(coalesce(p_decision_reason, '')), ''));
end
$$;

revoke all on function public.report_stats_user_v2(uuid, text, text, text) from public, anon;
revoke all on function public.list_my_moderation_cases() from public, anon;
revoke all on function public.appeal_moderation_report(uuid, text) from public, anon;
revoke all on function public.admin_list_moderation_reports(text) from public, anon;
revoke all on function public.admin_update_moderation_report(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.report_stats_user_v2(uuid, text, text, text) to authenticated;
grant execute on function public.list_my_moderation_cases() to authenticated;
grant execute on function public.appeal_moderation_report(uuid, text) to authenticated;
grant execute on function public.admin_list_moderation_reports(text) to authenticated;
grant execute on function public.admin_update_moderation_report(uuid, text, text, text, text, text) to authenticated;

comment on table public.moderation_report_events is
  'Append-only audit trail for user reports, administrative decisions, and appeals.';
comment on function public.list_my_moderation_cases() is
  'Returns reporter receipts and affected-user decision notices without revealing the other party identity.';
