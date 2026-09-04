import {COMPARE_ROOM_SPOTIFY_SCOPES, HOSTED_SPOTIFY_SCOPES} from './spotify-scopes';

describe('Spotify OAuth scope policy', () => {
  it('keeps the hosted application on the reviewed least-privilege scope set', () => {
    expect(HOSTED_SPOTIFY_SCOPES).toEqual([
      'user-read-private',
      'user-top-read',
      'user-read-recently-played',
      'playlist-read-private',
      'playlist-read-collaborative',
      'playlist-modify-private',
      'user-library-read'
    ]);
    expect(HOSTED_SPOTIFY_SCOPES as readonly string[]).not.toContain('playlist-modify-public');
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
