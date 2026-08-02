import {Component, HostListener} from '@angular/core';
import {SwUpdate, VersionReadyEvent} from '@angular/service-worker';
import {NavigationEnd, NavigationError, Router} from '@angular/router';
import {filter} from 'rxjs/operators';
import {take} from 'rxjs';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'Spotify Artists Stats';
  showScrollBtn = false;
  isInitialNavigationLoading: boolean;

  constructor(private swUpdate: SwUpdate, private router: Router) {
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

  @HostListener('window:scroll', [])
  onWindowScroll() {
    const scrollPos = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
    this.showScrollBtn = scrollPos > 300;
  }

  scrollToTop() {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}
