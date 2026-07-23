import { Component, OnInit, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { SpotifyAuthService } from '../../services/auth/spotify-auth.service';
import { StorageService } from '../../services/storage/storage.service';
import { SupabaseService } from '../../services/supabase/supabase.service';
import { SpotifyDataService } from '../../services/spotify-data/spotify-data.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  profilePicUrl: string | null = null;
  showSettingsDropdown = false;
  
  // Modal states
  showClearDataModal = false;
  showConfirmLocalDeleteModal = false;
  showConfirmDbDeleteModal = false;
  showBackupConfirmModal = false;
  isDeletingDbData = false;

  constructor(
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private supabaseService: SupabaseService,
    private spotifyDataService: SpotifyDataService,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.loadUserProfile();
  }


  async loadUserProfile() {
    const userId = this.authService.getUserId() || 'anonymous';
    const cached = this.storageService.getItem(`${userId}_profile_pic`);
    if (cached !== null) {
      this.profilePicUrl = cached || null;
      return;
    }

    const supabaseUserId = this.authService.getSupabaseUserId();
    if (supabaseUserId) {
      const dbProfile = await this.supabaseService.loadUserProfile(supabaseUserId);
      if (dbProfile?.profile_pic_url) {
        this.storageService.setItem(`${userId}_profile_pic`, dbProfile.profile_pic_url);
        this.profilePicUrl = dbProfile.profile_pic_url;
        return;
      }
    }

    this.spotifyDataService.getCurrentUser().subscribe({
      next: (user: any) => {
        const pic = user.images && user.images[0] ? user.images[0].url : '';
        this.storageService.setItem(`${userId}_profile_pic`, pic);
        this.profilePicUrl = pic || null;
      },
      error: (err) => console.error('Failed to load user profile:', err)
    });
  }

  toggleSettingsDropdown(event: Event) {
    event.stopPropagation();
    this.showSettingsDropdown = !this.showSettingsDropdown;
  }

  async logout() {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

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

  openClearDataModal() {
    this.showSettingsDropdown = false;
    this.showClearDataModal = true;
  }

  closeClearDataModal() {
    this.showClearDataModal = false;
  }

  selectClearLocalData() {
    this.showClearDataModal = false;
    this.showConfirmLocalDeleteModal = true;
  }

  selectClearDbData() {
    this.showClearDataModal = false;
    this.showConfirmDbDeleteModal = true;
  }

  cancelLocalDelete() {
    this.showConfirmLocalDeleteModal = false;
  }

  cancelDbDelete() {
    this.showConfirmDbDeleteModal = false;
  }

  async confirmLocalDelete() {
    this.showConfirmLocalDeleteModal = false;
    try {
      await this.authService.clearCacheAndLogout();
    } catch (err) {
      console.error('Failed to clear cache and logout:', err);
    }
    this.router.navigate(['/login']);
  }

  async confirmDbDelete() {
    const supabaseUserId = this.authService.getSupabaseUserId();
    if (!supabaseUserId) {
      alert('You must be logged in to delete database data.');
      this.showConfirmDbDeleteModal = false;
      return;
    }

    this.isDeletingDbData = true;
    try {
      await this.supabaseService.deleteUserProfileData(supabaseUserId);
      this.storageService.setItem(`${supabaseUserId}_backup_active`, 'false');
      this.storageService.removeItem(`${supabaseUserId}_last_synced_at`);
      this.isDeletingDbData = false;
      this.showConfirmDbDeleteModal = false;
      alert('All cloud backup data connected to your profile has been permanently deleted from the database.');
      
      // If we are currently on the stats/playlists page, reload or refresh view
      if (this.router.url.includes('/stats')) {
        window.location.reload();
      } else {
        this.router.navigate(['/stats']);
      }
    } catch (err) {
      console.error('Failed to delete cloud backup data:', err);
      this.isDeletingDbData = false;
      this.showConfirmDbDeleteModal = false;
      alert('Failed to delete cloud backup data. Please try again.');
    }
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.showSettingsDropdown = false;
  }
}
