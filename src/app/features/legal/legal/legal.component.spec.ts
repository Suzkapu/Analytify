import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommonModule, Location } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { LegalComponent } from './legal.component';
import { DesignNavigationService } from '@core/navigation/design-navigation.service';

describe('LegalComponent', () => {
    let fixture: ComponentFixture<LegalComponent>;
    let authenticated: boolean;

    beforeEach(async () => {
        authenticated = false;

        await TestBed.configureTestingModule({
            declarations: [LegalComponent],
            imports: [CommonModule, RouterTestingModule],
            providers: [
                { provide: SpotifyAuthService, useValue: { isAuthenticated: () => authenticated } },
                { provide: Location, useValue: { back: vi.fn().mockName('back') } },
                DesignNavigationService
            ],
            schemas: [NO_ERRORS_SCHEMA]
        }).compileComponents();
    });

    it('uses the shared shell instead of mounting a second header when logged in', () => {
        authenticated = true;
        fixture = TestBed.createComponent(LegalComponent);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-header')).toBeNull();
        expect(fixture.nativeElement.querySelector('.legal-public-header')).toBeNull();
    });

    it('uses the shared public shell instead of mounting a second header when logged out', () => {
        fixture = TestBed.createComponent(LegalComponent);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-header')).toBeNull();
        expect(fixture.nativeElement.querySelector('.legal-public-header')).toBeNull();
    });

    it('uses the shared reading shell without a duplicate header', () => {
        fixture = TestBed.createComponent(LegalComponent);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-header')).toBeNull();
        expect(fixture.nativeElement.querySelector('.legal-public-header')).toBeNull();
        expect(fixture.nativeElement.querySelector('.legal-wrapper')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('article.legal-card')).not.toBeNull();
        expect(fixture.componentInstance.navigation.commands('legal')).toEqual(['/legal']);
    });

    it('publishes the versioned Spotify-required end-user protections before login', () => {
        fixture = TestBed.createComponent(LegalComponent);
        fixture.detectChanges();
        const text = (fixture.nativeElement as HTMLElement).textContent || '';

        expect(text).toContain('analytify-eula-2026-09-25');
        expect(text).toContain('merchantability');
        expect(text).toContain('fitness for a particular purpose');
        expect(text).toContain('non-infringement');
        expect(text).toContain('must not modify');
        expect(text).toContain('must not decompile');
        expect(text).toContain('solely responsible');
        expect(text).toContain('third-party beneficiary');
        expect(text).toContain('Section V.11');
        expect(text).toContain('No ads or tracking');
        expect(text).toContain('Version: 2026-09-25');
        expect(text).toContain('at least 14 years old');
        expect(text).toContain('does not ask for or store your date of birth');
        expect(text).toContain('stored Spotify credentials are disconnected');
        expect(text).toContain('What is processed and why');
        expect(text).toContain('Where the data comes from');
        expect(text).toContain('normally within one month');
        expect(text).toContain('Austrian Data Protection Authority');
        expect(text).toContain('Automated results, not automated decisions');
        expect(text).toContain('International transfers and provider details');
        expect(text).toContain('does not claim that a DPA, region, or transfer route has been verified');
        expect(text).not.toContain('Clause 12');
    });

    it('publishes the full Austrian service-provider and media-owner disclosure without relying on an exception', () => {
        fixture = TestBed.createComponent(LegalComponent);
        fixture.detectChanges();
        const text = (fixture.nativeElement as HTMLElement).textContent || '';

        expect(text).toContain('Diensteanbieter and Medieninhaber: Simon Praher');
        expect(text).toContain('Unternehmensgegenstand / purpose');
        expect(text).toContain('Company register and register number');
        expect(text).toContain('Supervisory authority');
        expect(text).toContain('VAT identification number');
        expect(text).toContain('Blattlinie');
        expect(text).toContain('does not rely on the reduced-disclosure exception');
        expect(text).toContain('independent Austrian legal review');
    });
});
