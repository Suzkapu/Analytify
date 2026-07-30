import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {LoginPageComponent} from './login-page.component';
import {SpotifyAuthService} from '../../services/auth/spotify-auth.service';
import {StorageService} from '../../services/storage/storage.service';

describe('LoginPageComponent', () => {
  let component: LoginPageComponent;
  let fixture: ComponentFixture<LoginPageComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [LoginPageComponent],
      providers: [
        {
          provide: SpotifyAuthService,
          useValue: { isAuthenticated: () => false, loginWithSupabase: () => Promise.resolve() }
        },
        {
          provide: StorageService,
          useValue: { initFromDB: () => Promise.resolve() }
        },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(LoginPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
