import {inject} from '@angular/core';
import {ActivatedRouteSnapshot, RouterStateSnapshot} from '@angular/router';
import {SpotifyAuthService} from './spotify-auth.service';
import {DesignNavigationService} from '@core/navigation/design-navigation.service';

export const cloudIdentityGuard = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot) => {
  const auth = inject(SpotifyAuthService);
  if (!auth.isPersonalAppConnection() || auth.hasCloudIdentity()) return true;
  const navigation = inject(DesignNavigationService);
  return navigation.tree('spotifyCloudAccess', {}, {
    queryParams: {
      returnUrl: state.url,
      backup: route.data['cloudBackup'] ? '1' : '0'
    }
  });
};
