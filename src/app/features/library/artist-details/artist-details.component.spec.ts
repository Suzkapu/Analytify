import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {of} from 'rxjs';
import {ArtistDetailsComponent} from './artist-details.component';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';

describe('ArtistDetailsComponent', () => {
  let component: ArtistDetailsComponent;
  let fixture: ComponentFixture<ArtistDetailsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ArtistDetailsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({ id: 'artist-id' }) } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: SpotifyDataService, useValue: { getSingleArtist: () => of({ id: 'artist-id' }) } },
        {
          provide: SpotifyAuthService,
          useValue: { getUserId: () => 'user-id', isBackupActive: () => false }
        },
        {
          provide: StorageService,
          useValue: { getItem: () => null, setItem: jasmine.createSpy('setItem') }
        },
        { provide: SupabaseService, useValue: { loadArtistById: () => Promise.resolve(null) } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(ArtistDetailsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
