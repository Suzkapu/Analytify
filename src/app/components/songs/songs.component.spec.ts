import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {EMPTY} from 'rxjs';
import { SongsComponent } from './songs.component';
import {SpotifyAuthService} from '../../services/auth/spotify-auth.service';
import {StorageService} from '../../services/storage/storage.service';
import {PlaylistLoaderService} from '../../services/playlist-loader/playlist-loader.service';
import {ImageHealingService} from '../../services/image-healing/image-healing.service';

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
});
