import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {EMPTY, Subject} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {PlaylistLoaderService} from '@core/sync/playlist-loader/playlist-loader.service';
import {PlaylistAnalysisComponent} from './playlist-analysis.component';

describe('PlaylistAnalysisComponent', () => {
  let component: PlaylistAnalysisComponent;
  let fixture: ComponentFixture<PlaylistAnalysisComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [PlaylistAnalysisComponent],
      providers: [
        {provide: ActivatedRoute, useValue: {params: EMPTY}},
        {provide: Router, useValue: {navigate: jasmine.createSpy('navigate')}},
        {provide: SpotifyAuthService, useValue: {isAuthenticated: () => false}},
        {provide: StorageService, useValue: {}},
        {provide: PlaylistLoaderService, useValue: {}}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(PlaylistAnalysisComponent);
    component = fixture.componentInstance;
  });

  it('uses the shared page shell and themed analysis cards', () => {
    component.isLoading = false;
    component.playlistName = 'Road Trip';
    component.uniqueTracksCount = 42;
    component.totalDurationFormatted = '2 hr 8 min';
    component.averageDurationFormatted = '3:03';
    component.uniqueArtistsCount = 18;
    component.uniqueAlbumsCount = 24;
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.analysis-page > .page-shell')).not.toBeNull();
    expect(element.querySelector('.page-shell > .page-back-row')).not.toBeNull();
    expect(element.querySelectorAll('app-metric-card').length).toBe(5);
    expect(element.querySelectorAll('.analysis-sections > .column-card').length).toBe(2);
  });

  it('shows an indeterminate loading state before a playlist total is known', () => {
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(component.isLoading).toBeTrue();
    expect(element.querySelector('.analysis-loading')).not.toBeNull();
    expect(element.textContent).toContain('Finding cached playlist data…');
    expect(element.querySelector('.metrics-grid')).toBeNull();
  });

  it('counts unique artists and albums without duplicating collaborative tracks', () => {
    const sharedTrack = {
      id: 'track-1',
      name: 'Together',
      duration_ms: 180000,
      artists: [
        {id: 'artist-1', name: 'One'},
        {id: 'artist-2', name: 'Two'}
      ],
      album: {id: 'album-1', name: 'First', release_date: '2020-01-01'}
    };
    component.artists = [
      {id: 'artist-1', name: 'One', tracks: [sharedTrack]},
      {id: 'artist-2', name: 'Two', tracks: [sharedTrack]},
      {
        id: 'artist-3',
        name: 'Three',
        tracks: [{
          id: 'track-2',
          name: 'Solo',
          duration_ms: 200000,
          artists: [{id: 'artist-3', name: 'Three'}],
          album: {id: 'album-2', name: 'Second', release_date: '2024-01-01'}
        }]
      }
    ];

    component.runAnalysis();

    expect(component.uniqueTracksCount).toBe(2);
    expect(component.uniqueArtistsCount).toBe(3);
    expect(component.uniqueAlbumsCount).toBe(2);
  });

  it('starts the first playlist load without waiting for broad cloud hydration', async () => {
    const params = new Subject<Record<string, string>>();
    let finishInitialSync!: () => void;
    const initialSync = new Promise<void>(resolve => finishInitialSync = resolve);
    const auth = {
      isAuthenticated: () => true,
      ensureInitialSync: () => initialSync
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      declarations: [PlaylistAnalysisComponent],
      providers: [
        {provide: ActivatedRoute, useValue: {params}},
        {provide: Router, useValue: {navigate: jasmine.createSpy('navigate')}},
        {provide: SpotifyAuthService, useValue: auth},
        {provide: StorageService, useValue: {}},
        {provide: PlaylistLoaderService, useValue: {}}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    const firstOpenFixture = TestBed.createComponent(PlaylistAnalysisComponent);
    const firstOpenComponent = firstOpenFixture.componentInstance;
    const load = spyOn(firstOpenComponent, 'loadPlaylistData').and.resolveTo();
    firstOpenFixture.detectChanges();

    params.next({id: 'playlist'});
    await Promise.resolve();

    expect(load).toHaveBeenCalledTimes(1);
    finishInitialSync();
  });
});
