import {CommonModule, Location} from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  AfterViewInit,
  ViewChild,
  ViewContainerRef,
  signal,
  computed
} from '@angular/core';
import {ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet} from '@angular/router';
import {filter, Subscription} from 'rxjs';

import {DesignNavigationService} from '@core/navigation/design-navigation.service';
import {
  DesignV2NavigationItem,
  mobileDesignV2Navigation,
  primaryDesignV2Navigation,
  toolDesignV2Navigation
} from '@core/navigation/design-v2-navigation.model';
import {deepestDesignV2RouteData, DesignV2ChromeMode, DesignV2PageWidth} from '@core/navigation/design-v2-route-data';
import {AccessibleDialogDirective} from '@shared/ui/accessible-dialog.directive';
import {AmbientBackgroundComponent} from '@shared/ambient/ambient-background.component';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {firstValueFrom} from 'rxjs';
import {DesignV2OverlayService} from './design-v2-overlay.service';
import {AdminService} from '@core/admin/admin.service';
import {AmbientOverlayState} from '@shared/ambient/ambient-background.math';

interface DesignV2PageContext {
  pageId: string;
  title: string;
  width: DesignV2PageWidth;
  ambientKey: string;
  showBack: boolean;
  chromeMode: DesignV2ChromeMode;
}

const DEFAULT_CONTEXT: DesignV2PageContext = {
  pageId: 'analytify', title: 'Analytify', width: 'default', ambientKey: 'default', showBack: false,
  chromeMode: 'app'
};

