import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {Subject} from 'rxjs';
import {SongsController} from './songs.controller';
import {PlaylistLoaderService,PlaylistLoadTask} from '@core/sync/playlist-loader/playlist-loader.service';
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const song=(id='song',extra:any={})=>({id,name:id,artists:[{id:'artist',name:'Artist'}],album:{id:'album',name:'Album'},...extra});
const artist=(id='artist',tracks:any[]=[song()])=>({id,name:id,tracks,images:[],external_urls:{spotify:`https://open.spotify.com/artist/${id}`}});
function fixture(){
  const params=new Subject<Record<string,string>>();const memory=new Map<string,string>();const tasks=new Map<string,PlaylistLoadTask>();
  const auth={logout$:new Subject<void>(),getUserId:vi.fn(()=> 'owner'),isAuthenticated:vi.fn(()=>true),isBackupActive:vi.fn(()=>false),ensureInitialSync:vi.fn().mockResolvedValue(undefined)};
  const storage={getItem:vi.fn((key:string)=>memory.get(key)??null),setItem:vi.fn((key:string,value:string)=>{memory.set(key,value);}),removeItem:vi.fn((key:string)=>memory.delete(key)),hydrateItems:vi.fn().mockResolvedValue(undefined),restoreItemsFromCloud:vi.fn().mockResolvedValue(0)};
  const validation=new PlaylistLoaderService({}as any,storage as any,auth as any,{}as any);
  const loader={readSourceManifest:vi.fn(validation.readSourceManifest.bind(validation)),isPlaylistSourceDirty:vi.fn(validation.isPlaylistSourceDirty.bind(validation)),resolveExpectedPlaylistTotal:vi.fn(validation.resolveExpectedPlaylistTotal.bind(validation)),isCachedPlaylistComplete:vi.fn(validation.isCachedPlaylistComplete.bind(validation)),getLoadingTask:vi.fn((id:string)=>tasks.get(id)),sourceManifestKey:vi.fn(validation.sourceManifestKey.bind(validation)),startLoadingTask:vi.fn((_user:string,id:string,_refresh:any,_expired:boolean)=>{const task=new PlaylistLoadTask(id);task.isRefreshing=!!_refresh;task.isLoadingTracks=true;task.isLoadingArtists=true;task.emitUpdate();tasks.set(id,task);return task;}),startNewFavouriteTracksCheck:vi.fn((_user:string,_force:boolean)=>{const task=new PlaylistLoadTask('fav','incremental-new-only');tasks.set('fav',task);return task;}),clearLoadingTask:vi.fn((id:string)=>tasks.delete(id))};
  const router={navigate:vi.fn().mockResolvedValue(true)};const navigation={navigate:vi.fn().mockResolvedValue(true)};const images={healArtistImages:vi.fn(),markArtistImageFailed:vi.fn()};const zone={run:vi.fn((work:()=>void)=>work()),runOutsideAngular:vi.fn((work:()=>void)=>work())};const change={markForCheck:vi.fn()};
  const controller=new SongsController({params} as any,router as any,auth as any,storage as any,loader as any,images as any,zone as any,navigation as any,change as any);
  const cache=(id:string,artists:any[]=[artist()],extra:Record<string,string>={})=>{const key=`owner_${id}`;memory.set(key,JSON.stringify(artists));memory.set(`${key}_Amount`,'1');memory.set(`${key}_CachedTrackCount`,'1');memory.set(`${key}_Name`,JSON.stringify(`Playlist ${id}`));memory.set(`${key}_lastUpdated`,String(Date.now()));for(const[k,v]of Object.entries(extra))memory.set(`${key}${k}`,v);};
  const load=async(id:string)=>{controller.playlistId=id;await controller.loadArtistsFromPlaylist();};
  return {controller,params,memory,tasks,auth,storage,loader,router,navigation,images,zone,change,cache,load};
}
beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-16T12:00:00'));for(const method of ['log','warn','error']as const)vi.spyOn(console,method).mockImplementation(()=>{});vi.spyOn(window,'scrollTo').mockImplementation(()=>{});});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

describe('Songs route and loader ownership regressions',()=>{
  it('detaches playlist A progress before awaiting playlist B hydration',async()=>{
    const f=fixture();await f.load('A');const a=f.tasks.get('A')!;expect(a.progress$.observers).toHaveLength(1);
    const hydration=deferred<void>();f.storage.hydrateItems.mockReturnValueOnce(hydration.promise);
    f.controller.playlistId='B';const pending=f.controller.loadArtistsFromPlaylist();
    a.playlistName='Stale A';a.isComplete=true;a.emitUpdate();
    expect(f.controller.playlistName).not.toBe('Stale A');expect(f.loader.clearLoadingTask).not.toHaveBeenCalledWith('B');expect(a.progress$.observers).toHaveLength(0);
    hydration.resolve();await pending;f.controller.ngOnDestroy();
  });
  it('closes playlist A album selection when playlist B takes over',async()=>{
    const f=fixture();f.cache('A');f.cache('B');await f.load('A');f.controller.openAlbumDetails({id:'A-album',tracks:[song('A-song')]});
    await f.load('B');expect(f.controller.selectedAlbum).toBeNull();f.controller.ngOnDestroy();
  });
  it('does not react to route changes after destruction',async()=>{
    const f=fixture();f.controller.ngOnDestroy();f.params.next({id:'after-destroy'});await Promise.resolve();await Promise.resolve();
    expect(f.storage.hydrateItems).not.toHaveBeenCalled();expect(f.loader.startLoadingTask).not.toHaveBeenCalled();
  });
  it('unsubscribes an already-complete task even when its BehaviorSubject emits synchronously',async()=>{
    const f=fixture();const task=new PlaylistLoadTask('A');task.isComplete=true;task.emitUpdate();f.tasks.set('A',task);f.cache('A');
    await f.load('A');expect(task.progress$.observers).toHaveLength(0);f.controller.ngOnDestroy();
  });
});

