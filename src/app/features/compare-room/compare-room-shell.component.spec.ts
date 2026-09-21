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
            createRoom: vi.fn().mockName('createRoom').mockImplementation(async (participant: any) => {
                coordinator.participants$.next(participant ? [participant] : []);
            }),
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
                spotify_id: 'personal:supabase-user',
                verified_spotify_id: 'host-user',
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
            expect(source.loadMainPlaylists).not.toHaveBeenCalled();
            await component.loadMainPlaylistChoices();
            expect(source.loadMainPlaylists).toHaveBeenCalledWith('host-token', 'host-user');
            expect(spotify.getProfile).not.toHaveBeenCalled();
            expect(coordinator.addInvitation).toHaveBeenCalledTimes(1);
            expect(component.isStarting).toBe(false);
        }
        finally {
            Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
        }
    });

    it('turns an invite into another local playlist group for the same account', async () => {
        const host = {
            id: 'host-one', spotifyUserId: 'same-account', displayName: 'Host', imageUrl: '',
            status: 'selecting', tracks: [], isMainProfile: true, localSlotNumber: 1
        };
        const cancelInvitation = vi.fn().mockResolvedValue(undefined);
        const addLocalParticipant = vi.fn();
        const coordinator = {
            participants$: new BehaviorSubject<any[]>([host]), invitations$: new BehaviorSubject<any[]>([]),
            sharedTracks$: new BehaviorSubject<any[]>([]), proposal$: new BehaviorSubject<any>(null),
            error$: new BehaviorSubject<string>(''), cancelInvitation, addLocalParticipant
        };
        const auth = {isAuthenticated: () => true};
        const component = new CompareRoomShellComponent(
            coordinator as any, auth as any, {} as any, {} as any, {} as any, {} as any, {} as any
        );
        component.participants = [host as any];
        const invitation = {id: 'invite', secret: 'secret', joinUrl: 'https://example.test', qrDataUrl: ''};

        await component.joinInvitationYourself(invitation as any);

        expect(cancelInvitation).toHaveBeenCalledWith('invite');
        expect(addLocalParticipant).toHaveBeenCalledWith(expect.objectContaining({
            spotifyUserId: 'same-account', isMainProfile: true, localSlotNumber: 2, status: 'selecting'
        }));
    });

    it('reuses a removed local group number instead of duplicating an existing number', async () => {
        const groups = [
            {id: 'one', spotifyUserId: 'same-account', displayName: 'Host', imageUrl: '', status: 'ready', tracks: [], isMainProfile: true, localSlotNumber: 1},
            {id: 'three', spotifyUserId: 'same-account', displayName: 'Host', imageUrl: '', status: 'selecting', tracks: [], isMainProfile: true, localSlotNumber: 3}
        ];
        const addLocalParticipant = vi.fn();
        const coordinator = {
            participants$: new BehaviorSubject<any[]>(groups), invitations$: new BehaviorSubject<any[]>([]),
            sharedTracks$: new BehaviorSubject<any[]>([]), proposal$: new BehaviorSubject<any>(null),
            error$: new BehaviorSubject<string>(''), cancelInvitation: vi.fn().mockResolvedValue(undefined),
            addLocalParticipant
        };
        const component = new CompareRoomShellComponent(
            coordinator as any, {isAuthenticated: () => true} as any, {} as any, {} as any,
            {} as any, {} as any, {} as any
        );
        component.participants = groups as any;

        await component.joinInvitationYourself({
            id: 'replacement', secret: 'secret', joinUrl: 'https://example.test', qrDataUrl: ''
        });

        expect(addLocalParticipant).toHaveBeenCalledWith(expect.objectContaining({localSlotNumber: 2}));
    });

    it('creates one Spotify result for repeated local slots and completes every local card', async () => {
        const slots = [
            {id: 'slot-one', spotifyUserId: 'host-user', displayName: 'Host', imageUrl: '', status: 'saving', tracks: [], isMainProfile: true},
            {id: 'slot-two', spotifyUserId: 'host-user', displayName: 'Host', imageUrl: '', status: 'saving', tracks: [], isMainProfile: true}
        ];
        const setLocalSaveResult = vi.fn();
        const coordinator = {
            participants$: new BehaviorSubject<any[]>(slots), invitations$: new BehaviorSubject<any[]>([]),
            sharedTracks$: new BehaviorSubject<any[]>([]), proposal$: new BehaviorSubject<any>(null),
            error$: new BehaviorSubject<string>(''), currentRoomId: 'room-id', setLocalSaveResult,
            executeProposal: vi.fn().mockResolvedValue(undefined)
        };
        const auth = {
            isAuthenticated: () => true, isTokenExpired: () => false,
            getAccessToken: () => 'host-token'
        };
        const createPlaylist = vi.fn().mockResolvedValue({
            success: true, playlistName: 'Compared', playlistId: 'result', addedTracks: 3
        });
        const component = new CompareRoomShellComponent(
            coordinator as any, auth as any, {} as any, {createPlaylist} as any,
            {} as any, {} as any, {} as any
        );
        component.participants = slots as any;
        component.proposal = {
            id: 'proposal', contentHash: 'hash', name: 'Compared', description: 'Groups',
            tracks: [], trackCount: 0, participantNames: ['Host', 'Host']
        };

        await component.execute();

        expect(createPlaylist).toHaveBeenCalledTimes(1);
        expect(setLocalSaveResult.mock.calls.map(call => call[0])).toEqual(['slot-one', 'slot-two']);
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

    it('adds, deduplicates, selects and removes a linked public playlist for one local group', async () => {
        const host = {
            id: 'host', spotifyUserId: 'host-user', displayName: 'Host', imageUrl: '',
            status: 'selecting', tracks: [], isMainProfile: true, localSlotNumber: 1
        };
        const coordinator = {
            participants$: new BehaviorSubject<any[]>([host]), invitations$: new BehaviorSubject<any[]>([]),
            sharedTracks$: new BehaviorSubject<any[]>([]), proposal$: new BehaviorSubject<any>(null),
            error$: new BehaviorSubject<string>('')
        };
        const auth = {
            isAuthenticated: () => true, isTokenExpired: () => false,
            getAccessToken: () => 'host-token', getUserId: () => 'host-user'
        };
        const linked = {
            id: '37i9dQZF1DXcBWIGoYBM5M', name: 'Public mix', imageUrl: '', total: 20,
            ownerName: 'Curator', isPublicLink: true
        };
        const spotify = {getPublicPlaylist: vi.fn().mockResolvedValue(linked)};
        const component = new CompareRoomShellComponent(
            coordinator as any, auth as any, {} as any, spotify as any, {} as any, {} as any, {} as any
        );
        component.participants = [host as any];
        component.mainPlaylistsLoaded = true;
        component.setPublicPlaylistReference('host', 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M');

        await component.addPublicPlaylist('host');
        component.setPublicPlaylistReference('host', 'spotify:playlist:37i9dQZF1DXcBWIGoYBM5M');
        await component.addPublicPlaylist('host');

        expect(component.availableMainPlaylists('host')).toEqual([linked]);
        expect(component.mainSelectionIds('host')).toEqual([linked.id]);
        expect(spotify.getPublicPlaylist).toHaveBeenCalledTimes(2);

        component.removePublicPlaylist('host', linked.id);
        expect(component.availableMainPlaylists('host')).toEqual([]);
        expect(component.mainSelectionIds('host')).toEqual([]);
    });
});
