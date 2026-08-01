import { Injectable } from '@angular/core';
import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { BehaviorSubject, Subscription, timer } from 'rxjs';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';

export interface PlaylistLoadProgress {
  playlistId: string;
  playlistName: string;
  artists: any[];
  totalTracks: number;
  loadedTracksCount: number;
  loadedArtistsDetailsCount: number;
  totalUniqueArtists: number;
  isLoadingTracks: boolean;
  isLoadingArtists: boolean;
  isRefreshing: boolean;
  isComplete: boolean;
  error: any;
  cooldownMessage: string;
}

export type PlaylistLoadMode = 'full' | 'incremental-new-only';

export class PlaylistLoadTask {
  playlistId: string;
  playlistName: string = '';
  artists: any[] = [];
  totalTracks: number = 0;
  loadedTracksCount: number = 0;
  loadedArtistsDetailsCount: number = 0;
  totalUniqueArtists: number = 0;
  isLoadingTracks: boolean = false;
  isLoadingArtists: boolean = false;
  isRefreshing: boolean = false;
  isComplete: boolean = false;
  error: any = null;
  cooldownMessage: string = '';
  mode: PlaylistLoadMode;
  hasDataChanges: boolean = false;

  trackIndexCounter: number = 0;
  requestedArtistIds = new Set<string>();
  completedArtistIds = new Set<string>();
  artistFetchAttempts = new Map<string, number>();
  refreshingArtists: any[] = [];
  private activeSub = new Subscription();
  
  progress$ = new BehaviorSubject<PlaylistLoadProgress>(this.getProgress());

  constructor(playlistId: string, mode: PlaylistLoadMode = 'full') {
    this.playlistId = playlistId;
    this.mode = mode;
  }

  addSub(sub: Subscription) {
    this.activeSub.add(sub);
  }

  cancel() {
    this.activeSub.unsubscribe();
  }

  getProgress(): PlaylistLoadProgress {
    return {
      playlistId: this.playlistId,
      playlistName: this.playlistName,
      artists: this.artists,
      totalTracks: this.totalTracks,
      loadedTracksCount: this.loadedTracksCount,
      loadedArtistsDetailsCount: this.loadedArtistsDetailsCount,
      totalUniqueArtists: this.totalUniqueArtists,
      isLoadingTracks: this.isLoadingTracks,
      isLoadingArtists: this.isLoadingArtists,
      isRefreshing: this.isRefreshing,
      isComplete: this.isComplete,
      error: this.error,
      cooldownMessage: this.cooldownMessage
    };
  }

  emitUpdate() {
    this.progress$.next(this.getProgress());
  }
}

@Injectable({
  providedIn: 'root'
})
export class PlaylistLoaderService {
  private tasks = new Map<string, PlaylistLoadTask>();
  private incrementalChecksThisSession = new Set<string>();

  constructor(
    private spotifyDataService: SpotifyDataService,
    private storageService: StorageService,
    private authService: SpotifyAuthService,
    private supabaseService: SupabaseService,
    private playlistSharingService: PlaylistSharingService
  ) {
    this.authService.logout$.subscribe(() => {
      this.clearAllTasks();
    });
  }

  getLoadingTask(playlistId: string): PlaylistLoadTask | undefined {
    return this.tasks.get(playlistId);
  }

  startLoadingTask(userId: string, playlistId: string, isBackgroundRefresh: boolean = false, isDailyFullSync: boolean = false): PlaylistLoadTask {
    let task = this.tasks.get(playlistId);
    if (task) {
      return task;
    }

    task = new PlaylistLoadTask(playlistId);
    this.tasks.set(playlistId, task);
    if (playlistId === 'fav') {
      this.incrementalChecksThisSession.add(`${userId}_${playlistId}`);
    }
    this.triggerApiLoad(task, userId, isBackgroundRefresh, isDailyFullSync);
    return task;
  }

  startNewFavouriteTracksCheck(userId: string): PlaylistLoadTask | null {
    const playlistId = 'fav';
    const existingTask = this.tasks.get(playlistId);
    if (existingTask) {
      return existingTask;
    }

    const sessionKey = `${userId}_${playlistId}`;
    if (this.incrementalChecksThisSession.has(sessionKey)) {
      return null;
    }

    const storedArtists = this.storageService.getItem(sessionKey);
    if (!storedArtists) {
      return null;
    }

    try {
      const parsedArtists = JSON.parse(storedArtists);
      if (!Array.isArray(parsedArtists) || parsedArtists.length === 0) {
        return null;
      }
    } catch {
      return null;
    }

    this.incrementalChecksThisSession.add(sessionKey);
    const task = new PlaylistLoadTask(playlistId, 'incremental-new-only');
    this.tasks.set(playlistId, task);
    this.triggerApiLoad(task, userId, true, false);
    return task;
  }