describe('Songs cache, cloud and task selection boundaries',()=>{
  it('uses a complete fresh owner cache without starting Spotify or cloud work',async()=>{
    const f=fixture();f.cache('A');await f.load('A');expect(f.controller.playlistName).toBe('Playlist A');expect(f.controller.totalTracks).toBe(1);expect(f.controller.isLoading).toBe(false);expect(f.controller.playlistTracks.map(t=>t.id)).toEqual(['song']);expect(f.loader.startLoadingTask).not.toHaveBeenCalled();expect(f.storage.restoreItemsFromCloud).not.toHaveBeenCalled();expect(f.images.healArtistImages).toHaveBeenCalledWith(f.controller.filteredArtists,'owner_A');f.controller.ngOnDestroy();
  });
  it.each([{payload:'{bad'}, {payload:'{}'}, {amount:'{bad'}, {amount:'-5'}, {amount:'"wrong"'}, {count:'{bad'}, {count:'3'}, {lastUpdated:'not-time'}])('recovers an unusable cache %j through a shared task',async variant=>{
    const f=fixture();f.cache('A');if('payload'in variant)f.memory.set('owner_A',variant.payload!);if('amount'in variant){f.memory.set('owner_A_Amount',variant.amount!);f.memory.delete('owner_A_CachedTrackCount');}if('count'in variant)f.memory.set('owner_A_CachedTrackCount',variant.count!);if('lastUpdated'in variant)f.memory.set('owner_A_lastUpdated',variant.lastUpdated!);
    await f.load('A');expect(f.loader.startLoadingTask).toHaveBeenCalledTimes(1);expect(f.storage.restoreItemsFromCloud).not.toHaveBeenCalled();f.controller.ngOnDestroy();
  });
  it('refreshes a source-dirty cache even before the daily expiry and treats malformed optional name as recoverable',async()=>{
    const f=fixture();f.cache('A');f.loader.isPlaylistSourceDirty.mockReturnValue(true);await f.load('A');expect(f.loader.startLoadingTask).toHaveBeenCalledWith('owner','A',true,false);f.controller.ngOnDestroy();
    const g=fixture();g.cache('A',undefined,{_Name:'{bad'});await g.load('A');expect(g.loader.startLoadingTask).toHaveBeenCalledTimes(1);g.controller.ngOnDestroy();
  });
  it('lets prompt complete cloud restoration win and clears local consistency markers before applying the replacement',async()=>{
    const f=fixture();f.auth.isBackupActive.mockReturnValue(true);f.memory.set('owner_A_CachedTrackCount','99');f.memory.set('owner_A_SourceManifest','old marker');
    f.storage.restoreItemsFromCloud.mockImplementation(async(keys:any,canApply:any,beforeApply:any)=>{expect(keys).toContain('owner_A_SourceManifest');expect(canApply()).toBe(true);beforeApply();expect(f.memory.has('owner_A_CachedTrackCount')).toBe(false);expect(f.memory.has('owner_A_SourceManifest')).toBe(false);f.cache('A');return 6;});
    await f.load('A');expect(f.controller.playlistName).toBe('Playlist A');expect(f.loader.startLoadingTask).not.toHaveBeenCalled();f.controller.ngOnDestroy();
  });
  it('preserves cached contents during cloud recovery and prevents a late restore overwriting Spotify fallback',async()=>{
    const f=fixture();f.cache('A',undefined,{_lastUpdated:'0'});f.auth.isBackupActive.mockReturnValue(true);const restore=deferred<number>();let apply!:()=>boolean;
    f.storage.restoreItemsFromCloud.mockImplementation((_keys:any,canApply:any)=>{apply=canApply;return restore.promise;});const pending=f.load('A');await vi.advanceTimersByTimeAsync(0);
    expect(f.controller.artists).toHaveLength(1);expect(f.controller.isRefreshing).toBe(true);expect(f.controller.isLoading).toBe(false);expect(f.loader.startLoadingTask).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(750);await pending;expect(f.loader.startLoadingTask).toHaveBeenCalledTimes(1);expect(apply()).toBe(false);restore.resolve(6);await Promise.resolve();expect(f.controller.playlistName).not.toBe('Late cloud');f.controller.ngOnDestroy();
  });
  it('continues through a rejected cloud request and rejects stale restoration after a newer playlist has loaded',async()=>{
    const f=fixture();f.auth.isBackupActive.mockReturnValue(true);f.storage.restoreItemsFromCloud.mockRejectedValueOnce(new Error('Isolated cloud unavailable'));await f.load('A');expect(f.loader.startLoadingTask).toHaveBeenCalledTimes(1);f.controller.ngOnDestroy();
    const g=fixture();g.auth.isBackupActive.mockReturnValue(true);const restore=deferred<number>();let apply!:()=>boolean;g.storage.restoreItemsFromCloud.mockImplementationOnce((_keys:any,canApply:any)=>{apply=canApply;return restore.promise;});const a=g.load('A');await vi.advanceTimersByTimeAsync(0);g.cache('B');await g.load('B');restore.resolve(1);await a;expect(apply()).toBe(false);expect(g.controller.playlistName).toBe('Playlist B');expect(g.loader.startLoadingTask).not.toHaveBeenCalled();g.controller.ngOnDestroy();
  });
  it('ignores older hydration and destroyed cloud results without starting a stale loader',async()=>{
    const f=fixture();const hydration=deferred<void>();f.storage.hydrateItems.mockReturnValueOnce(hydration.promise);const a=f.load('A');f.cache('B');await f.load('B');hydration.resolve();await a;expect(f.controller.playlistName).toBe('Playlist B');expect(f.loader.startLoadingTask).not.toHaveBeenCalled();f.controller.ngOnDestroy();
    const g=fixture();g.auth.isBackupActive.mockReturnValue(true);const cloud=deferred<number>();g.storage.restoreItemsFromCloud.mockReturnValue(cloud.promise);const b=g.load('A');await vi.advanceTimersByTimeAsync(0);g.controller.ngOnDestroy();cloud.resolve(0);await b;expect(g.loader.startLoadingTask).not.toHaveBeenCalled();
  });
  it('joins an active full task with cached contents and maps progress counters until completion',async()=>{
    const f=fixture();f.cache('A');const task=new PlaylistLoadTask('A');task.isLoadingArtists=true;task.totalTracks=10;task.loadedTracksCount=4;task.totalUniqueArtists=3;task.loadedArtistsDetailsCount=2;task.playlistName='Loading A';task.cooldownMessage='Try again shortly';task.artists=[artist('new')];task.emitUpdate();f.tasks.set('A',task);
    await f.load('A');expect(f.controller).toMatchObject({isLoading:false,isLoadingArtists:true,totalTracks:10,loadedTracksCount:4,totalUniqueArtists:3,loadedArtistsDetailsCount:2,playlistName:'Loading A',cooldownMessage:'Try again shortly'});
    f.cache('A',[artist('complete')]);task.isComplete=true;task.emitUpdate();expect(f.controller.artists[0].id).toBe('complete');expect(f.controller.isLoadingArtists).toBe(false);expect(f.loader.clearLoadingTask).toHaveBeenCalledWith('A');expect(task.progress$.observers).toHaveLength(0);f.controller.ngOnDestroy();
  });
  it('keeps refresh content until a full task publishes replacement and handles silent Liked Songs checks',async()=>{
    const f=fixture();f.cache('A');await f.load('A');f.memory.set('owner_A_lastUpdated','0');await f.load('A');const task=f.tasks.get('A')!;task.artists=[artist('partial')];task.isRefreshing=true;task.emitUpdate();expect(f.controller.artists[0].id).toBe('artist');task.isRefreshing=false;task.emitUpdate();expect(f.controller.artists[0].id).toBe('partial');f.controller.ngOnDestroy();
    const g=fixture();g.cache('fav');await g.load('fav');g.controller.playlistName='Keep cached name';await g.controller.refreshPlaylist();const incremental=g.tasks.get('fav')!;incremental.playlistName='Should remain silent';incremental.isLoadingTracks=true;incremental.emitUpdate();expect(g.controller.playlistName).toBe('Keep cached name');g.cache('fav',[artist('new-favourite')]);incremental.isComplete=true;incremental.emitUpdate();expect(g.controller.artists[0].id).toBe('new-favourite');g.controller.ngOnDestroy();
  });
  it('uses incremental favourite refresh only for a complete source manifest and preserves ordinary refresh delegation',async()=>{
    const f=fixture();f.cache('fav',undefined,{_lastUpdated:'0'});f.loader.readSourceManifest.mockReturnValue({entries:[{}],sourceTotal:1,uniqueUsableTrackCount:1}as any);await f.load('fav');expect(f.loader.startNewFavouriteTracksCheck).toHaveBeenCalledWith('owner',true);f.controller.ngOnDestroy();
    const g=fixture();g.cache('A');await g.load('A');await g.controller.refreshPlaylist();expect(g.loader.clearLoadingTask).toHaveBeenCalledWith('A');expect(g.change.markForCheck).toHaveBeenCalled();g.controller.ngOnDestroy();
  });
});

