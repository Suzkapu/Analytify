export function hashedMainAsset(html) {
  return html.match(/<script\b[^>]*\bsrc=["']((?:\/)?main[.-][A-Za-z0-9_-]{8,}[.]js)["']/i)?.[1] || null;
}

export function hasImmutableAssetCaching(headers) {
  const directives = (headers.get('cache-control') || '').toLowerCase().split(',').map(value => value.trim());
  const ages = directives.filter(value => /^max-age(?:\s*=|$)/.test(value));
  return ['public', 'immutable'].every(value => directives.includes(value))
    && ages.length === 1 && ages[0] === 'max-age=31536000'
    && !directives.some(value => /^(?:private|no-cache|no-store)(?:\s*=|$)/.test(value));
}

export function hasMutableMetadataCaching(headers) {
  const directives = (headers.get('cache-control') || '').toLowerCase().split(',').map(value => value.trim());
  const ages = directives.filter(value => /^(?:s-maxage|max-age)(?:\s*=|$)/.test(value));
  return !directives.some(value => /^immutable(?:\s*=|$)/.test(value))
    && ages.every(value => /^(?:s-maxage|max-age)\s*=\s*(?:0|"0")$/.test(value));
}
