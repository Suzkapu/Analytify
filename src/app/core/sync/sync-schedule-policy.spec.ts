import {describe, expect, it} from 'vitest';
import {scheduleBounds, scheduleEditable, scheduleValidation, SyncTaskStatus} from './sync-schedule-policy';
const task: SyncTaskStatus = {task_key: 'listening_history', optional_enabled: true, feature_required: false,
  effective_active: true, editable: true, reasons: [], interval_value: 2, interval_unit: 'hours', minimum_interval_minutes: 61, policy_available: true};
describe('automatic schedule policy domain', () => {
  it.each([['minutes', 61, 10080], ['hours', 2, 168], ['days', 1, 7]] as const)('rounds the %s minimum upward and the seven-day maximum downward', (unit, min, max) => {
    expect(scheduleBounds(task, unit)).toEqual({min, max});
    expect(scheduleValidation(task, {enabled: true, value: min, unit})).toBeNull();
    expect(scheduleValidation(task, {enabled: false, value: min - 1, unit})).toContain('Choose at least');
    expect(scheduleValidation(task, {enabled: true, value: max + 1, unit})).toContain('7 days');
  });
  it.each([NaN, Infinity, 1.5])('rejects noninteger %s', value => expect(scheduleValidation(task, {enabled: true, value, unit: 'hours'})).toBe('Choose a whole-number interval.'));
  it.each([NaN, Infinity, 10081])('blocks an unusable policy minimum %s', minimum_interval_minutes => {
    expect(scheduleValidation({...task, minimum_interval_minutes}, {enabled: true, value: 1, unit: 'minutes'})).toContain('policy is unavailable');
  });
  it('rejects a unit outside the server domain', () => expect(scheduleValidation(task, {enabled: true, value: 2, unit: 'weeks' as 'hours'})).toContain('minutes, hours or days'));
  it('keeps required, feature-owned and unavailable tasks out of the optional editor', () => {
    expect(scheduleEditable(task)).toBe(true);
    for (const changes of [{feature_required: true}, {editable: false}, {policy_available: false}]) expect(scheduleEditable({...task, ...changes})).toBe(false);
    expect(scheduleBounds({...task, minimum_interval_minutes: 0}, 'minutes').min).toBe(1);
  });
});
