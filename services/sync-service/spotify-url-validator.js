const APPROVED_HOST = 'open.spotify.com';
const SPOTIFY_PATH_PATTERN =
  /^(?:\/intl-[a-z]{2}(?:-[a-z0-9]{2,4})?)?\/(track|artist|album|playlist|user|collection|show|episode)\/([A-Za-z0-9_-]+)(?:\/.*)?$/;

/**
 * Strictly validates and normalizes a Spotify web URL for catalog ingestion.
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
 * @param {unknown} rawUrl
 * @param {string} [expectedType]
 * @returns {string | null}
 */
function validateSpotifyUrl(rawUrl, expectedType) {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Reject control characters, any internal whitespace, and backslashes
  if (/[\s\x00-\x1f\x7f-\x9f\\]/.test(trimmed)) {
    return null;
  }

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

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== '443') return null;

  if (parsed.hostname.toLowerCase() !== APPROVED_HOST) return null;

  const match = parsed.pathname.match(SPOTIFY_PATH_PATTERN);
  if (!match) return null;

  const entityType = match[1];
  if (expectedType && entityType !== expectedType) {
    return null;
  }

  return parsed.toString();
}

/**
 * @param {unknown} rawUrl
 * @param {string} [expectedType]
 * @returns {boolean}
 */
function isValidSpotifyUrl(rawUrl, expectedType) {
  return validateSpotifyUrl(rawUrl, expectedType) !== null;
}

module.exports = {
  validateSpotifyUrl,
  isValidSpotifyUrl
};
