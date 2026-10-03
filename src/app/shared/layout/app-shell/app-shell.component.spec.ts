import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { Location } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AppShellComponent } from './app-shell.component';

describe('AppShellComponent', () => {
    let fixture: ComponentFixture<AppShellComponent>;
    let routerEvents: Subject<NavigationEnd>;
    let childData: Record<string, unknown>;
    let back: Mock;

    beforeEach(() => {
        routerEvents = new Subject<NavigationEnd>();
        childData = { mobileTitle: 'Your Playlists' };
        back = vi.fn().mockName('back');
        TestBed.configureTestingModule({
            declarations: [AppShellComponent],
            providers: [
                { provide: Router, useValue: { events: routerEvents.asObservable() } },
                { provide: ActivatedRoute, useValue: { firstChild: { snapshot: { get data() { return childData; } } } } },
                { provide: Location, useValue: { back } }
            ],
            schemas: [NO_ERRORS_SCHEMA]
        });
        fixture = TestBed.createComponent(AppShellComponent);
    });

    it('keeps one header and footer around the child outlet while route labels change', () => {
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelectorAll('app-header').length).toBe(1);
        expect(fixture.nativeElement.querySelectorAll('app-footer').length).toBe(1);
        expect(fixture.componentInstance.mobileTitle).toBe('Your Playlists');

        childData = { mobileTitle: 'Song League', mobileBack: true };
        routerEvents.next(new NavigationEnd(2, '/song-league/league', '/song-league/league'));
        fixture.detectChanges();

        expect(fixture.nativeElement.querySelectorAll('app-header').length).toBe(1);
        expect(fixture.componentInstance.mobileTitle).toBe('Song League');
        expect(fixture.componentInstance.showMobileBackButton).toBe(true);
    });

    it('delegates the mobile back action to browser history', () => {
        fixture.componentInstance.back();
        expect(back).toHaveBeenCalled();
    });
});
