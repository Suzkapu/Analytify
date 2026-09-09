import {
  matchingOwnedPlaylist,
  playlistDescription,
  playlistOperationTag,
  playlistTrackBatches
} from './recovery.ts';

const marker = 'a'.repeat(64);

Deno.test('the recovery marker survives playlist description updates', () => {
  const description = playlistDescription('Weekly picks. '.repeat(100), marker);
  if (!description.includes(playlistOperationTag(marker))) {
    throw new Error('The deterministic recovery tag was omitted.');
  }
  if (description.length > 300) throw new Error('Spotify description limit exceeded.');
});

Deno.test('recovery accepts only a marker match owned by the connected Spotify user', () => {
  const recovered = matchingOwnedPlaylist({items: [{
    id: 'recovered-playlist',
    description: `Weekly picks. ${playlistOperationTag(marker)}`,
    owner: {id: 'expected-owner'},
    external_urls: {spotify: 'https://open.spotify.com/playlist/recovered-playlist'}
  }]}, marker, 'expected-owner');
  if (recovered?.id !== 'recovered-playlist') throw new Error('Owned playlist was not recovered.');

  const foreign = matchingOwnedPlaylist({items: [{
    id: 'foreign-playlist',
    description: playlistOperationTag(marker),
    owner: {id: 'another-owner'}
  }]}, marker, 'expected-owner');
  if (foreign !== null) throw new Error('A foreign playlist must never be adopted.');
});

Deno.test('recovery requires the exact operation marker', () => {
  const recovered = matchingOwnedPlaylist({items: [{
    id: 'similar-playlist',
    description: playlistOperationTag('b'.repeat(64)),
    owner: {id: 'expected-owner'}
  }]}, marker, 'expected-owner');
  if (recovered !== null) throw new Error('A different operation must not be adopted.');
});

Deno.test('playlist replacement retains every track in Spotify-sized batches', () => {
  const batches = playlistTrackBatches(Array.from({length: 205}, (_, index) => `spotify:track:${index}`));
  if (batches.length !== 3 || batches[0].length !== 100 || batches[1].length !== 100 || batches[2].length !== 5) {
    throw new Error('Track batches were truncated or exceeded Spotify limits.');
  }
  const empty = playlistTrackBatches([]);
  if (empty.length !== 1 || empty[0].length !== 0) {
    throw new Error('An empty playlist must still issue one replacement request.');
  }
});
