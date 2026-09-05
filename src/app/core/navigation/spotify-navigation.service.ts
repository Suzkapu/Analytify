import {Injectable} from '@angular/core';

export type SpotifyCatalogType =
  | 'track'
  | 'artist'
  | 'album'
  | 'playlist'
  | 'user'
  | 'collection'
  | 'show'
  | 'episode';

export interface SpotifyNavigationOptions {
  target?: '_blank' | '_self';
  expectedType?: SpotifyCatalogType;
}

const APPROVED_HOST = 'open.spotify.com';
const SPOTIFY_PATH_PATTERN =
  /^(?:\/intl-[a-z]{2}(?:-[a-z0-9]{2,4})?)?\/(track|artist|album|playlist|user|collection|show|episode)\/([A-Za-z0-9_-]+)(?:\/.*)?$/;

@Injectable({
  providedIn: 'root'
})
export class SpotifyNavigationService {
  /**
   * Strictly validates and normalizes a Spotify web URL.
   *
   * Rejects:
   * - Non-string and empty inputs
   * - Script, data, file, and pseudo-protocol URLs
   * - Unencrypted HTTP schemes
   * - Credential-bearing URLs (e.g. user:pass@host)
   * - Encoded-host and spoofed-host URLs (e.g. %2E, @evil.com, evil.com)
   * - Backslashes, whitespace, and control characters
   * - Non-standard ports
   * - Unapproved entity paths or paths with mismatched catalog types
   *
   * Returns canonical URL string if valid, otherwise null.
   */
  sanitizeSpotifyUrl(rawUrl: unknown, expectedType?: SpotifyCatalogType): string | null {
    if (typeof rawUrl !== 'string') return null;

    // Reject control characters, any whitespace, and backslashes
    if (/[\s\x00-\x1f\x7f-\x9f\\]/.test(rawUrl)) {
      return null;
    }

    const trimmed = rawUrl.trim();
    if (!trimmed) return null;

    // Reject authority trickery in the raw string before URL parsing
    const schemeSeparator = '://';
    const schemeIndex = trimmed.indexOf(schemeSeparator);
    if (schemeIndex === -1) return null;

    const scheme = trimmed.slice(0, schemeIndex).toLowerCase();
    if (scheme !== 'https') return null;

    const remainder = trimmed.slice(schemeIndex + schemeSeparator.length);
    const pathIndex = remainder.indexOf('/');
    const rawAuthority = pathIndex === -1 ? remainder : remainder.slice(0, pathIndex);

    // Authority must not contain encoded characters, userinfo delimiters, or custom ports
    if (rawAuthority.includes('%') || rawAuthority.includes('@') || rawAuthority.includes(':')) {
      return null;
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }

    // Host must match approved host exactly
    if (parsed.hostname.toLowerCase() !== APPROVED_HOST) {
      return null;
    }

    // Protocol must be strict https:
    if (parsed.protocol !== 'https:') {
      return null;
    }

    // Must not have port or credentials
    if (parsed.port || parsed.username || parsed.password) {
      return null;
    }

    // Path must match approved entity structure
    const match = parsed.pathname.match(SPOTIFY_PATH_PATTERN);
    if (!match) {
      return null;
    }

    const [, detectedType, id] = match;
    if (!id || id.length > 100) {
      return null;
    }

    if (expectedType && detectedType !== expectedType) {
      return null;
    }

    // Strip fragment entirely, preserve query parameters if any (or strip them as well)
    return `https://${APPROVED_HOST}${parsed.pathname}${parsed.search}`;
  }

  /**
   * Returns true if the given URL is a valid, safe Spotify URL.
   */
  isValidSpotifyUrl(rawUrl: unknown, expectedType?: SpotifyCatalogType): boolean {
    return this.sanitizeSpotifyUrl(rawUrl, expectedType) !== null;
  }

