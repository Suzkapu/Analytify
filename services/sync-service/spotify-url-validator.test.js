const test = require('node:test');
const assert = require('node:assert/strict');
const {validateSpotifyUrl} = require('./spotify-url-validator.js');

test('Spotify URL validator accepts only exact HTTPS entity URLs', () => {
  assert.equal(validateSpotifyUrl('https://open.spotify.com/track/abc?si=123', 'track'),
    'https://open.spotify.com/track/abc?si=123');
  assert.equal(validateSpotifyUrl('https://open.spotify.com/intl-de/artist/abc', 'artist'),
    'https://open.spotify.com/intl-de/artist/abc');
});

test('Spotify URL validator rejects injection and authority confusion', () => {
  const blocked = [
    'javascript:alert(1)', 'data:text/html,test', 'http://open.spotify.com/track/abc',
    'https://user:pass@open.spotify.com/track/abc', 'https://open.spotify.com@evil.test/track/abc',
    'https://open.spotify.com.evil.test/track/abc', 'https://open%2Espotify.com/track/abc',
    'https://open.spotify.com\\@evil.test/track/abc'
  ];
  blocked.forEach(url => assert.equal(validateSpotifyUrl(url), null, url));
  assert.equal(validateSpotifyUrl('https://open.spotify.com/artist/abc', 'track'), null);
});
