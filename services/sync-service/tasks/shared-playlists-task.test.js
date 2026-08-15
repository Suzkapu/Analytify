const test = require('node:test');
const assert = require('node:assert/strict');

const {loadSharedPlaylistSource} = require('./shared-playlists-task');

function savedTrack(id, artistId, albumName) {
  return {
    track: {
      id,
      name: `Track ${id}`,
      artists: [{id: artistId, name: `Artist ${artistId}`}],
      album: {name: albumName, images: []},
      duration_ms: 180_000
    }
  };
}

test('loads the internal fav source from Spotify Liked Songs pages', async () => {
  const paths = [];
  const spotify = {
    async api(pathname) {
      paths.push(pathname);
      if (pathname.endsWith('offset=0')) {
        return {items: [savedTrack('one', 'artist-one', 'First')], next: 'second-page'};
      }
      return {items: [savedTrack('two', 'artist-two', 'Second')], next: null};
    }
  };

  const source = await loadSharedPlaylistSource(spotify, 'token', 'fav');

  assert.deepEqual(paths, [
    '/me/tracks?limit=50&offset=0',
    '/me/tracks?limit=50&offset=50'
  ]);
  assert.equal(source.name, 'Favourite Tracks');
  assert.equal(source.preservePublishedMetadata, true);
  assert.deepEqual(source.tracks.map(track => track.id), ['one', 'two']);
  assert.deepEqual(source.tracks.map(track => track.playlistIndex), [1, 2]);
});

test('continues to load regular shared playlists from playlist endpoints', async () => {
  const paths = [];
  const spotify = {
    async api(pathname) {
      paths.push(pathname);
      if (pathname === '/playlists/validPlaylistId12345') {
        return {name: 'Road Trip', description: 'Summer', images: [{url: 'cover'}]};
      }
      return {items: [savedTrack('one', 'artist-one', 'First')], next: null};
    }
  };

  const source = await loadSharedPlaylistSource(spotify, 'token', 'validPlaylistId12345');

  assert.deepEqual(paths, [
    '/playlists/validPlaylistId12345',
    '/playlists/validPlaylistId12345/items?limit=100&offset=0'
  ]);
  assert.equal(source.name, 'Road Trip');
  assert.equal(source.description, 'Summer');
  assert.equal(source.imageUrl, 'cover');
  assert.equal(source.preservePublishedMetadata, false);
});
