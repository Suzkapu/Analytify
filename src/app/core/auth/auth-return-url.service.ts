import {Injectable} from '@angular/core';

@Injectable({providedIn: 'root'})
export class AuthReturnUrlService {
  private readonly key = 'analytifyAuthReturnUrl';

  remember(url: string | undefined): void {
    if (!url || !url.startsWith('/') || url.startsWith('//')) return;
    try {
      sessionStorage.setItem(this.key, url);
    } catch {
      // Navigation still falls back safely when session storage is unavailable.
    }
  }

  consume(fallback = '/playlists'): string {
    try {
      const remembered = sessionStorage.getItem(this.key);
      sessionStorage.removeItem(this.key);
      return remembered && remembered.startsWith('/') && !remembered.startsWith('//')
        ? remembered
        : fallback;
    } catch {
      return fallback;
    }
  }
}
