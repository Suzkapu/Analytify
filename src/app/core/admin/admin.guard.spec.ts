import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AdminService } from './admin.service';
import { adminGuard } from './admin.guard';

describe('adminGuard', () => {
    let admin: any;
    let router: any;

    beforeEach(() => {
        admin = {
            isAdmin: vi.fn().mockName("AdminService.isAdmin")
        };
        router = {
            createUrlTree: vi.fn().mockName("Router.createUrlTree")
        };
        router.createUrlTree.mockReturnValue({ redirect: '/playlists' } as any);
        TestBed.configureTestingModule({ providers: [
                { provide: AdminService, useValue: admin },
                { provide: Router, useValue: router }
            ] });
    });

    it('allows an administrator', async () => {
        admin.isAdmin.mockResolvedValue(true);
        const result = await TestBed.runInInjectionContext(() => adminGuard());
        expect(result).toBe(true);
        expect(admin.isAdmin).toHaveBeenCalledWith(true);
    });

    it('redirects every other account', async () => {
        admin.isAdmin.mockResolvedValue(false);
        const result = await TestBed.runInInjectionContext(() => adminGuard());
        expect(result).toEqual({ redirect: '/playlists' } as any);
        expect(router.createUrlTree).toHaveBeenCalledWith(['/playlists']);
    });
});
