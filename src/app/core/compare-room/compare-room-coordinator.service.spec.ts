import { describe, expect, it, vi } from "vitest";
import { CompareParticipant, ComparePlaylist, CompareTrack } from './compare-room.models';
import { CompareRoomCoordinatorService, resolveQrCodeApi } from './compare-room-coordinator.service';
import { PlaylistIntersectionService } from './playlist-intersection.service';

describe('CompareRoomCoordinatorService', () => {
    it('removes a departed guest, frees the claimed invitation, and invalidates the proposal with a reason', () => {
        const transport = { send: vi.fn().mockName('send').mockResolvedValue(undefined) };
        const coordinator = new CompareRoomCoordinatorService(transport as any, new PlaylistIntersectionService());
        const guest = participant('guest', 'Guest', [playlist('guest')], ['a']);
        coordinator.participants$.next([participant('host', 'Host', [playlist('host')], ['a']), guest]);
        coordinator.invitations$.next([{
            id: 'guest-invite', secret: 'secret', joinUrl: 'https://example.com/join', qrDataUrl: '', claimedBy: guest.id
        }]);
        coordinator.proposal$.next({
            id: 'proposal', contentHash: 'a'.repeat(64), name: 'Shared', description: '', tracks: [track('a')],
            trackCount: 1, participantNames: ['Host', 'Guest']
        });
        (coordinator as any).acceptedParticipantIds.add(guest.id);

        (coordinator as any).handleMessage({
            type: 'participant-left', participantId: guest.id, reason: 'disconnected'
        });

        expect(coordinator.participants$.value.map(item => item.id)).toEqual(['host']);
        expect(coordinator.invitations$.value).toEqual([]);
        expect(coordinator.proposal$.value).toBeNull();
        expect(coordinator.error$.value).toBe('Guest disconnected. The playlist proposal was cancelled.');
        expect(transport.send).not.toHaveBeenCalled();
    });

    it('reconciles stale guests without overlapping host sweeps', async () => {
        let release!: (ids: string[]) => void;
        const transport = {
            reconcileParticipants: vi.fn().mockName('reconcileParticipants').mockReturnValue(
                new Promise<string[]>(resolve => release = resolve)
            )
        };
        const coordinator = new CompareRoomCoordinatorService(transport as any, new PlaylistIntersectionService());

        const first = (coordinator as any).reconcileParticipants();
        const second = (coordinator as any).reconcileParticipants();
        release([]);
        await Promise.all([first, second]);

        expect(transport.reconcileParticipants).toHaveBeenCalledTimes(1);
    });

    it('resolves QR generation from both ESM and CommonJS lazy-import shapes', () => {
        const toDataURL = vi.fn().mockName('toDataURL');

        expect(resolveQrCodeApi({ toDataURL } as any).toDataURL).toBe(toDataURL);
        expect(resolveQrCodeApi({ default: { toDataURL } } as any).toDataURL).toBe(toDataURL);
    });

    it('lets the host cancel a claimed join before the participant finishes joining', async () => {
        const transport = {
            send: vi.fn().mockName('send').mockResolvedValue(undefined),
            revokeInvitation: vi.fn().mockName('revokeInvitation').mockResolvedValue(undefined)
        };
        const coordinator = new CompareRoomCoordinatorService(transport as any, { intersect: vi.fn().mockName('intersect') } as any);
        const lateParticipant: CompareParticipant = {
            id: 'joining-guest',
            spotifyUserId: 'guest-user',
            displayName: 'Joining guest',
            imageUrl: '',
            status: 'selecting',
            tracks: []
        };

        coordinator.invitations$.next([{
                id: 'claimed-invite',
                secret: 'secret',
                joinUrl: 'https://example.com/join',
                qrDataUrl: 'data:image/png;base64,qr',
                claimedBy: lateParticipant.id
            }]);
        (coordinator as any).acceptedParticipantIds.add(lateParticipant.id);

        await coordinator.cancelInvitation('claimed-invite');

        expect(coordinator.invitations$.value).toEqual([]);
        expect(transport.send).toHaveBeenCalledWith({
            type: 'remove-participant',
            participantId: lateParticipant.id
        });

        // A delayed guest state must not recreate the participant after cancellation.
        (coordinator as any).handleMessage({ type: 'participant-state', participant: lateParticipant });
        expect(coordinator.participants$.value).toEqual([]);
    });

    it('defaults to shared songs and builds personal contribution stats for both merge modes', async () => {
        const transport = { send: vi.fn().mockName('send').mockResolvedValue(undefined) };
        const coordinator = new CompareRoomCoordinatorService(transport as any, new PlaylistIntersectionService());
        const firstPlaylist = playlist('first');
        const secondPlaylist = playlist('second');
        coordinator.participants$.next([
            participant('host', 'Host', [firstPlaylist, secondPlaylist], ['a', 'b', 'c']),
            participant('guest', 'Guest', [playlist('guest')], ['b', 'c', 'd'])
        ]);

        const sharedProposal = await coordinator.prepareProposal();

        expect(sharedProposal?.mode).toBe('intersection');
        expect(sharedProposal?.tracks.map(track => track.id)).toEqual(['b', 'c']);
        expect(sharedProposal?.participantStats?.[0]).toEqual(expect.objectContaining({
            selectedPlaylistCount: 2,
            selectedTrackCount: 3,
            includedTrackCount: 2,
            includedPercentage: 67
        }));
        expect(sharedProposal?.descriptionsByParticipant?.['host']).toContain('2 of 3 unique usable tracks');
        expect(sharedProposal?.descriptionsByParticipant?.['host']).toContain('(67%)');

        const unionProposal = await coordinator.prepareProposal(undefined, 'union');

        expect(unionProposal?.tracks.map(track => track.id)).toEqual(['a', 'b', 'c', 'd']);
        expect(unionProposal?.participantStats?.every(stats => stats.includedPercentage === 100)).toBe(true);
        expect(unionProposal?.descriptionsByParticipant?.['guest']).toContain('All-songs merge');
    });

    function participant(id: string, displayName: string, playlists: ComparePlaylist[], trackIds: string[]): CompareParticipant {
        return {
            id,
            spotifyUserId: `${id}-spotify`,
            displayName,
            imageUrl: '',
            status: 'ready',
            playlist: playlists[0],
            playlists,
            tracks: trackIds.map(track)
        };
    }

    function playlist(id: string): ComparePlaylist {
        return { id, name: id, imageUrl: '', total: 3, ownerName: '' };
    }

    function track(id: string): CompareTrack {
        return {
            id,
            uri: `spotify:track:${id}`,
            name: id,
            artists: [{ id: 'artist', name: 'Artist' }],
            albumName: '',
            imageUrl: '',
            spotifyUrl: '',
            playlistIndex: 1
        };
    }
});
