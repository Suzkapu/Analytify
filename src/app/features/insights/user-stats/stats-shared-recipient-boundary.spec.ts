import {afterEach, describe, expect, it, vi} from 'vitest';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {UserStatsComponent} from './user-stats.component';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {resolve = done;});
  return {promise, resolve};
}
const snapshot = (name = 'Approved owner') => ({ownerUserId: 'owner', ownerDisplayName: name,
  ownerImageUrl: 'owner.png', snapshotDate: '2026-10-08', topTracks: [{id: 'private-song'}],
  topArtists: [{id: 'private-artist'}], topGenres: [{name: 'pop', weight: 100}]});
type RpcResult = {data: ReturnType<typeof snapshot> | null; error: {message: string} | null};
function setup() {
  const recipient = {spotify: 'viewer-spotify' as string | null, cloud: 'viewer-cloud' as string | null};
  const requests: ReturnType<typeof deferred<RpcResult>>[] = [];
  const rpc = vi.fn(() => {const request = deferred<RpcResult>(); requests.push(request); return request.promise;});
  const sharing = new StatsSharingService({getClient: async () => ({rpc})} as never);
  const spotify = {getUserTopTracks: vi.fn(), getUserTopArtists: vi.fn()};
  const storage = {setItem: vi.fn(), getStatsHistory: vi.fn(), saveStatsHistory: vi.fn()};
  const changeDetector = {markForCheck: vi.fn()};
  const component = new UserStatsComponent(spotify as never,
    {getUserId: () => recipient.spotify, getSupabaseUserId: () => recipient.cloud} as never,
    storage as never, {} as never, {snapshot: {paramMap: {get: () => 'owner'}}} as never,
    sharing, changeDetector as never);
  return {component, recipient, requests, rpc, spotify, storage, changeDetector};
}
afterEach(() => vi.restoreAllMocks());

describe('shared Stats recipient isolation through the consent-aware service', () => {
  it('renders an approved response without reading private viewer data or persisting owner data', async () => {
    const h = setup(); const pending = h.component.loadStats(); await Promise.resolve();
    expect(h.component.isLoading).toBe(true);
    h.requests[0].resolve({data: snapshot(), error: null}); await pending;
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith('get_shared_stats_snapshot', {p_owner_user_id: 'owner', p_range: 'short_term'});
    expect(h.component).toMatchObject({isLoading: false, sharedStatsError: '', spyDisplayName: 'Approved owner',
      spySnapshotDate: '2026-10-08', topTracks: [{id: 'private-song'}], topGenres: [{name: 'pop', count: 100, percentage: 100}]});
    expect(h.spotify.getUserTopTracks).not.toHaveBeenCalled(); expect(h.spotify.getUserTopArtists).not.toHaveBeenCalled();
    expect(h.storage.setItem).not.toHaveBeenCalled(); expect(h.storage.getStatsHistory).not.toHaveBeenCalled();
    expect(h.storage.saveStatsHistory).not.toHaveBeenCalled(); h.component.ngOnDestroy();
  });

  it('exposes a current permission error and permits an explicit same-recipient retry', async () => {
    const h = setup(); let pending = h.component.loadStats(); await Promise.resolve();
    h.requests[0].resolve({data: null, error: {message: 'Consent was revoked'}}); await pending;
    expect(h.component).toMatchObject({isLoading: false, sharedStatsError: 'Consent was revoked', topTracks: []});
    expect(h.rpc).toHaveBeenCalledTimes(1);
    pending = h.component.loadStats(); await Promise.resolve();
    expect(h.component).toMatchObject({isLoading: true, sharedStatsError: ''});
    h.requests[1].resolve({data: snapshot(), error: null}); await pending;
    expect(h.component.topTracks).toEqual([{id: 'private-song'}]); expect(h.rpc).toHaveBeenCalledTimes(2);
    h.component.ngOnDestroy();
  });

  for (const identity of ['spotify', 'cloud'] as const) for (const outcome of ['success', 'denied'] as const) {
    it(`ignores ${outcome} and its final loading notification after the recipient ${identity} identity changes`, async () => {
      const h = setup(); const pending = h.component.loadStats(); await Promise.resolve();
      h.recipient[identity] = null;
      const before = {loading: h.component.isLoading, name: h.component.spyDisplayName, image: h.component.spyImageUrl,
        date: h.component.spySnapshotDate, marks: h.changeDetector.markForCheck.mock.calls.length};
      h.requests[0].resolve(outcome === 'success' ? {data: snapshot(), error: null}
        : {data: null, error: {message: 'Old recipient permission error'}}); await pending;
      expect(h.component.topTracks).toEqual([]); expect(h.component.topArtists).toEqual([]); expect(h.component.topGenres).toEqual([]);
      expect(h.component.sharedStatsError).toBe(''); expect(h.component.isLoading).toBe(before.loading);
      expect(h.component.spyDisplayName).toBe(before.name); expect(h.component.spyImageUrl).toBe(before.image);
      expect(h.component.spySnapshotDate).toBe(before.date);
      expect(h.changeDetector.markForCheck).toHaveBeenCalledTimes(before.marks);
      expect(h.storage.setItem).not.toHaveBeenCalled(); h.component.ngOnDestroy();
    });
  }

  it('does not let an old recipient overwrite the replacement recipient response', async () => {
    const h = setup(); const old = h.component.loadStats(); await Promise.resolve();
    h.recipient.cloud = 'replacement-cloud'; const current = h.component.loadStats(); await Promise.resolve();
    h.requests[1].resolve({data: snapshot('New approved owner'), error: null}); await current;
    const marks = h.changeDetector.markForCheck.mock.calls.length;
    h.requests[0].resolve({data: snapshot('Old recipient owner'), error: null}); await old;
    expect(h.component.spyDisplayName).toBe('New approved owner'); expect(h.component.isLoading).toBe(false);
    expect(h.changeDetector.markForCheck).toHaveBeenCalledTimes(marks); h.component.ngOnDestroy();
  });

  it('rejects a response for a range that is no longer selected, even before the next request starts', async () => {
    const h = setup(); const pending = h.component.loadStats(); await Promise.resolve();
    h.component.selectedRange = 'long_term';
    const marks = h.changeDetector.markForCheck.mock.calls.length;
    h.requests[0].resolve({data: snapshot(), error: null}); await pending;
    expect(h.component.topTracks).toEqual([]); expect(h.component.spyDisplayName).toBe('');
    expect(h.changeDetector.markForCheck).toHaveBeenCalledTimes(marks); h.component.ngOnDestroy();
  });

  it('does not apply a shared response or notify a destroyed view', async () => {
    const h = setup(); const pending = h.component.loadStats(); await Promise.resolve(); h.component.ngOnDestroy();
    const marks = h.changeDetector.markForCheck.mock.calls.length;
    h.requests[0].resolve({data: snapshot(), error: null}); await pending;
    expect(h.component.topTracks).toEqual([]); expect(h.changeDetector.markForCheck).toHaveBeenCalledTimes(marks);
  });
});
