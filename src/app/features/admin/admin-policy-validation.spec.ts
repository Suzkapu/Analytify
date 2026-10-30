import {describe, expect, it, vi} from 'vitest';
import {Router} from '@angular/router';
import {AdminService} from '@core/admin/admin.service';
import {SyncSchedulePolicy} from '@core/admin/admin.models';
import {AdminComponent} from './admin.component';

function setup() {
  const service = {
    updateSyncSchedulePolicy: vi.fn().mockResolvedValue(undefined),
    loadSyncSchedulePolicy: vi.fn().mockResolvedValue([]),
    listUsers: vi.fn().mockResolvedValue([])
  };
  const component = new AdminComponent(service as unknown as AdminService, {} as Router);
  return {component, service};
}
function policy(value: unknown, unit = 'minutes'): SyncSchedulePolicy {
  return {taskKey: 'listening_history', available: true, intervalValue: value, intervalUnit: unit} as SyncSchedulePolicy;
}

describe('administrator schedule policy validation', () => {
  // SQL private.sync_interval_minutes accepts integer input and caps the converted
  // duration at 10080 minutes: 10080 minutes, 168 hours or 7 days.
  it.each([
    ['missing value', null, 'minutes'],
    ['not a number', Number.NaN, 'minutes'],
    ['infinite value', Number.POSITIVE_INFINITY, 'minutes'],
    ['zero', 0, 'minutes'],
    ['negative value', -1, 'hours'],
    ['fractional minute', 1.5, 'minutes'],
    ['fractional hour', 1.5, 'hours'],
    ['fractional day', 1.5, 'days'],
    ['too many minutes', 10081, 'minutes'],
    ['too many hours', 169, 'hours'],
    ['too many days', 8, 'days'],
    ['unknown unit', 1, 'weeks']
  ])('rejects %s without writing or refreshing inventories', async (_description, value, unit) => {
    const {component, service} = setup();
    component.successMessage = 'Previous save succeeded.';
    await component.saveSchedulePolicy(policy(value, unit));
    expect(service.updateSyncSchedulePolicy).not.toHaveBeenCalled();
    expect(service.loadSyncSchedulePolicy).not.toHaveBeenCalled();
    expect(service.listUsers).not.toHaveBeenCalled();
    expect(component.savingPolicies.size).toBe(0);
    expect(component.successMessage).toBe('');
    expect(component.errorMessage).toMatch(/interval|unit/i);
    expect(component.errorMessage).toMatch(/whole|integer|1|10080|168|7|minutes|hours|days/i);
  });

  it.each([
    [1, 'minutes'], [10080, 'minutes'],
    [1, 'hours'], [168, 'hours'],
    [1, 'days'], [7, 'days']
  ])('saves valid %s %s without silently changing the selected unit', async (value, unit) => {
    const {component, service} = setup();
    const selected = policy(value, unit);
    await component.saveSchedulePolicy(selected);
    expect(service.updateSyncSchedulePolicy).toHaveBeenCalledExactlyOnceWith({
      taskKey: 'listening_history', available: true, intervalValue: value, intervalUnit: unit
    });
    expect(service.loadSyncSchedulePolicy).toHaveBeenCalledExactlyOnceWith();
    expect(service.listUsers).toHaveBeenCalledExactlyOnceWith();
    expect(component.savingPolicies.size).toBe(0);
    expect(component.errorMessage).toBe('');
    expect(component.successMessage).toBe('Listening history limit saved.');
  });

  it('allows correction after validation failure and reports a subsequent service denial without retaining busy state', async () => {
    const {component, service} = setup();
    const selected = policy(0);
    await component.saveSchedulePolicy(selected);
    expect(service.updateSyncSchedulePolicy).not.toHaveBeenCalled();
    selected.intervalValue = 30;
    service.updateSyncSchedulePolicy.mockRejectedValueOnce(new Error('Synthetic administrator permission denial'));
    await component.saveSchedulePolicy(selected);
    expect(service.updateSyncSchedulePolicy).toHaveBeenCalledExactlyOnceWith(selected);
    expect(component.errorMessage).toBe('Synthetic administrator permission denial');
    expect(component.successMessage).toBe('');
    expect(component.savingPolicies.size).toBe(0);
    expect(service.listUsers).not.toHaveBeenCalled();
    await component.saveSchedulePolicy(selected);
    expect(service.updateSyncSchedulePolicy).toHaveBeenCalledTimes(2);
    expect(component.errorMessage).toBe('');
    expect(component.successMessage).toBe('Listening history limit saved.');
    expect(component.savingPolicies.size).toBe(0);
  });

  it('preserves a different policy draft while replacing only the acknowledged saved row', async () => {
    const {component, service} = setup();
    const selected = policy(2, 'hours');
    const draft: SyncSchedulePolicy = {taskKey: 'stats_short_term', available: true, intervalValue: 5, intervalUnit: 'days'};
    const saved = policy(120);
    component.schedulePolicies = [selected, draft];
    service.loadSyncSchedulePolicy.mockResolvedValue([saved, {...draft, intervalValue: 60, intervalUnit: 'minutes'}]);
    await component.saveSchedulePolicy(selected);
    expect(service.updateSyncSchedulePolicy).toHaveBeenCalledExactlyOnceWith(selected);
    expect(component.schedulePolicies.find(row => row.taskKey === selected.taskKey)).toEqual(saved);
    expect(component.schedulePolicies.find(row => row.taskKey === draft.taskKey)).toBe(draft);
    expect(draft).toEqual({taskKey: 'stats_short_term', available: true, intervalValue: 5, intervalUnit: 'days'});
  });

  it.each(['policy inventory', 'user inventory'])('recovers an acknowledged write after failed %s using read-only refresh', async failedRead => {
    const {component, service} = setup();
    const recovery = component as AdminComponent & {
      policyMessages: Map<string, string>;
      policyRefreshRequired: Set<string>;
      refreshPolicy(policy: SyncSchedulePolicy): Promise<void>;
    };
    const selected = policy(2, 'hours');
    const otherDraft: SyncSchedulePolicy = {taskKey: 'stats_short_term', available: true, intervalValue: 5, intervalUnit: 'days'};
    const saved = policy(120);
    component.schedulePolicies = [selected, otherDraft];
    service.loadSyncSchedulePolicy.mockResolvedValue([saved, {...otherDraft, intervalValue: 60, intervalUnit: 'minutes'}]);
    if (failedRead === 'policy inventory') service.loadSyncSchedulePolicy.mockRejectedValueOnce(new Error('Synthetic policy read outage'));
    else service.listUsers.mockRejectedValueOnce(new Error('Synthetic user read outage'));
    await component.saveSchedulePolicy(selected);
    expect(service.updateSyncSchedulePolicy).toHaveBeenCalledExactlyOnceWith(selected);
    expect(component.schedulePolicies).toEqual([selected, otherDraft]);
    expect(recovery.policyRefreshRequired.has(selected.taskKey)).toBe(true);
    expect(recovery.policyMessages.get(selected.taskKey)).toMatch(/saved/i);
    expect(recovery.policyMessages.get(selected.taskKey)).toMatch(/refresh|reload/i);
    expect(component.savingPolicies.size).toBe(0);
    await recovery.refreshPolicy(selected);
    expect(service.updateSyncSchedulePolicy).toHaveBeenCalledTimes(1);
    expect(service.loadSyncSchedulePolicy).toHaveBeenCalledTimes(2);
    expect(component.schedulePolicies.find(row => row.taskKey === selected.taskKey)).toEqual(saved);
    expect(component.schedulePolicies.find(row => row.taskKey === otherDraft.taskKey)).toBe(otherDraft);
    expect(recovery.policyRefreshRequired.has(selected.taskKey)).toBe(false);
    expect(component.savingPolicies.size).toBe(0);
    expect(component.errorMessage).toBe('');
  });

});
