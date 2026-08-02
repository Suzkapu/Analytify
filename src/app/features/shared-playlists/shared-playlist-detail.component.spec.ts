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

  beforeEach(() => {
    sharing = jasmine.createSpyObj<PlaylistSharingService>('PlaylistSharingService', [
      'loadShare',
      'calculateStats',
      'recordDownload'
    ]);
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

  function track(id: string) {
    return {
      id, uri: `spotify:track:${id}`, name: id, artists: [{id: 'artist', name: 'Artist'}],
      albumName: '', imageUrl: '', spotifyUrl: '', playlistIndex: 1
    };
  }
});
