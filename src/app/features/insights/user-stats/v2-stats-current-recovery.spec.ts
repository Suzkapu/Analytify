import {ChangeDetectorRef} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {ActivatedRoute} from '@angular/router';
import {Subject} from 'rxjs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {V2UserStatsComponent} from './v2-user-stats.component';

afterEach(()=>vi.restoreAllMocks());
const song={id:'song',name:'Recovered song',artists:[{name:'Artist'}],album:{images:[]}};
const artist={id:'artist',name:'Artist',genres:['pop'],images:[]};
async function setup(cached=false){
  TestBed.resetTestingModule();
  // Start the tested request explicitly; unrelated scheduled history hydration is outside this workflow.
  vi.spyOn(V2UserStatsComponent.prototype,'ngOnInit').mockImplementation(()=>{});
  const values=new Map<string,string>();
  if(cached)for(const [part,value] of Object.entries({tracks:[{...song,name:'Cached song'}],artists:[artist],genres:[{name:'pop',count:1,percentage:100}],lastUpdated:'1'}))values.set(`owner_stats_short_term_${part}`,typeof value==='string'?value:JSON.stringify(value));
  const batches:Subject<any>[][]=[];
  const spotify={getUserTopArtists:vi.fn(()=>{const b=Array.from({length:4},()=>new Subject<any>());batches.push(b);return b[0];}),getUserTopTracks:vi.fn((_r:string,_l:number,offset:number)=>batches.at(-1)![offset===0?1:offset===50?2:3])};
  const account={spotify:'owner',cloud:null as string|null};
  await TestBed.configureTestingModule({imports:[V2UserStatsComponent],providers:[
    {provide:SpotifyDataService,useValue:spotify},
    {provide:SpotifyAuthService,useValue:{getUserId:()=>account.spotify,getSupabaseUserId:()=>account.cloud,isBackupActive:()=>false}},
    {provide:StorageService,useValue:{hydrateItems:vi.fn().mockResolvedValue(undefined),getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),getStatsHistory:vi.fn().mockResolvedValue([]),saveStatsHistory:vi.fn().mockResolvedValue(undefined)}},
    ...[SupabaseService,StatsSharingService,ParticipantSpotifyService,ActivatedRoute].map(provide=>({provide,useValue:null}))
  ]}).compileComponents();
  const fixture=TestBed.createComponent(V2UserStatsComponent),component=fixture.componentInstance,element=fixture.nativeElement as HTMLElement;
  document.body.appendChild(element);
  async function render(){fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();fixture.detectChanges();await fixture.whenStable();}
  await render();await component.loadStats();batches[0][0].error(new Error('Isolated retrieval failure'));await render();
  function finish(index=1){for(const [i,request] of batches[index].entries()){request.next({items:i===0?[artist]:i===1?[song]:[]});request.complete();}}
  async function retry(){const button=element.querySelector<HTMLButtonElement>('v2-current-stats-feedback button')!;button.focus();button.click();await render();}
  function destroy(){fixture.destroy();element.remove();}
  return {fixture,component,element,render,retry,finish,destroy,spotify,account};
}

describe('Stats current Retry focus and invalidation integration',()=>{
  it.each([false,true])('keeps keyboard focus through pending and atomic success, cached=%s',async cached=>{
    const s=await setup(cached);await s.retry();
    expect(document.activeElement).toBe(s.element.querySelector('v2-current-stats-feedback section'));
    s.component.retryCurrentStats();await s.render();expect(s.spotify.getUserTopArtists).toHaveBeenCalledTimes(2);
    s.finish();await s.render();expect(document.activeElement).toBe(s.element.querySelector('.stats-results-heading'));
    expect(s.element.textContent).toContain('Recovered song');s.component.retryCurrentStats();expect(s.spotify.getUserTopArtists).toHaveBeenCalledTimes(2);s.destroy();
  });
  it('preserves deliberate search focus during an outstanding Retry',async()=>{
    const s=await setup();await s.retry();const search=s.element.querySelector<HTMLInputElement>('input[type="search"]')!;search.focus();await s.render();
    s.finish();await s.render();expect(document.activeElement).toBe(search);expect(s.element.textContent).toContain('Recovered song');s.destroy();
  });
  it('focuses the replacement alert on repeated failure without duplicate automatic recovery',async()=>{
    const s=await setup();await s.retry();s.component.retryCurrentStats();
    // The same user-requested operation can fail again; no timed retry is implied.
    const requestCount=s.spotify.getUserTopArtists.mock.calls.length;
    const second=s.spotify.getUserTopArtists.mock.results[1].value as Subject<any>;second.error(new Error('Still unavailable'));await s.render();
    expect(document.activeElement).toBe(s.element.querySelector('[role="alert"]'));expect(s.spotify.getUserTopArtists).toHaveBeenCalledTimes(requestCount);s.destroy();
  });
  it('rejects stale Retry focus and results after changing the Spotify account',async()=>{
    const s=await setup();await s.retry();s.account.spotify='replacement';await s.render();s.finish();await s.render();
    expect(s.element.textContent).not.toContain('Recovered song');s.destroy();
  });
  it('does not use current-range recovery while viewing a saved date or after destruction',async()=>{
    const s=await setup();s.component.selectedSnapshotId='saved-date';s.component.retryCurrentStats();expect(s.spotify.getUserTopArtists).toHaveBeenCalledTimes(1);
    s.component.selectedSnapshotId='current';await s.retry();s.destroy();s.component.retryCurrentStats();expect(s.spotify.getUserTopArtists).toHaveBeenCalledTimes(2);
  });
});
