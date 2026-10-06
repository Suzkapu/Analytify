import {ChangeDetectionStrategy, ChangeDetectorRef, Component, Optional} from '@angular/core';
import {ActivatedRoute} from '@angular/router';
import {SpotifyAuthService} from '@core/auth/spotify-auth.service';
import {ParticipantSpotifyService} from '@core/compare-room/participant-spotify.service';
import {SpotifyDataService} from '@core/data-access/spotify/spotify-data.service';
import {StorageService} from '@core/data-access/storage/storage.service';
import {SupabaseService} from '@core/data-access/supabase/supabase.service';
import {StatsSharingService} from '@core/sharing/stats-sharing.service';
import {SharedModule} from '@shared/shared.module';
import {V2ButtonDirective, V2PageComponent, V2SearchFiltersComponent, V2StateComponent, V2TabsComponent, V2ToolbarComponent} from '@shared/ui-v2';
import {V2StatsRankingRowComponent} from '@shared/ui-v2/v2-stats-ranking-row.component';
import {V2GenreRankingsComponent} from '@shared/ui-v2/v2-genre-rankings.component';
import {V2RankHistoryPopupComponent} from '@shared/ui-v2/v2-rank-history-popup.component';
import {UserStatsController} from './user-stats.component';
import {UserStatsUiModule} from './user-stats.module';