  clearLoadingTask(playlistId: string) {
    const task = this.tasks.get(playlistId);
    if (task) {
      task.cancel();
      this.tasks.delete(playlistId);
    }
  }

  clearAllTasks() {
    this.tasks.forEach(task => task.cancel());
    this.tasks.clear();
    this.incrementalChecksThisSession.clear();
  }

  private triggerApiLoad(task: PlaylistLoadTask, userId: string, isBackgroundRefresh: boolean, isDailyFullSync: boolean = false) {
    console.log(
      task.mode === 'incremental-new-only'
        ? `[PlaylistLoaderService] Starting incremental Spotify check for playlist ${task.playlistId}.`
        : `[PlaylistLoaderService] Starting full Spotify sync for playlist ${task.playlistId}.`
    );
    task.requestedArtistIds.clear();
    task.completedArtistIds.clear();
    task.artistFetchAttempts.clear();
    task.loadedArtistsDetailsCount = 0;
    task.totalUniqueArtists = 0;

    const storedArtists = this.storageService.getItem(`${userId}_${task.playlistId}`);
    let cachedArtists: any[] = [];
    if (storedArtists) {
      try {
        const parsedArtists = JSON.parse(storedArtists);
        cachedArtists = Array.isArray(parsedArtists) ? parsedArtists : [];
      } catch (e) {}
    }

    if (task.mode === 'full' && isDailyFullSync) {
      console.log(
        `[PlaylistLoaderService] Running the daily full sync for playlist ${task.playlistId}; ` +
        'cached tracks will not be reused so removals are reconciled.'
      );
    }

    if (task.mode === 'incremental-new-only') {
      cachedArtists.forEach(artist => {
        if (artist?.id && Array.isArray(artist.images) && artist.images.length > 0) {
          task.requestedArtistIds.add(artist.id);
          task.completedArtistIds.add(artist.id);
        }
      });
    }

    let targetArray: any[];
    
    if (isBackgroundRefresh) {
      task.isRefreshing = true;
      task.isLoadingTracks = true;
      task.isLoadingArtists = true;
      task.refreshingArtists = [];
      targetArray = task.refreshingArtists;
      task.totalTracks = this.readStoredNumber(`${userId}_${task.playlistId}_Amount`);
      task.playlistName = this.readStoredString(`${userId}_${task.playlistId}_Name`);
      if (storedArtists) {
        try {
          const parsedArtists = JSON.parse(storedArtists);
          task.artists = Array.isArray(parsedArtists) ? parsedArtists : [];
        } catch (e) {}
      }
      task.trackIndexCounter = 0;
    } else {
      task.isRefreshing = false;
      task.isLoadingTracks = true;
      task.isLoadingArtists = true;
      task.artists = [];
      targetArray = task.artists;
      task.trackIndexCounter = 0;
    }
    
    task.loadedTracksCount = 0;
    task.emitUpdate();

    if (task.mode === 'incremental-new-only') {
      console.log('[PlaylistLoaderService] Checking Spotify only for newly saved tracks until the first cached track.');
      this.loadNewFavouriteTracksOnly(task, userId, 0, 50, cachedArtists, targetArray, []);
    } else {
      if (task.playlistId === 'fav') {
        task.playlistName = 'Favourite Tracks';
        task.emitUpdate();
        const sub = this.spotifyDataService.getFavTracks(0, 50).subscribe({
          next: (tracks: any) => {
            task.totalTracks = tracks.total;
            const firstPageItems = tracks.items || [];
            this.getArtistsFromTracks(task, firstPageItems, targetArray);
            task.loadedTracksCount = Math.min(firstPageItems.length, task.totalTracks);
            task.emitUpdate();

            if (task.loadedTracksCount < task.totalTracks) {
              this.loadRemainingTracks(
                task,
                userId,
                task.loadedTracksCount,
                50,
                task.totalTracks,
                targetArray,
                cachedArtists
              );
            } else {
              this.finishTrackLoading(task, targetArray, cachedArtists, userId);
            }
          },
          error: (err) => {
            console.error('Failed to load first page of favourite tracks:', err);
            this.failTask(task, err);
          }
        });
        task.addSub(sub);
      } else {
        const sub = this.spotifyDataService.getSinglePlaylist(task.playlistId).subscribe({
          next: (playlist: any) => {
            task.playlistName = playlist.name;
            task.totalTracks = playlist.tracks.total;
            task.emitUpdate();

            const firstPageItems = playlist.tracks.items || [];
            this.getArtistsFromTracks(task, firstPageItems, targetArray, 0);
            task.loadedTracksCount = Math.min(firstPageItems.length, task.totalTracks);
            task.emitUpdate();
            if (task.loadedTracksCount < task.totalTracks) {
              this.loadRemainingTracks(
                task,
                userId,
                task.loadedTracksCount,
                100,
                task.totalTracks,
                targetArray,
                cachedArtists
              );
            } else {
              this.finishTrackLoading(task, targetArray, cachedArtists, userId);
            }
          },
          error: (err) => {
            console.error('Failed to load first page of playlist:', err);
            this.failTask(task, err);
          }
        });
        task.addSub(sub);
      }
    }
  }

