import {TestBed} from '@angular/core/testing';
import {Router} from '@angular/router';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {DESIGN_VARIANT} from './design-navigation';
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
        {provide: DESIGN_VARIANT, useValue: 'new'},
        {provide: Router, useValue: router}
      ]
    });
  });

  it('keeps navigation inside the injected design variant', async () => {
    const service = TestBed.inject(DesignNavigationService);
    await service.navigate('songs', {id: 'playlist-1'}, {queryParams: {page: 2}});
    expect(router.navigate).toHaveBeenCalledWith(
      ['/new', 'songs', 'playlist-1'],
      {queryParams: {page: 2}}
    );
  });

  it('preserves query parameters when creating a link tree', () => {
    const service = TestBed.inject(DesignNavigationService);
    service.tree('stats', {}, {queryParams: {range: 'short_term'}});
    expect(router.createUrlTree).toHaveBeenCalledWith(
      ['/new', 'stats'],
      {queryParams: {range: 'short_term'}}
    );
  });

  it('returns a stable absolute URL for auth return storage', () => {
    const service = TestBed.inject(DesignNavigationService);
    expect(service.url('playlists')).toBe('/new/playlists');
  });
});
