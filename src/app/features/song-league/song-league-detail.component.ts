import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';

import {
  SongLeagueDashboard,
  SongLeaguePlaylist,
  SongLeagueRecommendation,
  SongLeagueScoreBreakdown,
  SongLeagueStanding,
  SongLeagueTrack
} from '@core/song-league/song-league.models';
import {SongLeagueService} from '@core/song-league/song-league.service';

@Component({
  selector: 'app-song-league-detail',
  templateUrl: './song-league-detail.component.html'
})
export class SongLeagueDetailComponent implements OnInit, OnDestroy {
  dashboard: SongLeagueDashboard | null = null;
  currentUserId = '';
  isLoading = true;
  isReloading = false;
  errorMessage = '';
  successMessage = '';
  playlistWarning = '';

  songQuery = '';
  searchResults: SongLeagueTrack[] = [];
  selectedTrack: SongLeagueTrack | null = null;
  isSearching = false;
  isSubmitting = false;
  isCreatingPlaylist = false;

  inviteUrl = '';
  inviteCopied = false;
  isCreatingInvite = false;
  showDeleteLeagueModal = false;
  isDeletingLeague = false;
  selectedStanding: SongLeagueStanding | null = null;

  private leagueId = '';
  private unsubscribeLeague: (() => void) | null = null;
  private reloadPending = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private songLeague: SongLeagueService
  ) {}

  async ngOnInit(): Promise<void> {
    this.leagueId = this.route.snapshot.paramMap.get('leagueId') || '';
    try {
      this.currentUserId = await this.songLeague.currentUserId();
      this.unsubscribeLeague = this.songLeague.subscribeToLeague(this.leagueId, () => void this.reloadLive());
      await this.load();
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The Song League could not be opened.');
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    this.unsubscribeLeague?.();
    this.unsubscribeLeague = null;
  }

  async load(silent = false): Promise<void> {
    if (!silent) this.isLoading = true;
    this.errorMessage = '';
    try {
      this.dashboard = await this.songLeague.loadDashboard(this.leagueId);
    } catch (error) {
      this.errorMessage = this.describeError(error, 'The Song League could not be loaded.');
    } finally {
      if (!silent) this.isLoading = false;
    }
  }

  retryLoad(): void {
    void this.load();
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
      await this.songLeague.submitRecommendation(this.leagueId, this.selectedTrack);
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
      const invitation = await this.songLeague.rotateInvite(this.leagueId);
      this.inviteUrl = invitation.url;
    } catch (error) {
      this.errorMessage = this.describeError(error, 'A new invitation could not be created.');
    } finally {
      this.isCreatingInvite = false;
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

  get isOwner(): boolean {
    return this.dashboard?.league.ownerUserId === this.currentUserId;
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
    if (this.isReloading) {
      this.reloadPending = true;
      return;
    }
    this.isReloading = true;
    try {
      do {
        this.reloadPending = false;
        await this.load(true);
      } while (this.reloadPending);
    } finally {
      this.isReloading = false;
    }
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