  private loadRemainingTracks(
    task: PlaylistLoadTask,
    userId: string,
    offset: number,
    limit: number,
    total: number,
    targetArray: any[],
    cachedArtists: any[]
  ) {
    if (task.playlistId === 'fav') {
      const sub = this.spotifyDataService.getFavTracks(offset, limit).subscribe({
        next: (tracks: any) => {
          const pageItems = tracks.items || [];
          if (pageItems.length === 0 && offset < total) {
            this.failTask(task, new Error(`Spotify returned an empty favourite-tracks page at offset ${offset}.`));
            return;
          }
          this.getArtistsFromTracks(task, pageItems, targetArray, offset);
          task.loadedTracksCount = Math.min(offset + pageItems.length, total);
          task.emitUpdate();
          
          if (task.loadedTracksCount < total) {
            this.loadRemainingTracks(task, userId, task.loadedTracksCount, limit, total, targetArray, cachedArtists);
          } else {
            this.finishTrackLoading(task, targetArray, cachedArtists, userId);
          }
        },
        error: (err) => {
          console.error('Error loading remaining fav tracks:', err);
          this.failTask(task, err);
        }
      });
      task.addSub(sub);
    } else {
      const sub = this.spotifyDataService.getAllTracksFromPlaylist(task.playlistId, offset, limit).subscribe({
        next: (tracks: any) => {
          const pageItems = tracks.items || [];
          if (pageItems.length === 0 && offset < total) {
            this.failTask(task, new Error(`Spotify returned an empty playlist page at offset ${offset}.`));
            return;
          }
          this.getArtistsFromTracks(task, pageItems, targetArray, offset);
          task.loadedTracksCount = Math.min(offset + pageItems.length, total);
          task.emitUpdate();
          
          if (task.loadedTracksCount < total) {
            this.loadRemainingTracks(task, userId, task.loadedTracksCount, limit, total, targetArray, cachedArtists);
          } else {
            this.finishTrackLoading(task, targetArray, cachedArtists, userId);
          }
        },
        error: (err) => {
          console.error('Error loading remaining playlist tracks:', err);
          this.failTask(task, err);
        }
      });
      task.addSub(sub);
    }
  }

