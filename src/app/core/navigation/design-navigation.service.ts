import {Injectable} from '@angular/core';
import {NavigationExtras, Router, UrlTree} from '@angular/router';
import {
  LogicalRouteId,
  LogicalRouteParameters,
  resolveDesignRoute
} from './design-navigation';

@Injectable({providedIn: 'root'})
export class DesignNavigationService {
  readonly variant = 'legacy';
  constructor(
    private readonly router: Router
  ) {}

  commands(destination: LogicalRouteId, parameters: LogicalRouteParameters = {}): string[] {
    return resolveDesignRoute(destination, parameters);
  }

  url(destination: LogicalRouteId, parameters: LogicalRouteParameters = {}): string {
    return this.commands(destination, parameters).join('/');
  }

  tree(
    destination: LogicalRouteId,
    parameters: LogicalRouteParameters = {},
    extras: NavigationExtras = {}
  ): UrlTree {
    return this.router.createUrlTree(this.commands(destination, parameters), extras);
  }

  navigate(
    destination: LogicalRouteId,
    parameters: LogicalRouteParameters = {},
    extras: NavigationExtras = {}
  ): Promise<boolean> {
    const commands = this.commands(destination, parameters);
    return Object.keys(extras).length > 0
      ? this.router.navigate(commands, extras)
      : this.router.navigate(commands);
  }
}
