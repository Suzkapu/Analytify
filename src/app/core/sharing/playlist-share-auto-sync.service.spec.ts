import {TestBed} from '@angular/core/testing';
import {Subject} from 'rxjs';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {PlaylistShareAutoSyncService} from './playlist-share-auto-sync.service';
import {PlaylistSharingService} from './playlist-sharing.service';

describe('PlaylistShareAutoSyncService', () => {
  let service: PlaylistShareAutoSyncService;
  let auth: jasmine.SpyObj<SpotifyAuthService>;
  let storage: jasmine.SpyObj<StorageService>;
  let sharing: jasmine.SpyObj<PlaylistSharingService>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<SpotifyAuthService>(
      'SpotifyAuthService',
      ['isAuthenticated', 'ensureInitialSync', 'isBackupActive', 'getUserId'],
      {logout$: new Subject<void>()}
    );
    storage = jasmine.createSpyObj<StorageService>('StorageService', ['initFromDB', 'getItem']);
    sharing = jasmine.createSpyObj<PlaylistSharingService>(
      'PlaylistSharingService',
      ['listOwnedShares', 'refreshActiveSharesFromCache']
    );
    auth.isAuthenticated.and.returnValue(true);
    auth.ensureInitialSync.and.resolveTo();
    auth.isBackupActive.and.returnValue(true);
    auth.getUserId.and.returnValue('spotify-user');
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

    TestBed.configureTestingModule({
      providers: [
        PlaylistShareAutoSyncService,
        {provide: SpotifyAuthService, useValue: auth},
        {provide: StorageService, useValue: storage},
        {provide: PlaylistSharingService, useValue: sharing}
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
});