describe('Songs retained tracks, filters and destinations',()=>{
  it('normalizes distinct track identities and credits, skips unusable entries and builds ranked album counts',()=>{
    const f=fixture();f.controller.artists=[artist('first',[null,{},song('duplicate',{added_at:'2026-10-15T12:00:00Z',album:{id:'shared',name:'Shared',artists:[{name:'Album artist'}]},duration_ms:1000}),song('blank',{name:' '}),song('missing-artist',{artists:[]}),song('empty-credit',{artists:[null,{name:' '}]}),song('bad-date',{added_at:'invalid',album:{name:'Named album',images:[{url:'cover'}]}})]),artist('guest',[song('duplicate'),song('second',{duration_ms:2000,album:{id:'shared',name:'Shared'}})]),{id:'no-tracks'}];
    f.controller.updatePlaylistTracks();expect(f.controller.playlistTracks.map(t=>t.id)).toEqual(['duplicate','bad-date','second']);expect(f.controller.playlistTracks[0].artists).toContainEqual({id:'guest',name:'guest'});expect(f.controller.playlistTracks[0].added_at_time).toBe(Date.parse('2026-10-15T12:00:00Z'));expect(f.controller.playlistTracks[1].added_at_time).toBe(0);
    expect(f.controller.playlistAlbums.find(a=>a.id==='shared')).toMatchObject({trackCount:2,durationMs:3000,artists:['Album artist'],spotifyUrl:'https://open.spotify.com/album/shared'});expect(f.controller.playlistAlbums.find(a=>a.name==='Named album')).toMatchObject({id:null,imageUrl:'cover',spotifyUrl:null});f.controller.ngOnDestroy();
  });
  it('excludes absent albums, uses ID-only names and merges name-only albums case-insensitively',()=>{
    const f=fixture();f.controller.playlistTracks=[song('none',{album:null}),song('empty',{album:{}}),song('id-only',{album:{id:42}}),song('named-1',{album:{name:' Mixed Case ',external_urls:{spotify:'https://open.spotify.com/album/mixed'}}}),song('named-2',{album:{name:'mixed case'},duration_ms:200})];f.controller.updatePlaylistAlbums();expect(f.controller.playlistAlbums).toHaveLength(2);expect(f.controller.playlistAlbums[0]).toMatchObject({name:'Mixed Case',trackCount:2,durationMs:200,spotifyUrl:'https://open.spotify.com/album/mixed'});expect(f.controller.playlistAlbums[1]).toMatchObject({id:'42',name:'Unknown Album'});f.controller.ngOnDestroy();
  });
  it('filters artist names and cycles owner-specific count ordering without changing original artist order',()=>{
    const f=fixture();f.controller.artists=[artist('Alpha',[song('one')]),artist('Beta',[song('two'),song('three')]),artist('Gamma',[])];f.controller.filterArtists();expect(f.controller.filteredArtists.map(a=>a.id)).toEqual(['Alpha','Beta','Gamma']);f.controller.sortArtistsByTracks();expect(f.controller.filteredArtists.map(a=>a.id)).toEqual(['Beta','Alpha','Gamma']);f.controller.sortArtistsByTracks();expect(f.controller.filteredArtists.map(a=>a.id)).toEqual(['Gamma','Alpha','Beta']);f.controller.sortArtistsByTracks();expect(f.controller.sortOrder).toBe('none');f.controller.searchText='ALP';f.controller.onSortOrderChange();expect(f.controller.filteredArtists.map(a=>a.id)).toEqual(['Alpha']);expect(f.memory.get('owner_artists_sortOrder')).toBe('none');expect(f.controller.artists[0].id).toBe('Alpha');f.controller.ngOnDestroy();
  });
  it('filters albums by title or artist and sorts equal counts by name in either direction',()=>{
    const f=fixture();f.controller.playlistAlbums=[{name:'Zulu',artists:['Guest'],trackCount:1},{name:'Alpha',artists:['Lead'],trackCount:1},{name:'Many',artists:['Guest'],trackCount:3}];f.controller.albumSearchText='GUEST';f.controller.filterAlbums();expect(f.controller.filteredAlbums.map(a=>a.name)).toEqual(['Many','Zulu']);f.controller.albumSearchText='';f.controller.sortAlbumsByTracks();expect(f.controller.filteredAlbums.map(a=>a.name)).toEqual(['Alpha','Zulu','Many']);expect(f.memory.get('owner_albums_sortOrder')).toBe('asc');f.controller.sortAlbumsByTracks();expect(f.controller.filteredAlbums.map(a=>a.name)).toEqual(['Many','Alpha','Zulu']);f.controller.ngOnDestroy();
  });
  it.each(['duration','release','name','recently_added','unknown'])('sorts %s both directions and searches song/artist names without mutating source order',key=>{
    const f=fixture();f.controller.playlistId='normal';f.controller.playlistTracks=[song('Later',{name:'Zulu',duration_ms:2000,added_at_time:200,album:{release_date:'2025'},playlist_index:2}),song('Earlier',{name:'Alpha',duration_ms:1000,added_at_time:100,album:{release_date:'2024'},playlist_index:1}),song('Missing',{name:'',artists:[],album:null})];f.controller.trackSortKey=key;f.controller.sortAscending=true;f.controller.filterAndSortTracks();const asc=f.controller.filteredTracks.map(t=>t.id);f.controller.sortAscending=false;f.controller.filterAndSortTracks();expect(f.controller.filteredTracks.map(t=>t.id)).toEqual(key==='unknown'?asc:[...asc].reverse());expect(f.controller.playlistTracks[0].id).toBe('Later');f.controller.trackSearchText='alpha';f.controller.filterAndSortTracks();expect(f.controller.filteredTracks.map(t=>t.id)).toEqual(['Earlier']);f.controller.trackSearchText='ARTIST';f.controller.filterAndSortTracks();expect(f.controller.filteredTracks).toHaveLength(2);f.controller.ngOnDestroy();
  });
  it.each(['fav','ordinary'])('uses source indexes to resolve missing/equal added dates for %s',id=>{
    const f=fixture();f.controller.playlistId=id;f.controller.trackSortKey='recently_added';f.controller.sortAscending=true;f.controller.playlistTracks=[song('second',{playlist_index:2}),song('first',{playlist_index:1}),song('zero')];f.controller.filterAndSortTracks();expect(f.controller.filteredTracks.map(t=>t.id)).toEqual(id==='fav'?['second','first','zero']:['zero','first','second']);expect(f.controller.getDefaultSortDirection('recently_added')).toBe(id!=='fav');f.controller.ngOnDestroy();
  });
  it('toggles selected sort direction, dismisses the menu for a new category and exposes stable labels',()=>{
    const f=fixture();const event={stopPropagation:vi.fn()}as any;f.controller.toggleSortMenu(event);expect(f.controller.showSortMenu).toBe(true);f.controller.selectSortCategory('name',event);expect(f.controller).toMatchObject({trackSortKey:'name',sortAscending:true,showSortMenu:false});f.controller.selectSortCategory('name',event);expect(f.controller.trackSortDirectionLabel).toBe('descending');f.controller.selectSortCategory('name',event);expect(f.controller.trackSortDirectionLabel).toBe('ascending');expect(f.controller.getSortLabel()).toBe('Alphabetical');f.controller.trackSortKey='unknown';expect(f.controller.getSortLabel()).toBe('Recently added');f.controller.onDocumentClick();expect(f.controller.showSortMenu).toBe(false);expect(event.stopPropagation).toHaveBeenCalled();f.controller.ngOnDestroy();
  });
  it('keeps artist details and back navigation in the design route tree with the current playlist selection',async()=>{
    const f=fixture();f.controller.playlistId='A';f.controller.artists=[artist('chosen')];await f.controller.goBack();expect(f.navigation.navigate).toHaveBeenCalledWith('playlists');await f.controller.artistDetails('chosen');expect(f.navigation.navigate).toHaveBeenCalledWith('artistDetails',{id:'chosen'},{state:{tracks:f.controller.artists[0].tracks,playlistId:'A'}});await f.controller.artistDetails('missing');expect(f.navigation.navigate).toHaveBeenLastCalledWith('artistDetails',{id:'missing'},{state:{tracks:[],playlistId:'A'}});f.controller.ngOnDestroy();
  });
  it.each(['track','album','artist']as const)('opens only a safe Spotify %s destination',type=>{
    const f=fixture();const open=vi.spyOn(window,'open').mockReturnValue(null);const handler=type==='track'?f.controller.openTrackClick.bind(f.controller):type==='album'?f.controller.openAlbumClick.bind(f.controller):f.controller.openArtistClick.bind(f.controller);
    handler(`https://open.spotify.com/${type}/fixture`);expect(open).toHaveBeenCalledExactlyOnceWith(`https://open.spotify.com/${type}/fixture`,'_blank','noopener,noreferrer');for(const url of ['javascript:alert(1)','https://attacker.invalid','https://open.spotify.com/user/other','https://open.spotify.com@attacker.invalid/track/x'])handler(url);expect(open).toHaveBeenCalledTimes(1);f.controller.ngOnDestroy();
  });
  it('retains item keys when IDs are missing and formats duration/year boundaries',()=>{
    const f=fixture();for(const[type,method]of [['artist','trackArtistItem'],['track','trackSongItem'],['album','trackAlbumItem']]as const){expect(f.controller[method](2,{id:'id'})).toBe('id');expect(f.controller[method](2,{uri:'uri'})).toBe('uri');expect(f.controller[method](2,{name:'name'})).toBe(type==='artist'?'name':'name:2');expect(f.controller[method](2,null)).toBe(type==='artist'?2:`${type}:2`);}expect(f.controller.formatDurationShort(0)).toBe('0:00');expect(f.controller.formatDurationShort(61000)).toBe('1:01');expect(f.controller.formatDurationShort(59999)).toBe('0:59');expect(f.controller.getYearFromDate('')).toBe('Unknown');expect(f.controller.getYearFromDate('2024-03-01')).toBe('2024');f.controller.ngOnDestroy();
  });
});

