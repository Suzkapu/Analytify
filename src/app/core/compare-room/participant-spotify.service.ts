import {HttpClient, HttpContext, HttpErrorResponse, HttpHeaders} from '@angular/common/http';
import {Injectable} from '@angular/core';
import {environment} from '@env/environment';
import {firstValueFrom, timer} from 'rxjs';
import {ComparePlaylist, CompareSaveResult, CompareTrack} from './compare-room.models';
import {TRANSIENT_SPOTIFY_REQUEST} from './spotify-request-context';

@Injectable({providedIn: 'root'})
export class ParticipantSpotifyService {
  constructor(private http: HttpClient) {}

  async getProfile(accessToken: string): Promise<any> {
    return this.get<any>('/me', accessToken);
  }

  async getPlaylists(accessToken: string, spotifyUserId: string): Promise<ComparePlaylist[]> {
    const items: any[] = [];
    let offset = 0;
    let total = 1;
    while (offset < total) {
      const page = await this.get<any>(`/me/playlists?limit=50&offset=${offset}`, accessToken);
      const pageItems = Array.isArray(page?.items) ? page.items : [];
      items.push(...pageItems);
      total = Number.isFinite(page?.total) ? page.total : items.length;
      if (pageItems.length === 0) break;
      offset += pageItems.length;
    }

    const playlists = items
      .filter(playlist => playlist?.owner?.id === spotifyUserId || playlist?.collaborative === true)
      .map(playlist => this.normalizePlaylist(playlist));
    let likedTotal = 0;
    try {
      const likedPage = await this.get<any>('/me/tracks?limit=1&offset=0', accessToken);
      likedTotal = Number(likedPage?.total || 0);
    } catch {
      // Liked Songs remains selectable even when Spotify cannot provide its count.
    }
    return [this.likedSongsPlaylist(likedTotal), ...playlists];
  }

  async getPlaylistTracks(playlist: ComparePlaylist, accessToken: string): Promise<CompareTrack[]> {
    const tracks: CompareTrack[] = [];
    let offset = 0;
    let total = 1;
    while (offset < total) {
      const endpoint = playlist.isLikedSongs
        ? `/me/tracks?limit=50&offset=${offset}`
        : `/playlists/${encodeURIComponent(playlist.id)}/items?limit=50&offset=${offset}`;
      const page = await this.get<any>(endpoint, accessToken);
      const pageItems = Array.isArray(page?.items) ? page.items : [];
      pageItems.forEach((entry: any, index: number) => {
        const normalized = this.normalizeTrack(entry, offset + index);
        if (normalized) tracks.push(normalized);
      });
      total = Number.isFinite(page?.total) ? page.total : tracks.length;
      if (pageItems.length === 0) break;
      offset += pageItems.length;
    }
    return this.deduplicate(tracks);
  }

  async createPlaylist(
    accessToken: string,
    name: string,
    description: string,
    tracks: CompareTrack[]
  ): Promise<CompareSaveResult> {
    let playlist: any = null;
    let addedTracks = 0;
    try {
      playlist = await this.post<any>('/me/playlists', accessToken, {
        name,
        description,
        public: false
      });
      const uris = tracks.map(track => track.uri).filter(Boolean);
      for (let index = 0; index < uris.length; index += 100) {
        const batch = uris.slice(index, index + 100);
        await this.post(`/playlists/${encodeURIComponent(playlist.id)}/items`, accessToken, {uris: batch});
        addedTracks += batch.length;
      }
      return {
        success: true,
        playlistName: name,
        playlistId: playlist.id,
        playlistUrl: playlist.external_urls?.spotify,
        addedTracks
      };
    } catch (error) {
      return {
        success: false,
        playlistName: name,
        playlistId: playlist?.id,
        playlistUrl: playlist?.external_urls?.spotify,
        addedTracks,
        error: this.describeError(error)
      };
    }
  }

