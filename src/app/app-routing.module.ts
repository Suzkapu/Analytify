import {inject, NgModule, provideEnvironmentInitializer} from '@angular/core';
import {ViewportScroller} from '@angular/common';
import {ExtraOptions, provideRouter, RedirectFunction, Router, RouterModule, Routes, UrlMatcher, withInMemoryScrolling, withPreloading, withViewTransitions} from '@angular/router';
import {DesignSelectivePreloadingStrategy} from '@core/navigation/design-selective-preloading.strategy';
import {DESIGN_V2_ROUTES} from './design-v2-routing.module';

export const NEW_COMPATIBILITY_MATCHER: UrlMatcher = segments =>
  segments[0]?.path === 'new' ? {consumed: segments} : null;

export const redirectLegacyDesignV2Url: RedirectFunction = ({url, queryParams, fragment}) =>
  inject(Router).createUrlTree(['/', ...url.slice(1).map(segment => segment.path)], {
    queryParams,
    fragment: fragment ?? undefined
  });

export const APP_ROUTES: Routes = [
  {
    matcher: NEW_COMPATIBILITY_MATCHER,
    redirectTo: redirectLegacyDesignV2Url
  },
  ...DESIGN_V2_ROUTES
];

export const ROUTER_OPTIONS: ExtraOptions = {
  preloadingStrategy: DesignSelectivePreloadingStrategy,
  scrollPositionRestoration: 'enabled',
  anchorScrolling: 'enabled',
  scrollOffset: [0, 96]
};
export const ROUTER_VIEW_TRANSITION_OPTIONS = {skipInitialTransition: true};

@NgModule({
  imports: [RouterModule],
  exports: [RouterModule],
  providers: [
    provideRouter(APP_ROUTES,
      withPreloading(DesignSelectivePreloadingStrategy),
      withInMemoryScrolling({scrollPositionRestoration: ROUTER_OPTIONS.scrollPositionRestoration, anchorScrolling: ROUTER_OPTIONS.anchorScrolling}),
      withViewTransitions(ROUTER_VIEW_TRANSITION_OPTIONS)),
    provideEnvironmentInitializer(() => inject(ViewportScroller).setOffset(ROUTER_OPTIONS.scrollOffset!))
  ]
})
export class AppRoutingModule {}