describe('Songs retained image, keyboard, pagination and lifecycle helpers',()=>{
  it('heals failed artist artwork once, records the failed source and avoids placeholder recursion',()=>{
    const f=fixture();const a=artist();a.images=[{url:'https://fixture.invalid/broken'}]as any;const img=document.createElement('img');img.src='https://fixture.invalid/broken';f.controller.playlistId='A';f.controller.onArtistImageError(a,{target:img}as any);expect(a.images).toEqual([]);expect(img.src).toBe('https://misc.scdn.co/liked-songs/liked-songs-300.png');expect(f.images.markArtistImageFailed).toHaveBeenCalledWith('artist','https://fixture.invalid/broken');expect(f.images.healArtistImages).toHaveBeenCalledWith([a],'owner_A');f.controller.onArtistImageError(a,{target:img}as any);f.controller.onArtistImageError(a,{target:null}as any);expect(f.images.markArtistImageFailed).toHaveBeenCalledTimes(1);f.controller.ngOnDestroy();
  });
  it('falls back to the rendered image source when cached artwork metadata is absent',()=>{
    const f=fixture();const img=document.createElement('img');img.src='https://fixture.invalid/rendered';f.controller.onArtistImageError(artist(),{target:img}as any);expect(f.images.markArtistImageFailed).toHaveBeenCalledWith('artist','https://fixture.invalid/rendered');f.controller.ngOnDestroy();
  });
  it('handles album keyboard activation only for the card itself and restores its saved scroll position on Escape',()=>{
    const f=fixture();let frame!:FrameRequestCallback;vi.spyOn(window,'requestAnimationFrame').mockImplementation(callback=>{frame=callback;return 1;});const target=document.createElement('div');const child=document.createElement('button');const preventDefault=vi.fn();const album={id:'album',tracks:[{id:'last',playlist_index:3},{id:'first',playlist_index:1},{id:'unknown'}]};
    for(const event of [{key:'Tab',target,currentTarget:target},{key:'Enter',target:child,currentTarget:target}])f.controller.onAlbumCardKeydown({...event,preventDefault}as any,album);expect(f.controller.selectedAlbum).toBeNull();
    for(const key of ['Enter',' ']){f.controller.onAlbumCardKeydown({key,target,currentTarget:target,preventDefault}as any,album);expect(f.controller.selectedAlbum.tracks.map((t:any)=>t.id)).toEqual(['unknown','first','last']);}expect(preventDefault).toHaveBeenCalledTimes(2);expect(album.tracks[0].id).toBe('last');f.controller.onEscapeKey();expect(f.controller.selectedAlbum).toBeNull();frame(0);expect(window.scrollTo).toHaveBeenLastCalledWith({top:window.scrollY,behavior:'auto'});f.controller.openAlbumDetails({id:'empty'});expect(f.controller.selectedAlbum.tracks).toEqual([]);f.controller.ngOnDestroy();
  });
  it.each(['artists','songs','albums']as const)('paginates %s only within the bottom threshold and leaves exhausted lists outside Angular',view=>{
    const f=fixture();f.controller.viewStyle=view;f.controller.filteredArtists=Array.from({length:101},(_,i)=>artist(String(i),[]));f.controller.filteredTracks=Array.from({length:101},(_,i)=>song(String(i)));f.controller.filteredAlbums=Array.from({length:101},(_,i)=>({id:String(i)}));const height=vi.spyOn(document.documentElement,'scrollHeight','get').mockReturnValue(window.innerHeight+window.scrollY+301);
    f.controller.onWindowScroll();expect(f.zone.run).not.toHaveBeenCalled();height.mockReturnValue(window.innerHeight+window.scrollY+300);f.controller.onWindowScroll();const key=view==='artists'?'displayedArtistsCount':view==='songs'?'displayedTracksCount':'displayedAlbumsCount';expect(f.controller[key]).toBe(100);f.controller.onWindowScroll();expect(f.controller[key]).toBe(150);const calls=f.zone.run.mock.calls.length;f.controller.onWindowScroll();expect(f.zone.run).toHaveBeenCalledTimes(calls);if(view==='artists')expect(f.images.healArtistImages).toHaveBeenCalledTimes(2);expect(f.change.markForCheck).toHaveBeenCalledTimes(2);f.controller.ngOnDestroy();
  });
  it('installs a passive scroll listener outside Angular and removes it on destruction',()=>{
    const f=fixture();const add=vi.spyOn(window,'addEventListener');const remove=vi.spyOn(window,'removeEventListener');f.controller.ngOnInit();expect(f.zone.runOutsideAngular).toHaveBeenCalledOnce();expect(add).toHaveBeenCalledWith('scroll',expect.any(Function),{passive:true});const callback=add.mock.calls.find(call=>call[0]==='scroll')![1];f.controller.ngOnDestroy();expect(remove).toHaveBeenCalledWith('scroll',callback);
  });
  it('uses the local01:00 boundary inclusively before and after midnight rollover',()=>{
    const f=fixture();expect(f.controller.isCacheExpired(null)).toBe(true);expect(f.controller.isCacheExpired('bad')).toBe(true);vi.setSystemTime(new Date('2026-10-16T01:00:00'));expect(f.controller.isCacheExpired(String(new Date('2026-10-16T01:00:00').getTime()))).toBe(false);expect(f.controller.isCacheExpired(String(new Date('2026-10-16T00:59:59').getTime()))).toBe(true);vi.setSystemTime(new Date('2026-10-16T00:59:59'));expect(f.controller.isCacheExpired(String(new Date('2026-10-15T01:00:00').getTime()))).toBe(false);expect(f.controller.isCacheExpired(String(new Date('2026-10-15T00:59:59').getTime()))).toBe(true);f.controller.ngOnDestroy();
  });
  it('loads route-owned sort preferences and does not require initial cloud sync for an unauthenticated actor',async()=>{
    const f=fixture();f.auth.isAuthenticated.mockReturnValue(false);f.memory.set('owner_artists_sortOrder','asc');f.memory.set('owner_albums_sortOrder','asc');f.cache('A');f.params.next({id:'A'});await vi.advanceTimersByTimeAsync(0);expect(f.controller).toMatchObject({playlistId:'A',sortOrder:'asc',albumSortOrder:'asc',sortAscending:true});expect(f.auth.ensureInitialSync).not.toHaveBeenCalled();f.controller.ngOnDestroy();
  });
  it('uses anonymous owner keys when no Spotify identity exists and safely ignores rejected initial sync',async()=>{
    const f=fixture();f.auth.getUserId.mockReturnValue(null as any);f.auth.ensureInitialSync.mockRejectedValue(new Error('Isolated sync unavailable'));f.params.next({id:'A'});await vi.advanceTimersByTimeAsync(0);expect(f.loader.startLoadingTask).toHaveBeenCalledWith('anonymous','A',false,true);f.controller.sortArtistsByTracks();expect(f.memory.has('anonymous_artists_sortOrder')).toBe(true);f.controller.sortAlbumsByTracks();expect(f.memory.has('anonymous_albums_sortOrder')).toBe(true);f.controller.ngOnDestroy();
  });
  it('uses stable-route fallback when the optional design navigation service is absent',async()=>{
    const f=fixture();const controller=new SongsController({params:new Subject()}as any,f.router as any,f.auth as any,f.storage as any,f.loader as any,f.images as any,f.zone as any);controller.playlistId='A';await controller.goBack();await controller.artistDetails('missing');expect(f.router.navigate).toHaveBeenCalledWith(['/playlists']);expect(f.router.navigate).toHaveBeenCalledWith(['/artistDetails','missing'],{state:{tracks:[],playlistId:'A'}});controller.ngOnDestroy();f.controller.ngOnDestroy();
  });
});

