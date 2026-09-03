import {TestBed} from '@angular/core/testing';
import {RouterTestingModule} from '@angular/router/testing';
import {SwUpdate} from '@angular/service-worker';
import {NavigationCancel, NavigationCancellationCode, NavigationEnd, Router} from '@angular/router';
import {fakeAsync, flushMicrotasks, tick} from '@angular/core/testing';
import {Subject} from 'rxjs';
import {AppComponent} from './app.component';
import {SiteSettingsService} from '@core/settings/site-settings.service';

describe('AppComponent', () => {
  const routerEvents = new Subject<NavigationEnd | NavigationCancel>();

  beforeEach(() => TestBed.configureTestingModule({
    imports: [RouterTestingModule],
    declarations: [AppComponent],
    providers: [
      {
        provide: SwUpdate,
        useValue: { isEnabled: false }
      },
      {
        provide: Router,
        useValue: {
          navigated: false,
          url: '/',
          events: routerEvents.asObservable()
        }
      },
      {
        provide: SiteSettingsService,
        useValue: {load: () => Promise.resolve({announcement: '', allowSongLeagueCreation: true})}
      }
    ]
  }));

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the Analytify stats title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('Spotify Artists Stats');
  });

  it('should render the router outlet and scroll button', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
    expect(compiled.querySelector('.scroll-to-top-btn')).not.toBeNull();
  });

  it('should overlay an announcement without moving the routed page', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.componentInstance.siteAnnouncement = 'Scheduled maintenance';
    fixture.detectChanges();

    const announcement = fixture.nativeElement.querySelector('.site-announcement') as HTMLElement;
    expect(announcement).not.toBeNull();
    expect(getComputedStyle(announcement).position).toBe('fixed');
    expect(getComputedStyle(announcement).pointerEvents).toBe('none');
  });

  it('should keep the announcement visible on the landing page', fakeAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    flushMicrotasks();
    fixture.componentInstance.siteAnnouncement = 'Scheduled maintenance';

    routerEvents.next(new NavigationEnd(1, '/', '/'));
    tick(6000);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.site-announcement')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.site-announcement-transient')).toBeNull();
  }));

  it('should briefly show the announcement on other pages and then hide it', fakeAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    flushMicrotasks();
    fixture.componentInstance.siteAnnouncement = 'Scheduled maintenance';

    routerEvents.next(new NavigationEnd(1, '/stats', '/stats'));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.site-announcement-transient')).not.toBeNull();

    tick(5000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.site-announcement')).toBeNull();
  }));

  it('should show a loading screen until the initial navigation finishes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.app-loading')).not.toBeNull();

    routerEvents.next(new NavigationEnd(1, '/', '/login'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.app-loading')).toBeNull();
  });

  it('does not warn when a navigation is superseded by a newer navigation', () => {
    const warn = spyOn(console, 'warn');
    TestBed.createComponent(AppComponent);

    routerEvents.next(new NavigationCancel(
      2,
      '/playlists',
      'A newer navigation replaced this one.',
      NavigationCancellationCode.SupersededByNewNavigation
    ));

    expect(warn).not.toHaveBeenCalled();
  });
});
