import {Injectable} from '@angular/core';
import {StorageService} from '@core/data-access/storage/storage.service';

export const CURRENT_TERMS_VERSION = 'analytify-eula-2026-09-19';

export interface TermsAcceptance {
  version: string;
  acceptedAt: string;
  sessionId: string;
}

@Injectable({providedIn: 'root'})
export class TermsAcceptanceService {
  private readonly storageKey = 'termsAcceptance';
  private readonly cookieName = 'analytify_terms_acceptance';
  private readonly cookieLifetimeSeconds = 365 * 24 * 60 * 60;

  constructor(private storage: StorageService) {}

  hasCurrentAcceptance(): boolean {
    return this.currentAcceptance() !== null;
  }

  acceptCurrent(): TermsAcceptance {
    const existing = this.currentAcceptance();
    if (existing) return existing;
    const acceptance: TermsAcceptance = {
      version: CURRENT_TERMS_VERSION,
      acceptedAt: new Date().toISOString(),
      sessionId: crypto.randomUUID()
    };
    this.persistAcceptance(acceptance);
    return acceptance;
  }

  assertCurrentAcceptance(): void {
    if (!this.hasCurrentAcceptance()) {
      throw new Error('Accept the current Terms and Privacy Notice before connecting Spotify.');
    }
  }

  private currentAcceptance(): TermsAcceptance | null {
    const cookieRaw = this.readCookie();
    const storedRaw = this.storage.getItem(this.storageKey);
    const acceptance = this.parseAcceptance(cookieRaw) || this.parseAcceptance(storedRaw);
    if (!acceptance) {
      if (cookieRaw) this.expireCookie();
      return null;
    }

    const serialized = this.serializeAcceptance(acceptance);
    if (cookieRaw !== serialized) this.writeCookie(serialized);
    if (storedRaw !== serialized) this.storage.setItem(this.storageKey, serialized, false);
    return acceptance;
  }

  private parseAcceptance(raw: string | null): TermsAcceptance | null {
    if (!raw) return null;
    const [version, acceptedAt, sessionId] = raw.split('|');
    const acceptedTimestamp = Date.parse(acceptedAt || '');
    if (version !== CURRENT_TERMS_VERSION
      || !Number.isFinite(acceptedTimestamp)
      || acceptedTimestamp > Date.now() + 5 * 60_000
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId || '')) {
      return null;
    }
    return {version, acceptedAt, sessionId};
  }

  private persistAcceptance(acceptance: TermsAcceptance): void {
    const serialized = this.serializeAcceptance(acceptance);
    this.storage.setItem(this.storageKey, serialized, false);
    this.writeCookie(serialized);
  }

  private serializeAcceptance(acceptance: TermsAcceptance): string {
    return `${acceptance.version}|${acceptance.acceptedAt}|${acceptance.sessionId}`;
  }

  private readCookie(): string | null {
    if (typeof document === 'undefined') return null;
    try {
      const prefix = `${this.cookieName}=`;
      const item = document.cookie.split(';').map(value => value.trim())
        .find(value => value.startsWith(prefix));
      return item ? decodeURIComponent(item.slice(prefix.length)) : null;
    } catch {
      return null;
    }
  }

  private writeCookie(value: string): void {
    if (typeof document === 'undefined') return;
    try {
      const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = `${this.cookieName}=${encodeURIComponent(value)}; Path=/; Max-Age=${this.cookieLifetimeSeconds}; SameSite=Lax${secure}`;
    } catch {
      // IndexedDB remains the durable fallback when cookies are unavailable.
    }
  }

  private expireCookie(): void {
    if (typeof document === 'undefined') return;
    try {
      document.cookie = `${this.cookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
    } catch {}
  }
}
