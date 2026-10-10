export type SyncIntervalUnit = 'minutes' | 'hours' | 'days';
export interface SyncTaskStatus {
  task_key: string; optional_enabled: boolean; feature_required: boolean; effective_active: boolean;
  reasons: string[]; editable: boolean; interval_value: number; interval_unit: SyncIntervalUnit;
  minimum_interval_minutes: number; policy_available: boolean;
}
export interface SyncScheduleDraft {enabled: boolean; value: number; unit: SyncIntervalUnit;}

export function scheduleEditable(task: SyncTaskStatus): boolean {
  return task.editable && !task.feature_required && task.policy_available;
}
export function scheduleBounds(task: SyncTaskStatus, unit: SyncIntervalUnit): {min: number; max: number} {
  const divisor = unit === 'days' ? 1440 : unit === 'hours' ? 60 : 1;
  return {min: Math.max(1, Math.ceil(task.minimum_interval_minutes / divisor)), max: Math.floor(10080 / divisor)};
}
/** Mirrors the allowed RPC domain; the server remains authoritative. */
export function scheduleValidation(task: SyncTaskStatus, draft: SyncScheduleDraft): string | null {
  if (!['minutes', 'hours', 'days'].includes(draft.unit)) return 'Choose minutes, hours or days.';
  if (!Number.isInteger(draft.value)) return 'Choose a whole-number interval.';
  const bounds = scheduleBounds(task, draft.unit);
  if (!Number.isFinite(bounds.min) || bounds.min > bounds.max) return 'The automatic update policy is unavailable.';
  const unit = bounds.min === 1 ? draft.unit.replace(/s$/, '') : draft.unit;
  if (draft.value < bounds.min) return `Choose at least ${bounds.min} ${unit}.`;
  if (draft.value > bounds.max) return 'Choose an interval no longer than 7 days.';
  return null;
}
