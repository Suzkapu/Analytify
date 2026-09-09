import { HttpClient, HttpContext, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import {Injectable} from '@angular/core';
import {environment} from '@env/environment';
import {firstValueFrom, fromEvent, Observable, timer} from 'rxjs';
import {takeUntil} from 'rxjs/operators';
import {
  ComparePlaylist,
  ComparePlaylistOperation,
  ComparePlaylistRecovery,
  ComparePlaylistSaveOptions,
  CompareSaveResult,
  CompareTrack
} from './compare-room.models';
import {TRANSIENT_SPOTIFY_REQUEST} from './spotify-request-context';
import {StorageService} from '@core/data-access/storage/storage.service';

@Injectable({providedIn: 'root'})
export class ParticipantSpotifyService {
  constructor(private http: HttpClient, private storage: StorageService) {}

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
    // The total is decorative and must not cost every transient participant an
    // extra Spotify request. The real count is learned if Liked Songs is selected.
    return [this.likedSongsPlaylist(0), ...playlists];
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
    tracks: CompareTrack[],
    options: ComparePlaylistSaveOptions = {}
  ): Promise<CompareSaveResult> {
    let playlist: any = null;
    let addedTracks = 0;
    const operationFingerprint = options.fingerprint || this.operationFingerprint(name, description, tracks);
    const operationId = this.stableOperationId(options.operationId || operationFingerprint);
    const markedDescription = this.withOperationMarker(description, operationId);
    let recovery: ComparePlaylistRecovery | undefined;
    try {
      const profile = options.accountId ? null : await this.get<any>('/me', accessToken);
      const accountId = String(options.accountId || profile?.id || '');
      if (!accountId) throw new Error('Spotify did not return an account ID.');

      const mapped = this.findOperationMapping(accountId, operationId);
      if (mapped && mapped.fingerprint !== operationFingerprint) {
        throw new Error('This playlist operation ID is already associated with different content.');
      }

      if (mapped) {
        playlist = {id: mapped.playlistId, external_urls: {spotify: mapped.playlistUrl}};
        recovery = {source: 'local-mapping', recovered: true};
      } else {
        playlist = await this.discoverOwnedOperationPlaylist(accessToken, accountId, operationId, options.signal);
        if (playlist) {
          recovery = {source: 'spotify-discovery', recovered: true};
          this.rememberOperationMapping(accountId, operationId, operationFingerprint, playlist);
        }
      }

      if (!playlist) {
        playlist = await this.createOperationPlaylist(accessToken, accountId, operationId, operationFingerprint,
          name, markedDescription, options.signal);
        recovery = {source: 'created', recovered: false};
      }

      try {
        addedTracks = await this.replacePlaylistTracks(accessToken, playlist.id, tracks, options.signal);
      } catch (error) {
        if (!this.isNotFound(error) || recovery?.source !== 'local-mapping') throw error;

        const stalePlaylistId = playlist.id;
        this.forgetOperationMapping(accountId, operationId);
        playlist = await this.discoverOwnedOperationPlaylist(
          accessToken, accountId, operationId, options.signal, stalePlaylistId
        );
        if (playlist) {
          recovery = {source: 'spotify-discovery', recovered: true, stalePlaylistId};
          this.rememberOperationMapping(accountId, operationId, operationFingerprint, playlist);
        } else {
          playlist = await this.createOperationPlaylist(accessToken, accountId, operationId, operationFingerprint,
            name, markedDescription, options.signal);
          recovery = {source: 'stale-mapping-recreated', recovered: true, stalePlaylistId};
        }
        addedTracks = await this.replacePlaylistTracks(accessToken, playlist.id, tracks, options.signal);
      }

      return {
        success: true,
        playlistName: name,
        playlistId: playlist.id,
        playlistUrl: playlist.external_urls?.spotify,
        addedTracks,
        operationId,
        operationFingerprint,
        recovery
      };
    } catch (error) {
      addedTracks = Number((error as any)?.addedTracks ?? addedTracks);
      return {
        success: false,
        playlistName: name,
        playlistId: playlist?.id,
        playlistUrl: playlist?.external_urls?.spotify,
        addedTracks,
        operationId,
        operationFingerprint,
        recovery,
        error: this.describeError(error)
      };
    }
  }

  private async createOperationPlaylist(
    accessToken: string,
    accountId: string,
    operationId: string,
    fingerprint: string,
    name: string,
    description: string,
    signal?: AbortSignal
  ): Promise<any> {
    const playlist = await this.post<any>('/me/playlists', accessToken, {
      name,
      description,
      public: false
    }, 0, signal);
    if (!playlist?.id) throw new Error('Spotify did not return a playlist ID.');
    // Persist this before writing tracks: if a later batch fails, the next try
    // resumes by replacing the first batch on this same playlist.
    this.rememberOperationMapping(accountId, operationId, fingerprint, playlist);
    return playlist;
  }

  private async replacePlaylistTracks(
    accessToken: string,
    playlistId: string,
    tracks: CompareTrack[],
    signal?: AbortSignal
  ): Promise<number> {
    const uris = tracks.map(track => track.uri).filter(Boolean);
    signal?.throwIfAborted();
    const firstBatch = uris.slice(0, 100);
    let addedTracks = 0;
    try {
      await this.put(`/playlists/${encodeURIComponent(playlistId)}/items`, accessToken, {uris: firstBatch}, 0, signal);
      addedTracks = firstBatch.length;
      for (let index = 100; index < uris.length; index += 100) {
        const batch = uris.slice(index, index + 100);
        signal?.throwIfAborted();
        await this.post(`/playlists/${encodeURIComponent(playlistId)}/items`, accessToken, {uris: batch}, 0, signal);
        addedTracks += batch.length;
      }
    } catch (error) {
      if (error && typeof error === 'object') Object.assign(error, {addedTracks});
      throw error;
    }
    return addedTracks;
  }

  private async discoverOwnedOperationPlaylist(
    accessToken: string,
    accountId: string,
    operationId: string,
    signal?: AbortSignal,
    excludedPlaylistId?: string
  ): Promise<any | null> {
    const marker = this.operationMarker(operationId);
    let offset = 0;
    let total = 1;
    while (offset < total) {
      signal?.throwIfAborted();
      const page = await this.get<any>(`/me/playlists?limit=50&offset=${offset}`, accessToken);
      const items = Array.isArray(page?.items) ? page.items : [];
      const match = items.find((item: any) =>
        item?.id !== excludedPlaylistId &&
        item?.owner?.id === accountId &&
        typeof item?.description === 'string' &&
        item.description.includes(marker)
      );
      if (match) return match;
      total = Number.isFinite(page?.total) ? page.total : offset + items.length;
      if (items.length === 0) break;
      offset += items.length;
    }
    return null;
  }

  private operationFingerprint(name: string, description: string, tracks: CompareTrack[]): string {
    return this.hash(JSON.stringify({name, description, uris: tracks.map(track => track.uri).filter(Boolean)}));
  }

  private stableOperationId(value: string): string {
    return this.hash(`compare-playlist:${value}`);
  }

  private operationMarker(operationId: string): string {
    return `[Analytify operation:${operationId}]`;
  }

  private withOperationMarker(description: string, operationId: string): string {
    const marker = this.operationMarker(operationId);
    const available = Math.max(0, 300 - marker.length - 1);
    const prefix = description.trim().slice(0, available);
    return prefix ? `${prefix} ${marker}` : marker;
  }

  private mappingStorageKey(accountId: string): string {
    return `compare_playlist_operations_${this.hash(accountId)}`;
  }

  private operationMappings(accountId: string): Array<{
    operationId: string;
    fingerprint: string;
    playlistId: string;
    playlistUrl?: string;
  }> {
    try {
      const parsed = JSON.parse(this.storage.getItem(this.mappingStorageKey(accountId)) || '[]');
      return Array.isArray(parsed) ? parsed.filter(entry =>
        typeof entry?.operationId === 'string' &&
        typeof entry?.fingerprint === 'string' &&
        typeof entry?.playlistId === 'string'
      ).slice(0, 20) : [];
    } catch {
      return [];
    }
  }

  private findOperationMapping(accountId: string, operationId: string) {
    return this.operationMappings(accountId).find(entry => entry.operationId === operationId);
  }

  private rememberOperationMapping(
    accountId: string,
    operationId: string,
    fingerprint: string,
    playlist: any
  ): void {
    const mappings = this.operationMappings(accountId).filter(entry => entry.operationId !== operationId);
    mappings.unshift({
      operationId,
      fingerprint,
      playlistId: playlist.id,
      playlistUrl: playlist.external_urls?.spotify
    });
    this.storage.setItem(this.mappingStorageKey(accountId), JSON.stringify(mappings.slice(0, 20)), false);
  }

  private forgetOperationMapping(accountId: string, operationId: string): void {
    const mappings = this.operationMappings(accountId).filter(entry => entry.operationId !== operationId);
    this.storage.setItem(this.mappingStorageKey(accountId), JSON.stringify(mappings), false);
  }

  private hash(value: string): string {
    let first = 2166136261;
    let second = 3339675911;
    for (let index = 0; index < value.length; index++) {
      first = Math.imul(first ^ value.charCodeAt(index), 16777619);
      second = Math.imul(second ^ value.charCodeAt(index), 2246822519);
    }
    return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
  }

  private isNotFound(error: unknown): boolean {
    return error instanceof HttpErrorResponse && error.status === 404;
  }

  async syncPlaylist(
    accessToken: string,
    existingPlaylistId: string | null,
    existingPlaylistUrl: string | null,
    name: string,
    description: string,
    tracks: CompareTrack[],
    signal?: AbortSignal,
    operation?: ComparePlaylistOperation
  ): Promise<CompareSaveResult> {
    let playlistId = existingPlaylistId;
    let playlistUrl = existingPlaylistUrl || undefined;
    let addedTracks = 0;
    const operationId = operation ? this.stableOperationId(operation.operationId) : undefined;
    const operationFingerprint = operation?.fingerprint;
    const effectiveDescription = operationId ? this.withOperationMarker(description, operationId) : description;
    let recovery: ComparePlaylistRecovery | undefined;
    try {
      if (operation && operationId) {
        const mapped = this.findOperationMapping(operation.accountId, operationId);
        if (!playlistId && mapped && mapped.fingerprint !== operation.fingerprint) {
          throw new Error('This playlist operation ID is already associated with different content.');
        }
        if (!playlistId && mapped && mapped.fingerprint === operation.fingerprint) {
          playlistId = mapped.playlistId;
          playlistUrl = mapped.playlistUrl;
          recovery = {source: 'local-mapping', recovered: true};
        } else if (!playlistId) {
          const discovered = await this.discoverOwnedOperationPlaylist(
            accessToken, operation.accountId, operationId, signal
          );
          if (discovered) {
            playlistId = discovered.id;
            playlistUrl = discovered.external_urls?.spotify;
            recovery = {source: 'spotify-discovery', recovered: true};
            this.rememberOperationMapping(
              operation.accountId, operationId, operation.fingerprint, discovered
            );
          }
        }
      }

      if (playlistId) {
        signal?.throwIfAborted();
        if (!this.hasAppliedMetadata(playlistId, name, effectiveDescription)) {
          try {
            await this.put(`/playlists/${encodeURIComponent(playlistId)}`, accessToken, {
              name,
              description: effectiveDescription,
              public: false
            }, 0, signal);
            this.rememberAppliedMetadata(playlistId, name, effectiveDescription);
          } catch (error) {
            if (!operation || !operationId || !this.isNotFound(error)) throw error;
            const stalePlaylistId = playlistId;
            this.forgetOperationMapping(operation.accountId, operationId);
            const discovered = await this.discoverOwnedOperationPlaylist(
              accessToken, operation.accountId, operationId, signal, stalePlaylistId
            );
            if (discovered) {
              playlistId = discovered.id;
              playlistUrl = discovered.external_urls?.spotify;
              recovery = {source: 'spotify-discovery', recovered: true, stalePlaylistId};
              this.rememberOperationMapping(
                operation.accountId, operationId, operation.fingerprint, discovered
              );
            } else {
              const created = await this.createOperationPlaylist(
                accessToken, operation.accountId, operationId, operation.fingerprint,
                name, effectiveDescription, signal
              );
              playlistId = created.id;
              playlistUrl = created.external_urls?.spotify;
              recovery = {source: 'stale-mapping-recreated', recovered: true, stalePlaylistId};
            }
          }
        }
      } else {
        const playlist = await this.post<any>('/me/playlists', accessToken, {
          name,
          description: effectiveDescription,
          public: false
        }, 0, signal);
        playlistId = playlist.id;
        playlistUrl = playlist.external_urls?.spotify;
        if (playlistId) {
          this.rememberAppliedMetadata(playlistId, name, effectiveDescription);
          if (operation && operationId) {
            this.rememberOperationMapping(operation.accountId, operationId, operation.fingerprint, playlist);
            recovery = {source: 'created', recovered: false};
          }
        }
      }

      if (!playlistId) throw new Error('Spotify did not return a playlist ID.');
      try {
        addedTracks = await this.replacePlaylistTracks(accessToken, playlistId!, tracks, signal);
      } catch (error) {
        if (!operation || !operationId || !this.isNotFound(error) || recovery?.source !== 'local-mapping') {
          throw error;
        }
        const stalePlaylistId = playlistId;
        this.forgetOperationMapping(operation.accountId, operationId);
        const discovered = await this.discoverOwnedOperationPlaylist(
          accessToken, operation.accountId, operationId, signal, stalePlaylistId
        );
        if (discovered) {
          playlistId = discovered.id;
          playlistUrl = discovered.external_urls?.spotify;
          recovery = {source: 'spotify-discovery', recovered: true, stalePlaylistId};
          this.rememberOperationMapping(operation.accountId, operationId, operation.fingerprint, discovered);
        } else {
          const created = await this.createOperationPlaylist(
            accessToken, operation.accountId, operationId, operation.fingerprint,
            name, effectiveDescription, signal
          );
          playlistId = created.id;
          playlistUrl = created.external_urls?.spotify;
          recovery = {source: 'stale-mapping-recreated', recovered: true, stalePlaylistId};
        }
        addedTracks = await this.replacePlaylistTracks(accessToken, playlistId!, tracks, signal);
      }
      if (operation && operationId) {
        this.rememberOperationMapping(operation.accountId, operationId, operation.fingerprint, {
          id: playlistId,
          external_urls: {spotify: playlistUrl}
        });
      }
      return {
        success: true,
        playlistName: name,
        playlistId: playlistId || undefined,
        playlistUrl,
        addedTracks,
        operationId,
        operationFingerprint,
        recovery
      };
    } catch (error) {
      addedTracks = Number((error as any)?.addedTracks ?? addedTracks);
      return {
        success: false,
        playlistName: name,
        playlistId: playlistId || undefined,
        playlistUrl,
        addedTracks,
        operationId,
        operationFingerprint,
        recovery,
        error: this.describeError(error)
      };
    }
  }

  private hasAppliedMetadata(playlistId: string, name: string, description: string): boolean {
    return this.storage.getItem(this.metadataCacheKey(playlistId)) === this.metadataSignature(name, description);
  }

  private rememberAppliedMetadata(playlistId: string, name: string, description: string): void {
    this.storage.setItem(
      this.metadataCacheKey(playlistId),
      this.metadataSignature(name, description),
      false
    );
  }

  private metadataSignature(name: string, description: string): string {
    const value = JSON.stringify({name, description});
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  private metadataCacheKey(playlistId: string): string {
    return `spotify_playlist_${playlistId}_applied_metadata`;
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
      description: playlist.description || '',
      imageUrl: playlist.images?.[0]?.url || '',
      total: Number(playlist.items?.total ?? playlist.tracks?.total ?? 0),
      ownerName: playlist.owner?.display_name || playlist.owner?.id || '',
      snapshotId: playlist.snapshot_id || undefined
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
      playlistIndex: Number(track.playlist_index || index + 1),
      durationMs: Number(track.duration_ms || 0),
      explicit: !!track.explicit,
      releaseDate: track.album?.release_date || ''
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

  private async post<T>(
    path: string, accessToken: string, body: any, attempt = 0, signal?: AbortSignal
  ): Promise<T> {
    try {
      const request = this.withAbort(
        this.http.post<T>(`${environment.spotifyUrl}${path}`, body, this.options(accessToken)),
        signal
      );
      return await firstValueFrom(request);
    } catch (error) {
      return this.retry<T>(() => this.post<T>(path, accessToken, body, attempt + 1, signal), error, attempt, signal);
    }
  }

  private async put<T>(
    path: string, accessToken: string, body: any, attempt = 0, signal?: AbortSignal
  ): Promise<T> {
    try {
      const request = this.withAbort(
        this.http.put<T>(`${environment.spotifyUrl}${path}`, body, this.options(accessToken)),
        signal
      );
      return await firstValueFrom(request);
    } catch (error) {
      return this.retry<T>(() => this.put<T>(path, accessToken, body, attempt + 1, signal), error, attempt, signal);
    }
  }

  private withAbort<T>(request: Observable<T>, signal?: AbortSignal): Observable<T> {
    if (!signal) return request;
    signal.throwIfAborted();
    return request.pipe(takeUntil(fromEvent(signal, 'abort')));
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

  private async retry<T>(
    operation: () => Promise<T>,
    error: unknown,
    attempt: number,
    signal?: AbortSignal
  ): Promise<T> {
    if (!(error instanceof HttpErrorResponse) || error.status !== 429 || attempt >= 3) {
      throw error;
    }
    const retryAfter = Math.max(1, Number(error.headers.get('Retry-After') || 2));
    await firstValueFrom(this.withAbort(timer(retryAfter * 1000), signal));
    return operation();
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      return error.error?.error?.message || error.error?.message || `Spotify returned ${error.status}.`;
    }
    return error instanceof Error ? error.message : 'An unexpected Spotify error occurred.';
  }
}
