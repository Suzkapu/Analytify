import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  /** Primary synchronous read layer – always in sync with IndexedDB */
  private inMemoryCache = new Map<string, string>();

  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private supabaseService: SupabaseService) {}

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

      // Version 2: adds the generic 'appData' key-value store
      const request = indexedDB.open('AnalytifyDB', 2);

      request.onupgradeneeded = (event: any) => {
        const db: IDBDatabase = event.target.result;

        if (!db.objectStoreNames.contains('statsHistory')) {
          db.createObjectStore('statsHistory', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('appData')) {
          // Generic key-value store – replaces localStorage
          db.createObjectStore('appData', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event: any) => resolve(event.target.result);
      request.onerror  = (event: any) => reject(event.target.error);
    });

    return this.dbPromise;
  }

  /**
   * Called once at app startup (via APP_INITIALIZER).
   * Loads every 'appData' entry from IndexedDB into inMemoryCache so all
   * subsequent getItem() calls are synchronous.
   */
  initFromDB(): Promise<void> {
    return this.getDB().then(db => new Promise<void>((resolve) => {
      try {
        const tx    = db.transaction('appData', 'readonly');
        const store = tx.objectStore('appData');
        const req   = store.getAll();

        req.onsuccess = (event: any) => {
          const entries: { key: string; value: string }[] = event.target.result || [];
          entries.forEach(entry => this.inMemoryCache.set(entry.key, entry.value));
          this.migrateDevData(db).then(() => resolve()).catch(() => resolve());
        };
        req.onerror = () => resolve(); // graceful degradation
      } catch {
        resolve();
      }
    })).catch(() => {
      // IndexedDB unavailable – app still works, just without cross-session persistence
    });
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

  getItem(key: string): string | null {
    return this.inMemoryCache.get(key) ?? null;
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
    const supabaseUserId = this.inMemoryCache.get('supabaseUserId');
    const spotifyUserId = this.inMemoryCache.get('spotifyUserId');
    if (supabaseUserId && spotifyUserId) {
      const isBackupActive = this.inMemoryCache.get(`${supabaseUserId}_backup_active`) === 'true';
      if (isBackupActive) {
        const isUserKey = key.startsWith(`${spotifyUserId}_`) || key.startsWith(`${supabaseUserId}_`);
        const isBackupActiveKey = key === `${supabaseUserId}_backup_active`;
        if (isUserKey && !isBackupActiveKey) {
          this.supabaseService.saveUserCache(supabaseUserId, key, value).catch(err => {
            console.warn('[StorageService] Failed to sync cache key to Supabase:', key, err);
          });
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

  /** Clears ALL app data (appData + statsHistory) and the in-memory cache. */
  clear(): void {
    this.inMemoryCache.clear();
    this.clearKV();
    this.clearAllHistory().catch(() => {});
  }

  // ─── IndexedDB appData helpers (fire-and-forget async) ───────────────────

  private persistKV(key: string, value: string): void {
    this.getDB().then(db => {
      const tx    = db.transaction('appData', 'readwrite');
      const store = tx.objectStore('appData');
      const req   = store.put({ key, value });
      req.onerror = (e: any) => console.warn('[StorageService] IndexedDB put request failed:', e.target.error);
    }).catch(err => console.warn('[StorageService] IndexedDB write failed:', err));
  }

  private deleteKV(key: string): void {
    this.getDB().then(db => {
      const tx    = db.transaction('appData', 'readwrite');
      const store = tx.objectStore('appData');
      const req   = store.delete(key);
      req.onerror = (e: any) => console.warn('[StorageService] IndexedDB delete request failed:', e.target.error);
    }).catch(err => console.warn('[StorageService] IndexedDB delete failed:', err));
  }

  private clearKV(): void {
    this.getDB().then(db => {
      const tx    = db.transaction('appData', 'readwrite');
      const store = tx.objectStore('appData');
      const req   = store.clear();
      req.onerror = (e: any) => console.warn('[StorageService] IndexedDB clear request failed:', e.target.error);
    }).catch(err => console.warn('[StorageService] IndexedDB clearKV failed:', err));
  }

  // ─── Stats history (IndexedDB statsHistory store) ─────────────────────────

  saveStatsHistory(historyEntry: any): Promise<void> {
    return this.getDB().then(db => new Promise<void>((resolve, reject) => {
      const tx      = db.transaction('statsHistory', 'readwrite');
      const store   = tx.objectStore('statsHistory');
      const request = store.add(historyEntry);
      request.onsuccess = () => resolve();
      request.onerror   = (e: any) => reject(e.target.error);
    })).catch(err => {
      console.warn('IndexedDB failed to write stats history, falling back silently:', err);
    });
  }

  getStatsHistory(userId: string, range: string): Promise<any[]> {
    return this.getDB().then(db => new Promise<any[]>((resolve, reject) => {
      const tx      = db.transaction('statsHistory', 'readonly');
      const store   = tx.objectStore('statsHistory');
      const request = store.getAll();

      request.onsuccess = (event: any) => {
        const all      = event.target.result || [];
        const filtered = all.filter((item: any) => item.userId === userId && item.range === range);
        filtered.sort((a: any, b: any) => a.timestamp - b.timestamp);
        resolve(filtered);
      };
      request.onerror = (e: any) => reject(e.target.error);
    })).catch(err => {
      console.warn('IndexedDB failed to read stats history, returning empty:', err);
      return [];
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
