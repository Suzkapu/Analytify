export const REQUIRED_HEADERS = {
  'strict-transport-security': value => /max-age=(?:[3-9]\d{7}|\d{9,})/i.test(value),
  'x-content-type-options': value => value.toLowerCase() === 'nosniff',
  'x-frame-options': value => value.toUpperCase() === 'DENY',
  'referrer-policy': value => value.toLowerCase() === 'strict-origin-when-cross-origin',
  'permissions-policy': value => ['camera=()', 'geolocation=()', 'microphone=()'].every(rule => value.includes(rule)),
  'content-security-policy': value => [
    "default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", "connect-src 'self'", 'https://api.spotify.com',
    'https://tmmhylpexbubyznlizfs.supabase.co', 'wss://tmmhylpexbubyznlizfs.supabase.co'
  ].every(rule => value.includes(rule))
};

export function invalidSecurityHeaders(headers) {
  const invalid = Object.entries(REQUIRED_HEADERS)
    .filter(([name, validate]) => !validate(headers.get(name) || ''))
    .map(([name]) => name);
  if (/nginx\/[0-9]/i.test(headers.get('server') || '')) invalid.push('server-version');
  return invalid;
}
