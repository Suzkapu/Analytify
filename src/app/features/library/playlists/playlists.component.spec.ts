import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {EMPTY, of} from 'rxjs';
import {PlaylistsComponent} from './playlists.component';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {ComparePlaylistSourceService} from '@core/compare-room/compare-playlist-source.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';

describe('PlaylistsComponent', () => {
  let component: PlaylistsComponent;
  let fixture: ComponentFixture<PlaylistsComponent>;
  let spotifyDataService: jasmine.SpyObj<SpotifyDataService>;
  let authService: jasmine.SpyObj<SpotifyAuthService>;
  let storageService: jasmine.SpyObj<StorageService>;
  let comparePlaylistSource: jasmine.SpyObj<ComparePlaylistSourceService>;
  let participantSpotify: jasmine.SpyObj<ParticipantSpotifyService>;
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map<string, string>();
    spotifyDataService = jasmine.createSpyObj<SpotifyDataService>(
      'SpotifyDataService',
      ['getAccessibleUserPlaylists', 'getFavTracks']
    );
    authService = jasmine.createSpyObj<SpotifyAuthService>(
      'SpotifyAuthService',
      [
        'getUserId',
        'isBackupActive',
        'isAuthenticated',
        'ensureInitialSync',
        'getAccessToken',
        'isTokenExpired',
        'refreshToken'
      ]
    );
    storageService = jasmine.createSpyObj<StorageService>(
      'StorageService',
      ['getItem', 'setItem', 'restoreItemsFromCloud']
    );
    comparePlaylistSource = jasmine.createSpyObj<ComparePlaylistSourceService>(
      'ComparePlaylistSourceService',
      ['loadMainTracks']
    );
    participantSpotify = jasmine.createSpyObj<ParticipantSpotifyService>(
      'ParticipantSpotifyService',
      ['createPlaylist']
    );
    authService.getUserId.and.returnValue('current-user');
    authService.isBackupActive.and.returnValue(false);
    authService.isAuthenticated.and.returnValue(false);
    authService.getAccessToken.and.returnValue('access-token');
    authService.isTokenExpired.and.returnValue(false);
    storageService.getItem.and.callFake((key: string) => storage.get(key) ?? null);
    storageService.setItem.and.callFake((key: string, value: string) => storage.set(key, value));

    TestBed.configureTestingModule({
      declarations: [PlaylistsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: EMPTY } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: SpotifyDataService, useValue: spotifyDataService },
        { provide: SpotifyAuthService, useValue: authService },
        { provide: StorageService, useValue: storageService },
        { provide: ComparePlaylistSourceService, useValue: comparePlaylistSource },
        { provide: ParticipantSpotifyService, useValue: participantSpotify }
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

  it('does not render sharing controls on individual playlist cards', () => {
    authService.isBackupActive.and.returnValue(true);
    component.playlists = [{id: 'party', name: 'Party', tracks: {total: 12}}];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.playlist-share-button')).toBeNull();
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

    expect(spotifyDataService.getAccessibleUserPlaylists).toHaveBeenCalledOnceWith('current-user', true);
    expect(spotifyDataService.getFavTracks).toHaveBeenCalledOnceWith(0, 1);
    expect(component.playlists.map(playlist => playlist.id)).toEqual(['fav', 'updated']);
    expect(component.playlists[0].tracks.total).toBe(42);
    expect(JSON.parse(storage.get('current-user_playlists') || '[]').map((playlist: any) => playlist.id))
      .toEqual(['fav', 'updated']);
  });

  it('keeps followed playlists hidden by default and toggles them into the overview', () => {
    component.playlists = [
      {id: 'fav', name: 'Favourite Tracks', tracks: {total: 5}},
      {id: 'owned', name: 'Owned', owner: {id: 'current-user'}, collaborative: false, tracks: {total: 2}},
      {id: 'saved', name: 'Saved', owner: {id: 'friend', display_name: 'Friend'}, collaborative: false, tracks: {total: 3}}
    ];
    (component as any).currentSpotifyProfileId = 'current-user';

    component.filterPlaylists();
    expect(component.filteredPlaylists.map(playlist => playlist.id)).toEqual(['fav', 'owned']);
    expect(component.savedPlaylistCount).toBe(1);

    component.toggleSavedPlaylists();
    expect(component.filteredPlaylists.map(playlist => playlist.id)).toEqual(['fav', 'owned', 'saved']);
    expect(storage.get('current-user_playlists_showSaved')).toBe('true');
  });

  it('merges multiple selected playlists without duplicate tracks', async () => {
    component.playlists = [
      {id: 'one', name: 'One', tracks: {total: 2}},
      {id: 'two', name: 'Two', tracks: {total: 2}}
    ];
    comparePlaylistSource.loadMainTracks.and.callFake(async playlist => ({
      source: 'local' as const,
      tracks: playlist.id === 'one'
        ? [compareTrack('a', 1), compareTrack('shared', 2)]
        : [compareTrack('shared', 1), compareTrack('b', 2)]
    }));
    participantSpotify.createPlaylist.and.resolveTo({
      success: true,
      playlistName: 'My Merge',
      playlistId: 'merged',
      playlistUrl: 'https://open.spotify.com/playlist/merged',
      addedTracks: 3
    });

    component.toggleMergeSelectionMode();
    component.togglePlaylistSelection(component.playlists[0]);
    component.togglePlaylistSelection(component.playlists[1]);
    component.onMergedPlaylistNameChange('My Merge');
    await component.createMergedPlaylist();

    const createdTracks = participantSpotify.createPlaylist.calls.mostRecent().args[3];
    expect(createdTracks.map(track => track.id)).toEqual(['a', 'shared', 'b']);
    expect(component.mergeResult?.playlistId).toBe('merged');
    expect(component.playlists.map(playlist => playlist.id)).toEqual(['merged', 'one', 'two']);
  });

  function compareTrack(id: string, playlistIndex: number) {
    return {
      id,
      uri: `spotify:track:${id}`,
      name: id,
      artists: [{id: 'artist', name: 'Artist'}],
      albumName: 'Album',
      imageUrl: '',
      spotifyUrl: '',
      playlistIndex
    };
  }
});
