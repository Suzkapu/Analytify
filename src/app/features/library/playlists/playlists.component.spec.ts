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
import {PlaylistLoaderService} from '@core/sync/playlist-loader/playlist-loader.service';
import {SharedModule} from '@shared/shared.module';

describe('PlaylistsComponent', () => {
  let component: PlaylistsComponent;
  let fixture: ComponentFixture<PlaylistsComponent>;
  let spotifyDataService: jasmine.SpyObj<SpotifyDataService>;
  let authService: jasmine.SpyObj<SpotifyAuthService>;
  let storageService: jasmine.SpyObj<StorageService>;
  let comparePlaylistSource: jasmine.SpyObj<ComparePlaylistSourceService>;
  let participantSpotify: jasmine.SpyObj<ParticipantSpotifyService>;
  let playlistLoader: jasmine.SpyObj<PlaylistLoaderService>;
  let storage: Map<string, string>;

  beforeEach(() => {
    storage = new Map<string, string>();
    spotifyDataService = jasmine.createSpyObj<SpotifyDataService>(
      'SpotifyDataService',
      ['getAccessibleUserPlaylists', 'getFavTracks', 'getCurrentUser']
    );
    authService = jasmine.createSpyObj<SpotifyAuthService>(
      'SpotifyAuthService',
      [
        'getUserId',
        'isBackupActive',
        'isAuthenticated',
        'ensureInitialSync',
        'isPersonalAppConnection',
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
    playlistLoader = jasmine.createSpyObj<PlaylistLoaderService>(
      'PlaylistLoaderService',
      ['recordPortfolioMetadata']
    );
    authService.getUserId.and.returnValue('current-user');
    authService.isBackupActive.and.returnValue(false);
    authService.isAuthenticated.and.returnValue(false);
    authService.isPersonalAppConnection.and.returnValue(false);
    authService.getAccessToken.and.returnValue('access-token');
    authService.isTokenExpired.and.returnValue(false);
    storageService.getItem.and.callFake((key: string) => storage.get(key) ?? null);
    storageService.setItem.and.callFake((key: string, value: string) => storage.set(key, value));
    storageService.restoreItemsFromCloud.and.resolveTo(0);

    TestBed.configureTestingModule({
      declarations: [PlaylistsComponent],
      imports: [SharedModule],
      providers: [
        { provide: ActivatedRoute, useValue: { params: EMPTY } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: SpotifyDataService, useValue: spotifyDataService },
        { provide: SpotifyAuthService, useValue: authService },
        { provide: StorageService, useValue: storageService },
        { provide: ComparePlaylistSourceService, useValue: comparePlaylistSource },
        { provide: ParticipantSpotifyService, useValue: participantSpotify },
        { provide: PlaylistLoaderService, useValue: playlistLoader }
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

  it('shows loading instead of a false empty-playlists result on first paint', () => {
    const element = fixture.nativeElement as HTMLElement;
    expect(component.isLoadingPlaylists).toBeTrue();
    expect(element.textContent).toContain('Loading your playlists…');
    expect(element.textContent).not.toContain('No playlists found');
  });

  it('does not render sharing controls on individual playlist cards', () => {
    authService.isBackupActive.and.returnValue(true);
    component.playlists = [{id: 'party', name: 'Party', tracks: {total: 12}}];
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.playlist-share-button')).toBeNull();
  });

  it('renders the playlist workspace with a searchable toolbar and clear actions', () => {
    component.playlists = [{id: 'party', name: 'Party', tracks: {total: 12}}];
    component.filteredPlaylists = component.playlists;
    fixture.detectChanges();

    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('main.playlists-page')).not.toBeNull();
    expect(element.querySelector('.page-hero h1')?.textContent).toContain('Your playlists');
    expect(element.querySelector('.playlist-count-chip')?.getAttribute('aria-label')).toBe('1 playlist');
    expect(element.querySelector('.page-toolbar input[type="search"]')).not.toBeNull();
    expect(element.querySelector('.merge-toggle-button')?.getAttribute('aria-label')).toBe('Merge playlists');
    expect(element.querySelector('.merge-toggle-button .merge-toggle-label')?.textContent).toContain('Merge');
    const cardActions = Array.from(element.querySelectorAll('.item-card .card-actions button'));
    expect(cardActions.length).toBe(2);
    expect(cardActions.every(button => button.classList.contains('playlist-card-action'))).toBeTrue();
  });

  it('does not call Spotify when the cached playlist portfolio is complete and fresh', async () => {
    storage.set('current-user_playlists', JSON.stringify([
      {id: 'fav', name: 'Favourite Tracks', tracks: {total: 10}},
      {id: 'cached', name: 'Cached playlist', owner: {id: 'current-user'}, tracks: {total: 2}}
    ]));
    storage.set('current-user_playlists_lastUpdated', Date.now().toString());
    await component.loadPlaylists();

    expect(spotifyDataService.getAccessibleUserPlaylists).not.toHaveBeenCalled();
    expect(spotifyDataService.getFavTracks).not.toHaveBeenCalled();
    expect(storageService.restoreItemsFromCloud).not.toHaveBeenCalled();
    expect(component.playlists.map(playlist => playlist.id)).toEqual(['fav', 'cached']);
    expect(playlistLoader.recordPortfolioMetadata).not.toHaveBeenCalled();
  });

  it('uses a fresh cloud playlist portfolio before falling back to Spotify', async () => {
    authService.isBackupActive.and.returnValue(true);
    storageService.restoreItemsFromCloud.and.callFake(async () => {
      storage.set('current-user_playlists', JSON.stringify([
        {id: 'fav', name: 'Favourite Tracks', tracks: {total: 12}},
        {id: 'cloud', name: 'Cloud playlist', tracks: {total: 4}}
      ]));
      storage.set('current-user_playlists_lastUpdated', Date.now().toString());
      return 2;
    });

    await component.loadPlaylists();

    expect(storageService.restoreItemsFromCloud).toHaveBeenCalled();
    expect(spotifyDataService.getAccessibleUserPlaylists).not.toHaveBeenCalled();
    expect(component.playlists.map(playlist => playlist.id)).toEqual(['fav', 'cloud']);
  });

  it('reuses a Liked Songs count that was refreshed after the daily cutoff', async () => {
    storage.set('current-user_fav_Amount', '37');
    storage.set('current-user_fav_Amount_lastUpdated', Date.now().toString());
    spotifyDataService.getAccessibleUserPlaylists.and.returnValue(of({
      currentUserId: 'current-user',
      items: []
    }));

    await component.loadPlaylists();

    expect(spotifyDataService.getFavTracks).not.toHaveBeenCalled();
    expect(component.playlists[0].tracks.total).toBe(37);
  });

  it('loads the public profile ID before classifying personal-app playlist owners', async () => {
    authService.isPersonalAppConnection.and.returnValue(true);
    spotifyDataService.getCurrentUser.and.returnValue(of({id: 'public-profile-id'}));
    spotifyDataService.getAccessibleUserPlaylists.and.returnValue(of({
      currentUserId: 'public-profile-id',
      items: [{id: 'owned', owner: {id: 'public-profile-id'}, items: {total: 2}}]
    }));
    spotifyDataService.getFavTracks.and.returnValue(of({total: 0}));

    await component.loadPlaylists();

    expect(spotifyDataService.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(spotifyDataService.getAccessibleUserPlaylists).toHaveBeenCalledWith('public-profile-id', true);
    expect(storage.get('current-user_spotify_profile_id')).toBe('public-profile-id');
    expect(component.savedPlaylistCount).toBe(0);
  });

  it('repairs a cached account ID before classifying personal-app playlist owners', async () => {
    authService.isPersonalAppConnection.and.returnValue(true);
    storage.set('current-user_spotify_profile_id', 'stable-account-id');
    storage.set('current-user_playlists', JSON.stringify([
      {id: 'fav', name: 'Favourite Tracks', tracks: {total: 10}},
      {id: 'owned', name: 'Owned', owner: {id: 'public-profile-id'}, tracks: {total: 2}},
      {id: 'saved', name: 'Saved', owner: {id: 'friend'}, tracks: {total: 3}}
    ]));
    storage.set('current-user_playlists_lastUpdated', Date.now().toString());
    spotifyDataService.getCurrentUser.and.returnValue(of({
      account_id: 'stable-account-id', id: 'public-profile-id'
    }));

    await component.loadPlaylists();

    expect(spotifyDataService.getCurrentUser).toHaveBeenCalledTimes(1);
    expect(storage.get('current-user_spotify_profile_id')).toBe('public-profile-id');
    expect(storage.get('current-user_spotify_profile_id_verified')).toBe('true');
    expect(component.filteredPlaylists.map(playlist => playlist.id)).toEqual(['fav', 'owned']);
    expect(component.savedPlaylistCount).toBe(1);
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

  it('keeps playlist cards at their compact height when saved-owner details are shown', () => {
    component.playlists = [
      {id: 'owned', name: 'Owned', description: 'A compact card', owner: {id: 'current-user'}, tracks: {total: 2}},
      {id: 'saved', name: 'Saved', description: 'Another compact card', owner: {id: 'friend', display_name: 'Friend'}, tracks: {total: 3}}
    ];
    (component as any).currentSpotifyProfileId = 'current-user';
    component.filterPlaylists();
    fixture.detectChanges();

    const compactHeight = (fixture.nativeElement.querySelector('.item-card') as HTMLElement).getBoundingClientRect().height;
    component.toggleSavedPlaylists();
    fixture.detectChanges();

    const cards = Array.from(fixture.nativeElement.querySelectorAll('.item-card')) as HTMLElement[];
    expect(cards[1].classList).toContain('saved-playlist-card');
    expect(cards[0].getBoundingClientRect().height).toBeCloseTo(compactHeight, 0);
    expect(cards[1].getBoundingClientRect().height).toBeCloseTo(compactHeight, 0);
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
