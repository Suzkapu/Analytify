import {TestBed} from '@angular/core/testing';
import {SpotifyNavigationService} from './spotify-navigation.service';

describe('SpotifyNavigationService', () => {
  let service: SpotifyNavigationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SpotifyNavigationService]
    });
    service = TestBed.inject(SpotifyNavigationService);
  });

  describe('URL validation & sanitization', () => {
    it('accepts valid HTTPS open.spotify.com track, artist, album, and playlist URLs', () => {
      const validUrls = [
        'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=1234567890abcdef',
        'https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT',
        'https://open.spotify.com/intl-pt-br/track/4cOdK2wGLETKBW3PvgPWqT',
        'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02',
        'https://open.spotify.com/album/41Mn1tkAUW0aSm5ZsVkx6Z',
        'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M',
        'https://open.spotify.com/user/spotify_user_123',
        'https://open.spotify.com/episode/7makk4oTQel546B0PZlDM5',
        'https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk'
      ];

      for (const url of validUrls) {
        expect(service.isValidSpotifyUrl(url)).toBeTrue();
        expect(service.sanitizeSpotifyUrl(url)).toBeTruthy();
      }
    });

    it('rejects script execution schemes (javascript:, vbscript:)', () => {
      const scriptUrls = [
        'javascript:alert(1)',
        'javascript:alert(document.cookie)',
        'JAVASCRIPT:alert(1)',
        'javascript:void(0)',
        'javascript:window.location="http://evil.com"',
        'vbscript:msgbox(1)'
      ];

      for (const url of scriptUrls) {
        expect(service.isValidSpotifyUrl(url)).toBeFalse();
        expect(service.sanitizeSpotifyUrl(url)).toBeNull();
      }
    });

    it('rejects data: URLs', () => {
      const dataUrls = [
        'data:text/html,<script>alert(1)</script>',
        'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        'data:application/javascript;base64,YWxlcnQoMSk='
      ];

      for (const url of dataUrls) {
        expect(service.isValidSpotifyUrl(url)).toBeFalse();
        expect(service.sanitizeSpotifyUrl(url)).toBeNull();
      }
    });

    it('rejects unencrypted HTTP URLs', () => {
      const httpUrls = [
        'http://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        'http://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02'
      ];

      for (const url of httpUrls) {
        expect(service.isValidSpotifyUrl(url)).toBeFalse();
        expect(service.sanitizeSpotifyUrl(url)).toBeNull();
      }
    });

    it('rejects credential-bearing URLs', () => {
      const credentialUrls = [
        'https://user:password@open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        'https://open.spotify.com:secret@attacker.com/track/123',
        'https://open.spotify.com@evil.com/track/4cOdK2wGLETKBW3PvgPWqT',
        'https://attacker@open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'
      ];

      for (const url of credentialUrls) {
        expect(service.isValidSpotifyUrl(url)).toBeFalse();
        expect(service.sanitizeSpotifyUrl(url)).toBeNull();
      }
    });

    it('rejects spoofed and unauthorized hostnames', () => {
      const spoofedUrls = [
        'https://open.spotify.com.attacker.com/track/4cOdK2wGLETKBW3PvgPWqT',
        'https://attacker.com/open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        'https://fake-spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        'https://spotify.evil.com/track/4cOdK2wGLETKBW3PvgPWqT',
        'https://notopen.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'
      ];

      for (const url of spoofedUrls) {
        expect(service.isValidSpotifyUrl(url)).toBeFalse();
        expect(service.sanitizeSpotifyUrl(url)).toBeNull();
      }
    });

    it('rejects percent-encoded host characters', () => {
      const encodedHostUrls = [
        'https://open%2Espotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
        'https://open.spotify%2Ecom/track/4cOdK2wGLETKBW3PvgPWqT',
        'https://%6f%70%65%6e%2e%73%70%6f%74%69%66%79%2e%63%6f%6d/track/123'
      ];

      for (const url of encodedHostUrls) {
        expect(service.isValidSpotifyUrl(url)).toBeFalse();
        expect(service.sanitizeSpotifyUrl(url)).toBeNull();
      }
    });

    it('rejects backslashes, whitespace, and control characters', () => {
      const malformedUrls = [
        'https://open.spotify.com\\@evil.com/track/123',
        'https://open.spotify.com/track/123\r\n',
        'https://open.spotify.com/track/123 456',
        'https://open.spotify.com/track/123\x00'
      ];

      for (const url of malformedUrls) {
        expect(service.isValidSpotifyUrl(url)).toBeFalse();
        expect(service.sanitizeSpotifyUrl(url)).toBeNull();
      }
    });

    it('enforces expected entity type when specified', () => {
      const trackUrl = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
      const artistUrl = 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02';

      expect(service.isValidSpotifyUrl(trackUrl, 'track')).toBeTrue();
      expect(service.isValidSpotifyUrl(trackUrl, 'artist')).toBeFalse();

      expect(service.isValidSpotifyUrl(artistUrl, 'artist')).toBeTrue();
      expect(service.isValidSpotifyUrl(artistUrl, 'track')).toBeFalse();
    });

    it('rejects null, undefined, and non-string inputs safely', () => {
      expect(service.isValidSpotifyUrl(null)).toBeFalse();
      expect(service.isValidSpotifyUrl(undefined)).toBeFalse();
      expect(service.isValidSpotifyUrl(12345 as any)).toBeFalse();
      expect(service.isValidSpotifyUrl({} as any)).toBeFalse();
    });
  });

  describe('Centralized navigation', () => {
    let openSpy: jasmine.Spy;
    let assignSpy: jasmine.Spy;

    beforeEach(() => {
      openSpy = spyOn(window, 'open').and.stub();
      assignSpy = spyOn(service as any, 'navigateLocation').and.stub();
      spyOn(console, 'warn').and.stub();
    });

    it('navigates valid URLs via window.open with noopener and noreferrer', () => {
      const validUrl = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
      const navigated = service.openTrack(validUrl);

      expect(navigated).toBeTrue();
      expect(openSpy).toHaveBeenCalledWith(
        jasmine.stringMatching(/^https:\/\/open\.spotify\.com\/track\/4cOdK2wGLETKBW3PvgPWqT/),
        '_blank',
        'noopener,noreferrer'
      );
      expect(assignSpy).not.toHaveBeenCalled();
    });

    it('navigates valid URLs to _self when explicitly requested', () => {
      const validUrl = 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02';
      const navigated = service.openArtist(validUrl, '_self');

      expect(navigated).toBeTrue();
      expect(assignSpy).toHaveBeenCalledWith(
        jasmine.stringMatching(/^https:\/\/open\.spotify\.com\/artist\/06HL4z0CvFAxyc27GXpf02/)
      );
      expect(openSpy).not.toHaveBeenCalled();
    });

    it('refuses navigation and warns on invalid or malicious URLs', () => {
      const maliciousUrls = [
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
        'http://open.spotify.com/track/123',
        'https://open.spotify.com.evil.com/track/123'
      ];

      for (const badUrl of maliciousUrls) {
        const navigated = service.openTrack(badUrl);
        expect(navigated).toBeFalse();
      }

      expect(openSpy).not.toHaveBeenCalled();
      expect(assignSpy).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
    });
  });

  describe('DTO / Object sanitizers', () => {
    it('extracts and sanitizes track URLs', () => {
      const validTrack = {
        name: 'Song',
        external_urls: {spotify: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'}
      };
      const maliciousTrack = {
        name: 'Song',
        external_urls: {spotify: 'javascript:alert(1)'}
      };

      expect(service.getTrackUrl(validTrack)).toContain('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
      expect(service.getTrackUrl(maliciousTrack)).toBeNull();
      expect(service.getTrackUrl(null)).toBeNull();
    });

    it('extracts and sanitizes artist URLs', () => {
      const validArtist = {
        name: 'Artist',
        spotifyUrl: 'https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02'
      };
      const maliciousArtist = {
        name: 'Artist',
        spotifyUrl: 'https://evil.com/artist/123'
      };

      expect(service.getArtistUrl(validArtist)).toContain('https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02');
      expect(service.getArtistUrl(maliciousArtist)).toBeNull();
    });
  });
});
