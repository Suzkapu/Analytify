import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private inMemoryCache = new Map<string, string>();
  private isLocalStorageAvailable: boolean;

  constructor() {
    this.isLocalStorageAvailable = this.checkLocalStorage();
  }

  private checkLocalStorage(): boolean {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn('localStorage is not available (blocked by privacy setting or adblocker). Using in-memory fallback.');
      return false;
    }
  }

  getItem(key: string): string | null {
    if (this.isLocalStorageAvailable) {
      try {
        const val = localStorage.getItem(key);
        if (val !== null) {
          return val;
        }
      } catch (e) {
        // Fallback to inMemoryCache
      }
    }
    return this.inMemoryCache.get(key) || null;
  }

  setItem(key: string, value: string): void {
    if (this.isLocalStorageAvailable) {
      try {
        localStorage.setItem(key, value);
        return;
      } catch (e) {
        console.warn('Failed to write to localStorage. Writing to in-memory fallback.', e);
      }
    }
    this.inMemoryCache.set(key, value);
  }

  removeItem(key: string): void {
    if (this.isLocalStorageAvailable) {
      try {
        localStorage.removeItem(key);
        return;
      } catch (e) {
        // Fallback
      }
    }
    this.inMemoryCache.delete(key);
  }

  clear(): void {
    if (this.isLocalStorageAvailable) {
      try {
        localStorage.clear();
      } catch (e) {
        // Fallback
      }
    }
    this.inMemoryCache.clear();
  }

  clearAllHistory(): Promise<void> {
    return this.getDB().then(db => {
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('statsHistory', 'readwrite');
        const store = transaction.objectStore('statsHistory');
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = (e: any) => reject(e.target.error);
      });
    }).catch(err => {
      console.warn('IndexedDB clearAll failed:', err);
      return Promise.resolve();
    });
  }

  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not supported in this environment.'));
        return;
      }

      const request = indexedDB.open('AnalytifyDB', 1);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('statsHistory')) {
          db.createObjectStore('statsHistory', { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = (event: any) => {
        resolve(event.target.result);
      };

      request.onerror = (event: any) => {
        reject(event.target.error);
      };
    });

    return this.dbPromise;
  }

  saveStatsHistory(historyEntry: any): Promise<void> {
    return this.getDB().then(db => {
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('statsHistory', 'readwrite');
        const store = transaction.objectStore('statsHistory');
        const request = store.add(historyEntry);

        request.onsuccess = () => resolve();
        request.onerror = (e: any) => reject(e.target.error);
      });
    }).catch(err => {
      console.warn('IndexedDB failed to write, falling back silently:', err);
      return Promise.resolve();
    });
  }

  getStatsHistory(userId: string, range: string): Promise<any[]> {
    return this.getDB().then(db => {
      return new Promise<any[]>((resolve, reject) => {
        const transaction = db.transaction('statsHistory', 'readonly');
        const store = transaction.objectStore('statsHistory');
        const request = store.getAll();

        request.onsuccess = (event: any) => {
          const allResults = event.target.result || [];
          const filtered = allResults.filter((item: any) => item.userId === userId && item.range === range);
          filtered.sort((a: any, b: any) => a.timestamp - b.timestamp);
          resolve(filtered);
        };

        request.onerror = (e: any) => reject(e.target.error);
      });
    }).catch(err => {
      console.warn('IndexedDB failed to read, returning empty history fallback:', err);
      return [];
    });
  }

  clearStatsHistory(userId: string): Promise<void> {
    return this.getDB().then(db => {
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('statsHistory', 'readwrite');
        const store = transaction.objectStore('statsHistory');
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
      });
    }).catch(err => {
      console.warn('IndexedDB clear failed:', err);
      return Promise.resolve();
    });
  }
}
