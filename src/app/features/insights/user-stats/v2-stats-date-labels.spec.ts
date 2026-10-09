import {describe, expect, it} from 'vitest';
import {UserStatsComponent} from './user-stats.component';
import {V2UserStatsComponent} from './v2-user-stats.component';

function setup(variant: typeof UserStatsComponent | typeof V2UserStatsComponent) {
  const component = new variant(null as any, null as any, null as any, null as any);
  component.snapshotOptions = [{id: 'saved', dateKey: '2026-09-24', label: 'Sep 25, 2026'}];
  return component;
}

describe('snapshot date presentation preserves selection identity', () => {
  it('retains the original stable interface labels and current/missing comparison semantics', () => {
    const component = setup(UserStatsComponent);
    expect(component.getSelectedSnapshotLabel()).toBe('Today');
    expect(component.getCompareSnapshotLabel()).toBe('None');
    component.selectedSnapshotId = 'saved'; component.compareSnapshotId = 'saved';
    expect(component.getSelectedSnapshotLabel()).toBe('Sep 25, 2026');
    expect(component.getCompareSnapshotLabel()).toBe('Sep 25, 2026');
    component.compareSnapshotId = 'current';
    expect(component.getCompareSnapshotLabel()).toBe('Today');
    component.selectedSnapshotId = 'missing'; component.compareSnapshotId = 'missing';
    expect(component.getSelectedSnapshotLabel()).toBe('Today');
    expect(component.getCompareSnapshotLabel()).toBe('Select Snapshot');
  });

  it('uses the canonical saved calendar date, independent of a localized timestamp label', () => {
    const component = setup(V2UserStatsComponent);
    component.selectedSnapshotId = 'saved'; component.compareSnapshotId = 'saved';
    expect(component.getSelectedSnapshotLabel()).toBe('24 Sep 2026');
    expect(component.getCompareSnapshotLabel()).toBe('24 Sep 2026');
    expect(component.selectedSnapshotId).toBe('saved');
    expect(component.compareSnapshotId).toBe('saved');
    expect(component.snapshotOptions).toEqual([{id: 'saved', dateKey: '2026-09-24', label: 'Sep 25, 2026'}]);
  });

  it('retains current, absent and unavailable option semantics in the redesigned controls', () => {
    const component = setup(V2UserStatsComponent);
    expect(component.getSelectedSnapshotLabel()).toBe('Today');
    expect(component.getCompareSnapshotLabel()).toBe('None');
    component.compareSnapshotId = 'current'; expect(component.getCompareSnapshotLabel()).toBe('Today');
    component.selectedSnapshotId = 'missing'; component.compareSnapshotId = 'missing';
    expect(component.getSelectedSnapshotLabel()).toBe('Today');
    expect(component.getCompareSnapshotLabel()).toBe('Select Snapshot');
  });

  it.each(['2026-02-29', '1900-02-29', '2026-09-31', '2026-13-01', '24 Sep 2026', '', undefined])('keeps the existing label for invalid/missing calendar metadata %s', dateKey => {
    const component = setup(V2UserStatsComponent);
    component.snapshotOptions[0].dateKey = dateKey;
    component.selectedSnapshotId = 'saved'; component.compareSnapshotId = 'saved';
    expect(component.getSelectedSnapshotLabel()).toBe('Sep 25, 2026');
    expect(component.getCompareSnapshotLabel()).toBe('Sep 25, 2026');
  });

  it.each([['2000-02-29', '29 Feb 2000'], ['2024-02-29', '29 Feb 2024'], ['2026-01-01', '1 Jan 2026']])('formats valid calendar boundary %s without changing its day', (dateKey, expected) => {
    const component = setup(V2UserStatsComponent);
    component.snapshotOptions[0].dateKey = dateKey; component.selectedSnapshotId = 'saved';
    expect(component.getSelectedSnapshotLabel()).toBe(expected);
  });
});