describe('Songs route and loader ownership regressions at service handover',()=>{
  it('cannot clear a replacement task registered for the same playlist',async()=>{
    const f=fixture();await f.load('A');const previous=f.tasks.get('A')!;const replacement=new PlaylistLoadTask('A');f.tasks.set('A',replacement);f.controller.playlistName='Replacement A';previous.playlistName='Stale task';previous.isComplete=true;previous.emitUpdate();expect(f.controller.playlistName).toBe('Replacement A');expect(f.tasks.get('A')).toBe(replacement);expect(f.loader.clearLoadingTask).not.toHaveBeenCalled();f.controller.ngOnDestroy();
  });
  it('cannot start an old actor task after hydration finishes in a different account',async()=>{
    const f=fixture();const hydration=deferred<void>();f.storage.hydrateItems.mockReturnValueOnce(hydration.promise);const pending=f.load('A');f.auth.getUserId.mockReturnValue('other');hydration.resolve();await pending;expect(f.loader.startLoadingTask).not.toHaveBeenCalled();f.controller.ngOnDestroy();
  });
  it('preserves an open album when refreshing the same playlist',async()=>{
    const f=fixture();f.cache('A');await f.load('A');f.controller.openAlbumDetails({id:'keep',tracks:[song()]});await f.controller.refreshPlaylist();expect(f.controller.selectedAlbum.id).toBe('keep');f.controller.ngOnDestroy();
  });
});

