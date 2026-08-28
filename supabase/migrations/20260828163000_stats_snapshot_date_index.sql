-- The Stats page reads only snapshot IDs and dates on entry. Cover its filter
-- and ordering so the date selectors never require a table scan.
create index if not exists idx_stats_snapshots_user_range_date
  on public.stats_snapshots(user_id, range, snapshot_date desc);
