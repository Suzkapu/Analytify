import {TestBed} from '@angular/core/testing';
import {CompareTrack} from './compare-room.models';
import {PlaylistIntersectionService} from './playlist-intersection.service';

describe('PlaylistIntersectionService', () => {
  let service: PlaylistIntersectionService;

  beforeEach(() => {
    TestBed.configureTestingModule({providers: [PlaylistIntersectionService]});
    service = TestBed.inject(PlaylistIntersectionService);
  });

  it('keeps only tracks present in every participant playlist', () => {
    expect(service.intersect([
      [track('a'), track('b'), track('c')],
      [track('b'), track('c'), track('d')],
      [track('c'), track('b'), track('e')]
    ]).map(item => item.id)).toEqual(['b', 'c']);
  });

  it('deduplicates repeated tracks and preserves the first playlist order', () => {
    expect(service.intersect([
      [track('b'), track('a'), track('b')],
      [track('a'), track('b')]
    ]).map(item => item.id)).toEqual(['b', 'a']);
  });

  it('returns an empty result until at least two playlists are present', () => {
    expect(service.intersect([])).toEqual([]);
    expect(service.intersect([[track('a')]])).toEqual([]);
  });

  it('combines all tracks without duplicates while preserving participant and playlist order', () => {
    expect(service.union([
      [track('a'), track('b'), track('a')],
      [track('b'), track('c')],
      [track('d')]
    ]).map(item => item.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  function track(id: string): CompareTrack {
    return {
      id,
      uri: `spotify:track:${id}`,
      name: id,
      artists: [{id: 'artist', name: 'Artist'}],
      albumName: '',
      imageUrl: '',
      spotifyUrl: '',
      playlistIndex: 1
    };
  }
});
