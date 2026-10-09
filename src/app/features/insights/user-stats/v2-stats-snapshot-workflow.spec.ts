import {TestBed} from '@angular/core/testing';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ActivatedRoute} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {Subject} from 'rxjs';
import {V2UserStatsComponent} from './v2-user-stats.component';

const timestamp = new Date(2026, 9, 3, 12).getTime(), id = String(timestamp);
const song = {id: 'song', name: 'Selected song', artists: [{name: 'Artist'}], album: {images: []}};
async function settle() {for (let i = 0; i < 12; i++) await Promise.resolve();}
afterEach(() => {vi.restoreAllMocks(); TestBed.resetTestingModule();});
async function setup() {
  // Startup is outside this contract; exercise the real controller selection and SDK boundary.
  vi.spyOn(V2UserStatsComponent.prototype, 'loadStats').mockResolvedValue(undefined);
  const params = new Subject<any>();
  const account = {shared: '', backup: false, routeToShared() {this.shared = 'shared-owner'; params.next({get: () => this.shared});}};
  const sdk = {loadStatsSnapshotById: vi.fn().mockResolvedValue(null), searchPastTopItems: vi.fn().mockResolvedValue([])};
  const storage = {saveStatsHistory: vi.fn().mockResolvedValue(undefined), getStatsHistory: vi.fn().mockResolvedValue([])};
  await TestBed.configureTestingModule({imports: [V2UserStatsComponent], providers: [
    {provide: SpotifyAuthService, useValue: {getSupabaseUserId: () => 'owner', getUserId: () => 'spotify-owner', isBackupActive: () => account.backup, isAuthenticated: () => false}},
    {provide: SupabaseService, useValue: sdk},
    {provide: StorageService, useValue: storage},
    {provide: ActivatedRoute, useValue: {paramMap: params, snapshot: {paramMap: {get: () => account.shared}}}},
    ...[SpotifyDataService, StatsSharingService, ParticipantSpotifyService].map(provide => ({provide, useValue: null}))
  ]}).compileComponents();
  const fixture = TestBed.createComponent(V2UserStatsComponent), component = fixture.componentInstance;
  component.isLoading = false;
  component.topTracks = [song];
  component.historyData = [{id: 'saved', timestamp, snapshotDate: '2026-10-03', isLoaded: false, topTracks: [], topArtists: [], topGenres: []}];
  component.snapshotOptions = [{id, label: 'Oct 3, 2026', dateKey: '2026-10-03'}];
  component.historyMetadataState = 'ready';
  const element = fixture.nativeElement as HTMLElement;
  const render = () => {fixture.changeDetectorRef.markForCheck(); fixture.detectChanges(); TestBed.tick(); fixture.detectChanges();};
  const button = (scope: string, text: string) => [...element.querySelectorAll<HTMLButtonElement>(`${scope} button`)].find(b => b.textContent?.trim() === text)!;
  return {fixture, component, sdk, storage, account, element, render, button};
}

