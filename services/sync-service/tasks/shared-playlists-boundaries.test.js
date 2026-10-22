const test=require('node:test');
const assert=require('node:assert/strict');
const {createSharedPlaylistsTask,loadSharedPlaylistSource,buildUploadChunks}=require('./shared-playlists-task');
function fixture(options={}){
 const calls=[],queries=[],spotifyCalls=[];const received={id:'share',revision:2,playlist_name:'Name',owner_display_name:'Owner',...options.received};const download={share_id:'share',applied_revision:1,spotify_playlist_id:'existing/copy',spotify_playlist_url:'https://fixture.invalid',...options.download};
 const supabase={from(table){const q={filters:[],select(){return q;},eq(column,value){q.filters.push([column,value]);return q;},is(column,value){q.filters.push([column,value]);return q;},in(column,values){q.received=true;q.filters.push([column,values]);return q;},order(){return q;},range(){return q;},then(resolve,reject){queries.push({table,filters:q.filters});let data;if(table==='playlist_shares')data=q.received?(options.shares??[received]):options.owned??[];else if(table==='playlist_share_downloads')data=options.downloads??[download];else if(table==='playlist_share_tracks')data=options.rows??[{track:{id:'first'}},{track:{uri:'spotify:track:second'}},{track:{}},{}];return Promise.resolve({data:options.nullTables?.includes(table)?null:data,error:options.tableErrors?.[table]}).then(resolve,reject);}};return q;},async rpc(name,args){calls.push({name,args});const configured=options.rpc?.[name];return configured??{data:name==='begin_playlist_share_refresh_upload'?'upload':true,error:null};}};
 const spotify={async accessToken(credential){assert.equal(credential,'fixture-credential');return 'fixture-token';},async api(path,token,opts){assert.equal(token,'fixture-token');spotifyCalls.push({path,opts});if(options.spotifyError)throw options.spotifyError;if(path.includes('/items')&&!opts)return {items:[{id:'owned-song',name:'Owned Song',artists:[{id:'artist',name:'Artist'}]}]};return {};}};
 return {calls,queries,spotifyCalls,run:()=>createSharedPlaylistsTask({supabase,spotify})({user:{id:'recipient',spotify_credential:'fixture-credential'}})};
}
test('source normalization drops unavailable/episode/incomplete/duplicate tracks and retains usable metadata',async()=>{
 const complete={id:'valid',name:'Song',artists:[null,{}, {id:'artist',name:'Artist'}],uri:'spotify:track:valid',album:{name:'Album',images:[{url:'image'}],release_date:'2026'},external_urls:{spotify:'https://open.spotify.com/track/valid'},duration_ms:10,explicit:true};
 const source=await loadSharedPlaylistSource({api:async path=>path.endsWith('/items?limit=100&offset=0')?{items:[null,{}, {id:'episode',type:'episode'}, {id:'unnamed',artists:[{id:'a',name:'A'}]}, {id:'artistless',name:'X'}, {item:complete}, {track:complete},complete]}:null},'fixture','source');
 assert.equal(source.name,'Shared playlist');assert.equal(source.description,'');assert.equal(source.tracks.length,1);assert.equal(source.tracks[0].albumName,'Album');assert.equal(source.tracks[0].releaseDate,'2026');assert.equal(source.tracks[0].imageUrl,'image');assert.equal(source.tracks[0].durationMs,10);assert.equal(source.tracks[0].explicit,true);assert.equal(source.tracks[0].playlistIndex,1);
 const empty=await loadSharedPlaylistSource({api:async()=>null},'fixture','fav');assert.deepEqual(empty.tracks,[]);
 assert.throws(()=>buildUploadChunks([{padding:'ü'.repeat(225001)}]),/too large/);assert.deepEqual(buildUploadChunks([]),[]);
});
test('recipient copy refresh preserves the existing playlist and binds leases and completion to the recipient',async()=>{
 const h=fixture();assert.deepEqual(await h.run(),{refreshedSources:0,updatedCopies:1,warnings:[]});
 assert.ok(h.queries.find(q=>q.table==='playlist_shares').filters.some(([key,id])=>key==='owner_user_id'&&id==='recipient'));
 assert.deepEqual(h.queries.find(q=>q.table==='playlist_share_downloads').filters,[['recipient_user_id','recipient']]);
 assert.equal(h.spotifyCalls[0].path,'/playlists/existing%2Fcopy');assert.equal(h.spotifyCalls[0].opts.method,'PUT');assert.deepEqual(JSON.parse(h.spotifyCalls[1].opts.body),{uris:['spotify:track:first','spotify:track:second']});
 const claim=h.calls[0].args,complete=h.calls.at(-1).args;assert.equal(claim.p_recipient_user_id,'recipient');assert.equal(complete.p_lease_token,claim.p_lease_token);assert.equal(complete.p_spotify_playlist_id,'existing/copy');assert.equal(h.spotifyCalls.some(c=>c.opts?.method==='POST'),false);
});
test('missing/revoked/current shares and unavailable leases produce no Spotify mutations',async()=>{
 for(const options of [{shares:[]},{received:{revision:1}},{received:{revision:undefined},download:{applied_revision:undefined}},{rpc:{claim_playlist_share_sync:{data:false}}},{downloads:[]},{nullTables:['playlist_shares','playlist_share_downloads']}]){const h=fixture(options);assert.equal((await h.run()).updatedCopies,0);assert.equal(h.spotifyCalls.length,0);}
});
for(const table of ['playlist_shares','playlist_share_downloads','playlist_share_tracks'])test(`shared playlist ${table} errors surface and release claimed leases`,async()=>{
 const h=fixture({tableErrors:{[table]:new Error('database unavailable')}});await assert.rejects(h.run(),/database unavailable/);assert.equal(h.calls.some(c=>c.name==='release_playlist_share_sync'),table==='playlist_share_tracks');assert.equal(h.calls.some(c=>c.name==='complete_playlist_share_sync'),false);
});
test('received share lookup errors do not claim leases',async()=>{
 // A separate boundary mirrors a backend failure only after downloads were loaded.
 let shares=0;const query={select(){return this;},eq(){return this;},is(){return this;},in(){return this;},then(resolve){return Promise.resolve({data:[],error:++shares===2?new Error('received unavailable'):null}).then(resolve);}};
 const run=createSharedPlaylistsTask({supabase:{from(table){if(table==='playlist_share_downloads')return {...query,then(resolve){return Promise.resolve({data:[{share_id:'share'}]}).then(resolve);}};return query;}},spotify:{accessToken:async()=> 'token'}});
 await assert.rejects(run({user:{id:'recipient'}}),/received unavailable/);
});
for(const rpcName of ['claim_playlist_share_sync','complete_playlist_share_sync'])test(`recipient ${rpcName} failure cannot mark a revision applied`,async()=>{
 const h=fixture({rpc:{[rpcName]:{error:new Error('RPC unavailable')}}});await assert.rejects(h.run(),/RPC unavailable/);assert.equal(h.calls.some(c=>c.name==='release_playlist_share_sync'),rpcName==='complete_playlist_share_sync');
});
test('partial Spotify failure releases its lease and retry replaces the same playlist',async()=>{
 const failed=fixture({spotifyError:new Error('Spotify offline')});await assert.rejects(failed.run(),/Spotify offline/);assert.equal(failed.calls.at(-1).name,'release_playlist_share_sync');
 const retry=fixture();assert.equal((await retry.run()).updatedCopies,1);assert.equal(retry.spotifyCalls[0].path,failed.spotifyCalls[0].path);
 const empty=fixture({nullTables:['playlist_share_tracks']});assert.equal((await empty.run()).updatedCopies,1);assert.deepEqual(JSON.parse(empty.spotifyCalls[1].opts.body),{uris:[]});
});
test('owner refresh groups source reads and counts only successfully published revisions',async()=>{
 const h=fixture({owned:[{id:'a',source_playlist_id:'source',revision:null},{id:'b',source_playlist_id:'source',revision:3}],downloads:[],rpc:{commit_playlist_share_refresh_upload:{data:false}}});assert.equal((await h.run()).refreshedSources,0);assert.equal(h.spotifyCalls.filter(c=>c.path==='/playlists/source').length,1);assert.deepEqual(h.calls.filter(c=>c.name==='begin_playlist_share_refresh_upload').map(c=>c.args.p_expected_revision),[1,3]);
});
for(const rpcName of ['begin_playlist_share_refresh_upload','append_playlist_share_upload_chunk','commit_playlist_share_refresh_upload'])test(`owner publication stops at ${rpcName} failure`,async()=>{
 const h=fixture({owned:[{id:'a',source_playlist_id:'source'}],downloads:[],rpc:{[rpcName]:{error:new Error('publish unavailable')}}});await assert.rejects(h.run(),/publish unavailable/);assert.equal(h.calls.at(-1).name,rpcName);assert.equal(h.queries.some(q=>q.table==='playlist_share_downloads'),false);
});

test('initial recipient synchronization defaults missing applied revision to zero',async()=>{
 const initial=fixture({download:{applied_revision:null}});assert.equal((await initial.run()).updatedCopies,1);assert.equal(initial.calls[0].args.p_expected_applied_revision,0);
});
