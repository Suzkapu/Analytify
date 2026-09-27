import {describe, expect, it} from 'vitest';
import {humanInterval, notificationDeviceStatus, syncTaskState} from './settings-sheet-view-model';

const settings = (deviceState: any, installedPwa = true): any => ({deviceState, installedPwa});

describe('settings sheet view model', () => {
  it.each([
    ['registered', 'This device is ready'],
    ['permission-required', 'Permission required'],
    ['denied', 'Notifications are blocked'],
    ['unsupported', 'Notifications are unavailable'],
    ['subscription-missing', 'Finish device setup'],
    ['server-only', 'Set up this device']
  ])('maps %s to an actionable device outcome', (state, title) => {
    expect(notificationDeviceStatus(settings(state)).title).toBe(title);
  });

  it.each([[1, '1 minute'], [59, '59 minutes'], [60, '1 hour'], [120, '2 hours'], [1440, '1 day'], [2880, '2 days']])(
    'formats %i minutes as %s',
    (minutes, label) => expect(humanInterval(minutes)).toBe(label)
  );

  it('distinguishes required, unavailable, enabled, and disabled schedules', () => {
    expect(syncTaskState({effective_active: true, feature_required: true, editable: false, policy_available: true}).label).toBe('Required');
    expect(syncTaskState({effective_active: false, feature_required: false, editable: true, policy_available: false}).label).toBe('Unavailable');
    expect(syncTaskState({effective_active: true, feature_required: false, editable: true, policy_available: true}).label).toBe('Automatic updates on');
    expect(syncTaskState({effective_active: false, feature_required: false, editable: true, policy_available: true}).label).toBe('Automatic updates off');
  });
});