  private loadNewFavouriteTracksOnly(
    task: PlaylistLoadTask,
    userId: string,
    offset: number,
    limit: number,
    cachedArtists: any[],
    targetArray: any[],
    newItems: any[]
  ) {
    const cachedTrackIds = new Set<string>();
    cachedArtists.forEach(artist => {
      (artist?.tracks || []).forEach((track: any) => {
        if (track?.id) {
          cachedTrackIds.add(track.id);
        }
      });
    });

    const collectedTrackIds = new Set<string>(
      newItems
        .map(item => item?.track?.id)
        .filter((id: string | undefined): id is string => !!id)
    );

    const sub = this.spotifyDataService.getFavTracks(offset, limit).subscribe({
      next: (tracks: any) => {
        const items = tracks?.items || [];
        const firstCachedIndex = items.findIndex((item: any) =>
          !!item?.track?.id && cachedTrackIds.has(item.track.id)
        );
        const candidates = firstCachedIndex >= 0
          ? items.slice(0, firstCachedIndex)
          : items;

        candidates.forEach((item: any) => {
          const track = item?.track;
          const hasValidArtist = (track?.artists || []).some((artist: any) =>
            typeof artist?.name === 'string' && artist.name.trim() !== ''
          );
          if (
            track?.id &&
            typeof track.name === 'string' &&
            track.name.trim() !== '' &&
            hasValidArtist &&
            !cachedTrackIds.has(track.id) &&
            !collectedTrackIds.has(track.id)
          ) {
            collectedTrackIds.add(track.id);
            newItems.push(item);
          }
        });

        const reachedKnownTrack = firstCachedIndex >= 0;
        const reachedEnd = offset + items.length >= (tracks?.total || 0) || items.length === 0;

        if (!reachedKnownTrack && !reachedEnd) {
          this.loadNewFavouriteTracksOnly(
            task,
            userId,
            offset + items.length,
            limit,
            cachedArtists,
            targetArray,
            newItems
          );
          return;
        }

        this.getArtistsFromTracks(task, newItems, targetArray, 0);
        task.hasDataChanges = newItems.length > 0;

        // Incremental checks only add. Cached tracks are deliberately kept even
        // when Spotify no longer returns them; the daily full sync owns removals.
        this.mergeCachedArtists(
          task,
          cachedArtists,
          targetArray,
          undefined,
          newItems.length,
          true
        );

        const cachedTrackCount = this.countUniqueTracks(targetArray);
        task.totalTracks =
          Number.isFinite(tracks?.total) && tracks.total >= 0
            ? tracks.total
            : cachedTrackCount;
        task.loadedTracksCount = cachedTrackCount;
        task.isLoadingTracks = false;
        task.emitUpdate();
        this.fetchArtistDetailsLazy(task, targetArray, userId);
        this.checkCompletion(task, userId);
      },
      error: (err) => {
        console.warn('[PlaylistLoaderService] New favourite tracks check failed; keeping the cached playlist unchanged.', err);
        this.failTask(task, err);
      }
    });
    task.addSub(sub);
  }

  private mergeCachedArtists(
    task: PlaylistLoadTask,
    cachedArtists: any[],
    targetArray: any[],
    minPlaylistIndex?: number,
    shift: number = 0,
    mergeTracks: boolean = true
  ) {
    cachedArtists.forEach(cachedArtist => {
      let existingArtist = targetArray.find(a => a.id === cachedArtist.id);
      
      if (mergeTracks) {
        const tracksToMerge = cachedArtist.tracks || [];
        const filteredTracks = minPlaylistIndex !== undefined
          ? tracksToMerge.filter((t: any) => t.playlist_index >= minPlaylistIndex)
          : tracksToMerge;

        const mappedTracks = filteredTracks.map((t: any) => ({
          ...t,
          playlist_index: t.playlist_index ? t.playlist_index + shift : t.playlist_index
        }));

        if (mappedTracks.length > 0) {
          if (!existingArtist) {
            targetArray.push({
              ...cachedArtist,
              tracks: [...mappedTracks]
            });
          } else {
            if (!existingArtist.tracks) {
              existingArtist.tracks = [];
            }
            mappedTracks.forEach((track: any) => {
              let hasTrack = existingArtist.tracks.some((t: any) => t.id === track.id);
              if (!hasTrack) {
                existingArtist.tracks.push(track);
              }
            });
            if (
              (!Array.isArray(existingArtist.images) || existingArtist.images.length === 0) &&
              Array.isArray(cachedArtist.images) &&
              cachedArtist.images.length > 0
            ) {
              existingArtist.images = cachedArtist.images;
            }
          }
        }
      } else {
        if (existingArtist) {
          if (
            (!Array.isArray(existingArtist.images) || existingArtist.images.length === 0) &&
            Array.isArray(cachedArtist.images) &&
            cachedArtist.images.length > 0
          ) {
            existingArtist.images = cachedArtist.images;
          }
        }
      }

    });
    task.totalUniqueArtists = targetArray.length;
    task.emitUpdate();
  }

  countUniqueTracks(artists: any[]): number {
    const trackIds = new Set<string>();
    artists.forEach(artist => {
      (artist?.tracks || []).forEach((track: any) => {
        if (track?.id) {
          trackIds.add(track.id);
        }
      });
    });
    return trackIds.size;
  }

