import { describe, expect, it, vi } from "vitest";
import { BehaviorSubject } from 'rxjs';
import { CompareRoomShellComponent } from './compare-room-shell.component';

describe('CompareRoomShellComponent', () => {
    it('creates a logged-in host room at a mobile viewport width', async () => {
        const coordinator = {
            participants$: new BehaviorSubject<any[]>([]),
            invitations$: new BehaviorSubject<any[]>([]),
            sharedTracks$: new BehaviorSubject<any[]>([]),
            proposal$: new BehaviorSubject<any>(null),
            error$: new BehaviorSubject<string>(''),
            createRoom: vi.fn().mockName('createRoom').mockResolvedValue(undefined),
            addInvitation: vi.fn().mockName('addInvitation').mockResolvedValue(undefined)
        };
        const auth = {
            isAuthenticated: vi.fn().mockName('isAuthenticated').mockReturnValue(true),
            isTokenExpired: vi.fn().mockName('isTokenExpired').mockReturnValue(false),
            getAccessToken: vi.fn().mockName('getAccessToken').mockReturnValue('host-token'),
            getUserId: vi.fn().mockName('getUserId').mockReturnValue('host-user'),
            getSupabaseUserId: vi.fn().mockName('getSupabaseUserId').mockReturnValue('supabase-user')
        };
        const source = {
            loadMainPlaylists: vi.fn().mockName('loadMainPlaylists').mockResolvedValue([])
        };
        const spotify = { getProfile: vi.fn().mockName('getProfile') };
        const storage = { getItem: vi.fn().mockName('getItem').mockReturnValue(null) };
        const supabase = { loadUserProfile: vi.fn().mockName('loadUserProfile').mockResolvedValue({
                spotify_id: 'host-user',
                display_name: 'Mobile host',
                profile_pic_url: null
            }) };
        const router = { navigate: vi.fn().mockName('navigate').mockResolvedValue(true) };
        const originalWidth = window.innerWidth;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });

        try {
            const component = new CompareRoomShellComponent(coordinator as any, auth as any, source as any, spotify as any, router as any, storage as any, supabase as any);

            await component.ngOnInit();

            expect(coordinator.createRoom).toHaveBeenCalledWith(expect.objectContaining({
                spotifyUserId: 'host-user',
                displayName: 'Mobile host',
                isMainProfile: true
            }));
            expect(source.loadMainPlaylists).toHaveBeenCalledWith('host-token', 'host-user');
            expect(spotify.getProfile).not.toHaveBeenCalled();
            expect(coordinator.addInvitation).toHaveBeenCalledTimes(1);
            expect(component.isStarting).toBe(false);
        }
        finally {
            Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
        }
    });

    it('retries only the failed host playlist with the same proposal operation', async () => {
        const failedHost = {
            id: 'host-participant', spotifyUserId: 'host-user', displayName: 'Host', imageUrl: '',
            status: 'error', tracks: [], isMainProfile: true,
            result: {success: false, playlistName: 'Shared', addedTracks: 100, error: 'Batch failed'}
        };
        const successfulGuest = {
            id: 'guest', spotifyUserId: 'guest-user', displayName: 'Guest', imageUrl: '',
            status: 'complete', tracks: [], result: {success: true, playlistName: 'Shared', addedTracks: 150}
        };
        const setLocalSaveResult = vi.fn().mockName('setLocalSaveResult');
        const coordinator = {
            participants$: new BehaviorSubject<any[]>([failedHost, successfulGuest]),
            invitations$: new BehaviorSubject<any[]>([]), sharedTracks$: new BehaviorSubject<any[]>([]),
            proposal$: new BehaviorSubject<any>(null), error$: new BehaviorSubject<string>(''),
            currentRoomId: 'room-id', setLocalSaveResult
        };
        const auth = {
            isAuthenticated: () => true, isTokenExpired: () => false,
            getAccessToken: () => 'host-token'
        };
        const createPlaylist = vi.fn().mockName('createPlaylist').mockResolvedValue({
            success: true, playlistName: 'Shared', playlistId: 'same-playlist', addedTracks: 150
        });
        const component = new CompareRoomShellComponent(
            coordinator as any, auth as any, {} as any, {createPlaylist} as any,
            {} as any, {} as any, {} as any
        );
        component.participants = [failedHost as any, successfulGuest as any];
        component.proposal = {
            id: 'proposal-id', contentHash: 'content-hash', name: 'Shared', description: 'Description',
            descriptionsByParticipant: {}, tracks: [], trackCount: 0, mode: 'union', participantStats: [],
            participantNames: ['Host', 'Guest']
        };

        await component.retryMainPlaylist();

        expect(createPlaylist).toHaveBeenCalledTimes(1);
        expect(createPlaylist.mock.calls[0][4]).toEqual({
            operationId: 'compare:room-id:proposal-id:host-user',
            accountId: 'host-user', fingerprint: 'content-hash'
        });
        expect(setLocalSaveResult).toHaveBeenCalledWith('host-participant', expect.objectContaining({success: true}));
        expect(successfulGuest.result.success).toBe(true);
    });
});
