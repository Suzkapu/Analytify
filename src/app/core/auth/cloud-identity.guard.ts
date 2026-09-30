import {inject} from '@angular/core';
import {ActivatedRouteSnapshot, Router, RouterStateSnapshot} from '@angular/router';
import {SpotifyAuthService} from './spotify-auth.service';
import {designCommands} from '@core/navigation/design-path';

export const cloudIdentityGuard = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const auth = inject(SpotifyAuthService);
  if (!auth.isPersonalAppConnection() || auth.hasCloudIdentity()) return true;
  const router = inject(Router);
  return router.createUrlTree(designCommands('spotify', 'cloud-access'), {
    queryParams: {
      returnUrl: state.url,
      backup: route.data['cloudBackup'] ? '1' : '0'
    }
  });
};
