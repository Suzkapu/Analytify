import {AdminUserSyncSettings} from '@core/admin/admin.models';

type UserIntervalField =
  | 'historyIntervalMinutes'
  | 'shortTermIntervalHours'
  | 'mediumTermIntervalHours'
  | 'longTermIntervalHours'
  | 'songLeaguePlaylistIntervalMinutes'
  | 'sharedPlaylistIntervalMinutes';

/** Editable fields can be cleared; persisted schedules must remain complete. */
export type AdminUserScheduleDraft = Omit<AdminUserSyncSettings, UserIntervalField> &
  {[K in UserIntervalField]: number | null};

const USER_INTERVAL_FIELDS = [
  'historyIntervalMinutes', 'shortTermIntervalHours', 'mediumTermIntervalHours',
  'longTermIntervalHours', 'songLeaguePlaylistIntervalMinutes', 'sharedPlaylistIntervalMinutes'
] as const satisfies readonly UserIntervalField[];

/** Check table-level bounds only. Task policies and converted durations remain server-owned. */
export function hasValidUserIntervals(draft: AdminUserScheduleDraft): draft is AdminUserSyncSettings {
  return USER_INTERVAL_FIELDS.every(key => {
    const value = draft[key];
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10080;
  });
}
