import { Injectable } from '@angular/core';
import { SpotifyDataService } from '../spotify-data/spotify-data.service';
import { StorageService } from '../storage/storage.service';
import { SpotifyAuthService } from '../auth/spotify-auth.service';
import { BehaviorSubject, Subscription } from 'rxjs';
import { SupabaseService } from '../supabase/supabase.service';

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

  trackIndexCounter: number = 0;
  requestedArtistIds = new Set<string>();
  refreshingArtists: any[] = [];
  private activeSub = new Subscription();
  
  progress$ = new BehaviorSubject<PlaylistLoadProgress>(this.getProgress());

  constructor(playlistId: string) {
    this.playlistId = playlistId;
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

  constructor(
    private spotifyDataService: SpotifyDataService,
    private storageService: StorageService,
    private authService: SpotifyAuthService,
    private supabaseService: SupabaseService
  ) {
    this.authService.logout$.subscribe(() => {
      this.clearAllTasks();
    });
  }

  getLoadingTask(playlistId: string): PlaylistLoadTask | undefined {
    return this.tasks.get(playlistId);
  }

  startLoadingTask(userId: string, playlistId: string, isBackgroundRefresh: boolean = false, allowFullFallback: boolean = false): PlaylistLoadTask {
    let task = this.tasks.get(playlistId);
    if (task) {
      return task;
    }

    task = new PlaylistLoadTask(playlistId);
    this.tasks.set(playlistId, task);
    this.triggerApiLoad(task, userId, isBackgroundRefresh, allowFullFallback);
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
  }

  private tryIncrementalMatch(
    task: PlaylistLoadTask,
    items: any[],
    offset: number,
    cachedArtists: any[],
    allowFullFallback: boolean
  ): { match: boolean; minPlaylistIndex?: number; shift?: number } {
    const cachedTrackIndices = new Map<string, number>();
    let cachedTotalTracks = 0;
    cachedArtists.forEach(artist => {
      if (artist.tracks) {
        artist.tracks.forEach((t: any) => {
          if (t && t.id) {
            cachedTrackIndices.set(t.id, t.playlist_index);
            cachedTotalTracks = Math.max(cachedTotalTracks, t.playlist_index);
          }
        });
      }
    });

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      if (item && item.track && item.track.id) {
        const trackId = item.track.id;
        if (cachedTrackIndices.has(trackId)) {
          const idx = cachedTrackIndices.get(trackId)!;
          const newTracksCount = offset + j;
          const remainingCachedTracksCount = cachedTotalTracks - idx + 1;
          const totalMergedTracks = newTracksCount + remainingCachedTracksCount;

          if (totalMergedTracks === task.totalTracks) {
            const shift = (offset + j + 1) - idx;
            return { match: true, minPlaylistIndex: idx, shift };
          }
        }
      }
    }

    return { match: false };
  }

  private triggerApiLoad(task: PlaylistLoadTask, userId: string, isBackgroundRefresh: boolean, allowFullFallback: boolean = false) {
    console.log(`[PlaylistLoaderService] Loading playlist ${task.playlistId} from API`);
    task.requestedArtistIds.clear();
    task.loadedArtistsDetailsCount = 0;
    task.totalUniqueArtists = 0;

    const storedArtists = this.storageService.getItem(`${userId}_${task.playlistId}`);
    const version = this.storageService.getItem(`${userId}_${task.playlistId}_cacheVersion`);
    const isOldCache = storedArtists && version !== 'v5';

    let cachedArtists: any[] = [];
    let cachedTracksCount = 0;
    if (storedArtists) {
      try {
        cachedArtists = JSON.parse(storedArtists);
        cachedTracksCount = JSON.parse(this.storageService.getItem(`${userId}_${task.playlistId}_Amount`) || '0');
      } catch (e) {}
    }

    let targetArray: any[];
    
    if (isBackgroundRefresh) {
      task.isRefreshing = true;
      task.isLoadingTracks = true;
      task.isLoadingArtists = true;
      task.refreshingArtists = [];
      targetArray = task.refreshingArtists;
      task.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${task.playlistId}_Amount`) || '0');
      task.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${task.playlistId}_Name`) || '""');
      if (storedArtists) {
        try {
          task.artists = JSON.parse(storedArtists);
        } catch (e) {}
      }
      
      let maxIdx = 0;
      if (task.playlistId !== 'fav') {
        if (storedArtists) {
          try {
            const parsed = JSON.parse(storedArtists);
            parsed.forEach((artist: any) => {
              if (artist.tracks) {
                artist.tracks.forEach((t: any) => {
                  if (t.playlist_index > maxIdx) {
                    maxIdx = t.playlist_index;
                  }
                });
              }
            });
          } catch (e) {
            console.error('Failed to parse stored artists for index tracking', e);
          }
        }
      }
      task.trackIndexCounter = maxIdx;
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

    if (task.playlistId === 'fav' && storedArtists && !isOldCache) {
      console.log("Favourite Tracks detected. Starting incremental load.");
      this.loadNewerFavTracks(task, userId, 0, 50, cachedArtists, targetArray, allowFullFallback);
    } else {
      if (task.playlistId === 'fav') {
        task.playlistName = 'Favourite Tracks';
        task.emitUpdate();
        const sub = this.spotifyDataService.getFavTracks(0, 50).subscribe({
          next: (tracks: any) => {
            task.totalTracks = tracks.total;
            this.getArtistsFromTracks(task, tracks.items, targetArray);
            task.loadedTracksCount = Math.min(50, task.totalTracks);
            task.emitUpdate();

            this.fetchArtistDetailsLazy(task, targetArray, userId);

            if (task.loadedTracksCount < task.totalTracks) {
              this.loadRemainingTracks(task, userId, 50, 50, task.totalTracks, targetArray);
            } else {
              task.isLoadingTracks = false;
              task.emitUpdate();
              this.checkCompletion(task, userId);
            }
          },
          error: (err) => {
            console.error('Failed to load first page of favourite tracks:', err);
            task.isLoadingTracks = false;
            task.isLoadingArtists = false;
            task.error = err;
            task.emitUpdate();
          }
        });
        task.addSub(sub);
      } else {
        const sub = this.spotifyDataService.getSinglePlaylist(task.playlistId).subscribe({
          next: (playlist: any) => {
            task.playlistName = playlist.name;
            task.totalTracks = playlist.tracks.total;
            task.emitUpdate();

            // Try to use fast path or incremental end path if cache is available
            let canUseFastPath = false;
            let canUseIncrementalEndPath = false;

            if (cachedArtists.length > 0 && task.totalTracks > 100) {
              const cachedFirst100Ids = new Set<string>();
              cachedArtists.forEach(artist => {
                if (artist.tracks) {
                  artist.tracks.forEach((t: any) => {
                    if (t.playlist_index >= 1 && t.playlist_index <= 100) {
                      cachedFirst100Ids.add(t.id);
                    }
                  });
                }
              });

              const apiTracks = playlist.tracks.items || [];
              const allFirstPageMatch = apiTracks.every((item: any) => 
                item && item.track && cachedFirst100Ids.has(item.track.id)
              );

              if (allFirstPageMatch) {
                if (cachedTracksCount === task.totalTracks) {
                  canUseFastPath = true;
                } else if (task.totalTracks > cachedTracksCount) {
                  canUseIncrementalEndPath = true;
                }
              }
            }

            this.getArtistsFromTracks(task, playlist.tracks.items, targetArray, 0);

            if (canUseFastPath) {
              console.log(`[PlaylistLoaderService] Fast path matches for playlist ${task.playlistId}. Merging remaining cached data.`);
              this.mergeCachedArtists(task, cachedArtists, targetArray, 101, 0, true);
              task.loadedTracksCount = task.totalTracks;
              task.isLoadingTracks = false;
              task.emitUpdate();
              this.fetchArtistDetailsLazy(task, targetArray, userId);
              this.checkCompletion(task, userId);
            } else if (canUseIncrementalEndPath) {
              console.log(`[PlaylistLoaderService] Incremental end path matches for playlist ${task.playlistId}. Merging cached tracks up to ${cachedTracksCount} and pulling new ones from offset ${cachedTracksCount}.`);
              this.mergeCachedArtists(task, cachedArtists, targetArray, 101, 0, true);
              task.loadedTracksCount = cachedTracksCount;
              task.emitUpdate();
              this.fetchArtistDetailsLazy(task, targetArray, userId);
              
              this.loadRemainingTracks(task, userId, cachedTracksCount, 100, task.totalTracks, targetArray, cachedArtists, allowFullFallback);
            } else {
              // Mismatch/no-cache on first page
              if (cachedArtists.length > 0 && !allowFullFallback && task.totalTracks > 100) {
                console.log(`[PlaylistLoaderService] Playlist mismatch detected under daily restriction. Stopping API load and using full cache.`);
                targetArray.length = 0; // Clear the first page tracks we got
                this.mergeCachedArtists(task, cachedArtists, targetArray, undefined, 0, true);
                task.loadedTracksCount = cachedTracksCount;
                task.isLoadingTracks = false;
                task.emitUpdate();
                this.fetchArtistDetailsLazy(task, targetArray, userId);
                this.checkCompletion(task, userId);
              } else {
                task.loadedTracksCount = Math.min(100, task.totalTracks);
                task.emitUpdate();
                this.fetchArtistDetailsLazy(task, targetArray, userId);

                if (task.loadedTracksCount < task.totalTracks) {
                  this.loadRemainingTracks(task, userId, 100, 100, task.totalTracks, targetArray, cachedArtists, allowFullFallback);
                } else {
                  this.mergeCachedArtists(task, cachedArtists, targetArray, undefined, 0, false);
                  task.isLoadingTracks = false;
                  task.emitUpdate();
                  this.checkCompletion(task, userId);
                }
              }
            }
          },
          error: (err) => {
            console.error('Failed to load first page of playlist:', err);
            task.isLoadingTracks = false;
            task.isLoadingArtists = false;
            task.error = err;
            task.emitUpdate();
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
    cachedArtists: any[] = [],
    allowFullFallback: boolean = false
  ) {
    if (task.playlistId === 'fav') {
      const sub = this.spotifyDataService.getFavTracks(offset, limit).subscribe({
        next: (tracks: any) => {
          this.getArtistsFromTracks(task, tracks.items, targetArray, offset);
          task.loadedTracksCount = Math.min(offset + limit, total);
          task.emitUpdate();
          
          this.fetchArtistDetailsLazy(task, targetArray, userId);

          if (task.loadedTracksCount < total) {
            this.loadRemainingTracks(task, userId, offset + limit, limit, total, targetArray, cachedArtists, allowFullFallback);
          } else {
            this.mergeCachedArtists(task, cachedArtists, targetArray, undefined, 0, false);
            task.isLoadingTracks = false;
            task.emitUpdate();
            this.checkCompletion(task, userId);
          }
        },
        error: (err) => {
          console.error('Error loading remaining fav tracks:', err);
          task.isLoadingTracks = false;
          task.error = err;
          task.emitUpdate();
          this.checkCompletion(task, userId);
        }
      });
      task.addSub(sub);
    } else {
      const sub = this.spotifyDataService.getAllTracksFromPlaylist(task.playlistId, offset, limit).subscribe({
        next: (tracks: any) => {
          this.getArtistsFromTracks(task, tracks.items, targetArray, offset);
          task.loadedTracksCount = Math.min(offset + limit, total);
          task.emitUpdate();
          
          this.fetchArtistDetailsLazy(task, targetArray, userId);

          if (task.loadedTracksCount < total) {
            this.loadRemainingTracks(task, userId, offset + limit, limit, total, targetArray, cachedArtists, allowFullFallback);
          } else {
            this.mergeCachedArtists(task, cachedArtists, targetArray, undefined, 0, false);
            task.isLoadingTracks = false;
            task.emitUpdate();
            this.checkCompletion(task, userId);
          }
        },
        error: (err) => {
          console.error('Error loading remaining playlist tracks:', err);
          task.isLoadingTracks = false;
          task.error = err;
          task.emitUpdate();
          this.checkCompletion(task, userId);
        }
      });
      task.addSub(sub);
    }
  }

  private loadNewerFavTracks(
    task: PlaylistLoadTask,
    userId: string,
    offset: number,
    limit: number,
    cachedArtists: any[],
    targetArray: any[],
    allowFullFallback: boolean
  ) {
    const cachedTrackIds = new Set<string>();
    const cachedTrackIndices = new Map<string, number>();
    let cachedTotalTracks = 0;
    cachedArtists.forEach(artist => {
      if (artist.tracks) {
        artist.tracks.forEach((t: any) => {
          if (t && t.id) {
            cachedTrackIds.add(t.id);
            cachedTrackIndices.set(t.id, t.playlist_index);
            cachedTotalTracks = Math.max(cachedTotalTracks, t.playlist_index);
          }
        });
      }
    });

    const sub = this.spotifyDataService.getFavTracks(offset, limit).subscribe({
      next: (tracks: any) => {
        task.totalTracks = tracks.total;
        task.emitUpdate();

        const incremental = this.tryIncrementalMatch(task, tracks.items, offset, cachedArtists, allowFullFallback);

        if (incremental.match) {
          // Gather only the new items before the match in the current page
          const newItems: any[] = [];
          for (let item of tracks.items) {
            if (item && item.track) {
              if (cachedTrackIds.has(item.track.id)) {
                break;
              } else {
                newItems.push(item);
              }
            }
          }

          this.getArtistsFromTracks(task, newItems, targetArray, offset);
          task.loadedTracksCount = task.totalTracks;
          
          console.log(`[PlaylistLoaderService] Fav tracks incremental match: merged count (${task.totalTracks}) matches total. Merging remaining cached tracks.`);
          this.mergeCachedArtists(task, cachedArtists, targetArray, incremental.minPlaylistIndex, incremental.shift, true);
          
          task.isLoadingTracks = false;
          task.emitUpdate();
          this.fetchArtistDetailsLazy(task, targetArray, userId);
          this.checkCompletion(task, userId);
        } else {
          // No exact match. Let's see if we hit any cached track (meaning there's a count mismatch)
          let foundAnyExisting = false;
          let firstMatchIdx = -1;
          let firstMatchPageJ = -1;
          for (let j = 0; j < tracks.items.length; j++) {
            const item = tracks.items[j];
            if (item && item.track && item.track.id && cachedTrackIndices.has(item.track.id)) {
              foundAnyExisting = true;
              firstMatchIdx = cachedTrackIndices.get(item.track.id)!;
              firstMatchPageJ = j;
              break;
            }
          }

          if (foundAnyExisting && !allowFullFallback) {
            const newItems: any[] = [];
            for (let item of tracks.items) {
              if (item && item.track) {
                if (cachedTrackIds.has(item.track.id)) {
                  break;
                } else {
                  newItems.push(item);
                }
              }
            }
            this.getArtistsFromTracks(task, newItems, targetArray, offset);
            task.loadedTracksCount += newItems.length;

            console.log(`[PlaylistLoaderService] Fav tracks mismatch detected under daily restriction. Stopping pull and merging cache.`);
            const shift = (offset + firstMatchPageJ + 1) - firstMatchIdx;
            this.mergeCachedArtists(task, cachedArtists, targetArray, firstMatchIdx, shift, true);
            
            task.isLoadingTracks = false;
            task.emitUpdate();
            this.fetchArtistDetailsLazy(task, targetArray, userId);
            this.checkCompletion(task, userId);
          } else if (offset + limit < task.totalTracks) {
            this.getArtistsFromTracks(task, tracks.items, targetArray, offset);
            task.loadedTracksCount = Math.min(offset + limit, task.totalTracks);
            task.emitUpdate();
            this.fetchArtistDetailsLazy(task, targetArray, userId);

            this.loadNewerFavTracks(task, userId, offset + limit, limit, cachedArtists, targetArray, allowFullFallback);
          } else {
            this.getArtistsFromTracks(task, tracks.items, targetArray, offset);
            task.loadedTracksCount = task.totalTracks;
            
            console.log(`[PlaylistLoaderService] Fav tracks full pull complete. Merging cached artist metadata only.`);
            this.mergeCachedArtists(task, cachedArtists, targetArray, undefined, 0, false);
            
            task.isLoadingTracks = false;
            task.emitUpdate();
            this.fetchArtistDetailsLazy(task, targetArray, userId);
            this.checkCompletion(task, userId);
          }
        }
      },
      error: (err) => {
        console.error('Incremental loading failed:', err);
        task.isLoadingTracks = false;
        task.isLoadingArtists = false;
        task.error = err;
        task.emitUpdate();
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
            if (!existingArtist.images && cachedArtist.images) {
              existingArtist.images = cachedArtist.images;
            }
            if (!existingArtist.genres && cachedArtist.genres) {
              existingArtist.genres = cachedArtist.genres;
            }
          }
        }
      } else {
        if (existingArtist) {
          if (!existingArtist.images && cachedArtist.images) {
            existingArtist.images = cachedArtist.images;
          }
          if (!existingArtist.genres && cachedArtist.genres) {
            existingArtist.genres = cachedArtist.genres;
          }
        }
      }

    });
    task.totalUniqueArtists = targetArray.length;
    task.emitUpdate();
  }

  private fetchArtistDetailsLazy(task: PlaylistLoadTask, targetArray: any[], userId: string) {
    // Automatically mark invalid/empty/local IDs as requested so they do not block completion
    targetArray.forEach(a => {
      const idKey = a.id || '';
      if (!idKey || typeof idKey !== 'string' || idKey.trim() === '') {
        task.requestedArtistIds.add(idKey);
      }
    });

    const pendingIds = targetArray
      .map(a => a.id)
      .filter(id => id && typeof id === 'string' && id.trim() !== '' && !task.requestedArtistIds.has(id));

    if (pendingIds.length === 0) {
      this.checkCompletion(task, userId);
      return;
    }

    const batch = pendingIds.slice(0, 50);
    batch.forEach(id => task.requestedArtistIds.add(id));

    const sub = this.spotifyDataService.getSeveralArtists(batch).subscribe({
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
            artist.genres = full.genres || [];
          }
        });

        if (this.authService.isBackupActive() && artistMap.size > 0) {
          this.supabaseService.syncArtists(Array.from(artistMap.values())).catch(err => {
            console.warn('[PlaylistLoaderService] Failed to sync Spotify artist details:', err);
          });
        }

        task.loadedArtistsDetailsCount = targetArray.filter(a => a.images && a.images.length > 0).length;
        task.emitUpdate();
        
        this.fetchArtistDetailsLazy(task, targetArray, userId);
      },
      error: (err) => {
        console.error('Error batch loading artists lazy details:', err);
        task.error = err;
        // Remove from requestedArtistIds to allow retrying these failed IDs
        batch.forEach(id => task.requestedArtistIds.delete(id));
        // Retry after a 3-second delay to handle temporary connection dropouts or rate-limits
        setTimeout(() => {
          this.fetchArtistDetailsLazy(task, targetArray, userId);
        }, 3000);
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
    const targetArray = task.isRefreshing ? task.refreshingArtists : task.artists;
    if (!task.isLoadingTracks && task.requestedArtistIds.size >= task.totalUniqueArtists) {
      task.isLoadingArtists = false;
      
      if (task.isRefreshing) {
        task.artists = task.refreshingArtists;
        task.isRefreshing = false;
      }
      
      if (userId && !task.error) {
        this.setSessionStorage(task, userId);
      }

      task.isComplete = true;
      task.emitUpdate();
    }
  }

  private setSessionStorage(task: PlaylistLoadTask, userId: string) {
    const cleanedArtists = task.artists.map((artist: any) => ({
      id: artist.id,
      name: artist.name,
      images: artist.images && artist.images.length > 0 ? [{ url: artist.images[0].url }] : [],
      genres: artist.genres || [],
      tracks: artist.tracks ? artist.tracks.map((track: any) => ({
        id: track.id,
        name: track.name,
        artists: track.artists ? track.artists.map((a: any) => ({ id: a.id, name: a.name })) : [],
        popularity: track.popularity,
        explicit: track.explicit,
        duration_ms: track.duration_ms,
        external_urls: track.external_urls ? { spotify: track.external_urls.spotify } : undefined,
        added_at: track.added_at,
        playlist_index: track.playlist_index,
        album: track.album ? {
          images: track.album.images && track.album.images.length > 0 ? [{ url: track.album.images[0].url }] : [],
          release_date: track.album.release_date
        } : undefined
      })) : []
    }));

    this.storageService.setItem(`${userId}_${task.playlistId}`, JSON.stringify(cleanedArtists));
    this.storageService.setItem(`${userId}_${task.playlistId}_Amount`, JSON.stringify(task.totalTracks));
    this.storageService.setItem(`${userId}_${task.playlistId}_Name`, JSON.stringify(task.playlistName));
    this.storageService.setItem(`${userId}_${task.playlistId}_lastUpdated`, Date.now().toString());
    this.storageService.setItem(`${userId}_${task.playlistId}_cacheVersion`, 'v5');

  }
}
