import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormsModule} from '@angular/forms';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ComparePlaylistSourceService} from '@core/compare-room/compare-playlist-source.service';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {SharedPlaylistsComponent} from './shared-playlists.component';

describe('SharedPlaylistsComponent', () => {
  let fixture: ComponentFixture<SharedPlaylistsComponent>;
  let component: SharedPlaylistsComponent;
  let sharing: jasmine.SpyObj<PlaylistSharingService>;
  let auth: jasmine.SpyObj<SpotifyAuthService>;
  let source: jasmine.SpyObj<ComparePlaylistSourceService>;
  let statsSharing: jasmine.SpyObj<StatsSharingService>;
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
    statsSharing = jasmine.createSpyObj<StatsSharingService>('StatsSharingService', [
      'listAvailableUsers',
      'listAccessRequests',
      'subscribeToAccessChanges',
      'requestAccess',
      'respondToRequest',
      'revokeAccess'
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
    statsSharing.listAvailableUsers.and.resolveTo([]);
    statsSharing.listAccessRequests.and.resolveTo([]);
    statsSharing.subscribeToAccessChanges.and.returnValue(jasmine.createSpy('unsubscribeStats'));
    statsSharing.requestAccess.and.resolveTo('request-id');
    statsSharing.respondToRequest.and.resolveTo();
    statsSharing.revokeAccess.and.resolveTo();

    TestBed.configureTestingModule({
      declarations: [SharedPlaylistsComponent],
      imports: [FormsModule],
      providers: [
        {provide: PlaylistSharingService, useValue: sharing},
        {provide: SpotifyAuthService, useValue: auth},
        {provide: ComparePlaylistSourceService, useValue: source}
        ,{provide: StatsSharingService, useValue: statsSharing}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(SharedPlaylistsComponent);
    component = fixture.componentInstance;
  });

  it('keeps stats requests available but blocks playlist publishing without Cloud Backup', async () => {
    auth.isBackupActive.and.returnValue(false);

    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.open-share-menu-button')).not.toBeNull();
    await component.openShareDialog();
    await component.selectShareMode('playlist');
    expect(source.loadMainPlaylists).not.toHaveBeenCalled();
  });

  it('selects and publishes the playlist from the sharing menu', async () => {
    await component.openShareDialog();
    await component.selectShareMode('playlist');
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

  it('lets a user select stats access and request one registered user', async () => {
    statsSharing.listAvailableUsers.and.resolveTo([{
      userId: 'owner-id', displayName: 'Stats Owner', imageUrl: '',
      requestId: null, requestStatus: null
    }]);

    await component.openShareDialog();
    await component.selectShareMode('stats');
    component.selectedStatsOwnerId = 'owner-id';
    await component.requestStatsAccess();

    expect(statsSharing.requestAccess).toHaveBeenCalledOnceWith('owner-id');
    expect(component.successMessage).toContain('Stats Owner');
  });

  it('opens a custom consent popup for the oldest pending request and records agreement', async () => {
    statsSharing.listAccessRequests.and.resolveTo([{
      id: 'request-id', ownerUserId: 'me', viewerUserId: 'viewer-id',
      ownerDisplayName: 'Me', ownerImageUrl: '', viewerDisplayName: 'Viewer', viewerImageUrl: '',
      status: 'pending', requestedAt: '2026-09-01T10:00:00Z', respondedAt: null,
      revokedAt: null, updatedAt: '2026-09-01T10:00:00Z', viewerRole: 'owner'
    }]);

    await component.ngOnInit();
    expect(component.consentRequest?.viewerDisplayName).toBe('Viewer');

    await component.respondToStatsRequest(true);

    expect(statsSharing.respondToRequest).toHaveBeenCalledOnceWith('request-id', true);
    expect(component.consentRequest).toBeNull();
  });

  it('allows either side to revoke a per-user stats grant', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const request = {
      id: 'request-id', ownerDisplayName: 'Owner', viewerDisplayName: 'Viewer', status: 'approved'
    } as any;

    await component.revokeStatsAccess(request);

    expect(statsSharing.revokeAccess).toHaveBeenCalledOnceWith('request-id');
  });

  it('refreshes an existing shared playlist with its newest track snapshot', async () => {
    sharing.refreshShare.and.resolveTo(4);
    const share = {
      id: 'share-id', sourcePlaylistId: 'party', playlistName: 'Old party',
      playlistDescription: 'Keep this description', playlistImageUrl: 'old.jpg',
      ownerDisplayName: 'Owner', trackCount: 1
    } as any;

    await component.refreshShare(share);

    expect(source.loadMainTracks).toHaveBeenCalledWith(
      jasmine.objectContaining({id: 'party'}),
      'access-token',
      'spotify-user'
    );
    expect(sharing.refreshShare).toHaveBeenCalledWith('share-id', jasmine.objectContaining({
      sourcePlaylistId: 'party',
      playlistName: 'Party',
      playlistDescription: 'Keep this description',
      playlistImageUrl: 'party.jpg'
    }));
    expect(component.successMessage).toContain('revision 4');
  });

  it('does not revoke a playlist when its owner cancels the confirmation', async () => {
    spyOn(window, 'confirm').and.returnValue(false);

    await component.revokeShare({
      id: 'share-id', playlistName: 'Party', recipientDisplayName: 'Friend'
    } as any);

    expect(sharing.revokeShare).not.toHaveBeenCalled();
    expect(component.busyShareId).toBe('');
  });

  it('includes the owner in a received playlist name', () => {
    expect(component.receivedPlaylistName({
      playlistName: 'Party',
      ownerDisplayName: 'Simon'
    } as any)).toBe('Party · from Simon');
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
