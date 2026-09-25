import { describe, expect, it } from "vitest";
import { COMPARE_ROOM_SPOTIFY_SCOPES, HOSTED_SPOTIFY_SCOPES, PLAYLIST_WRITE_SPOTIFY_SCOPES } from './spotify-scopes';

describe('Spotify OAuth scope policy', () => {
    it('keeps the hosted application on the reviewed least-privilege scope set', () => {
        expect(HOSTED_SPOTIFY_SCOPES).toEqual([
            'user-read-private',
            'playlist-read-private',
            'playlist-read-collaborative',
            'user-library-read',
            'user-top-read',
            'user-read-recently-played'
        ]);
        expect(PLAYLIST_WRITE_SPOTIFY_SCOPES).toEqual(['playlist-modify-private']);
        expect(HOSTED_SPOTIFY_SCOPES as readonly string[]).not.toContain('playlist-modify-private');
        expect(HOSTED_SPOTIFY_SCOPES as readonly string[]).not.toContain('playlist-modify-public');
        expect(HOSTED_SPOTIFY_SCOPES as readonly string[]).toContain('user-top-read');
        expect(HOSTED_SPOTIFY_SCOPES as readonly string[]).toContain('user-read-recently-played');
    });

    it('does not grant temporary Compare Room sessions access to listening history or top items', () => {
        expect(COMPARE_ROOM_SPOTIFY_SCOPES).toEqual([
            'user-read-private',
            'user-library-read',
            'playlist-read-private',
            'playlist-read-collaborative',
            'playlist-modify-private'
        ]);
        expect(COMPARE_ROOM_SPOTIFY_SCOPES as readonly string[]).not.toContain('user-top-read');
        expect(COMPARE_ROOM_SPOTIFY_SCOPES as readonly string[]).not.toContain('user-read-recently-played');
        expect(COMPARE_ROOM_SPOTIFY_SCOPES as readonly string[]).not.toContain('playlist-modify-public');
    });
});
