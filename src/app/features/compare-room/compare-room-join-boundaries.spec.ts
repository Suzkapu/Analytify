import {afterEach, describe, expect, it, vi} from 'vitest';
import {BehaviorSubject} from 'rxjs';
import {convertToParamMap} from '@angular/router';
import {CompareRoomJoinComponent} from './compare-room-join.component';
import {CompareMergeProposal, ComparePlaylist} from '@core/compare-room/compare-room.models';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {resolve = done;});
  return {promise, resolve};
}
const playlist: ComparePlaylist = {id: 'library', name: 'Library', total: 1, imageUrl: '', ownerName: 'Guest'};
function proposal(id: string): CompareMergeProposal {
  return {id, contentHash: `hash-${id}`, name: id, description: 'Shared tracks', tracks: [], trackCount: 0, participantNames: ['Guest']};
}
function setup() {
  const guest = {
    accepted$: new BehaviorSubject(false), proposal$: new BehaviorSubject<CompareMergeProposal | null>(null),
    createRequest$: new BehaviorSubject<CompareMergeProposal | null>(null), removed$: new BehaviorSubject(false),
    closed$: new BehaviorSubject(false), error$: new BehaviorSubject<string | null>(null),
    join: vi.fn().mockResolvedValue('participant'), publishParticipant: vi.fn().mockResolvedValue(undefined),
    approve: vi.fn().mockResolvedValue(undefined), publishSaveResult: vi.fn().mockResolvedValue(undefined),
    leave: vi.fn().mockResolvedValue(undefined)
  };
  const auth = {hasSession: () => true, getAccessToken: vi.fn().mockResolvedValue('guest-token'), clear: vi.fn()};
  const source = {loadPlaylists: vi.fn().mockResolvedValue({playlists: [playlist], source: 'spotify'}),
    loadSelection: vi.fn().mockResolvedValue({tracks: [], source: 'spotify'})};
  const spotify = {getProfile: vi.fn().mockResolvedValue({id: 'guest-account', display_name: 'Guest'}), createPlaylist: vi.fn()};
  const component = new CompareRoomJoinComponent(
    {snapshot: {paramMap: convertToParamMap({roomId: 'room'}), fragment: 'invitation=invite&secret=secret'}} as any,
    {url: '/compare-room/join/room', navigate: vi.fn()} as any, auth as any, guest as any,
    spotify as any, source as any, {hasCurrentAcceptance: () => true} as any
  );
  return {component, guest, auth, source, spotify};
}
const cleanup: CompareRoomJoinComponent[] = [];
afterEach(() => {cleanup.splice(0).forEach(component => component.ngOnDestroy()); vi.useRealTimers();});
async function selecting() {
  vi.useFakeTimers();
  const harness = setup();
  cleanup.push(harness.component);
  harness.component.ngOnInit();
  await vi.waitFor(() => expect(harness.guest.join).toHaveBeenCalledOnce());
  harness.guest.accepted$.next(true);
  await vi.waitFor(() => expect(harness.component.stage).toBe('selecting'));
  harness.component.togglePlaylist(playlist.id, true);
  return harness;
}

