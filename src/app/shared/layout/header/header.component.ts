import {Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Optional, Output} from '@angular/core';
import { Router } from '@angular/router';
import { SpotifyAuthService } from '@core/auth/spotify-auth.service';
import { StorageService } from '@core/data-access/storage/storage.service';
import { SupabaseService } from '@core/data-access/supabase/supabase.service';
import { SpotifyDataService } from '@core/data-access/spotify/spotify-data.service';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {firstValueFrom} from 'rxjs';
import {createScopedLogger} from '@core/diagnostics/app-logger';
import {AdminService} from '@core/admin/admin.service';
import {
  PushNotificationService,
  PushNotificationSettings
} from '@core/notifications/push-notification.service';

const console = createScopedLogger('Profile and Settings');

type ProfileImageCacheMetadata = {
  url: string;
  source: 'spotify' | 'supabase';
  expiresAt: number;
  absent: boolean;
  retryCount: number;
  nextRetryAt: number;
};

@Component({
    selector: 'app-header',
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.scss'],
    standalone: false
})

export class HeaderComponent implements OnInit, OnDestroy {
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
  showNotificationSettingsModal = false;
  isDeletingDbData = false;
  isGuestLogoutRunning = false;
  isLoadingNotificationSettings = false;
  isSavingNotificationSettings = false;
  isRemovingScheduledAccess = false;
  statsDiscoverable = false;
  isSavingStatsDiscoverability = false;
  notificationError = '';
  private profileRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly profileRetryDelays = [1_000, 5_000, 30_000];
  notificationSettings: PushNotificationSettings = {
    supported: false,
    installedPwa: false,
    permission: 'unavailable',
    deviceSubscribed: false,
    songLeagueEnabled: false,
    songLeagueSongAddedEnabled: false,
    songLeagueMember: false,
    statsAccessRequestsEnabled: true,
    active: false,
    songAddedActive: false,
    statsAccessActive: false
  };

  constructor(
    public authService: SpotifyAuthService,
    private storageService: StorageService,
    private supabaseService: SupabaseService,
    private spotifyDataService: SpotifyDataService,
    private adminService: AdminService,
    private pushNotifications: PushNotificationService,
    private router: Router,
    @Optional() private statsSharing?: StatsSharingService
  ) {}

  async ngOnInit() {
    // Re-check the active Supabase identity so an admin result is never reused
    // after logout when a different user signs in within the same app session.
    const [, isAdmin, statsDiscoverable] = await Promise.all([
      this.loadUserProfile(),
      this.adminService.isAdmin(),
      this.authService.hasCloudIdentity?.() && this.statsSharing
        ? this.statsSharing.getDiscoverability().catch(() => false)
        : Promise.resolve(false)
    ]);
    this.isAdmin = isAdmin;
    this.statsDiscoverable = statsDiscoverable;
  }

  ngOnDestroy(): void {
    if (this.profileRetryTimer) clearTimeout(this.profileRetryTimer);
    this.profileRetryTimer = null;
  }


  async loadUserProfile(forceProvider = false) {
    const userId = this.authService.getUserId() || 'anonymous';
    const imageKey = `${userId}_profile_pic`;
    const metadataKey = `${imageKey}_metadata`;
    const metadata = this.readProfileImageMetadata(metadataKey);
    const cached = this.storageService.getItem(imageKey);
    if (!forceProvider && metadata && metadata.retryCount > 0) {
      this.profilePicUrl = null;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      if (metadata.nextRetryAt > Date.now()) {
        this.armProfileImageRetry(metadata.nextRetryAt - Date.now());
      } else {
        await this.refreshProfileImageFromSpotify(userId, imageKey, metadataKey, metadata);
      }
      return;
    }
    if (!forceProvider && metadata && metadata.expiresAt > Date.now()) {
      this.profilePicUrl = metadata.absent ? null : (metadata.url || cached);
      return;
    }
    if (!forceProvider && cached && !metadata) {
      const migrated = this.profileImageMetadata(cached, 'supabase');
      this.writeProfileImageMetadata(metadataKey, migrated);
      this.profilePicUrl = cached;
      return;
    }

    const supabaseUserId = this.authService.getSupabaseUserId();
    if (!forceProvider && supabaseUserId) {
      const dbProfile = await this.supabaseService.loadUserProfile(supabaseUserId);
      if (dbProfile?.profile_pic_url) {
        this.storageService.setItem(imageKey, dbProfile.profile_pic_url);
        this.writeProfileImageMetadata(metadataKey, this.profileImageMetadata(dbProfile.profile_pic_url, 'supabase'));
        this.profilePicUrl = dbProfile.profile_pic_url;
        return;
      }
    }

    await this.refreshProfileImageFromSpotify(userId, imageKey, metadataKey, metadata);
  }

