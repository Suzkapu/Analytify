import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {EMPTY} from 'rxjs';
import { SongsComponent } from './songs.component';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {PlaylistLoaderService} from '@core/sync/playlist-loader/playlist-loader.service';
import {ImageHealingService} from '@core/sync/image-healing/image-healing.service';

describe('SongsComponent', () => {
  let component: SongsComponent;
  let fixture: ComponentFixture<SongsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SongsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: EMPTY } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: SpotifyAuthService, useValue: {} },
        {
          provide: StorageService,
          useValue: { setItem: jasmine.createSpy('setItem') }
        },
        { provide: PlaylistLoaderService, useValue: {} },
        { provide: ImageHealingService, useValue: {} }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(SongsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('sorts albums by playlist song count in both directions', () => {
    component.playlistAlbums = [
      { name: 'Two', artists: [], trackCount: 2 },
      { name: 'Ten', artists: [], trackCount: 10 },
      { name: 'Five', artists: [], trackCount: 5 }
    ];

    component.albumSortOrder = 'desc';
    component.filterAlbums();
    expect(component.filteredAlbums.map(album => album.trackCount)).toEqual([10, 5, 2]);

    component.albumSortOrder = 'asc';
    component.filterAlbums();
    expect(component.filteredAlbums.map(album => album.trackCount)).toEqual([2, 5, 10]);
  });

  it('keeps the playlist tracks belonging to each album', () => {
    component.playlistTracks = [
      { id: 'one', name: 'One', duration_ms: 1000, album: { id: 'album-a', name: 'Album A' } },
      { id: 'two', name: 'Two', duration_ms: 2000, album: { id: 'album-a', name: 'Album A' } },
      { id: 'three', name: 'Three', duration_ms: 3000, album: { id: 'album-b', name: 'Album B' } }
    ];

    component.updatePlaylistAlbums();

    const album = component.playlistAlbums.find(item => item.id === 'album-a');
    expect(album.trackCount).toBe(2);
    expect(album.tracks.map((track: any) => track.id)).toEqual(['one', 'two']);
  });

  it('opens and closes the in-app album songs view', () => {
    const scrollTo = spyOn(window, 'scrollTo') as jasmine.Spy;
    spyOn(window, 'requestAnimationFrame').and.callFake(callback => {
      callback(0);
      return 1;
    });
    const album = {
      id: 'album-a',
      tracks: [
        { id: 'later', playlist_index: 2 },
        { id: 'first', playlist_index: 1 }
      ]
    };

    component.openAlbumDetails(album);
    expect(component.selectedAlbum.tracks.map((track: any) => track.id)).toEqual(['first', 'later']);
    expect(scrollTo).toHaveBeenCalledWith({top: 0, behavior: 'auto'});

    component.closeAlbumDetails();
    expect(component.selectedAlbum).toBeNull();
  });
});
