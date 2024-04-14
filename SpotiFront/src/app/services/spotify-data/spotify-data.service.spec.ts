import {TestBed} from '@angular/core/testing';

import {SpotifyDataService} from './spotify-data.service';

describe('SpotifyDataService', () => {
  let service: SpotifyDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SpotifyDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
