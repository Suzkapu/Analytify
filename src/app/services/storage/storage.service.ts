import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  /** Primary synchronous read layer – always in sync with IndexedDB */
  private inMemoryCache = new Map<string, string>();

  private dbPromise: Promise<IDBDatabase> | null = null;

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
          resolve();
        };
        req.onerror = () => resolve(); // graceful degradation
      } catch {
        resolve();
      }
    })).catch(() => {
      // IndexedDB unavailable – app still works, just without cross-session persistence
    });
  }

  // ─── Sync API (reads from in-memory cache) ─────────────────────────────────

  getItem(key: string): string | null {
    return this.inMemoryCache.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.inMemoryCache.set(key, value);
    this.persistKV(key, value);
  }

  removeItem(key: string): void {
    this.inMemoryCache.delete(key);
    this.deleteKV(key);
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
      store.put({ key, value });
    }).catch(err => console.warn('[StorageService] IndexedDB write failed:', err));
  }

  private deleteKV(key: string): void {
    this.getDB().then(db => {
      const tx    = db.transaction('appData', 'readwrite');
      const store = tx.objectStore('appData');
      store.delete(key);
    }).catch(err => console.warn('[StorageService] IndexedDB delete failed:', err));
  }

  private clearKV(): void {
    this.getDB().then(db => {
      const tx    = db.transaction('appData', 'readwrite');
      const store = tx.objectStore('appData');
      store.clear();
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
