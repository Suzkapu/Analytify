import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {of} from 'rxjs';
import {CallbackComponent} from './callback.component';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';

describe('CallbackComponent', () => {
  let component: CallbackComponent;
  let fixture: ComponentFixture<CallbackComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [CallbackComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { queryParams: of({ error: 'oauth_error' }) }
        },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        {
          provide: SpotifyAuthService,
          useValue: {
            isAuthenticated: () => false,
            exchangeSupabaseCodeForSession: () => of(null),
            handleCallbackSession: () => of(null),
            clearSupabaseSession: () => Promise.resolve()
          }
        }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(CallbackComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