@Component({
  selector: 'app-v2-user-stats', standalone: true,
  imports: [SharedModule, UserStatsUiModule, V2ButtonDirective, V2PageComponent,
    V2SearchFiltersComponent, V2StateComponent, V2TabsComponent, V2ToolbarComponent, V2StatsRankingRowComponent, V2GenreRankingsComponent, V2RankHistoryPopupComponent],
  template: `
    <v2-page [eyebrow]="isSpyMode ? 'Approved shared access' : 'Personal listening'"
      [title]="isSpyMode ? ((spyDisplayName || 'Shared') + ' top listening') : 'Your top listening'"
      description="See top songs, artists, and genres, and how their rankings change.">
      @if (isRefreshingStats && !isSpyMode) { <p class="v2-stats-refresh" role="status"><i class="pi pi-spin pi-spinner"></i> Refreshing this range while cached stats stay visible…</p> }
      <v2-toolbar v2PageToolbar label="Statistics controls">
        <v2-tabs id="stats-range" label="Ranking period" appearance="segmented" [tabs]="rangeTabs" [selected]="selectedRange" (selectedChange)="changeRange($event)" />
        @if (snapshotOptions.length) {
          <label class="v2-stats-select">Ranking date<select [ngModel]="selectedSnapshotId" (ngModelChange)="selectHistoryValue($event)"><option value="current">Current</option>@for (option of snapshotOptions; track option.id) { <option [value]="option.id">{{ option.label }}</option> }</select></label>
          <label class="v2-stats-select">Compare against<select [ngModel]="compareSnapshotId" (ngModelChange)="selectCompareValue($event)"><option value="">Previous available date</option>@for (option of snapshotOptions; track option.id) { <option [value]="option.id" [disabled]="option.id === selectedSnapshotId">{{ option.label }}</option> }</select></label>
        }
      </v2-toolbar>
      <v2-tabs v2PageTabs id="stats-category" label="Ranking category" [tabs]="categoryTabs" [selected]="selectedCategory" (selectedChange)="changeCategoryValue($event)" />
      <v2-toolbar label="Search rankings">
        <v2-search-filters id="v2-stats-search" [label]="statsSearchPlaceholder" [placeholder]="statsSearchPlaceholder" [query]="statsSearchQuery" (queryChange)="onStatsSearchChange($event)" />
        @if (!isSpyMode) { <button type="button" v2Button="secondary" [attr.aria-pressed]="includePastStatsSearch" (click)="togglePastStatsSearch()"><i class="pi pi-history" aria-hidden="true"></i> Search past</button> }
      </v2-toolbar>
      @if (isLoading) {
        <v2-state kind="loading" [title]="isSpyMode ? 'Loading shared Spotify insights…' : 'Loading your Spotify insights…'" />
      } @else if (sharedStatsError) {
        <v2-state kind="error" icon="pi-lock" title="Shared stats unavailable" [message]="sharedStatsError" />
      } @else {
        @if (includePastStatsSearch && statsSearchQuery.trim().length >= 2 && selectedSnapshotId === 'current' && !isSpyMode) {
          <section class="v2-past-results" aria-live="polite"><h2>Historical ranking matches</h2>
            @if (isSearchingPastStats) { <v2-state kind="loading" title="Searching saved rankings…" /> }
            @else if (pastStatsSearchError || !pastTopResults.length) { <p>{{ pastStatsSearchError || 'No former ranking matches this search.' }}</p> }
            @else { <div class="v2-past-grid">@for (item of pastTopResults; track item.kind + ':' + item.id) { <button type="button" (click)="openPastTopResult(item)">@if (item.imageUrl) { <img [src]="item.imageUrl" width="48" height="48" alt=""> }<span><strong>{{ item.name }}</strong><small>{{ item.subtitle }}</small></span><i class="pi pi-chart-line" aria-hidden="true"></i></button> }</div> }
          </section>
        }
        @if (selectedCategory === 'tracks') {
          @if (!filteredTracks.length) { <v2-state icon="pi-search" title="No top songs found" message="Try another search, date, or ranking period." /> }
          <div class="v2-ranking-list">
            @for (track of filteredTracks; track trackStatItem($index, track)) {
              <v2-stats-ranking-row class="v2-ranking-row" kind="tracks"
                [name]="track.name" [rank]="getStatsRankIndex(track, 'tracks') + 1"
                [imageUrl]="getTrackCover(track)" [spotifyAvailable]="!!getTrackUrl(track)"
                [supporting]="getTrackArtist(track)" [movement]="movementLabel(getTrend(track, getStatsRankIndex(track, 'tracks'), 'tracks'))"
                [flameKind]="isHotMover(track, 'tracks') ? (isHighDebutHotSong(track) ? 'debut' : 'hot') : null"
                [historyAvailable]="!isSpyMode" (spotifyRequested)="openTrackClick(getTrackUrl(track))"
                (historyRequested)="openTrendPopup(track, 'tracks')" />
            }
          </div>
          @if (!isSpyMode && filteredTracks.length) { <button type="button" v2Button="primary" [loading]="isCreatingPlaylist" (click)="createTopPlaylist()"><i class="pi pi-plus-circle"></i> Create playlist</button> }
        } @else if (selectedCategory === 'artists') {
          @if (!filteredArtists.length) { <v2-state icon="pi-search" title="No top artists found" message="Try another search, date, or ranking period." /> }
          <div class="v2-artist-rankings">
            @for (artist of filteredArtists; track trackStatItem($index, artist)) {
              <v2-stats-ranking-row class="v2-ranked-artist" kind="artists"
                [name]="artist.name" [rank]="getStatsRankIndex(artist, 'artists') + 1"
                [imageUrl]="getArtistImage(artist)" [spotifyAvailable]="!!getArtistUrl(artist)"
                [movement]="movementLabel(getTrend(artist, getStatsRankIndex(artist, 'artists'), 'artists'))"
                [flameKind]="isHotMover(artist, 'artists') ? (isHighDebutHotArtist(artist) ? 'debut' : 'hot') : null"
                [historyAvailable]="!isSpyMode" (spotifyRequested)="openArtistClick(getArtistUrl(artist))"
                (historyRequested)="openTrendPopup(artist, 'artists')" />
            }
          </div>
        } @else {
          @if (!filteredGenres.length) { <v2-state icon="pi-search" title="No genre data found" message="Try another search, date, or ranking period." /> }
          @if (filteredGenres.length) {
            <v2-genre-rankings [genres]="filteredGenres" [scaleGenres]="displayedGenres"
              [historyAvailable]="!isSpyMode" (historyRequested)="openTrendPopup($event, 'genres')" />
          }
        }
        @if (playlistCreationSuccessMessage) { <p class="v2-action-success" role="status">{{ playlistCreationSuccessMessage }}</p> }
        @if (playlistCreationError) { <p class="v2-action-error" role="alert">{{ playlistCreationError }}</p> }
      }
    </v2-page>
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
  readonly rangeTabs = [{id: 'short_term', label: '4 weeks'}, {id: 'medium_term', label: '6 months'}, {id: 'long_term', label: '1 year'}];
  readonly categoryTabs = [{id: 'tracks', label: 'Songs'}, {id: 'artists', label: 'Artists'}, {id: 'genres', label: 'Genres'}];
  constructor(spotifyData: SpotifyDataService, auth: SpotifyAuthService, storage: StorageService, private readonly historySupabase: SupabaseService,
    @Optional() route?: ActivatedRoute, @Optional() statsSharing?: StatsSharingService,
    @Optional() changeDetector?: ChangeDetectorRef, @Optional() participantSpotify?: ParticipantSpotifyService) {
    super(spotifyData, auth, storage, historySupabase, route, statsSharing, changeDetector, participantSpotify);
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
    if (range !== this.selectedRange && this.showTrendPopup) this.closeTrendPopup();
    super.changeRange(range);
  }
  changeCategoryValue(value: string): void { this.changeCategory(value as 'tracks' | 'artists' | 'genres'); }
  selectHistoryValue(value: string): void { this.selectHistorySnapshot(value, new Event('change')); }
  selectCompareValue(value: string): void { this.selectCompareSnapshot(value, new Event('change')); }
}
