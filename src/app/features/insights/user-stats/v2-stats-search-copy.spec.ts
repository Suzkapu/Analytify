import {ChangeDetectorRef} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {ActivatedRoute} from '@angular/router';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {V2UserStatsComponent} from './v2-user-stats.component';

afterEach(()=>{vi.restoreAllMocks();TestBed.resetTestingModule();document.querySelectorAll('app-v2-user-stats').forEach(element=>element.remove());});
async function setup(){
  vi.spyOn(V2UserStatsComponent.prototype,'ngOnInit').mockImplementation(()=>{});
  const spotify={getUserTopTracks:vi.fn(),getUserTopArtists:vi.fn()};
  await TestBed.configureTestingModule({imports:[V2UserStatsComponent],providers:[
    {provide:SpotifyDataService,useValue:spotify},
    {provide:SpotifyAuthService,useValue:{getUserId:()=> 'owner',getSupabaseUserId:()=>null,isBackupActive:()=>false}},
    ...[StorageService,SupabaseService,StatsSharingService,ParticipantSpotifyService,ActivatedRoute].map(provide=>({provide,useValue:null}))
  ]}).compileComponents();
  const fixture=TestBed.createComponent(V2UserStatsComponent),component=fixture.componentInstance,element=fixture.nativeElement as HTMLElement;
  document.body.appendChild(element);
  component.isLoading=false;component.topTracks=[{id:'song',name:'Midnight Drive',artists:[{name:'Neon Coast'}],album:{images:[]}}];
  component.topArtists=[{id:'artist',name:'Neon Coast',images:[],genres:['pop']}];component.topGenres=[{name:'pop',count:1,percentage:100}];
  async function render(){fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();fixture.detectChanges();await fixture.whenStable();}
  await render();const input=element.querySelector<HTMLInputElement>('input[type="search"]')!;
  async function type(value:string){input.value=value;input.dispatchEvent(new Event('input'));await render();}
  return {fixture,component,element,input,render,type,spotify};
}
describe('canonical Stats search copy preserves intended filtering',()=>{
  it('uses the designed song hint while keeping artist matching, clearing and no-results recovery',async()=>{
    const s=await setup();
    expect(s.element.querySelector('v2-search-filters label')?.textContent).toBe('Search songs or artists');
    await s.type('  NEON  ');expect(s.element.querySelector('.v2-ranking-list')?.textContent).toContain('Midnight Drive');
    await s.type('absent song');expect(s.element.querySelector('.v2-ranking-list')?.textContent).not.toContain('Midnight Drive');
    await s.type('');expect(s.element.querySelector('.v2-ranking-list')?.textContent).toContain('Midnight Drive');
    expect(s.spotify.getUserTopTracks).not.toHaveBeenCalled();s.fixture.destroy();
  });
  it('associates the native search label with the actual input',async()=>{
    const s=await setup();expect(s.input.labels).toHaveLength(1);s.fixture.destroy();
  });
  it('renders the canonical visible song hint',async()=>{
    const s=await setup();expect(s.input.placeholder).toBe('Search songs');s.fixture.destroy();
  });
  it('keeps category-specific typed queries local when switching artist and genre views',async()=>{
    const s=await setup();
    s.component.selectedCategory='artists';await s.render();expect(s.input.placeholder).toBe('Search artists');
    await s.type('NEON');expect(s.element.querySelector('.v2-artist-rankings')?.textContent).toContain('Neon Coast');
    s.component.selectedCategory='genres';await s.render();expect(s.input.placeholder).toBe('Search genres');expect(s.input.value).toBe('NEON');
    await s.type('pop');expect(s.element.textContent).toContain('pop');
    expect(s.spotify.getUserTopArtists).not.toHaveBeenCalled();s.fixture.destroy();
  });
});
