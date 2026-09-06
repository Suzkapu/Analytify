import {openSpotifyUrl, sanitizeSpotifyUrl} from './spotify-url';

describe('Spotify URL navigation', () => {
  it('allows exact HTTPS Spotify entity URLs', () => {
    expect(sanitizeSpotifyUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', 'track'))
      .toBe('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
    expect(sanitizeSpotifyUrl('https://open.spotify.com/intl-de/artist/06HL4z0CvFAxyc27GXpf02?si=test', 'artist'))
      .toBe('https://open.spotify.com/intl-de/artist/06HL4z0CvFAxyc27GXpf02?si=test');
  });

  it('rejects script, data, HTTP, credential, spoofed, encoded-host, and mismatched URLs', () => {
    const blocked = [
      'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>',
      'http://open.spotify.com/track/abc', 'https://user:pass@open.spotify.com/track/abc',
      'https://open.spotify.com.attacker.test/track/abc', 'https://open.spotify.com@attacker.test/track/abc',
      'https://open%2Espotify.com/track/abc', 'https://open.spotify.com.evil/track/abc'
    ];
    blocked.forEach(url => expect(sanitizeSpotifyUrl(url)).withContext(url).toBeNull());
    expect(sanitizeSpotifyUrl('https://open.spotify.com/artist/abc', 'track')).toBeNull();
  });

  it('never invokes browser navigation for rejected stored values', () => {
    const fakeWindow = {
      location: {assign: jasmine.createSpy('assign')},
      open: jasmine.createSpy('open')
    };
    expect(openSpotifyUrl('javascript:alert(1)', {expectedType: 'track'}, fakeWindow)).toBeFalse();
    expect(fakeWindow.location.assign).not.toHaveBeenCalled();
    expect(fakeWindow.open).not.toHaveBeenCalled();
    expect(openSpotifyUrl('https://open.spotify.com/track/abc', {expectedType: 'track'}, fakeWindow)).toBeTrue();
    expect(fakeWindow.open).toHaveBeenCalledWith(
      'https://open.spotify.com/track/abc', '_blank', 'noopener,noreferrer'
    );
  });
});