describe('Compare Room guest workflow ownership boundaries', () => {
  it('reports a failed initial selection publication without starting track loading', async () => {
    const {component, guest, source} = await selecting();
    guest.publishParticipant.mockRejectedValueOnce(new Error('Room connection lost'));
    // Catch at the test boundary so the assertion describes the user-facing defect,
    // rather than allowing an unhandled rejection to obscure the stuck loading state.
    await component.applyPlaylistSelection().catch(() => undefined);
    expect(component.stage).toBe('error');
    expect(component.errorMessage).toBe('Room connection lost');
    expect(source.loadSelection).not.toHaveBeenCalled();
    await component.applyPlaylistSelection();
    expect(component.stage).toBe('ready');
    expect(source.loadSelection).toHaveBeenCalledOnce();
  });

  it('does not transfer an acknowledged approval to a replacement proposal', async () => {
    const {component, guest, spotify} = await selecting();
    await component.applyPlaylistSelection();
    const acknowledgement = deferred<void>();
    guest.approve.mockReturnValueOnce(acknowledgement.promise);
    guest.proposal$.next(proposal('first'));
    const approving = component.approve();
    expect(guest.approve).toHaveBeenCalledWith('first', 'hash-first');
    guest.proposal$.next(proposal('replacement'));
    acknowledgement.resolve();
    await approving;
    expect(component.proposal?.id).toBe('replacement');
    expect(component.hasApproved).toBe(false);
    guest.createRequest$.next(proposal('replacement'));
    await Promise.resolve();
    expect(spotify.createPlaylist).not.toHaveBeenCalled();
  });

  for (const termination of ['closed$', 'removed$'] as const) {
    it(`keeps ${termination === 'closed$' ? 'room closure' : 'participant removal'} authoritative when selected tracks arrive late`, async () => {
      const {component, guest, auth, source, spotify} = await selecting();
      const loading = deferred<{tracks: []; source: 'spotify'}>();
      source.loadSelection.mockReturnValueOnce(loading.promise);
      const applying = component.applyPlaylistSelection();
      await vi.waitFor(() => expect(source.loadSelection).toHaveBeenCalledOnce());
      guest[termination].next(true);
      const terminalMessage = component.errorMessage;
      expect(component.stage).toBe('error');
      expect(auth.clear).toHaveBeenCalledOnce();
      const publicationsBeforeCompletion = guest.publishParticipant.mock.calls.length;
      loading.resolve({tracks: [], source: 'spotify'});
      await applying;
      expect(component.stage).toBe('error');
      expect(component.errorMessage).toBe(terminalMessage);
      expect(guest.publishParticipant).toHaveBeenCalledTimes(publicationsBeforeCompletion);
      expect(spotify.createPlaylist).not.toHaveBeenCalled();
    });
  }
  it('ignores a creation request whose content was not the approved proposal', async () => {
    const {component, guest, spotify} = await selecting();
    await component.applyPlaylistSelection();
    guest.proposal$.next(proposal('approved'));
    await component.approve();
    guest.createRequest$.next({...proposal('approved'), contentHash: 'substituted'});
    guest.createRequest$.next(proposal('different'));
    await Promise.resolve();
    expect(component.hasApproved).toBe(true);
    expect(component.stage).toBe('review');
    expect(spotify.createPlaylist).not.toHaveBeenCalled();
  });

  it('does not publish selected tracks after the component is destroyed', async () => {
    const {component, guest, source} = await selecting();
    const loading = deferred<{tracks: []; source: 'spotify'}>();
    source.loadSelection.mockReturnValueOnce(loading.promise);
    const applying = component.applyPlaylistSelection();
    await vi.waitFor(() => expect(source.loadSelection).toHaveBeenCalledOnce());
    component.ngOnDestroy();
    cleanup.splice(cleanup.indexOf(component), 1);
    const publications = guest.publishParticipant.mock.calls.length;
    loading.resolve({tracks: [], source: 'spotify'});
    await applying;
    expect(guest.publishParticipant).toHaveBeenCalledTimes(publications);
    expect(guest.leave).toHaveBeenCalledOnce();
  });

  it('can retry a current failed approval without replacing the selected proposal', async () => {
    const {component, guest} = await selecting();
    await component.applyPlaylistSelection();
    guest.proposal$.next(proposal('current'));
    guest.approve.mockRejectedValueOnce(new Error('Approval connection lost'));
    await component.approve();
    expect(component.stage).toBe('error');
    expect(component.errorMessage).toBe('Approval connection lost');
    expect(component.hasApproved).toBe(false);
    await component.approve();
    expect(component.stage).toBe('review');
    expect(component.errorMessage).toBe('');
    expect(component.hasApproved).toBe(true);
    expect(guest.approve.mock.calls).toEqual([['current', 'hash-current'], ['current', 'hash-current']]);
  });

  it('does not surface an obsolete approval failure over a replacement proposal', async () => {
    const {component, guest} = await selecting();
    await component.applyPlaylistSelection();
    const acknowledgement = deferred<void>();
    guest.approve.mockReturnValueOnce(acknowledgement.promise.then(() => {throw new Error('Old approval failed');}));
    guest.proposal$.next(proposal('old'));
    const approving = component.approve();
    guest.proposal$.next(proposal('new'));
    acknowledgement.resolve();
    await approving;
    expect(component.stage).toBe('review');
    expect(component.errorMessage).toBe('');
    expect(component.proposal?.id).toBe('new');
    expect(component.hasApproved).toBe(false);
  });

  it('returns to replacement review when a pending save loses approval before token acquisition', async () => {
    const {component, guest, auth, spotify} = await selecting();
    await component.applyPlaylistSelection();
    guest.proposal$.next(proposal('approved'));
    await component.approve();
    const token = deferred<string>();
    auth.getAccessToken.mockReturnValueOnce(token.promise);
    guest.createRequest$.next(proposal('approved'));
    expect(component.stage).toBe('saving');
    guest.proposal$.next(proposal('replacement'));
    token.resolve('guest-token');
    await vi.waitFor(() => expect(component.stage).toBe('review'));
    expect(component.proposal?.id).toBe('replacement');
    expect(component.hasApproved).toBe(false);
    expect(spotify.createPlaylist).not.toHaveBeenCalled();
  });

});
