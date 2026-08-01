import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {EMPTY, of} from 'rxjs';
import {PlaylistsComponent} from './playlists.component';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';

describe('PlaylistsComponent', () => {
  let component: PlaylistsComponent;
  let fixture: ComponentFixture<PlaylistsComponent>;
  let spotifyDataService: jasmine.SpyObj<SpotifyDataService>;
  let authService: jasmine.SpyObj<SpotifyAuthService>;
  let storageService: jasmine.SpyObj<StorageService>;
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map<string, string>();
    spotifyDataService = jasmine.createSpyObj<SpotifyDataService>(
      'SpotifyDataService',
      ['getAccessibleUserPlaylists', 'getFavTracks']
    );
    authService = jasmine.createSpyObj<SpotifyAuthService>(
      'SpotifyAuthService',
      ['getUserId', 'isBackupActive', 'isAuthenticated', 'ensureInitialSync']
    );
    storageService = jasmine.createSpyObj<StorageService>(
      'StorageService',
      ['getItem', 'setItem', 'restoreItemsFromCloud']
    );
    authService.getUserId.and.returnValue('current-user');
    authService.isBackupActive.and.returnValue(false);
    authService.isAuthenticated.and.returnValue(false);
    storageService.getItem.and.callFake((key: string) => storage.get(key) ?? null);
    storageService.setItem.and.callFake((key: string, value: string) => storage.set(key, value));

    TestBed.configureTestingModule({
      declarations: [PlaylistsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: EMPTY } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: SpotifyDataService, useValue: spotifyDataService },
        { provide: SpotifyAuthService, useValue: authService },
        { provide: StorageService, useValue: storageService }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(PlaylistsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('refreshes Spotify on every load even when a valid cached list exists', async () => {
    storage.set('current-user_playlists', JSON.stringify([
      {id: 'fav', name: 'Favourite Tracks', tracks: {total: 10}},
      {id: 'cached', name: 'Cached playlist', owner: {id: 'current-user'}, tracks: {total: 2}}
    ]));
    storage.set('current-user_playlists_lastUpdated', Date.now().toString());
    spotifyDataService.getAccessibleUserPlaylists.and.returnValue(of({
      currentUserId: 'current-user',
      items: [{
        id: 'updated',
        name: 'Updated playlist',
        owner: {id: 'current-user'},
        items: {total: 3}
      }]
    }));
    spotifyDataService.getFavTracks.and.returnValue(of({total: 42}));

    await component.loadPlaylists();

    expect(spotifyDataService.getAccessibleUserPlaylists).toHaveBeenCalledOnceWith('current-user');
    expect(spotifyDataService.getFavTracks).toHaveBeenCalledOnceWith(0, 1);
    expect(component.playlists.map(playlist => playlist.id)).toEqual(['fav', 'updated']);
    expect(component.playlists[0].tracks.total).toBe(42);
    expect(JSON.parse(storage.get('current-user_playlists') || '[]').map((playlist: any) => playlist.id))
      .toEqual(['fav', 'updated']);
  });
});