@Component({
  selector: 'app-design-v2-shell',
  templateUrl: './design-v2-shell.component.html',
  styleUrls: ['./design-v2-shell.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [RouterLink, RouterOutlet, CommonModule, AccessibleDialogDirective, AmbientBackgroundComponent],
  providers: [DesignV2OverlayService]
})
export class DesignV2ShellComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mainContent') private mainContent?: ElementRef<HTMLElement>;
  @ViewChild('overlayMount', {read: ViewContainerRef}) private overlayMount?: ViewContainerRef;

  readonly primaryNavigation = primaryDesignV2Navigation();
  readonly toolNavigation = toolDesignV2Navigation();
  readonly mobileNavigation = mobileDesignV2Navigation();
  readonly pageContext = signal<DesignV2PageContext>(DEFAULT_CONTEXT);
  readonly currentUrl = signal('');
  readonly toolsOpen = signal(false);
  readonly accountOpen = signal(false);
  readonly profilePicUrl = signal<string | null>(null);
  readonly displayName = signal('Your account');
  readonly clearDataStep = signal<'none' | 'choose' | 'local' | 'cloud' | 'guest'>('none');
  readonly backupConfirmationOpen = signal(false);
  readonly actionError = signal('');
  readonly actionRunning = signal(false);
  readonly isAdmin = signal(false);
  readonly ambientOverlayState = computed<AmbientOverlayState>(() => {
    if (this.clearDataStep() !== 'none' || this.backupConfirmationOpen()) return 'modal';
    if (this.overlays.active()) return 'settings';
    if (this.accountOpen()) return 'account';
    if (this.toolsOpen()) return 'tools';
    return 'none';
  });

  private readonly subscriptions = new Subscription();
  private hasRenderedRoute = false;
  private accountLoaded = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly location: Location,
    readonly navigation: DesignNavigationService,
    readonly authService: SpotifyAuthService,
    private readonly storage: StorageService,
    private readonly spotifyData: SpotifyDataService,
    private readonly supabase: SupabaseService,
    private readonly admin: AdminService,
    readonly overlays: DesignV2OverlayService
  ) {}

  ngOnInit(): void {
    this.currentUrl.set(this.router.url);
    this.applyRouteContext();
    if (this.pageContext().chromeMode === 'app') void this.initializeAccountChrome();
    this.subscriptions.add(this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd)
    ).subscribe(event => {
      this.currentUrl.set(event.urlAfterRedirects);
      this.toolsOpen.set(false);
      this.accountOpen.set(false);
      this.applyRouteContext();
      if (this.pageContext().chromeMode === 'app') void this.initializeAccountChrome();
      if (this.hasRenderedRoute) setTimeout(() => this.mainContent?.nativeElement.focus({preventScroll: true}));
      this.hasRenderedRoute = true;
    }));
  }

  ngAfterViewInit(): void {
    if (this.overlayMount) this.overlays.register(this.overlayMount);
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    if (this.overlayMount) this.overlays.unregister(this.overlayMount);
  }

  linkFor(item: DesignV2NavigationItem): string[] {
    return this.navigation.commands(item.destination);
  }

  isActive(item: DesignV2NavigationItem): boolean {
    const destination = this.navigation.url(item.destination);
    const current = this.currentUrl().split(/[?#]/, 1)[0];
    return current === destination || current.startsWith(`${destination}/`);
  }

  back(): void {
    this.location.back();
  }

  toggleTools(): void {
    this.accountOpen.set(false);
    this.toolsOpen.update(open => !open);
  }

  closeTools(): void {
    this.toolsOpen.set(false);
  }

  toggleAccount(): void {
    this.toolsOpen.set(false);
    this.accountOpen.update(open => !open);
  }

  closeAccount(): void {
    this.accountOpen.set(false);
  }

  async openNotifications(): Promise<void> {
    this.closeAccount();
    await this.overlays.open(async () => (await import('../header/notification-settings-dialog.component')).NotificationSettingsDialogComponent);
  }

  async openAutomaticUpdates(): Promise<void> {
    this.closeAccount();
    await this.overlays.open(async () => (await import('../header/sync-task-status-dialog.component')).SyncTaskStatusDialogComponent);
  }

  async openBlockedUsers(): Promise<void> {
    this.closeAccount();
    await this.overlays.open(async () => (await import('../header/blocked-users-dialog.component')).BlockedUsersDialogComponent);
  }

  requestBackupChange(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    if (enabled) this.backupConfirmationOpen.set(true);
    else void this.authService.disableBackup().catch(() => this.actionError.set('Cloud Backup could not be disabled. Try again.'));
  }

  async enableBackup(): Promise<void> {
    this.actionRunning.set(true);
    this.actionError.set('');
    try {
      await this.authService.enableBackup();
      this.backupConfirmationOpen.set(false);
    } catch (error) {
      this.actionError.set(error instanceof Error ? error.message : 'Cloud Backup could not be enabled.');
    } finally {
      this.actionRunning.set(false);
    }
  }

  requestLogout(): void {
    this.closeAccount();
    if (this.authService.isAnonymousCloudIdentity()) this.clearDataStep.set('guest');
    else void this.performLogout();
  }

  async confirmLocalClear(): Promise<void> {
    await this.runDestructive(() => this.authService.clearCacheAndLogout());
  }

  async confirmCloudClear(): Promise<void> {
    const userId = this.authService.getSupabaseUserId();
    if (!userId) {
      this.actionError.set('You must be signed in to delete cloud data.');
      return;
    }
    await this.runDestructive(async () => {
      await this.supabase.deleteUserProfileData(userId);
      await this.authService.logout();
    });
  }

  async confirmGuestLogout(): Promise<void> {
    await this.runDestructive(() => this.authService.logout());
  }

  closeConfirmation(): void {
    if (this.actionRunning()) return;
    this.clearDataStep.set('none');
    this.backupConfirmationOpen.set(false);
    this.actionError.set('');
  }

  profileImageFailed(): void {
    this.profilePicUrl.set(null);
  }

  private async performLogout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigate(this.navigation.commands('login'));
  }

  private async runDestructive(action: () => Promise<unknown>): Promise<void> {
    this.actionRunning.set(true);
    this.actionError.set('');
    try {
      await action();
      this.clearDataStep.set('none');
      await this.router.navigate(this.navigation.commands('login'));
    } catch {
      this.actionError.set('Nothing else was removed. Please try again.');
    } finally {
      this.actionRunning.set(false);
    }
  }

  private async loadAccountSummary(): Promise<void> {
    const userId = this.authService.getUserId() || 'anonymous';
    this.profilePicUrl.set(this.storage.getItem(`${userId}_profile_pic`));
    this.displayName.set(this.storage.getItem(`${userId}_display_name`) || 'Your account');
    try {
      const profile = await firstValueFrom(this.spotifyData.getCurrentUser());
      this.profilePicUrl.set(profile?.images?.[0]?.url || null);
      this.displayName.set(profile?.display_name || this.displayName());
    } catch {
      // Cached summary and fallback remain usable while offline.
    }
  }

  private async initializeAccountChrome(): Promise<void> {
    if (this.accountLoaded) return;
    this.accountLoaded = true;
    const [, isAdmin] = await Promise.all([
      this.loadAccountSummary(),
      this.admin.isAdmin().catch(() => false)
    ]);
    this.isAdmin.set(isAdmin);
  }

  private applyRouteContext(): void {
    const data = deepestDesignV2RouteData(this.route.snapshot);
    this.pageContext.set({
      pageId: typeof data.pageId === 'string' ? data.pageId : DEFAULT_CONTEXT.pageId,
      title: typeof data.mobileTitle === 'string' ? data.mobileTitle : DEFAULT_CONTEXT.title,
      width: data.pageWidth ?? DEFAULT_CONTEXT.width,
      ambientKey: typeof data.ambientKey === 'string' ? data.ambientKey : DEFAULT_CONTEXT.ambientKey,
      showBack: data.mobileBack === true,
      chromeMode: data.chromeMode ?? 'app'
    });
  }
}
