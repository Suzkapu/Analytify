import {inject} from '@angular/core';
import {Router} from '@angular/router';

import {AdminService} from './admin.service';

export const adminGuard = async () => {
  const admin = inject(AdminService);
  const router = inject(Router);
  return await admin.isAdmin(true) ? true : router.createUrlTree(['/playlists']);
};
