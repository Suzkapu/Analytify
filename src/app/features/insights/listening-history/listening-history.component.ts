import { Component, OnInit, HostListener } from '@angular/core';
import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';

const console = createScopedLogger('Listening History');

@Component({
  selector: 'app-listening-history',
  templateUrl: './listening-history.component.html',
  styleUrls: ['./listening-history.component.scss']
})
export class ListeningHistoryComponent implements OnInit {

  recentlyPlayedTracks: any[] = [];
  isLoadingRecentlyPlayed: boolean = true;

  constructor(
    private spotifyDataService: SpotifyDataService,
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private supabaseService: SupabaseService
  ) { }

  ngOnInit() {
    if (this.authService.isAuthenticated()) {
      void this.authService.ensureInitialSync().catch(() => {});
    }
    void this.loadRecentlyPlayed();
  }




  async loadRecentlyPlayed() {
    this.isLoadingRecentlyPlayed = this.recentlyPlayedTracks.length === 0;
    const userId = this.authService.getUserId() || 'anonymous';
    const supabaseUserId = this.authService.getSupabaseUserId();
    const storageKey = `${userId}_recently_played`;
    const lastCheckedKey = `${storageKey}_lastChecked`;

    // Load existing cache from StorageService
    let cachedTracks: any[] = [];
    try {
      const cached = this.storageService.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        cachedTracks = Array.isArray(parsed) ? parsed : [];
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
    if (cachedTracks.length > 0) this.isLoadingRecentlyPlayed = false;

    const lastChecked = Number(this.storageService.getItem(lastCheckedKey));
    if (cachedTracks.length > 0 && Number.isFinite(lastChecked) && Date.now() - lastChecked < 5 * 60 * 1000) {
      console.log('[History] Using the recently checked cache; skipping a repeated Spotify request.');
      return;
    }

    if (this.recentlyPlayedTracks.length === 0) {
      this.isLoadingRecentlyPlayed = true;
    }

    console.log(
      cachedTracks.length > 0
        ? '[History] Checking Spotify for listening-history entries newer than the local/Supabase cache.'
        : '[History] No cached listening history found. Fetching the latest entries from Spotify.'
    );
    const newestPlayedAt = cachedTracks.reduce((latest, item) => {
      const playedAt = new Date(item?.played_at || '').getTime();
      return Number.isFinite(playedAt) ? Math.max(latest, playedAt) : latest;
    }, 0);
    this.spotifyDataService.getRecentlyPlayed(50, newestPlayedAt || undefined).subscribe({
      next: (res: any) => {
        const newItems = res.items || [];
        
        // Find if there is an overlap
        const filteredNewItems: any[] = [];
        const historyKey = (item: any) =>
          `${item?.played_at || ''}:${item?.track?.id || ''}`;
        const existingEntries = new Set(cachedTracks.map(historyKey));
        
        for (const item of newItems) {
          if (existingEntries.has(historyKey(item))) {
            break; // Stop pulling/processing the rest of the items on overlap!
          }
          filteredNewItems.push(item);
        }
        
        // Merge new non-overlapping items to the beginning of the cached list
        const mergedTracks = [...filteredNewItems, ...cachedTracks]
          .filter((item, index, allItems) =>
            allItems.findIndex(candidate => historyKey(candidate) === historyKey(item)) === index
          );
        
        // Truncate to the most recent 50 tracks
        const finalTracks = mergedTracks.slice(0, 50);
        
        this.recentlyPlayedTracks = finalTracks;
        
        // Save back to StorageService
        try {
          this.storageService.setItem(storageKey, JSON.stringify(finalTracks));
          this.storageService.setItem(lastCheckedKey, Date.now().toString());
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

  trackHistoryItem(index: number, item: any): string {
    return `${item?.played_at || index}:${item?.track?.id || item?.track?.uri || ''}`;
  }

  openTrackClick(url: string) {
    if (url) {
      window.open(url, '_blank');
    }
  }


}
