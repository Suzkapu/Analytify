import {AfterViewInit, Component, NgZone, OnDestroy} from '@angular/core';
import {SwUpdate, VersionReadyEvent} from '@angular/service-worker';
import {NavigationEnd, NavigationError, Router} from '@angular/router';
import {filter} from 'rxjs/operators';
import {take} from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements AfterViewInit, OnDestroy {
  title = 'Spotify Artists Stats';
  showScrollBtn = false;
  isInitialNavigationLoading: boolean;

  private readonly windowScrollHandler = () => this.onWindowScroll();

  constructor(
    private swUpdate: SwUpdate,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.isInitialNavigationLoading = !this.router.navigated;

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
        if (confirm('A new version of the app is available. Reload the page to load it?')) {
          window.location.reload();
        }
      });
    }
  }

  ngAfterViewInit(): void {
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.windowScrollHandler, {passive: true});
      this.onWindowScroll();
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.windowScrollHandler);
  }

  onWindowScroll(): void {
    const scrollPos = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    const shouldShow = scrollPos > 300;
    if (shouldShow !== this.showScrollBtn) {
      this.ngZone.run(() => this.showScrollBtn = shouldShow);
    }
  }

  scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}