  normalizeCachedTracks(artists: any[]): CompareTrack[] {
    const tracks: CompareTrack[] = [];
    artists.forEach(artist => {
      (artist?.tracks || []).forEach((track: any) => {
        const normalized = this.normalizeTrack({track}, Math.max(0, (track?.playlist_index || 1) - 1));
        if (normalized) tracks.push(normalized);
      });
    });
    return this.deduplicate(tracks).sort((a, b) => a.playlistIndex - b.playlistIndex);
  }

  normalizeCachedPlaylists(playlists: any[]): ComparePlaylist[] {
    return playlists.map(playlist => playlist?.id === 'fav'
      ? this.likedSongsPlaylist(Number(playlist?.tracks?.total || 0))
      : this.normalizePlaylist(playlist));
  }

  private normalizePlaylist(playlist: any): ComparePlaylist {
    return {
      id: playlist.id,
      name: playlist.name || 'Untitled playlist',
      imageUrl: playlist.images?.[0]?.url || '',
      total: Number(playlist.items?.total ?? playlist.tracks?.total ?? 0),
      ownerName: playlist.owner?.display_name || playlist.owner?.id || ''
    };
  }

  private likedSongsPlaylist(total = 0): ComparePlaylist {
    return {
      id: 'fav',
      name: 'Liked Songs',
      imageUrl: 'https://misc.scdn.co/liked-songs/liked-songs-300.png',
      total,
      ownerName: 'Spotify',
      isLikedSongs: true
    };
  }

  private normalizeTrack(entry: any, index: number): CompareTrack | null {
    const track = entry?.item || entry?.track;
    // Analytify's persistent playlist cache stores the Spotify ID but omits
    // the redundant URI. Reconstructing the canonical URI lets the main
    // participant reuse large cached playlists without downloading them again.
    if (!track?.id || track?.type === 'episode') return null;
    const artists = (track.artists || [])
      .filter((artist: any) => artist?.id && artist?.name)
      .map((artist: any) => ({id: artist.id, name: artist.name}));
    if (!track.name || artists.length === 0) return null;
    return {
      id: track.id,
      uri: track.uri || `spotify:track:${track.id}`,
      name: track.name,
      artists,
      albumName: track.album?.name || '',
      imageUrl: track.album?.images?.[0]?.url || '',
      spotifyUrl: track.external_urls?.spotify || '',
      playlistIndex: Number(track.playlist_index || index + 1)
    };
  }

  private deduplicate(tracks: CompareTrack[]): CompareTrack[] {
    const seen = new Set<string>();
    return tracks.filter(track => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
  }

  private async get<T>(path: string, accessToken: string, attempt = 0): Promise<T> {
    try {
      return await firstValueFrom(this.http.get<T>(`${environment.spotifyUrl}${path}`, this.options(accessToken)));
    } catch (error) {
      return this.retry<T>(() => this.get<T>(path, accessToken, attempt + 1), error, attempt);
    }
  }

  private async post<T>(path: string, accessToken: string, body: any, attempt = 0): Promise<T> {
    try {
      return await firstValueFrom(this.http.post<T>(`${environment.spotifyUrl}${path}`, body, this.options(accessToken)));
    } catch (error) {
      return this.retry<T>(() => this.post<T>(path, accessToken, body, attempt + 1), error, attempt);
    }
  }

  private options(accessToken: string) {
    return {
      headers: new HttpHeaders({
        Authorization: `Bearer ${accessToken}`,
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8'
      }),
      context: new HttpContext().set(TRANSIENT_SPOTIFY_REQUEST, true)
    };
  }

  private async retry<T>(operation: () => Promise<T>, error: unknown, attempt: number): Promise<T> {
    if (!(error instanceof HttpErrorResponse) || error.status !== 429 || attempt >= 3) {
      throw error;
    }
    const retryAfter = Math.max(1, Number(error.headers.get('Retry-After') || 2));
    await firstValueFrom(timer(retryAfter * 1000));
    return operation();
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.error?.message || error.error?.message || `Spotify returned ${error.status}.`;
    }
    return error instanceof Error ? error.message : 'An unexpected Spotify error occurred.';
  }
}
