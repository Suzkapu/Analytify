import {StorageService} from './storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';

describe('StorageService', () => {
  let supabase: jasmine.SpyObj<SupabaseService>;
  let service: StorageService;
  let cache: Map<string, string>;
  let lifecycle: SessionLifecycleService;

  beforeEach(() => {
    supabase = jasmine.createSpyObj<SupabaseService>('SupabaseService', [
      'loadUserCache',
      'saveUserCache'
    ]);
    supabase.loadUserCache.and.resolveTo([]);
    supabase.saveUserCache.and.resolveTo();

    lifecycle = new SessionLifecycleService();
    service = new StorageService(supabase, lifecycle);
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
    expect((service as any).isBootstrapMetadataKey('spotify-user_profile_pic_metadata')).toBeTrue();
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

  it('does not apply a late cloud response after a newer source takes over', async () => {
    supabase.loadUserCache.and.resolveTo([
      {key: 'spotify-user_playlist-1', value: 'stale-cloud-value'}
    ] as any);

    const beforeApply = jasmine.createSpy('beforeApply');
    const restored = await service.restoreItemsFromCloud(
      ['spotify-user_playlist-1'],
      () => false,
      beforeApply
    );

    expect(restored).toBe(0);
    expect(beforeApply).not.toHaveBeenCalled();
    expect(service.getItem('spotify-user_playlist-1')).toBeNull();
  });

  it('handles cloud cache load failures gracefully without throwing', async () => {
    supabase.loadUserCache.and.rejectWith(new Error('504 Gateway Timeout'));

    const restored = await service.restoreItemsFromCloud(['spotify-user_playlist-1']);

    expect(restored).toBe(0);
    expect(service.getItem('spotify-user_playlist-1')).toBeNull();
  });

  it('ignores deferred account A cloud data after logout starts account B', async () => {
    let resolveLoad!: (entries: any[]) => void;
    supabase.loadUserCache.and.returnValue(new Promise(resolve => resolveLoad = resolve));
    const restoreA = service.restoreItemsFromCloud(['spotify-user_playlist-1']);
    const logoutA = lifecycle.invalidateAndDrain();
    cache.set('spotifyUserId', 'spotify-user-b');
    cache.set('supabaseUserId', 'supabase-user-b');
    resolveLoad([{key: 'spotify-user_playlist-1', value: 'account-a'}]);

    expect(await restoreA).toBe(0);
    await logoutA;
    expect(service.getItem('spotify-user_playlist-1')).toBeNull();
  });

  it('updates and removes values synchronously', () => {
    service.setItem('local-key', 'value', false);
    expect(service.getItem('local-key')).toBe('value');
    expect(service.getCacheKeys()).toContain('local-key');

    service.removeItem('local-key');
    expect(service.getItem('local-key')).toBeNull();
  });

  it('bootstraps metadata without enumerating the feature payload store', async () => {
    const bootstrapService = new StorageService(supabase, lifecycle);
    const request: any = {};
    const transaction = jasmine.createSpy('transaction').and.callFake((storeName: string) => ({
      objectStore: () => ({
        getAll: () => {
          queueMicrotask(() => request.onsuccess?.({
            target: {result: [{key: 'spotifyAccessToken', value: 'token'}]}
          }));
          return request;
        }
      })
    }));
    spyOn<any>(bootstrapService, 'getDB').and.resolveTo({transaction} as any);

    await bootstrapService.initFromDB();

    expect(transaction).toHaveBeenCalledOnceWith('appData', 'readonly');
    expect(transaction).not.toHaveBeenCalledWith('featureData', jasmine.anything());
    expect(bootstrapService.getItem('spotifyAccessToken')).toBe('token');
    expect(bootstrapService.getItem('spotify-user_playlist-with-10000-tracks')).toBeNull();
  });

  it('hydrates only requested feature keys from IndexedDB', async () => {
    const localService = new StorageService(supabase, lifecycle);
    const requested: Array<{store: string; key: string}> = [];
    const values = new Map([['spotify-user_playlist-1', '[{"id":"track"}]']]);
    const database = {
      transaction: (store: string) => ({
        objectStore: () => ({
          get: (key: string) => {
            requested.push({store, key});
            const request: any = {};
            queueMicrotask(() => {
              request.result = store === 'featureData' && values.has(key)
                ? {key, value: values.get(key)}
                : undefined;
              request.onsuccess?.();
            });
            return request;
          }
        })
      })
    };
    spyOn<any>(localService, 'getDB').and.resolveTo(database as any);

    expect(await localService.hydrateItems(['spotify-user_playlist-1'])).toBe(1);

    expect(localService.getItem('spotify-user_playlist-1')).toBe('[{"id":"track"}]');
    expect(requested).toEqual([{store: 'featureData', key: 'spotify-user_playlist-1'}]);
  });

  it('classifies auth metadata separately from route-owned feature payloads', () => {
    expect((service as any).isBootstrapMetadataKey('spotifyRefreshToken')).toBeTrue();
    expect((service as any).isBootstrapMetadataKey('cloud-user_backup_active')).toBeTrue();
    expect((service as any).isBootstrapMetadataKey('spotify-user_playlists')).toBeFalse();
    expect((service as any).isBootstrapMetadataKey('spotify-user_playlist-id')).toBeFalse();
  });
});
