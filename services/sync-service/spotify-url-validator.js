const SPOTIFY_PATH = /^(?:\/intl-[a-z]{2}(?:-[a-z]{2})?)?\/(track|artist|album|playlist|user|collection|show|episode)\/([A-Za-z0-9_-]{1,100})\/?$/i;

function validateSpotifyUrl(rawUrl, expectedType) {
  if (typeof rawUrl !== 'string') return null;
  const candidate = rawUrl.trim();
  if (!candidate || /[\s\x00-\x1f\x7f-\x9f\\]/.test(candidate)) return null;
  const schemeMarker = candidate.indexOf('://');
  if (schemeMarker < 0 || candidate.slice(0, schemeMarker).toLowerCase() !== 'https') return null;
  const authorityEnd = candidate.indexOf('/', schemeMarker + 3);
  const authority = candidate.slice(schemeMarker + 3, authorityEnd < 0 ? undefined : authorityEnd);
  if (authority !== 'open.spotify.com' || authority.includes('%') || authority.includes('@') || authority.includes(':')) {
    return null;
  }
  let parsed;
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

module.exports = {validateSpotifyUrl};