describe('Stats selected-date recovery through the rendered page', () => {
  it('uses the rendered switch to cancel busy historical search and rejects duplicate/stale permission events', async () => {
    const {fixture, component, sdk, account, element, render} = await setup();
    account.backup = true; render();
    let complete!: (value: any[]) => void;
    sdk.searchPastTopItems.mockReturnValueOnce(new Promise(resolve => complete = resolve));
    component.onStatsSearchChange('former');
    const control = element.querySelector<HTMLButtonElement>('[role="switch"]')!;
    control.click(); render();
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(component.isSearchingPastStats).toBe(true);
    component.changePastSearchEnabled(true); // Repeated desired state must not invert it.
    await new Promise(resolve => setTimeout(resolve, 330)); await settle(); render();
    expect(sdk.searchPastTopItems).toHaveBeenCalledExactlyOnceWith('short_term', 'track', 'former');
    expect(control.disabled).toBe(false);
    control.click(); render();
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(component.isSearchingPastStats).toBe(false);
    complete([{id: 'late', kind: 'track', name: 'Late'}]); await settle(); render();
    expect(element.querySelector('.v2-past-results')).toBeNull();
    expect(component.pastTopResults).toEqual([]);
    account.routeToShared(); await settle(); render();
    component.changePastSearchEnabled(true);
    expect(component.includePastStatsSearch).toBe(false);
    expect(element.querySelector('[role="switch"]')).toBeNull();
    expect(sdk.searchPastTopItems).toHaveBeenCalledTimes(1);
    fixture.destroy();
  });
  it.each(['ranking', 'comparison'] as const)('distinguishes %s failure, blocks duplicate retry and restores data', async target => {
    const {fixture, component, sdk, element, render, button} = await setup();
    if (target === 'ranking') component.selectHistoryValue(id); else component.selectCompareValue(id);
    await settle(); render();
    expect(element.textContent).toContain(target === 'ranking' ? 'Saved rankings unavailable' : 'Comparison unavailable');
    expect(element.querySelector('.rank-movement, v2-ranking-flame')).toBeNull();
    expect(element.querySelector('.v2-ranking-list strong')?.textContent).toBe(target === 'comparison' ? 'Selected song' : undefined);
    expect(element.textContent).not.toContain('No top songs found');
    let finish!: (value: any) => void;
    sdk.loadStatsSnapshotById.mockReturnValueOnce(new Promise(resolve => finish = resolve));
    const retry = button('v2-snapshot-feedback', 'Retry'); retry.click(); retry.click(); render();
    expect(sdk.loadStatsSnapshotById).toHaveBeenCalledTimes(2);
    expect(element.textContent).toContain(target === 'ranking' ? 'Loading saved rankings' : 'Loading comparison rankings');
    expect(button('v2-snapshot-feedback', 'Retry')).toBeUndefined();
    finish({topTracks: [song], topArtists: [], topGenres: []}); await settle(); render();
    expect(element.querySelector('v2-snapshot-feedback')).toBeNull();
    expect(element.querySelector('.v2-ranking-list strong')?.textContent).toBe('Selected song');
    component.onStatsSearchChange('missing'); render();
    expect(element.textContent).toContain('No top songs found');
    expect(element.textContent).not.toContain('No rankings for this category');
    fixture.destroy();
  });

  it('opens the ranking calendar from a successful empty date and returns to Today', async () => {
    const {fixture, component, sdk, element, render, button} = await setup();
    sdk.loadStatsSnapshotById.mockResolvedValue({topTracks: [], topArtists: [], topGenres: []});
    component.selectHistoryValue(id); await settle(); render();
    expect(element.textContent).toContain('No rankings for this category');
    button('v2-snapshot-feedback', 'Choose date').click(); render();
    expect(element.querySelector('[role="dialog"]')?.textContent).toContain('VIEW SNAPSHOT');
    expect(element.querySelector('[data-date="2026-10-03"]')?.closest('[role="gridcell"]')?.getAttribute('aria-selected')).toBe('true');
    element.querySelector<HTMLButtonElement>('[data-date="2026-10-03"]')!.click(); render();
    expect(component.selectedSnapshotId).toBe(id);
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    button('v2-snapshot-feedback', 'Choose date').click(); render();
    button('v2-snapshot-calendar', 'Today').click(); render();
    expect(component.selectedSnapshotId).toBe('current');
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(element.querySelector('.v2-ranking-list strong')?.textContent).toBe('Selected song');
    fixture.destroy();
  });

  it('opens the comparison calendar, excludes the primary date and keeps primary content', async () => {
    const {fixture, component, element, render, button} = await setup();
    component.selectCompareValue(id); await settle(); render();
    button('v2-snapshot-feedback', 'Choose date').click(); render();
    expect(element.querySelector('[role="dialog"]')?.textContent).toContain('COMPARE SNAPSHOT');
    expect(button('v2-snapshot-calendar', 'Today')).toBeUndefined();
    expect(element.querySelector('.v2-ranking-list strong')?.textContent).toBe('Selected song');
    button('v2-snapshot-calendar', 'Close').click(); render();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(component.compareSnapshotId).toBe(id);
    fixture.destroy();
  });

  it('offers comparison Today only for a historical primary and closes the calendar on range change', async () => {
    const {fixture, component, element, render, button} = await setup();
    component.historyData = component.historyData.map(snapshot => ({...snapshot, isLoaded: true, topTracks: [song]}));
    component.selectedSnapshotId = id;
    component.compareSnapshotId = 'removed-date'; render();
    button('v2-snapshot-feedback', 'Choose date').click(); render();
    button('v2-snapshot-calendar', 'Today').click(); render();
    expect(component.compareSnapshotId).toBe('current');
    expect(component.selectedSnapshotId).toBe(id);
    expect(element.querySelector('v2-snapshot-feedback, [role="dialog"]')).toBeNull();
    component.openSnapshotCalendar('ranking'); render();
    component.changeRange('medium_term'); render();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(component.selectedRange).toBe('medium_term');
    fixture.destroy();
  });

  it('retries failed calendar metadata once while preserving the selected date', async () => {
    const {fixture, component, storage, element, render, button} = await setup();
    component.selectedSnapshotId = id;
    component.historyMetadataState = 'refresh-failed';
    component.openSnapshotCalendar('ranking'); render();
    let finish!: (value: any[]) => void;
    storage.getStatsHistory.mockReturnValueOnce(new Promise(resolve => finish = resolve));
    const retry = button('v2-snapshot-calendar', 'Retry'); retry.click(); retry.click(); render();
    expect(storage.getStatsHistory).toHaveBeenCalledOnce();
    expect(element.textContent).toContain('Refreshing saved dates');
    expect(component.selectedSnapshotId).toBe(id);
    finish(component.historyData); await settle(); render();
    expect(component.historyMetadataState).toBe('ready');
    expect(button('v2-snapshot-calendar', 'Retry')).toBeUndefined();
    expect(component.selectedSnapshotId).toBe(id);
    fixture.destroy();
  });

  it('reveals normal date fields without changing either selection, opens each purpose and hides controls again', async () => {
    const {fixture, component, element, render, button} = await setup();
    render();
    expect(element.querySelector('v2-snapshot-date-field')).toBeNull();
    const before = [component.selectedSnapshotId, component.compareSnapshotId];
    element.querySelector<HTMLButtonElement>('.compare-dates')!.click(); render();
    expect([component.selectedSnapshotId, component.compareSnapshotId]).toEqual(before);
    const fields = element.querySelectorAll<HTMLButtonElement>('v2-snapshot-date-field button');
    expect(fields[0].getAttribute('aria-label')).toBe('Ranking date');
    expect(fields[1].getAttribute('aria-label')).toBe('Compare with');
    fields[0].click(); render();
    expect(element.querySelector('[role="dialog"]')?.textContent).toContain('VIEW SNAPSHOT');
    expect(fields[0].getAttribute('aria-expanded')).toBe('true');
    button('v2-snapshot-calendar', 'Close').click(); render();
    fields[1].click(); render();
    expect(element.querySelector('[role="dialog"]')?.textContent).toContain('COMPARE SNAPSHOT');
    button('v2-snapshot-calendar', 'Close').click(); render();
    element.querySelector<HTMLButtonElement>('.compare-dates')!.click(); render();
    expect(element.querySelector('v2-snapshot-date-field, [role="dialog"]')).toBeNull();
    expect([component.selectedSnapshotId, component.compareSnapshotId]).toEqual(before);
    fixture.destroy();
  });

  it('removes private selectors, dialogs and recovery actions after shared access replaces ownership', async () => {
    const {fixture, component, sdk, account, element, render} = await setup();
    component.selectCompareValue(id); await settle();
    component.openSnapshotCalendar('comparison'); render();
    account.routeToShared(); render();
    expect(element.querySelector('select, v2-snapshot-calendar, v2-snapshot-feedback')).toBeNull();
    component.toggleComparisonControls(); expect(component.showComparisonControls).toBe(false);
    component.retrySnapshot('comparison'); component.openSnapshotCalendar('ranking'); component.retryCalendarMetadata();
    component.selectComparisonToday(new Event('click'));
    expect(sdk.loadStatsSnapshotById).toHaveBeenCalledOnce();
    expect(component.compareSnapshotId).toBe(id);
    fixture.destroy();
  });
});
