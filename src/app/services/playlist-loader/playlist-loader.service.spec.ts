import { TestBed } from '@angular/core/testing';
import { EMPTY } from 'rxjs';
import { PlaylistLoaderService } from './playlist-loader.service';
import { SpotifyDataService } from '../spotify-data/spotify-data.service';
import { StorageService } from '../storage/storage.service';
import { SpotifyAuthService } from '../auth/spotify-auth.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('PlaylistLoaderService', () => {
  let service: PlaylistLoaderService;
  let storageValues: Record<string, string>;

  beforeEach(() => {
    storageValues = {};
    TestBed.configureTestingModule({
      providers: [
        PlaylistLoaderService,
        { provide: SpotifyDataService, useValue: {} },
        {
          provide: StorageService,
          useValue: { getItem: (key: string) => storageValues[key] ?? null }
        },
        { provide: SpotifyAuthService, useValue: { logout$: EMPTY } },
        { provide: SupabaseService, useValue: {} }
      ]
    });
    service = TestBed.inject(PlaylistLoaderService);
  });

  it('rejects a severely incomplete legacy playlist cache', () => {
    const artists = [{
      id: 'artist',
      tracks: Array.from({ length: 30 }, (_, index) => ({ id: `track-${index}` }))
    }];

    expect(service.isCachedPlaylistComplete(artists, 5000, null)).toBeFalse();
  });

  it('accepts a completed cache whose count roughly matches Spotify', () => {
    const artists = [{
      id: 'artist',
      tracks: Array.from({ length: 4975 }, (_, index) => ({ id: `track-${index}` }))
    }];

    expect(service.isCachedPlaylistComplete(artists, 5000, 4975)).toBeTrue();
  });

  it('rejects a cache whose consistency marker does not match its data', () => {
    const artists = [{
      id: 'artist',
      tracks: Array.from({ length: 30 }, (_, index) => ({ id: `track-${index}` }))
    }];

    expect(service.isCachedPlaylistComplete(artists, 5000, 5000)).toBeFalse();
  });

  it('uses the playlist-list total to expose a partial detail cache', () => {
    storageValues['user_playlists'] = JSON.stringify([
      { id: 'playlist', tracks: { total: 5000 } }
    ]);

    expect(service.resolveExpectedPlaylistTotal('user', 'playlist', 30)).toBe(5000);
  });
});
