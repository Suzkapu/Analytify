import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {ProfileImageService} from './profile-image.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';

describe('ProfileImageService', () => {
  let service: ProfileImageService;
  let storageService: jasmine.SpyObj<StorageService>;
  let spotifyDataService: jasmine.SpyObj<SpotifyDataService>;
  let supabaseService: jasmine.SpyObj<SupabaseService>;
  let storageMap: Map<string, string>;

  beforeEach(() => {
    storageMap = new Map<string, string>();
    storageService = jasmine.createSpyObj<StorageService>('StorageService', ['getItem', 'setItem', 'removeItem']);
    storageService.getItem.and.callFake((key: string) => storageMap.get(key) || null);
    storageService.setItem.and.callFake((key: string, value: string) => {
      storageMap.set(key, value);
    });
    storageService.removeItem.and.callFake((key: string) => {
      storageMap.delete(key);
    });

    spotifyDataService = jasmine.createSpyObj<SpotifyDataService>('SpotifyDataService', ['getCurrentUser']);
    spotifyDataService.getCurrentUser.and.returnValue(of({images: []}));

    supabaseService = jasmine.createSpyObj<SupabaseService>('SupabaseService', ['loadUserProfile']);
    supabaseService.loadUserProfile.and.resolveTo(null);

    TestBed.configureTestingModule({
      providers: [
        ProfileImageService,
        {provide: StorageService, useValue: storageService},
        {provide: SpotifyDataService, useValue: spotifyDataService},
        {provide: SupabaseService, useValue: supabaseService}
      ]
    });

    service = TestBed.inject(ProfileImageService);
  });

  it('504 -> success: handles transient 504 error and restores avatar upon successful retry', async () => {
    const userId = 'user-504';
    const originalUrl = 'https://cdn.example.com/avatar-504.jpg';

    // Probe mock: 1st probe returns 504, 2nd probe (retry) returns 200
    let probeCalls = 0;
    service.probeUrl = jasmine.createSpy('probeUrl').and.callFake(async () => {
      probeCalls++;
      if (probeCalls === 1) {
        return {ok: false, status: 504};
      }
      return {ok: true, status: 200};
    });

    // Initial failure triggers handleImageError
    const result = await service.handleImageError(originalUrl, userId);

    expect(service.probeUrl).toHaveBeenCalled();
    expect(result).toBe(originalUrl);

    // Verify metadata was updated and cached
    const meta = service.getMetadata(userId);
    expect(meta?.failureCount).toBe(0); // reset on success
    expect(storageService.setItem).toHaveBeenCalledWith(`${userId}_profile_pic`, originalUrl);
  });

  it('expired-URL refresh: detects expired signed URL parameters and refreshes from provider', async () => {
    const userId = 'user-expired';
    // Expired timestamp in the past (1000s after epoch)
    const expiredUrl = 'https://platform-lookaside.fbsbx.com/platform/profilepic/?oe=000003e8';
    const freshUrl = 'https://platform-lookaside.fbsbx.com/platform/profilepic/?oe=99999999';

    spotifyDataService.getCurrentUser.and.returnValue(of({
      id: 'spotify-user-id',
      images: [{url: freshUrl}]
    }));

    service.probeUrl = jasmine.createSpy('probeUrl').and.resolveTo({ok: true, status: 200});

    const result = await service.handleImageError(expiredUrl, userId);

    expect(spotifyDataService.getCurrentUser).toHaveBeenCalled();
    expect(result).toBe(freshUrl);
    expect(storageService.setItem).toHaveBeenCalledWith(`${userId}_profile_pic`, freshUrl);
  });

  it('404: categorizes dead URL as permanent absence when provider also has no images', async () => {
    const userId = 'user-404';
    const deadUrl = 'https://cdn.example.com/missing-404.jpg';

    service.probeUrl = jasmine.createSpy('probeUrl').and.resolveTo({ok: false, status: 404});
    spotifyDataService.getCurrentUser.and.returnValue(of({
      id: 'spotify-user-id',
      images: []
    }));

    const result = await service.handleImageError(deadUrl, userId);

    expect(result).toBeNull();
    const meta = service.getMetadata(userId);
    expect(meta?.isPermanentlyAbsent).toBeTrue();
    expect(storageMap.has(`${userId}_profile_pic`)).toBeFalse();

    // Subsequent load does not poll provider again
    spotifyDataService.getCurrentUser.calls.reset();
    const secondLoad = await service.loadProfileImage(userId);
    expect(secondLoad).toBeNull();
    expect(spotifyDataService.getCurrentUser).not.toHaveBeenCalled();
  });

  it('offline: does not penalize retry limit or mark as permanently absent when offline', async () => {
    const userId = 'user-offline';
    const avatarUrl = 'https://cdn.example.com/avatar.jpg';

    spyOn(service, 'isOffline').and.returnValue(true);

    const result = await service.handleImageError(avatarUrl, userId);

    expect(result).toBeNull(); // Quiet fallback
    const meta = service.getMetadata(userId);
    expect(meta?.lastFailureStatus).toBe('offline');
    expect(meta?.isPermanentlyAbsent).toBeFalsy();
    expect(meta?.failureCount).toBe(1);
  });

  it('retry-limit: stops retrying and provides quiet fallback once retry limit is exceeded', async () => {
    const userId = 'user-retry-limit';
    const persistentFailUrl = 'https://cdn.example.com/failing.jpg';

    service.probeUrl = jasmine.createSpy('probeUrl').and.resolveTo({ok: false, status: 504});
    spotifyDataService.getCurrentUser.and.returnValue(of({
      images: [{url: persistentFailUrl}]
    }));

    // Perform multiple failed attempts
    for (let i = 0; i <= service.maxRetries + 1; i++) {
      const result = await service.handleImageError(persistentFailUrl, userId);
      expect(result).toBeNull();
    }

    const meta = service.getMetadata(userId);
    expect(meta?.failureCount).toBeGreaterThan(service.maxRetries);
    expect(meta?.isPermanentlyAbsent).toBeFalsy(); // Still not permanently absent!

    // Verify quiet fallback on loadProfileImage during cooldown
    const loadResult = await service.loadProfileImage(userId);
    expect(loadResult).toBeNull();
  });

  it('correctly parses expiry from Facebook oe and CloudFront Expires query parameters', () => {
    const fbUrl = 'https://platform-lookaside.fbsbx.com/avatar?oe=67D12345';
    const expectedFbMs = parseInt('67D12345', 16) * 1000;
    expect(service.extractUrlExpiry(fbUrl)).toBe(expectedFbMs);

    const s3Url = 'https://s3.amazonaws.com/avatar.jpg?Expires=1750000000';
    expect(service.extractUrlExpiry(s3Url)).toBe(1750000000 * 1000);

    const plainUrl = 'https://i.scdn.co/image/ab6775700000ee8512345678';
    expect(service.extractUrlExpiry(plainUrl)).toBeNull();
  });
});
