import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {StorageService} from '@core/data-access/storage/storage.service';
import {CURRENT_TERMS_VERSION, TermsAcceptanceService} from './terms-acceptance.service';

describe('TermsAcceptanceService', () => {
  let service: TermsAcceptanceService;
  let values: Record<string, string>;
  beforeEach(() => {
    values = {};
    TestBed.configureTestingModule({providers: [
      TermsAcceptanceService,
      {provide: StorageService, useValue: {
        getItem: (key: string) => values[key] ?? null,
        setItem: (key: string, value: string) => { values[key] = value; }
      }}
    ]});
    service = TestBed.inject(TermsAcceptanceService);
  });

  it('requires affirmative acceptance of the current version', () => {
    expect(service.hasCurrentAcceptance()).toBe(false);
    expect(() => service.assertCurrentAcceptance()).toThrow(/Accept the current Terms/);

    const accepted = service.acceptCurrent();

    expect(accepted.version).toBe(CURRENT_TERMS_VERSION);
    expect(service.hasCurrentAcceptance()).toBe(true);
    expect(() => service.assertCurrentAcceptance()).not.toThrow();
  });

  it('rejects a stored acceptance after a material version change', () => {
    values['termsAcceptance'] = `obsolete|${new Date().toISOString()}|${crypto.randomUUID()}`;
    expect(service.hasCurrentAcceptance()).toBe(false);
  });

  it('keeps the accepted version, time, and local acceptance session', () => {
    const acceptance = service.acceptCurrent();
    expect(values['termsAcceptance']).toBe(
      `${CURRENT_TERMS_VERSION}|${acceptance.acceptedAt}|${acceptance.sessionId}`
    );
  });
});
