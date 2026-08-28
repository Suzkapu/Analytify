import {NO_ERRORS_SCHEMA} from '@angular/core';
import {HttpClientTestingModule, HttpTestingController} from '@angular/common/http/testing';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {FormsModule} from '@angular/forms';
import {ActivatedRoute, Router} from '@angular/router';
import {createClient} from '@supabase/supabase-js';
import {EMPTY} from 'rxjs';

import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ComparePlaylistSourceService} from '@core/compare-room/compare-playlist-source.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {PlaylistLoaderService} from '@core/sync/playlist-loader/playlist-loader.service';
import {UserStatsComponent} from '@features/insights/user-stats/user-stats.component';
import {PlaylistsComponent} from '@features/library/playlists/playlists.component';
import {environment} from '@env/environment';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';

const karmaArgs = ((window as any).__karma__?.config?.args || []) as string[];
const integrationMarker = karmaArgs.indexOf('--analytify-supabase-integration');
const integrationEnabled = integrationMarker >= 0;
const integrationDescribe = integrationEnabled ? describe : xdescribe;
const cloudUserId = '11111111-1111-4111-8111-111111111111';
const spotifyUserId = 'ci-spotify-user';

integrationDescribe('real Supabase-first playlist and stats loading', () => {
  let storage: StorageService;
  let supabase: SupabaseService;
  let http: HttpTestingController;
  let auth: jasmine.SpyObj<SpotifyAuthService>;
  let loadUserCache: jasmine.Spy;
  let playlistFixture: ComponentFixture<PlaylistsComponent> | null = null;
  let statsFixture: ComponentFixture<UserStatsComponent> | null = null;

  beforeAll(async () => {
    const supabaseUrl = stripEnvironmentQuotes(karmaArgs[integrationMarker + 1]);
    const supabaseAnonKey = stripEnvironmentQuotes(karmaArgs[integrationMarker + 2]);
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('The CI Supabase URL and anonymous key were not passed to Karma.');
    }

    auth = jasmine.createSpyObj<SpotifyAuthService>('SpotifyAuthService', [
      'getUserId',
      'getSupabaseUserId',
      'isBackupActive',
      'isAuthenticated',
      'ensureInitialSync',
      'getAccessToken',
      'isTokenExpired',
      'refreshToken'
    ]);
    auth.getUserId.and.returnValue(spotifyUserId);
    auth.getSupabaseUserId.and.returnValue(cloudUserId);
    auth.isBackupActive.and.returnValue(true);
    auth.isAuthenticated.and.returnValue(false);
    auth.ensureInitialSync.and.resolveTo();
    auth.getAccessToken.and.returnValue('unused-ci-spotify-token');
    auth.isTokenExpired.and.returnValue(false);

    TestBed.configureTestingModule({
      imports: [FormsModule, HttpClientTestingModule],
      declarations: [PlaylistsComponent, UserStatsComponent],
      providers: [
        SupabaseService,
        StorageService,
        SpotifyDataService,
        {provide: SpotifyAuthService, useValue: auth},
        {provide: ActivatedRoute, useValue: {params: EMPTY}},
        {provide: Router, useValue: jasmine.createSpyObj<Router>('Router', ['navigate'])},
        {
          provide: ComparePlaylistSourceService,
          useValue: jasmine.createSpyObj<ComparePlaylistSourceService>('ComparePlaylistSourceService', ['loadMainTracks'])
        },
        {
          provide: ParticipantSpotifyService,
          useValue: jasmine.createSpyObj<ParticipantSpotifyService>('ParticipantSpotifyService', ['createPlaylist'])
        },
        {
          provide: PlaylistLoaderService,
          useValue: jasmine.createSpyObj<PlaylistLoaderService>('PlaylistLoaderService', ['recordPortfolioMetadata'])
        }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });

    supabase = TestBed.inject(SupabaseService);
    supabase.client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false}
    });
    storage = TestBed.inject(StorageService);
    http = TestBed.inject(HttpTestingController);

    await storage.clear();
    storage.setItem('spotifyUserId', spotifyUserId, false);
    storage.setItem('supabaseUserId', cloudUserId, false);
    storage.setItem(`${cloudUserId}_backup_active`, 'true', false);
    loadUserCache = spyOn(supabase, 'loadUserCache').and.callThrough();
  });

  afterAll(async () => {
    playlistFixture?.destroy();
    statsFixture?.destroy();
    http?.verify();
    await storage?.clear();
  });

  it('renders real Supabase playlist and stats rows without a Spotify HTTP request', async () => {
    expect(storage.getItem(`${spotifyUserId}_playlists`)).toBeNull();
    expect(storage.getItem(`${spotifyUserId}_stats_short_term_tracks`)).toBeNull();

    playlistFixture = TestBed.createComponent(PlaylistsComponent);
    await playlistFixture.componentInstance.loadPlaylists();
    playlistFixture.detectChanges();

    expect(loadUserCache).toHaveBeenCalledWith(cloudUserId, [
      `${spotifyUserId}_playlists`,
      `${spotifyUserId}_playlists_lastUpdated`
    ]);
    const playlistText = playlistFixture.nativeElement.textContent || '';
    expect(playlistText).toContain('CI Cloud Playlist');
    expect(playlistText).toContain('7 songs');

    statsFixture = TestBed.createComponent(UserStatsComponent);
    spyOn<any>(statsFixture.componentInstance, 'scheduleHistoryLoad');
    // Current-stat loading normally persists a history snapshot, whose completed
    // write starts an independent history-metadata query. Stop that workflow at
    // its synchronous boundary so no promise can outlive Jasmine's spy cleanup.
    // History persistence has its own tests; this case verifies the visible
    // current-stat restore and the absence of Spotify HTTP requests.
    spyOn(statsFixture.componentInstance, 'saveHistorySnapshot');
    statsFixture.detectChanges();
    await waitFor(() => statsFixture!.componentInstance.topTracks.length === 1);
    statsFixture.detectChanges();

    expect(loadUserCache).toHaveBeenCalledWith(cloudUserId, [
      `${spotifyUserId}_stats_short_term_tracks`,
      `${spotifyUserId}_stats_short_term_artists`,
      `${spotifyUserId}_stats_short_term_genres`,
      `${spotifyUserId}_stats_short_term_lastUpdated`
    ]);
    expect(statsFixture.componentInstance.topTracks[0].id).toBe('ci-cloud-track');
    expect(statsFixture.componentInstance.topArtists[0].id).toBe('ci-cloud-artist');
    const statsText = statsFixture.nativeElement.textContent || '';
    expect(statsText).toContain('CI Supabase Song');
    expect(statsText).toContain('CI Supabase Artist');

    http.expectNone(request => request.url.startsWith(environment.spotifyUrl));
  });
});

async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error('Timed out waiting for Supabase-backed component data to render.');
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

function stripEnvironmentQuotes(value = ''): string {
  return value.replace(/^['"]|['"]$/g, '');
}
