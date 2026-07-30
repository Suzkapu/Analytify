import { TestBed } from '@angular/core/testing';
import {HttpClientTestingModule} from '@angular/common/http/testing';
import { SpotifyAuthService } from './spotify-auth.service';
import {StorageService} from '../storage/storage.service';
import {SupabaseService} from '../supabase/supabase.service';

describe('SpotifyAuthService', () => {
  let service: SpotifyAuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        {
          provide: StorageService,
          useValue: {
            initFromDB: () => Promise.resolve(),
            getItem: () => null,
            setItem: jasmine.createSpy('setItem')
          }
        },
        {
          provide: SupabaseService,
          useValue: {
            client: {
              auth: {
                getSession: () => Promise.resolve({ data: { session: null }, error: null })
              }
            }
          }
        }
      ]
    });
    service = TestBed.inject(SpotifyAuthService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