  /**
   * Validates that a serialized playlist cache was written as one complete
   * dataset. New caches carry their exact unique-track count. Legacy caches
   * fall back to a tolerant comparison because Spotify's source total can
   * include local, unavailable, or duplicate entries that are not represented
   * separately by the artist aggregation.
   */
  isCachedPlaylistComplete(
    artists: any[],
    expectedTotal: number,
    storedCachedTrackCount: number | null
  ): boolean {
    if (!Array.isArray(artists)) return false;

    const actualCachedTrackCount = this.countUniqueTracks(artists);
    if (
      storedCachedTrackCount !== null &&
      actualCachedTrackCount !== storedCachedTrackCount
    ) {
      return false;
    }

    if (!Number.isFinite(expectedTotal) || expectedTotal < 0) return false;
    if (expectedTotal === 0) return actualCachedTrackCount === 0;

    const toleratedMissingEntries = Math.max(5, Math.ceil(expectedTotal * 0.02));
    return actualCachedTrackCount + toleratedMissingEntries >= expectedTotal;
  }

  /**
   * Uses the largest known source total. This lets an independently refreshed
   * playlist-list cache expose an old partial detail cache whose own amount
   * was incorrectly saved as the number loaded so far.
   */
  resolveExpectedPlaylistTotal(
    userId: string,
    playlistId: string,
    cachedDetailTotal: number
  ): number {
    const totals = [
      Number.isFinite(cachedDetailTotal) && cachedDetailTotal >= 0
        ? cachedDetailTotal
        : 0
    ];

    if (playlistId === 'fav') {
      totals.push(this.readStoredNumber(`${userId}_fav_Amount`));
    }

    try {
      const playlistCache = JSON.parse(
        this.storageService.getItem(`${userId}_playlists`) || '[]'
      );
      if (Array.isArray(playlistCache)) {
        const playlist = playlistCache.find(item => item?.id === playlistId);
        const playlistTotal = playlist?.tracks?.total;
        if (Number.isFinite(playlistTotal) && playlistTotal >= 0) {
          totals.push(playlistTotal);
        }
      }
    } catch {
      // A malformed list cache must not make an otherwise valid detail cache unusable.
    }

    return Math.max(...totals);
  }

  private readStoredNumber(key: string): number {
    try {
      const parsed = JSON.parse(this.storageService.getItem(key) || '0');
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    } catch {
      return 0;
    }
  }

  private readStoredString(key: string): string {
    try {
      const parsed = JSON.parse(this.storageService.getItem(key) || '""');
      return typeof parsed === 'string' ? parsed : '';
    } catch {
      return '';
    }
  }

  /**
   * Track data is the primary playlist payload. Publish and persist it as soon
   * as pagination finishes; artist images are optional enrichment and must not
   * keep a complete refresh hidden behind the old cache.
   */
  private finishTrackLoading(
    task: PlaylistLoadTask,
    targetArray: any[],
    cachedArtists: any[],
    userId: string
  ) {
    this.mergeCachedArtists(task, cachedArtists, targetArray, undefined, 0, false);

    task.artists = targetArray;
    task.isRefreshing = false;
    task.isLoadingTracks = false;
    task.hasDataChanges = true;

    targetArray.forEach(artist => {
      if (artist?.id && Array.isArray(artist.images) && artist.images.length > 0) {
        task.completedArtistIds.add(artist.id);
      }
    });
    task.loadedArtistsDetailsCount = task.completedArtistIds.size;

    // A full track set is already a valid cache even while optional artist
    // profiles continue to fill in. This also repairs an incomplete cloud copy.
    this.setSessionStorage(task, userId, task.mode === 'full');
    task.emitUpdate();

    void this.hydrateArtistDetailsFromSupabase(task, targetArray, userId);
  }

  private async hydrateArtistDetailsFromSupabase(
    task: PlaylistLoadTask,
    targetArray: any[],
    userId: string
  ) {
    const missingIds = targetArray
      .filter(artist =>
        artist?.id &&
        (!Array.isArray(artist.images) || artist.images.length === 0)
      )
      .map(artist => artist.id);

    if (missingIds.length > 0) {
      const profiles = await this.supabaseService.loadArtistsByIds(missingIds);
      const profileMap = new Map<string, any>(
        profiles.filter(profile => profile?.id).map(profile => [profile.id, profile])
      );

      targetArray.forEach(artist => {
        const profile = profileMap.get(artist.id);
        if (!profile) return;
        if (Array.isArray(profile.images) && profile.images.length > 0) {
          artist.images = profile.images;
          task.completedArtistIds.add(artist.id);
        }
        if (profile.external_urls?.spotify) {
          artist.external_urls = profile.external_urls;
        }
      });
      task.loadedArtistsDetailsCount = task.completedArtistIds.size;
      task.emitUpdate();
    }

    this.fetchArtistDetailsLazy(task, targetArray, userId);
    this.checkCompletion(task, userId);
  }

