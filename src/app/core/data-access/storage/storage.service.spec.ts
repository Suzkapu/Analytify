import {StorageService} from './storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';

describe('StorageService', () => {
  let supabase: jasmine.SpyObj<SupabaseService>;
  let service: StorageService;
  let cache: Map<string, string>;

  beforeEach(() => {
    supabase = jasmine.createSpyObj<SupabaseService>('SupabaseService', [
      'loadUserCache',
      'saveUserCache'
    ]);
    supabase.loadUserCache.and.resolveTo([]);
    supabase.saveUserCache.and.resolveTo();

    service = new StorageService(supabase);
    cache = (service as any).inMemoryCache;
    spyOn<any>(service, 'persistKV').and.stub();
    spyOn<any>(service, 'deleteKV').and.stub();

    cache.set('spotifyUserId', 'spotify-user');
    cache.set('supabaseUserId', 'supabase-user');
    cache.set('supabase-user_backup_active', 'true');
  });

  it('syncs playlist cache keys but excludes cloud controls and normalized datasets', () => {
    expect(service.shouldSyncUserCacheKey('spotify-user_playlist-1')).toBeTrue();
    expect(service.shouldSyncUserCacheKey('supabase-user_setting')).toBeTrue();

    expect(service.shouldSyncUserCacheKey('supabase-user_backup_active')).toBeFalse();
    expect(service.shouldSyncUserCacheKey('supabase-user_last_synced_at')).toBeFalse();
    expect(service.shouldSyncUserCacheKey('spotify-user_recently_played')).toBeFalse();
    expect(service.shouldSyncUserCacheKey('spotify-user_profile_pic')).toBeFalse();
    expect(service.shouldSyncUserCacheKey('spotify-user_stats_short_term')).toBeFalse();
    expect(service.shouldSyncUserCacheKey('another-user_playlist-1')).toBeFalse();
  });

  it('restores only unique requested keys and keeps restored values local', async () => {
    supabase.loadUserCache.and.resolveTo([
      { key: 'spotify-user_playlist-1', value: '[1,2,3]' }
    ] as any);

    const restored = await service.restoreItemsFromCloud([
      'spotify-user_playlist-1',
      'spotify-user_playlist-1',
      ''
    ]);

    expect(supabase.loadUserCache).toHaveBeenCalledWith(
      'supabase-user',
      ['spotify-user_playlist-1']
    );
    expect(service.getItem('spotify-user_playlist-1')).toBe('[1,2,3]');
    expect(supabase.saveUserCache).not.toHaveBeenCalled();
    expect(restored).toBe(1);
  });

  it('does not contact Supabase when backup is disabled', async () => {
    cache.set('supabase-user_backup_active', 'false');

    expect(await service.restoreItemsFromCloud(['spotify-user_playlist-1'])).toBe(0);
    expect(supabase.loadUserCache).not.toHaveBeenCalled();
  });

  it('updates and removes values synchronously', () => {
    service.setItem('local-key', 'value', false);
    expect(service.getItem('local-key')).toBe('value');
    expect(service.getCacheKeys()).toContain('local-key');

    service.removeItem('local-key');
    expect(service.getItem('local-key')).toBeNull();
  });
});
