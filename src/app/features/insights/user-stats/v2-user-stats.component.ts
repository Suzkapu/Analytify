import {afterEveryRender, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Optional} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {Location} from '@angular/common';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {SharedModule} from '@shared/shared.module';
import {V2ButtonDirective, V2PageComponent, V2SearchFiltersComponent, V2StateComponent, V2TabsComponent, V2ToolbarComponent, V2SnapshotCalendarComponent, V2SnapshotFeedbackComponent, V2SnapshotDateFieldComponent, V2SearchPastToggleComponent} from '@shared/ui-v2';
import {V2StatsRankingRowComponent} from '@shared/ui-v2/v2-stats-ranking-row.component';
import {V2GenreRankingsComponent} from '@shared/ui-v2/v2-genre-rankings.component';
import {V2RankHistoryPopupComponent} from '@shared/ui-v2/v2-rank-history-popup.component';
import {V2CurrentStatsFeedbackComponent} from '@shared/ui-v2/v2-current-stats-feedback.component';
import {UserStatsController} from './user-stats.component';
import {UserStatsUiModule} from './user-stats.module';

@Component({
  selector: 'app-v2-user-stats', standalone: true,
  imports: [SharedModule, UserStatsUiModule, V2ButtonDirective, V2PageComponent,
    V2SearchFiltersComponent, V2StateComponent, V2TabsComponent, V2ToolbarComponent, V2StatsRankingRowComponent, V2GenreRankingsComponent, V2RankHistoryPopupComponent, V2SnapshotCalendarComponent, V2SnapshotFeedbackComponent, V2SnapshotDateFieldComponent, V2SearchPastToggleComponent, V2CurrentStatsFeedbackComponent],
  template: `
    <v2-page appearance="canonical" [title]="statsPageTitle" [description]="statsPageDescription"
      [showDescriptionOnMobile]="false" [showBack]="isSpyMode" (backRequested)="backFromSharedStats()">
      <section class="stats-choice-controls" aria-label="Statistics controls">
        <v2-tabs id="stats-range" caption="Period" label="Ranking period" appearance="controls" [tabs]="rangeTabs" [selected]="selectedRange" (selectedChange)="changeRange($event)" />
        <v2-tabs id="stats-category" caption="Category" label="Ranking category" appearance="sections" [tabs]="categoryTabs" [selected]="selectedCategory" (selectedChange)="changeCategoryValue($event)" />
      </section>
      <v2-toolbar class="stats-search-controls" appearance="plain" label="Search rankings">
        <v2-search-filters id="v2-stats-search" [labelVisible]="false" [label]="statsSearchPlaceholder" [placeholder]="statsSearchPlaceholder" [query]="statsSearchQuery" (queryChange)="onStatsSearchChange($event)" />
        @if (!isSpyMode) {
          <button type="button" v2Button="secondary" class="compare-dates" [attr.aria-expanded]="showComparisonControls" aria-controls="v2-stats-dates" (click)="toggleComparisonControls()"><span class="calendar-icon"><img src="assets/design-v2/stats-calendar-action.svg" alt=""></span>Compare dates</button>
          <v2-search-past-toggle label="Search past rankings" [checked]="includePastStatsSearch" (checkedChange)="changePastSearchEnabled($event)" /> }
      </v2-toolbar>
      @if (!isSpyMode && showComparisonControls) {
        <section id="v2-stats-dates" class="v2-stats-dates" aria-label="Ranking date comparison">
          <v2-snapshot-date-field label="Ranking date" [value]="getSelectedSnapshotLabel()" [expanded]="showHistoryMenu" (open)="openSnapshotCalendar('ranking')" />
          <v2-snapshot-date-field label="Compare with" [value]="getCompareSnapshotLabel()" [expanded]="showCompareMenu" (open)="openSnapshotCalendar('comparison')" />
        </section>
      }
      @if (isLoading) {
        <v2-current-stats-feedback state="loading" [shared]="isSpyMode" />
      } @else if (sharedStatsError) {
        <v2-current-stats-feedback state="unavailable" [shared]="true" [message]="sharedStatsError" (retry)="retryCurrentStats()" />
      } @else if (currentStatsLoadFailed && selectedSnapshotId === 'current' && !hasCurrentRankings) {
        <v2-current-stats-feedback state="unavailable" (retry)="retryCurrentStats()" />
      } @else {
        @if (!isSpyMode && selectedSnapshotId === 'current') {
          @if (isRefreshingStats) { <v2-current-stats-feedback state="refreshing" /> }
          @else if (currentStatsLoadFailed) { <v2-current-stats-feedback state="refresh-failed" (retry)="retryCurrentStats()" /> }
        }
        @if (includePastStatsSearch && statsSearchQuery.trim().length >= 2 && selectedSnapshotId === 'current' && !isSpyMode) {
          <section class="v2-past-results" aria-live="polite"><h2>Historical ranking matches</h2>
            @if (isSearchingPastStats) { <v2-state kind="loading" title="Searching saved rankings…" /> }
            @else if (pastStatsSearchError || !pastTopResults.length) { <p>{{ pastStatsSearchError || 'No former ranking matches this search.' }}</p> }
            @else { <div class="v2-past-grid">@for (item of pastTopResults; track item.kind + ':' + item.id) { <button type="button" (click)="openPastTopResult(item)">@if (item.imageUrl) { <img [src]="item.imageUrl" width="48" height="48" alt=""> }<span><strong>{{ item.name }}</strong><small>{{ item.subtitle }}</small></span><i class="pi pi-chart-line" aria-hidden="true"></i></button> }</div> }
          </section>
        }
        @if (rankingFeedback; as state) {
          <v2-snapshot-feedback (click)="$event.stopPropagation()" [state]="state" target="ranking" (retry)="retrySnapshot('ranking')" (chooseDate)="openSnapshotCalendar('ranking')" />
        } @else {
        <section class="stats-resolved-results" aria-label="Rankings">
        @if (comparisonFeedback; as state) {
          <v2-snapshot-feedback (click)="$event.stopPropagation()" [state]="state" target="comparison" (retry)="retrySnapshot('comparison')" (chooseDate)="openSnapshotCalendar('comparison')" />
        }
        <h2 class="stats-results-heading">{{ statsResultsHeading }}</h2>
        @if (selectedCategory === 'tracks') {
          @if (!filteredTracks.length) { <v2-current-stats-feedback state="empty" category="tracks" /> }
          <div class="v2-ranking-list">
            @for (track of filteredTracks; track trackStatItem($index, track)) {
              <v2-stats-ranking-row class="v2-ranking-row" kind="tracks"
                [name]="track.name" [rank]="getStatsRankIndex(track, 'tracks') + 1"
                [imageUrl]="getTrackCover(track)" [spotifyAvailable]="!!getTrackUrl(track)"
                [supporting]="getTrackArtist(track)" [movement]="comparisonResolved ? movementLabel(getTrend(track, getStatsRankIndex(track, 'tracks'), 'tracks')) : ''"
                [flameKind]="comparisonResolved && isHotMover(track, 'tracks') ? (isHighDebutHotSong(track) ? 'debut' : 'hot') : null"
                [historyAvailable]="!isSpyMode" (spotifyRequested)="openTrackClick(getTrackUrl(track))"
                (historyRequested)="openTrendPopup(track, 'tracks')" />
            }
          </div>
          @if (!isSpyMode && filteredTracks.length) { <div class="stats-playlist-action"><button type="button" v2Button="primary" class="stats-create-playlist" [loading]="isCreatingPlaylist" (click)="createTopPlaylist()"><i class="pi pi-list" aria-hidden="true"></i>Create playlist from these songs</button></div> }
        } @else if (selectedCategory === 'artists') {
          @if (!filteredArtists.length) { <v2-current-stats-feedback state="empty" category="artists" /> }
          <div class="v2-artist-rankings">
            @for (artist of filteredArtists; track trackStatItem($index, artist)) {
              <v2-stats-ranking-row class="v2-ranked-artist" kind="artists"
                [name]="artist.name" [rank]="getStatsRankIndex(artist, 'artists') + 1"
                [imageUrl]="getArtistImage(artist)" [spotifyAvailable]="!!getArtistUrl(artist)"
                [movement]="comparisonResolved ? movementLabel(getTrend(artist, getStatsRankIndex(artist, 'artists'), 'artists')) : ''"
                [flameKind]="comparisonResolved && isHotMover(artist, 'artists') ? (isHighDebutHotArtist(artist) ? 'debut' : 'hot') : null"
                [historyAvailable]="!isSpyMode" (spotifyRequested)="openArtistClick(getArtistUrl(artist))"
                (historyRequested)="openTrendPopup(artist, 'artists')" />
            }
          </div>
        } @else {
          @if (!filteredGenres.length) { <v2-current-stats-feedback state="empty" category="genres" /> }
          @if (filteredGenres.length) {
            <v2-genre-rankings [genres]="filteredGenres" [scaleGenres]="displayedGenres"
              [historyAvailable]="!isSpyMode" [comparisonResolved]="comparisonResolved" (historyRequested)="openTrendPopup($event, 'genres')" />
          }
        }
        </section>
        }
        @if (playlistCreationSuccessMessage) { <p class="v2-action-success" role="status">{{ playlistCreationSuccessMessage }}</p> }
        @if (playlistCreationError) { <p class="v2-action-error" role="alert">{{ playlistCreationError }}</p> }
      }
    </v2-page>
    @if (!isSpyMode && showHistoryMenu) {
      <v2-snapshot-calendar target="ranking" [state]="historyMetadataState" [days]="historyCalendarDays" [month]="historyCalendarMonthLabel"
        [canPrevious]="canNavigateHistoryCalendar(-1)" [canNext]="canNavigateHistoryCalendar(1)" [allowToday]="true"
        (dateSelected)="selectHistoryCalendarDay($event.day, $event.event)" (monthChanged)="navigateHistoryCalendar($event.direction, $event.event)"
        (today)="selectHistorySnapshot('current', $event)" (retry)="retryCalendarMetadata()" (dismiss)="closeSnapshotCalendars()" />
    } @else if (!isSpyMode && showCompareMenu) {
      <v2-snapshot-calendar target="comparison" [state]="historyMetadataState" [days]="compareCalendarDays" [month]="compareCalendarMonthLabel"
        [canPrevious]="canNavigateCompareCalendar(-1)" [canNext]="canNavigateCompareCalendar(1)" [allowToday]="selectedSnapshotId !== 'current'"
        (dateSelected)="selectCompareCalendarDay($event.day, $event.event)" (monthChanged)="navigateCompareCalendar($event.direction, $event.event)"
        (today)="selectComparisonToday($event)" (retry)="retryCalendarMetadata()" (dismiss)="closeSnapshotCalendars()" />
    }
    @if (showTrendPopup && !isSpyMode) {
      <v2-rank-history-popup [title]="historyPopupTitle" [context]="historyPopupContextKey" [category]="trendPopupCategory"
        [points]="trendPopupPoints" [busy]="isLoadingTrendData" [failed]="trendPopupLoadFailed" [retrying]="isRetryingTrend"
        (retry)="retryTrendPopup()" (dismiss)="closeTrendPopup()" />
    }
  `,
  styleUrl: './v2-user-stats.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class V2UserStatsComponent extends UserStatsController {
  protected override readonly showLocalTrendDuringLoad = true;
  isRetryingTrend = false;
  showComparisonControls = false;
  private retryFocusContext = '';
  private retryFocusTarget: HTMLElement | null = null;
  private statsDisposed = false;
  get hasCurrentRankings(): boolean { return !!(this.topTracks.length || this.topArtists.length || this.topGenres.length); }
  retryCurrentStats(): void {
    if (this.statsDisposed || this.isLoading || this.isRefreshingStats || (!this.currentStatsLoadFailed && !this.sharedStatsError)) return;
    if (!this.isSpyMode && this.selectedSnapshotId !== 'current') return;
    // Set busy before hydration yields, so a captured Retry handler is single-flight.
    this.isLoading = this.isSpyMode || !this.hasCurrentRankings;
    this.isRefreshingStats = !this.isLoading;
    this.retryFocusContext = this.currentFocusContext();
    this.retryFocusTarget = this.statsElement?.nativeElement.ownerDocument.activeElement as HTMLElement | null;
    void this.loadStats();
  }
  changePastSearchEnabled(enabled: boolean): void {
    if (this.isSpyMode || enabled === this.includePastStatsSearch) return;
    this.togglePastStatsSearch();
  }
  readonly rangeTabs = [{id: 'short_term', label: '4 weeks'}, {id: 'medium_term', label: '6 months'}, {id: 'long_term', label: '1 year'}];
  readonly categoryTabs = [
    {id: 'tracks', label: 'Songs', iconUrl: 'assets/design-v2/stats-category-songs.svg'},
    {id: 'artists', label: 'Artists', iconUrl: 'assets/design-v2/stats-category-user.svg'},
    {id: 'genres', label: 'Genres', iconUrl: 'assets/design-v2/stats-category-star.svg'}
  ];
  constructor(spotifyData: SpotifyDataService, auth: SpotifyAuthService, storage: StorageService, private readonly historySupabase: SupabaseService,
    @Optional() route?: ActivatedRoute, @Optional() statsSharing?: StatsSharingService,
    @Optional() changeDetector?: ChangeDetectorRef, @Optional() participantSpotify?: ParticipantSpotifyService,
    @Optional() private readonly statsLocation?: Location,
    @Optional() private readonly statsElement?: ElementRef<HTMLElement>) {
    super(spotifyData, auth, storage, historySupabase, route, statsSharing, changeDetector, participantSpotify);
    if (statsElement) afterEveryRender(() => this.restoreCurrentRetryFocus());
  }
  private currentFocusContext(): string {
    return JSON.stringify([this.selectedRange, this.selectedSnapshotId, this.spyOwnerUserId, this.authService.getUserId(), this.authService.getSupabaseUserId()]);
  }
  private restoreCurrentRetryFocus(): void {
    if (!this.retryFocusContext || this.statsDisposed) return;
    const root = this.statsElement!.nativeElement, active = root.ownerDocument.activeElement;
    if (this.retryFocusContext !== this.currentFocusContext()
      || (active !== root.ownerDocument.body && active !== this.retryFocusTarget && !this.retryFocusTarget?.contains(active))) {
      this.retryFocusContext = ''; return;
    }
    const pendingOrFailed = this.isLoading || this.isRefreshingStats || this.currentStatsLoadFailed || !!this.sharedStatsError;
    // The rendered template always supplies feedback while pending/failed, or a results heading.
    const target = root.querySelector<HTMLElement>(pendingOrFailed ? 'v2-current-stats-feedback section' : '.stats-results-heading')!;
    target.tabIndex = -1;
    if (active !== target) target.focus();
    this.retryFocusTarget = target;
    if (!this.isLoading && !this.isRefreshingStats) this.retryFocusContext = '';
  }
  override ngOnDestroy(): void {
    this.statsDisposed = true; this.retryFocusContext = ''; this.retryFocusTarget = null;
    super.ngOnDestroy();
  }
  get statsPageTitle(): string {
    return this.isSpyMode ? `${this.spyDisplayName || 'Shared'} · Listening stats` : 'Your top listening';
  }
  get statsPageDescription(): string {
    if (!this.isSpyMode) return 'Your songs, artists and genres, ranked over time.';
    const date = this.savedDate(this.spySnapshotDate);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return 'Read-only listening snapshot' + (date ? ` · Refreshed ${date.getUTCDate()} ${months[date.getUTCMonth()]}` : '');
  }
  get statsResultsHeading(): string {
    return this.selectedCategory === 'artists' ? 'Top artists' : this.selectedCategory === 'genres' ? 'Top genres' : 'Top songs';
  }
  backFromSharedStats(): void { if (this.isSpyMode) this.statsLocation?.back(); }
  private savedDate(dateKey: unknown): Date | null {
    if (typeof dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
    const date = new Date(`${dateKey}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === dateKey ? date : null;
  }
  override getSelectedSnapshotLabel(): string {
    return this.snapshotDateLabel(this.selectedSnapshotId, super.getSelectedSnapshotLabel());
  }
  override getCompareSnapshotLabel(): string {
    return this.snapshotDateLabel(this.compareSnapshotId, super.getCompareSnapshotLabel());
  }
  private snapshotDateLabel(id: string, fallback: string): string {
    if (!id || id === 'current') return fallback;
    const dateKey = this.snapshotOptions.find(option => option.id === id)?.dateKey;
    const date = this.savedDate(dateKey);
    if (!date) return fallback;
    // Canonical English month labels stay identical across browser locale-data versions.
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
  }
  protected override async loadTrendCloud(userId: string, range: string, category: 'tracks' | 'artists' | 'genres', identities: string[]): Promise<any[]> {
    const result = await this.historySupabase.loadStatsItemTrendResult(userId, range, category, identities);
    if (result.status === 'unavailable') throw new Error('Saved position history is unavailable.');
    return result.points;
  }
  override async openTrendPopup(item: any, category: 'tracks' | 'artists' | 'genres'): Promise<void> {
    if (this.isSpyMode) return;
    this.isRetryingTrend = false;
    await super.openTrendPopup(item, category);
  }
  async retryTrendPopup(): Promise<void> {
    if (!this.showTrendPopup || this.isSpyMode || this.isLoadingTrendData || !this.trendPopupLoadFailed) return;
    this.isRetryingTrend = true;
    const request = super.openTrendPopup(this.trendPopupItem, this.trendPopupCategory);
    const sequence = this.trendLoadSequence;
    try { await request; }
    finally { if (sequence === this.trendLoadSequence) this.isRetryingTrend = false; }
  }
  override closeTrendPopup(event?: Event): void {
    this.isRetryingTrend = false;
    super.closeTrendPopup(event);
  }
  get historyPopupTitle(): string { return typeof this.trendPopupItem === 'string' ? this.trendPopupItem : this.trendPopupItem?.name || ''; }
  get historyPopupContextKey(): string { return [this.selectedRange, this.trendPopupCategory, this.trendPopupItem?.id || this.historyPopupTitle].join(':'); }
  override changeRange(range: string): void {
    if (range !== this.selectedRange) {
      this.closeSnapshotCalendars();
      if (this.showTrendPopup) this.closeTrendPopup();
    }
    super.changeRange(range);
  }
  toggleComparisonControls(): void {
    if (this.isSpyMode) return;
    this.showComparisonControls = !this.showComparisonControls;
    if (!this.showComparisonControls) this.closeSnapshotCalendars();
  }
  get rankingFeedback(): 'loading' | 'empty' | 'unavailable' | null {
    if (this.isSpyMode || this.selectedSnapshotId === 'current') return null;
    const state = this.getSnapshotDetailState(this.selectedSnapshotId);
    return state === 'ready' ? null : state;
  }
  get comparisonFeedback(): 'loading' | 'empty' | 'unavailable' | null {
    if (this.isSpyMode || !this.compareSnapshotId) return null;
    const state = this.getSnapshotDetailState(this.compareSnapshotId);
    return state === 'ready' ? null : state;
  }
  get comparisonResolved(): boolean { return this.comparisonFeedback === null; }
  retrySnapshot(target: 'ranking' | 'comparison'): void {
    if (this.isSpyMode) return;
    const id = target === 'ranking' ? this.selectedSnapshotId : this.compareSnapshotId;
    if (this.getSnapshotDetailState(id) === 'unavailable') this.ensureSnapshotLoaded(id);
  }
  openSnapshotCalendar(target: 'ranking' | 'comparison'): void {
    if (this.isSpyMode) return;
    this.closeSnapshotCalendars();
    if (target === 'ranking') this.toggleHistoryMenu(new Event('click'));
    else this.toggleCompareMenu(new Event('click'));
  }
  closeSnapshotCalendars(): void { this.showHistoryMenu = false; this.showCompareMenu = false; }
  selectComparisonToday(event: Event): void {
    if (!this.isSpyMode && this.getCompareOptions().some(option => option.id === 'current')) this.selectCompareSnapshot('current', event);
  }
  retryCalendarMetadata(): void {
    if (!this.isSpyMode && (this.historyMetadataState === 'unavailable' || this.historyMetadataState === 'refresh-failed')) this.loadHistoryData();
  }
  changeCategoryValue(value: string): void { this.changeCategory(value as 'tracks' | 'artists' | 'genres'); }
  selectHistoryValue(value: string): void { this.selectHistorySnapshot(value, new Event('change')); }
  selectCompareValue(value: string): void { this.selectCompareSnapshot(value, new Event('change')); }
}
