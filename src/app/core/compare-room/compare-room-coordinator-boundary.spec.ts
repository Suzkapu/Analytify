import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {CompareRoomCoordinatorService, resolveQrCodeApi} from './compare-room-coordinator.service';
import {CompareRoomTransportService} from './compare-room-transport.service';
import {PlaylistIntersectionService} from './playlist-intersection.service';
import {CompareParticipant, CompareRoomEnvelope, CompareRoomMessage, CompareTrack} from './compare-room.models';
import {proposalContentHash} from './compare-room-integrity';

// QR rendering is a presentation dependency; these tests exercise room effects,
// not image fidelity. Intersection and proposal integrity use production logic.
vi.mock('qrcode', () => ({toDataURL: async () => 'data:image/png;base64,isolated-qr-fixture'}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {resolve = done; reject = fail;});
  return {promise, resolve, reject};
}
function track(id: string): CompareTrack {
  return {id, uri: `spotify:track:${id}`, name: id, artists: [{id: 'artist', name: 'Artist'}], albumName: '', imageUrl: '', spotifyUrl: '', playlistIndex: 1};
}
function participant(id: string, ids = ['shared'], localSlotNumber = 1): CompareParticipant {
  return {id, spotifyUserId: `${id}-account`, displayName: id, imageUrl: '', status: 'ready',
    playlist: {id: `${id}-playlist`, name: id, total: ids.length, imageUrl: '', ownerName: id},
    tracks: ids.map(track), isMainProfile: true, localSlotNumber};
}