  /**
   * Centralized external navigation for Spotify items.
   * Enforces strict validation and opens with security flags (noopener, noreferrer).
   */
  openSpotifyUrl(rawUrl: unknown, options: SpotifyNavigationOptions = {}): boolean {
    const validatedUrl = this.sanitizeSpotifyUrl(rawUrl, options.expectedType);
    if (!validatedUrl) {
      console.warn('[SpotifyNavigation] Refused navigation to invalid or untrusted URL:', rawUrl);
      return false;
    }

    const target = options.target || '_blank';
    if (target === '_self') {
      this.navigateLocation(validatedUrl);
    } else {
      window.open(validatedUrl, '_blank', 'noopener,noreferrer');
    }
    return true;
  }

  protected navigateLocation(url: string): void {
    window.location.assign(url);
  }

  /**
   * Safe navigation for track URLs.
   */
  openTrack(urlOrTrack: unknown, target: '_blank' | '_self' = '_blank'): boolean {
    const url = typeof urlOrTrack === 'string'
      ? urlOrTrack
      : (urlOrTrack as any)?.spotifyUrl || (urlOrTrack as any)?.external_urls?.spotify;
    return this.openSpotifyUrl(url, {target, expectedType: 'track'});
  }

  /**
   * Safe navigation for artist URLs.
   */
  openArtist(urlOrArtist: unknown, target: '_blank' | '_self' = '_blank'): boolean {
    const url = typeof urlOrArtist === 'string'
      ? urlOrArtist
      : (urlOrArtist as any)?.spotifyUrl || (urlOrArtist as any)?.external_urls?.spotify;
    return this.openSpotifyUrl(url, {target, expectedType: 'artist'});
  }

  /**
   * Safe navigation for album URLs.
   */
  openAlbum(urlOrAlbum: unknown, target: '_blank' | '_self' = '_blank'): boolean {
    const url = typeof urlOrAlbum === 'string'
      ? urlOrAlbum
      : (urlOrAlbum as any)?.spotifyUrl || (urlOrAlbum as any)?.external_urls?.spotify;
    return this.openSpotifyUrl(url, {target, expectedType: 'album'});
  }

  /**
   * Safe navigation for playlist URLs.
   */
  openPlaylist(urlOrPlaylist: unknown, target: '_blank' | '_self' = '_blank'): boolean {
    const url = typeof urlOrPlaylist === 'string'
      ? urlOrPlaylist
      : (urlOrPlaylist as any)?.spotifyUrl || (urlOrPlaylist as any)?.external_urls?.spotify || (urlOrPlaylist as any)?.spotifyPlaylistUrl;
    return this.openSpotifyUrl(url, {target, expectedType: 'playlist'});
  }

  /**
   * Extracts and validates the track URL from a catalog or DTO object.
   */
  getTrackUrl(track: any): string | null {
    if (!track) return null;
    const candidate = track.spotifyUrl || track.external_urls?.spotify;
    return this.sanitizeSpotifyUrl(candidate, 'track');
  }

  /**
   * Extracts and validates the artist URL from a catalog or DTO object.
   */
  getArtistUrl(artist: any): string | null {
    if (!artist) return null;
    const candidate = artist.spotifyUrl || artist.external_urls?.spotify;
    return this.sanitizeSpotifyUrl(candidate, 'artist');
  }

  /**
   * Extracts and validates the album URL from a catalog or DTO object.
   */
  getAlbumUrl(album: any): string | null {
    if (!album) return null;
    const candidate = album.spotifyUrl || album.external_urls?.spotify;
    return this.sanitizeSpotifyUrl(candidate, 'album');
  }

  /**
   * Extracts and validates the playlist URL from an item.
   */
  getPlaylistUrl(playlist: any): string | null {
    if (!playlist) return null;
    const candidate = playlist.spotifyUrl || playlist.spotifyPlaylistUrl || playlist.external_urls?.spotify;
    return this.sanitizeSpotifyUrl(candidate, 'playlist');
  }
}
