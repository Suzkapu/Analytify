import {TestBed} from '@angular/core/testing';
import {ActivatedRoute, provideRouter} from '@angular/router';
import {describe, expect, it, vi} from 'vitest';
import {EMPTY, Subject} from 'rxjs';
import {ArtistDetailsController} from '../artist-details/artist-details.component';
import {V2ArtistDetailsPageComponent} from './v2-artist-details-page.component';

describe('V2ArtistDetailsPageComponent', () => {
  it('returns to the originating playlist when navigation supplies its ID', async () => {
    const previousState = history.state;
    history.replaceState({playlistId: 'origin-playlist'}, '');
    try {
      await TestBed.configureTestingModule({
        imports: [V2ArtistDetailsPageComponent],
        providers: [provideRouter([]), {provide: ActivatedRoute, useValue: {params: EMPTY}}]
      }).overrideComponent(V2ArtistDetailsPageComponent, {set: {template: '', imports: []}}).compileComponents();
      expect(TestBed.createComponent(V2ArtistDetailsPageComponent).componentInstance.backLink).toEqual(['/songs', 'origin-playlist']);
    } finally {
      history.replaceState(previousState, '');
    }
  });
  it('notifies the view after asynchronously hydrating a cached artist', async () => {
    const params = new Subject<Record<string, string>>();
    const markForCheck = vi.fn();
    let hydrate!: () => void;
    const controller = new ArtistDetailsController({params} as any, {} as any, {} as any,
      {getUserId: () => 'user'} as any, {
        hydrateItems: () => new Promise<void>(resolve => {hydrate = resolve;}),
        getItem: (key: string) => key.endsWith('_lastUpdated') ? String(Date.now()) : JSON.stringify({id: 'artist', name: 'Cached artist'})
      } as any, {} as any, undefined, {markForCheck} as any);
    params.next({id: 'artist'});
    expect(controller.isLoadingArtist).toBe(true);
    hydrate();
    await Promise.resolve();
    expect(controller.artist.name).toBe('Cached artist');
    expect(controller.isLoadingArtist).toBe(false);
    expect(markForCheck).toHaveBeenCalledOnce();
    controller.ngOnDestroy();
  });
  it('keeps its fallback back destination in the v2 route tree', async () => {
    await TestBed.configureTestingModule({
      imports: [V2ArtistDetailsPageComponent],
      providers: [provideRouter([]), {provide: ActivatedRoute, useValue: {params: EMPTY}}]
    }).overrideComponent(V2ArtistDetailsPageComponent, {set: {template: '', imports: []}}).compileComponents();
    expect(TestBed.createComponent(V2ArtistDetailsPageComponent).componentInstance.backLink).toEqual(['/playlists']);
  });
});
