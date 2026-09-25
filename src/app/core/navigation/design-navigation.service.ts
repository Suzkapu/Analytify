import {Inject, Injectable} from '@angular/core';
import {NavigationExtras, Router, UrlTree} from '@angular/router';
import {
  DESIGN_VARIANT,
  DesignVariant,
  LogicalRouteId,
  LogicalRouteParameters,
  resolveDesignRoute
} from './design-navigation';

@Injectable({providedIn: 'root'})
export class DesignNavigationService {
  constructor(
    private readonly router: Router,
    @Inject(DESIGN_VARIANT) readonly variant: DesignVariant
  ) {}

  commands(destination: LogicalRouteId, parameters: LogicalRouteParameters = {}): string[] {
    return resolveDesignRoute(this.variant, destination, parameters);
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