  private failTask(task: PlaylistLoadTask, error: any) {
    task.error = error;
    task.isLoadingTracks = false;
    task.isLoadingArtists = false;
    task.isRefreshing = false;
    task.isComplete = true;
    task.emitUpdate();
  }

  private fetchArtistDetailsLazy(task: PlaylistLoadTask, targetArray: any[], userId: string) {
    const validArtistIds = Array.from(new Set<string>(targetArray
      .map(a => a.id)
      .filter(id => id && typeof id === 'string' && id.trim() !== '')));
    task.totalUniqueArtists = validArtistIds.length;

    const pendingIds = validArtistIds.filter(id =>
      !task.requestedArtistIds.has(id) &&
      !task.completedArtistIds.has(id) &&
      (task.artistFetchAttempts.get(id) || 0) < 3
    );

    if (pendingIds.length === 0) {
      this.checkCompletion(task, userId);
      return;
    }

    const batch = pendingIds.slice(0, 50);
    batch.forEach(id => {
      task.requestedArtistIds.add(id);
      task.artistFetchAttempts.set(id, (task.artistFetchAttempts.get(id) || 0) + 1);
    });

    const sub = this.spotifyDataService.getArtistsByIds(batch).subscribe({
      next: (res: any) => {
        task.error = null;
        const artistMap = new Map<string, any>();
        (res.artists || []).forEach((a: any) => {
          if (a) artistMap.set(a.id, a);
        });

        targetArray.forEach(artist => {
          if (artistMap.has(artist.id)) {
            const full = artistMap.get(artist.id);
            artist.images = full.images || [];
            artist.external_urls = full.external_urls;
            task.completedArtistIds.add(artist.id);
          }
        });

        const retryIds: string[] = [];
        batch.forEach(id => {
          if (artistMap.has(id)) return;
          task.requestedArtistIds.delete(id);
          if ((task.artistFetchAttempts.get(id) || 0) >= 3) {
            // Deleted or unavailable artists must not block the whole playlist.
            task.completedArtistIds.add(id);
          } else {
            retryIds.push(id);
          }
        });

        if (this.authService.isBackupActive() && artistMap.size > 0) {
          this.supabaseService.syncArtists(Array.from(artistMap.values())).catch(err => {
            console.warn('[PlaylistLoaderService] Failed to sync Spotify artist details:', err);
          });
        }

        task.loadedArtistsDetailsCount = task.completedArtistIds.size;
        task.emitUpdate();

        if (retryIds.length > 0) {
          const retrySub = timer(1000).subscribe(() =>
            this.fetchArtistDetailsLazy(task, targetArray, userId)
          );
          task.addSub(retrySub);
        } else {
          this.fetchArtistDetailsLazy(task, targetArray, userId);
        }
      },
      error: (err) => {
        console.error('Error batch loading artists lazy details:', err);
        task.error = err;
        batch.forEach(id => {
          task.requestedArtistIds.delete(id);
          if ((task.artistFetchAttempts.get(id) || 0) >= 3) {
            task.completedArtistIds.add(id);
          }
        });
        const retrySub = timer(3000).subscribe(() =>
          this.fetchArtistDetailsLazy(task, targetArray, userId)
        );
        task.addSub(retrySub);
      }
    });
    task.addSub(sub);
  }