describe('Compare coordinator retained workflow boundaries', () => {
  let service: CompareRoomCoordinatorService;
  let handler: (envelope: CompareRoomEnvelope) => void;
  let transport: {createRoom: ReturnType<typeof vi.fn>; connect: ReturnType<typeof vi.fn>; createInvitation: ReturnType<typeof vi.fn>; revokeInvitation: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; sendCreation: ReturnType<typeof vi.fn>; touchPresence: ReturnType<typeof vi.fn>; reconcileParticipants: ReturnType<typeof vi.fn>; closeRoom: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>};
  let sequence: number;
  beforeEach(() => {
    vi.useFakeTimers();
    sequence = 0;
    transport = {createRoom: vi.fn().mockResolvedValue(undefined), connect: vi.fn().mockImplementation(async (_id, callback) => {handler = callback;}), createInvitation: vi.fn().mockResolvedValue(undefined), revokeInvitation: vi.fn().mockResolvedValue(undefined), send: vi.fn().mockResolvedValue(undefined), sendCreation: vi.fn().mockResolvedValue(undefined), touchPresence: vi.fn().mockResolvedValue(undefined), reconcileParticipants: vi.fn().mockResolvedValue([]), closeRoom: vi.fn().mockResolvedValue(undefined), disconnect: vi.fn().mockResolvedValue(undefined)};
    service = new CompareRoomCoordinatorService(transport as unknown as CompareRoomTransportService, new PlaylistIntersectionService());
  });
  afterEach(async () => {await service.closeRoom(); vi.useRealTimers();});
  function receive(message: CompareRoomMessage) {
    handler({id: ++sequence, senderParticipantId: 'guest', senderRole: 'guest', sequence, message});
  }
  async function joinGuest(id = 'guest') {
    const invitation = await service.addInvitation();
    receive({type: 'invitation-claimed', invitationId: invitation.id, participantId: id});
    const guest = {...participant(id), isMainProfile: false, invitationId: invitation.id};
    receive({type: 'participant-state', participant: guest});
    return {invitation, guest};
  }

  it('waits for host transport readiness before publishing participants and starting presence', async () => {
    const ready = deferred<void>();
    transport.connect.mockImplementation(async (_id, callback) => {handler = callback; await ready.promise;});
    const creating = service.createRoom(participant('host'));
    await Promise.resolve();
    expect(service.participants$.value).toEqual([]);
    expect(transport.touchPresence).not.toHaveBeenCalled();
    ready.resolve(); await creating;
    expect(service.participants$.value.map(item => item.id)).toEqual(['host']);
    expect(transport.touchPresence).toHaveBeenCalledOnce();
    expect(service.currentRoomId).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('requires room creation before adding invitations', async () => {
    await expect(service.addInvitation()).rejects.toThrow('Create the room');
    expect(transport.createInvitation).not.toHaveBeenCalled();
  });

  it('keeps invitation secrets in the fragment and requires every slot to become ready', async () => {
    await service.createRoom(participant('host'));
    service.addLocalParticipant(participant('second', ['shared'], 2));
    expect(service.canPrepareResult()).toBe(true);
    const invitation = await service.addInvitation();
    const url = new URL(invitation.joinUrl);
    expect(url.pathname).toBe(`/new/compare-room/join/${service.currentRoomId}`);
    expect(url.search).toBe('');
    expect(new URLSearchParams(url.hash.slice(1)).get('secret')).toBe(invitation.secret);
    expect(service.canPrepareResult()).toBe(false);
    receive({type: 'invitation-claimed', invitationId: invitation.id, participantId: 'guest'});
    expect(service.canPrepareResult()).toBe(false);
    receive({type: 'participant-state', participant: {...participant('guest'), isMainProfile: false}});
    expect(service.canPrepareResult()).toBe(true);
    receive({type: 'invitation-claimed', invitationId: invitation.id, participantId: 'imposter'});
    expect(service.invitations$.value[0].claimedBy).toBe('guest');
  });

  it('ignores uninvited participant state and data chunks', async () => {
    await service.createRoom(participant('host'));
    receive({type: 'participant-state', participant: {...participant('unknown'), isMainProfile: false}});
    receive({type: 'participant-track-chunk', participantId: 'unknown', tracks: [track('injected')]});
    expect(service.participants$.value.map(item => item.id)).toEqual(['host']);
    expect(service.canPrepareResult()).toBe(false);
  });

  it('detects lost guest chunks, then resets the buffer for a successful reselection', async () => {
    await service.createRoom(participant('host'));
    const {guest} = await joinGuest();
    receive({type: 'participant-state', participant: {...guest, status: 'loading', tracks: []}});
    receive({type: 'participant-track-chunk', participantId: guest.id, tracks: [track('old')]});
    receive({type: 'participant-tracks-complete', participant: guest, total: 2});
    expect(service.participants$.value.find(item => item.id === guest.id)).toMatchObject({status: 'error', tracks: [], error: expect.stringContaining('lost')});
    expect(service.canPrepareResult()).toBe(false);
    receive({type: 'participant-state', participant: {...guest, status: 'loading', tracks: []}});
    receive({type: 'participant-track-chunk', participantId: guest.id, tracks: [track('shared')]});
    receive({type: 'participant-tracks-complete', participant: guest, total: 1});
    expect(service.participants$.value.find(item => item.id === guest.id)).toMatchObject({status: 'ready', tracks: [track('shared')]});
    expect(service.canPrepareResult()).toBe(true);
  });

  it('protects the first local slot and guest slots while permitting removal of another local group', async () => {
    await service.createRoom(participant('host'));
    const {guest} = await joinGuest();
    service.addLocalParticipant(participant('second', ['shared'], 2));
    service.addLocalParticipant(participant('second', ['replacement'], 2));
    service.addLocalParticipant({...participant('not-local'), isMainProfile: false});
    service.removeLocalParticipant('host'); service.removeLocalParticipant(guest.id); service.removeLocalParticipant('missing');
    expect(service.participants$.value.map(item => item.id)).toEqual(['host', 'guest', 'second']);
    service.removeLocalParticipant('second');
    expect(service.participants$.value.map(item => item.id)).toEqual(['host', 'guest']);
  });

  it('binds a union proposal to exact content and reports zero contribution without dividing by zero', async () => {
    await service.createRoom(participant('host', ['a', 'a', 'b']));
    const empty = participant('empty', [], 2);
    empty.playlists = [empty.playlist!, {...empty.playlist!, id: 'other'}];
    service.addLocalParticipant(empty);
    const proposal = (await service.prepareProposal('  My mix  ', 'union'))!;
    expect(proposal.name).toBe('My mix');
    expect(proposal.tracks.map(item => item.id)).toEqual(['a', 'b']);
    expect(proposal.contentHash).toBe(await proposalContentHash(proposal));
    expect(proposal.participantStats?.find(item => item.participantId === 'empty')).toMatchObject({selectedPlaylistCount: 2, selectedTrackCount: 0, includedPercentage: 0});
    expect(proposal.descriptionsByParticipant?.['empty']).toContain('2 selected playlists');
    expect(service.allParticipantsApproved()).toBe(true);
  });

  it('keeps an empty intersection distinct from unavailable or unready selections', async () => {
    await service.createRoom(participant('host', ['a']));
    expect(await service.prepareProposal()).toBeNull();
    service.addLocalParticipant(participant('second', ['b'], 2));
    expect(await service.prepareProposal()).toBeNull();
    expect(service.sharedTracks$.value).toEqual([]);
    service.updateLocalParticipant({...participant('second', ['a'], 2), playlist: undefined});
    expect(service.getReadyParticipants().map(item => item.id)).toEqual(['host']);
    expect(service.canPrepareResult()).toBe(false);
    await expect(service.executeProposal()).rejects.toThrow('Every participant must approve');
  });

  it('requires exact guest approval hashes and sends only approved content in bounded chunks', async () => {
    const ids = Array.from({length: 205}, (_, i) => `song-${i}`);
    await service.createRoom(participant('host', ids));
    const {guest} = await joinGuest();
    receive({type: 'participant-state', participant: {...guest, tracks: ids.map(track)}});
    const proposal = (await service.prepareProposal())!;
    expect(service.allParticipantsApproved()).toBe(false);
    receive({type: 'proposal-approval', participantId: guest.id, proposalId: proposal.id, contentHash: 'wrong'});
    receive({type: 'proposal-approval', participantId: guest.id, proposalId: 'old', contentHash: proposal.contentHash});
    expect(transport.sendCreation).not.toHaveBeenCalled();
    receive({type: 'proposal-approval', participantId: guest.id, proposalId: proposal.id, contentHash: proposal.contentHash});
    await vi.waitFor(() => expect(transport.sendCreation).toHaveBeenCalledTimes(5));
    const delivery = transport.sendCreation.mock.calls.map(([message]) => message);
    expect(delivery[0]).toMatchObject({type: 'create-playlist-start', targetParticipantId: guest.id, proposal: {tracks: [], contentHash: proposal.contentHash}});
    expect(delivery.slice(1, 4).map(message => message.tracks.length)).toEqual([100, 100, 5]);
    expect(delivery.slice(1, 4).flatMap(message => message.tracks).map(item => item.id)).toEqual(ids);
    expect(delivery[4]).toEqual({type: 'create-playlist-commit', proposalId: proposal.id, targetParticipantId: guest.id});
    expect(service.allParticipantsApproved()).toBe(true);
  });

  it('collects independent save outcomes and finishes only when every participant has a terminal result', async () => {
    await service.createRoom(participant('host'));
    const {guest} = await joinGuest();
    const proposal = (await service.prepareProposal())!;
    receive({type: 'proposal-approval', participantId: guest.id, proposalId: proposal.id, contentHash: proposal.contentHash});
    await service.executeProposal();
    expect(service.participants$.value.every(item => item.status === 'saving')).toBe(true);
    service.setLocalSaveResult('host', {success: true, playlistName: 'Saved', addedTracks: 1});
    expect(service.isFinished()).toBe(false);
    receive({type: 'save-result', participantId: guest.id, result: {success: false, playlistName: 'Failed', addedTracks: 0, error: 'denied'}});
    service.setLocalSaveResult('missing', {success: true, playlistName: 'Ignored', addedTracks: 1});
    expect(service.isFinished()).toBe(true);
    expect(service.participants$.value.map(item => item.status)).toEqual(['complete', 'error']);
  });

  it.each(['left', 'disconnected'] as const)('removes a guest who %s and invalidates a prepared result', async reason => {
    await service.createRoom(participant('host'));
    const {guest} = await joinGuest();
    await service.prepareProposal();
    receive({type: 'participant-left', participantId: guest.id, reason});
    expect(service.participants$.value.map(item => item.id)).toEqual(['host']);
    expect(service.invitations$.value).toEqual([]);
    expect(service.proposal$.value).toBeNull();
    expect(service.error$.value).toContain(reason === 'left' ? 'left the room' : 'disconnected');
    receive({type: 'participant-state', participant: guest});
    expect(service.participants$.value.map(item => item.id)).toEqual(['host']);
  });

  it('stops presence after close even if the remote close acknowledgement fails', async () => {
    await service.createRoom(participant('host'));
    transport.closeRoom.mockRejectedValueOnce(new Error('network down'));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(transport.touchPresence).toHaveBeenCalledTimes(3);
    await service.closeRoom();
    const touches = transport.touchPresence.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(transport.touchPresence).toHaveBeenCalledTimes(touches);
    expect(service.currentRoomId).toBe('');
    expect(service.participants$.value).toEqual([]);
    expect(service.invitations$.value).toEqual([]);
    expect(transport.disconnect).toHaveBeenCalled();
  });
  it('does not publish a proposal for selections replaced while the actual integrity hash is pending', async () => {
    await service.createRoom(participant('host', ['shared']));
    service.addLocalParticipant(participant('second', ['shared'], 2));
    const preparing = service.prepareProposal();
    service.updateLocalParticipant(participant('second', ['new-selection'], 2));
    await preparing;
    expect(service.proposal$.value).toBeNull();
    expect(service.sharedTracks$.value).toEqual([]);
    expect(service.participants$.value.find(item => item.id === 'second')!.tracks.map(item => item.id)).toEqual(['new-selection']);
    expect(transport.send.mock.calls.some(([message]) => message.type === 'merge-proposal')).toBe(false);
  });

  it('does not reconnect or restore a host after closing a room whose creation acknowledgement is pending', async () => {
    const acknowledgement = deferred<void>();
    transport.createRoom.mockReturnValue(acknowledgement.promise);
    const creating = service.createRoom(participant('old-host'));
    await service.closeRoom();
    acknowledgement.resolve();
    await creating.catch(() => undefined);
    expect(transport.connect).not.toHaveBeenCalled();
    expect(transport.touchPresence).not.toHaveBeenCalled();
    expect(service.participants$.value).toEqual([]);
    expect(service.currentRoomId).toBe('');
  });

  it('rejects late guest updates immediately when its claimed invitation is cancelled before remote acknowledgement', async () => {
    await service.createRoom(participant('host'));
    const {invitation, guest} = await joinGuest();
    const acknowledgement = deferred<void>();
    transport.revokeInvitation.mockReturnValue(acknowledgement.promise);
    const cancelling = service.cancelInvitation(invitation.id);
    receive({type: 'participant-state', participant: {...guest, displayName: 'late guest state'}});
    const visibleWhilePending = service.participants$.value.map(item => item.id);
    acknowledgement.resolve(); await cancelling;
    expect(visibleWhilePending).toEqual(['host']);
    expect(service.participants$.value.map(item => item.id)).toEqual(['host']);
  });

  it('does not recreate an invitation slot when its remote creation resolves after room close', async () => {
    await service.createRoom(participant('host'));
    const acknowledgement = deferred<void>();
    transport.createInvitation.mockReturnValue(acknowledgement.promise);
    const inviting = service.addInvitation();
    await vi.waitFor(() => expect(transport.createInvitation).toHaveBeenCalledOnce());
    await service.closeRoom();
    acknowledgement.resolve();
    await inviting.catch(() => undefined);
    expect(service.invitations$.value).toEqual([]);
    expect(service.currentRoomId).toBe('');
  });

  it('preserves a successor room when an earlier remote close acknowledgement finishes late', async () => {
    await service.createRoom(participant('old-host'));
    const acknowledgement = deferred<void>();
    transport.closeRoom.mockReturnValueOnce(acknowledgement.promise);
    const closing = service.closeRoom();
    await service.createRoom(participant('new-host'));
    const successorId = service.currentRoomId;
    acknowledgement.resolve(); await closing;
    expect(service.currentRoomId).toBe(successorId);
    expect(service.participants$.value.map(item => item.id)).toEqual(['new-host']);
    expect(transport.disconnect).not.toHaveBeenCalled();
  });

  it('ignores a prior room callback after a successor accepts the same guest slot id', async () => {
    await service.createRoom(participant('old-host'));
    await joinGuest('guest');
    const oldCallback = handler;
    await service.createRoom(participant('new-host'));
    await joinGuest('guest');
    const currentIds = service.participants$.value.map(item => item.id);
    oldCallback({id: 999, senderParticipantId: 'guest', senderRole: 'guest', sequence: 999, message: {type: 'participant-left', participantId: 'guest', reason: 'left'}});
    expect(service.participants$.value.map(item => item.id)).toEqual(currentIds);
    expect(service.error$.value).toBeNull();
  });

  it('reports transport failures without hiding an otherwise usable prepared result', async () => {
    await service.createRoom(participant('host'));
    service.addLocalParticipant(participant('second', ['shared'], 2));
    transport.send.mockRejectedValueOnce(new Error('proposal delivery failed'));
    const proposal = await service.prepareProposal();
    await Promise.resolve();
    expect(service.proposal$.value).toBe(proposal);
    expect(service.error$.value).toBe('proposal delivery failed');
    transport.send.mockRejectedValueOnce('unknown transport failure');
    service.updateLocalParticipant(participant('second', ['replacement'], 2));
    await Promise.resolve();
    expect(service.proposal$.value).toBeNull();
    expect(service.error$.value).toBe('The Compare Room encountered an error.');
  });

  it('stops a failed creation sequence before commit and permits delivery retry of the approved proposal', async () => {
    await service.createRoom(participant('host'));
    service.addLocalParticipant(participant('second', ['shared'], 2));
    const proposal = (await service.prepareProposal())!;
    transport.sendCreation.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('chunk unavailable'));
    await expect(service.executeProposal()).rejects.toThrow('chunk unavailable');
    expect(transport.sendCreation.mock.calls.map(([message]) => message.type)).toEqual(['create-playlist-start', 'create-playlist-track-chunk']);
    await service.executeProposal();
    expect(transport.sendCreation).toHaveBeenLastCalledWith({type: 'create-playlist-commit', proposalId: proposal.id, targetParticipantId: undefined});
  });

  it('accepts remote proposal cancellation without echoing it back to the room', async () => {
    await service.createRoom(participant('host'));
    await joinGuest();
    await service.prepareProposal();
    const sentBefore = transport.send.mock.calls.length;
    receive({type: 'merge-proposal-cancelled', reason: 'Guest changed their selection.'});
    expect(service.proposal$.value).toBeNull();
    expect(service.sharedTracks$.value).toEqual([]);
    expect(service.error$.value).toBe('Guest changed their selection.');
    expect(transport.send.mock.calls.length).toBe(sentBefore);
  });

  it('removes guest permissions even if its explicit removal notification fails', async () => {
    await service.createRoom(participant('host'));
    const {guest} = await joinGuest();
    transport.send.mockRejectedValueOnce(new Error('notify failed'));
    await expect(service.removeParticipant(guest.id)).rejects.toThrow('notify failed');
    receive({type: 'participant-state', participant: guest});
    expect(service.participants$.value.map(item => item.id)).toEqual(['host']);
    expect(service.invitations$.value).toEqual([]);
    await expect(service.cancelInvitation('missing')).resolves.toBeUndefined();
  });

  it('rejects union results beyond the retained room limit before emitting a proposal', async () => {
    await service.createRoom(participant('host', Array.from({length: 5000}, (_, index) => `track-${index}`)));
    service.addLocalParticipant(participant('second', ['extra'], 2));
    await expect(service.prepareProposal(undefined, 'union')).rejects.toThrow('limited to 5000 tracks');
    expect(service.proposal$.value).toBeNull();
    expect(transport.send).not.toHaveBeenCalled();
  });

  it('does not publish an old presence failure into a successor room', async () => {
    const presence = deferred<void>();
    transport.touchPresence.mockReturnValueOnce(presence.promise);
    await service.createRoom(participant('old-host'));
    await service.closeRoom();
    await service.createRoom(participant('new-host'));
    presence.reject(new Error('old presence expired'));
    await Promise.resolve();
    expect(service.error$.value).toBeNull();
    expect(service.participants$.value.map(item => item.id)).toEqual(['new-host']);
  });

  it('does not let a prior room sweep release the successor room active reconciliation lock', async () => {
    const oldSweep = deferred<string[]>();
    const newSweep = deferred<string[]>();
    transport.reconcileParticipants.mockReturnValueOnce(oldSweep.promise).mockReturnValue(newSweep.promise);
    await service.createRoom(participant('old-host'));
    await vi.advanceTimersByTimeAsync(15_000);
    await service.createRoom(participant('new-host'));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(transport.reconcileParticipants).toHaveBeenCalledTimes(2);
    oldSweep.resolve([]); await oldSweep.promise;
    await vi.advanceTimersByTimeAsync(15_000);
    const callsWhileNewSweepPending = transport.reconcileParticipants.mock.calls.length;
    newSweep.resolve([]); await newSweep.promise;
    expect(callsWhileNewSweepPending).toBe(2);
  });

  it.each(['pending invitation revoke', 'explicit participant removal'])('rejects delayed completion after guest permission withdrawal: %s', async removal => {
    await service.createRoom(participant('host'));
    const {invitation, guest} = await joinGuest();
    const acknowledgement = deferred<void>();
    let finishRemoval: Promise<void>;
    if (removal === 'pending invitation revoke') {
      transport.revokeInvitation.mockReturnValue(acknowledgement.promise);
      finishRemoval = service.cancelInvitation(invitation.id);
    } else {
      finishRemoval = service.removeParticipant(guest.id);
    }
    receive({type: 'participant-tracks-complete', participant: {...guest, tracks: []}, total: 0});
    const idsAfterLateCompletion = service.participants$.value.map(item => item.id);
    acknowledgement.resolve(); await finishRemoval;
    expect(idsAfterLateCompletion).toEqual(['host']);
    expect(service.participants$.value.map(item => item.id)).toEqual(['host']);
    expect(service.canPrepareResult()).toBe(false);
  });

  it('accepts a legitimate invited empty playlist completion without inventing lost chunks', async () => {
    await service.createRoom(participant('host'));
    const {guest} = await joinGuest();
    receive({type: 'participant-state', participant: {...guest, status: 'loading', tracks: []}});
    receive({type: 'participant-tracks-complete', participant: {...guest, tracks: []}, total: 0});
    expect(service.participants$.value.find(item => item.id === guest.id)).toMatchObject({status: 'ready', tracks: []});
    expect(service.getReadyParticipants().map(item => item.id)).toEqual(['host', 'guest']);
    const proposal = await service.prepareProposal();
    expect(proposal).toBeNull();
  });

  it('reports a current room presence failure and resumes successful presence on the next interval', async () => {
    transport.touchPresence.mockRejectedValueOnce(new Error('presence unavailable'));
    await service.createRoom(participant('host'));
    expect(service.error$.value).toBe('presence unavailable');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(transport.touchPresence).toHaveBeenCalledTimes(2);
    expect(transport.reconcileParticipants).toHaveBeenCalledOnce();
    expect(service.participants$.value.map(item => item.id)).toEqual(['host']);
  });

  it('retries the next room sweep after a current reconciliation failure', async () => {
    transport.reconcileParticipants.mockRejectedValueOnce(new Error('sweep unavailable'));
    await service.createRoom(participant('host'));
    await vi.advanceTimersByTimeAsync(15_000);
    expect(service.error$.value).toBe('sweep unavailable');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(transport.reconcileParticipants).toHaveBeenCalledTimes(2);
    expect(service.participants$.value.map(item => item.id)).toEqual(['host']);
  });

  it('does not report a rejected old sweep in the successor room', async () => {
    const sweep = deferred<string[]>();
    transport.reconcileParticipants.mockReturnValueOnce(sweep.promise);
    await service.createRoom(participant('old-host'));
    await vi.advanceTimersByTimeAsync(15_000);
    await service.createRoom(participant('new-host'));
    sweep.reject(new Error('obsolete sweep failure'));
    await vi.advanceTimersByTimeAsync(0);
    expect(service.error$.value).toBeNull();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(transport.reconcileParticipants).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('owns a rejected guest approval delivery error across room replacement: %s', async replaceRoom => {
    await service.createRoom(participant('host'));
    const {guest} = await joinGuest();
    const proposal = (await service.prepareProposal())!;
    const delivery = deferred<void>();
    transport.sendCreation.mockReturnValueOnce(delivery.promise);
    receive({type: 'proposal-approval', participantId: guest.id, proposalId: proposal.id, contentHash: proposal.contentHash});
    if (replaceRoom) await service.createRoom(participant('new-host'));
    delivery.reject(new Error('guest delivery unavailable'));
    await vi.advanceTimersByTimeAsync(0);
    expect(service.error$.value).toBe(replaceRoom ? null : 'guest delivery unavailable');
    expect(transport.sendCreation).toHaveBeenCalledOnce();
  });

  it('keeps a failed unclaimed revocation locally removed and permits a new invitation', async () => {
    await service.createRoom(participant('host'));
    const invitation = await service.addInvitation();
    transport.revokeInvitation.mockRejectedValueOnce(new Error('remote revoke unavailable'));
    await expect(service.cancelInvitation(invitation.id)).rejects.toThrow('remote revoke unavailable');
    expect(service.invitations$.value).toEqual([]);
    expect(service.participants$.value.map(item => item.id)).toEqual(['host']);
    expect(transport.send).not.toHaveBeenCalled();
    const retry = await service.addInvitation();
    expect(service.invitations$.value.map(item => item.id)).toEqual([retry.id]);
    expect(retry.id).not.toBe(invitation.id);
    await service.cancelInvitation(retry.id);
    expect(service.invitations$.value).toEqual([]);
  });

  it('ignores an unknown departure and accepts a reasonless cancellation without manufacturing an error', async () => {
    await service.createRoom();
    receive({type: 'participant-left', participantId: 'unknown', reason: 'disconnected'});
    receive({type: 'merge-proposal-cancelled'});
    expect(service.error$.value).toBeNull();
    expect(service.participants$.value).toEqual([]);
  });

  it.each([{}, {default: {}}])('rejects a lazy QR module that cannot render invitation images: %j', module => {
    expect(() => resolveQrCodeApi(module)).toThrow('QR code generator failed to load.');
  });

});
