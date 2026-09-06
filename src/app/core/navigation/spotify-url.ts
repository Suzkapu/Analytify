export type SpotifyEntityType =
  'track' | 'artist' | 'album' | 'playlist' | 'user' | 'collection' | 'show' | 'episode';

export interface SpotifyNavigationOptions {
  expectedType?: SpotifyEntityType;
  target?: '_self' | '_blank';
}

interface NavigationWindow {
  location: {assign(url: string): void};
  open(url: string, target: string, features?: string): unknown;
}

const SPOTIFY_PATH = /^(?:\/intl-[a-z]{2}(?:-[a-z]{2})?)?\/(track|artist|album|playlist|user|collection|show|episode)\/([A-Za-z0-9_-]{1,100})\/?$/i;

export function sanitizeSpotifyUrl(rawUrl: unknown, expectedType?: SpotifyEntityType): string | null {
  if (typeof rawUrl !== 'string') return null;
  const candidate = rawUrl.trim();
  if (!candidate || /[\s\u0000-\u001f\u007f-\u009f\\]/.test(candidate)) return null;

  const schemeMarker = candidate.indexOf('://');
  if (schemeMarker < 0 || candidate.slice(0, schemeMarker).toLowerCase() !== 'https') return null;
  const authorityEnd = candidate.indexOf('/', schemeMarker + 3);
  const authority = candidate.slice(schemeMarker + 3, authorityEnd < 0 ? undefined : authorityEnd);
  if (authority !== 'open.spotify.com' || authority.includes('%') || authority.includes('@') || authority.includes(':')) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'open.spotify.com' || parsed.port ||
    parsed.username || parsed.password) return null;
  const match = parsed.pathname.match(SPOTIFY_PATH);
  if (!match || (expectedType && match[1].toLowerCase() !== expectedType)) return null;
  return parsed.href;
}

export function openSpotifyUrl(
  rawUrl: unknown,
  options: SpotifyNavigationOptions = {},
  navigationWindow: NavigationWindow = window
): boolean {
  const safeUrl = sanitizeSpotifyUrl(rawUrl, options.expectedType);
  if (!safeUrl) return false;
  if (options.target === '_self') navigationWindow.location.assign(safeUrl);
  else navigationWindow.open(safeUrl, '_blank', 'noopener,noreferrer');
  return true;
}
