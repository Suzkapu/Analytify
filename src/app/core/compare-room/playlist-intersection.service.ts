import {Injectable} from '@angular/core';
import {CompareTrack} from './compare-room.models';

@Injectable({providedIn: 'root'})
export class PlaylistIntersectionService {
  intersect(playlists: CompareTrack[][]): CompareTrack[] {
    if (playlists.length < 2) return [];
    const remainingIds = playlists.slice(1).map(tracks => new Set(tracks.map(track => track.id)));
    const seen = new Set<string>();
    return playlists[0].filter(track => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return remainingIds.every(ids => ids.has(track.id));
    });
  }

  union(playlists: CompareTrack[][]): CompareTrack[] {
    const seen = new Set<string>();
    return playlists.flatMap(tracks => tracks).filter(track => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  }
}
