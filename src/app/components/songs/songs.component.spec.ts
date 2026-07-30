import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {EMPTY} from 'rxjs';
import { SongsComponent } from './songs.component';
import {SpotifyAuthService} from '../../services/auth/spotify-auth.service';
import {StorageService} from '../../services/storage/storage.service';
import {PlaylistLoaderService} from '../../services/playlist-loader/playlist-loader.service';

describe('SongsComponent', () => {
  let component: SongsComponent;
  let fixture: ComponentFixture<SongsComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [SongsComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: EMPTY } },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: SpotifyAuthService, useValue: {} },
        { provide: StorageService, useValue: {} },
        { provide: PlaylistLoaderService, useValue: {} }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(SongsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
