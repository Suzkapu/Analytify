const test = require('node:test');
const assert = require('node:assert/strict');

const {createSharedPlaylistsTask, loadSharedPlaylistSource, buildUploadChunks} = require('./shared-playlists-task');

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

function queryReturning(data) {
  const query = {
    select() { return query; },
    eq() { return query; },
    in() { return query; },
    is() { return query; },
    order() { return query; },
    range() { return query; },
    then(resolve) { return Promise.resolve({data, error: null}).then(resolve); }
  };
  return query;
}

test('worker source publication stages bounded chunks before one revision compare-and-set commit', async () => {
  const rpcCalls = [];
  const share = {
    id: 'share', source_playlist_id: 'source', revision: 4,
    playlist_description: '', playlist_image_url: ''
  };
  const supabase = {
    from: table => queryReturning(table === 'playlist_shares' ? [share] : []),
    rpc: async (name, parameters) => {
      rpcCalls.push({name, parameters});
      return {data: name === 'begin_playlist_share_refresh_upload' ? 'upload-id' : true, error: null};
    }
  };
  const spotify = {
    accessToken: async () => 'token',
    api: async path => path === '/playlists/source'
      ? {name: 'Fresh', description: '', images: []}
      : {items: [savedTrack('one', 'artist', 'Album')], next: null}
  };

  await createSharedPlaylistsTask({supabase, spotify})({
    user: {id: 'owner', spotify_credential: {}}
  });

  assert.equal(rpcCalls[0].name, 'begin_playlist_share_refresh_upload');
  assert.equal(rpcCalls[0].parameters.p_expected_revision, 4);
  assert.equal(rpcCalls[1].name, 'append_playlist_share_upload_chunk');
  assert.equal(rpcCalls[1].parameters.p_tracks[0].id, 'one');
  assert.equal(rpcCalls[2].name, 'commit_playlist_share_refresh_upload');
  assert.equal(rpcCalls[2].parameters.p_expected_track_count, 1);
});

test('worker uploads a maximum playlist in bounded resumable chunks', async () => {
  const rpcCalls = [];
  const tracks = Array.from({length: 5000}, (_, index) => savedTrack(`track-${index}`, `artist-${index}`, 'Album'));
  const supabase = {
    from: table => queryReturning(table === 'playlist_shares'
      ? [{id: 'share', source_playlist_id: 'source', revision: 1}]
      : []),
    rpc: async (name, parameters) => {
      rpcCalls.push({name, parameters});
      return {data: name === 'begin_playlist_share_refresh_upload' ? 'upload-id' : true, error: null};
    }
  };
  const spotify = {
    accessToken: async () => 'token',
    api: async path => path === '/playlists/source'
      ? {name: 'Maximum', description: '', images: []}
      : {items: tracks, next: null}
  };

  await createSharedPlaylistsTask({supabase, spotify})({user: {id: 'owner', spotify_credential: {}}});

  const chunks = rpcCalls.filter(call => call.name === 'append_playlist_share_upload_chunk');
  assert.equal(chunks.length, 20);
  assert.ok(chunks.every(call => call.parameters.p_tracks.length <= 250));
  assert.deepEqual(chunks.map(call => call.parameters.p_offset), Array.from({length: 20}, (_, index) => index * 250));
  assert.equal(rpcCalls.at(-1).parameters.p_expected_track_count, 5000);
});

test('worker keeps every serialized upload chunk below both database limits', () => {
  const tracks = Array.from({length: 80}, (_, index) => ({
    id: `track-${index}`, name: `Track ${index}`, padding: 'ü'.repeat(10_000)
  }));

  const chunks = buildUploadChunks(tracks);

  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(chunk => chunk.tracks.length <= 250));
  assert.ok(chunks.every(chunk => Buffer.byteLength(JSON.stringify(chunk.tracks), 'utf8') <= 450_000));
  assert.deepEqual(chunks.map(chunk => chunk.offset), chunks.map((_, index) =>
    chunks.slice(0, index).reduce((total, chunk) => total + chunk.tracks.length, 0)));
});

