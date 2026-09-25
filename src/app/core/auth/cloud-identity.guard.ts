import {inject} from '@angular/core';
import {ActivatedRouteSnapshot, Router, RouterStateSnapshot} from '@angular/router';
import {SpotifyAuthService} from './spotify-auth.service';
import {DESIGN_VARIANT, designCommands, DesignVariant} from '@core/navigation/design-variant';

export const cloudIdentityGuard = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const auth = inject(SpotifyAuthService);
  if (!auth.isPersonalAppConnection() || auth.hasCloudIdentity()) return true;
  const router = inject(Router);
  const designVariant = inject<DesignVariant>(DESIGN_VARIANT);
  return router.createUrlTree(designCommands(designVariant, 'spotify', 'cloud-access'), {
    queryParams: {
      returnUrl: state.url,
      backup: route.data['cloudBackup'] ? '1' : '0'
    }
  });
};
