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
        return;
      } catch (e) {
        // Fallback
      }
    }
    this.inMemoryCache.clear();
  }
}
