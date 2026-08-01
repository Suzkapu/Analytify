import {TestBed} from '@angular/core/testing';
import {HttpClientTestingModule} from '@angular/common/http/testing';
import {SpotifyDataService} from './spotify-data.service';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {firstValueFrom, of, throwError} from 'rxjs';

describe('SpotifyDataService', () => {
  let service: SpotifyDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: SpotifyAuthService, useValue: {} },
        { provide: StorageService, useValue: { getItem: () => null, setItem: jasmine.createSpy('setItem') } }
      ]
    });
    service = TestBed.inject(SpotifyDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('keeps owned and collaborative playlists while excluding inaccessible playlists', async () => {
    spyOn(service, 'getCurrentUser').and.returnValue(of({ id: 'current-user' }));
    spyOn(service, 'getAllUserPlaylists').and.returnValue(of({
      total: 3,
      items: [
        { id: 'owned', owner: { id: 'current-user' }, collaborative: false },
        { id: 'shared', owner: { id: 'other-user' }, collaborative: true },
        { id: 'private', owner: { id: 'other-user' }, collaborative: false }
      ]
    }));

    const result = await firstValueFrom(service.getAccessibleUserPlaylists());

    expect(result.currentUserId).toBe('current-user');
    expect(result.items.map((playlist: any) => playlist.id)).toEqual(['owned', 'shared']);
  });

  it('skips the profile request when the Spotify user ID is already known', async () => {
    const profileRequest = spyOn(service, 'getCurrentUser');
    spyOn(service, 'getAllUserPlaylists').and.returnValue(of({
      total: 1,
      items: [{id: 'owned', owner: {id: 'current-user'}, collaborative: false}]
    }));

    const result = await firstValueFrom(service.getAccessibleUserPlaylists('current-user'));

    expect(profileRequest).not.toHaveBeenCalled();
    expect(result.currentUserId).toBe('current-user');
    expect(result.items.map((playlist: any) => playlist.id)).toEqual(['owned']);
  });

  it('normalizes playlist item payloads into the track shape used by the UI', async () => {
    spyOn(service, 'makeRequest').and.returnValue(of({
      id: 'playlist',
      items: {
        total: 1,
        items: [{ added_at: 'today', item: { id: 'track', name: 'Track' } }]
      }
    }));

    const result = await firstValueFrom(service.getSinglePlaylist('playlist'));

    expect(result.tracks.total).toBe(1);
    expect(result.tracks.items[0].track.id).toBe('track');
    expect(result.tracks.items[0].added_at).toBe('today');
  });

  it('does not call Spotify for empty artist or track batches', async () => {
    const artistRequest = spyOn(service, 'getSingleArtist');
    const trackRequest = spyOn(service, 'getSingleTrack');

    expect(await firstValueFrom(service.getArtistsByIds([]))).toEqual({ artists: [] });
    expect(await firstValueFrom(service.getTracksByIds([]))).toEqual({ tracks: [] });
    expect(artistRequest).not.toHaveBeenCalled();
    expect(trackRequest).not.toHaveBeenCalled();
  });

  it('does not retry a Spotify quota-exceeded response', async () => {
    const quotaError = { status: 429, error: { reason: 'QUOTA_EXCEEDED' } };
    const request = jasmine.createSpy('request').and.returnValue(throwError(() => quotaError));

    await expectAsync(firstValueFrom(service.makeRequest(request))).toBeRejectedWith(quotaError);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
