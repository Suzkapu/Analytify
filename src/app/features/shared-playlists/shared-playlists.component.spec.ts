import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormsModule} from '@angular/forms';
import {RouterTestingModule} from '@angular/router/testing';
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
      imports: [FormsModule, RouterTestingModule],
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

    expect(sharing.listReceivedShares).toHaveBeenCalled();
    expect(sharing.listOwnedShares).toHaveBeenCalled();
    expect(statsSharing.listAccessRequests).toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.open-share-menu-button')).not.toBeNull();
    await component.openShareDialog();
    fixture.detectChanges();
    const choices = Array.from(
      fixture.nativeElement.querySelectorAll('.share-mode-picker button')
    ) as HTMLButtonElement[];
    expect(choices[0].disabled).toBeTrue();
    expect(choices[0].textContent).toContain('Requires Cloud Backup');
    expect(choices[1].disabled).toBeFalse();
    await component.selectShareMode('playlist');
    expect(source.loadMainPlaylists).not.toHaveBeenCalled();
  });

  it('grays out snapshot refresh with an explanation but keeps revoke available when backup is off', async () => {
    auth.isBackupActive.and.returnValue(false);
    sharing.listOwnedShares.and.resolveTo([{
      id: 'share-id', sourcePlaylistId: 'party', playlistName: 'Party', playlistDescription: '',
      playlistImageUrl: '', ownerDisplayName: 'Owner', recipientDisplayName: 'Friend',
      trackCount: 1, revision: 1, revokedAt: null
    } as any]);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const actions = Array.from(
      fixture.nativeElement.querySelectorAll('.owner-share-actions button')
    ) as HTMLButtonElement[];
    const refresh = actions.find(button => button.textContent?.includes('Refresh snapshot'));
    const revoke = actions.find(button => button.textContent?.includes('Revoke access'));
    expect(refresh?.disabled).toBeTrue();
    expect(refresh?.title).toContain('Enable Cloud Backup');
    expect(revoke?.disabled).toBeFalse();
  });

  it('defensively refuses snapshot refresh without loading or publishing Spotify data', async () => {
    auth.isBackupActive.and.returnValue(false);

    await component.refreshShare({id: 'share-id', playlistName: 'Party'} as any);

    expect(component.errorMessage).toContain('Enable Cloud Backup');
    expect(source.loadMainPlaylists).not.toHaveBeenCalled();
    expect(source.loadMainTracks).not.toHaveBeenCalled();
    expect(sharing.refreshShare).not.toHaveBeenCalled();
  });

  it('titles the page for both playlist and stats sharing', async () => {
    fixture.detectChanges();
    await fixture.whenStable();

    const heading = fixture.nativeElement.querySelector('h1') as HTMLElement;
    expect(heading.textContent?.trim()).toBe('Private sharing');
    expect(fixture.nativeElement.textContent).toContain('playlist');
    expect(fixture.nativeElement.textContent).toContain('stats');
  });

  it('starts playlist and stats sharing loads in parallel', async () => {
    let resolveReceived!: (shares: any[]) => void;
    let resolveOwned!: (shares: any[]) => void;
    let resolveRequests!: (requests: any[]) => void;
    sharing.listReceivedShares.and.returnValue(new Promise(resolve => resolveReceived = resolve));
    sharing.listOwnedShares.and.returnValue(new Promise(resolve => resolveOwned = resolve));
    statsSharing.listAccessRequests.and.returnValue(new Promise(resolve => resolveRequests = resolve));

    const reload = component.reload();

    expect(sharing.listReceivedShares).toHaveBeenCalledTimes(1);
    expect(sharing.listOwnedShares).toHaveBeenCalledTimes(1);
    expect(statsSharing.listAccessRequests).toHaveBeenCalledTimes(1);

    resolveReceived([]);
    resolveOwned([]);
    resolveRequests([]);
    await reload;
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

  it('shows approved stats as the real stats route and labels access management as Requests', async () => {
    statsSharing.listAccessRequests.and.resolveTo([{
      id: 'request-id', ownerUserId: 'owner-id', viewerUserId: 'viewer-id',
      ownerDisplayName: 'Stats Owner', ownerImageUrl: '', viewerDisplayName: 'Viewer', viewerImageUrl: '',
      status: 'approved', requestedAt: '2026-09-01T10:00:00Z', respondedAt: '2026-09-01T11:00:00Z',
      revokedAt: null, updatedAt: '2026-09-01T11:00:00Z', viewerRole: 'viewer'
    }]);

    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const statsLink = fixture.nativeElement.querySelector('.stats-user-card') as HTMLAnchorElement;
    expect(statsLink.getAttribute('href')).toBe('/stats/owner-id');
    expect(fixture.nativeElement.textContent).toContain('Requests');
    expect(fixture.nativeElement.textContent).not.toContain('Per-user consent');
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

  it('does not open a realtime channel when the page closes during its initial load', async () => {
    let finishLoad!: (shares: any[]) => void;
    sharing.listReceivedShares.and.returnValue(new Promise(resolve => finishLoad = resolve));

    const initialization = component.ngOnInit();
    component.ngOnDestroy();
    finishLoad([]);
    await initialization;

    expect(sharing.subscribeToShareChanges).not.toHaveBeenCalled();
    expect(statsSharing.subscribeToAccessChanges).not.toHaveBeenCalled();
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
