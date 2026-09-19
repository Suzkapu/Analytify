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
    this.storage.setItem(
      this.storageKey,
      `${acceptance.version}|${acceptance.acceptedAt}|${acceptance.sessionId}`,
      false
    );
    return acceptance;
  }

  assertCurrentAcceptance(): void {
    if (!this.hasCurrentAcceptance()) {
      throw new Error('Accept the current Terms and Privacy Notice before connecting Spotify.');
    }
  }

  private currentAcceptance(): TermsAcceptance | null {
    const raw = this.storage.getItem(this.storageKey);
    if (!raw) return null;
    const [version, acceptedAt, sessionId] = raw.split('|');
    if (version !== CURRENT_TERMS_VERSION || !acceptedAt || sessionId?.length !== 36) return null;
    return {version, acceptedAt, sessionId};
  }
}
