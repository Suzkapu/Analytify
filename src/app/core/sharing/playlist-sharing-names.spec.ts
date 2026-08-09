import {sharedPlaylistName, sharedPlaylistSpotifyName} from './playlist-sharing-names';

describe('playlist sharing names', () => {
  it('identifies the owner in the recipient-facing playlist name', () => {
    expect(sharedPlaylistName('Party songs', 'Simon')).toBe('Party songs · from Simon');
    expect(sharedPlaylistSpotifyName('Party songs', 'Simon')).toBe('Party songs · from Simon');
  });

  it('keeps the owner suffix when a Spotify playlist name must be shortened', () => {
    const name = sharedPlaylistSpotifyName('A'.repeat(100), 'Simon');

    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.endsWith(' · from Simon')).toBeTrue();
    expect(name).toContain('…');
  });
});