test('worker refreshes a source larger than the former total limit', async () => {
  const rpcCalls = [];
  const tracks = Array.from({length: 5001}, (_, index) => savedTrack(`track-${index}`, `artist-${index}`, 'Album'));
  const supabase = {
    from: table => queryReturning(table === 'playlist_shares'
      ? [{id: 'share', source_playlist_id: 'source', revision: 9}]
      : []),
    rpc: async (name, parameters) => {
      rpcCalls.push({name, parameters});
      return {data: true, error: null};
    }
  };
  const spotify = {
    accessToken: async () => 'token',
    api: async path => path === '/playlists/source'
      ? {name: 'Too large', description: '', images: []}
      : {items: tracks, next: null}
  };

  const result = await createSharedPlaylistsTask({supabase, spotify})({user: {id: 'owner', spotify_credential: {}}});

  assert.equal(result.refreshedSources, 1);
  assert.deepEqual(result.warnings, []);
  const chunks = rpcCalls.filter(call => call.name === 'append_playlist_share_upload_chunk');
  assert.equal(chunks.length, 21);
  assert.equal(chunks.at(-1).parameters.p_offset, 5000);
  assert.equal(rpcCalls.at(-1).name, 'commit_playlist_share_refresh_upload');
  assert.equal(rpcCalls.at(-1).parameters.p_expected_track_count, 5001);
});

test('out-of-order recipient completion is rejected and releases its lease', async () => {
  const calls = [];
  const received = {
    id: 'share', revision: 3, playlist_name: 'Fresh', owner_display_name: 'Owner',
    revoked_at: null
  };
  const download = {
    share_id: 'share', recipient_user_id: 'recipient', applied_revision: 2,
    spotify_playlist_id: 'spotify-playlist', spotify_playlist_url: ''
  };
  const supabase = {
    from(table) {
      if (table === 'playlist_share_downloads') return queryReturning([download]);
      if (table === 'playlist_share_tracks') {
        return queryReturning([{position: 0, track: {id: 'one', uri: 'spotify:track:one'}}]);
      }
      // No owned shares on the first query; the received-share lookup uses in().
      const query = queryReturning([]);
      query.in = () => queryReturning([received]);
      return query;
    },
    rpc: async (name, parameters) => {
      calls.push({name, parameters});
      if (name === 'claim_playlist_share_sync') return {data: true, error: null};
      if (name === 'complete_playlist_share_sync') return {data: false, error: null};
      return {data: null, error: null};
    }
  };
  const spotify = {
    accessToken: async () => 'token',
    api: async () => ({})
  };

  await assert.rejects(
    createSharedPlaylistsTask({supabase, spotify})({
      user: {id: 'recipient', spotify_credential: {}}
    }),
    /source changed/
  );

  const claim = calls.find(call => call.name === 'claim_playlist_share_sync');
  const complete = calls.find(call => call.name === 'complete_playlist_share_sync');
  assert.equal(claim.parameters.p_expected_source_revision, 3);
  assert.equal(claim.parameters.p_expected_applied_revision, 2);
  assert.equal(complete.parameters.p_lease_token, claim.parameters.p_lease_token);
  assert.ok(calls.some(call => call.name === 'release_playlist_share_sync'));
});

test('recipient refresh loads every published track beyond the default row limit', async () => {
  const rows = Array.from({length: 1205}, (_, index) => ({
    position: index, track: {id: `track-${index}`, uri: `spotify:track:track-${index}`}
  }));
  const ranges = [];
  const spotifyCalls = [];
  const received = {id: 'share', revision: 4, playlist_name: 'Large', owner_display_name: 'Owner', revoked_at: null};
  const download = {
    share_id: 'share', recipient_user_id: 'recipient', applied_revision: 3,
    spotify_playlist_id: 'spotify-playlist', spotify_playlist_url: ''
  };
  const supabase = {
    from(table) {
      if (table === 'playlist_share_downloads') return queryReturning([download]);
      if (table === 'playlist_share_tracks') {
        const query = {
          select() { return query; }, eq() { return query; }, order() { return query; },
          range(start, end) {
            ranges.push([start, end]);
            return Promise.resolve({data: rows.slice(start, end + 1), error: null});
          }
        };
        return query;
      }
      const query = queryReturning([]);
      query.in = () => queryReturning([received]);
      return query;
    },
    rpc: async name => ({
      data: name === 'claim_playlist_share_sync' || name === 'complete_playlist_share_sync', error: null
    })
  };
  const spotify = {
    accessToken: async () => 'token',
    api: async (path, _token, options) => { spotifyCalls.push({path, options}); return {}; }
  };

  const result = await createSharedPlaylistsTask({supabase, spotify})({user: {id: 'recipient', spotify_credential: {}}});

  assert.equal(result.updatedCopies, 1);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
  const uploadedUris = spotifyCalls
    .filter(call => call.path.endsWith('/items'))
    .flatMap(call => JSON.parse(call.options.body).uris);
  assert.equal(uploadedUris.length, 1205);
  assert.equal(uploadedUris.at(-1), 'spotify:track:track-1204');
});
