import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {UserStatsComponent} from './user-stats.component';

function saved(date: string, loaded = true) {
  const [year, month, day] = date.split('-').map(Number);
  return {id: `saved-${date}`, timestamp: new Date(year, month - 1, day, 12).getTime(), snapshotDate: date,
    topTracks: loaded ? [{id: `track-${date}`, name: `Song ${date}`}] : [], topArtists: [], topGenres: [], isLoaded: loaded};
}
function setup(dates: string[], loaded = true) {
  const sdk = {loadStatsSnapshotById: vi.fn().mockResolvedValue(null)};
  const storage = {saveStatsHistory: vi.fn().mockResolvedValue(undefined)};
  const auth = {getSupabaseUserId: () => 'calendar-owner', getUserId: () => 'calendar-spotify', isBackupActive: () => false};
  const route = {sharedOwner: ''};
  const component = new UserStatsComponent(null as never, auth as never, storage as never, sdk as never,
    {snapshot: {paramMap: {get: () => route.sharedOwner}}} as never);
  component.historyData = dates.map(date => saved(date, loaded));
  component.snapshotOptions = [...component.historyData].reverse().map(s => ({id: String(s.timestamp), label: s.snapshotDate, dateKey: s.snapshotDate}));
  return {component, sdk, storage, route};
}
const event = () => new Event('click', {bubbles: true});
beforeEach(() => {vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 7, 12));});
afterEach(() => {vi.useRealTimers(); vi.restoreAllMocks();});

