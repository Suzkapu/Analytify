import {CommonModule, Location} from '@angular/common';
import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {RouterTestingModule} from '@angular/router/testing';

import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {LegalComponent} from './legal.component';

describe('LegalComponent', () => {
  let fixture: ComponentFixture<LegalComponent>;
  let authenticated: boolean;

  beforeEach(async () => {
    authenticated = false;

    await TestBed.configureTestingModule({
      declarations: [LegalComponent],
      imports: [CommonModule, RouterTestingModule],
      providers: [
        {provide: SpotifyAuthService, useValue: {isAuthenticated: () => authenticated}},
        {provide: Location, useValue: {back: jasmine.createSpy('back')}}
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
});
