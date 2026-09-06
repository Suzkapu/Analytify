import {NO_ERRORS_SCHEMA} from '@angular/core';
import {ComponentFixture, TestBed} from '@angular/core/testing';
import {ActivatedRoute, Router} from '@angular/router';
import {Subject} from 'rxjs';
import {SharedPlaylistDetailComponent} from './shared-playlist-detail.component';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';
import {PlaylistShareAutoSyncService, PlaylistShareSpotifyUpdate} from '@core/sharing/playlist-share-auto-sync.service';
import {SafeSpotifyUrlPipe} from '@shared/pipes/safe-spotify-url.pipe';

describe('SharedPlaylistDetailComponent', () => {
  let fixture: ComponentFixture<SharedPlaylistDetailComponent>;
  let component: SharedPlaylistDetailComponent;
  let sharing: jasmine.SpyObj<PlaylistSharingService>;
  let spotify: jasmine.SpyObj<ParticipantSpotifyService>;
  let unsubscribeShareChanges: jasmine.Spy;
  let spotifyUpdates: Subject<PlaylistShareSpotifyUpdate>;

  beforeEach(() => {
    sharing = jasmine.createSpyObj<PlaylistSharingService>('PlaylistSharingService', [
      'loadShare',
      'loadShareMetadata',
      'loadShareTracks',
      'calculateStats',
      'recordDownload',
      'subscribeToShareChanges'
    ]);
    unsubscribeShareChanges = jasmine.createSpy('unsubscribeShareChanges');
    spotifyUpdates = new Subject<PlaylistShareSpotifyUpdate>();
    sharing.subscribeToShareChanges.and.returnValue(unsubscribeShareChanges);
    spotify = jasmine.createSpyObj<ParticipantSpotifyService>('ParticipantSpotifyService', ['syncPlaylist']);
    sharing.loadShareMetadata.and.resolveTo({
      share: {
        id: 'share-id', ownerUserId: 'owner', recipientUserId: 'recipient', sourcePlaylistId: 'source',
        playlistName: 'Shared party', playlistDescription: '', playlistImageUrl: '', ownerDisplayName: 'Owner',
        ownerImageUrl: '', recipientDisplayName: 'Recipient', trackCount: 1, revision: 2,
        createdAt: 'now', updatedAt: 'now', acceptedAt: 'now', revokedAt: null
      },
      download: {
        shareId: 'share-id', spotifyPlaylistId: 'existing', spotifyPlaylistUrl: 'spotify-url',
        appliedRevision: 1, updatedAt: 'before'
      },
      viewerRole: 'recipient'
    });
    sharing.loadShareTracks.and.callFake(async (_id, options) => {
      const tracks = [track('song')];
      options?.onPage?.(tracks, tracks.length, tracks.length);
      return tracks;
    });
    sharing.calculateStats.and.returnValue({
      tracks: 1, artists: 1, albums: 0, durationMs: 0, explicitTracks: 0, topArtists: [], topAlbums: []
    });
    sharing.recordDownload.and.resolveTo();
    spotify.syncPlaylist.and.resolveTo({
      success: true,
      playlistName: 'Shared party',
      playlistId: 'existing',
      playlistUrl: 'spotify-url',
      addedTracks: 1
    });

    TestBed.configureTestingModule({
      declarations: [SharedPlaylistDetailComponent, SafeSpotifyUrlPipe],
      providers: [
        {provide: ActivatedRoute, useValue: {snapshot: {paramMap: {get: () => 'share-id'}}}},
        {provide: Router, useValue: {navigate: jasmine.createSpy('navigate')}},
        {
          provide: SpotifyAuthService,
          useValue: {getAccessToken: () => 'token', isTokenExpired: () => false, refreshToken: jasmine.createSpy()}
        },
        {provide: ParticipantSpotifyService, useValue: spotify},
        {provide: PlaylistSharingService, useValue: sharing},
        {provide: PlaylistShareAutoSyncService, useValue: {
          start: jasmine.createSpy('start'), spotifyUpdates$: spotifyUpdates.asObservable()
        }}
      ],
      schemas: [NO_ERRORS_SCHEMA]
    });
    fixture = TestBed.createComponent(SharedPlaylistDetailComponent);
    component = fixture.componentInstance;
  });

  it('updates the Spotify playlist stored for the immutable share ID', async () => {
    await component.load();
    expect(component.hasUpdate).toBeTrue();
    expect(component.displayPlaylistName).toBe('Shared party · from Owner');

    await component.downloadOrUpdate();

    expect(spotify.syncPlaylist).toHaveBeenCalledWith(
      'token', 'existing', 'spotify-url', 'Shared party · from Owner', jasmine.stringContaining('Share ID: share-id'), jasmine.any(Array)
    );
    expect(sharing.recordDownload).toHaveBeenCalledWith('share-id', 'existing', 'spotify-url', 2);
    expect(component.download?.appliedRevision).toBe(2);
  });

  it('does not open a realtime channel when the detail page closes during its initial load', async () => {
    let finishLoad!: (details: any) => void;
    sharing.loadShareMetadata.and.returnValue(new Promise(resolve => finishLoad = resolve));

    const initialization = component.ngOnInit();
    component.ngOnDestroy();
    finishLoad({
      share: share(1),
      download: null,
      viewerRole: 'recipient'
    });
    await initialization;

    expect(sharing.subscribeToShareChanges).not.toHaveBeenCalled();
  });

  it('renders playlist metadata before track hydration finishes', async () => {
    let finishTracks!: (tracks: any[]) => void;
    let tracksStarted!: () => void;
    const trackLoadingStarted = new Promise<void>(resolve => tracksStarted = resolve);
    sharing.loadShareTracks.and.callFake(() => {
      tracksStarted();
      return new Promise(resolve => finishTracks = resolve);
    });

    fixture.detectChanges();
    await trackLoadingStarted;
    fixture.detectChanges();

    expect(component.share?.playlistName).toBe('Shared party');
    expect(component.isLoading).toBeFalse();
    expect(component.isTracksLoading).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain('Shared party');
    finishTracks([track('song')]);
    await fixture.whenStable();
  });

  it('keeps partial pages visible when a later page fails', async () => {
    sharing.loadShareTracks.and.callFake(async (_id, options) => {
      options?.onPage?.([track('first')], 1, 2);
      throw new Error('Some shared playlist songs could not be loaded. Please retry.');
    });

    await component.load();

    expect(component.tracks.map(item => item.id)).toEqual(['first']);
    expect(component.trackLoadError).toContain('could not be loaded');
  });

  it('aborts track hydration when the page is destroyed', async () => {
    let capturedSignal: AbortSignal | undefined;
    sharing.loadShareTracks.and.callFake((_id, options) => {
      capturedSignal = options?.signal;
      return new Promise(() => undefined);
    });
    void component.load();
    await flushAsyncWork();

    component.ngOnDestroy();

    expect(capturedSignal?.aborted).toBeTrue();
  });

  it('limits the rendered track window for very large playlists', () => {
    component.filteredTracks = Array.from({length: 2_000}, (_, index) => track(`song-${index}`));

    expect(component.visibleTracks.length).toBe(component.virtualWindowSize);
    component.onTrackListScroll({currentTarget: {scrollTop: 62_000}} as any);
    expect(component.visibleTracks.length).toBe(component.virtualWindowSize);
    expect(component.visibleTrackStart).toBeGreaterThan(0);
  });

  it('silently reloads a matching live update while background synchronization handles Spotify', async () => {
    sharing.loadShareMetadata.and.returnValues(
      Promise.resolve({
        share: share(2),
        download: download(1),
        viewerRole: 'recipient'
      }),
      Promise.resolve({
        share: share(3),
        download: download(1),
        viewerRole: 'recipient'
      })
    );
    sharing.loadShareTracks.and.returnValues(
      Promise.resolve([track('old-song')]),
      Promise.resolve([track('new-song')])
    );

    await component.ngOnInit();

    expect(sharing.subscribeToShareChanges).toHaveBeenCalledWith(jasmine.any(Function), 'share-id');
    const onChange = sharing.subscribeToShareChanges.calls.mostRecent().args[0];
    onChange();
    expect(component.isLoading).toBeFalse();
    await flushAsyncWork();

    expect(component.share?.revision).toBe(3);
    expect(component.tracks.map(item => item.id)).toEqual(['new-song']);
    expect(component.liveUpdateMessage).toContain('revision 3');
    expect(component.hasUpdate).toBeTrue();
    expect(spotify.syncPlaylist).not.toHaveBeenCalled();
  });

  it('shows the applied revision after the background service updates the Spotify copy', async () => {
    sharing.loadShareMetadata.and.returnValues(
      Promise.resolve({
        share: share(3), download: download(2), viewerRole: 'recipient'
      }),
      Promise.resolve({
        share: share(3), download: download(3), viewerRole: 'recipient'
      })
    );
    sharing.loadShareTracks.and.returnValues(
      Promise.resolve([track('new-song')]),
      Promise.resolve([track('new-song')])
    );
    await component.ngOnInit();

    spotifyUpdates.next({shareId: 'share-id', revision: 3, success: true});
    await flushAsyncWork();

    expect(component.download?.appliedRevision).toBe(3);
    expect(component.liveUpdateMessage).toContain('automatically updated to revision 3');
  });

  it('unsubscribes from live updates when the detail page is destroyed', async () => {
    await component.ngOnInit();

    component.ngOnDestroy();

    expect(unsubscribeShareChanges).toHaveBeenCalledTimes(1);
  });

  it('keeps share B and its realtime channel when share A resolves later', async () => {
    const paramMap = new Subject<any>();
    const pending = new Map<string, (details: any) => void>();
    const unsubscribers = new Map<string, jasmine.Spy>();
    sharing.loadShareMetadata.and.callFake((id: string) => new Promise(resolve => pending.set(id, resolve)));
    sharing.loadShareTracks.and.callFake(async (id: string) => [track(id === 'share-b' ? 'b' : 'a')]);
    sharing.subscribeToShareChanges.and.callFake((_callback, id) => {
      const unsubscribe = jasmine.createSpy(`unsubscribe-${id}`);
      unsubscribers.set(id || '', unsubscribe);
      return unsubscribe;
    });
    const routed = new SharedPlaylistDetailComponent(
      {paramMap, snapshot: {paramMap: {get: () => ''}}} as any,
      {navigate: jasmine.createSpy('navigate')} as any,
      TestBed.inject(SpotifyAuthService), sharing, spotify,
      {spotifyUpdates$: spotifyUpdates.asObservable()} as any
    );
    void routed.ngOnInit();

    paramMap.next({get: () => 'share-a'});
    paramMap.next({get: () => 'share-b'});
    pending.get('share-b')?.({share: {...share(2), id: 'share-b'}, download: null, viewerRole: 'recipient'});
    await flushAsyncWork();
    pending.get('share-a')?.({share: {...share(1), id: 'share-a'}, download: null, viewerRole: 'recipient'});
    await flushAsyncWork();

    expect(routed.share?.id).toBe('share-b');
    expect(routed.tracks.map(item => item.id)).toEqual(['b']);
    expect(sharing.subscribeToShareChanges).toHaveBeenCalledOnceWith(jasmine.any(Function), 'share-b');
    routed.ngOnDestroy();
    expect(unsubscribers.get('share-b')).toHaveBeenCalled();
  });

  function share(revision: number) {
    return {
      id: 'share-id', ownerUserId: 'owner', recipientUserId: 'recipient', sourcePlaylistId: 'source',
      playlistName: 'Shared party', playlistDescription: '', playlistImageUrl: '', ownerDisplayName: 'Owner',
      ownerImageUrl: '', recipientDisplayName: 'Recipient', trackCount: 1, revision,
      createdAt: 'now', updatedAt: 'now', acceptedAt: 'now', revokedAt: null
    };
  }

  function download(appliedRevision: number) {
    return {
      shareId: 'share-id', spotifyPlaylistId: 'existing', spotifyPlaylistUrl: 'spotify-url',
      appliedRevision, updatedAt: 'before'
    };
  }

  function track(id: string) {
    return {
      id, uri: `spotify:track:${id}`, name: id, artists: [{id: 'artist', name: 'Artist'}],
      albumName: '', imageUrl: '', spotifyUrl: '', playlistIndex: 1
    };
  }

  async function flushAsyncWork(): Promise<void> {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
});
