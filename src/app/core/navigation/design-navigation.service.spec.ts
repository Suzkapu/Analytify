import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {DesignNavigationService} from './design-navigation.service';

describe('DesignNavigationService', () => {
  const router = {
    navigate: vi.fn().mockResolvedValue(true),
    createUrlTree: vi.fn().mockReturnValue({tree: true})
  };

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        DesignNavigationService,
        {provide: Router, useValue: router}
      ]
    });
  });

  it('navigates to canonical routes', async () => {
    const service = TestBed.inject(DesignNavigationService);
    await service.navigate('songs', {id: 'playlist-1'}, {queryParams: {page: 2}});
    expect(router.navigate).toHaveBeenCalledWith(
      ['/songs', 'playlist-1'],
      {queryParams: {page: 2}}
    );
  });

  it('uses the default navigation call and preserves a cancelled result', async () => {
    const service = TestBed.inject(DesignNavigationService);
    router.navigate.mockResolvedValueOnce(false);
    expect(await service.navigate('playlists')).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/playlists']);
  });

  it('propagates navigation failures without reporting success', async () => {
    const service = TestBed.inject(DesignNavigationService);
    router.navigate.mockRejectedValueOnce(new Error('Navigation failed'));
    await expect(service.navigate('stats')).rejects.toThrow('Navigation failed');
  });

  it('preserves query parameters when creating a link tree', () => {
    const service = TestBed.inject(DesignNavigationService);
    service.tree('stats', {}, {queryParams: {range: 'short_term'}});
    expect(router.createUrlTree).toHaveBeenCalledWith(
      ['/stats'],
      {queryParams: {range: 'short_term'}}
    );
  });

  it('returns a stable absolute URL for auth return storage', () => {
    const service = TestBed.inject(DesignNavigationService);
    expect(service.url('playlists')).toBe('/playlists');
  });
});
