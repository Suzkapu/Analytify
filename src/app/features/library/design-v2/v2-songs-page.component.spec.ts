import {TestBed} from '@angular/core/testing';
import {ActivatedRoute, provideRouter} from '@angular/router';
import {EMPTY, Subject} from 'rxjs';
import {describe, expect, it, vi} from 'vitest';
import {V2SongsPageComponent} from './v2-songs-page.component';
import {SongsController} from '../songs/songs.component';

describe('V2SongsPageComponent', () => {
  it('opens album songs in playlist order through a native button', async () => {
    await TestBed.configureTestingModule({
      imports: [V2SongsPageComponent],
      providers: [provideRouter([]), {provide: ActivatedRoute, useValue: {params: EMPTY}}]
    }).compileComponents();
    vi.spyOn(V2SongsPageComponent.prototype, 'ngOnInit').mockImplementation(() => {});
    const fixture = TestBed.createComponent(V2SongsPageComponent);
    const component = fixture.componentInstance;
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    component.isLoading = false;
    component.viewStyle = 'albums';
    component.artists = [{name: 'Artist', tracks: []}];
    component.filteredAlbums = [{id: 'album', name: 'Album', artists: ['Artist'], tracks: [
      {id: 'second', name: 'Second song', playlist_index: 2, duration_ms: 120000},
      {id: 'first', name: 'First song', playlist_index: 1, duration_ms: 60000,
        external_urls: {spotify: 'https://open.spotify.com/track/first'}}
    ]}];
    fixture.detectChanges();
    const open = fixture.nativeElement.querySelector('button[aria-label="View songs in Album"]') as HTMLButtonElement;
    expect(open.type).toBe('button');
    open.click();
    fixture.detectChanges();
    expect(Array.from(fixture.nativeElement.querySelectorAll('.v2-track-copy strong'),
      (node: unknown) => (node as HTMLElement).textContent)).toEqual(['First song', 'Second song']);
    expect(fixture.nativeElement.querySelector('button[aria-label="Open Second song on Spotify"]').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('button[aria-label="Open First song on Spotify"]').disabled).toBe(false);
    const back = Array.from(fixture.nativeElement.querySelectorAll('button'))
      .find((node: unknown) => (node as HTMLButtonElement).textContent?.includes('Back to albums')) as HTMLButtonElement;
    back.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.v2-track-list')).toBeNull();
    expect(fixture.nativeElement.querySelector('button[aria-label="View songs in Album"]')).not.toBeNull();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('View songs in Album');
  });

  it('notifies OnPush views after asynchronous route loading and loader progress', async () => {
    const params = new Subject<Record<string, string>>();
    const markForCheck = vi.fn();
    const controller = new SongsController({params} as any, {} as any,
      {getUserId: () => 'user', isAuthenticated: () => false} as any,
      {getItem: () => null} as any, {} as any, {} as any,
      {run: (callback: () => void) => callback()} as any, undefined, {markForCheck} as any);
    let finish!: () => void;
    vi.spyOn(controller, 'loadArtistsFromPlaylist').mockImplementation(() => new Promise<void>(resolve => {finish = resolve;}));
    params.next({id: 'playlist'});
    expect(markForCheck).not.toHaveBeenCalled();
    finish();
    await Promise.resolve();
    expect(markForCheck).toHaveBeenCalledOnce();
    const progress$ = new Subject<any>();
    (controller as any).subscribeToLoaderTask({progress$});
    progress$.next({artists: [], isComplete: false, isLoadingTracks: true});
    expect(controller.isLoadingTracks).toBe(true);
    expect(markForCheck).toHaveBeenCalledTimes(2);
    controller.viewStyle = 'songs';
    controller.filteredTracks = Array.from({length: 60});
    controller.onWindowScroll();
    expect(controller.displayedTracksCount).toBe(100);
    expect(markForCheck).toHaveBeenCalledTimes(3);
    controller.ngOnDestroy();
  });

  it.each([
    ['artists', 'searchText', 'filterArtists', 'Search artists'],
    ['songs', 'trackSearchText', 'filterAndSortTracks', 'Search songs or artists'],
    ['albums', 'albumSearchText', 'filterAlbums', 'Search albums or artists']
  ] as const)('delegates the %s search to its own filter', (view, field, filter, label) => {
    const component = Object.create(V2SongsPageComponent.prototype) as V2SongsPageComponent;
    component.viewStyle = view;
    const spy = vi.spyOn(component, filter).mockImplementation(() => {});
    component.updateSearch('query');
    expect(component[field]).toBe('query');
    expect(component.activeSearch).toBe('query');
    expect(component.searchLabel).toBe(label);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('keeps its back destination in the v2 route tree', async () => {
    await TestBed.configureTestingModule({
      imports: [V2SongsPageComponent],
      providers: [provideRouter([]), {provide: ActivatedRoute, useValue: {params: EMPTY}}]
    }).overrideComponent(V2SongsPageComponent, {set: {template: '', imports: []}}).compileComponents();
    expect(TestBed.createComponent(V2SongsPageComponent).componentInstance.backLink).toEqual(['/playlists']);
  });
});
