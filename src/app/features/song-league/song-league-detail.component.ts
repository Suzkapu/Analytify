import {Component, HostListener, OnDestroy, OnInit, ChangeDetectionStrategy} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {distinctUntilChanged, map, Subscription} from 'rxjs';

import {
  SongLeagueDashboard,
  SongLeagueInvite,
  SongLeagueLifecycleEvent,
  SongLeagueMember,
  SongLeaguePlaylist,
  SongLeagueRecommendation,
  SongLeagueRejoinRequest,
  SongLeagueScoreBreakdown,
  SongLeagueStanding,
  SongLeagueTrack
} from '@core/song-league/song-league.models';
import {SongLeagueService} from '@core/song-league/song-league.service';
import {
  PushNotificationService,
  PushNotificationSettings
} from '@core/notifications/push-notification.service';

@Component({
    selector: 'app-song-league-detail',
    templateUrl: './song-league-detail.component.html',
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class SongLeagueDetailComponent implements OnInit, OnDestroy {
  dashboard: SongLeagueDashboard | null = null;
  currentUserId = '';
  isLoading = true;
  isReloading = false;
  errorMessage = '';
  successMessage = '';
  playlistWarning = '';
  notificationMessage = '';
  isSavingNotifications = false;
  notificationSettings: PushNotificationSettings = {
    supported: false, installedPwa: false, permission: 'unavailable',
    deviceSubscribed: false, songLeagueEnabled: false,
    songLeagueSongAddedEnabled: false, songLeagueMember: false,
    statsAccessRequestsEnabled: true,
    active: false, songAddedActive: false, statsAccessActive: false
  };

  songQuery = '';
  searchResults: SongLeagueTrack[] = [];
  selectedTrack: SongLeagueTrack | null = null;
  isSearching = false;
  isSubmitting = false;
  isCreatingPlaylist = false;

  inviteUrl = '';
  newInviteId = '';
  inviteCopied = false;
  isCreatingInvite = false;
  activeInvites: SongLeagueInvite[] = [];
  isLoadingInvites = false;
  revokingInviteId = '';
  isRevokingAllInvites = false;
  memberLimit = 5;
  isSavingMemberLimit = false;
  lifecycleEvents: SongLeagueLifecycleEvent[] = [];
  isLoadingLifecycle = false;
  showLifecycleModal = false;
  lifecycleAction: 'leave' | 'remove' | 'transfer' | 'close' | null = null;
  lifecycleTarget: SongLeagueMember | null = null;
  isApplyingLifecycle = false;
  rejoinRequests: SongLeagueRejoinRequest[] = [];
  isLoadingRejoinRequests = false;
  respondingRejoinId = '';
  showDeleteLeagueModal = false;
  isDeletingLeague = false;
  selectedStanding: SongLeagueStanding | null = null;

  private leagueId = '';
  private unsubscribeLeague: (() => void) | null = null;
  private reloadPending = false;
  private memberReady = false;
  private destroyed = false;
  private loadGeneration = 0;
  private routeSubscription = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private songLeague: SongLeagueService,
    private pushNotifications: PushNotificationService
  ) {}

  async ngOnInit(): Promise<void> {
    this.destroyed = false;
    if (this.route.paramMap) {
      this.routeSubscription = this.route.paramMap.pipe(
        map(params => params.get('leagueId') || ''),
        distinctUntilChanged()
      ).subscribe(leagueId => void this.activateLeagueRoute(leagueId));
      return;
    }
    await this.activateLeagueRoute(this.route.snapshot.paramMap.get('leagueId') || '');
  }

  private async activateLeagueRoute(leagueId: string): Promise<void> {
    const generation = ++this.loadGeneration;
    this.unsubscribeLeague?.();
    this.unsubscribeLeague = null;
    this.leagueId = leagueId;
    this.dashboard = null;
    this.isLoading = true;
    this.isReloading = false;
    this.reloadPending = false;
    this.memberReady = false;
    this.errorMessage = '';
    this.successMessage = '';
    this.playlistWarning = '';
    this.inviteUrl = '';
    this.newInviteId = '';
    this.activeInvites = [];
    this.lifecycleEvents = [];
    this.rejoinRequests = [];
    this.selectedStanding = null;
    try {
      const [currentUserId, notificationSettings] = await Promise.all([
        this.songLeague.currentUserId(),
        this.pushNotifications.loadSettings().catch(() => null),
        this.load(false, leagueId, generation)
      ]);
      if (!this.isCurrentLeague(leagueId, generation)) return;
      this.currentUserId = currentUserId;
      if (notificationSettings) this.notificationSettings = notificationSettings;
      await Promise.all([
        this.isOwner ? this.loadActiveInvites() : Promise.resolve(),
        this.isOwner ? this.loadRejoinRequests() : Promise.resolve(),
        this.loadLifecycleEvents()
      ]);
      if (!this.isClosed) {
        this.unsubscribeLeague = this.songLeague.subscribeToLeague(leagueId, () => void this.reloadLive());
      }
    } catch (error) {
      if (!this.isCurrentLeague(leagueId, generation)) return;
      this.errorMessage = this.describeError(error, 'The Song League could not be opened.');
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.loadGeneration++;
    this.routeSubscription.unsubscribe();
    this.unsubscribeLeague?.();
    this.unsubscribeLeague = null;
  }

  @HostListener('window:focus')
  refreshNotificationState(): void {
    if (!this.leagueId || this.isSavingNotifications) return;
    void this.pushNotifications.loadSettings().then(settings => {
      this.notificationSettings = settings;
    }).catch(() => undefined);
  }

  async load(
    silent = false,
    leagueId = this.leagueId || this.route.snapshot.paramMap.get('leagueId') || '',
    generation = this.loadGeneration
  ): Promise<void> {
    if (!this.leagueId && leagueId) this.leagueId = leagueId;
    if (!this.isCurrentLeague(leagueId, generation)) return;
    if (!silent) this.isLoading = true;
    this.errorMessage = '';
    try {
      const dashboard = await this.songLeague.loadDashboard(leagueId);
      if (!this.isCurrentLeague(leagueId, generation)) return;
      this.dashboard = dashboard;
      this.memberLimit = dashboard.league.maxMembers;
      if (!this.memberReady && !dashboard.league.isDemo && !dashboard.league.closedAt) {
        await this.songLeague.ensureMemberReadyForLeague(
          leagueId,
          dashboard.league.timezone
        );
        if (!this.isCurrentLeague(leagueId, generation)) return;
        this.memberReady = true;
      }
    } catch (error) {
      if (!this.isCurrentLeague(leagueId, generation)) return;
      this.errorMessage = this.describeError(error, 'The Song League could not be loaded.');
    } finally {
      if (!silent && this.isCurrentLeague(leagueId, generation)) this.isLoading = false;
    }
  }

  retryLoad(): void {
    void this.load();
  }

  get songLeagueNotificationsActive(): boolean {
    return this.notificationSettings.active;
  }

  async toggleSongLeagueNotifications(): Promise<void> {
    if (this.isSavingNotifications) return;
    this.isSavingNotifications = true;
    this.notificationMessage = '';
    try {
      this.notificationSettings = await this.pushNotifications.loadSettings();
      const enabled = !this.notificationSettings.active;
      this.notificationSettings = await this.pushNotifications.setSongLeagueEnabled(enabled);
      this.notificationMessage = enabled
        ? 'Pick-opening notifications are enabled on this device.'
        : 'Song League notifications are turned off.';
    } catch (error) {
      this.notificationMessage = this.describeError(error, 'The notification setting could not be changed.');
    } finally {
      this.isSavingNotifications = false;
    }
  }

  async findSongs(): Promise<void> {
    if (this.songQuery.trim().length < 2 || this.isSearching) return;
    this.isSearching = true;
    this.errorMessage = '';
    this.selectedTrack = null;
    try {
      if (/spotify\.com\/track\/|^spotify:track:/i.test(this.songQuery.trim())) {
        this.selectedTrack = await this.songLeague.loadTrackFromSpotifyUrl(this.songQuery);
        this.searchResults = [];
      } else {
        this.searchResults = await this.songLeague.searchTracks(this.songQuery);
        if (this.searchResults.length === 0) this.errorMessage = 'No Spotify tracks matched that search.';
      }
    } catch (error) {
      this.errorMessage = this.describeError(error, 'Spotify search failed.');
      this.searchResults = [];
    } finally {
      this.isSearching = false;
    }
  }

  selectTrack(track: SongLeagueTrack): void {
    this.selectedTrack = track;
    this.searchResults = [];
  }

  async submitRecommendation(): Promise<void> {
    if (!this.selectedTrack || this.isSubmitting) return;
    this.isSubmitting = true;
    this.errorMessage = '';
    this.successMessage = '';
    this.playlistWarning = '';
    try {
      if (!this.dashboard?.league.isDemo) {
        await this.songLeague.ensureMemberReadyForLeague(
          this.leagueId,
          this.dashboard?.league.timezone || 'Europe/Vienna'
        );
        this.memberReady = true;
      }
      await this.songLeague.submitRecommendation(this.leagueId, this.selectedTrack, !!this.dashboard?.league.isDemo);
      const submittedName = this.selectedTrack.name;
      this.songQuery = '';
      this.selectedTrack = null;
      this.searchResults = [];
      try {
        await this.songLeague.syncWeeklyPlaylists(this.leagueId);
        this.successMessage = `“${submittedName}” is locked in and the league’s enabled Weekly Picks playlists were refreshed.`;
      } catch (error) {
        this.successMessage = `“${submittedName}” is locked in and visible to the league.`;
        this.playlistWarning = `${this.describeError(error, 'The Spotify playlists could not be refreshed immediately.')} The Friday background sync will retry.`;
      }
      await this.load(true);
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The recommendation was not accepted.');
    } finally {
      this.isSubmitting = false;
    }
  }

  async createInvite(): Promise<void> {
    if (this.isCreatingInvite) return;
    this.isCreatingInvite = true;
    this.errorMessage = '';
    try {
      const invitation = await this.songLeague.createInvite(this.leagueId);
      this.inviteUrl = invitation.url;
      this.newInviteId = invitation.id;
      await this.loadActiveInvites();
    } catch (error) {
      this.errorMessage = this.describeError(error, 'A new invitation could not be created.');
    } finally {
      this.isCreatingInvite = false;
    }
  }

  async loadActiveInvites(): Promise<void> {
    if (!this.leagueId || !this.isOwner || this.isLoadingInvites) return;
    this.isLoadingInvites = true;
    try {
      this.activeInvites = await this.songLeague.listActiveInvites(this.leagueId);
    } catch (error) {
      this.errorMessage = this.describeError(error, 'Active invitations could not be loaded.');
    } finally {
      this.isLoadingInvites = false;
    }
  }

  async revokeInvite(inviteId: string): Promise<void> {
    if (!this.isOwner || this.revokingInviteId) return;
    this.revokingInviteId = inviteId;
    this.errorMessage = '';
    try {
      await this.songLeague.revokeInvite(inviteId);
      this.activeInvites = this.activeInvites.filter(invite => invite.id !== inviteId);
      if (this.newInviteId === inviteId) {
        this.newInviteId = '';
        this.inviteUrl = '';
      }
      this.successMessage = 'Invitation revoked.';
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The invitation could not be revoked.');
    } finally {
      this.revokingInviteId = '';
    }
  }

  async revokeAllInvites(): Promise<void> {
    if (!this.isOwner || this.isRevokingAllInvites || this.activeInvites.length === 0) return;
    this.isRevokingAllInvites = true;
    this.errorMessage = '';
    try {
      const revoked = await this.songLeague.revokeAllInvites(this.leagueId);
      this.activeInvites = [];
      this.newInviteId = '';
      this.inviteUrl = '';
      this.successMessage = `${revoked} active ${revoked === 1 ? 'invitation' : 'invitations'} revoked.`;
    } catch (error) {
      this.errorMessage = this.describeError(error, 'Active invitations could not be revoked.');
    } finally {
      this.isRevokingAllInvites = false;
    }
  }

  formatInviteDate(value: string | null): string {
    if (!value) return 'Never';
    return new Intl.DateTimeFormat(undefined, {dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value));
  }

  async saveMemberLimit(): Promise<void> {
    if (!this.dashboard || !this.isOwner || this.isSavingMemberLimit) return;
    const requestedLimit = Math.trunc(Number(this.memberLimit));
    if (requestedLimit < this.dashboard.members.length || requestedLimit < 2 || requestedLimit > 50) {
      this.errorMessage = `Choose between ${Math.max(2, this.dashboard.members.length)} and 50 members.`;
      return;
    }
    this.isSavingMemberLimit = true;
    this.errorMessage = '';
    this.successMessage = '';
    try {
      const savedLimit = await this.songLeague.setMemberLimit(this.dashboard.league.id, requestedLimit);
      this.memberLimit = savedLimit;
      this.dashboard.league.maxMembers = savedLimit;
      this.successMessage = `This league can now have up to ${savedLimit} members.`;
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The member limit could not be changed.');
    } finally {
      this.isSavingMemberLimit = false;
    }
  }

  async loadLifecycleEvents(): Promise<void> {
    if (!this.leagueId || this.isLoadingLifecycle) return;
    this.isLoadingLifecycle = true;
    try {
      this.lifecycleEvents = await this.songLeague.listLifecycleEvents(this.leagueId);
    } catch (error) {
      this.errorMessage = this.describeError(error, 'League activity could not be loaded.');
    } finally {
      this.isLoadingLifecycle = false;
    }
  }

  async loadRejoinRequests(): Promise<void> {
    if (!this.leagueId || !this.isOwner || this.isClosed || this.isLoadingRejoinRequests) return;
    this.isLoadingRejoinRequests = true;
    try {
      this.rejoinRequests = await this.songLeague.listRejoinRequests(this.leagueId);
    } catch (error) {
      this.errorMessage = this.describeError(error, 'Rejoin requests could not be loaded.');
    } finally {
      this.isLoadingRejoinRequests = false;
    }
  }

  async respondToRejoin(request: SongLeagueRejoinRequest, decision: 'approved' | 'declined'): Promise<void> {
    if (!this.isOwner || request.status !== 'pending' || this.respondingRejoinId) return;
    this.respondingRejoinId = request.id;
    this.errorMessage = '';
    try {
      await this.songLeague.respondToRejoinRequest(request.id, decision);
      this.successMessage = decision === 'approved'
        ? `${request.displayName} can use an invitation to rejoin for the next 24 hours.`
        : `${request.displayName}’s rejoin request was declined.`;
      await this.loadRejoinRequests();
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The rejoin request could not be updated.');
    } finally {
      this.respondingRejoinId = '';
    }
  }

  openLifecycleModal(
    action: 'leave' | 'remove' | 'transfer' | 'close',
    target: SongLeagueMember | null = null
  ): void {
    if (this.isClosed || (action !== 'leave' && !this.isOwner)) return;
    this.lifecycleAction = action;
    this.lifecycleTarget = target;
    this.showLifecycleModal = true;
  }

  closeLifecycleModal(): void {
    if (this.isApplyingLifecycle) return;
    this.showLifecycleModal = false;
    this.lifecycleAction = null;
    this.lifecycleTarget = null;
  }

  async confirmLifecycleAction(): Promise<void> {
    if (!this.lifecycleAction || this.isApplyingLifecycle) return;
    const action = this.lifecycleAction;
    const target = this.lifecycleTarget;
    this.isApplyingLifecycle = true;
    this.errorMessage = '';
    this.successMessage = '';
    try {
      if (action === 'leave') {
        await this.songLeague.leaveLeague(this.leagueId);
        this.showLifecycleModal = false;
        await this.router.navigate(['/song-league']);
        return;
      }
      if (action === 'remove' && target) {
        await this.songLeague.removeMember(this.leagueId, target.userId);
        this.successMessage = `${target.displayName} was removed from the league.`;
      } else if (action === 'transfer' && target) {
        await this.songLeague.transferOwnership(this.leagueId, target.userId);
        this.successMessage = `${target.displayName} is now the league owner.`;
      } else if (action === 'close') {
        await this.songLeague.closeLeague(this.leagueId);
        this.unsubscribeLeague?.();
        this.unsubscribeLeague = null;
        this.successMessage = 'The league is closed. Its history is now read-only.';
      }
      this.showLifecycleModal = false;
      this.lifecycleAction = null;
      this.lifecycleTarget = null;
      await this.load(true);
      await this.loadLifecycleEvents();
    } catch (error) {
      this.showLifecycleModal = false;
      this.errorMessage = this.describeError(error, 'The league could not be changed.');
    } finally {
      this.isApplyingLifecycle = false;
    }
  }

  lifecycleLabel(event: SongLeagueLifecycleEvent): string {
    switch (event.action) {
      case 'member_left': return `${event.subjectDisplayName || 'A member'} left`;
      case 'member_removed': return `${event.actorDisplayName} removed ${event.subjectDisplayName || 'a member'}`;
      case 'ownership_transferred': return `${event.actorDisplayName} transferred ownership to ${event.subjectDisplayName || 'a member'}`;
      case 'league_closed': return `${event.actorDisplayName} closed the league`;
    }
  }

  async createWeeklyPlaylist(): Promise<void> {
    if (this.isCreatingPlaylist) return;
    this.isCreatingPlaylist = true;
    this.errorMessage = '';
    this.successMessage = '';
    try {
      await this.songLeague.syncWeeklyPlaylists(this.leagueId, true);
      this.successMessage = 'Your private Weekly Picks playlist is ready and will update automatically.';
      await this.load(true);
    } catch (error) {
      this.errorMessage = this.describeError(error, 'Your Spotify playlist could not be created.');
    } finally {
      this.isCreatingPlaylist = false;
    }
  }

  async copyInvite(): Promise<void> {
    if (!this.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(this.inviteUrl);
      this.inviteCopied = true;
      window.setTimeout(() => this.inviteCopied = false, 2_000);
    } catch {
      this.errorMessage = 'The invitation could not be copied.';
    }
  }

  openDeleteLeagueModal(): void {
    if (this.isOwner) this.showDeleteLeagueModal = true;
  }

  closeDeleteLeagueModal(): void {
    if (!this.isDeletingLeague) this.showDeleteLeagueModal = false;
  }

  async confirmDeleteLeague(): Promise<void> {
    if (!this.isOwner || this.isDeletingLeague) return;
    this.isDeletingLeague = true;
    this.errorMessage = '';
    try {
      await this.songLeague.deleteLeague(this.leagueId);
      this.unsubscribeLeague?.();
      this.unsubscribeLeague = null;
      this.showDeleteLeagueModal = false;
      await this.router.navigate(['/song-league']);
    } catch (error) {
      this.showDeleteLeagueModal = false;
      this.errorMessage = this.describeError(error, 'The Song League could not be deleted.');
    } finally {
      this.isDeletingLeague = false;
    }
  }

  openBreakdown(standing: SongLeagueStanding): void {
    this.selectedStanding = standing;
  }

  closeBreakdown(): void {
    this.selectedStanding = null;
  }

  recommendationRows(recommendationId: string): SongLeagueScoreBreakdown[] {
    if (!this.dashboard) return [];
    return (this.dashboard.breakdownByRecommender.get(
      this.dashboard.recommendations.find(item => item.id === recommendationId)?.recommenderUserId || ''
    ) || []).filter(row => row.recommendationId === recommendationId);
  }

  breakdownRowsForSelected(): SongLeagueScoreBreakdown[] {
    if (!this.dashboard || !this.selectedStanding) return [];
    return this.dashboard.breakdownByRecommender.get(this.selectedStanding.userId) || [];
  }

  recommendationPoints(recommendationId: string): number {
    return this.recommendationRows(recommendationId).reduce((sum, row) => sum + row.totalPoints, 0);
  }

  recommenderName(userId: string): string {
    return this.dashboard?.members.find(member => member.userId === userId)?.displayName || 'League member';
  }

  get currentUserPlaylist(): SongLeaguePlaylist | null {
    return this.dashboard?.playlists.find(playlist => playlist.userId === this.currentUserId) || null;
  }

  recommendationStatus(recommendation: SongLeagueRecommendation): string {
    const now = Date.now();
    if (now < new Date(recommendation.scoringStartsAt).getTime()) return 'Starts Saturday';
    const remaining = Math.max(0, new Date(recommendation.scoringEndsAt).getTime() - now);
    const days = Math.max(1, Math.ceil(remaining / 86_400_000));
    return `${days} ${days === 1 ? 'day' : 'days'} left`;
  }

  get isFriday(): boolean {
    return !!this.dashboard && this.songLeague.isFridayInTimezone(this.dashboard.league.timezone);
  }

  get alreadySubmittedToday(): boolean {
    if (!this.dashboard || !this.isFriday) return false;
    return this.dashboard.recommendations.some(item =>
      item.recommenderUserId === this.currentUserId && this.sameLeagueDay(item.submittedAt, new Date())
    );
  }

  get alreadySubmittedDemoPick(): boolean {
    if (!this.dashboard?.league.isDemo) return false;
    return this.dashboard.recommendations.some(item => item.recommenderUserId === this.currentUserId);
  }

  get isPickOpen(): boolean {
    if (this.isClosed) return false;
    return this.dashboard?.league.isDemo
      ? !this.alreadySubmittedDemoPick
      : this.isFriday && !this.alreadySubmittedToday;
  }

  get pickStatusLabel(): string {
    if (this.dashboard?.league.isDemo) return this.isPickOpen ? 'Demo pick open' : 'Demo pick complete';
    return this.isPickOpen ? 'Picks open' : 'Picks open again Friday';
  }

  get isOwner(): boolean {
    return this.dashboard?.league.ownerUserId === this.currentUserId;
  }

  get isClosed(): boolean {
    return !!this.dashboard?.league.closedAt;
  }

  get selectedTrackImage(): string {
    return this.selectedTrack?.album?.images?.[0]?.url || '';
  }

  trackRecommendation(_: number, recommendation: SongLeagueRecommendation): string {
    return recommendation.id;
  }

  trackStanding(_: number, standing: SongLeagueStanding): string {
    return standing.userId;
  }

  trackSearch(_: number, track: SongLeagueTrack): string {
    return track.id;
  }

  trackBreakdown(_: number, row: SongLeagueScoreBreakdown): string {
    return `${row.recommendationId}:${row.listenerUserId}`;
  }

  back(): void {
    void this.router.navigate(['/song-league']);
  }

  private async reloadLive(): Promise<void> {
    const leagueId = this.leagueId;
    const generation = this.loadGeneration;
    if (this.isReloading) {
      this.reloadPending = true;
      return;
    }
    this.isReloading = true;
    try {
      do {
        this.reloadPending = false;
        await this.load(true, leagueId, generation);
        if (!this.isCurrentLeague(leagueId, generation)) return;
      } while (this.reloadPending);
    } finally {
      this.isReloading = false;
    }
  }

  private isCurrentLeague(leagueId: string, generation: number): boolean {
    return !this.destroyed && this.leagueId === leagueId && this.loadGeneration === generation;
  }

  private sameLeagueDay(value: string, now: Date): boolean {
    const timezone = this.dashboard?.league.timezone || 'Europe/Vienna';
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
    });
    return formatter.format(new Date(value)) === formatter.format(now);
  }

  private describeError(error: unknown, fallback: string): string {
    return (error as any)?.message || (error as any)?.details || fallback;
  }
}
