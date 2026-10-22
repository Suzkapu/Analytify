const test = require('node:test');
const assert = require('node:assert/strict');
const {createCatalogRepository} = require('./catalog-repository');

function harness({replacementError = null, revision = 3} = {}) {
  const writes = [];
  const reads = {artists: [], albums: [], tracks: []};
  const supabase = {
    from(table) {
      if (table === 'catalog_write_versions') {
        return {select() { return {eq() { return this; }, async maybeSingle() {
          return {data: {revision}, error: null};
        }}; }};
      }
      if (reads[table]) {
        return {select() { return {async in() { return {data: reads[table], error: null}; }}; }};
      }
      throw new Error(`Unexpected direct catalog mutation: ${table}`);
    },
    async rpc(name, parameters) {
      writes.push({name, parameters});
      return {data: replacementError ? null : revision + 1, error: replacementError};
    }
  };
  return {repository: createCatalogRepository(supabase, {api: async () => null}), writes};
}

test('replaces track metadata and relationships through one CAS transaction', async () => {
  const {repository, writes} = harness();
  await repository.syncTracks(['track1'], [{
    id: 'track1', name: 'Track', duration_ms: 123, artists: [{id: 'artist1', name: 'Artist'}]
  }]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, 'replace_spotify_catalog');
  assert.equal(writes[0].parameters.p_expected_revision, 3);
  assert.equal(writes[0].parameters.p_tracks[0].name, 'Track');
  assert.deepEqual(writes[0].parameters.p_track_artists, [
    {track_id: 'track1', artist_id: 'artist1', artist_rank: 0}
  ]);
  assert.match(writes[0].parameters.p_idempotency_key, /^[0-9a-f]{64}$/);
});

test('surfaces an atomic replacement failure without issuing cleanup writes', async () => {
  const failure = {code: '40001', message: 'concurrent replacement'};
  const {repository, writes} = harness({replacementError: failure});
  await assert.rejects(
    repository.syncAlbums(['album1'], [{id: 'album1', name: 'Album', artists: []}]),
    error => error === failure
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].name, 'replace_spotify_catalog');
});