  onProfileImageError(status?: number): void {
    const failedUrl = this.profilePicUrl;
    this.profilePicUrl = null;
    const userId = this.authService.getUserId() || 'anonymous';
    const imageKey = `${userId}_profile_pic`;
    const metadataKey = `${imageKey}_metadata`;
    const current = this.readProfileImageMetadata(metadataKey)
      || this.profileImageMetadata(failedUrl || '', 'spotify');
    if (status === 404) {
      this.writeProfileImageMetadata(metadataKey, {
        ...current, url: '', absent: true, expiresAt: Date.now() + 6 * 60 * 60 * 1000,
        retryCount: 0, nextRetryAt: 0
      });
      this.storageService.removeItem(imageKey);
      return;
    }
    this.writeProfileImageMetadata(metadataKey, {
      ...current, url: failedUrl || current.url, absent: false,
      retryCount: Math.min(current.retryCount + 1, this.profileRetryDelays.length),
      nextRetryAt: Date.now()
    });
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    void this.loadUserProfile(true);
  }

  @HostListener('window:online')
  retryProfileImageWhenOnline(): void {
    if (!this.profilePicUrl) void this.loadUserProfile(true);
  }

  private readProfileImageMetadata(key: string): ProfileImageCacheMetadata | null {
    const raw = this.storageService.getItem(key);
    if (!raw) return null;
    try {
      const value = JSON.parse(raw) as Partial<ProfileImageCacheMetadata>;
      if (typeof value.url !== 'string' || typeof value.expiresAt !== 'number') return null;
      return {
        url: value.url,
        source: value.source === 'supabase' ? 'supabase' : 'spotify',
        expiresAt: value.expiresAt,
        absent: value.absent === true,
        retryCount: Number.isFinite(value.retryCount) ? Math.max(0, Number(value.retryCount)) : 0,
        nextRetryAt: Number.isFinite(value.nextRetryAt) ? Math.max(0, Number(value.nextRetryAt)) : 0
      };
    } catch {
      return null;
    }
  }

  private writeProfileImageMetadata(key: string, metadata: ProfileImageCacheMetadata): void {
    this.storageService.setItem(key, JSON.stringify(metadata), false);
  }

  private profileImageMetadata(
    url: string,
    source: ProfileImageCacheMetadata['source']
  ): ProfileImageCacheMetadata {
    return {
      url,
      source,
      expiresAt: this.profileImageExpiry(url),
      absent: !url,
      retryCount: 0,
      nextRetryAt: 0
    };
  }

  private profileImageExpiry(url: string): number {
    try {
      const providerExpiry = Number(new URL(url).searchParams.get('ext')) * 1000;
      if (Number.isFinite(providerExpiry) && providerExpiry > Date.now()) return providerExpiry;
    } catch {
      // A relative or malformed provider URL still receives a bounded cache lifetime.
    }
    return Date.now() + 24 * 60 * 60 * 1000;
  }

  private async refreshProfileImageFromSpotify(
    userId: string,
    imageKey: string,
    metadataKey: string,
    previous: ProfileImageCacheMetadata | null
  ): Promise<void> {
    try {
      const profile = await firstValueFrom(this.spotifyDataService.getCurrentUser());
      const url = profile?.images?.[0]?.url || '';
      if (profile?.id) {
        this.storageService.setItem(`${userId}_spotify_profile_id`, profile.id, false);
        this.storageService.setItem(`${userId}_spotify_profile_id_verified`, 'true', false);
      }
      if (!url) {
        this.profilePicUrl = null;
        this.storageService.removeItem(imageKey);
        this.writeProfileImageMetadata(metadataKey, {
          ...this.profileImageMetadata('', 'spotify'),
          expiresAt: Date.now() + 6 * 60 * 60 * 1000
        });
        return;
      }

      if (previous && previous.url === url && previous.retryCount > 0) {
        this.scheduleProfileImageRetry(metadataKey, previous);
        return;
      }
      this.storageService.setItem(imageKey, url);
      this.writeProfileImageMetadata(metadataKey, this.profileImageMetadata(url, 'spotify'));
      this.profilePicUrl = url;
    } catch (error) {
      console.warn('Profile image refresh failed; keeping a temporary fallback.', error);
      this.profilePicUrl = null;
      this.scheduleProfileImageRetry(metadataKey, previous);
    }
  }

  private scheduleProfileImageRetry(
    metadataKey: string,
    previous: ProfileImageCacheMetadata | null
  ): void {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const current = this.readProfileImageMetadata(metadataKey) || previous;
    const retryCount = current?.retryCount ?? 0;
    if (!current || retryCount >= this.profileRetryDelays.length) return;
    const delay = this.profileRetryDelays[retryCount];
    const metadata = {...current, retryCount: retryCount + 1, nextRetryAt: Date.now() + delay};
    this.writeProfileImageMetadata(metadataKey, metadata);
    this.armProfileImageRetry(delay);
  }

