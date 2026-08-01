import {TestBed} from '@angular/core/testing';
import {AuthReturnUrlService} from './auth-return-url.service';

describe('AuthReturnUrlService', () => {
  let service: AuthReturnUrlService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(AuthReturnUrlService);
  });

  afterEach(() => sessionStorage.clear());

  it('returns a private share claim route once after login', () => {
    service.remember('/shared-playlists/claim/private-token');

    expect(service.consume()).toBe('/shared-playlists/claim/private-token');
    expect(service.consume()).toBe('/playlists');
  });

  it('rejects protocol-relative redirect targets', () => {
    service.remember('//malicious.example');
    expect(service.consume()).toBe('/playlists');
  });
});