  private getArtistsFromTracks(task: PlaylistLoadTask, items: any[], targetArray: any[], offset: number = 0) {
    try {
      let idx = offset;
      for (let item of items) {
        if (!item || !item.track) continue;
        
        // Filter out empty/unknown/deleted tracks with missing metadata
        const trackName = item.track.name;
        const trackArtists = item.track.artists || [];
        const hasValidArtists = trackArtists.length > 0 && trackArtists.some((a: any) => a && a.name && a.name.trim() !== '');
        
        if (!trackName || trackName.trim() === '' || !hasValidArtists) {
          console.warn('Skipping unknown/deleted/local track with missing details:', item.track);
          continue;
        }

        // Create a new track copy to avoid mutating frozen response objects
        const trackCopy = {
          ...item.track,
          added_at: item.added_at || '',
          playlist_index: item.track.playlist_index || ++idx
        };
        
        for (let artist of item.track.artists || []) {
          let existingArtist = targetArray.find(a => a.id === artist.id);
          if (!existingArtist) {
            // Create a new artist copy to avoid mutating frozen response objects
            const artistCopy = {
              ...artist,
              tracks: [trackCopy]
            };
            targetArray.push(artistCopy);
          } else {
            if (!existingArtist.tracks) {
              existingArtist.tracks = [];
            }
            let existingTrack = existingArtist.tracks.find((t: { id: any }) => t.id === trackCopy.id);
            if (!existingTrack) {
              existingArtist.tracks.push(trackCopy);
            }
          }
        }
      }
      if (idx > task.trackIndexCounter) {
        task.trackIndexCounter = idx;
      }
      task.totalUniqueArtists = targetArray.length;
      task.emitUpdate();
    } catch (error) {
      console.error('Error getting artists from tracks:', error);
    }
  }

  private checkCompletion(task: PlaylistLoadTask, userId: string | null) {
    if (!task.isLoadingTracks && task.completedArtistIds.size >= task.totalUniqueArtists) {
      task.isLoadingArtists = false;
      
      if (task.isRefreshing) {
        task.artists = task.refreshingArtists;
        task.isRefreshing = false;
      }

      if (task.mode === 'incremental-new-only') {
        task.loadedTracksCount = this.countUniqueTracks(task.artists);
      }
      
      if (
        userId &&
        !task.error &&
        (task.mode === 'full' || task.hasDataChanges)
      ) {
        this.setSessionStorage(task, userId, task.mode === 'full');
      }

      task.isComplete = true;
      task.emitUpdate();
    }
  }

  private setSessionStorage(
    task: PlaylistLoadTask,
    userId: string,
    updateDailyFullSyncTimestamp: boolean
  ) {
    const cleanedArtists = task.artists.map((artist: any) => ({
      id: artist.id,
      name: artist.name,
      images: artist.images && artist.images.length > 0 ? [{ url: artist.images[0].url }] : [],
      external_urls: artist.external_urls?.spotify ? { spotify: artist.external_urls.spotify } : undefined,
      tracks: artist.tracks ? artist.tracks.map((track: any) => ({
        id: track.id,
        name: track.name,
        artists: track.artists ? track.artists.map((a: any) => ({ id: a.id, name: a.name })) : [],
        explicit: track.explicit,
        duration_ms: track.duration_ms,
        external_urls: track.external_urls ? { spotify: track.external_urls.spotify } : undefined,
        added_at: track.added_at,
        playlist_index: track.playlist_index,
        album: track.album ? {
          id: track.album.id,
          name: track.album.name,
          images: track.album.images && track.album.images.length > 0 ? [{ url: track.album.images[0].url }] : [],
          release_date: track.album.release_date,
          artists: track.album.artists
            ? track.album.artists.map((albumArtist: any) => ({
                id: albumArtist.id,
                name: albumArtist.name
              }))
            : [],
          external_urls: track.album.external_urls?.spotify
            ? { spotify: track.album.external_urls.spotify }
            : undefined
        } : undefined
      })) : []
    }));

    this.storageService.setItem(`${userId}_${task.playlistId}`, JSON.stringify(cleanedArtists));
    this.storageService.setItem(`${userId}_${task.playlistId}_Amount`, JSON.stringify(task.totalTracks));
    this.storageService.setItem(`${userId}_${task.playlistId}_Name`, JSON.stringify(task.playlistName));
    this.storageService.setItem(
      `${userId}_${task.playlistId}_CachedTrackCount`,
      JSON.stringify(this.countUniqueTracks(cleanedArtists))
    );
    if (updateDailyFullSyncTimestamp) {
      this.storageService.setItem(`${userId}_${task.playlistId}_lastUpdated`, Date.now().toString());
    }

    // Sharing is an explicit Supabase grant and intentionally does not depend
    // on the user's optional Cloud Backup setting.
    void this.playlistSharingService
      .refreshActiveSharesFromCache(task.playlistId, task.playlistName, cleanedArtists)
      .catch(error => console.warn('[PlaylistLoaderService] Could not refresh active playlist shares.', error));

  }
}
