import {Component, EventEmitter, HostListener, Input, OnInit, Output} from '@angular/core';
import { Router } from '@angular/router';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import {PlaylistShareAutoSyncService} from '@core/sharing/playlist-share-auto-sync.service';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {AdminService} from '@core/admin/admin.service';

const console = createScopedLogger('Profile and Settings');

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent implements OnInit {
  @Input() mobileTitle = '';
  @Input() showMobileBackButton = false;
  @Output() mobileBack = new EventEmitter<void>();

  profilePicUrl: string | null = null;
  showSettingsDropdown = false;
  showWorkspaceDropdown = false;
  isAdmin = false;
  
  // Modal states
  showClearDataModal = false;
  showConfirmLocalDeleteModal = false;
  showConfirmDbDeleteModal = false;
  showBackupConfirmModal = false;
  showGuestLogoutConfirmModal = false;
  isDeletingDbData = false;
  isGuestLogoutRunning = false;

  constructor(
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private supabaseService: SupabaseService,
    private spotifyDataService: SpotifyDataService,
    private playlistShareAutoSync: PlaylistShareAutoSyncService,
    private adminService: AdminService,
    private router: Router
  ) {}

  async ngOnInit() {
    this.playlistShareAutoSync.start();
    // Re-check the active Supabase identity so an admin result is never reused
    // after logout when a different user signs in within the same app session.
    const [, isAdmin] = await Promise.all([this.loadUserProfile(), this.adminService.isAdmin(true)]);
    this.isAdmin = isAdmin;
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
    this.showWorkspaceDropdown = false;
    this.showSettingsDropdown = !this.showSettingsDropdown;
  }

  toggleWorkspaceDropdown(event: Event) {
    event.stopPropagation();
    this.showSettingsDropdown = false;
    this.showWorkspaceDropdown = !this.showWorkspaceDropdown;
  }

  get isWorkspaceRoute(): boolean {
    return ['/compare-room', '/shared-playlists', '/song-league']
      .some(route => this.router.url.startsWith(route));
  }

  async logout() {
    if (this.authService.isAnonymousCloudIdentity()) {
      this.showSettingsDropdown = false;
      this.showGuestLogoutConfirmModal = true;
      return;
    }
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  async confirmGuestLogout() {
    this.isGuestLogoutRunning = true;
    try {
      await this.authService.logout();
      this.showGuestLogoutConfirmModal = false;
      await this.router.navigate(['/login']);
    } catch (error) {
      console.error('Failed to delete anonymous cloud identity:', error);
      alert('The anonymous cloud identity could not be deleted, so Analytify kept you logged in. Please try again.');
    } finally {
      this.isGuestLogoutRunning = false;
    }
  }

  openPersonalSpotifyConnection() {
    this.showSettingsDropdown = false;
    void this.router.navigate(['/spotify/connect'], {queryParams: {returnUrl: this.router.url}});
  }

  onBackupToggle(event: Event) {
    const checkbox = event.target as HTMLInputElement;
    if (checkbox.checked) {
      this.showBackupConfirmModal = true;
    } else {
      this.authService.disableBackup().catch(err => {
        console.error('Failed to disable backup:', err);
        alert('Failed to disable database backup. Please try again.');
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
      this.playlistShareAutoSync.start();
      void this.playlistShareAutoSync.syncNow().catch(error => {
        console.warn('[HeaderComponent] Playlist shares could not be refreshed after enabling Cloud Backup.', error);
      });
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
      await this.router.navigate(['/login']);
    } catch (err) {
      console.error('Failed to clear cache and logout:', err);
      alert('Analytify could not delete the anonymous cloud identity, so local data was not cleared. Please try again.');
    }
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
    this.showWorkspaceDropdown = false;
  }
}
