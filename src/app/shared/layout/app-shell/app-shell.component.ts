import {Component, OnDestroy, OnInit} from '@angular/core';
import {Location} from '@angular/common';
import {ActivatedRoute, NavigationEnd, Router} from '@angular/router';
import {filter, startWith, Subscription} from 'rxjs';

@Component({
  selector: 'app-shell',
  templateUrl: './app-shell.component.html'
})
export class AppShellComponent implements OnInit, OnDestroy {
  mobileTitle = 'Analytify';
  showMobileBackButton = false;
  private routeSubscription = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location
  ) {}

  ngOnInit(): void {
    this.routeSubscription = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      startWith(null)
    ).subscribe(() => this.applyRouteLayout());
  }

  ngOnDestroy(): void {
    this.routeSubscription.unsubscribe();
  }

  back(): void {
    this.location.back();
  }

  private applyRouteLayout(): void {
    let active = this.route.firstChild;
    const data: Record<string, unknown> = {};
    while (active) {
      Object.assign(data, active.snapshot.data || {});
      active = active.firstChild;
    }
    this.mobileTitle = typeof data['mobileTitle'] === 'string' ? data['mobileTitle'] : 'Analytify';
    this.showMobileBackButton = data['mobileBack'] === true;
  }
}
