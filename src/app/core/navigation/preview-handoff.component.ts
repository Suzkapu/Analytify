import {Component, inject, OnInit} from '@angular/core';
import {CanActivateFn, Router} from '@angular/router';

export function previewCallbackDestination(url: string, storage: Pick<Storage, 'getItem'>): string | null {
  const path = url.split(/[?#]/, 1)[0];
  const key = {
    '/callback': 'analytifyAuthReturnUrl',
    '/spotify/callback': 'analytify_personal_spotify_auth_request',
    '/compare-room/callback': 'analytify_compare_auth_request'
  }[path];
  if (!key) return null;
  try {
    const stored = storage.getItem(key);
    const returnUrl: unknown = key === 'analytifyAuthReturnUrl' ? stored : JSON.parse(stored ?? 'null')?.returnUrl;
    return typeof returnUrl === 'string' && /^\/new(?:[/?#]|$)/.test(returnUrl) ? `/new${url}` : null;
  } catch {
    return null;
  }
}

export const previewOAuthHandoffGuard: CanActivateFn = (_route, state) => {
  // Forward before exchanging the code: guest credentials are intentionally
  // memory-only and must be created inside the preview document, not lost on reload.
  const destination = previewCallbackDestination(state.url, window.sessionStorage);
  if (!destination) return true;
  window.location.assign(destination);
  return false;
};

export function forwardToPreview(url: string, location: Pick<Location, 'assign'>, documentPath = '/'): boolean {
  if (!/^\/new(?:[/?#]|$)/.test(url)) throw new Error('Invalid preview destination.');
  // A stable document already at /new means the preview is unavailable. Reloading
  // that same fallback document would create an endless navigation loop.
  if (/^\/new(?:\/|$)/.test(documentPath)) return false;
  location.assign(url);
  return true;
}

@Component({
  standalone: true,
  template: '<p role="status">{{ opening ? "Opening the new design…" : "The new design is not available yet." }}</p><a href="/">Return to the normal site</a>'
})
export class PreviewHandoffComponent implements OnInit {
  private readonly router = inject(Router);
  protected opening = true;

  ngOnInit(): void {
    // OAuth callbacks remain registered at the stable URLs. Resume the preview
    // with a full document load rather than rendering it in the stable app.
    this.opening = forwardToPreview(this.router.url, window.location, window.location.pathname);
  }
}
