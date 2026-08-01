import {HttpClientTestingModule, HttpTestingController} from '@angular/common/http/testing';
import {fakeAsync, flushMicrotasks, TestBed} from '@angular/core/testing';
import {environment} from '@env/environment';
import {CompareTrack} from './compare-room.models';
import {ParticipantSpotifyService} from './participant-spotify.service';

describe('ParticipantSpotifyService', () => {
  let service: ParticipantSpotifyService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({imports: [HttpClientTestingModule]});
    service = TestBed.inject(ParticipantSpotifyService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists Liked Songs plus owned and collaborative playlists only', fakeAsync(() => {
    let result: any[] | undefined;
    void service.getPlaylists('guest-token', 'me').then(value => result = value);
    const request = http.expectOne(`${environment.spotifyUrl}/me/playlists?limit=50&offset=0`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer guest-token');
    request.flush({
      total: 3,
      items: [
        {id: 'owned', name: 'Owned', owner: {id: 'me'}, collaborative: false, items: {total: 2}},
        {id: 'collab', name: 'Collab', owner: {id: 'friend'}, collaborative: true, items: {total: 3}},
        {id: 'followed', name: 'Followed', owner: {id: 'friend'}, collaborative: false, items: {total: 4}}
      ]
    });
    flushMicrotasks();
    const liked = http.expectOne(`${environment.spotifyUrl}/me/tracks?limit=1&offset=0`);
    liked.flush({total: 42, items: []});
    flushMicrotasks();

    expect(result?.map(item => item.id)).toEqual(['fav', 'owned', 'collab']);
    expect(result?.[0].total).toBe(42);
  }));

  it('creates a private playlist and adds tracks in batches of one hundred', fakeAsync(() => {
    const tracks = Array.from({length: 205}, (_, index) => track(`${index}`));
    let result: any;
    void service.createPlaylist('guest-token', 'Shared songs', 'Description', tracks).then(value => result = value);

    const create = http.expectOne(`${environment.spotifyUrl}/me/playlists`);
    expect(create.request.body.public).toBeFalse();
    create.flush({id: 'new-playlist', external_urls: {spotify: 'https://open.spotify.com/playlist/new'}});
    flushMicrotasks();

    for (const expectedSize of [100, 100, 5]) {
      const add = http.expectOne(`${environment.spotifyUrl}/playlists/new-playlist/items`);
      expect(add.request.body.uris.length).toBe(expectedSize);
      add.flush({snapshot_id: 'snapshot'});
      flushMicrotasks();
    }

    expect(result.success).toBeTrue();
    expect(result.addedTracks).toBe(205);
    expect(result.playlistUrl).toContain('/new');
  }));

  it('reconstructs Spotify URIs for tracks from the persistent Analytify cache', () => {
    const result = service.normalizeCachedTracks([{
      id: 'artist',
      tracks: [{
        id: 'cached-track',
        name: 'Cached track',
        artists: [{id: 'artist', name: 'Artist'}],
        playlist_index: 7,
        external_urls: {spotify: 'https://open.spotify.com/track/cached-track'},
        album: {name: 'Cached album', images: [{url: 'cover.jpg'}]}
      }]
    }]);

    expect(result.length).toBe(1);
    expect(result[0].uri).toBe('spotify:track:cached-track');
    expect(result[0].playlistIndex).toBe(7);
  });

  function track(id: string): CompareTrack {
    return {
      id,
      uri: `spotify:track:${id}`,
      name: `Track ${id}`,
      artists: [{id: 'artist', name: 'Artist'}],
      albumName: '',
      imageUrl: '',
      spotifyUrl: '',
      playlistIndex: Number(id) + 1
    };
  }
});
