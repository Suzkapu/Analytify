import { Injectable } from '@angular/core';
import { SpotifyDataService } from '../spotify-data/spotify-data.service';
import { StorageService } from '../storage/storage.service';
import { SpotifyAuthService } from '../auth/spotify-auth.service';
import { BehaviorSubject, Subscription } from 'rxjs';

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
    private authService: SpotifyAuthService
  ) {
    this.authService.logout$.subscribe(() => {
      this.clearAllTasks();
    });
  }

  getLoadingTask(playlistId: string): PlaylistLoadTask | undefined {
    return this.tasks.get(playlistId);
  }

  startLoadingTask(userId: string, playlistId: string, isBackgroundRefresh: boolean = false): PlaylistLoadTask {
    let task = this.tasks.get(playlistId);
    if (task) {
      return task;
    }

    task = new PlaylistLoadTask(playlistId);
    this.tasks.set(playlistId, task);
    this.triggerApiLoad(task, userId, isBackgroundRefresh);
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

  private triggerApiLoad(task: PlaylistLoadTask, userId: string, isBackgroundRefresh: boolean) {
    console.log(`[PlaylistLoaderService] Loading playlist ${task.playlistId} from API`);
    task.requestedArtistIds.clear();
    task.loadedArtistsDetailsCount = 0;
    task.totalUniqueArtists = 0;

    let targetArray: any[];
    
    if (isBackgroundRefresh) {
      task.isRefreshing = true;
      task.isLoadingTracks = true;
      task.isLoadingArtists = true;
      task.refreshingArtists = [];
      targetArray = task.refreshingArtists;
      task.totalTracks = JSON.parse(this.storageService.getItem(`${userId}_${task.playlistId}_Amount`) || '0');
      task.playlistName = JSON.parse(this.storageService.getItem(`${userId}_${task.playlistId}_Name`) || '""');
      
      let maxIdx = 0;
      if (task.playlistId !== 'fav') {
        const storedArtists = this.storageService.getItem(`${userId}_${task.playlistId}`);
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

    const storedArtists = this.storageService.getItem(`${userId}_${task.playlistId}`);
    const version = this.storageService.getItem(`${userId}_${task.playlistId}_cacheVersion`);
    const isOldCache = storedArtists && version !== 'v3';

    if (task.playlistId === 'fav' && storedArtists && !isOldCache) {
      console.log("Favourite Tracks detected. Starting incremental load.");
      this.loadNewerFavTracks(task, userId, 0, 50, JSON.parse(storedArtists), targetArray);
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
            this.getArtistsFromTracks(task, playlist.tracks.items, targetArray);
            task.loadedTracksCount = Math.min(100, task.totalTracks);
            task.emitUpdate();

            this.fetchArtistDetailsLazy(task, targetArray, userId);

            if (task.loadedTracksCount < task.totalTracks) {
              this.loadRemainingTracks(task, userId, 100, 100, task.totalTracks, targetArray);
            } else {
              task.isLoadingTracks = false;
              task.emitUpdate();
              this.checkCompletion(task, userId);
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

  private loadRemainingTracks(task: PlaylistLoadTask, userId: string, offset: number, limit: number, total: number, targetArray: any[]) {
    if (task.playlistId === 'fav') {
      const sub = this.spotifyDataService.getFavTracks(offset, limit).subscribe({
        next: (tracks: any) => {
          this.getArtistsFromTracks(task, tracks.items, targetArray);
          task.loadedTracksCount = Math.min(offset + limit, total);
          task.emitUpdate();
          
          this.fetchArtistDetailsLazy(task, targetArray, userId);

          if (task.loadedTracksCount < total) {
            this.loadRemainingTracks(task, userId, offset + limit, limit, total, targetArray);
          } else {
            task.isLoadingTracks = false;
            task.emitUpdate();
            this.checkCompletion(task, userId);
          }
        },
        error: (err) => {
          console.error('Error loading remaining fav tracks:', err);
          task.isLoadingTracks = false;
          task.emitUpdate();
          this.checkCompletion(task, userId);
        }
      });
      task.addSub(sub);
    } else {
      const sub = this.spotifyDataService.getAllTracksFromPlaylist(task.playlistId, offset, limit).subscribe({
        next: (tracks: any) => {
          this.getArtistsFromTracks(task, tracks.items, targetArray);
          task.loadedTracksCount = Math.min(offset + limit, total);
          task.emitUpdate();
          
          this.fetchArtistDetailsLazy(task, targetArray, userId);

          if (task.loadedTracksCount < total) {
            this.loadRemainingTracks(task, userId, offset + limit, limit, total, targetArray);
          } else {
            task.isLoadingTracks = false;
            task.emitUpdate();
            this.checkCompletion(task, userId);
          }
        },
        error: (err) => {
          console.error('Error loading remaining playlist tracks:', err);
          task.isLoadingTracks = false;
          task.emitUpdate();
          this.checkCompletion(task, userId);
        }
      });
      task.addSub(sub);
    }
  }

  private loadNewerFavTracks(task: PlaylistLoadTask, userId: string, offset: number, limit: number, cachedArtists: any[], targetArray: any[]) {
    const cachedTrackIds = new Set<string>();
    cachedArtists.forEach(artist => {
      artist.tracks.forEach((t: any) => cachedTrackIds.add(t.id));
      if (artist.images && artist.images.length > 0) {
        task.requestedArtistIds.add(artist.id);
      }
    });

    const sub = this.spotifyDataService.getFavTracks(offset, limit).subscribe({
      next: (tracks: any) => {
        task.totalTracks = tracks.total;
        task.emitUpdate();
        
        let foundExisting = false;
        const newItems: any[] = [];
        
        for (let item of tracks.items) {
          if (item && item.track) {
            if (cachedTrackIds.has(item.track.id)) {
              foundExisting = true;
              break;
            } else {
              newItems.push(item);
            }
          }
        }
        
        this.getArtistsFromTracks(task, newItems, targetArray);
        task.loadedTracksCount += newItems.length;
        task.emitUpdate();

        this.fetchArtistDetailsLazy(task, targetArray, userId);

        if (!foundExisting && offset + limit < task.totalTracks) {
          this.loadNewerFavTracks(task, userId, offset + limit, limit, cachedArtists, targetArray);
        } else {
          this.mergeCachedArtists(task, cachedArtists, targetArray);
          task.isLoadingTracks = false;
          task.emitUpdate();
          this.fetchArtistDetailsLazy(task, targetArray, userId);
          this.checkCompletion(task, userId);
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

  private mergeCachedArtists(task: PlaylistLoadTask, cachedArtists: any[], targetArray: any[]) {
    const shift = task.playlistId === 'fav' ? task.loadedTracksCount : 0;

    cachedArtists.forEach(cachedArtist => {
      const mappedTracks = (cachedArtist.tracks || []).map((t: any) => ({
        ...t,
        playlist_index: t.playlist_index ? t.playlist_index + shift : t.playlist_index
      }));

      let existingArtist = targetArray.find(a => a.id === cachedArtist.id);
      if (!existingArtist) {
        targetArray.push({
          ...cachedArtist,
          tracks: mappedTracks
        });
      } else {
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

      if (cachedArtist.images && cachedArtist.images.length > 0) {
        task.requestedArtistIds.add(cachedArtist.id);
      }
    });
    task.totalUniqueArtists = targetArray.length;
    task.emitUpdate();
  }

  private fetchArtistDetailsLazy(task: PlaylistLoadTask, targetArray: any[], userId: string) {
    const pendingIds = targetArray
      .map(a => a.id)
      .filter(id => !task.requestedArtistIds.has(id));

    if (pendingIds.length === 0) {
      this.checkCompletion(task, userId);
      return;
    }

    const batch = pendingIds.slice(0, 50);
    batch.forEach(id => task.requestedArtistIds.add(id));

    const sub = this.spotifyDataService.getSeveralArtists(batch).subscribe({
      next: (res: any) => {
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

        task.loadedArtistsDetailsCount = targetArray.filter(a => a.images && a.images.length > 0).length;
        task.emitUpdate();
        
        this.fetchArtistDetailsLazy(task, targetArray, userId);
      },
      error: (err) => {
        console.error('Error batch loading artists lazy details:', err);
        this.fetchArtistDetailsLazy(task, targetArray, userId);
      }
    });
    task.addSub(sub);
  }

  private getArtistsFromTracks(task: PlaylistLoadTask, items: any[], targetArray: any[]) {
    try {
      for (let item of items) {
        if (!item || !item.track) continue;
        
        // Create a new track copy to avoid mutating frozen response objects
        const trackCopy = {
          ...item.track,
          added_at: item.added_at || '',
          playlist_index: item.track.playlist_index || ++task.trackIndexCounter
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
      
      if (userId) {
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
      images: artist.images ? artist.images.map((img: any) => ({ url: img.url })) : [],
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
          images: track.album.images ? track.album.images.map((img: any) => ({ url: img.url })) : [],
          release_date: track.album.release_date
        } : undefined
      })) : []
    }));

    this.storageService.setItem(`${userId}_${task.playlistId}`, JSON.stringify(cleanedArtists));
    this.storageService.setItem(`${userId}_${task.playlistId}_Amount`, JSON.stringify(task.totalTracks));
    this.storageService.setItem(`${userId}_${task.playlistId}_Name`, JSON.stringify(task.playlistName));
    this.storageService.setItem(`${userId}_${task.playlistId}_lastUpdated`, Date.now().toString());
    this.storageService.setItem(`${userId}_${task.playlistId}_cacheVersion`, 'v3');
  }
}
