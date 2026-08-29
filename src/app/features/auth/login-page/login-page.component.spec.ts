import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {LoginPageComponent} from './login-page.component';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {AuthReturnUrlService} from '@core/auth/auth-return-url.service';

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
        {
          provide: Router,
          useValue: {navigate: jasmine.createSpy('navigate'), navigateByUrl: jasmine.createSpy('navigateByUrl')}
        },
        {provide: AuthReturnUrlService, useValue: {consume: () => '/playlists'}}
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

  it('renders hosted and personal-app login without promoting Compare Room', () => {
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('main.login-wrapper')).not.toBeNull();
    expect(element.querySelector('.login-shell')).not.toBeNull();
    expect(element.querySelectorAll('.login-benefits li').length).toBe(3);
    expect(element.querySelector('.login-card-header > .login-brand')).not.toBeNull();
    expect(element.querySelector('.login-intro > .login-brand')).toBeNull();
    expect(element.querySelector('.login-card-icon')).toBeNull();
    expect(element.querySelector('button.login-spotify-button')).not.toBeNull();
    expect(element.querySelector('a.personal-app-button')).not.toBeNull();
    expect(element.querySelector('a.compare-room-button')).toBeNull();
    expect(element.textContent).not.toContain('Open a Compare Room');
  });
});
