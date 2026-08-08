import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {EMPTY} from 'rxjs';
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
    component.playlistName = 'Road Trip';
    component.uniqueTracksCount = 42;
    component.totalDurationFormatted = '2 hr 8 min';
    component.averageDurationFormatted = '3:03';
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.analysis-page > .page-shell')).not.toBeNull();
    expect(element.querySelector('.page-shell > .page-back-row')).not.toBeNull();
    expect(element.querySelectorAll('.metric-card').length).toBe(3);
    expect(element.querySelectorAll('.analysis-sections > .column-card').length).toBe(2);
  });
});
