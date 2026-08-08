import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormsModule} from '@angular/forms';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ComparePlaylistSourceService} from '@core/compare-room/compare-playlist-source.service';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';
import {SharedPlaylistsComponent} from './shared-playlists.component';

describe('SharedPlaylistsComponent', () => {
  let fixture: ComponentFixture<SharedPlaylistsComponent>;
  let component: SharedPlaylistsComponent;
  let sharing: jasmine.SpyObj<PlaylistSharingService>;
  let auth: jasmine.SpyObj<SpotifyAuthService>;
  let source: jasmine.SpyObj<ComparePlaylistSourceService>;
  let unsubscribe: jasmine.Spy;

  beforeEach(() => {
    sharing = jasmine.createSpyObj<PlaylistSharingService>('PlaylistSharingService', [
      'listReceivedShares',
      'listOwnedShares',
      'subscribeToShareChanges',
      'createShare',
      'refreshShare',
      'revokeShare'
    ]);
    auth = jasmine.createSpyObj<SpotifyAuthService>('SpotifyAuthService', [
      'isBackupActive',
      'getAccessToken',
      'isTokenExpired',
      'refreshToken',
      'getUserId'
    ]);
    source = jasmine.createSpyObj<ComparePlaylistSourceService>('ComparePlaylistSourceService', [
      'loadMainPlaylists',
      'loadMainTracks'
    ]);
    unsubscribe = jasmine.createSpy('unsubscribe');
    sharing.listReceivedShares.and.resolveTo([]);
    sharing.listOwnedShares.and.resolveTo([]);
    sharing.subscribeToShareChanges.and.returnValue(unsubscribe);
    sharing.createShare.and.resolveTo({
      shareId: 'share-id',
      claimToken: 'token',
      claimUrl: 'https://analytify.app/shared-playlists/claim/token'
    });
    auth.isBackupActive.and.returnValue(true);
    auth.getAccessToken.and.returnValue('access-token');
    auth.isTokenExpired.and.returnValue(false);
    auth.getUserId.and.returnValue('spotify-user');
    source.loadMainPlaylists.and.resolveTo([{
      id: 'party',
      name: 'Party',
      description: 'Party songs',
      imageUrl: 'party.jpg',
      total: 1,
      ownerName: 'Owner',
      isLikedSongs: false
    }]);
    source.loadMainTracks.and.resolveTo({source: 'local', tracks: [track('song')]});

    TestBed.configureTestingModule({
      declarations: [SharedPlaylistsComponent],
      imports: [FormsModule],
      providers: [
        {provide: PlaylistSharingService, useValue: sharing},
        {provide: SpotifyAuthService, useValue: auth},
        {provide: ComparePlaylistSourceService, useValue: source}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(SharedPlaylistsComponent);
    component = fixture.componentInstance;
  });

  it('hides playlist publishing when the owner has not enabled Cloud Backup', async () => {
    auth.isBackupActive.and.returnValue(false);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.open-share-menu-button')).toBeNull();
    await component.openShareDialog();
    expect(source.loadMainPlaylists).not.toHaveBeenCalled();
  });

  it('selects and publishes the playlist from the sharing menu', async () => {
    await component.openShareDialog();
    component.selectedPlaylistId = 'party';

    await component.createShareLink();

    expect(source.loadMainTracks).toHaveBeenCalledWith(
      jasmine.objectContaining({id: 'party'}),
      'access-token',
      'spotify-user'
    );
    expect(sharing.createShare).toHaveBeenCalledWith(jasmine.objectContaining({
      sourcePlaylistId: 'party',
      playlistName: 'Party',
      playlistDescription: 'Party songs'
    }));
    expect(component.shareLink).toContain('/shared-playlists/claim/token');
  });

  it('subscribes for live list updates and cleans up the channel', async () => {
    await component.ngOnInit();

    expect(sharing.subscribeToShareChanges).toHaveBeenCalledWith(jasmine.any(Function));
    component.ngOnDestroy();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  function track(id: string) {
    return {
      id,
      uri: `spotify:track:${id}`,
      name: id,
      artists: [{id: 'artist', name: 'Artist'}],
      albumName: '',
      imageUrl: '',
      spotifyUrl: '',
      playlistIndex: 1
    };
  }
});
