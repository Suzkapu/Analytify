import {Component, OnDestroy, ChangeDetectionStrategy} from '@angular/core';
import {SwUpdate, VersionReadyEvent} from '@angular/service-worker';
import {
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router
} from '@angular/router';
import {filter} from 'rxjs/operators';
import {take} from 'rxjs';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {SiteSettingsService} from '@core/settings/site-settings.service';

const navigationLog = createScopedLogger('Navigation');
const ANNOUNCEMENT_AUTO_HIDE_MS = 5000;

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AppComponent implements OnDestroy {
  title = 'Spotify Artists Stats';
  isInitialNavigationLoading: boolean;
  siteAnnouncement = '';
  announcementVisible = true;
  isLandingAnnouncement = true;
  updateReady = false;

  private navigationStartedAt = 0;
  private announcementHideTimer?: ReturnType<typeof setTimeout>;
  private transientAnnouncementShown = false;

  constructor(
    private swUpdate: SwUpdate,
    private router: Router,
    private siteSettings: SiteSettingsService
  ) {
    this.isInitialNavigationLoading = !this.router.navigated;
    void this.siteSettings.load().then(settings => {
      this.siteAnnouncement = settings.announcement;
      this.updateAnnouncementVisibility(this.router.url);
    }).catch(() => {});

    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.navigationStartedAt = performance.now();
        navigationLog.step('Opening page', {url: event.url});
      } else if (event instanceof NavigationEnd) {
        this.updateAnnouncementVisibility(event.urlAfterRedirects);
        navigationLog.success('Page ready', {
          url: event.urlAfterRedirects,
          durationMs: Math.round(performance.now() - this.navigationStartedAt)
        });
      } else if (event instanceof NavigationCancel) {
        const expectedCancellation = event.code === NavigationCancellationCode.Redirect
          || event.code === NavigationCancellationCode.SupersededByNewNavigation;
        if (expectedCancellation) {
          navigationLog.debug('Navigation redirected', {url: event.url});
        } else {
          navigationLog.warn('Navigation cancelled', {url: event.url, reason: event.reason});
        }
      } else if (event instanceof NavigationError) {
        navigationLog.error('Navigation failed', {url: event.url, error: event.error});
        const isChunkLoadError = event.error?.name === 'ChunkLoadError'
          || /loading chunk/i.test(event.error?.message || '')
          || /failed to fetch dynamically imported module/i.test(event.error?.message || '');
        if (isChunkLoadError) {
          const reloadKey = 'analytify_last_chunk_reload';
          const lastReload = Number(sessionStorage.getItem(reloadKey) || 0);
          if (Date.now() - lastReload > 10_000) {
            sessionStorage.setItem(reloadKey, String(Date.now()));
            window.location.reload();
          }
        }
      }
    });

    if (this.isInitialNavigationLoading) {
      this.router.events.pipe(
        filter(event => event instanceof NavigationEnd || event instanceof NavigationError),
        take(1)
      ).subscribe(() => {
        this.isInitialNavigationLoading = false;
      });
    }

    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates.pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
      ).subscribe(() => {
        this.updateReady = true;
      });
    }
  }

  ngOnDestroy(): void {
    this.clearAnnouncementHideTimer();
  }

  private updateAnnouncementVisibility(url: string): void {
    if (!this.siteAnnouncement) {
      this.announcementVisible = false;
      this.clearAnnouncementHideTimer();
      return;
    }

    this.isLandingAnnouncement = this.isLandingRoute(url);
    if (this.isLandingAnnouncement) {
      this.announcementVisible = true;
      this.clearAnnouncementHideTimer();
      return;
    }

    if (this.transientAnnouncementShown) {
      this.announcementVisible = this.announcementHideTimer !== undefined;
      return;
    }

    this.transientAnnouncementShown = true;
    this.announcementVisible = true;
    this.announcementHideTimer = setTimeout(() => {
      this.announcementHideTimer = undefined;
      this.announcementVisible = false;
    }, ANNOUNCEMENT_AUTO_HIDE_MS);
  }

  private isLandingRoute(url: string): boolean {
    const path = url.split(/[?#]/, 1)[0].replace(/\/+$/, '');
    return path === '' || path === '/login';
  }

  private clearAnnouncementHideTimer(): void {
    if (this.announcementHideTimer !== undefined) {
      clearTimeout(this.announcementHideTimer);
      this.announcementHideTimer = undefined;
    }
  }

  reloadForUpdate(): void {
    window.location.reload();
  }

  dismissUpdate(): void {
    this.updateReady = false;
  }

}
