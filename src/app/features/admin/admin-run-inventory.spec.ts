import {describe, expect, it, vi} from 'vitest';
import {Router} from '@angular/router';
import {AdminService} from '@core/admin/admin.service';
import {AdminSyncRun} from '@core/admin/admin.models';
import {AdminComponent} from './admin.component';
import {AdminRunFeedbackState} from './admin-run-feedback.component';

function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
}
const cached = {id: 'cached-run', status: 'failed'} as AdminSyncRun;
function setup() {
  const service = {
    listRuns: vi.fn().mockResolvedValue([]), listUsers: vi.fn().mockResolvedValue([]),
    loadSiteSettings: vi.fn().mockResolvedValue({announcement: '', allowSongLeagueCreation: true}),
    loadSyncSchedulePolicy: vi.fn().mockResolvedValue([]), listModerationReports: vi.fn().mockResolvedValue([])
  };
  const component = new AdminComponent(service as unknown as AdminService, {} as Router) as AdminComponent & {
    runsError: string; readonly runsFeedbackState: AdminRunFeedbackState | null;
  };
  return {component, service};
}

describe('administration audit inventory feedback', () => {
  it('distinguishes confirmed empty inventory from populated records', async () => {
    const {component} = setup();
    await component.refreshRuns();
    expect(component.runsFeedbackState).toBe('empty');
    component.runs = [cached];
    expect(component.runsFeedbackState).toBeNull();
  });

  it.each([false, true])('keeps current records during a held refresh, cached=%s', async hasCache => {
    const {component, service} = setup();
    component.runs = hasCache ? [cached] : [];
    const response = held<AdminSyncRun[]>();
    service.listRuns.mockReturnValueOnce(response.promise);
    const refresh = component.refreshRuns();
    await component.refreshRuns();
    expect(service.listRuns).toHaveBeenCalledOnce();
    expect(component.runsFeedbackState).toBe(hasCache ? 'refreshing' : 'loading');
    expect(component.runs).toEqual(hasCache ? [cached] : []);
    response.resolve([]); await refresh;
    expect(component.runsFeedbackState).toBe('empty');
    expect(component.runsError).toBe('');
  });

  it.each([false, true])('exposes failure and explicit recovery without losing cached data, cached=%s', async hasCache => {
    const {component, service} = setup();
    component.runs = hasCache ? [cached] : [];
    service.listRuns.mockRejectedValueOnce(new Error('Synthetic audit interruption'));
    await component.refreshRuns();
    expect(component.runsError).toBe('Synthetic audit interruption');
    expect(component.runsFeedbackState).toBe(hasCache ? 'refresh-error' : 'load-error');
    expect(component.runs).toEqual(hasCache ? [cached] : []);
    const response = held<AdminSyncRun[]>();
    service.listRuns.mockReturnValueOnce(response.promise);
    const retry = component.refreshRuns();
    expect(component.runsError).toBe('');
    expect(component.runsFeedbackState).toBe(hasCache ? 'refreshing' : 'loading');
    response.resolve([cached]); await retry;
    expect(component.runsFeedbackState).toBeNull();
    expect(service.listRuns).toHaveBeenCalledTimes(2);
  });

  it('does not expose an obsolete local failure after a newer dashboard load', async () => {
    const {component, service} = setup();
    const response = held<AdminSyncRun[]>();
    service.listRuns.mockReturnValueOnce(response.promise).mockResolvedValueOnce([cached]);
    const refresh = component.refreshRuns();
    await component.load();
    response.reject(new Error('Outdated private request')); await refresh;
    expect(component.runsError).toBe('');
    expect(component.runsFeedbackState).toBeNull();
    expect(component.runs).toEqual([cached]);
  });
});
