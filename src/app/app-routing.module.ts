import {inject, NgModule} from '@angular/core';
import {ExtraOptions, RedirectFunction, Router, RouterModule, Routes, UrlMatcher} from '@angular/router';
import {DesignSelectivePreloadingStrategy} from '@core/navigation/design-selective-preloading.strategy';

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
  {
    path: '',
    loadChildren: () => import('./design-v2-routing.module')
      .then(module => module.DesignV2RoutingModule)
  }
];

export const ROUTER_OPTIONS: ExtraOptions = {
  preloadingStrategy: DesignSelectivePreloadingStrategy,
  scrollPositionRestoration: 'enabled',
  anchorScrolling: 'enabled',
  scrollOffset: [0, 96],
  enableViewTransitions: true
};

@NgModule({
  imports: [RouterModule.forRoot(APP_ROUTES, ROUTER_OPTIONS)],
  exports: [RouterModule]
})
export class AppRoutingModule {}
