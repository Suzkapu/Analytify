import {HttpClientTestingModule, HttpTestingController} from '@angular/common/http/testing';
import {TestBed} from '@angular/core/testing';
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

  it('lists Liked Songs plus owned and collaborative playlists only', async () => {
    const resultPromise = service.getPlaylists('guest-token', 'me');
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
    const liked = http.expectOne(`${environment.spotifyUrl}/me/tracks?limit=1&offset=0`);
    liked.flush({total: 42, items: []});

    const result = await resultPromise;
    expect(result.map(item => item.id)).toEqual(['fav', 'owned', 'collab']);
    expect(result[0].total).toBe(42);
  });

  it('creates a private playlist and adds tracks in batches of one hundred', async () => {
    const tracks = Array.from({length: 205}, (_, index) => track(`${index}`));
    const resultPromise = service.createPlaylist('guest-token', 'Shared songs', 'Description', tracks);

    const create = http.expectOne(`${environment.spotifyUrl}/me/playlists`);
    expect(create.request.body.public).toBeFalse();
    create.flush({id: 'new-playlist', external_urls: {spotify: 'https://open.spotify.com/playlist/new'}});
    await Promise.resolve();

    for (const expectedSize of [100, 100, 5]) {
      const add = http.expectOne(`${environment.spotifyUrl}/playlists/new-playlist/items`);
      expect(add.request.body.uris.length).toBe(expectedSize);
      add.flush({snapshot_id: 'snapshot'});
      await Promise.resolve();
    }

    const result = await resultPromise;
    expect(result.success).toBeTrue();
    expect(result.addedTracks).toBe(205);
    expect(result.playlistUrl).toContain('/new');
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
