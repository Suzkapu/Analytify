import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {V2UserStatsComponent} from './v2-user-stats.component';
import {TestBed} from '@angular/core/testing';
import {ActivatedRoute} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {Subject} from 'rxjs';

describe('V2 Stats history recovery', () => {
  beforeEach(() => {vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-06T12:00:00'));});
  afterEach(() => {vi.useRealTimers();});
  const track = {id: 'track', name: 'Track', linked_from: {id: 'original'}};
  const point = (day: string, rank: number) => ({timestamp: new Date(`${day}T12:00:00`).getTime(), snapshotDate: day, rank});
  function setup(local = false, shared = false, backup = true, user = 'owner') {
    const loadStatsItemTrendResult = vi.fn().mockResolvedValue({status: 'unavailable', points: []});
    const loadStatsItemTrend = vi.fn().mockResolvedValue([]);
    const component = new V2UserStatsComponent(null as any, {
      getSupabaseUserId: () => user, isBackupActive: () => backup
    } as any, null as any, {loadStatsItemTrendResult, loadStatsItemTrend} as any,
    shared ? {snapshot: {paramMap: {get: () => 'shared-owner'}}} as any : undefined);
    component.historyData = [
      {...point('2026-09-18', 1), topTracks: local ? [track] : [], topArtists: [], topGenres: [], isLoaded: true},
      {...point('2026-09-19', 1), topTracks: [], topArtists: [], topGenres: [], isLoaded: false}
    ];
    return {component, loadStatsItemTrendResult, loadStatsItemTrend};
  }

  it('keeps a local position visible while cloud history loads, then merges dated cloud positions', async () => {
    const {component, loadStatsItemTrendResult, loadStatsItemTrend} = setup(true);
    let finish!: (result: any) => void;
    loadStatsItemTrendResult.mockReturnValue(new Promise(resolve => finish = resolve));
    const request = component.openTrendPopup(track, 'tracks');
    expect(component.historyPopupTitle).toBe('Track');
    expect(component.historyPopupContextKey).toBe('short_term:tracks:track');
    expect(component.isLoadingTrendData).toBe(true);
    expect(component.trendPopupPoints.map(p => p.rank)).toEqual([1]);
    finish({status: 'ready', points: [point('2026-09-17', 7), point('2026-09-18', 4)]});
    await request;
    expect(component.trendPopupPoints.map(p => p.rank)).toEqual([7, 1]);
    expect(component.trendPopupLoadFailed).toBe(false);
    expect(loadStatsItemTrendResult).toHaveBeenCalledWith('owner', 'short_term', 'tracks', ['track', 'original']);
    expect(loadStatsItemTrend).not.toHaveBeenCalled();
  });

  it('keeps genre and unnamed-item context distinct and clears the closed item title', async () => {
    const {component} = setup();
    await component.openTrendPopup('German Hip Hop', 'genres');
    expect(component.historyPopupTitle).toBe('German Hip Hop');
    expect(component.historyPopupContextKey).toBe('short_term:genres:German Hip Hop');
    await component.openTrendPopup({name: 'Unlinked artist'}, 'artists');
    expect(component.historyPopupTitle).toBe('Unlinked artist');
    expect(component.historyPopupContextKey).toBe('short_term:artists:Unlinked artist');
    await component.openTrendPopup({id: 'unnamed'}, 'artists');
    expect(component.historyPopupTitle).toBe('');
    expect(component.historyPopupContextKey).toBe('short_term:artists:unnamed');
    component.closeTrendPopup();
    expect(component.historyPopupTitle).toBe('');
    expect(component.historyPopupContextKey).toBe('short_term:artists:');
  });

  it.each([false, true])('distinguishes failure from empty history with local history=%s', async local => {
    const {component, loadStatsItemTrendResult} = setup(local);
    await component.openTrendPopup(track, 'tracks');
    expect(component.trendPopupLoadFailed).toBe(true);
    expect(component.trendPopupPoints.map(p => p.rank)).toEqual(local ? [1] : []);
    loadStatsItemTrendResult.mockResolvedValue({status: 'ready', points: []});
    await component.retryTrendPopup();
    expect(component.trendPopupLoadFailed).toBe(false);
    expect(component.trendPopupPoints.map(p => p.rank)).toEqual(local ? [1] : []);
    expect(component.showTrendPopup).toBe(true);
  });

  it('retries the same item and period once, preserving local data while the retry is busy', async () => {
    const {component, loadStatsItemTrendResult} = setup(true);
    await component.openTrendPopup(track, 'tracks');
    let finish!: (result: any) => void;
    loadStatsItemTrendResult.mockReturnValue(new Promise(resolve => finish = resolve));
    const retry = component.retryTrendPopup();
    const duplicate = component.retryTrendPopup();
    expect(loadStatsItemTrendResult).toHaveBeenCalledTimes(2);
    expect(component.isLoadingTrendData).toBe(true);
    expect(component.trendPopupItem).toBe(track);
    expect(component.selectedRange).toBe('short_term');
    expect(component.trendPopupPoints.map(p => p.rank)).toEqual([1]);
    finish({status: 'ready', points: [point('2026-09-17', 5)]});
    await Promise.all([retry, duplicate]);
    expect(component.trendPopupPoints.map(p => p.rank)).toEqual([5, 1]);
    expect(component.isLoadingTrendData).toBe(false);
  });

  it.each(['ready', 'unavailable'])('ignores an old %s result while a replacement request owns the popup', async status => {
    const {component, loadStatsItemTrendResult} = setup();
    let finishFirst!: (result: any) => void, finishSecond!: (result: any) => void;
    loadStatsItemTrendResult.mockReturnValueOnce(new Promise(resolve => finishFirst = resolve))
      .mockReturnValueOnce(new Promise(resolve => finishSecond = resolve));
    const first = component.openTrendPopup(track, 'tracks');
    const second = component.openTrendPopup({id: 'second', name: 'Second'}, 'artists');
    finishFirst({status, points: status === 'ready' ? [point('2026-09-17', 9)] : []});
    await first;
    expect(component.isLoadingTrendData).toBe(true);
    expect(component.trendPopupLoadFailed).toBe(false);
    expect(component.trendPopupItem.id).toBe('second');
    expect(component.trendPopupPoints).toEqual([]);
    finishSecond({status: 'ready', points: [point('2026-09-17', 3)]});
    await second;
    expect(component.trendPopupPoints.map(p => p.rank)).toEqual([3]);
  });

  it('does not let a closed retry clear the busy state of a replacement retry', async () => {
    const {component, loadStatsItemTrendResult} = setup(true);
    await component.openTrendPopup(track, 'tracks');
    let finishOld!: (result: any) => void, finishNew!: (result: any) => void;
    loadStatsItemTrendResult.mockReturnValueOnce(new Promise(resolve => finishOld = resolve));
    const oldRetry = component.retryTrendPopup();
    component.closeTrendPopup();
    await component.openTrendPopup({id: 'second', name: 'Second'}, 'artists');
    loadStatsItemTrendResult.mockReturnValueOnce(new Promise(resolve => finishNew = resolve));
    const newRetry = component.retryTrendPopup();
    finishOld({status: 'ready', points: [point('2026-09-17', 9)]});
    await oldRetry;
    expect(component.isRetryingTrend).toBe(true);
    expect(component.isLoadingTrendData).toBe(true);
    expect(component.trendPopupItem.id).toBe('second');
    expect(component.trendPopupPoints).toEqual([]);
    finishNew({status: 'ready', points: [point('2026-09-17', 3)]});
    await newRetry;
    expect(component.isRetryingTrend).toBe(false);
    expect(component.isLoadingTrendData).toBe(false);
    expect(component.trendPopupPoints.map(p => p.rank)).toEqual([3]);
  });

  it.each(['close', 'destroy'])('discards failed responses after %s', async action => {
    const {component, loadStatsItemTrendResult} = setup();
    let finish!: (result: any) => void;
    loadStatsItemTrendResult.mockReturnValue(new Promise(resolve => finish = resolve));
    const request = component.openTrendPopup(track, 'tracks');
    if (action === 'close') component.closeTrendPopup(); else component.ngOnDestroy();
    finish({status: 'unavailable', points: []});
    await request;
    expect(component.trendPopupLoadFailed).toBe(false);
    expect(component.trendPopupPoints).toEqual([]);
  });

  it.each([
    {shared: true, backup: true, user: 'viewer'},
    {shared: false, backup: false, user: 'owner'},
    {shared: false, backup: true, user: ''}
  ])('does not request private cloud history outside its permission boundary: %j', async permissions => {
    const {component, loadStatsItemTrendResult, loadStatsItemTrend} = setup(true, permissions.shared, permissions.backup, permissions.user);
    await component.openTrendPopup(track, 'tracks');
    expect(loadStatsItemTrendResult).not.toHaveBeenCalled();
    expect(loadStatsItemTrend).not.toHaveBeenCalled();
    expect(component.showTrendPopup).toBe(!permissions.shared);
    expect(component.trendPopupPoints.map(p => p.rank)).toEqual(permissions.shared ? [] : [1]);
  });

  it('does not restart history after closing the failed popup', async () => {
    const {component, loadStatsItemTrendResult} = setup();
    await component.openTrendPopup(track, 'tracks');
    component.closeTrendPopup();
    await component.retryTrendPopup();
    expect(loadStatsItemTrendResult).toHaveBeenCalledTimes(1);
    expect(component.showTrendPopup).toBe(false);
  });

  it('invalidates private history when routing to a shared owner while its response is pending', async () => {
    const params = new Subject<any>();
    let finish!: (result: any) => void;
    const loadStatsItemTrendResult = vi.fn().mockReturnValue(new Promise(resolve => finish = resolve));
    const component = new V2UserStatsComponent(null as any, {
      getSupabaseUserId: () => 'owner', isBackupActive: () => true, isAuthenticated: () => false
    } as any, null as any, {loadStatsItemTrendResult} as any,
    {paramMap: params, snapshot: {paramMap: {get: () => null}}} as any);
    vi.spyOn(component, 'loadStats').mockResolvedValue(undefined);
    component.ngOnInit();
    component.historyData = [{...point('2026-09-18', 1), topTracks: [], isLoaded: false}];
    const request = component.openTrendPopup(track, 'tracks');
    params.next({get: () => 'shared-owner'});
    expect(component.isSpyMode).toBe(true);
    expect(component.showTrendPopup).toBe(false);
    finish({status: 'ready', points: [point('2026-09-17', 4)]});
    await request;
    expect(component.trendPopupPoints).toEqual([]);
    expect(component.trendPopupItem).toBeNull();
    component.ngOnDestroy();
  });

  it('keeps history open for the same period and closes it before switching to another one', async () => {
    const {component} = setup(true);
    await component.openTrendPopup(track, 'tracks');
    vi.spyOn(component, 'loadStats').mockResolvedValue(undefined);
    component.changeRange('short_term');
    expect(component.showTrendPopup).toBe(true);
    component.changeRange('medium_term');
    expect(component.showTrendPopup).toBe(false);
    expect(component.trendPopupLoadFailed).toBe(false);
    expect(component.trendPopupPoints).toEqual([]);
    expect(component.selectedRange).toBe('medium_term');
    component.ngOnDestroy();
  });
});

describe('V2UserStatsComponent', () => {
  const createComponent = () => new V2UserStatsComponent(null as any, null as any, null as any, null as any);

  it('renders approved shared rankings without private history actions and keeps Spotify navigation separate', async () => {
    TestBed.resetTestingModule();
    const initialize = vi.spyOn(V2UserStatsComponent.prototype, 'ngOnInit').mockImplementation(() => {});
    await TestBed.configureTestingModule({imports:[V2UserStatsComponent],providers:[
      ...[SpotifyAuthService,SpotifyDataService,StorageService,SupabaseService,StatsSharingService,ParticipantSpotifyService].map(provide=>({provide,useValue:null})),
      {provide:ActivatedRoute,useValue:{snapshot:{paramMap:{get:()=> 'shared-owner'}}}}
    ]}).compileComponents();
    const fixture = TestBed.createComponent(V2UserStatsComponent), component = fixture.componentInstance;
    component.isLoading = false;
    component.topTracks = [{id:'song',name:'Shared Song',artists:[{name:'Shared Artist'}],album:{images:[]},external_urls:{spotify:'https://open.spotify.com/track/song'}}];
    component.topArtists = [{id:'artist',name:'Shared Artist',images:[],external_urls:{spotify:'https://open.spotify.com/artist/artist'}}];
    component.topGenres = [{name:'pop',count:1,percentage:100}];
    const history = vi.spyOn(component,'openTrendPopup');
    const spotify = vi.spyOn(component,'openTrackClick').mockImplementation(()=> {});
    const element = fixture.nativeElement as HTMLElement;
    try {
      fixture.detectChanges();
      for (const category of ['tracks','artists','genres'] as const) {
        element.querySelector<HTMLButtonElement>(`#stats-category-choice-${category}`)!.click();
        TestBed.tick();fixture.detectChanges();
        expect(component.selectedCategory).toBe(category);
        expect(element.textContent).toContain(category === 'genres' ? 'pop' : category === 'artists' ? 'Shared Artist' : 'Shared Song');
        expect(element.querySelector('[aria-label^="View position history"], .v2-artist-history, button.v2-genre-row')).toBeNull();
        expect(element.querySelector('v2-rank-history-popup')).toBeNull();
        expect([...element.querySelectorAll('button')].some(button => button.textContent?.includes('Search past'))).toBe(false);
        if (category === 'tracks') {
          element.querySelector<HTMLButtonElement>('.v2-ranking-art')!.click();
          expect(spotify).toHaveBeenCalledWith('https://open.spotify.com/track/song');
        }
      }
      expect(history).not.toHaveBeenCalled();
    } finally {fixture.destroy();initialize.mockRestore();}
  });

  it('opens a historical match with its visible name and a decorative history icon', async () => {
    TestBed.resetTestingModule();
    const initialize = vi.spyOn(V2UserStatsComponent.prototype,'ngOnInit').mockImplementation(() => {});
    await TestBed.configureTestingModule({imports:[V2UserStatsComponent],providers:
      [SpotifyAuthService,SpotifyDataService,StorageService,SupabaseService,ActivatedRoute,StatsSharingService,ParticipantSpotifyService]
        .map(provide=>({provide,useValue:null}))}).compileComponents();
    const fixture=TestBed.createComponent(V2UserStatsComponent),component=fixture.componentInstance;
    const item={kind:'track' as const,id:'archive',name:'Archive Song',subtitle:'Archive Artist',imageUrl:'',spotifyUrl:'',
      bestRank:7,firstSeen:'2026-09-18',lastSeen:'2026-09-18',appearances:1};
    component.isLoading=false;component.includePastStatsSearch=true;component.statsSearchQuery='Archive';component.pastTopResults=[item];
    const history=vi.spyOn(component,'openTrendPopup').mockResolvedValue(undefined);
    try {
      fixture.detectChanges();
      const action=(fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.v2-past-grid button')!;
      expect(action.textContent).toContain('Archive Song');expect(action.textContent).toContain('Archive Artist');
      expect(action.querySelector('.pi-chart-line')?.getAttribute('aria-hidden')).toBe('true');
      action.click();expect(history).toHaveBeenCalledWith(item,'tracks');
    } finally {fixture.destroy();initialize.mockRestore();}
  });

  it('exposes the complete v2 period and category navigation', () => {
    const component = createComponent();

    expect(component.rangeTabs.map(tab => tab.id)).toEqual(['short_term', 'medium_term', 'long_term']);
    expect(component.categoryTabs.map(tab => tab.id)).toEqual(['tracks', 'artists', 'genres']);
  });

  it('delegates v2 tab changes to the shared stats controller', () => {
    const component = createComponent();
    const changeCategory = vi.spyOn(component, 'changeCategory');

    component.changeCategoryValue('genres');

    expect(changeCategory).toHaveBeenCalledWith('genres');
  });

  it('delegates native date controls to the shared snapshot behavior', () => {
    const component = createComponent();
    const history = vi.spyOn(component, 'selectHistorySnapshot');
    const compare = vi.spyOn(component, 'selectCompareSnapshot');

    component.selectHistoryValue('current');
    component.selectCompareValue('snapshot-id');

    expect(history).toHaveBeenCalledWith('current', expect.any(Event));
    expect(compare).toHaveBeenCalledWith('snapshot-id', expect.any(Event));
  });

  it('renders independent native history and Spotify actions without nested interactive containers', async () => {
    TestBed.resetTestingModule();
    const initialize = vi.spyOn(V2UserStatsComponent.prototype, 'ngOnInit').mockImplementation(() => {});
    await TestBed.configureTestingModule({
      imports: [V2UserStatsComponent],
      providers: [SpotifyAuthService, SpotifyDataService, StorageService, SupabaseService, ActivatedRoute,
        StatsSharingService, ParticipantSpotifyService].map(provide => ({provide, useValue: null}))
    }).compileComponents();
    const fixture = TestBed.createComponent(V2UserStatsComponent);
    const component = fixture.componentInstance;
    const history = vi.spyOn(component, 'openTrendPopup').mockResolvedValue(undefined);
    const spotify = vi.spyOn(component, 'openTrackClick').mockImplementation(() => {});
    component.isLoading = false;
    const track = {id: 'song', name: 'Test Song', artists: [{name: 'Test Artist'}],
      album: {images: []}, external_urls: {spotify: 'https://open.spotify.com/track/song'}};
    component.topTracks = [track];
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect([...element.querySelectorAll('button')].some(button => button.textContent?.includes('Search past'))).toBe(true);
    const pastSearch = [...element.querySelectorAll('button')].find(button => button.textContent?.includes('Search past'))!;
    expect(pastSearch.querySelector('.pi-history')?.getAttribute('aria-hidden')).toBe('true');
    const row = element.querySelector('.v2-ranking-row')!;
    expect(row.hasAttribute('role')).toBe(false);
    expect(row.hasAttribute('tabindex')).toBe(false);
    const action = row.querySelector<HTMLButtonElement>('.v2-ranking-history')!;
    expect(action.tagName).toBe('BUTTON');
    expect(action.getAttribute('aria-label')).toBe('View position history for Test Song');
    action.click();
    expect(history).toHaveBeenCalledWith(track, 'tracks');
    history.mockClear();
    row.querySelector<HTMLButtonElement>('.v2-ranking-art')!.click();
    expect(spotify).toHaveBeenCalledWith(track.external_urls.spotify);
    expect(history).not.toHaveBeenCalled();

    const artist = {id: 'artist', name: 'Test Artist', images: [], external_urls: {spotify: 'https://open.spotify.com/artist/artist'}};
    const artistSpotify = vi.spyOn(component, 'openArtistClick').mockImplementation(() => {});
    component.topArtists = [artist];
    component.selectedCategory = 'artists';
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const card = element.querySelector('.v2-ranked-artist')!;
    expect(card.hasAttribute('role')).toBe(false);
    expect(card.hasAttribute('tabindex')).toBe(false);
    const artistAction = card.querySelector<HTMLButtonElement>('.v2-artist-history')!;
    expect(artistAction.getAttribute('aria-label')).toBe('View position history for Test Artist');
    artistAction.click();
    expect(history).toHaveBeenCalledWith(artist, 'artists');
    expect(card.querySelector('.v2-artist-art')?.getAttribute('aria-label')).toBe('Open Test Artist on Spotify');
    history.mockClear();
    card.querySelector<HTMLButtonElement>('.v2-artist-art')!.click();
    expect(artistSpotify).toHaveBeenCalledWith(artist.external_urls.spotify);
    expect(history).not.toHaveBeenCalled();
    component.topArtists = [{id: 'unavailable', name: 'Unavailable artist', images: []}];
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const unavailable = element.querySelector<HTMLButtonElement>('.v2-artist-art')!;
    expect(unavailable.disabled).toBe(true);
    artistSpotify.mockClear();
    unavailable.click();
    expect(artistSpotify).not.toHaveBeenCalled();
    element.querySelector<HTMLButtonElement>('.v2-artist-history')!.click();
    expect(history).toHaveBeenCalledWith(component.topArtists[0], 'artists');
    expect(element.querySelector('button button, [role="button"] button')).toBeNull();
    fixture.destroy();
    initialize.mockRestore();
  });
  it('renders snapshot-derived badges without reclassifying filtered ranks or artist categories', async () => {
    TestBed.resetTestingModule();
    const initialize = vi.spyOn(V2UserStatsComponent.prototype, 'ngOnInit').mockImplementation(() => {});
    await TestBed.configureTestingModule({
      imports: [V2UserStatsComponent],
      providers: [SpotifyAuthService, SpotifyDataService, StorageService, SupabaseService, ActivatedRoute,
        StatsSharingService, ParticipantSpotifyService].map(provide => ({provide, useValue: null}))
    }).compileComponents();
    const fixture = TestBed.createComponent(V2UserStatsComponent);
    const component = fixture.componentInstance;
    const known = Array.from({length: 30}, (_, rank) => ({id: `known-${rank}`, name: `Known ${rank}`, artists: [{name: 'Artist'}]}));
    const debut = {id: 'new', name: 'New song', artists: [{name: 'Artist'}]};
    const snapshot = {timestamp: new Date('2026-08-01T12:00:00').getTime(), snapshotDate: '2026-08-01',
      topTracks: known, topArtists: [{id: 'known-artist', name: 'Known artist'}], topGenres: [], isLoaded: true};
    component.historyData = [snapshot];
    component.compareSnapshotId = String(snapshot.timestamp);
    component.topTracks = [debut, known[16], known[2]];
    component.topArtists = [{id: 'debut-artist', name: 'Debut artist'}];
    component.isLoading = false;
    component.calculateHotMovers();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const rows = element.querySelectorAll('.v2-ranking-row');
    expect(rows[0].querySelector('svg')?.getAttribute('aria-label')).toBe('Top 10 debut');
    expect(rows[1].querySelector('svg')?.getAttribute('aria-label')).toBe('Hot mover');
    expect(rows[2].querySelector('svg')).toBeNull();

    component.onStatsSearchChange('Known 16');
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(element.querySelectorAll('.v2-ranking-row')).toHaveLength(1);
    expect(element.querySelector('.v2-ranking-copy strong')?.textContent?.trim()).toBe('Known 16');
    expect(element.querySelector('.rank')?.getAttribute('aria-label')).toBe('Rank 2. ↑ 15 places');
    expect(element.querySelector('svg')?.getAttribute('aria-label')).toBe('Hot mover');

    component.clearStatsSearch();
    component.changeCategoryValue('artists');
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(element.querySelector('.v2-ranked-artist svg')?.getAttribute('aria-label')).toBe('Top 10 debut');
    expect(element.querySelectorAll('.v2-ranking-row')).toHaveLength(0);

    component.historyData = [];
    component.calculateHotMovers();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(element.querySelector('v2-ranking-flame')).toBeNull();
    fixture.destroy();
    initialize.mockRestore();
  });

});
