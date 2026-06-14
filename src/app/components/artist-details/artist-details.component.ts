import {Component, OnDestroy, OnInit, HostListener} from '@angular/core';
import {SpotifyDataService} from "../../services/spotify-data/spotify-data.service";
import {SpotifyAuthService} from "../../services/auth/spotify-auth.service";
import {StorageService} from "../../services/storage/storage.service";
import {ActivatedRoute, Router} from "@angular/router";

@Component({
  selector: 'app-artist-details',
  templateUrl: './artist-details.component.html',
  styleUrls: ['./artist-details.component.scss'],
})
export class ArtistDetailsComponent implements OnInit, OnDestroy {
  artist: any = {};
  tracks: any[] = [];
  allTags: any;
  selectedTag: any;
  playlistId: string = '';
  profilePicUrl: string | null = null;
  showSettingsDropdown: boolean = false;

  constructor(
    private route: ActivatedRoute, 
    private spotifyDataService: SpotifyDataService, 
    private router: Router,
    public authService: SpotifyAuthService,
    private storageService: StorageService
  ) {
    this.route.params.subscribe((params) => {
      this.tracks = history.state.tracks;
      this.playlistId = history.state.playlistId || '';
      this.loadArtistDetails(params['id']);
      this.loadUserProfile();
    });
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

  ngOnInit() {
  }

  ngOnDestroy() {
  }

  loadArtistDetails(id: string) {
    const userId = this.authService.getUserId() || 'anonymous';
    if (this.playlistId) {
      const storageKey = `${userId}_${this.playlistId}`;
      const storedArtists = this.storageService.getItem(storageKey);
      if (storedArtists) {
        const parsed = JSON.parse(storedArtists);
        const found = parsed.find((a: any) => a.id === id);
        if (found) {
          console.log(this.authService.isBackupActive() ? "[ArtistDetails] Loading artist details from Supabase Cloud Backup (Local Cache)" : "[ArtistDetails] Loading artist details from Local Storage Cache (Cloud Backup disabled)");
          this.artist = found;
          return;
        }
      }
    }

    console.log("[ArtistDetails] Cache missing. Loading artist details from Spotify API...");
    this.spotifyDataService.getSingleArtist(id).subscribe((artist: any) => {
      this.artist = artist;
    });
  }

  openTrackClick(url: string) {
    window.location.href = url;
  }

  openArtistClick() {
    window.location.href = this.artist.external_urls?.spotify;
  }

  goBack() {
    if (this.playlistId) {
      this.router.navigate(['/songs', this.playlistId]);
    } else {
      this.router.navigate(['/playlists']);
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  showClearCacheModal = false;
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

  toggleSettingsDropdown(event: Event) {
    event.stopPropagation();
    this.showSettingsDropdown = !this.showSettingsDropdown;
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

  viewListeningHistory() {
    this.router.navigate(['/history']);
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showSettingsDropdown = false;
  }
}
