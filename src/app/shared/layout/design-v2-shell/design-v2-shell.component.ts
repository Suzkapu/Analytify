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
  afterNextRender,
  inject,
  Injector,
  signal,
  computed
} from '@angular/core';
import {ActivatedRoute, ActivationStart, NavigationEnd, Router, RouterLink, RouterOutlet} from '@angular/router';
import {filter, fromEvent, merge, Subject, Subscription, takeUntil} from 'rxjs';

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
import {SessionGeneration, SessionLifecycleService} from '@core/auth/session-lifecycle.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {firstValueFrom} from 'rxjs';
import {DesignV2OverlayService} from './design-v2-overlay.service';
import {AdminService} from '@core/admin/admin.service';
import {AmbientOverlayState} from '@shared/ambient/ambient-background.math';

interface AccountChromeContext {
  userId: string | null;
  cloudId: string | null;
  generation: SessionGeneration;
  cancel: Subject<void>;
}

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
  private readonly injector = inject(Injector);
  private accountContext?: AccountChromeContext;

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
    readonly overlays: DesignV2OverlayService,
    private readonly sessionLifecycle: SessionLifecycleService
  ) {}

  ngOnInit(): void {
    this.subscriptions.add(this.authService.logout$.subscribe(() => {
      this.resetAccountChrome();
      this.toolsOpen.set(false);
      this.accountOpen.set(false);
    }));
    this.currentUrl.set(this.router.url);
    this.applyRouteContext();
    if (this.pageContext().chromeMode === 'app') void this.initializeAccountChrome();
    this.subscriptions.add(this.router.events.pipe(
      filter((event): event is NavigationEnd | ActivationStart => event instanceof NavigationEnd || event instanceof ActivationStart)
    ).subscribe(event => {
      if (event instanceof ActivationStart) {
        const mode = deepestDesignV2RouteData(event.snapshot).chromeMode;
        if (mode && mode !== 'app') this.resetAccountChrome();
        return;
      }
      this.currentUrl.set(event.urlAfterRedirects);
      this.toolsOpen.set(false);
      this.accountOpen.set(false);
      this.applyRouteContext();
      if (this.pageContext().chromeMode === 'app') void this.initializeAccountChrome();
      afterNextRender(() => this.mainContent?.nativeElement.focus({preventScroll: true}), {injector: this.injector});
    }));
  }

  ngAfterViewInit(): void {
    if (this.overlayMount) this.overlays.register(this.overlayMount);
  }

  ngOnDestroy(): void {
    this.cancelAccountLoad();
    this.subscriptions.unsubscribe();
    if (this.overlayMount) this.overlays.unregister(this.overlayMount);
  }

  linkFor(item: DesignV2NavigationItem): string[] {
    return this.navigation.commands(item.destination);
  }

  isActive(item: DesignV2NavigationItem): boolean {
    const destination = this.navigation.commands(item.destination).join('/');
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

  requestBackupChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const enabled = input.checked;
    input.checked = this.authService.isBackupActive();
    if (this.actionRunning()) return;
    this.actionError.set('');
    if (enabled) this.backupConfirmationOpen.set(true);
    else void this.disableBackup();
  }

  private async disableBackup(): Promise<void> {
    this.actionRunning.set(true);
    try {
      await this.authService.disableBackup();
    } catch {
      this.actionError.set('Cloud Backup could not be disabled. Try again.');
    } finally {
      this.actionRunning.set(false);
    }
  }

  async enableBackup(): Promise<void> {
    if (this.actionRunning()) return;
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

  async requestLogout(): Promise<void> {
    if (this.actionRunning()) return;
    this.actionError.set('');
    this.closeAccount();
    if (this.authService.isAnonymousCloudIdentity()) this.clearDataStep.set('guest');
    else await this.performLogout();
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
    this.actionRunning.set(true);
    try {
      await this.authService.logout();
      const navigated = await this.router.navigate(this.navigation.commands('login'));
      if (!navigated) throw new Error('Navigation was cancelled');
    } catch {
      this.actionError.set('Log out did not finish. Please refresh before trying again.');
      this.accountOpen.set(true);
    } finally {
      this.actionRunning.set(false);
    }
  }

  private async runDestructive(action: () => Promise<unknown>): Promise<void> {
    if (this.actionRunning()) return;
    this.actionRunning.set(true);
    this.actionError.set('');
    try {
      await action();
      const navigated = await this.router.navigate(this.navigation.commands('login'));
      if (!navigated) throw new Error('Navigation was cancelled');
      this.clearDataStep.set('none');
    } catch {
      this.actionError.set('This action did not finish. Some steps may already have completed. Please refresh before trying again.');
    } finally {
      this.actionRunning.set(false);
    }
  }

  private async loadAccountSummary(context: AccountChromeContext): Promise<void> {
    const userId = context.userId || 'anonymous';
    this.profilePicUrl.set(this.storage.getItem(`${userId}_profile_pic`));
    this.displayName.set(this.storage.getItem(`${userId}_display_name`) || 'Your account');
    try {
      const profile = await firstValueFrom(this.spotifyData.getCurrentUser().pipe(
        takeUntil(merge(context.cancel, fromEvent(context.generation.signal, 'abort')))
      ));
      if (!this.isCurrentAccount(context)) return;
      this.profilePicUrl.set(profile?.images?.[0]?.url || null);
      this.displayName.set(profile?.display_name || this.displayName());
    } catch {
      // Cached summary and fallback remain usable while offline.
    }
  }

  private async initializeAccountChrome(): Promise<void> {
    if (this.accountContext && this.isCurrentAccount(this.accountContext)) return;
    this.cancelAccountLoad();
    const context: AccountChromeContext = {
      userId: this.authService.getUserId(),
      cloudId: this.authService.getSupabaseUserId(),
      generation: this.sessionLifecycle.capture(),
      cancel: new Subject<void>()
    };
    this.accountContext = context;
    this.isAdmin.set(false);
    const [, isAdmin] = await Promise.all([
      this.loadAccountSummary(context),
      this.admin.isAdmin().catch(() => false)
    ]);
    if (this.isCurrentAccount(context)) this.isAdmin.set(isAdmin);
  }

  private isCurrentAccount(context: AccountChromeContext): boolean {
    return this.accountContext === context
      && this.sessionLifecycle.isCurrent(context.generation)
      && this.authService.getUserId() === context.userId
      && this.authService.getSupabaseUserId() === context.cloudId;
  }

  private cancelAccountLoad(): void {
    const previous = this.accountContext;
    this.accountContext = undefined;
    previous?.cancel.next();
    previous?.cancel.complete();
  }

  private resetAccountChrome(): void {
    this.cancelAccountLoad();
    this.isAdmin.set(false);
    this.profilePicUrl.set(null);
    this.displayName.set('Your account');
  }

  private applyRouteContext(): void {
    const data = deepestDesignV2RouteData(this.route.snapshot);
    if (data.chromeMode && data.chromeMode !== 'app') this.resetAccountChrome();
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
