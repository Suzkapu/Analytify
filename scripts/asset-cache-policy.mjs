export function hashedMainAsset(html) {
  return html.match(/<script\b[^>]*\bsrc=["']((?:\/)?main[.-][A-Za-z0-9_-]{8,}[.]js)["']/i)?.[1] || null;
}

export function hasImmutableAssetCaching(headers) {
  const directives = new Set((headers.get('cache-control') || '').toLowerCase().split(',').map(value => value.trim()));
  return ['public', 'max-age=31536000', 'immutable'].every(value => directives.has(value))
    && !['private', 'no-cache', 'no-store'].some(value => directives.has(value));
}

export function hasMutableMetadataCaching(headers) {
  const value = headers.get('cache-control') || '';
  return !/\bimmutable\b/i.test(value) && !/\bmax-age=[1-9]\d*/i.test(value);
}