describe('Songs incomplete metadata and recovery boundaries',()=>{
  it('joins an active task without a cache and recovers from malformed cached display names',async()=>{
    for(const cached of [false,true]){
      const f=fixture();if(cached)f.cache('A',undefined,{_Name:'{broken'});
      const task=new PlaylistLoadTask('A');task.playlistName='Server title';task.isLoadingTracks=true;task.emitUpdate();f.tasks.set('A',task);
      await f.load('A');expect(f.controller.playlistName).toBe('Server title');expect(f.controller.isLoadingTracks).toBe(true);expect(f.loader.startLoadingTask).not.toHaveBeenCalled();
      f.controller.ngOnDestroy();expect(task.progress$.observers).toHaveLength(0);
    }
  });
  it('falls back to Spotify after a prompt cloud response leaves an incomplete cache',async()=>{
    const f=fixture();f.auth.isBackupActive.mockReturnValue(true);f.storage.restoreItemsFromCloud.mockResolvedValue(0);
    await f.load('A');expect(f.loader.startLoadingTask).toHaveBeenCalledWith('owner','A',false,true);expect(f.controller.isLoadingTracks).toBe(true);f.controller.ngOnDestroy();
  });
  it('recovers malformed temporary cache totals without preventing refresh startup',async()=>{
    const f=fixture();f.cache('A',undefined,{_Amount:'{broken',_lastUpdated:'0'});
    await f.load('A');expect(f.loader.startLoadingTask).toHaveBeenCalledTimes(1);expect(f.controller.isRefreshing).toBe(true);f.controller.ngOnDestroy();
  });
  it('keeps an empty completed playlist usable when no artists were stored',async()=>{
    const f=fixture();await f.load('A');const task=f.tasks.get('A')!;task.isComplete=true;task.emitUpdate();
    expect(f.controller.artists).toEqual([]);expect(f.controller.isLoading).toBe(false);expect(f.controller.isLoadingTracks).toBe(false);expect(f.tasks.has('A')).toBe(false);expect(f.images.healArtistImages).not.toHaveBeenCalled();f.controller.ngOnDestroy();
  });
  it('does not invent a task when the loader declines work, including an unavailable favourite refresh',async()=>{
    const f=fixture();f.loader.startLoadingTask.mockReturnValueOnce(undefined as any);await f.load('A');expect(f.tasks.size).toBe(0);f.controller.ngOnDestroy();
    const g=fixture();g.controller.playlistId='fav';g.loader.startNewFavouriteTracksCheck.mockReturnValueOnce(undefined as any);await g.controller.refreshPlaylist();expect(g.tasks.size).toBe(0);g.controller.ngOnDestroy();
  });
  it('rejects tracks without artist credits and merges existing credit identities without duplication',()=>{
    const f=fixture();f.controller.artists=[artist('artist',[song('shared'),song('missing',{artists:undefined})]),artist('artist',[song('shared')])];
    f.controller.updatePlaylistTracks();expect(f.controller.playlistTracks.map(t=>t.id)).toEqual(['shared']);expect(f.controller.playlistTracks[0].artists).toEqual([{id:'artist',name:'Artist'}]);f.controller.ngOnDestroy();
  });
  it('uses rendered currentSrc for failed artwork and keeps anonymous image recovery scoped',()=>{
    const f=fixture();f.auth.getUserId.mockReturnValue(null as any);f.controller.playlistId='A';const image=document.createElement('img');image.src='https://fixture.invalid/original';Object.defineProperty(image,'currentSrc',{value:'https://fixture.invalid/selected'});
    f.controller.onArtistImageError({id:'artist'},{target:image}as any);expect(f.images.markArtistImageFailed).toHaveBeenCalledWith('artist','https://fixture.invalid/selected');expect(f.images.healArtistImages).toHaveBeenCalledWith([{id:'artist',images:[]}],'anonymous_A');f.controller.ngOnDestroy();
  });
  it('finds artist-only track matches when titles and whole artist lists are absent',()=>{
    const f=fixture();f.controller.playlistTracks=[{id:'artist-only',artists:[{name:'Match'}]},{id:'none'},{id:'title',name:'Matching title'}];f.controller.trackSearchText='match';
    f.controller.filterAndSortTracks();expect(f.controller.filteredTracks.map(t=>t.id)).toEqual(['artist-only','title']);f.controller.ngOnDestroy();
  });
  it('resets pagination when album title search is cleared without relying on an artist match',()=>{
    const f=fixture();f.controller.playlistAlbums=[{name:'Title Match',artists:[],trackCount:1},{name:'Other',artists:[],trackCount:1}];f.controller.displayedAlbumsCount=150;f.controller.albumSearchText='title';f.controller.filterAlbums();expect(f.controller.filteredAlbums.map(a=>a.name)).toEqual(['Title Match']);expect(f.controller.displayedAlbumsCount).toBe(50);f.controller.albumSearchText='';f.controller.filterAlbums();expect(f.controller.filteredAlbums.map(a=>a.name)).toEqual(['Other','Title Match']);f.controller.ngOnDestroy();
  });
  it('delegates the installed native scroll callback to pagination',()=>{
    const f=fixture();f.controller.filteredArtists=Array.from({length:51},(_,index)=>artist(String(index),[]));vi.spyOn(document.documentElement,'scrollHeight','get').mockReturnValue(window.innerHeight);
    f.controller.ngOnInit();f.controller.filteredArtists=Array.from({length:51},(_,index)=>artist(String(index),[]));window.dispatchEvent(new Event('scroll'));expect(f.controller.displayedArtistsCount).toBe(100);f.controller.ngOnDestroy();
  });
});

