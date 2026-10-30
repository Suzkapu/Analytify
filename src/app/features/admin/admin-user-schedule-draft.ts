import {AdminUserSyncSettings} from '@core/admin/admin.models';
import {AdminUserScheduleDraft} from './admin-user-interval-validation';

const SCHEDULE_FIELDS = [
  'enabled', 'timezone', 'historyEnabled', 'historyIntervalMinutes', 'historyIntervalUnit',
  'shortTermEnabled', 'shortTermIntervalHours', 'shortTermIntervalUnit',
  'mediumTermEnabled', 'mediumTermIntervalHours', 'mediumTermIntervalUnit',
  'longTermEnabled', 'longTermIntervalHours', 'longTermIntervalUnit',
  'songLeaguePlaylistsEnabled', 'songLeaguePlaylistFridaysOnly', 'songLeaguePlaylistIntervalMinutes',
  'songLeaguePlaylistIntervalUnit', 'sharedPlaylistsEnabled', 'sharedPlaylistIntervalMinutes', 'sharedPlaylistIntervalUnit'
] as const satisfies readonly (keyof AdminUserSyncSettings)[];

/** Fresh server metadata wins. Only editable schedule choices can remain a draft. */
export function mergeUserScheduleDraft(current: AdminUserScheduleDraft | undefined,
  baseline: AdminUserSyncSettings | undefined, server: AdminUserSyncSettings, pendingSave = false): AdminUserScheduleDraft {
  const merged: AdminUserScheduleDraft = {...server};
  if (!current) return merged;
  for (const key of SCHEDULE_FIELDS) {
    if (pendingSave || (baseline && current[key] !== baseline[key])) Object.assign(merged, {[key]: current[key]});
  }
  return merged;
}

export function hasUserScheduleChanges(current: AdminUserScheduleDraft, server: AdminUserSyncSettings): boolean {
  return SCHEDULE_FIELDS.some(key => current[key] !== server[key]);
}
