import {TestBed} from '@angular/core/testing';
import {HttpClientTestingModule} from '@angular/common/http/testing';
import {SpotifyDataService} from './spotify-data.service';
import {SpotifyAuthService} from '../auth/spotify-auth.service';
import {StorageService} from '../storage/storage.service';

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
});
