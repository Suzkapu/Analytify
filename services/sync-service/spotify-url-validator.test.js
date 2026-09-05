const test = require('node:test');
const assert = require('node:assert/strict');
const {validateSpotifyUrl, isValidSpotifyUrl} = require('./spotify-url-validator.js');

test('validateSpotifyUrl accepts valid HTTPS open.spotify.com entity URLs', () => {
  const validCases = [
    ['https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT', 'track'],
    ['https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc12345', 'track'],
    ['https://open.spotify.com/intl-de/track/4cOdK2wGLETKBW3PvgPWqT', 'track'],
    ['https://open.spotify.com/artist/06HL4z0CvFAxyc27GXpf02', 'artist'],
    ['https://open.spotify.com/album/41Mn1tkAUW0aSm5ZsVkx6Z', 'album'],
    ['https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', 'playlist']
  ];

  for (const [url, expectedType] of validCases) {
    assert.equal(isValidSpotifyUrl(url, expectedType), true);
    assert.ok(validateSpotifyUrl(url, expectedType).startsWith('https://open.spotify.com/'));
  }
});

test('validateSpotifyUrl rejects dangerous and invalid schemes', () => {
  const dangerous = [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'http://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'
  ];

  for (const url of dangerous) {
    assert.equal(validateSpotifyUrl(url), null);
    assert.equal(isValidSpotifyUrl(url), false);
  }
});

test('validateSpotifyUrl rejects credential-bearing, spoofed, and encoded hosts', () => {
  const blocked = [
    'https://user:pass@open.spotify.com/track/123',
    'https://open.spotify.com@attacker.com/track/123',
    'https://open.spotify.com.attacker.com/track/123',
    'https://open%2Espotify.com/track/123',
    'https://open.spotify.com\\@attacker.com/track/123',
    'https://notspotify.com/track/123'
  ];

  for (const url of blocked) {
    assert.equal(validateSpotifyUrl(url), null);
  }
});

test('validateSpotifyUrl rejects entity type mismatch', () => {
  const trackUrl = 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT';
  assert.equal(validateSpotifyUrl(trackUrl, 'artist'), null);
  assert.ok(validateSpotifyUrl(trackUrl, 'track'));
});
