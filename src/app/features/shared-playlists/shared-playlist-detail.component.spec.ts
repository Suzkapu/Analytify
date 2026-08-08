import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {SharedPlaylistDetailComponent} from './shared-playlist-detail.component';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';

describe('SharedPlaylistDetailComponent', () => {
  let fixture: ComponentFixture<SharedPlaylistDetailComponent>;
  let component: SharedPlaylistDetailComponent;
  let sharing: jasmine.SpyObj<PlaylistSharingService>;
  let spotify: jasmine.SpyObj<ParticipantSpotifyService>;
  let unsubscribeShareChanges: jasmine.Spy;

  beforeEach(() => {
    sharing = jasmine.createSpyObj<PlaylistSharingService>('PlaylistSharingService', [
      'loadShare',
      'calculateStats',
      'recordDownload',
      'subscribeToShareChanges'
    ]);
    unsubscribeShareChanges = jasmine.createSpy('unsubscribeShareChanges');
    sharing.subscribeToShareChanges.and.returnValue(unsubscribeShareChanges);
    spotify = jasmine.createSpyObj<ParticipantSpotifyService>('ParticipantSpotifyService', ['syncPlaylist']);
    sharing.loadShare.and.resolveTo({
      share: {
        id: 'share-id', ownerUserId: 'owner', recipientUserId: 'recipient', sourcePlaylistId: 'source',
        playlistName: 'Shared party', playlistDescription: '', playlistImageUrl: '', ownerDisplayName: 'Owner',
        ownerImageUrl: '', recipientDisplayName: 'Recipient', trackCount: 1, revision: 2,
        createdAt: 'now', updatedAt: 'now', acceptedAt: 'now', revokedAt: null
      },
      tracks: [track('song')],
      download: {
        shareId: 'share-id', spotifyPlaylistId: 'existing', spotifyPlaylistUrl: 'spotify-url',
        appliedRevision: 1, updatedAt: 'before'
      },
      viewerRole: 'recipient'
    });
    sharing.calculateStats.and.returnValue({
      tracks: 1, artists: 1, albums: 0, durationMs: 0, explicitTracks: 0, topArtists: [], topAlbums: []
    });
    sharing.recordDownload.and.resolveTo();
    spotify.syncPlaylist.and.resolveTo({
      success: true,
      playlistName: 'Shared party',
      playlistId: 'existing',
      playlistUrl: 'spotify-url',
      addedTracks: 1
    });

    TestBed.configureTestingModule({
      declarations: [SharedPlaylistDetailComponent],
      providers: [
        {provide: ActivatedRoute, useValue: {snapshot: {paramMap: {get: () => 'share-id'}}}},
        {provide: Router, useValue: {navigate: jasmine.createSpy('navigate')}},
        {
          provide: SpotifyAuthService,
          useValue: {getAccessToken: () => 'token', isTokenExpired: () => false, refreshToken: jasmine.createSpy()}
        },
        {provide: ParticipantSpotifyService, useValue: spotify},
        {provide: PlaylistSharingService, useValue: sharing}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(SharedPlaylistDetailComponent);
    component = fixture.componentInstance;
  });

  it('updates the Spotify playlist stored for the immutable share ID', async () => {
    await component.load();
    expect(component.hasUpdate).toBeTrue();

    await component.downloadOrUpdate();

    expect(spotify.syncPlaylist).toHaveBeenCalledWith(
      'token', 'existing', 'spotify-url', 'Shared party', jasmine.stringContaining('Share ID: share-id'), jasmine.any(Array)
    );
    expect(sharing.recordDownload).toHaveBeenCalledWith('share-id', 'existing', 'spotify-url', 2);
    expect(component.download?.appliedRevision).toBe(2);
  });

  it('silently reloads a matching live update and keeps Spotify synchronization manual', async () => {
    sharing.loadShare.and.returnValues(
      Promise.resolve({
        share: share(2),
        tracks: [track('old-song')],
        download: download(1),
        viewerRole: 'recipient'
      }),
      Promise.resolve({
        share: share(3),
        tracks: [track('new-song')],
        download: download(1),
        viewerRole: 'recipient'
      })
    );

    await component.ngOnInit();

    expect(sharing.subscribeToShareChanges).toHaveBeenCalledWith(jasmine.any(Function), 'share-id');
    const onChange = sharing.subscribeToShareChanges.calls.mostRecent().args[0];
    onChange();
    expect(component.isLoading).toBeFalse();
    await fixture.whenStable();

    expect(component.share?.revision).toBe(3);
    expect(component.tracks.map(item => item.id)).toEqual(['new-song']);
    expect(component.liveUpdateMessage).toContain('revision 3');
    expect(component.hasUpdate).toBeTrue();
    expect(spotify.syncPlaylist).not.toHaveBeenCalled();
  });

  it('unsubscribes from live updates when the detail page is destroyed', async () => {
    await component.ngOnInit();

    component.ngOnDestroy();

    expect(unsubscribeShareChanges).toHaveBeenCalledTimes(1);
  });

  function share(revision: number) {
    return {
      id: 'share-id', ownerUserId: 'owner', recipientUserId: 'recipient', sourcePlaylistId: 'source',
      playlistName: 'Shared party', playlistDescription: '', playlistImageUrl: '', ownerDisplayName: 'Owner',
      ownerImageUrl: '', recipientDisplayName: 'Recipient', trackCount: 1, revision,
      createdAt: 'now', updatedAt: 'now', acceptedAt: 'now', revokedAt: null
    };
  }

  function download(appliedRevision: number) {
    return {
      shareId: 'share-id', spotifyPlaylistId: 'existing', spotifyPlaylistUrl: 'spotify-url',
      appliedRevision, updatedAt: 'before'
    };
  }

  function track(id: string) {
    return {
      id, uri: `spotify:track:${id}`, name: id, artists: [{id: 'artist', name: 'Artist'}],
      albumName: '', imageUrl: '', spotifyUrl: '', playlistIndex: 1
    };
  }
});
