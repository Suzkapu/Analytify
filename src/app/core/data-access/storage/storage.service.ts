import { Injectable } from '@angular/core';
import { environment } from '@env/environment';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {SessionLifecycleService} from '@core/auth/session-lifecycle.service';

const console = createScopedLogger('Local Storage');

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  /** Primary synchronous read layer – always in sync with IndexedDB */
  private inMemoryCache = new Map<string, string>();
  private readonly databaseVersion = 3;
  private readonly statsUserRangeIndex = 'by_user_range';
  private readonly metadataStore = 'appData';
  private readonly featureStore = 'featureData';
  private readonly localReadConcurrency = 4;

  private dbPromise: Promise<IDBDatabase> | null = null;
  private initPromise: Promise<void> | null = null;
  private cloudWriteQueues = new Map<string, Promise<void>>();

  constructor(
    private supabaseService: SupabaseService,
    private sessionLifecycle: SessionLifecycleService
  ) {}

  // ─── IndexedDB bootstrap ───────────────────────────────────────────────────

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not supported in this environment.'));
        return;
      }

      const request = indexedDB.open('AnalytifyDB', this.databaseVersion);

      request.onupgradeneeded = (event: any) => {
        const db: IDBDatabase = event.target.result;

        const statsStore = db.objectStoreNames.contains('statsHistory')
          ? event.target.transaction.objectStore('statsHistory')
          : db.createObjectStore('statsHistory', { keyPath: 'id', autoIncrement: true });
        if (!statsStore.indexNames.contains(this.statsUserRangeIndex)) {
          statsStore.createIndex(this.statsUserRangeIndex, ['userId', 'range'], {unique: false});
        }
        if (!db.objectStoreNames.contains('appData')) {
          // Generic key-value store – replaces localStorage
          db.createObjectStore('appData', { keyPath: 'key' });
        }
        const featureStore = db.objectStoreNames.contains(this.featureStore)
          ? event.target.transaction.objectStore(this.featureStore)
          : db.createObjectStore(this.featureStore, {keyPath: 'key'});
        const metadataStore = event.target.transaction.objectStore(this.metadataStore);
        const cursorRequest = metadataStore.openCursor();
        cursorRequest.onsuccess = (cursorEvent: any) => {
          const cursor: IDBCursorWithValue | null = cursorEvent.target.result;
          if (!cursor) return;
          const entry = cursor.value as {key: string; value: string};
          if (!this.isBootstrapMetadataKey(entry.key)) {
            featureStore.put(entry);
            cursor.delete();
          }
          cursor.continue();
        };
      };

      request.onsuccess = (event: any) => resolve(event.target.result);
      request.onerror  = (event: any) => reject(event.target.error);
    });

    return this.dbPromise;
  }

  /**
   * Called once at app startup (via APP_INITIALIZER).
   * Loads only the small metadata store. Feature payloads live separately and
   * are hydrated by the route that needs them.
   */
  initFromDB(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.getDB().then(db => new Promise<void>((resolve) => {
      try {
        const tx    = db.transaction(this.metadataStore, 'readonly');
        const store = tx.objectStore(this.metadataStore);
        const req   = store.getAll();

        req.onsuccess = async (event: any) => {
          const entries: { key: string; value: string }[] = event.target.result || [];
          entries.forEach(entry => this.inMemoryCache.set(entry.key, entry.value));
          try {
            await this.migrateDevData(db);
          } catch (err) {
            console.warn('[StorageService] Dev migration error:', err);
          }
          resolve();
        };
        req.onerror = () => resolve(); // graceful degradation
      } catch {
        resolve();
      }
    })).catch(() => {
      // IndexedDB unavailable – app still works, just without cross-session persistence
    });

    return this.initPromise;
  }

  private async migrateDevData(db: IDBDatabase): Promise<void> {
    if (environment.production) {
      return;
    }
    const rawUserId = this.inMemoryCache.get('spotifyUserId');
    const baseUserId = rawUserId ? (rawUserId.endsWith('_dev') ? rawUserId.slice(0, -4) : rawUserId) : null;
    const devUserId = baseUserId ? `${baseUserId}_dev` : null;

    const realSupabaseUserId = this.inMemoryCache.get('supabaseUserId');
    const devSupabaseUserId = realSupabaseUserId && realSupabaseUserId.length >= 36 ? 'de11' + realSupabaseUserId.substring(4) : null;

    // 1. Migrate appData keys
    const appDataKeysToMigrate: { key: string; val: string }[] = [];
    for (const [key, value] of this.inMemoryCache.entries()) {
      // Migrate Spotify user ID keys
      if (baseUserId && devUserId && key.startsWith(`${baseUserId}_`) && !key.startsWith(`${devUserId}_`)) {
        const suffix = key.substring(baseUserId.length + 1);
        const devKey = `${devUserId}_${suffix}`;
        if (!this.inMemoryCache.has(devKey)) {
          appDataKeysToMigrate.push({ key: devKey, val: value });
        }
      }
      // Migrate Supabase user ID keys (like backup_active setting)
      if (realSupabaseUserId && devSupabaseUserId && key.startsWith(`${realSupabaseUserId}_`) && !key.startsWith(`${devSupabaseUserId}_`)) {
        const suffix = key.substring(realSupabaseUserId.length + 1);
        const devKey = `${devSupabaseUserId}_${suffix}`;
        if (!this.inMemoryCache.has(devKey)) {
          appDataKeysToMigrate.push({ key: devKey, val: value });
        }
      }
    }

    if (appDataKeysToMigrate.length > 0) {
      console.log(`[StorageService] Migrating ${appDataKeysToMigrate.length} appData keys for dev environment...`);
      try {
        const tx = db.transaction('appData', 'readwrite');
        const store = tx.objectStore('appData');
        for (const item of appDataKeysToMigrate) {
          this.inMemoryCache.set(item.key, item.val);
          store.put({ key: item.key, value: item.val });
        }
      } catch (err) {
        console.warn('[StorageService] Error migrating appData store:', err);
      }
    }

    // 2. Migrate statsHistory entries
    if (baseUserId && devUserId) {
      try {
        const historyTx = db.transaction('statsHistory', 'readwrite');
        const historyStore = historyTx.objectStore('statsHistory');
        const getReq = historyStore.getAll();
        
        await new Promise<void>((resolve, reject) => {
          getReq.onsuccess = (event: any) => {
            const allEntries = event.target.result || [];
            const devEntries = allEntries.filter((item: any) => item.userId === devUserId);
            const baseEntries = allEntries.filter((item: any) => item.userId === baseUserId);
            
            let migratedCount = 0;
            baseEntries.forEach((baseItem: any) => {
              const exists = devEntries.some((devItem: any) => 
                devItem.timestamp === baseItem.timestamp && devItem.range === baseItem.range
              );
              if (!exists) {
                const copy = { ...baseItem, userId: devUserId };
                delete copy.id; // Let autoIncrement handle the key
                historyStore.add(copy);
                migratedCount++;
              }
            });
            if (migratedCount > 0) {
              console.log(`[StorageService] Migrated ${migratedCount} statsHistory entries for dev environment.`);
            }
            resolve();
          };
          getReq.onerror = (e: any) => reject(e.target.error);
        });
      } catch (err) {
        console.warn('[StorageService] Error migrating statsHistory store:', err);
      }
    }
  }

  // ─── Sync API (reads from in-memory cache) ─────────────────────────────────

  private getEffectiveSupabaseUserId(): string | null {
    const rawId = this.inMemoryCache.get('supabaseUserId') ?? null;
    if (!rawId) return null;
    if (!environment.production && rawId.length >= 36 && !rawId.startsWith('de11')) {
      return 'de11' + rawId.substring(4);
    }
    return rawId;
  }

  getItem(key: string): string | null {
    return this.inMemoryCache.get(key) ?? null;
  }

  /** Hydrate only the local feature keys required by the active route. */
  async hydrateItems(keys: string[]): Promise<number> {
    const uniqueKeys = Array.from(new Set(keys.filter(key => !!key && !this.inMemoryCache.has(key))));
    if (uniqueKeys.length === 0) return 0;
    const db = await this.getDB().catch(() => null);
    if (!db) return 0;
    let loaded = 0;
    for (let offset = 0; offset < uniqueKeys.length; offset += this.localReadConcurrency) {
      const batch = uniqueKeys.slice(offset, offset + this.localReadConcurrency);
      const entries = await Promise.all(batch.map(key => this.readStoredEntry(db, key)));
      entries.forEach(entry => {
        if (!entry || this.inMemoryCache.has(entry.key)) return;
        this.inMemoryCache.set(entry.key, entry.value);
        loaded++;
      });
    }
    return loaded;
  }

  /** Used only after an explicit backup upload request, never during startup. */
  async hydrateAllFeatureData(): Promise<number> {
    const db = await this.getDB().catch(() => null);
    if (!db) return 0;
    return new Promise<number>(resolve => {
      try {
        const request = db.transaction(this.featureStore, 'readonly')
          .objectStore(this.featureStore).getAll();
        request.onsuccess = () => {
          const entries = (request.result || []) as Array<{key: string; value: string}>;
          entries.forEach(entry => this.inMemoryCache.set(entry.key, entry.value));
          resolve(entries.length);
        };
        request.onerror = () => resolve(0);
      } catch {
        resolve(0);
      }
    });
  }

  setItem(key: string, value: string, syncToCloud = true): void {
    this.inMemoryCache.set(key, value);
    this.persistKV(key, value);
    if (key === 'spotifyUserId' || key === 'supabaseUserId') {
      this.getDB().then(db => this.migrateDevData(db)).catch(() => {});
    }

    if (!syncToCloud) {
      return;
    }

    // Proactively sync user cache key to Supabase if backup is enabled
    const supabaseUserId = this.getEffectiveSupabaseUserId();
    const spotifyUserId = this.inMemoryCache.get('spotifyUserId');
    if (supabaseUserId && spotifyUserId) {
      const isBackupActive = this.inMemoryCache.get(`${supabaseUserId}_backup_active`) === 'true';
      if (isBackupActive) {
        if (this.shouldSyncUserCacheKey(key)) {
          this.enqueueCloudWrite(supabaseUserId, key, value);
        }
      }
    }
  }

  removeItem(key: string): void {
    this.inMemoryCache.delete(key);
    this.deleteKV(key);
  }

  getCacheKeys(): string[] {
    return Array.from(this.inMemoryCache.keys());
  }

  shouldSyncUserCacheKey(key: string): boolean {
    const supabaseUserId = this.getEffectiveSupabaseUserId();
    const spotifyUserId = this.inMemoryCache.get('spotifyUserId');
    if (!supabaseUserId || !spotifyUserId) return false;

    const isUserKey = key.startsWith(`${spotifyUserId}_`) || key.startsWith(`${supabaseUserId}_`);
    if (!isUserKey) return false;

    const isCloudControlKey =
      key === `${supabaseUserId}_backup_active` ||
      key === `${supabaseUserId}_last_synced_at`;
    const hasNormalizedPersistence =
      key === `${spotifyUserId}_recently_played` ||
      key === `${spotifyUserId}_profile_pic` ||
      key.startsWith(`${spotifyUserId}_stats_`);

    return !isCloudControlKey && !hasNormalizedPersistence;
  }

  /**
   * Restores a feature-specific set of cache entries from Supabase.
   * Callers invoke this only after the local dataset is missing, corrupt, or
   * expired, preserving the source priority: local -> Supabase -> Spotify.
   */
  async restoreItemsFromCloud(
    keys: string[],
    canApply: () => boolean = () => true,
    beforeApply: () => void = () => {}
  ): Promise<number> {
    const generation = this.sessionLifecycle.capture();
    const uniqueKeys = Array.from(new Set(keys.filter(key => !!key)));
    if (uniqueKeys.length === 0) return 0;

    const supabaseUserId = this.getEffectiveSupabaseUserId();
    if (!supabaseUserId) return 0;

    const backupActive = this.inMemoryCache.get(`${supabaseUserId}_backup_active`) === 'true';
    if (!backupActive) return 0;

    try {
      const entries = await this.sessionLifecycle.track(
        this.supabaseService.loadUserCache(supabaseUserId, uniqueKeys),
        generation
      );
      // A feature may have moved on to a newer route selection or started a
      // Spotify fallback while this request was in flight. Never let that late
      // cloud response overwrite the newer source.
      if (!this.sessionLifecycle.isCurrent(generation) || !canApply()) return 0;
      if (entries.length > 0) beforeApply();
      entries.forEach(entry => this.setItem(entry.key, entry.value, false));
      if (entries.length > 0) {
        console.log(`[StorageService] Restored ${entries.length} requested cache keys from Supabase.`);
      }
      return entries.length;
    } catch (e) {
      console.info('[StorageService] No cache found in cloud:', e);
      return 0;
    }
  }

  /** Clears ALL app data (appData + statsHistory) and the in-memory cache. */
  clear(): Promise<void> {
    this.inMemoryCache.clear();
    return Promise.all([
      this.clearKV(),
      this.clearAllHistory()
    ]).then(() => {});
  }

  // ─── IndexedDB appData helpers (fire-and-forget async) ───────────────────

  private persistKV(key: string, value: string): void {
    const generation = this.sessionLifecycle.capture();
    const write = this.getDB().then(db => new Promise<void>(resolve => {
      if (!this.sessionLifecycle.isCurrent(generation)) {
        resolve();
        return;
      }
      const targetStore = this.isBootstrapMetadataKey(key) ? this.metadataStore : this.featureStore;
      const otherStore = targetStore === this.metadataStore ? this.featureStore : this.metadataStore;
      const tx    = db.transaction([targetStore, otherStore], 'readwrite');
      const finish = () => {
        generation.signal.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => {
        try { tx.abort(); } catch {}
      };
      generation.signal.addEventListener('abort', abort, {once: true});
      tx.oncomplete = finish;
      tx.onabort = finish;
      tx.onerror = finish;
      const store = tx.objectStore(targetStore);
      const req   = store.put({ key, value });
      tx.objectStore(otherStore).delete(key);
      req.onerror = (e: any) => console.warn('[StorageService] IndexedDB put request failed:', e.target.error);
    })).catch(err => console.warn('[StorageService] IndexedDB write failed:', err));
    this.sessionLifecycle.track(write, generation);
  }

  private deleteKV(key: string): void {
    const generation = this.sessionLifecycle.capture();
    const removal = this.getDB().then(db => new Promise<void>(resolve => {
      if (!this.sessionLifecycle.isCurrent(generation)) {
        resolve();
        return;
      }
      const tx    = db.transaction([this.metadataStore, this.featureStore], 'readwrite');
      const finish = () => {
        generation.signal.removeEventListener('abort', abort);
        resolve();
      };
      const abort = () => {
        try { tx.abort(); } catch {}
      };
      generation.signal.addEventListener('abort', abort, {once: true});
      tx.oncomplete = finish;
      tx.onabort = finish;
      tx.onerror = finish;
      const store = tx.objectStore(this.metadataStore);
      const req   = store.delete(key);
      tx.objectStore(this.featureStore).delete(key);
      req.onerror = (e: any) => console.warn('[StorageService] IndexedDB delete request failed:', e.target.error);
    })).catch(err => console.warn('[StorageService] IndexedDB delete failed:', err));
    this.sessionLifecycle.track(removal, generation);
  }

  private clearKV(): Promise<void> {
    return this.getDB().then(db => new Promise<void>((resolve, reject) => {
      const tx = db.transaction([this.metadataStore, this.featureStore], 'readwrite');
      tx.objectStore(this.metadataStore).clear();
      tx.objectStore(this.featureStore).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (e: any) => {
        console.warn('[StorageService] IndexedDB clear request failed:', e.target.error);
        reject(e.target.error);
      };
    })).catch(err => {
      console.warn('[StorageService] IndexedDB clearKV failed:', err);
    });
  }

  private isBootstrapMetadataKey(key: string): boolean {
    const exactKeys = new Set([
      'spotifyAccessToken', 'spotifyRefreshToken', 'spotifyTokenExpiresAt',
      'spotifyUserId', 'supabaseUserId', 'spotifyConnectionMode',
      'personalSpotifyClientId', 'anonymousCloudIdentity', 'collaborationIdentityReady', 'cloudIdentityReady',
      'analytify_personal_spotify_auth_request', 'analytify_compare_auth_request',
      'analytifyAuthReturnUrl', 'spotify_rate_limit_until', 'spotifyRetryAfter'
    ]);
    return exactKeys.has(key)
      || /_(backup_active|last_synced_at|sortOrder|showSaved|profile_pic|profile_pic_metadata|display_name|spotify_profile_id|spotify_profile_id_verified|lastUpdated|lastChecked|Amount|Name|CachedTrackCount|source_manifest|source_sync_state|backup_upload_manifest|applied_metadata)$/.test(key);
  }

  private async readStoredEntry(
    db: IDBDatabase,
    key: string
  ): Promise<{key: string; value: string} | null> {
    const read = (storeName: string) => new Promise<{key: string; value: string} | null>(resolve => {
      try {
        const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    return (await read(this.featureStore)) || await read(this.metadataStore);
  }

  // ─── Stats history (IndexedDB statsHistory store) ─────────────────────────

  saveStatsHistory(historyEntry: any): Promise<void> {
    const generation = this.sessionLifecycle.capture();
    const write = this.getDB().then(db => {
      if (!this.sessionLifecycle.isCurrent(generation)) return;
      return new Promise<void>((resolve, reject) => {
        const tx      = db.transaction('statsHistory', 'readwrite');
        const abort = () => {
          try { tx.abort(); } catch {}
        };
        generation.signal.addEventListener('abort', abort, {once: true});
        const store   = tx.objectStore('statsHistory');
        const request = store.put(historyEntry);
        request.onsuccess = () => {
          generation.signal.removeEventListener('abort', abort);
          resolve();
        };
        request.onerror   = (e: any) => {
          generation.signal.removeEventListener('abort', abort);
          reject(e.target.error);
        };
      });
    }).catch(err => {
      if (generation.signal.aborted) return;
      console.warn('IndexedDB failed to write stats history:', err);
      throw err;
    });
    return this.sessionLifecycle.track(write, generation);
  }

  private enqueueCloudWrite(supabaseUserId: string, key: string, value: string): void {
    const generation = this.sessionLifecycle.capture();
    const queueKey = `${supabaseUserId}:${key}`;
    const previousWrite = this.cloudWriteQueues.get(queueKey) || Promise.resolve();
    const nextWrite = previousWrite
      .catch(() => {
        // A failed older write must not block the newest value.
      })
      .then(() => {
        if (!this.sessionLifecycle.isCurrent(generation)) return;
        return this.supabaseService.saveUserCache(supabaseUserId, key, value);
      })
      .catch(err => {
        console.warn('[StorageService] Failed to sync cache key to Supabase:', key, err);
      })
      .finally(() => {
        if (this.cloudWriteQueues.get(queueKey) === nextWrite) {
          this.cloudWriteQueues.delete(queueKey);
        }
      });

    this.cloudWriteQueues.set(queueKey, nextWrite);
    this.sessionLifecycle.track(nextWrite, generation);
  }

  getStatsHistory(userId: string, range: string): Promise<any[]> {
    return this.getDB().then(db => new Promise<any[]>((resolve, reject) => {
      const tx      = db.transaction('statsHistory', 'readonly');
      const store   = tx.objectStore('statsHistory');
      const hasIndex = store.indexNames.contains(this.statsUserRangeIndex);
      const request = hasIndex
        ? store.index(this.statsUserRangeIndex).getAll(IDBKeyRange.only([userId, range]))
        : store.getAll();

      request.onsuccess = (event: any) => {
        const all      = event.target.result || [];
        const filtered = hasIndex
          ? all
          : all.filter((item: any) => item.userId === userId && item.range === range);
        filtered.sort((a: any, b: any) => a.timestamp - b.timestamp);
        resolve(filtered);
      };
      request.onerror = (e: any) => reject(e.target.error);
    })).catch(err => {
      console.warn('IndexedDB failed to read stats history, returning empty:', err);
      return [];
    });
  }

  deleteStatsHistoryEntries(ids: IDBValidKey[]): Promise<void> {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return Promise.resolve();

    return this.getDB().then(db => new Promise<void>((resolve, reject) => {
      const tx = db.transaction('statsHistory', 'readwrite');
      const store = tx.objectStore('statsHistory');
      uniqueIds.forEach(id => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = (event: any) => reject(event.target.error);
      tx.onabort = (event: any) => reject(event.target.error);
    })).catch(err => {
      console.warn('IndexedDB failed to delete duplicate stats history entries:', err);
    });
  }

  clearStatsHistory(userId: string): Promise<void> {
    return this.getDB().then(db => new Promise<void>((resolve, reject) => {
      const tx      = db.transaction('statsHistory', 'readwrite');
      const store   = tx.objectStore('statsHistory');
      const request = store.openCursor();

      request.onsuccess = (event: any) => {
        const cursor = event.target.result;
        if (cursor) {
          if (cursor.value.userId === userId) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = (e: any) => reject(e.target.error);
    })).catch(err => {
      console.warn('IndexedDB clear stats history failed:', err);
    });
  }

  clearAllHistory(): Promise<void> {
    return this.getDB().then(db => new Promise<void>((resolve, reject) => {
      const tx      = db.transaction('statsHistory', 'readwrite');
      const store   = tx.objectStore('statsHistory');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror   = (e: any) => reject(e.target.error);
    })).catch(err => {
      console.warn('IndexedDB clearAllHistory failed:', err);
    });
  }
}