describe('Stats calendar public workflow boundary', () => {
  it('opens the primary date month and closes the other chooser without requesting details', () => {
    const {component, sdk} = setup(['2026-07-15', '2026-09-02']);
    component.selectedSnapshotId = String(component.historyData[0].timestamp);
    component.showCompareMenu = true;
    component.toggleHistoryMenu(event());
    expect(component.showHistoryMenu).toBe(true);
    expect(component.showCompareMenu).toBe(false);
    expect(component.historyCalendarDays.find(d => d?.isSelected)).toMatchObject({dateKey: '2026-07-15', isAvailable: true});
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    component.toggleHistoryMenu(event());
    expect(component.showHistoryMenu).toBe(false);
    component.ngOnDestroy();
  });

  it('jumps across absent months and year boundaries, and ignores navigation outside the range', () => {
    const {component} = setup(['2025-12-31', '2026-02-01']);
    component.compareSnapshotId = String(component.historyData[1].timestamp);
    component.toggleCompareMenu(event());
    expect(component.canNavigateCompareCalendar(1)).toBe(false);
    component.navigateCompareCalendar(1, event());
    expect(component.compareCalendarDays.find(d => d?.isSelected)?.dateKey).toBe('2026-02-01');
    component.navigateCompareCalendar(-1, event());
    expect(component.compareCalendarDays.find(d => d?.isAvailable)?.dateKey).toBe('2025-12-31');
    expect(component.canNavigateCompareCalendar(-1)).toBe(false);
    component.navigateCompareCalendar(-1, event());
    expect(component.compareCalendarDays.find(d => d?.isAvailable)?.dateKey).toBe('2025-12-31');
    component.navigateCompareCalendar(1, event());
    expect(component.compareCalendarDays.find(d => d?.isSelected)?.dateKey).toBe('2026-02-01');
    component.ngOnDestroy();
  });

  it('places leap day in the Thursday column with a complete February', () => {
    const {component} = setup(['2024-02-29']);
    component.compareSnapshotId = String(component.historyData[0].timestamp);
    component.toggleCompareMenu(event());
    expect(component.compareCalendarDays.slice(0, 3)).toEqual([null, null, null]);
    expect(component.compareCalendarDays[31]).toMatchObject({dateKey: '2024-02-29', dayNumber: 29, isAvailable: true, isSelected: true});
    expect(component.compareCalendarDays.filter(Boolean)).toHaveLength(29);
    expect(component.compareCalendarDays[31]?.ariaLabel).toContain('available');
    component.ngOnDestroy();
  });

  it('uses the logical one-am day boundary for Today rather than midnight', () => {
    vi.setSystemTime(new Date(2026, 9, 7, 0, 30));
    const {component} = setup([]);
    component.updateSnapshotGroups();
    expect(component.historyCalendarDays.find(d => d?.isToday)).toMatchObject({dateKey: '2026-10-06', optionId: 'current', isSelected: true});
    vi.setSystemTime(new Date(2026, 9, 7, 1));
    component.updateSnapshotGroups();
    expect(component.historyCalendarDays.find(d => d?.isToday)).toMatchObject({dateKey: '2026-10-07', optionId: 'current', isSelected: true});
    component.ngOnDestroy();
  });

  it('keeps an unavailable date inert and the chooser open', () => {
    const {component, sdk, storage} = setup(['2026-10-04'], false);
    component.toggleCompareMenu(event());
    const day = component.compareCalendarDays.find(d => d?.dateKey === '2026-10-03')!;
    component.selectCompareCalendarDay(day, event());
    expect(component.compareSnapshotId).toBe('');
    expect(component.showCompareMenu).toBe(true);
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('selects comparison through the real cloud boundary without changing the primary or range', async () => {
    const {component, sdk, storage} = setup(['2026-10-04'], false);
    sdk.loadStatsSnapshotById.mockResolvedValue(saved('2026-10-04'));
    component.selectedRange = 'medium_term';
    component.toggleCompareMenu(event());
    component.selectCompareCalendarDay(component.compareCalendarDays.find(d => d?.isAvailable)!, event());
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(component.selectedSnapshotId).toBe('current');
    expect(component.selectedRange).toBe('medium_term');
    expect(component.compareSnapshotId).toBe(String(saved('2026-10-04').timestamp));
    expect(component.showCompareMenu).toBe(false);
    expect(sdk.loadStatsSnapshotById.mock.calls).toEqual([['calendar-owner', 'saved-2026-10-04']]);
    expect(storage.saveStatsHistory).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({userId: 'calendar-spotify', topTracks: saved('2026-10-04').topTracks}));
    component.ngOnDestroy();
  });

  it('selects a ranking date, loads its different default comparison and excludes the primary', async () => {
    const {component, sdk} = setup(['2026-10-02', '2026-10-04'], false);
    component.toggleHistoryMenu(event());
    component.selectHistoryCalendarDay(component.historyCalendarDays.find(d => d?.dateKey === '2026-10-04')!, event());
    for (let i = 0; i < 4; i++) await Promise.resolve();
    expect(component.selectedSnapshotId).toBe(String(saved('2026-10-04').timestamp));
    expect(component.compareSnapshotId).toBe(String(saved('2026-10-02').timestamp));
    expect(component.showHistoryMenu).toBe(false);
    expect(component.getCompareOptions().map(o => o.id)).toEqual([String(saved('2026-10-02').timestamp), 'current']);
    expect(sdk.loadStatsSnapshotById.mock.calls).toEqual([['calendar-owner', 'saved-2026-10-04'], ['calendar-owner', 'saved-2026-10-02']]);
    component.ngOnDestroy();
  });

  it('offers no comparison dates when Today is the only available choice', () => {
    const {component} = setup([]);
    component.toggleCompareMenu(event());
    expect(component.compareCalendarDays).toEqual([]);
    expect(component.compareCalendarMonthLabel).toBe('');
    expect(component.canNavigateCompareCalendar(-1)).toBe(false);
    expect(component.canNavigateCompareCalendar(1)).toBe(false);
    expect(component.getHistoryOptions().map(o => o.id)).toEqual(['current']);
    component.ngOnDestroy();
  });

  it('rejects a stale comparison day after it becomes the primary date', () => {
    const {component, sdk} = setup(['2026-10-04'], false);
    component.toggleCompareMenu(event());
    const stale = component.compareCalendarDays.find(d => d?.isAvailable)!;
    component.selectedSnapshotId = stale.optionId!;
    component.updateSnapshotGroups();
    component.selectCompareCalendarDay(stale, event());
    expect(component.compareSnapshotId).toBe('');
    expect(component.showCompareMenu).toBe(true);
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('rejects a stale ranking day removed by a history refresh', () => {
    const {component, sdk} = setup(['2026-10-04'], false);
    component.toggleHistoryMenu(event());
    const stale = component.historyCalendarDays.find(d => d?.dateKey === '2026-10-04')!;
    component.snapshotOptions = [];
    component.historyData = [];
    component.updateSnapshotGroups();
    component.selectHistoryCalendarDay(stale, event());
    expect(component.selectedSnapshotId).toBe('current');
    expect(component.showHistoryMenu).toBe(true);
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('rejects yesterday’s stale Today cell after the logical date rolls over', () => {
    vi.setSystemTime(new Date(2026, 9, 7, 0, 30));
    const {component, sdk} = setup(['2026-10-04']);
    component.selectedSnapshotId = String(component.historyData[0].timestamp);
    component.toggleHistoryMenu(event());
    const stale = component.historyCalendarDays.find(d => d?.isToday)!;
    vi.setSystemTime(new Date(2026, 9, 7, 1));
    component.selectHistoryCalendarDay(stale, event());
    expect(component.selectedSnapshotId).toBe(String(saved('2026-10-04').timestamp));
    expect(component.showHistoryMenu).toBe(true);
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it.each(['history', 'compare'] as const)('rejects an own %s date when access changes to shared read-only mode', target => {
    const {component, sdk, storage, route} = setup(['2026-10-04'], false);
    component.updateSnapshotGroups();
    const day = (target === 'history' ? component.historyCalendarDays : component.compareCalendarDays).find(d => d?.dateKey === '2026-10-04')!;
    route.sharedOwner = 'shared-owner';
    if (target === 'history') component.selectHistoryCalendarDay(day, event());
    else component.selectCompareCalendarDay(day, event());
    expect(component.selectedSnapshotId).toBe('current');
    expect(component.compareSnapshotId).toBe('');
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });
});
