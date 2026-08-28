import { Injectable } from '@angular/core';
import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { BehaviorSubject, from, Subscription } from 'rxjs';
import {map, mergeMap, tap, toArray} from 'rxjs/operators';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import {PlaylistSharingService} from '@core/sharing/playlist-sharing.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {
  areSourceEntriesNewestFirst,
  buildPlaylistSourceManifest,
  findDurableSourceOverlap,
  inferredRemovedSourceEntries,
  parsePlaylistSourceManifest,
  parsePlaylistSourceSyncState,
  PLAYLIST_SOURCE_MANIFEST_VERSION,
  PlaylistSourceEntryManifest,
  PlaylistSourceManifest,
  PlaylistSourceSyncState,
  sourceEntriesFromSpotify
} from './playlist-source-manifest';

const console = createScopedLogger('Playlist Loading');

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
  sourceEntries: PlaylistSourceEntryManifest[] = [];
  sourceSnapshotId: string | null = null;

  trackIndexCounter: number = 0;
  completedArtistIds = new Set<string>();
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

  sourceManifestKey(userId: string, playlistId: string): string {
    return `${userId}_${playlistId}_SourceManifest`;
  }

  sourceSyncStateKey(userId: string, playlistId: string): string {
    return `${userId}_${playlistId}_SourceState`;
  }

  readSourceManifest(userId: string, playlistId: string): PlaylistSourceManifest | null {
    return parsePlaylistSourceManifest(
      this.storageService.getItem(this.sourceManifestKey(userId, playlistId))
    );
  }

  isPlaylistSourceDirty(userId: string, playlistId: string): boolean {
    return parsePlaylistSourceSyncState(
      this.storageService.getItem(this.sourceSyncStateKey(userId, playlistId))
    )?.dirty === true;
  }

  recordPortfolioMetadata(
    userId: string,
    playlists: any[],
    previousPlaylists: any[] = []
  ): void {
    const previousById = new Map(
      (Array.isArray(previousPlaylists) ? previousPlaylists : [])
        .filter(playlist => playlist?.id)
        .map(playlist => [playlist.id, playlist])
    );

    (Array.isArray(playlists) ? playlists : []).forEach(playlist => {
      if (!playlist?.id) return;
      this.recordPlaylistMetadata(userId, playlist, previousById.get(playlist.id));
    });
  }

  recordPlaylistMetadata(userId: string, playlist: any, previousPlaylist?: any): void {
    const playlistId = String(playlist?.id || '');
    if (!playlistId) return;

    const observedTotal = this.playlistTotal(playlist);
    const observedSnapshotId = this.playlistSnapshotId(playlist);
    const manifest = this.readSourceManifest(userId, playlistId);
    const storedAmountValue = this.storageService.getItem(`${userId}_${playlistId}_Amount`);
    const hasStoredAmount = storedAmountValue !== null;
    const storedAmount = hasStoredAmount
      ? this.readStoredNumber(`${userId}_${playlistId}_Amount`)
      : null;
    const previousTotal = previousPlaylist ? this.playlistTotal(previousPlaylist) : null;
    const previousSnapshotId = previousPlaylist
      ? this.playlistSnapshotId(previousPlaylist)
      : null;

    let reason: PlaylistSourceSyncState['reason'] = 'current';
    if (playlistId === 'fav') {
      const baselineTotal = manifest?.sourceTotal ?? storedAmount ?? previousTotal;
      if (baselineTotal !== null && baselineTotal !== observedTotal) {
        reason = 'total-changed';
      }
    } else {
      const baselineSnapshotId = manifest?.snapshotId || previousSnapshotId;
      if (baselineSnapshotId && observedSnapshotId && baselineSnapshotId !== observedSnapshotId) {
        reason = 'snapshot-changed';
      } else {
        const baselineTotal = manifest?.sourceTotal ?? storedAmount ?? previousTotal;
        if (baselineTotal !== null && baselineTotal !== observedTotal) {
          reason = 'total-changed';
        }
      }
    }

    const state: PlaylistSourceSyncState = {
      version: PLAYLIST_SOURCE_MANIFEST_VERSION,
      dirty: reason !== 'current',
      reason,
      observedTotal,
      observedSnapshotId,
      checkedAt: Date.now()
    };
    this.storageService.setItem(
      this.sourceSyncStateKey(userId, playlistId),
      JSON.stringify(state),
      false
    );
    // Playlist-list metadata arrives before the heavier detail payload. Cache
    // its authoritative source total immediately so first-open progress and
    // completeness checks do not have to guess. StorageService mirrors this
    // user-scoped key to Supabase whenever Cloud Backup is enabled.
    this.storageService.setItem(
      `${userId}_${playlistId}_Amount`,
      JSON.stringify(observedTotal)
    );
    if (typeof playlist?.name === 'string' && playlist.name.trim()) {
      this.storageService.setItem(
        `${userId}_${playlistId}_Name`,
        JSON.stringify(playlist.name)
      );
    }

    // A stable normal-playlist snapshot proves that its complete manifest is
    // still current. Treat that metadata verification like a content refresh
    // without creating one cloud write per playlist overview visit.
    if (
      playlistId !== 'fav' &&
      !state.dirty &&
      !!manifest?.snapshotId &&
      manifest.snapshotId === observedSnapshotId &&
      manifest.sourceTotal === observedTotal
    ) {
      this.storageService.setItem(
        `${userId}_${playlistId}_lastUpdated`,
        Date.now().toString(),
        false
      );
    }
  }

  async reconcilePlaylistIfDirty(userId: string, playlistId: string): Promise<boolean> {
    if (!this.isPlaylistSourceDirty(userId, playlistId)) return true;

    let task = this.getLoadingTask(playlistId);
    if (!task) {
      task = playlistId === 'fav'
        ? this.startNewFavouriteTracksCheck(userId, true) || undefined
        : this.startLoadingTask(userId, playlistId, true, true);
    }
    if (!task) return false;

    const currentProgress = task.progress$.value;
    if (currentProgress.isComplete) {
      const succeeded = !currentProgress.error && !this.isPlaylistSourceDirty(userId, playlistId);
      this.clearLoadingTask(playlistId);
      return succeeded;
    }

    return new Promise<boolean>(resolve => {
      let subscription: Subscription | null = null;
      subscription = task!.progress$.subscribe(progress => {
        if (!progress.isComplete) return;
        subscription?.unsubscribe();
        const succeeded = !progress.error && !this.isPlaylistSourceDirty(userId, playlistId);
        this.clearLoadingTask(playlistId);
        resolve(succeeded);
      });
    });
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

  startNewFavouriteTracksCheck(userId: string, force = false): PlaylistLoadTask | null {
    const playlistId = 'fav';
    const existingTask = this.tasks.get(playlistId);
    if (existingTask) {
      return existingTask;
    }

    const sessionKey = `${userId}_${playlistId}`;
    if (!force && this.incrementalChecksThisSession.has(sessionKey)) {
      return null;
    }

    const storedArtists = this.storageService.getItem(sessionKey);
    if (!storedArtists) {
      return null;
    }

    try {
      const parsedArtists = JSON.parse(storedArtists);
      if (!Array.isArray(parsedArtists)) {
        return null;
      }
    } catch {
      return null;
    }

    this.incrementalChecksThisSession.add(sessionKey);
    const manifest = this.readSourceManifest(userId, playlistId);
    const task = new PlaylistLoadTask(
      playlistId,
      manifest ? 'incremental-new-only' : 'full'
    );
    this.tasks.set(playlistId, task);
    if (!manifest) {
      console.log('[PlaylistLoaderService] Liked Songs cache has no source manifest; migrating it with one exact refresh.');
    }
    this.triggerApiLoad(task, userId, true, !manifest);
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
    task.completedArtistIds.clear();
    task.loadedArtistsDetailsCount = 0;
    task.totalUniqueArtists = 0;
    task.sourceEntries = [];
    task.sourceSnapshotId = null;

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
          task.completedArtistIds.add(artist.id);
        }
      });
    }

    let targetArray: any[];
    // Expose cached metadata before the first Spotify page returns. This keeps
    // the progress denominator stable even on slow or rate-limited requests.
    task.totalTracks = this.readStoredNumber(`${userId}_${task.playlistId}_Amount`);
    task.playlistName = this.readStoredString(`${userId}_${task.playlistId}_Name`);
    
    if (isBackgroundRefresh) {
      task.isRefreshing = true;
      task.isLoadingTracks = true;
      task.isLoadingArtists = true;
      task.refreshingArtists = [];
      targetArray = task.refreshingArtists;
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
      const manifest = this.readSourceManifest(userId, task.playlistId);
      if (!manifest) {
        this.restartAsFullSync(task, userId, 'The cached source manifest is unavailable.');
        return;
      }
      this.loadNewFavouriteTracksOnly(
        task,
        userId,
        0,
        50,
        cachedArtists,
        targetArray,
        manifest,
        [],
        []
      );
    } else {
      if (task.playlistId === 'fav') {
        task.playlistName = 'Favourite Tracks';
        task.emitUpdate();
        const sub = this.spotifyDataService.getFavTracks(0, 50).subscribe({
          next: (tracks: any) => {
            task.totalTracks = tracks.total;
            const firstPageItems = tracks.items || [];
            task.sourceEntries = sourceEntriesFromSpotify(firstPageItems, 0);
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
              this.verifyAndFinishTrackLoading(task, targetArray, cachedArtists, userId);
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
            task.sourceSnapshotId = playlist.snapshot_id || null;
            task.emitUpdate();

            const firstPageItems = playlist.tracks.items || [];
            task.sourceEntries = sourceEntriesFromSpotify(firstPageItems, 0);
            this.getArtistsFromTracks(task, firstPageItems, targetArray, 0);
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
              this.verifyAndFinishTrackLoading(task, targetArray, cachedArtists, userId);
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
    const offsets: number[] = [];
    for (let pageOffset = offset; pageOffset < total; pageOffset += limit) {
      offsets.push(pageOffset);
    }

    // Pages are independent once Spotify has supplied the authoritative total.
    // Fetch a bounded group concurrently, then sort and apply all pages in one
    // synchronous commit so request completion order never leaks into the UI.
    const sub = from(offsets).pipe(
      mergeMap(pageOffset => {
        const request = task.playlistId === 'fav'
          ? this.spotifyDataService.getFavTracks(pageOffset, limit)
          : this.spotifyDataService.getAllTracksFromPlaylist(task.playlistId, pageOffset, limit);
        return request.pipe(
          tap(response => {
            task.loadedTracksCount = Math.min(
              task.loadedTracksCount + (response?.items || []).length,
              total
            );
            task.emitUpdate();
          }),
          map(response => ({offset: pageOffset, response}))
        );
      }, 4),
      toArray(),
      map(pages => pages.sort((left, right) => left.offset - right.offset))
    ).subscribe({
      next: pages => {
        for (const page of pages) {
          const pageItems = page.response?.items || [];
          if (
            task.playlistId === 'fav' &&
            Number.isFinite(page.response?.total) &&
            page.response.total !== total
          ) {
            this.failTask(task, new Error('Liked Songs changed while it was being synchronized. Please retry.'));
            return;
          }
          if (pageItems.length === 0 && page.offset < total) {
            const sourceName = task.playlistId === 'fav' ? 'favourite-tracks' : 'playlist';
            this.failTask(task, new Error(`Spotify returned an empty ${sourceName} page at offset ${page.offset}.`));
            return;
          }
        }

        for (const page of pages) {
          const pageItems = page.response?.items || [];
          task.sourceEntries.push(...sourceEntriesFromSpotify(pageItems, page.offset));
          this.getArtistsFromTracks(task, pageItems, targetArray, page.offset, false);
        }
        task.loadedTracksCount = Math.min(
          pages.reduce((count, page) => count + (page.response?.items || []).length, offset),
          total
        );
        task.emitUpdate();
        this.verifyAndFinishTrackLoading(task, targetArray, cachedArtists, userId);
      },
      error: err => {
        console.error('Error loading remaining playlist tracks:', err);
        this.failTask(task, err);
      }
    });
    task.addSub(sub);
  }

  private loadNewFavouriteTracksOnly(
    task: PlaylistLoadTask,
    userId: string,
    offset: number,
    limit: number,
    cachedArtists: any[],
    targetArray: any[],
    cachedManifest: PlaylistSourceManifest,
    scannedItems: any[],
    scannedEntries: PlaylistSourceEntryManifest[]
  ) {
    const sub = this.spotifyDataService.getFavTracks(offset, limit).subscribe({
      next: (tracks: any) => {
        const items = tracks?.items || [];
        const remoteTotal = Number(tracks?.total);
        if (!Number.isFinite(remoteTotal) || remoteTotal < 0) {
          this.restartAsFullSync(task, userId, 'Spotify did not return a valid Liked Songs total.');
          return;
        }

        if (remoteTotal === 0) {
          task.sourceEntries = [];
          task.totalTracks = 0;
          task.hasDataChanges = cachedManifest.sourceTotal > 0;
          this.verifyAndFinishTrackLoading(task, [], cachedArtists, userId);
          return;
        }

        const pageEntries = sourceEntriesFromSpotify(items, offset);
        scannedItems.push(...items);
        scannedEntries.push(...pageEntries);

        if (!areSourceEntriesNewestFirst(scannedEntries)) {
          this.restartAsFullSync(
            task,
            userId,
            'Liked Songs did not expose a stable newest-to-oldest boundary.'
          );
          return;
        }

        const overlap = findDurableSourceOverlap(
          scannedEntries,
          cachedManifest.entries,
          3
        );
        const reachedEnd = offset + items.length >= remoteTotal || items.length === 0;

        if (!overlap && !reachedEnd) {
          this.loadNewFavouriteTracksOnly(
            task,
            userId,
            offset + items.length,
            limit,
            cachedArtists,
            targetArray,
            cachedManifest,
            scannedItems,
            scannedEntries
          );
          return;
        }

        if (!overlap || overlap.cachedIndex !== 0) {
          this.restartAsFullSync(task, userId, 'No unambiguous cached Liked Songs boundary was found.');
          return;
        }

        const discoveredNewEntries = overlap.fetchedIndex;
        const inferredRemovals = inferredRemovedSourceEntries(
          cachedManifest.sourceTotal,
          discoveredNewEntries,
          remoteTotal
        );
        if (inferredRemovals !== 0) {
          this.restartAsFullSync(
            task,
            userId,
            inferredRemovals > 0
              ? `${inferredRemovals} removed Liked Songs require exact reconciliation.`
              : 'The Liked Songs totals changed during reconciliation.'
          );
          return;
        }

        const newItems = scannedItems.slice(0, discoveredNewEntries);
        const newEntries = scannedEntries.slice(0, discoveredNewEntries);
        this.getArtistsFromTracks(task, newItems, targetArray, 0);
        task.hasDataChanges = discoveredNewEntries > 0;
        this.mergeCachedArtists(
          task,
          cachedArtists,
          targetArray,
          undefined,
          discoveredNewEntries,
          true
        );

        const cachedTrackCount = this.countUniqueTracks(targetArray);
        task.sourceEntries = [...newEntries, ...cachedManifest.entries]
          .map((entry, position) => ({...entry, position}));
        task.totalTracks = remoteTotal;
        task.loadedTracksCount = cachedTrackCount;
        task.isLoadingTracks = false;
        task.emitUpdate();
        void this.hydrateArtistDetailsFromSupabase(task, targetArray, userId);
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
    storedCachedTrackCount: number | null,
    sourceManifest: PlaylistSourceManifest | null = null
  ): boolean {
    if (!Array.isArray(artists)) return false;

    const actualCachedTrackCount = this.countUniqueTracks(artists);
    if (sourceManifest) {
      return (
        sourceManifest.entries.length === sourceManifest.sourceTotal &&
        sourceManifest.uniqueUsableTrackCount === actualCachedTrackCount &&
        (storedCachedTrackCount === null || storedCachedTrackCount === actualCachedTrackCount)
      );
    }

    if (storedCachedTrackCount !== null) {
      if (actualCachedTrackCount !== storedCachedTrackCount) return false;

      // The marker is written only after pagination finishes and records the
      // exact normalized unique-track dataset. Spotify's raw total can be
      // larger because duplicates, local files and unavailable entries are
      // deliberately omitted from that normalized cache.
      if (actualCachedTrackCount > 0) return true;
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

  private playlistTotal(playlist: any): number {
    const total = Number(playlist?.items?.total ?? playlist?.tracks?.total ?? playlist?.total ?? 0);
    return Number.isFinite(total) && total >= 0 ? total : 0;
  }

  private playlistSnapshotId(playlist: any): string | null {
    const snapshotId = playlist?.snapshot_id ?? playlist?.snapshotId;
    return typeof snapshotId === 'string' && snapshotId.length > 0 ? snapshotId : null;
  }

  private readStoredString(key: string): string {
    try {
      const parsed = JSON.parse(this.storageService.getItem(key) || '""');
      return typeof parsed === 'string' ? parsed : '';
    } catch {
      return '';
    }
  }

  private restartAsFullSync(task: PlaylistLoadTask, userId: string, reason: string): void {
    console.log(`[PlaylistLoaderService] ${reason} Falling back to an exact full synchronization.`);
    task.mode = 'full';
    task.hasDataChanges = false;
    this.triggerApiLoad(task, userId, true, true);
  }

  private verifyAndFinishTrackLoading(
    task: PlaylistLoadTask,
    targetArray: any[],
    cachedArtists: any[],
    userId: string
  ): void {
    if (task.sourceEntries.length !== task.totalTracks) {
      this.failTask(
        task,
        new Error(
          `Spotify returned ${task.sourceEntries.length} source entries while reporting ${task.totalTracks}.`
        )
      );
      return;
    }

    if (task.playlistId === 'fav' || !task.sourceSnapshotId) {
      this.finishTrackLoading(task, targetArray, cachedArtists, userId);
      return;
    }

    const expectedSnapshotId = task.sourceSnapshotId;
    const sub = this.spotifyDataService.getPlaylistMetadata(task.playlistId).subscribe({
      next: (metadata: any) => {
        const finalSnapshotId = metadata?.snapshot_id || null;
        const finalTotal = Number(metadata?.items?.total ?? metadata?.tracks?.total);
        if (
          finalSnapshotId !== expectedSnapshotId ||
          !Number.isFinite(finalTotal) ||
          finalTotal !== task.totalTracks
        ) {
          this.failTask(
            task,
            new Error('The playlist changed while it was being synchronized. Please retry.')
          );
          return;
        }
        this.finishTrackLoading(task, targetArray, cachedArtists, userId);
      },
      error: error => this.failTask(task, error)
    });
    task.addSub(sub);
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
    const sourceManifest = buildPlaylistSourceManifest(
      task.playlistId,
      task.totalTracks,
      task.sourceEntries,
      this.countUniqueTracks(targetArray),
      task.sourceSnapshotId
    );
    if (!sourceManifest) {
      this.failTask(task, new Error('The completed Spotify response could not form a consistent source manifest.'));
      return;
    }

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
    this.setSessionStorage(task, userId, true);
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

    // Artist imagery is optional. A playlist cache is complete once all track
    // pages have been written; missing profiles are filled from Supabase here
    // and Spotify fallback is deferred to the visible-image recovery path.
    targetArray
      .map(artist => artist?.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
      .forEach(id => task.completedArtistIds.add(id));
    task.loadedArtistsDetailsCount = task.completedArtistIds.size;
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

  private getArtistsFromTracks(
    task: PlaylistLoadTask,
    items: any[],
    targetArray: any[],
    offset: number = 0,
    emitUpdate = true
  ) {
    try {
      let highestIndex = offset;
      for (const [itemOffset, item] of items.entries()) {
        if (!item || !item.track) continue;
        const sourceIndex = offset + itemOffset + 1;
        highestIndex = Math.max(highestIndex, sourceIndex);
        
        // Filter out empty/unknown/deleted tracks with missing metadata
        const trackName = item.track.name;
        const trackArtists = item.track.artists || [];
        const hasValidArtists = trackArtists.length > 0 && trackArtists.some((a: any) => a && a.name && a.name.trim() !== '');
        
        if (
          item.is_local === true ||
          item.track.is_local === true ||
          !item.track.id ||
          !trackName ||
          trackName.trim() === '' ||
          !hasValidArtists
        ) {
          console.warn('Skipping unknown/deleted/local track with missing details:', item.track);
          continue;
        }

        // Create a new track copy to avoid mutating frozen response objects
        const trackCopy = {
          ...item.track,
          added_at: item.added_at || '',
          playlist_index: item.track.playlist_index || sourceIndex
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
      if (highestIndex > task.trackIndexCounter) {
        task.trackIndexCounter = highestIndex;
      }
      task.totalUniqueArtists = targetArray.length;
      if (emitUpdate) task.emitUpdate();
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
        (
          task.mode === 'full' ||
          task.hasDataChanges ||
          this.isPlaylistSourceDirty(userId, task.playlistId)
        )
      ) {
        this.setSessionStorage(task, userId, true);
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
    const sourceManifest = buildPlaylistSourceManifest(
      task.playlistId,
      task.totalTracks,
      task.sourceEntries,
      this.countUniqueTracks(cleanedArtists),
      task.sourceSnapshotId
    );
    if (!sourceManifest) {
      throw new Error('Refusing to persist a playlist cache without a complete source manifest.');
    }
    this.storageService.setItem(
      this.sourceManifestKey(userId, task.playlistId),
      JSON.stringify(sourceManifest)
    );
    const sourceState: PlaylistSourceSyncState = {
      version: PLAYLIST_SOURCE_MANIFEST_VERSION,
      dirty: false,
      reason: 'current',
      observedTotal: task.totalTracks,
      observedSnapshotId: task.sourceSnapshotId,
      checkedAt: Date.now()
    };
    this.storageService.setItem(
      this.sourceSyncStateKey(userId, task.playlistId),
      JSON.stringify(sourceState),
      false
    );
    if (updateDailyFullSyncTimestamp) {
      this.storageService.setItem(`${userId}_${task.playlistId}_lastUpdated`, Date.now().toString());
    }

    // Owners publish refreshed snapshots only while their Cloud Backup opt-in
    // is active. Recipients never need to enable Cloud Backup to receive them.
    if (this.authService.isBackupActive()) {
      void this.playlistSharingService
        .refreshActiveSharesFromCache(task.playlistId, task.playlistName, cleanedArtists)
        .catch(error => console.warn('[PlaylistLoaderService] Could not refresh active playlist shares.', error));
    }

  }
}
