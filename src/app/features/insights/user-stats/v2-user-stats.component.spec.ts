import {describe, expect, it, vi} from 'vitest';
import {V2UserStatsComponent} from './v2-user-stats.component';
import {TestBed} from '@angular/core/testing';
import {ActivatedRoute} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';

describe('V2UserStatsComponent', () => {
  const createComponent = () => new V2UserStatsComponent(null as any, null as any, null as any, null as any);

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
    expect(element.querySelector('button button, [role="button"] button')).toBeNull();
    fixture.destroy();
    initialize.mockRestore();
  });
});
