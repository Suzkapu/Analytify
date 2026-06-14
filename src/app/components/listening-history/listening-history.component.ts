import { Component, OnInit, HostListener } from '@angular/core';
import { SpotifyDataService } from '../../services/spotify-data/spotify-data.service';
import { SpotifyAuthService } from '../../services/auth/spotify-auth.service';
import { StorageService } from '../../services/storage/storage.service';
import { Router } from '@angular/router';
import { SupabaseService } from '../../services/supabase/supabase.service';

@Component({
  selector: 'app-listening-history',
  templateUrl: './listening-history.component.html',
  styleUrls: ['./listening-history.component.scss']
})
export class ListeningHistoryComponent implements OnInit {
  profilePicUrl: string | null = null;
  showSettingsDropdown: boolean = false;
  showClearCacheModal: boolean = false;
  recentlyPlayedTracks: any[] = [];
  isLoadingRecentlyPlayed: boolean = false;

  constructor(
    private spotifyDataService: SpotifyDataService,
    public authService: SpotifyAuthService,
    private router: Router,
    private storageService: StorageService,
    private supabaseService: SupabaseService
  ) { }

  ngOnInit() {
    this.loadUserProfile();
    this.loadRecentlyPlayed();
  }

  loadUserProfile() {
    const userId = this.authService.getUserId() || 'anonymous';
    const cached = this.storageService.getItem(`${userId}_profile_pic`);
    if (cached !== null) {
      this.profilePicUrl = cached || null;
    } else {
      this.spotifyDataService.getCurrentUser().subscribe({
        next: (user: any) => {
          const pic = user.images && user.images[0] ? user.images[0].url : '';
          this.storageService.setItem(`${userId}_profile_pic`, pic);
          this.profilePicUrl = pic || null;
        },
        error: (err) => console.error('Failed to load user profile:', err)
      });
    }
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
    
    this.recentlyPlayedTracks = cachedTracks;
    
    // Prioritize DB data if backup is active and we have data for today in Supabase
    if (this.authService.isBackupActive() && supabaseUserId) {
      this.isLoadingRecentlyPlayed = true;
      const hasDataForToday = await this.supabaseService.hasHistoryForToday(supabaseUserId);
      if (hasDataForToday) {
        console.log('[History] Loading listening history directly from Supabase Cloud Database...');
        const dbTracks = await this.supabaseService.loadListeningHistoryFromDB(supabaseUserId);
        if (dbTracks && dbTracks.length > 0) {
          this.recentlyPlayedTracks = dbTracks;
          this.storageService.setItem(storageKey, JSON.stringify(dbTracks));
          this.isLoadingRecentlyPlayed = false;
          return; // Skip Spotify API call entirely!
        }
      }
    }

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
          this.supabaseService.syncListeningHistory(supabaseUserId, finalTracks);
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

  goBack() {
    this.router.navigate(['/playlists']);
  }

  toggleSettingsDropdown(event: Event) {
    event.stopPropagation();
    this.showSettingsDropdown = !this.showSettingsDropdown;
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  clearCacheAndLogout() {
    this.showClearCacheModal = true;
  }

  cancelClearCache() {
    this.showClearCacheModal = false;
  }

  confirmClearCache() {
    this.showClearCacheModal = false;
    this.authService.clearCacheAndLogout();
    this.router.navigate(['/login']);
  }

  showBackupConfirmModal = false;

  onBackupToggle(event: Event) {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.showBackupConfirmModal = true;
    } else {
      this.authService.disableBackup().catch(err => {
        console.error('Failed to disable backup:', err);
      });
    }
  }

  cancelBackupToggle() {
    this.showBackupConfirmModal = false;
  }

  async confirmBackupToggle() {
    this.showBackupConfirmModal = false;
    try {
      await this.authService.enableBackup();
    } catch (err) {
      console.error('Failed to enable backup:', err);
      alert('Failed to enable database backup. Please try again.');
    }
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showSettingsDropdown = false;
  }
}
