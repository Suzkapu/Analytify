const test = require('node:test');
const assert = require('node:assert/strict');

const {genresFromArtists, hydrateArtistGenres} = require('./stats-task');

test('lazily hydrates missing artist genres with bounded parallel requests', async () => {
  let active = 0;
  let peak = 0;
  const calls = [];
  const spotify = {
    async api(pathname) {
      calls.push(pathname);
      active++;
      peak = Math.max(peak, active);
      await new Promise(resolve => setImmediate(resolve));
      active--;
      const id = pathname.split('/').pop();
      return {id, genres: [`genre-${id}`]};
    }
  };
  const artists = Array.from({length: 7}, (_, index) => ({id: `artist-${index}`, genres: []}));

  const enriched = await hydrateArtistGenres(spotify, 'access-token', artists, 4);

  assert.equal(calls.length, 7);
  assert.equal(peak, 4);
  assert.equal(genresFromArtists(enriched).length, 7);
});

test('does not spend artist requests when Top Artists already includes genres', async () => {
  const spotify = {api() { throw new Error('should not be called'); }};
  const artists = [{id: 'artist', genres: ['indie rock']}];

  assert.equal(await hydrateArtistGenres(spotify, 'access-token', artists), artists);
});
