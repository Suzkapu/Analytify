import {afterEach, describe, expect, it, vi} from 'vitest';
import {UserStatsComponent} from './user-stats.component';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => {resolve = yes;});
  return {promise, resolve};
}
const timestamp = new Date(2026, 9, 3, 12).getTime();
const id = String(timestamp);
const track = {id: 'saved-song', name: 'Saved song'};
const full = {topTracks: [track], topArtists: [], topGenres: []};
function setup() {
  const account = {cloud: 'owner', shared: ''};
  const storage = {saveStatsHistory: vi.fn().mockResolvedValue(undefined)};
  const sdk = {loadStatsSnapshotById: vi.fn()};
  const component = new UserStatsComponent(null as never,
    {getSupabaseUserId: () => account.cloud, getUserId: () => 'spotify-owner', isBackupActive: () => false} as never,
    storage as never, sdk as never, {snapshot: {paramMap: {get: () => account.shared}}} as never);
  component.historyData = [{id: 'saved-date', timestamp, snapshotDate: '2026-10-03', isLoaded: false, topTracks: [], topArtists: [], topGenres: []}];
  return {component, account, storage, sdk};
}
async function settle() {for (let i = 0; i < 8; i++) await Promise.resolve();}
afterEach(() => vi.restoreAllMocks());

describe('Saved ranking and comparison detail outcomes', () => {
  it('reads awaiting detail state without requesting or persisting data', () => {
    const {component, sdk, storage} = setup();
    expect(component.getSnapshotDetailState(id)).toBe('loading');
    expect(component.getSnapshotDetailState(id, 'artists')).toBe('loading');
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('keeps pending state when metadata refresh replaces the loading marker', async () => {
    const {component, sdk} = setup(), request = deferred<typeof full>();
    sdk.loadStatsSnapshotById.mockReturnValue(request.promise);
    component.ensureSnapshotLoaded(id);
    component.historyData = component.historyData.map(snapshot => ({...snapshot, isLoaded: false}));
    expect(component.getSnapshotDetailState(id)).toBe('loading');
    request.resolve(full); await settle();
    expect(component.getSnapshotDetailState(id)).toBe('ready');
    expect(sdk.loadStatsSnapshotById).toHaveBeenCalledOnce();
    component.ngOnDestroy();
  });

  it('distinguishes loaded category emptiness from a failed service request and allows retry', async () => {
    const {component, sdk} = setup();
    sdk.loadStatsSnapshotById.mockResolvedValueOnce(null).mockResolvedValueOnce(full);
    component.ensureSnapshotLoaded(id); await settle();
    for (const category of ['tracks', 'artists', 'genres'] as const) expect(component.getSnapshotDetailState(id, category)).toBe('unavailable');
    component.ensureSnapshotLoaded(id);
    expect(component.getSnapshotDetailState(id)).toBe('loading');
    await settle();
    expect(component.getSnapshotDetailState(id, 'tracks')).toBe('ready');
    expect(component.getSnapshotDetailState(id, 'artists')).toBe('empty');
    expect(component.getSnapshotDetailState(id, 'genres')).toBe('empty');
    component.ngOnDestroy();
  });

  it('does not call a search miss an empty saved ranking', async () => {
    const {component, sdk} = setup();
    sdk.loadStatsSnapshotById.mockResolvedValue(full);
    component.selectedSnapshotId = id;
    component.ensureSnapshotLoaded(id); await settle();
    component.statsSearchQuery = 'no matching song';
    expect(component.filteredTracks).toEqual([]);
    expect(component.getSnapshotDetailState(id)).toBe('ready');
    component.ngOnDestroy();
  });

  it.each(['tracks', 'artists', 'genres'] as const)('reports successful empty %s independently of other categories', category => {
    const {component} = setup();
    component.historyData = component.historyData.map(snapshot => ({...snapshot, isLoaded: true,
      topTracks: category === 'tracks' ? [] : [track], topArtists: category === 'artists' ? [] : [{id: 'artist', name: 'Artist'}],
      topGenres: category === 'genres' ? [] : [{name: 'Genre', count: 1, percentage: 100}]}));
    expect(component.getSnapshotDetailState(id, category)).toBe('empty');
    component.selectedCategory = category;
    expect(component.getSnapshotDetailState(id)).toBe('empty');
    component.ngOnDestroy();
  });

  it('preserves ready primary state while a comparison is pending and unavailable', async () => {
    const {component, sdk} = setup(), request = deferred<typeof full | null>();
    component.topTracks = [track];
    component.compareSnapshotId = id;
    sdk.loadStatsSnapshotById.mockReturnValue(request.promise);
    component.ensureSnapshotLoaded(id);
    expect(component.getSnapshotDetailState('current')).toBe('ready');
    expect(component.getSnapshotDetailState(id)).toBe('loading');
    request.resolve(null); await settle();
    expect(component.getSnapshotDetailState('current')).toBe('ready');
    expect(component.getSnapshotDetailState(id)).toBe('unavailable');
    expect(component.filteredTracks).toEqual([track]);
    component.ngOnDestroy();
  });

  it('allows loaded local data offline but rejects metadata without an owner or snapshot identity', () => {
    const {component, account, sdk} = setup();
    account.cloud = '';
    expect(component.getSnapshotDetailState(id)).toBe('unavailable');
    component.historyData = component.historyData.map(snapshot => ({...snapshot, ...full, isLoaded: true}));
    expect(component.getSnapshotDetailState(id)).toBe('ready');
    account.cloud = 'owner';
    component.historyData = component.historyData.map(snapshot => ({...snapshot, id: '', isLoaded: false}));
    expect(component.getSnapshotDetailState(id)).toBe('unavailable');
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('never substitutes current data for a removed date or private shared date', () => {
    const {component, account, sdk} = setup();
    component.topTracks = [track];
    expect(component.getSnapshotDetailState('removed-date')).toBe('unavailable');
    account.shared = 'another-owner';
    expect(component.getSnapshotDetailState(id)).toBe('unavailable');
    expect(component.getSnapshotDetailState('current')).toBe('ready');
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });

  it('handles current category emptiness and absent comparison without issuing a request', () => {
    const {component, sdk} = setup();
    component.topArtists = [{id: 'current-artist', name: 'Artist'}];
    component.topGenres = [{name: 'Current genre', count: 1, percentage: 100}];
    expect(component.getSnapshotDetailState('current', 'tracks')).toBe('empty');
    expect(component.getSnapshotDetailState('current', 'artists')).toBe('ready');
    expect(component.getSnapshotDetailState('current', 'genres')).toBe('ready');
    expect(component.getSnapshotDetailState('')).toBe('ready');
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    component.ngOnDestroy();
  });
});

