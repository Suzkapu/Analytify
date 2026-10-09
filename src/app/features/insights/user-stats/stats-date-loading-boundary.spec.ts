import {afterEach, describe, expect, it, vi} from 'vitest';
import {UserStatsComponent} from './user-stats.component';

function deferred<T>() {
  let resolve!: (value:T)=>void, reject!: (reason:unknown)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
const timestamp=new Date('2026-10-04T12:00:00Z').getTime();
function metadata(id='snapshot-A',isLoaded:boolean|'loading'=false) {
  return {id,timestamp,snapshotDate:'2026-10-04',topTracks:[],topArtists:[],topGenres:[],isLoaded};
}
const full={topTracks:[{id:'saved-track',name:'Saved song',artist:'Saved artist'}],topArtists:[],topGenres:[]};
function setup() {
  const account={cloud:'owner-A',spotify:'spotify-A',sharedOwner:''};
  const auth={getSupabaseUserId:()=>account.cloud,getUserId:()=>account.spotify,isBackupActive:()=>false};
  const storage={saveStatsHistory:vi.fn().mockResolvedValue(undefined)};
  const sdk={loadStatsSnapshotById:vi.fn()};
  const component=new UserStatsComponent(null as never,auth as never,storage as never,sdk as never, {snapshot:{paramMap:{get:()=>account.sharedOwner}}} as never);
  component.historyData=[metadata()];component.selectedSnapshotId=String(timestamp);
  return {component,account,storage,sdk};
}
async function settle() {for(let i=0;i<4;i++)await Promise.resolve();}
afterEach(()=>vi.restoreAllMocks());

describe('selected Stats date loading service boundary',()=>{
  it('does not present metadata as a successful empty ranking when cloud access is unavailable',()=>{
    const {component,account,sdk,storage}=setup();
    account.cloud='';
    component.ensureSnapshotLoaded(String(timestamp));
    expect(component.historyData[0]).toMatchObject({isLoaded:false,topTracks:[]});
    expect(component.isSnapshotLoading()).toBe(false);
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    account.cloud='owner-A';
    sdk.loadStatsSnapshotById.mockResolvedValue(full);
    component.ensureSnapshotLoaded(String(timestamp));
    expect(sdk.loadStatsSnapshotById).toHaveBeenCalledExactlyOnceWith('owner-A','snapshot-A');
    component.ngOnDestroy();
  });

  it('treats a successful empty payload as loaded and persists it without repeating the request',async()=>{
    const {component,sdk,storage}=setup();
    sdk.loadStatsSnapshotById.mockResolvedValue({topTracks:[],topArtists:[],topGenres:[]});
    component.ensureSnapshotLoaded(String(timestamp));await settle();
    expect(component.historyData[0]).toMatchObject({isLoaded:true,topTracks:[],topArtists:[],topGenres:[]});
    expect(component.isSnapshotLoading()).toBe(false);
    component.ensureSnapshotLoaded(String(timestamp));
    expect(sdk.loadStatsSnapshotById).toHaveBeenCalledOnce();
    expect(storage.saveStatsHistory).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({userId:'spotify-A',isLoaded:true,topTracks:[]}));
    component.ngOnDestroy();
  });

  it('keeps the primary payload while the comparison fails and retries independently',async()=>{
    const {component,sdk,storage}=setup(),request=deferred<typeof full>();
    component.topTracks=full.topTracks;component.selectedSnapshotId='current';component.compareSnapshotId=String(timestamp);
    sdk.loadStatsSnapshotById.mockReturnValueOnce(request.promise);
    component.ensureSnapshotLoaded(String(timestamp));
    expect(component.filteredTracks).toEqual(full.topTracks);
    expect(component.getComparisonSnapshot()).toBeNull();
    request.resolve(null as never);await settle();
    expect(component.filteredTracks).toEqual(full.topTracks);
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    const retry=deferred<typeof full>();sdk.loadStatsSnapshotById.mockReturnValueOnce(retry.promise);
    component.ensureSnapshotLoaded(String(timestamp));
    expect(component.selectedSnapshotId).toBe('current');
    expect(component.filteredTracks).toEqual(full.topTracks);
    retry.resolve(full);await settle();
    expect(component.getComparisonSnapshot()).toMatchObject(full);
    expect(sdk.loadStatsSnapshotById).toHaveBeenCalledTimes(2);
    component.ngOnDestroy();
  });

  it('loads the selected owner snapshot once while pending and keeps its date/identity when saving offline',async()=>{
    const {component,storage,sdk}=setup(),request=deferred<typeof full>();
    sdk.loadStatsSnapshotById.mockReturnValue(request.promise);
    component.ensureSnapshotLoaded(String(timestamp));component.ensureSnapshotLoaded(String(timestamp));
    expect(sdk.loadStatsSnapshotById.mock.calls).toEqual([['owner-A','snapshot-A']]);
    expect(component.isSnapshotLoading()).toBe(true);
    request.resolve(full);await settle();
    expect(component.historyData[0]).toMatchObject({...metadata(),...full,isLoaded:true});
    expect(component.selectedSnapshotId).toBe(String(timestamp));
    expect(storage.saveStatsHistory).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      userId:'spotify-A',id:'snapshot-A',timestamp,snapshotDate:'2026-10-04',topTracks:full.topTracks,isLoaded:true
    }));
    component.ensureSnapshotLoaded(String(timestamp));expect(sdk.loadStatsSnapshotById).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  });

  it('allows an unavailable date to recover through an explicit retry without persisting empty data',async()=>{
    const {component,storage,sdk}=setup();
    sdk.loadStatsSnapshotById.mockResolvedValueOnce(null).mockResolvedValueOnce(full);
    component.ensureSnapshotLoaded(String(timestamp));await settle();
    expect(component.isSnapshotLoading()).toBe(false);expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    expect(component.selectedSnapshotId).toBe(String(timestamp));
    component.ensureSnapshotLoaded(String(timestamp));await settle();
    expect(component.historyData[0].topTracks).toEqual(full.topTracks);
    expect(sdk.loadStatsSnapshotById.mock.calls).toEqual([['owner-A','snapshot-A'],['owner-A','snapshot-A']]);
    expect(storage.saveStatsHistory).toHaveBeenCalledOnce();component.ngOnDestroy();
  });

  it('keeps successful cloud data visible when local persistence fails',async()=>{
    const {component,storage,sdk}=setup();
    sdk.loadStatsSnapshotById.mockResolvedValue(full);storage.saveStatsHistory.mockRejectedValue(new Error('Isolated quota failure'));
    component.ensureSnapshotLoaded(String(timestamp));await settle();
    expect(component.historyData[0]).toMatchObject({...full,isLoaded:true});
    component.ensureSnapshotLoaded(String(timestamp));expect(sdk.loadStatsSnapshotById).toHaveBeenCalledTimes(1);
    component.ngOnDestroy();
  });

  it('ignores an older range rejection instead of resetting the new range snapshot with the same date',async()=>{
    const {component,storage,sdk}=setup(),request=deferred<typeof full>();
    sdk.loadStatsSnapshotById.mockReturnValue(request.promise);vi.spyOn(console,'error').mockImplementation(()=>{});
    component.ensureSnapshotLoaded(String(timestamp));
    component.selectedRange='medium_term';component.historyData=[metadata('snapshot-B','loading')];
    request.reject(new Error('Isolated old-range failure'));await settle();
    expect(component.historyData[0]).toMatchObject({id:'snapshot-B',isLoaded:'loading'});
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();component.ngOnDestroy();
  });

  it('does not apply or persist another account\'s late response under the current account',async()=>{
    const {component,account,storage,sdk}=setup(),request=deferred<typeof full>();
    sdk.loadStatsSnapshotById.mockReturnValue(request.promise);component.ensureSnapshotLoaded(String(timestamp));
    account.cloud='owner-B';account.spotify='spotify-B';component.historyData=[metadata('snapshot-B','loading')];
    request.resolve(full);await settle();
    expect(component.historyData[0]).toMatchObject({id:'snapshot-B',isLoaded:'loading',topTracks:[]});
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    expect(sdk.loadStatsSnapshotById.mock.calls).toEqual([['owner-A','snapshot-A']]);component.ngOnDestroy();
  });

  it.each(['ready','unavailable','failed'] as const)('ignores a late %s response after the requesting component is destroyed',async outcome=>{
    const {component,storage,sdk}=setup(),request=deferred<typeof full>();
    vi.spyOn(console,'error').mockImplementation(()=>{});
    sdk.loadStatsSnapshotById.mockReturnValue(request.promise);component.ensureSnapshotLoaded(String(timestamp));
    component.ngOnDestroy();
    if(outcome==='failed') request.reject(new Error('Isolated detached request failure'));
    else request.resolve(outcome==='ready'?full:null as never);
    await settle();
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    expect(component.historyData[0]).toMatchObject({topTracks:[],isLoaded:'loading'});
  });

  it('does not merge an older snapshot into replacement metadata for the same date',async()=>{
    const {component,storage,sdk}=setup(),request=deferred<typeof full>();
    sdk.loadStatsSnapshotById.mockReturnValue(request.promise);component.ensureSnapshotLoaded(String(timestamp));
    component.historyData=[metadata('replacement-snapshot','loading')];
    request.resolve(full);await settle();
    expect(component.historyData[0]).toMatchObject({id:'replacement-snapshot',isLoaded:'loading',topTracks:[]});
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();component.ngOnDestroy();
  });
  it.each(['cloud','spotify','sharedOwner'] as const)('ignores late data when only the %s identity changes, even with identical snapshot metadata',async identity=>{
    const {component,account,storage,sdk}=setup(),request=deferred<typeof full>();
    sdk.loadStatsSnapshotById.mockReturnValue(request.promise);
    component.ensureSnapshotLoaded(String(timestamp));
    account[identity]='another-owner';
    request.resolve(full);await settle();
    expect(component.historyData[0]).toMatchObject({id:'snapshot-A',topTracks:[],isLoaded:'loading'});
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();component.ngOnDestroy();
  });

  it('does not request private saved dates while viewing shared stats',()=>{
    const {component,account,storage,sdk}=setup();
    account.sharedOwner='shared-owner';
    component.ensureSnapshotLoaded(String(timestamp));
    expect(sdk.loadStatsSnapshotById).not.toHaveBeenCalled();
    expect(component.historyData[0]).toMatchObject({topTracks:[],isLoaded:false});
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();component.ngOnDestroy();
  });

  it('allows a rejected current request to recover without changing the selected date',async()=>{
    const {component,storage,sdk}=setup();
    vi.spyOn(console,'error').mockImplementation(()=>{});
    sdk.loadStatsSnapshotById.mockRejectedValueOnce(new Error('Isolated network failure')).mockResolvedValueOnce(full);
    component.ensureSnapshotLoaded(String(timestamp));await settle();
    expect(component.historyData[0]).toMatchObject({topTracks:[],isLoaded:false});
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    component.ensureSnapshotLoaded(String(timestamp));await settle();
    expect(component.selectedSnapshotId).toBe(String(timestamp));
    expect(component.historyData[0]).toMatchObject({...full,isLoaded:true});
    expect(storage.saveStatsHistory).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({userId:'spotify-A'}));
    component.ngOnDestroy();
  });

  it('ignores a request from an earlier visit to the same range after changing away and back',async()=>{
    const {component,storage,sdk}=setup(),request=deferred<typeof full>();
    // Hold background current-stat hydration at its service boundary while
    // exercising real range navigation; teardown cancels scheduled history.
    Object.assign(storage,{hydrateItems:()=>new Promise<void>(()=>{})});
    sdk.loadStatsSnapshotById.mockReturnValue(request.promise);
    component.ensureSnapshotLoaded(String(timestamp));
    component.changeRange('medium_term');component.changeRange('short_term');
    component.historyData=[metadata('snapshot-A','loading')];
    component.selectedSnapshotId=String(timestamp);
    request.resolve(full);await settle();
    expect(component.historyData[0]).toMatchObject({id:'snapshot-A',topTracks:[],isLoaded:'loading'});
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();component.ngOnDestroy();
  });

  it.each([['selected','unavailable'],['selected','failed'],['comparison','unavailable'],['comparison','failed']] as const)('does not repeatedly request a %s date after a %s response while rendering and filtering',async(purpose,outcome)=>{
    const {component,sdk,storage}=setup();
    vi.spyOn(console,'error').mockImplementation(()=>{});
    if(outcome==='failed') sdk.loadStatsSnapshotById.mockRejectedValue(new Error('Isolated date-load failure'));
    else sdk.loadStatsSnapshotById.mockResolvedValue(null);
    const unrelated={...metadata('unrelated-snapshot'),timestamp:timestamp+86400000,snapshotDate:'2026-10-05'};
    component.historyData=[metadata(),unrelated];
    if(purpose==='comparison') {
      component.selectedSnapshotId='current';component.compareSnapshotId=String(timestamp);
      component.topTracks=full.topTracks;
    }
    for(const query of ['', 'Saved', 'song', '']) {
      component.statsSearchQuery=query;
      void component.filteredTracks;void component.filteredArtists;void component.filteredGenres;
      await settle();
    }
    vi.mocked(console.error).mockClear();
    Object.assign(storage,{getStatsHistory:vi.fn().mockResolvedValue([metadata(),unrelated])});
    component.loadHistoryData();await settle();await settle();
    void component.filteredTracks;await settle();
    expect(console.error).not.toHaveBeenCalled();
    expect(sdk.loadStatsSnapshotById).toHaveBeenCalledExactlyOnceWith('owner-A','snapshot-A');
    expect(storage.saveStatsHistory).not.toHaveBeenCalled();
    expect(component.isSnapshotLoading()).toBe(false);
    expect(component.historyData[1]).toEqual(unrelated);
    sdk.loadStatsSnapshotById.mockResolvedValue(full);
    component.ensureSnapshotLoaded(String(timestamp));await settle();
    expect(sdk.loadStatsSnapshotById).toHaveBeenCalledTimes(2);
    expect(component.historyData[0]).toMatchObject({...full,isLoaded:true});
    component.ngOnDestroy();
  });

  it('keeps one pending request and its loading state while metadata is rehydrated',async()=>{
    const {component,sdk,storage}=setup(),request=deferred<typeof full>();
    sdk.loadStatsSnapshotById.mockReturnValue(request.promise);
    Object.assign(storage,{getStatsHistory:vi.fn().mockResolvedValue([metadata()])});
    component.ensureSnapshotLoaded(String(timestamp));
    component.loadHistoryData();await settle();await settle();
    void component.filteredTracks;await settle();
    expect(sdk.loadStatsSnapshotById).toHaveBeenCalledExactlyOnceWith('owner-A','snapshot-A');
    expect(component.isSnapshotLoading()).toBe(true);
    request.resolve(full);await settle();
    expect(component.historyData[0]).toMatchObject({...full,isLoaded:true});
    expect(storage.saveStatsHistory).toHaveBeenCalledOnce();component.ngOnDestroy();
  });

  it('keeps the selected local date address stable when cloud details normalize its timestamp to midnight',async()=>{
    const {component,sdk,storage}=setup();
    sdk.loadStatsSnapshotById.mockResolvedValue({...full,id:'snapshot-A',userId:'owner-A',range:'short_term',
      snapshotDate:'2026-10-04',timestamp:new Date(2026,9,4).getTime()});
    component.ensureSnapshotLoaded(String(timestamp));await settle();
    expect(component.selectedSnapshotId).toBe(String(timestamp));
    expect(component.historyData[0]).toMatchObject({id:'snapshot-A',timestamp,snapshotDate:'2026-10-04',isLoaded:true});
    expect(component.filteredTracks).toEqual(full.topTracks);
    expect(storage.saveStatsHistory).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({userId:'spotify-A',timestamp}));
    component.ngOnDestroy();
  });

});
