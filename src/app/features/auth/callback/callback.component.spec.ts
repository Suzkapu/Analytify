import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {of} from 'rxjs';
import {CallbackComponent} from './callback.component';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {AuthReturnUrlService} from '@core/auth/auth-return-url.service';

describe('CallbackComponent', () => {
  let component: CallbackComponent;
  let fixture: ComponentFixture<CallbackComponent>;
  let router: jasmine.SpyObj<Router>;
  let auth: jasmine.SpyObj<SpotifyAuthService>;

  beforeEach(() => {
    router = jasmine.createSpyObj<Router>('Router', ['navigate', 'navigateByUrl']);
    router.navigateByUrl.and.resolveTo(true);
    auth = jasmine.createSpyObj<SpotifyAuthService>('SpotifyAuthService', [
      'isAuthenticated',
      'exchangeSupabaseCodeForSession',
      'handleCallbackSession',
      'clearSupabaseSession',
      'recoverUsableSession'
    ]);
    auth.isAuthenticated.and.returnValue(false);
    auth.exchangeSupabaseCodeForSession.and.returnValue(of(null));
    auth.handleCallbackSession.and.returnValue(of(null));
    auth.clearSupabaseSession.and.resolveTo();
    auth.recoverUsableSession.and.resolveTo(false);

    TestBed.configureTestingModule({
      declarations: [CallbackComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { queryParams: of({ error: 'oauth_error' }) }
        },
        {
          provide: Router,
          useValue: router
        },
        {provide: AuthReturnUrlService, useValue: {consume: () => '/playlists'}},
        {provide: SpotifyAuthService, useValue: auth}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(CallbackComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('resumes an existing usable session instead of showing an OAuth error', async () => {
    auth.recoverUsableSession.and.resolveTo(true);

    component.ngOnInit();
    await flushAsyncWork();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/playlists');
    expect(component.errorMessage).toBeNull();
  });

  it('shows the OAuth error only when no usable session can be recovered', async () => {
    component.ngOnInit();
    await flushAsyncWork();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(component.errorMessage).toBe('Spotify login error: oauth_error');
  });

  async function flushAsyncWork(): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
});
