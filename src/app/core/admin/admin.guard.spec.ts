import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';

import {AdminService} from './admin.service';
import {adminGuard} from './admin.guard';

describe('adminGuard', () => {
  let admin: jasmine.SpyObj<AdminService>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(() => {
    admin = jasmine.createSpyObj<AdminService>('AdminService', ['isAdmin']);
    router = jasmine.createSpyObj<Router>('Router', ['createUrlTree']);
    router.createUrlTree.and.returnValue({redirect: '/playlists'} as any);
    TestBed.configureTestingModule({providers: [
      {provide: AdminService, useValue: admin},
      {provide: Router, useValue: router}
    ]});
  });

  it('allows an administrator', async () => {
    admin.isAdmin.and.resolveTo(true);
    const result = await TestBed.runInInjectionContext(() => adminGuard());
    expect(result).toBeTrue();
    expect(admin.isAdmin).toHaveBeenCalledWith(true);
  });

  it('redirects every other account', async () => {
    admin.isAdmin.and.resolveTo(false);
    const result = await TestBed.runInInjectionContext(() => adminGuard());
    expect(result).toEqual({redirect: '/playlists'} as any);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/playlists']);
  });
});
