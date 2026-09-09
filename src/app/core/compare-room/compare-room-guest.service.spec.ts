import { describe, expect, it, vi } from "vitest";
import { CompareRoomGuestService } from './compare-room-guest.service';
import { proposalContentHash } from './compare-room-integrity';
import { CompareMergeProposal, CompareTrack } from './compare-room.models';

describe('CompareRoomGuestService', () => {
    it('publishes an explicit leave before disconnecting', async () => {
        const transport = {
            leaveRoom: vi.fn().mockName('leaveRoom').mockResolvedValue(undefined),
            disconnect: vi.fn().mockName('disconnect').mockResolvedValue(undefined)
        };
        const guest = new CompareRoomGuestService(transport as any);
        (guest as any).participantId = 'participant-123456';

        await guest.leave();

        expect(transport.leaveRoom).toHaveBeenCalledTimes(1);
        expect(transport.disconnect).toHaveBeenCalledTimes(1);
        expect(transport.leaveRoom.mock.invocationCallOrder[0]).toBeLessThan(
            transport.disconnect.mock.invocationCallOrder[0]
        );
    });

    it('keeps presence alive while connected and stops after leaving', async () => {
        vi.useFakeTimers();
        const transport = {
            claimInvitation: vi.fn().mockName('claimInvitation').mockResolvedValue(undefined),
            connect: vi.fn().mockName('connect').mockResolvedValue(undefined),
            touchPresence: vi.fn().mockName('touchPresence').mockResolvedValue(undefined),
            leaveRoom: vi.fn().mockName('leaveRoom').mockResolvedValue(undefined),
            disconnect: vi.fn().mockName('disconnect').mockResolvedValue(undefined)
        };
        const guest = new CompareRoomGuestService(transport as any);

        await guest.join('room-123456789012', 'invite-123', 'secret-long-enough-for-test');
        await vi.advanceTimersByTimeAsync(30_000);
        expect(transport.touchPresence).toHaveBeenCalled();

        await guest.leave();
        const touches = transport.touchPresence.mock.calls.length;
        await vi.advanceTimersByTimeAsync(60_000);
        expect(transport.touchPresence).toHaveBeenCalledTimes(touches);
        vi.useRealTimers();
    });

    it('invalidates a guest proposal when another participant departs', () => {
        const guest = new CompareRoomGuestService({} as any);
        const activeProposal = proposal();
        guest.proposal$.next(activeProposal);

        (guest as any).handleMessage({
            type: 'participant-left', participantId: 'another-participant', reason: 'left'
        });

        expect(guest.proposal$.value).toBeNull();
        expect(guest.error$.value).toBe('A participant left the room. The playlist proposal was cancelled.');
    });

    it('does not create a playlist when approved proposal content is substituted', async () => {
        const transport = { send: vi.fn().mockName('send').mockResolvedValue(undefined) };
        const guest = new CompareRoomGuestService(transport as any);
        const approved = proposal();
        approved.contentHash = await proposalContentHash(approved);
        const changedTrack = track('substituted');

        (guest as any).handleMessage({ type: 'create-playlist-start', proposal: { ...approved, tracks: [] } });
        (guest as any).handleMessage({ type: 'create-playlist-track-chunk', proposalId: approved.id, tracks: [changedTrack] });
        await (guest as any).commitCreateProposal(approved.id);

        expect(guest.createRequest$.value).toBeNull();
        expect(guest.error$.value).toContain('changed after you approved it');
    });

    it('rejects a replayed create commit', async () => {
        const guest = new CompareRoomGuestService({ send: vi.fn().mockName('send').mockResolvedValue(undefined) } as any);
        const approved = proposal();
        approved.contentHash = await proposalContentHash(approved);

        for (let attempt = 0; attempt < 2; attempt++) {
            (guest as any).handleMessage({ type: 'create-playlist-start', proposal: { ...approved, tracks: [] } });
            (guest as any).handleMessage({ type: 'create-playlist-track-chunk', proposalId: approved.id, tracks: approved.tracks });
            await (guest as any).commitCreateProposal(approved.id);
        }

        expect(guest.error$.value).toContain('lost or replayed');
    });

    function proposal(): CompareMergeProposal {
        return {
            id: 'proposal-secure', contentHash: '', name: 'Shared', description: 'Description',
            mode: 'intersection', tracks: [track('approved')], trackCount: 1,
            participantNames: ['Host', 'Guest']
        };
    }

    function track(id: string): CompareTrack {
        return {
            id, uri: `spotify:track:${id}`, name: id, artists: [{ id: 'artist', name: 'Artist' }],
            albumName: 'Album', imageUrl: '', spotifyUrl: '', playlistIndex: 1
        };
    }
});
