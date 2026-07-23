import { Component, OnInit, HostListener } from '@angular/core';
import { SpotifyDataService } from '../../services/spotify-data/spotify-data.service';
import { SpotifyAuthService } from '../../services/auth/spotify-auth.service';
import { StorageService } from '../../services/storage/storage.service';
import { SupabaseService } from '../../services/supabase/supabase.service';

@Component({
  selector: 'app-listening-history',
  templateUrl: './listening-history.component.html',
  styleUrls: ['./listening-history.component.scss']
})
export class ListeningHistoryComponent implements OnInit {

  recentlyPlayedTracks: any[] = [];
  isLoadingRecentlyPlayed: boolean = false;

  constructor(
    private spotifyDataService: SpotifyDataService,
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private supabaseService: SupabaseService
  ) { }

  async ngOnInit() {
    if (this.authService.isAuthenticated()) {
      await this.authService.ensureInitialSync();
    }
    this.loadRecentlyPlayed();
  }




  async loadRecentlyPlayed() {
    const userId = this.authService.getUserId() || 'anonymous';
    const supabaseUserId = this.authService.getSupabaseUserId();
    const storageKey = `${userId}_recently_played`;

    // Load existing cache from StorageService
    let cachedTracks: any[] = [];
    try {
      const cached = this.storageService.getItem(storageKey);
      if (cached) {
        cachedTracks = JSON.parse(cached);
      }
    } catch (e) {
      console.warn('Failed to parse cached recently played tracks:', e);
    }

    // Seeding: if local cache is empty and backup is active, restore from Supabase first
    if (cachedTracks.length === 0 && this.authService.isBackupActive() && supabaseUserId) {
      try {
        console.log('[History] Local history cache is empty. Restoring history from Supabase Cloud...');
        const dbTracks = await this.supabaseService.loadListeningHistoryFromDB(supabaseUserId);
        if (dbTracks && dbTracks.length > 0) {
          cachedTracks = dbTracks;
          this.storageService.setItem(storageKey, JSON.stringify(dbTracks));
        }
      } catch (err) {
        console.warn('[History] Failed to seed history from Supabase:', err);
      }
    }

    this.recentlyPlayedTracks = cachedTracks;

    if (this.recentlyPlayedTracks.length === 0) {
      this.isLoadingRecentlyPlayed = true;
    }

    console.log('[History] Cache or Supabase database has no today\'s history. Fetching recently played tracks from Spotify API...');
    this.spotifyDataService.getRecentlyPlayed(50).subscribe({
      next: (res: any) => {
        const newItems = res.items || [];
        
        // Find if there is an overlap
        const filteredNewItems: any[] = [];
        const existingTimestamps = new Set(cachedTracks.map(item => item.played_at));
        
        for (const item of newItems) {
          if (existingTimestamps.has(item.played_at)) {
            break; // Stop pulling/processing the rest of the items on overlap!
          }
          filteredNewItems.push(item);
        }
        
        // Merge new non-overlapping items to the beginning of the cached list
        const mergedTracks = [...filteredNewItems, ...cachedTracks];
        
        // Truncate to the most recent 50 tracks
        const finalTracks = mergedTracks.slice(0, 50);
        
        this.recentlyPlayedTracks = finalTracks;
        
        // Save back to StorageService
        try {
          this.storageService.setItem(storageKey, JSON.stringify(finalTracks));
        } catch (e) {
          console.warn('Failed to write to storage:', e);
        }
        
        // If backup is active, sync to Supabase
        if (this.authService.isBackupActive() && supabaseUserId) {
          this.supabaseService.syncListeningHistory(supabaseUserId, finalTracks).catch(error => {
            console.warn('[History] Failed to persist listening history:', error);
          });
        }
        
        this.isLoadingRecentlyPlayed = false;
      },
      error: (err) => {
        console.error('Failed to load recently played tracks:', err);
        this.isLoadingRecentlyPlayed = false;
      }
    });
  }


  formatPlayedAt(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  getTrackArtist(track: any): string {
    return track.artist || (track.artists && track.artists[0] ? track.artists[0].name : '');
  }

  openTrackClick(url: string) {
    if (url) {
      window.open(url, '_blank');
    }
  }


}