  private armProfileImageRetry(delay: number): void {
    if (this.profileRetryTimer) clearTimeout(this.profileRetryTimer);
    this.profileRetryTimer = setTimeout(() => {
      this.profileRetryTimer = null;
      void this.loadUserProfile(true);
    }, Math.max(0, delay));
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

  get hasScheduledSpotifyAccess(): boolean {
    return this.authService.hasScheduledSpotifyAccess?.() ?? false;
  }

  async removeScheduledSpotifyAccess(): Promise<void> {
    if (this.isRemovingScheduledAccess) return;
    this.isRemovingScheduledAccess = true;
    try {
      await this.authService.disableScheduledSpotifyAccess();
    } catch (error) {
      console.error('Failed to remove scheduled Spotify access:', error);
      alert('Scheduled Spotify access could not be removed. Please try again.');
    } finally {
      this.isRemovingScheduledAccess = false;
    }
  }

  get hasCollaborationIdentity(): boolean {
    return this.authService.hasCloudIdentity?.() ?? false;
  }

  async onStatsDiscoverabilityToggle(event: Event): Promise<void> {
    const checkbox = event.target as HTMLInputElement;
    const previous = this.statsDiscoverable;
    if (!this.statsSharing || this.isSavingStatsDiscoverability) {
      checkbox.checked = previous;
      return;
    }
    this.isSavingStatsDiscoverability = true;
    try {
      this.statsDiscoverable = await this.statsSharing.setDiscoverability(checkbox.checked);
    } catch (error) {
      checkbox.checked = previous;
      console.error('Failed to update Stats discoverability:', error);
      alert('Stats discoverability could not be updated. Please try again.');
    } finally {
      this.isSavingStatsDiscoverability = false;
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
      alert(err instanceof Error ? err.message : 'Failed to enable database backup. Please try again.');
    }
  }

  openClearDataModal() {
    this.showSettingsDropdown = false;
    this.showClearDataModal = true;
  }

  async openNotificationSettings(): Promise<void> {
    this.showSettingsDropdown = false;
    this.showNotificationSettingsModal = true;
    this.isLoadingNotificationSettings = true;
    this.notificationError = '';
    try {
      this.notificationSettings = await this.pushNotifications.loadSettings();
    } catch (error) {
      this.notificationError = (error as any)?.message || 'Notification settings could not be loaded.';
    } finally {
      this.isLoadingNotificationSettings = false;
    }
  }

  closeNotificationSettings(): void {
    if (this.isSavingNotificationSettings) return;
    this.showNotificationSettingsModal = false;
  }

  @HostListener('window:focus')
  refreshOpenNotificationSettings(): void {
    if (!this.showNotificationSettingsModal || this.isSavingNotificationSettings) return;
    void this.pushNotifications.loadSettings().then(settings => {
      this.notificationSettings = settings;
    }).catch(() => undefined);
  }

  async toggleSongLeagueNotifications(event: Event): Promise<void> {
    const enabled = (event.target as HTMLInputElement).checked;
    this.isSavingNotificationSettings = true;
    this.notificationError = '';
    try {
      this.notificationSettings = await this.pushNotifications.loadSettings();
      this.notificationSettings = await this.pushNotifications.setSongLeagueEnabled(enabled);
    } catch (error) {
      this.notificationError = (error as any)?.message || 'The notification setting could not be changed.';
    } finally {
      this.isSavingNotificationSettings = false;
    }
  }

  async toggleSongAddedNotifications(event: Event): Promise<void> {
    const enabled = (event.target as HTMLInputElement).checked;
    this.isSavingNotificationSettings = true;
    this.notificationError = '';
    try {
      this.notificationSettings = await this.pushNotifications.loadSettings();
      this.notificationSettings = await this.pushNotifications.setSongLeagueSongAddedEnabled(enabled);
    } catch (error) {
      this.notificationError = (error as any)?.message || 'The notification setting could not be changed.';
    } finally {
      this.isSavingNotificationSettings = false;
    }
  }

  async toggleStatsAccessNotifications(event: Event): Promise<void> {
    const enabled = (event.target as HTMLInputElement).checked;
    this.isSavingNotificationSettings = true;
    this.notificationError = '';
    try {
      this.notificationSettings = await this.pushNotifications.loadSettings();
      this.notificationSettings = await this.pushNotifications.setStatsAccessRequestsEnabled(enabled);
    } catch (error) {
      this.notificationError = (error as any)?.message || 'The notification setting could not be changed.';
    } finally {
      this.isSavingNotificationSettings = false;
    }
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
