import {Subject} from 'rxjs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {CompareRoomShellComponent} from './compare-room-shell.component';
import {CompareRoomCoordinatorService} from '@core/compare-room/compare-room-coordinator.service';
import {CompareRoomTransportService} from '@core/compare-room/compare-room-transport.service';
import {PlaylistIntersectionService} from '@core/compare-room/playlist-intersection.service';
import {ComparePlaylist, CompareTrack} from '@core/compare-room/compare-room.models';

vi.mock('qrcode', () => ({toDataURL: async () => 'data:image/png;base64,isolated-slot-fixture'}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {resolve = done; reject = fail;});
  return {promise, resolve, reject};
}
const playlist: ComparePlaylist = {id: 'mix', name: 'Mix', imageUrl: '', total: 1, ownerName: 'Host'};
const track: CompareTrack = {id: 'held-track', uri: 'spotify:track:held-track', name: 'Held track', artists: [], albumName: '', imageUrl: '', spotifyUrl: '', playlistIndex: 0};
type Selection = {tracks: CompareTrack[]; source: 'spotify'};

describe('Compare Room local slot selection ownership', () => {
  let coordinator: CompareRoomCoordinatorService;
  afterEach(async () => {await coordinator?.closeRoom();});

  async function setup(startSelection = true) {
    const transport = {
      createRoom: vi.fn().mockResolvedValue(undefined), connect: vi.fn().mockResolvedValue(undefined),
      createInvitation: vi.fn().mockResolvedValue(undefined), revokeInvitation: vi.fn().mockResolvedValue(undefined),
      touchPresence: vi.fn().mockResolvedValue(undefined), reconcileParticipants: vi.fn().mockResolvedValue([]),
      closeRoom: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined),
      send: vi.fn().mockResolvedValue(undefined)
    };
    coordinator = new CompareRoomCoordinatorService(transport as unknown as CompareRoomTransportService, new PlaylistIntersectionService());
    const held = deferred<Selection>();
    const started = deferred<void>();
    const source = {
      loadMainPlaylists: vi.fn().mockResolvedValue([playlist]),
      loadMainSelection: vi.fn().mockImplementation(() => {started.resolve(); return held.promise;})
    };
    const auth = {
      isAuthenticated: () => true, isTokenExpired: vi.fn().mockReturnValue(false), getAccessToken: () => 'isolated-token',
      refreshToken: vi.fn(),
      getUserId: () => 'host', getSupabaseUserId: () => 'profile'
    };
    const shell = new CompareRoomShellComponent(coordinator, auth as any, source as any, {} as any, {} as any,
      {getItem: () => null} as any,
      {loadUserProfile: async () => ({verified_spotify_id: 'host', display_name: 'Host'})} as any);
    await shell.ngOnInit();
    await shell.joinInvitationYourself(shell.invitations[0]);
    const local = shell.participants.find(item => item.localSlotNumber === 2)!;
    expect(local).toBeDefined();
    await shell.loadMainPlaylistChoices();
    shell.toggleMainPlaylist(local.id, playlist.id, true);
    const applying = startSelection ? shell.applyMainPlaylistSelection(local.id) : Promise.resolve();
    if (startSelection) {
      await started.promise;
      expect(shell.participants.find(item => item.id === local.id)?.status).toBe('loading');
    }
    return {shell, local, held, applying, auth, source};
  }

  for (const outcome of ['success', 'failure'] as const) {
    it(`does not resurrect a removed local group when its held selection settles with ${outcome}`, async () => {
      const {shell, local, held, applying} = await setup();
      const hostId = shell.mainParticipantId;
      shell.removeLocalSlot(local.id);
      expect(shell.participants.map(item => item.id)).toEqual([hostId]);
      if (outcome === 'success') held.resolve({tracks: [track], source: 'spotify'});
      else held.reject(new Error('Isolated Spotify load failed'));
      await applying;
      expect(coordinator.participants$.value.map(item => item.id)).toEqual([hostId]);
      expect(shell.participants.map(item => item.id)).toEqual([hostId]);
      expect(coordinator.getReadyParticipants()).toEqual([]);
      expect(coordinator.sharedTracks$.value).toEqual([]);
      expect(coordinator.canPrepareResult()).toBe(false);
      expect(shell.mainSelectionIds(local.id)).toEqual([]);
      shell.ngOnDestroy();
    });
  }

  it('does not start Spotify selection after a removed slot finishes refreshing its token', async () => {
    const {shell, local, auth, source, held} = await setup(false);
    const token = new Subject<{access_token: string}>();
    auth.isTokenExpired.mockReturnValue(true);
    auth.refreshToken.mockReturnValue(token);
    const applying = shell.applyMainPlaylistSelection(local.id);
    expect(auth.refreshToken).toHaveBeenCalledOnce();
    shell.removeLocalSlot(local.id);
    token.next({access_token: 'refreshed-isolated-token'});
    token.complete();
    held.resolve({tracks: [track], source: 'spotify'});
    await applying;
    expect(source.loadMainSelection).not.toHaveBeenCalled();
    expect(coordinator.participants$.value.map(item => item.id)).toEqual([shell.mainParticipantId]);
    shell.ngOnDestroy();
  });

  it('keeps a current failed selection retryable and accepts the successful retry', async () => {
    const {shell, local, held, applying, source} = await setup();
    held.reject(new Error('Temporary isolated load failure'));
    await applying;
    expect(shell.participants.find(item => item.id === local.id)).toMatchObject({status: 'error', error: 'Temporary isolated load failure', tracks: []});
    source.loadMainSelection.mockResolvedValue({tracks: [track], source: 'spotify'});
    await shell.applyMainPlaylistSelection(local.id);
    expect(shell.participants.find(item => item.id === local.id)).toMatchObject({status: 'ready', error: undefined, tracks: [track]});
    expect(coordinator.getReadyParticipants().map(item => item.id)).toEqual([local.id]);
    shell.ngOnDestroy();
  });

  it('keeps the replacement selection when an older selection finishes last', async () => {
    const {shell, local, held, applying, source} = await setup();
    const replacement = {...playlist, id: 'replacement', name: 'Replacement'};
    const freshTrack = {...track, id: 'current-track', uri: 'spotify:track:current-track'};
    shell.mainPlaylists = [playlist, replacement];
    shell.toggleMainPlaylist(local.id, playlist.id, false);
    shell.toggleMainPlaylist(local.id, replacement.id, true);
    source.loadMainSelection.mockResolvedValue({tracks: [freshTrack], source: 'spotify'});
    await shell.applyMainPlaylistSelection(local.id);
    held.resolve({tracks: [track], source: 'spotify'});
    await applying;
    expect(shell.participants.find(item => item.id === local.id)).toMatchObject({status: 'ready', playlist: replacement, tracks: [freshTrack]});
    shell.ngOnDestroy();
  });

  it('keeps the room empty when a held selection completes after shell teardown', async () => {
    const {shell, held, applying} = await setup();
    shell.ngOnDestroy();
    expect(coordinator.participants$.value).toEqual([]);
    held.resolve({tracks: [track], source: 'spotify'});
    await applying;
    expect(coordinator.participants$.value).toEqual([]);
    expect(coordinator.getReadyParticipants()).toEqual([]);
    expect(coordinator.sharedTracks$.value).toEqual([]);
    expect(coordinator.canPrepareResult()).toBe(false);
  });
});
