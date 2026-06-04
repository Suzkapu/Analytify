import { Component, OnInit, HostListener } from '@angular/core';
import { SpotifyDataService } from '../../services/spotify-data/spotify-data.service';
import { SpotifyAuthService } from '../../services/auth/spotify-auth.service';
import { StorageService } from '../../services/storage/storage.service';
import { Router } from '@angular/router';

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
    private authService: SpotifyAuthService,
    private router: Router,
    private storageService: StorageService
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

  loadRecentlyPlayed() {
    const userId = this.authService.getUserId() || 'anonymous';
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
    
    // If no cache, show spinner. Otherwise, update in the background silently
    if (this.recentlyPlayedTracks.length === 0) {
      this.isLoadingRecentlyPlayed = true;
    }

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

  @HostListener('document:click')
  onDocumentClick() {
    this.showSettingsDropdown = false;
  }
}
