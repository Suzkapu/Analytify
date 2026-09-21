import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommonModule, Location } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';

import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { LegalComponent } from './legal.component';

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
                { provide: Location, useValue: { back: vi.fn().mockName('back') } }
            ],
            schemas: [NO_ERRORS_SCHEMA]
        }).compileComponents();
    });

    it('shows the normal application header when the user is logged in', () => {
        authenticated = true;
        fixture = TestBed.createComponent(LegalComponent);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-header')).not.toBeNull();
        expect(fixture.nativeElement.querySelector('.legal-public-header')).toBeNull();
    });

    it('shows only the public Legal header when the user is logged out', () => {
        fixture = TestBed.createComponent(LegalComponent);
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelector('app-header')).toBeNull();
        expect(fixture.nativeElement.querySelector('.legal-public-header')).not.toBeNull();
    });

    it('publishes the versioned Spotify-required end-user protections before login', () => {
        fixture = TestBed.createComponent(LegalComponent);
        fixture.detectChanges();
        const text = (fixture.nativeElement as HTMLElement).textContent || '';

        expect(text).toContain('analytify-eula-2026-09-19');
        expect(text).toContain('merchantability');
        expect(text).toContain('fitness for a particular purpose');
        expect(text).toContain('non-infringement');
        expect(text).toContain('must not modify');
        expect(text).toContain('must not decompile');
        expect(text).toContain('solely responsible');
        expect(text).toContain('third-party beneficiary');
        expect(text).toContain('Section V.11');
        expect(text).toContain('Strictly Necessary Cookie');
        expect(text).toContain('not used for analytics');
        expect(text).not.toContain('Clause 12');
    });
});
