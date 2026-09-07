import { beforeEach, describe, expect, it, type MockedObject, vi } from "vitest";
import { StorageService } from './storage.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import { SessionLifecycleService } from '@core/auth/session-lifecycle.service';

describe('StorageService', () => {
    let supabase: any;
    let service: StorageService;
    let cache: Map<string, string>;
    let lifecycle: SessionLifecycleService;

    beforeEach(() => {
        supabase = {
            loadUserCache: vi.fn().mockName("SupabaseService.loadUserCache"),
            saveUserCache: vi.fn().mockName("SupabaseService.saveUserCache")
        };
        supabase.loadUserCache.mockResolvedValue([]);
        supabase.saveUserCache.mockResolvedValue(undefined);

        lifecycle = new SessionLifecycleService();
        service = new StorageService(supabase, lifecycle);
        cache = (service as any).inMemoryCache;
        vi.spyOn(service as any, 'persistKV').mockImplementation(() => {
        });
        vi.spyOn(service as any, 'deleteKV').mockImplementation(() => {
        });

        cache.set('spotifyUserId', 'spotify-user');
        cache.set('supabaseUserId', 'supabase-user');
        cache.set('supabase-user_backup_active', 'true');
    });

    it('syncs playlist cache keys but excludes cloud controls and normalized datasets', () => {
        expect(service.shouldSyncUserCacheKey('spotify-user_playlist-1')).toBe(true);
        expect(service.shouldSyncUserCacheKey('supabase-user_setting')).toBe(true);

        expect(service.shouldSyncUserCacheKey('supabase-user_backup_active')).toBe(false);
        expect(service.shouldSyncUserCacheKey('supabase-user_last_synced_at')).toBe(false);
        expect(service.shouldSyncUserCacheKey('spotify-user_recently_played')).toBe(false);
        expect(service.shouldSyncUserCacheKey('spotify-user_profile_pic')).toBe(false);
        expect((service as any).isBootstrapMetadataKey('spotify-user_profile_pic_metadata')).toBe(true);
        expect(service.shouldSyncUserCacheKey('spotify-user_stats_short_term')).toBe(false);
        expect(service.shouldSyncUserCacheKey('another-user_playlist-1')).toBe(false);
    });

    it('restores only unique requested keys and keeps restored values local', async () => {
        supabase.loadUserCache.mockResolvedValue([
            { key: 'spotify-user_playlist-1', value: '[1,2,3]' }
        ] as any);

        const restored = await service.restoreItemsFromCloud([
            'spotify-user_playlist-1',
            'spotify-user_playlist-1',
            ''
        ]);

        expect(supabase.loadUserCache).toHaveBeenCalledWith('supabase-user', ['spotify-user_playlist-1']);
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
        supabase.loadUserCache.mockResolvedValue([
            { key: 'spotify-user_playlist-1', value: 'stale-cloud-value' }
        ] as any);

        const beforeApply = vi.fn().mockName('beforeApply');
        const restored = await service.restoreItemsFromCloud(['spotify-user_playlist-1'], () => false, beforeApply);

        expect(restored).toBe(0);
        expect(beforeApply).not.toHaveBeenCalled();
        expect(service.getItem('spotify-user_playlist-1')).toBeNull();
    });

    it('handles cloud cache load failures gracefully without throwing', async () => {
        supabase.loadUserCache.mockRejectedValue(new Error('504 Gateway Timeout'));

        const restored = await service.restoreItemsFromCloud(['spotify-user_playlist-1']);

        expect(restored).toBe(0);
        expect(service.getItem('spotify-user_playlist-1')).toBeNull();
    });

    it('ignores deferred account A cloud data after logout starts account B', async () => {
        let resolveLoad!: (entries: any[]) => void;
        supabase.loadUserCache.mockReturnValue(new Promise(resolve => resolveLoad = resolve));
        const restoreA = service.restoreItemsFromCloud(['spotify-user_playlist-1']);
        const logoutA = lifecycle.invalidateAndDrain();
        cache.set('spotifyUserId', 'spotify-user-b');
        cache.set('supabaseUserId', 'supabase-user-b');
        resolveLoad([{ key: 'spotify-user_playlist-1', value: 'account-a' }]);

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
        const transaction = vi.fn().mockName('transaction').mockImplementation((storeName: string) => ({
            objectStore: () => ({
                getAll: () => {
                    queueMicrotask(() => request.onsuccess?.({
                        target: { result: [{ key: 'spotifyAccessToken', value: 'token' }] }
                    }));
                    return request;
                }
            })
        }));
        vi.spyOn(bootstrapService as any, 'getDB').mockResolvedValue({ transaction } as any);

        await bootstrapService.initFromDB();

        expect(transaction).toHaveBeenCalledTimes(1);

        expect(transaction).toHaveBeenCalledWith('appData', 'readonly');
        expect(transaction).not.toHaveBeenCalledWith('featureData', expect.anything());
        expect(bootstrapService.getItem('spotifyAccessToken')).toBe('token');
        expect(bootstrapService.getItem('spotify-user_playlist-with-10000-tracks')).toBeNull();
    });

    it('hydrates only requested feature keys from IndexedDB', async () => {
        const localService = new StorageService(supabase, lifecycle);
        const requested: Array<{
            store: string;
            key: string;
        }> = [];
        const values = new Map([['spotify-user_playlist-1', '[{"id":"track"}]']]);
        const database = {
            transaction: (store: string) => ({
                objectStore: () => ({
                    get: (key: string) => {
                        requested.push({ store, key });
                        const request: any = {};
                        queueMicrotask(() => {
                            request.result = store === 'featureData' && values.has(key)
                                ? { key, value: values.get(key) }
                                : undefined;
                            request.onsuccess?.();
                        });
                        return request;
                    }
                })
            })
        };
        vi.spyOn(localService as any, 'getDB').mockResolvedValue(database as any);

        expect(await localService.hydrateItems(['spotify-user_playlist-1'])).toBe(1);

        expect(localService.getItem('spotify-user_playlist-1')).toBe('[{"id":"track"}]');
        expect(requested).toEqual([{ store: 'featureData', key: 'spotify-user_playlist-1' }]);
    });

    it('classifies auth metadata separately from route-owned feature payloads', () => {
        expect((service as any).isBootstrapMetadataKey('spotifyRefreshToken')).toBe(true);
        expect((service as any).isBootstrapMetadataKey('cloud-user_backup_active')).toBe(true);
        expect((service as any).isBootstrapMetadataKey('spotify-user_playlists')).toBe(false);
        expect((service as any).isBootstrapMetadataKey('spotify-user_playlist-id')).toBe(false);
    });
});