function catalogHarness(options={}) {
 const writes=[],requests=[];let active=0,peak=0;
 const supabase={from(table){return {select(){return this;},eq(){return this;},async maybeSingle(){return {data:options.noVersion?null:{revision:2},error:options.versionError};},async in(){return {data:options.existing?.[table]??null,error:options.readError};}};},async rpc(name,args){assert.equal(name,'replace_spotify_catalog');writes.push(args);return {error:options.writeError};}};
 const spotify={async api(path,token){assert.equal(token,'fixture');requests.push(path);active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;if(options.fetchError)throw new Error('unavailable');return options.fetch?options.fetch(path):{id:path.split('/').pop()};}};
 return {repository:createCatalogRepository(supabase,spotify),writes,requests,get peak(){return peak;}};
}
test('empty and unsupplied catalog entities do not create destructive replacements',async()=>{
 const h=catalogHarness({existing:{artists:[{id:'kept',image_url:'image'}]}});
 await h.repository.syncArtists('fixture',[]);await h.repository.syncAlbums([]);await h.repository.syncTracks([]);
 await h.repository.syncArtists('fixture',['kept']);await h.repository.syncAlbums(['missing'],[null,{id:'other'}]);await h.repository.syncTracks(['missing'],[null,{id:'other'}]);
 assert.equal(h.writes.length,0);assert.equal(h.requests.length,0);
});
test('catalog reads and revision failures prevent any atomic mutations',async()=>{
 for(const kind of ['Artists','Albums','Tracks']){const h=catalogHarness({readError:new Error('lookup unavailable')});await assert.rejects(()=>kind==='Artists'?h.repository.syncArtists('fixture',['id']):h.repository[`sync${kind}`](['id']),/lookup unavailable/);assert.equal(h.writes.length,0);}
 const h=catalogHarness({versionError:new Error('revision unavailable')});await assert.rejects(h.repository.syncTracks(['id'],[{id:'id'}]),/revision unavailable/);assert.equal(h.writes.length,0);
});
test('artist refresh preserves prior metadata on sparse payloads and skips failed remote refreshes',async t=>{
 t.mock.method(console,'warn',()=>{});
 const h=catalogHarness({existing:{artists:[{id:'a',name:'Previous',image_url:'cover',spotify_url:'https://open.spotify.com/artist/abcdefghij123456789012'}]},fetchError:true});
 await h.repository.syncArtists('fixture',['a',null,'a','missing'],[{id:'a'},null,{id:'unrequested'}]);
 assert.equal(h.requests.length,1);assert.equal(h.writes[0].p_artists[0].name,'Previous');assert.equal(h.writes[0].p_artists[0].image_url,'cover');
 const empty=catalogHarness({fetchError:true});await empty.repository.syncArtists('fixture',['missing']);assert.equal(empty.writes.length,0);
});
test('artist refresh fetches encoded identifiers with four bounded concurrent requests',async()=>{
 const h=catalogHarness({noVersion:true});await h.repository.syncArtists('fixture',['a/b','b','c','d','e']);
 assert.equal(h.peak,4);assert.ok(h.requests.includes('/artists/a%2Fb'));assert.equal(h.writes[0].p_expected_revision,0);assert.equal(h.writes[0].p_artists[0].name,'Unknown Artist');assert.equal(h.writes[0].p_artists[0].spotify_url,null);
 const full=catalogHarness();await full.repository.syncArtists('fixture',['a'],[{id:'a',name:'Artist',images:[{url:'new'}],external_urls:{spotify:'https://open.spotify.com/artist/abcdefghij123456789012'}}]);assert.equal(full.writes[0].p_artists[0].image_url,'new');assert.match(full.writes[0].p_artists[0].spotify_url,/open.spotify.com/);
});
test('album normalization handles precision, empty metadata, relationship filtering and previous values',async()=>{
 const h=catalogHarness({existing:{albums:[{id:'old',name:'Old',album_type:'single',total_tracks:9,release_date:'2000-01-01',release_date_precision:'day',image_url:'old-cover',spotify_url:'https://open.spotify.com/album/abcdefghij123456789012',restriction_reason:'market',upc:'old-upc',ean:'old-ean'}]}});
 await h.repository.syncAlbums(['old','empty','year','month','day','full'],[{id:'old',artists:[null,{}, {id:'artist'}]},{id:'empty'},{id:'year',release_date:'2020'},{id:'month',release_date:'2021-02'},{id:'day',release_date:'2022-03-04'},{id:'full',name:'Full',album_type:'ep',total_tracks:0,release_date_precision:'month',images:[{url:'new'}],external_urls:{spotify:'https://open.spotify.com/album/abcdefghij123456789012'},restrictions:{reason:'product'},external_ids:{upc:'upc',ean:'ean'},artists:[]}]);
 const rows=h.writes[0].p_albums;assert.equal(rows[0].name,'Old');assert.equal(rows[0].total_tracks,9);assert.equal(rows[0].restriction_reason,'market');assert.equal(rows[1].release_date,null);assert.equal(rows[1].name,'Unknown Album');assert.equal(rows[2].release_date,'2020-01-01');assert.equal(rows[3].release_date,'2021-02-01');assert.equal(rows[4].release_date,'2022-03-04');assert.equal(rows[5].total_tracks,0);assert.equal(rows[5].upc,'upc');assert.deepEqual(h.writes[0].p_album_artists,[{album_id:'old',artist_id:'artist'}]);
 const direct=catalogHarness();await direct.repository.syncAlbums(['a'],[{id:'a',upc:'direct',ean:'direct'}]);assert.equal(direct.writes[0].p_albums[0].upc,'direct');
});
test('track normalization preserves previous fields and accepts explicit zero/false values',async()=>{
 const previous={id:'old',name:'Old',album_id:'album',duration_ms:123,explicit:true,spotify_url:'https://open.spotify.com/track/abcdefghij123456789012',track_number:5,disc_number:2,is_playable:false,is_local:true,isrc:'isrc',restriction_reason:'market'};
 const h=catalogHarness({existing:{tracks:[previous]}});await h.repository.syncTracks(['old','empty','full'],[{id:'old',artists:[null,{}, {id:'artist'}]},{id:'empty'},{id:'full',name:'Full',album:{id:'new-album'},duration_ms:0,explicit:false,track_number:0,disc_number:0,is_playable:true,is_local:false,external_ids:{isrc:'new-isrc'},restrictions:{reason:'product'},external_urls:{spotify:'https://open.spotify.com/track/abcdefghij123456789012'}}]);
 const rows=h.writes[0].p_tracks;for(const key of Object.keys(previous))assert.equal(rows[0][key],previous[key]);assert.equal(rows[1].name,'Unknown Track');assert.equal(rows[1].is_playable,true);assert.equal(rows[1].duration_ms,0);assert.equal(rows[2].explicit,false);assert.equal(rows[2].track_number,0);assert.equal(rows[2].isrc,'new-isrc');assert.deepEqual(h.writes[0].p_track_artists,[{track_id:'old',artist_id:'artist',artist_rank:2}]);
});
test('persisted pulled tracks link unique artists and albums before tracks without accepting invalid rows',async()=>{
 const h=catalogHarness();await h.repository.persistPulledTracks('fixture',[null,{}, {id:'t',artists:[{id:'a'}],album:{id:'b',artists:[{id:'a'}]}},{id:'u'}],[null,{id:'a',name:'Supplied'}]);
 assert.deepEqual(h.writes.map(w=>w.p_artists.length?'artists':w.p_albums.length?'albums':'tracks'),['artists','albums','tracks']);assert.equal(h.writes[0].p_artists.length,1);assert.equal(h.writes[2].p_tracks.length,2);assert.equal(h.requests.length,0);
});
