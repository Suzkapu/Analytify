import { beforeEach, describe, expect, it, vi } from "vitest";
import { CompareGuestPlaylistSourceService } from './compare-guest-playlist-source.service';
import { ComparePlaylist, CompareTrack } from './compare-room.models';

describe('CompareGuestPlaylistSourceService', () => {
    let values: Record<string, string>;
    let storage: any;
    let supabase: any;
    let spotify: any;
    let service: CompareGuestPlaylistSourceService;

    beforeEach(() => {
        values = {};
        storage = {
            initFromDB: vi.fn().mockName('initFromDB').mockResolvedValue(undefined),
            getItem: vi.fn().mockName('getItem').mockImplementation((key: string) => values[key] ?? null)
        };
        supabase = {
            client: { auth: { getSession: vi.fn().mockName('getSession').mockResolvedValue({ data: { session: null } }) } },
            loadUserProfile: vi.fn().mockName('loadUserProfile').mockResolvedValue(null),
            checkBackupActive: vi.fn().mockName('checkBackupActive').mockResolvedValue(false),
            loadUserCache: vi.fn().mockName('loadUserCache').mockResolvedValue([])
        };
        spotify = {
            getPlaylists: vi.fn().mockName("ParticipantSpotifyService.getPlaylists"),
            getPlaylistTracks: vi.fn().mockName("ParticipantSpotifyService.getPlaylistTracks"),
            normalizeCachedPlaylists: vi.fn().mockName("ParticipantSpotifyService.normalizeCachedPlaylists"),
            normalizeCachedTracks: vi.fn().mockName("ParticipantSpotifyService.normalizeCachedTracks")
        };
        spotify.normalizeCachedPlaylists.mockImplementation((playlists: any[]) => playlists.map(item => ({
            id: item.id,
            name: item.name,
            imageUrl: '',
            total: item.total || 0,
            ownerName: ''
        })));
        spotify.normalizeCachedTracks.mockImplementation((artists: any[]) => artists.flatMap(artist => artist.tracks || []).map((track: any, index: number): CompareTrack => ({
            id: track.id,
            uri: `spotify:track:${track.id}`,
            name: track.name,
            artists: [{ id: 'artist', name: 'Artist' }],
            albumName: '',
            imageUrl: '',
            spotifyUrl: '',
            playlistIndex: index + 1
        })));
        service = new CompareGuestPlaylistSourceService(storage, supabase, spotify);
    });

    it('uses a fresh device cache only when it belongs to the QR-authorized account', async () => {
        values['spotifyUserId'] = 'guest-user';
        values['guest-user_playlists'] = JSON.stringify([{ id: 'fav', name: 'Liked Songs', total: 2000 }]);
        values['guest-user_playlists_lastUpdated'] = Date.now().toString();

        const result = await service.loadPlaylists('guest-token', 'guest-user');

        expect(result.source).toBe('local');
        expect(result.playlists[0].total).toBe(2000);
        expect(spotify.getPlaylists).not.toHaveBeenCalled();
        expect(supabase.loadUserCache).not.toHaveBeenCalled();
    });

    it('loads fresh playlist tracks from the matching guest Supabase session', async () => {
        supabase.client.auth.getSession.mockResolvedValue({
            data: { session: { user: { id: 'supabase-guest', user_metadata: { provider_id: 'guest-user' } } } }
        });
        supabase.loadUserProfile.mockResolvedValue({ spotify_id: 'guest-user' });
        supabase.checkBackupActive.mockResolvedValue(true);
        supabase.loadUserCache.mockImplementation(async (_: string, keys: string[]) => {
            const rows: Array<{
                key: string;
                value: string;
            }> = [];
            if (keys.includes('guest-user_party')) {
                rows.push({ key: 'guest-user_party', value: JSON.stringify([{ tracks: [{ id: 'shared', name: 'Shared' }] }]) }, { key: 'guest-user_party_CachedTrackCount', value: '1' }, { key: 'guest-user_party_lastUpdated', value: Date.now().toString() });
            }
            return rows;
        });
        const playlist: ComparePlaylist = {
            id: 'party',
            name: 'Party',
            imageUrl: '',
            total: 1,
            ownerName: 'Guest'
        };

        const result = await service.loadTracks(playlist, 'guest-token', 'guest-user');

        expect(result.source).toBe('cloud');
        expect(result.tracks.map(track => track.id)).toEqual(['shared']);
        expect(supabase.loadUserCache).toHaveBeenCalledWith('supabase-guest', [
            'guest-user_party',
            'guest-user_party_CachedTrackCount',
            'guest-user_party_lastUpdated'
        ]);
        expect(spotify.getPlaylistTracks).not.toHaveBeenCalled();
    });

    it('does not read another Analytify account cache on the guest device', async () => {
        values['spotifyUserId'] = 'different-user';
        supabase.client.auth.getSession.mockResolvedValue({
            data: { session: { user: { id: 'different-supabase-user', user_metadata: { provider_id: 'different-user' } } } }
        });
        supabase.loadUserProfile.mockResolvedValue({ spotify_id: 'different-user' });
        spotify.getPlaylists.mockResolvedValue([{
                id: 'spotify-list',
                name: 'Spotify list',
                imageUrl: '',
                total: 10,
                ownerName: 'Guest'
            }]);

        const result = await service.loadPlaylists('guest-token', 'qr-guest');

        expect(result.source).toBe('spotify');
        expect(spotify.getPlaylists).toHaveBeenCalledWith('guest-token', 'qr-guest');
        expect(supabase.checkBackupActive).not.toHaveBeenCalled();
        expect(supabase.loadUserCache).not.toHaveBeenCalled();
    });

    it('combines multiple guest playlists without sending duplicate tracks', async () => {
        spotify.getPlaylistTracks.mockImplementation(async (playlist: ComparePlaylist) => playlist.id === 'first'
            ? [track('a'), track('shared')]
            : [track('shared'), track('b')]);

        const result = await service.loadSelection([
            { id: 'first', name: 'First', imageUrl: '', total: 2, ownerName: '' },
            { id: 'second', name: 'Second', imageUrl: '', total: 2, ownerName: '' }
        ], 'guest-token', 'guest-user');

        expect(result.source).toBe('spotify');
        expect(result.tracks.map(item => item.id)).toEqual(['a', 'shared', 'b']);
    });

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