describe('Songs missing metadata ordering boundaries',()=>{
  it.each(['duration','release','name'])('orders missing %s metadata consistently in either source order',key=>{
    for(const reverse of [false,true]){
      const f=fixture();const tracks=[{id:'missing',artists:[]},{id:'present',name:'Present',duration_ms:1000,album:{release_date:'2025'},artists:[]}];f.controller.playlistTracks=reverse?[...tracks].reverse():tracks;f.controller.trackSortKey=key;f.controller.sortAscending=true;f.controller.filterAndSortTracks();expect(f.controller.filteredTracks.map(t=>t.id)).toEqual(['missing','present']);f.controller.sortAscending=false;f.controller.filterAndSortTracks();expect(f.controller.filteredTracks.map(t=>t.id)).toEqual(['present','missing']);f.controller.ngOnDestroy();
    }
  });
  it('orders album tracks with absent positions before positioned tracks regardless of input order',()=>{
    const f=fixture();f.controller.openAlbumDetails({tracks:[{id:'missing-a'},{id:'one',playlist_index:1},{id:'missing-b'}]});expect(f.controller.selectedAlbum.tracks.map((t:any)=>t.id)).toEqual(['missing-a','missing-b','one']);f.controller.ngOnDestroy();
  });
  it('rebuilds albums in descending song count before the user selects a different sort',()=>{
    const f=fixture();f.controller.playlistTracks=[song('one',{album:{id:'small',name:'Small'}}),song('two',{album:{id:'large',name:'Large'}}),song('three',{album:{id:'large',name:'Large'}})];f.controller.updatePlaylistAlbums();expect(f.controller.playlistAlbums.map(a=>[a.id,a.trackCount])).toEqual([['large',2],['small',1]]);f.controller.ngOnDestroy();
  });
  it('disregards a negative cached-track marker when the actual cache is complete',async()=>{
    const f=fixture();f.cache('A',undefined,{_CachedTrackCount:'-1'});await f.load('A');expect(f.controller.playlistTracks.map(t=>t.id)).toEqual(['song']);expect(f.controller.isLoading).toBe(false);expect(f.loader.startLoadingTask).not.toHaveBeenCalled();f.controller.ngOnDestroy();
  });
  it('keeps a nameless cache and anonymous preference updates usable without artwork',async()=>{
    const f=fixture();f.cache('A',[]);f.memory.set('owner_A_Amount','0');f.memory.set('owner_A_CachedTrackCount','0');f.memory.delete('owner_A_Name');await f.load('A');expect(f.controller.playlistName).toBe('');expect(f.controller.isLoading).toBe(false);expect(f.images.healArtistImages).not.toHaveBeenCalled();f.auth.getUserId.mockReturnValue(null as any);f.controller.sortOrder='asc';f.controller.onSortOrderChange();expect(f.memory.get('anonymous_artists_sortOrder')).toBe('asc');f.controller.playlistId='fav';await f.controller.refreshPlaylist();expect(f.loader.startNewFavouriteTracksCheck).toHaveBeenCalledWith('anonymous',true);f.controller.ngOnDestroy();
  });
});
