import {TestBed} from '@angular/core/testing';
import {Subject} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {PlaylistShareAutoSyncService} from './playlist-share-auto-sync.service';
import {PlaylistSharingService} from './playlist-sharing.service';

describe('PlaylistShareAutoSyncService', () => {
  let service: PlaylistShareAutoSyncService;
  let auth: jasmine.SpyObj<SpotifyAuthService>;
  let storage: jasmine.SpyObj<StorageService>;
  let sharing: jasmine.SpyObj<PlaylistSharingService>;
  let spotify: jasmine.SpyObj<ParticipantSpotifyService>;
  let realtimeChange: (() => void) | null;

  beforeEach(() => {
    auth = jasmine.createSpyObj<SpotifyAuthService>(
      'SpotifyAuthService',
      [
        'isAuthenticated',
        'ensureInitialSync',
        'isBackupActive',
        'getSupabaseUserId',
        'getUserId',
        'getAccessToken',
        'isTokenExpired',
        'refreshToken'
      ],
      {logout$: new Subject<void>()}
    );
    storage = jasmine.createSpyObj<StorageService>('StorageService', ['initFromDB', 'getItem']);
    sharing = jasmine.createSpyObj<PlaylistSharingService>(
      'PlaylistSharingService',
      [
        'listOwnedShares',
        'refreshActiveSharesFromCache',
        'listReceivedShares',
        'listReceivedDownloads',
        'loadShare',
        'recordDownload',
        'subscribeToShareChanges'
      ]
    );
    realtimeChange = null;
    spotify = jasmine.createSpyObj<ParticipantSpotifyService>('ParticipantSpotifyService', ['syncPlaylist']);
    auth.isAuthenticated.and.returnValue(true);
    auth.ensureInitialSync.and.resolveTo();
    auth.isBackupActive.and.returnValue(true);
    auth.getSupabaseUserId.and.returnValue('supabase-user');
    auth.getUserId.and.returnValue('spotify-user');
    auth.getAccessToken.and.returnValue('spotify-token');
    auth.isTokenExpired.and.returnValue(false);
    storage.initFromDB.and.resolveTo();
    storage.getItem.and.callFake((key: string) => {
      if (key === 'spotify-user_party') return JSON.stringify([{id: 'artist', tracks: [{id: 'song'}]}]);
      if (key === 'spotify-user_party_Name') return JSON.stringify('Current party mix');
      return null;
    });
    sharing.listOwnedShares.and.resolveTo([{
      id: 'share', sourcePlaylistId: 'party', playlistName: 'Old name', revokedAt: null
    } as any]);
    sharing.refreshActiveSharesFromCache.and.resolveTo(1);
    sharing.listReceivedShares.and.resolveTo([]);
    sharing.listReceivedDownloads.and.resolveTo([]);
    sharing.recordDownload.and.resolveTo();
    sharing.subscribeToShareChanges.and.callFake(callback => {
      realtimeChange = callback;
      return () => undefined;
    });

    TestBed.configureTestingModule({
      providers: [
        PlaylistShareAutoSyncService,
        {provide: SpotifyAuthService, useValue: auth},
        {provide: StorageService, useValue: storage},
        {provide: PlaylistSharingService, useValue: sharing},
        {provide: ParticipantSpotifyService, useValue: spotify}
      ]
    });
    service = TestBed.inject(PlaylistShareAutoSyncService);
  });

  it('publishes each active source from the current cache when Cloud Backup is active', async () => {
    await service.syncNow();

    expect(storage.initFromDB).toHaveBeenCalled();
    expect(sharing.refreshActiveSharesFromCache).toHaveBeenCalledOnceWith(
      'party',
      'Current party mix',
      [{id: 'artist', tracks: [{id: 'song'}]}]
    );
  });

  it('does not read or publish owner shares when Cloud Backup is disabled', async () => {
    auth.isBackupActive.and.returnValue(false);

    await service.syncNow();

    expect(sharing.listOwnedShares).not.toHaveBeenCalled();
    expect(sharing.refreshActiveSharesFromCache).not.toHaveBeenCalled();
  });

  it('does not subscribe or query without an explicit cloud identity', async () => {
    auth.getSupabaseUserId.and.returnValue(null);

    service.start();
    await service.syncNow();

    expect(sharing.subscribeToShareChanges).not.toHaveBeenCalled();
    expect(auth.ensureInitialSync).not.toHaveBeenCalled();
    expect(sharing.listOwnedShares).not.toHaveBeenCalled();
    expect(sharing.listReceivedShares).not.toHaveBeenCalled();
    expect(sharing.listReceivedDownloads).not.toHaveBeenCalled();
  });

  it('automatically updates an existing recipient Spotify copy without creating another playlist', async () => {
    auth.isBackupActive.and.returnValue(false);
    sharing.listReceivedShares.and.resolveTo([share(3)]);
    sharing.listReceivedDownloads.and.resolveTo([download(2)]);
    sharing.loadShare.and.resolveTo({
      share: share(3),
      tracks: [track('new-song')],
      download: download(2),
      viewerRole: 'recipient'
    });
    spotify.syncPlaylist.and.resolveTo({
      success: true,
      playlistName: 'Shared party',
      playlistId: 'existing-playlist',
      playlistUrl: 'spotify-url',
      addedTracks: 1
    });
    const update = jasmine.createSpy('update');
    service.spotifyUpdates$.subscribe(update);

    await service.syncNow();

    expect(spotify.syncPlaylist).toHaveBeenCalledWith(
      'spotify-token',
      'existing-playlist',
      'spotify-url',
      'Shared party · from Owner',
      jasmine.stringContaining('Share ID: received-share'),
      [track('new-song')]
    );
    expect(sharing.recordDownload).toHaveBeenCalledWith(
      'received-share',
      'existing-playlist',
      'spotify-url',
      3
    );
    expect(update).toHaveBeenCalledWith({shareId: 'received-share', revision: 3, success: true});
  });

  it('does not create a Spotify playlist for a received share that was never downloaded', async () => {
    auth.isBackupActive.and.returnValue(false);
    sharing.listReceivedShares.and.resolveTo([share(3)]);
    sharing.listReceivedDownloads.and.resolveTo([]);

    await service.syncNow();

    expect(sharing.loadShare).not.toHaveBeenCalled();
    expect(spotify.syncPlaylist).not.toHaveBeenCalled();
  });

  it('reacts to realtime changes with recipient sync only so owner publication cannot loop', async () => {
    service.start();
    await (service as any).syncPromise;
    sharing.listOwnedShares.calls.reset();
    sharing.listReceivedShares.calls.reset();

    realtimeChange?.();
    await (service as any).syncPromise;

    expect(sharing.listOwnedShares).not.toHaveBeenCalled();
    expect(sharing.listReceivedShares).toHaveBeenCalledTimes(1);
    service.stop();
  });

  function share(revision: number) {
    return {
      id: 'received-share', ownerUserId: 'owner', recipientUserId: 'recipient', sourcePlaylistId: 'source',
      playlistName: 'Shared party', playlistDescription: '', playlistImageUrl: '', ownerDisplayName: 'Owner',
      ownerImageUrl: '', recipientDisplayName: 'Recipient', trackCount: 1, revision,
      createdAt: 'now', updatedAt: 'now', acceptedAt: 'now', revokedAt: null
    };
  }

  function download(appliedRevision: number) {
    return {
      shareId: 'received-share', spotifyPlaylistId: 'existing-playlist', spotifyPlaylistUrl: 'spotify-url',
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
